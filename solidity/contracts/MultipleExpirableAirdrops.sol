// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.7 <0.9.0;

import './utils/Governable.sol';
import '../interfaces/IMultipleExpirableAirdrops.sol';

contract MultipleExpirableAirdrops is IMultipleExpirableAirdrops, Governable {
  IERC20 public immutable claimableToken;
  uint32 public tranchesLifespan;
  mapping(bytes32 => Tranche) public tranches;

  constructor(
    address _governor,
    IERC20 _claimableToken,
    uint32 _tranchesLifespan
  ) Governable(_governor) {
    if (address(_claimableToken) == address(0)) revert ZeroAddress();
    claimableToken = _claimableToken;

    if (_tranchesLifespan == 0) revert InvalidLifespan();
    tranchesLifespan = _tranchesLifespan;
    emit TranchesLifespanSet(_tranchesLifespan);
  }

  function setTranchesLifespan(uint32 _tranchesLifespan) external {}

  function createTranche(bytes32 _trancheMerkleRoot, uint224 _claimable) external {}

  function claim(
    bytes32 _trancheMerkleRoot,
    uint224 _amount,
    address _recipient,
    bytes32[] calldata _merkleProof
  ) external {}

  function withdrawUnclaimedFromExpiredTranche(bytes32 _trancheMerkleRoot) external returns (uint224 _unclaimed) {}
}
