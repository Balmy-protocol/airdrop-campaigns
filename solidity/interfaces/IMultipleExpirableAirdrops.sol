// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.7 <0.9.0;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';

/**
 * @title A contract that will enable users to claim multiple airdrops, and each airdrop has an expiry date
 * @notice This contract will hold several merkle roots while having an expiry time that will be set at the time of
 *         creating a new claimable tranche.
 *         Additionally, governor will be able to retrieve all claims when a tranche expires, allowing for the re-use
 *         of those tokens.
 */
interface IMultipleExpirableAirdrops {
  /// @notice Tranche information
  struct Tranche {
    uint224 amount;
    uint32 deadline;
  }

  /// @notice Thown when lifespan trying to be set is invalid.
  error InvalidLifespan();

  /// @notice Thrown when a tranche does not exist or merkle root is invalid.
  error InvalidMerkleRoot();

  /// @notice Thrown when trying to create a tranche or claim an airdrop with an invalid amount (usually zero).
  error InvalidAmount();

  /// @notice Thrown when trying to do operations on a zero address.
  error ZeroAddress();

  /// @notice Thrown when validating an airdrop claim with the proof is invalid.
  error InvalidProof();

  /// @notice Thrown when governor tries to withdraw unclaimed tokens from an active tranche.
  error TrancheStillActive();

  /// @notice Emitted when lifespan of tranches is set
  /// @param trancheLifespan The lifespan of the next created tranches
  event LifespanSet(uint32 trancheLifespan);

  /// @notice Emitted when a claim tranche is created
  /// @param trancheMerkleRoot Merkle root that will be used to validate claims
  /// @param claimable Amount of claimable tokens
  event TrancheCreated(bytes32 trancheMerkleRoot, uint224 claimable);

  /// @notice Emitted when a balance from a tranche is withdrawn
  /// @param trancheMerkleRoot Merkle root of the tranche
  /// @param unclaimed Amount of unclaimed tokens of the tranche
  event TrancheWithdrawn(bytes32 trancheMerkleRoot, uint224 unclaimed);

  /// @notice Emitted when a user claims a tranche.
  /// @param trancheMerkleRoot Merkle root of the tranche
  /// @param claimer Address of the person claiming the airdrop
  /// @param amount Amount of tokens being claimed
  /// @param recipient Address that will receive the tokens being claimed
  event TrancheClaimed(bytes32 trancheMerkleRoot, address claimer, uint224 amount, address recipient);

  /// @notice Returns the airdropped token's address
  /// @dev This value cannot be modified
  /// @return The airdropped token contract
  function claimableToken() external view returns (IERC20);

  /// @notice Returns the tranche information
  /// @dev This value cannot be modified
  /// @param trancheMerkleRoot Tranche's merkle root
  /// @return Tranche's airdropped amount and deadline timestamp
  function tranche(bytes32 trancheMerkleRoot) external view returns (Tranche memory);

  /// @notice Returns the duration in which users can claim once a tranche is created
  /// @dev This value cannot be modified
  /// @return Life's duration of a tranche
  function tranchesLifespan() external view returns (uint32);

  /// @notice Sets total life duration of a tranche. This is the amount of time users have to claim until a tranche expires.
  /// @dev Will revert with `InvalidLifespan` if lifespan is not valid
  /// @param tranchesLifespan Total life duration of a tranche in seconds
  function setTranchesLifespan(uint32 tranchesLifespan) external;

  /// @notice Creates a tranche setting the deadline of it as now() + tranche lifespan, while also setting
  /// the claimable amount of tokens for it.
  /// @dev Will revert:
  /// With InvalidMerkleRoot if trancheMerkleRoot is zero bytes.
  /// With InvalidAmount if climable is zero.
  /// @param trancheMerkleRoot Tranche's merkle root
  /// @param claimable Total amount of claimable tokens for this tranche
  function createTranche(bytes32 trancheMerkleRoot, uint224 claimable) external;

  /// @notice Claims an airdrop for the corresponding tranche.
  /// @dev Will revert:
  /// With InvalidMerkleRoot if trancheMerkleRoot is zero bytes.
  /// With InvalidAmount if climable is zero.
  /// With ZeroAddress if recipient is zero.
  /// With InvalidProof if merkeProof is invalid.
  /// @param trancheMerkleRoot Tranche's merkle root
  /// @param amount Total amount of claimable tokens by the msg.sender
  /// @param recipient Address of receiver of the airdropped tokens
  /// @param merkleProof Merkle proof to check airdrop claim validation
  function claim(
    bytes32 trancheMerkleRoot,
    uint224 amount,
    address recipient,
    bytes32[] calldata merkleProof
  ) external;

  /// @notice Withdraws the unclaimed tokens of a tranche past its deadline.
  /// @dev Will revert:
  /// With InvalidMerkleRoot if trancheMerkleRoot is zero bytes.
  /// With TrancheStillAcrive if the tranche is still active (not past its deadline).
  /// @param trancheMerkleRoot Tranche's merkle root
  /// @return unclaimed Amount of unclaimed airdropped tokens of tranche.
  function withdrawUnclaimedFromExpiredTranche(bytes32 trancheMerkleRoot) external returns (uint224 unclaimed);
}
