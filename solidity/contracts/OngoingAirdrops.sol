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
  mapping(bytes32 => uint256) public totalAirdropedByCampaignAndToken;
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
  ) external override {}

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
}
