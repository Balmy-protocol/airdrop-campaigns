// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.7 <0.9.0;

import './utils/Governable.sol';
import '../interfaces/IMultipleExpirableAirdrops.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import '@openzeppelin/contracts/utils/cryptography/MerkleProof.sol';

import 'hardhat/console.sol';

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
  ) external onlyGovernor {
    if (_trancheMerkleRoot == bytes32(0)) revert InvalidMerkleRoot();
    if (_claimable == 0) revert InvalidAmount();
    if (_deadline <= block.timestamp) revert ExpiredTranche();
    // TODO: Check if a trnache with same merkle root already exists => revert

    claimableToken.safeTransferFrom(msg.sender, address(this), _claimable);
    tranches[_trancheMerkleRoot] = TrancheInformation({claimable: _claimable, claimed: 0, deadline: _deadline});

    emit TrancheCreated(_trancheMerkleRoot, _claimable, _deadline);
  }

  function claimAndSendToClaimee(
    bytes32 _trancheMerkleRoot,
    address _claimee,
    uint112 _amount,
    bytes32[] calldata _merkleProof
  ) external {
    _claim(_trancheMerkleRoot, _claimee, _amount, _claimee, _merkleProof);
  }

  function claimAndTransfer(
    bytes32 _trancheMerkleRoot,
    uint112 _amount,
    address _recipient,
    bytes32[] calldata _merkleProof
  ) external {
    _claim(_trancheMerkleRoot, msg.sender, _amount, _recipient, _merkleProof);
  }

  function _claim(
    bytes32 _trancheMerkleRoot,
    address _claimee,
    uint112 _amount,
    address _recipient,
    bytes32[] calldata _merkleProof
  ) internal virtual {
    if (_trancheMerkleRoot == bytes32(0)) revert InvalidMerkleRoot();
    if (_amount == 0) revert InvalidAmount();
    if (_claimee == address(0) || _recipient == address(0)) revert ZeroAddress();
    if (_merkleProof.length == 0) revert InvalidProof();

    TrancheInformation memory _tranche = tranches[_trancheMerkleRoot];
    if (_tranche.deadline <= block.timestamp) revert ExpiredTranche();

    bytes32 _leaf = keccak256(abi.encodePacked(_claimee, _amount));
    bool _isValidLeaf = MerkleProof.verify(_merkleProof, _trancheMerkleRoot, _leaf);
    if (!_isValidLeaf) revert InvalidProof();

    bytes32 _claimId = keccak256(abi.encodePacked(_trancheMerkleRoot, _claimee));
    if (claimedTranches[_claimId]) revert AlreadyClaimed();
    claimedTranches[_claimId] = true;

    tranches[_trancheMerkleRoot].claimed = _tranche.claimed + _amount;
    claimableToken.safeTransfer(_recipient, _amount);

    emit TrancheClaimed(_trancheMerkleRoot, _claimee, _amount, _recipient);
  }

  function closeTranche(bytes32 _trancheMerkleRoot, address _recipient) external onlyGovernor returns (uint112 _unclaimed) {
    if (_trancheMerkleRoot == bytes32(0)) revert InvalidMerkleRoot();
    if (_recipient == address(0)) revert ZeroAddress();
    TrancheInformation memory _tranche = tranches[_trancheMerkleRoot];
    if (block.timestamp <= _tranche.deadline) revert TrancheStillActive();
    // TODO: Check that there is something still to be claimed, a.k.a. tranche wasnt closed before
    _unclaimed = _tranche.claimable - _tranche.claimed;
    tranches[_trancheMerkleRoot].claimed = _tranche.claimable;
    claimableToken.safeTransfer(_recipient, _unclaimed);
    emit TrancheClosed(_trancheMerkleRoot, _recipient, _unclaimed);
  }
}
