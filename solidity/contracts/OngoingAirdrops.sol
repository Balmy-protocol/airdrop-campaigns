// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.7 <0.9.0;

import './utils/Governable.sol';
import '../interfaces/IOngoingAirdrops.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import '@openzeppelin/contracts/utils/cryptography/MerkleProof.sol';

abstract contract OngoingAirdrops is Governable, IOngoingAirdrops {
  using SafeERC20 for IERC20;

  /// @inheritdoc IOngoingAirdrops
  mapping(bytes32 => bytes32) public roots;
  /// @inheritdoc IOngoingAirdrops
  mapping(bytes32 => uint32) public deadline;
  /// @inheritdoc IOngoingAirdrops
  mapping(bytes32 => uint256) public amountClaimedByCampaignTokenAndUser;
  /// @inheritdoc IOngoingAirdrops
  mapping(bytes32 => uint256) public totalAirdropedByCampaignAndToken;
  /// @inheritdoc IOngoingAirdrops
  mapping(bytes32 => uint256) public totalClaimedByCampaignAndToken;

  constructor(address _governor) Governable(_governor) {}

  /// @inheritdoc IOngoingAirdrops
  function updateCampaign(
    bytes32 _campaign,
    bytes32 _root,
    TokenAmount[] calldata _tokensAllocation,
    uint32 _deadline
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
  ) external override returns (uint256[] memory unclaimed) {}
}
