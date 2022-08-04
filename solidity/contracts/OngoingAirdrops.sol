// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.7 <0.9.0;

import '../interfaces/IOngoingAirdrops.sol';
import '@openzeppelin/contracts/access/AccessControl.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import '@openzeppelin/contracts/utils/cryptography/MerkleProof.sol';

contract OngoingAirdrops is AccessControl, IOngoingAirdrops {
  using SafeERC20 for IERC20;

  bytes32 public constant SUPER_ADMIN_ROLE = keccak256('SUPER_ADMIN_ROLE');
  bytes32 public constant ADMIN_ROLE = keccak256('ADMIN_ROLE');

  /// @inheritdoc IOngoingAirdrops
  mapping(bytes32 => bytes32) public roots;
  /// @inheritdoc IOngoingAirdrops
  mapping(bytes32 => uint256) public amountClaimedByCampaignTokenAndUser;
  /// @inheritdoc IOngoingAirdrops
  mapping(bytes32 => uint256) public totalAirdroppedByCampaignAndToken;
  /// @inheritdoc IOngoingAirdrops
  mapping(bytes32 => uint256) public totalClaimedByCampaignAndToken;

  constructor(address _superAdmin, address[] memory _initialAdmins) {
    if (_superAdmin == address(0)) revert ZeroAddress();
    // We are setting the super admin role as its own admin so we can transfer it
    _setRoleAdmin(SUPER_ADMIN_ROLE, SUPER_ADMIN_ROLE);
    _setRoleAdmin(ADMIN_ROLE, SUPER_ADMIN_ROLE);
    _setupRole(SUPER_ADMIN_ROLE, _superAdmin);
    for (uint256 i = 0; i < _initialAdmins.length; ) {
      _setupRole(ADMIN_ROLE, _initialAdmins[i]);
      unchecked {
        i++;
      }
    }
  }

  /// @inheritdoc IOngoingAirdrops
  function updateCampaign(
    bytes32 _campaign,
    bytes32 _root,
    TokenAmount[] calldata _tokensAllocation
  ) external onlyRole(ADMIN_ROLE) {
    if (_campaign == bytes32(0)) revert InvalidCampaign();
    if (_root == bytes32(0)) revert InvalidMerkleRoot();
    if (_tokensAllocation.length == 0) revert InvalidTokenAmount();

    for (uint256 i = 0; i < _tokensAllocation.length; ) {
      // Move from calldata to memory
      TokenAmount memory _tokenAllocation = _tokensAllocation[i];

      // Build our unique ID for campaign and token address.
      bytes32 _campaignAndTokenId = _getIdOfCampaignAndToken(_campaign, _tokenAllocation.token);

      // Move storage var to memory.
      uint256 _currentTotalAirdropped = totalAirdroppedByCampaignAndToken[_campaignAndTokenId];

      // We can not lower the amount of total claimable on a campaign since that would break
      // the maths for the "ongoing airdrops".
      if (_tokenAllocation.amount < _currentTotalAirdropped) revert InvalidTokenAmount();

      // Refill needed represents the amount of tokens needed to
      // transfer into the contract to allow every user to claim the updated rewards
      uint256 _refillNeeded;
      // We can use unchecked, since we have checked this in L57
      unchecked {
        _refillNeeded = _tokenAllocation.amount - _currentTotalAirdropped;
      }

      // Update total claimable reward on campaign
      totalAirdroppedByCampaignAndToken[_campaignAndTokenId] = _tokenAllocation.amount;

      // Refill contract with the ERC20 tokens
      _tokenAllocation.token.safeTransferFrom(msg.sender, address(this), _refillNeeded);

      unchecked {
        i++;
      }
    }

    // Update the information
    roots[_campaign] = _root;

    // Emit event
    emit CampaignUpdated(_campaign, _root, _tokensAllocation);
  }

  /// @inheritdoc IOngoingAirdrops
  function claimAndSendToClaimee(
    bytes32 _campaign,
    address _claimee,
    TokenAmount[] calldata _tokensAmounts,
    bytes32[] calldata _proof
  ) external {}

  /// @inheritdoc IOngoingAirdrops
  function claimAndTransfer(
    bytes32 _campaign,
    TokenAmount[] calldata _tokensAmounts,
    address _recipient,
    bytes32[] calldata _proof
  ) external {}

  /// @inheritdoc IOngoingAirdrops
  function shutdown(
    bytes32 _campaign,
    IERC20[] calldata _tokens,
    address _recipient
  ) external onlyRole(ADMIN_ROLE) returns (uint256[] memory _unclaimed) {
    _unclaimed = new uint256[](_tokens.length);
    // We delete campaign setting it effectively to zero root, so users can't claim this campaign
    delete roots[_campaign];
    for (uint256 i = 0; i < _tokens.length; ) {
      // Move from calldata to memory as an optimization
      IERC20 _token = _tokens[i];
      // Build our unique ID for campaign and token address.
      bytes32 _campaignAndTokenId = _getIdOfCampaignAndToken(_campaign, _token);
      // Move var from storage to memory
      uint256 _totalAirdroppedByCampaignAndToken = totalAirdroppedByCampaignAndToken[_campaignAndTokenId];
      // Understand how much is still available
      _unclaimed[i] = _totalAirdroppedByCampaignAndToken - totalClaimedByCampaignAndToken[_campaignAndTokenId];
      // We update storage so if we call shutdown again we don't break token balances
      totalClaimedByCampaignAndToken[_campaignAndTokenId] = _totalAirdroppedByCampaignAndToken;
      // Transfer it out to recipient
      _token.safeTransfer(_recipient, _unclaimed[i]);
      // Lil optimization
      unchecked {
        i++;
      }
    }

    emit CampaignShutdDown(_campaign, _tokens, _unclaimed, _recipient);
  }

  function _getIdOfCampaignAndToken(bytes32 _campaign, IERC20 _token) internal pure returns (bytes32) {
    return keccak256(abi.encodePacked(_campaign, _token));
  }
}
