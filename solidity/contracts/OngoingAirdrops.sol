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
    for (uint256 i; i < _initialAdmins.length; i++) {
      _setupRole(ADMIN_ROLE, _initialAdmins[i]);
    }
  }

  /// @inheritdoc IOngoingAirdrops
  function updateCampaign(
    bytes32 _campaign,
    bytes32 _root,
    TokenAmount[] calldata _tokensAllocation
  ) external override onlyRole(ADMIN_ROLE) {
    if (_campaign == bytes32(0)) revert InvalidCampaign();
    if (_root == bytes32(0)) revert InvalidMerkleRoot();
    if (_tokensAllocation.length == 0) revert InvalidTokenAmount();

    for (uint256 i = 0; i < _tokensAllocation.length; i++) {
      // Build our unique ID for campaign and token address.
      bytes32 _campaignAndTokenId = _getIdOfCampaignAndToken(_campaign, _tokensAllocation[i].token);

      // Move storage var to memory.
      uint256 _currentTotalAirdropped = totalAirdroppedByCampaignAndToken[_campaignAndTokenId];

      // We can not lower the amount of total claimable on a campaign since that would break
      // the maths for the "ongoing airdrops".
      if (_tokensAllocation[i].amount < _currentTotalAirdropped) revert InvalidTokenAmount();

      // Refill needed represents the amount of tokens needed to
      // transfer into the contract to allow every user to claim the updated rewards
      uint256 _refillNeeded = _tokensAllocation[i].amount - _currentTotalAirdropped;

      // Update total claimable reward on campaign
      totalAirdroppedByCampaignAndToken[_campaignAndTokenId] = _tokensAllocation[i].amount;

      // Refill contract with the ERC20 tokens
      _tokensAllocation[i].token.safeTransferFrom(msg.sender, address(this), _refillNeeded);
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
  ) external override {}

  /// @inheritdoc IOngoingAirdrops
  function claimAndTransfer(
    bytes32 _campaign,
    TokenAmount[] calldata _tokensAmounts,
    address _recipient,
    bytes32[] calldata _proof
  ) external override {}

  /// @inheritdoc IOngoingAirdrops
  function shutdown(
    bytes32 _campaign,
    IERC20[] calldata _tokens,
    address _recipient
  ) external override returns (uint256[] memory _unclaimed) {}

  function _getIdOfCampaignAndToken(bytes32 _campaign, IERC20 _token) internal pure returns (bytes32) {
    return keccak256(abi.encodePacked(_campaign, _token));
  }
}
