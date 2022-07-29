// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.7 <0.9.0;

import '../MultipleExpirableAirdrops.sol';

contract MultipleExpirableAirdropsMock is MultipleExpirableAirdrops {
  struct InternalClaimCall {
    bytes32 _trancheMerkleRoot;
    address _claimee;
    uint112 _amount;
    address _recipient;
  }

  InternalClaimCall public internalClaimCall;
  bytes32[] internal _internalClaimCallProof;

  constructor(address _governor, IERC20 _claimableToken) MultipleExpirableAirdrops(_governor, _claimableToken) {}

  function setTranchesClaimed(bytes32 _root, uint112 _claimed) external {
    tranches[_root].claimed = _claimed;
  }

  function getInternalClaimCallProof() external view returns (bytes32[] memory _merkleProof) {
    _merkleProof = new bytes32[](_internalClaimCallProof.length);
    for (uint256 i; i < _internalClaimCallProof.length; i++) {
      _merkleProof[i] = _internalClaimCallProof[i];
    }
  }

  function _claim(
    bytes32 _trancheMerkleRoot,
    address _claimee,
    uint112 _amount,
    address _recipient,
    bytes32[] calldata _merkleProof
  ) internal override {
    internalClaimCall = InternalClaimCall(_trancheMerkleRoot, _claimee, _amount, _recipient);
    for (uint256 i; i < _merkleProof.length; i++) {
      _internalClaimCallProof.push(_merkleProof[i]);
    }
  }
}
