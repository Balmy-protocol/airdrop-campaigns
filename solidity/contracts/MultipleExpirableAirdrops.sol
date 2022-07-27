// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.7 <0.9.0;

import './utils/Governable.sol';
import '../interfaces/IMultipleExpirableAirdrops.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import '@openzeppelin/contracts/utils/cryptography/MerkleProof.sol';

contract MultipleExpirableAirdrops is IMultipleExpirableAirdrops, Governable {
  using SafeERC20 for IERC20;

  IERC20 public immutable claimableToken;
  mapping(bytes32 => TrancheInformation) public tranches;
  mapping(bytes32 => bool) public claimedTranches;

  constructor(address _governor, IERC20 _claimableToken) Governable(_governor) {
    if (address(_claimableToken) == address(0)) revert ZeroAddress();
    claimableToken = _claimableToken;
  }

  function createTranche(
    bytes32 _trancheMerkleRoot,
    uint112 _claimable,
    uint32 _deadline
  ) external {}

  function claimAndSendToClaimee(
    bytes32 _trancheMerkleRoot,
    address _claimee,
    uint112 _amount,
    bytes32[] calldata _merkleProof
  ) external {}

  function claimAndTransfer(
    bytes32 _trancheMerkleRoot,
    uint112 _amount,
    address _recipient,
    bytes32[] calldata _merkleProof
  ) external {}

  function closeTranche(bytes32 _trancheMerkleRoot, address _recipient) external returns (uint112 _unclaimed) {}
}
