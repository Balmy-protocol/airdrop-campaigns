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
  /// @dev Claimable and claimed amounts will be limited to 2**112 so this struct is only 32 bytes.
  struct TrancheInformation {
    uint112 claimable;
    uint112 claimed;
    uint32 deadline;
  }

  /// @notice Thrown when a tranche does not exist or merkle root is invalid.
  error InvalidMerkleRoot();

  /// @notice Thrown when trying to create a tranche or claim an airdrop with an invalid amount (usually zero).
  error InvalidAmount();

  /// @notice Thrown when trying to do operations on a zero address.
  error ZeroAddress();

  /// @notice Thrown when validating an airdrop claim with the proof is invalid.
  error InvalidProof();

  /// @notice Thrown when user tries to claim airdrop from expired tranche
  error ExpiredTranche();

  /// @notice Thrown when user tries to claim something it already claimed
  error AlreadyClaimed();

  /// @notice Thrown when governor tries to withdraw unclaimed tokens from an active tranche.
  error TrancheStillActive();

  /// @notice Emitted when a claim tranche is created
  /// @param trancheMerkleRoot Merkle root that will be used to validate claims
  /// @param claimable Amount of claimable tokens
  /// @param deadline Timestamp until when the tranche is claimable
  event TrancheCreated(bytes32 trancheMerkleRoot, uint112 claimable, uint32 deadline);

  /// @notice Emitted when a balance a tranche gets closed
  /// @param trancheMerkleRoot Merkle root of the tranche
  /// @param recipient Address that will receive tranche unclaimed tokens
  /// @param unclaimed Amount of unclaimed tokens of the tranche
  event TrancheClosed(bytes32 trancheMerkleRoot, address recipient, uint112 unclaimed);

  /// @notice Emitted when a user claims a tranche.
  /// @param trancheMerkleRoot Merkle root of the tranche
  /// @param claimee Address of the person claiming the airdrop
  /// @param amount Amount of tokens being claimed
  /// @param recipient Address that will receive the tokens being claimed
  event TrancheClaimed(bytes32 trancheMerkleRoot, address claimee, uint112 amount, address recipient);

  /// @notice Returns the airdropped token's address
  /// @dev This value cannot be modified
  /// @return The airdropped token contract
  function claimableToken() external view returns (IERC20);

  /// @notice Returns the tranche information
  /// @dev This value cannot be modified
  /// @param trancheMerkleRoot Tranche's merkle root
  /// @return Tranche's information
  // function tranches(bytes32 trancheMerkleRoot) external view returns (TrancheInformation memory);

  /// @notice Returns status of claimed tranche by tranche and user
  /// @dev This value cannot be modified
  /// @param trancheAndClaimee Unique identifier for tranche and claimee address
  /// @return True if already claimed, false otherwise
  function claimedTranches(bytes32 trancheAndClaimee) external view returns (bool);

  /// @notice Creates a tranche setting the deadline, while also getting the claimable amount of tokens for it.
  /// @dev Will revert:
  /// With InvalidMerkleRoot if trancheMerkleRoot is zero bytes.
  /// With InvalidAmount if climable is zero.
  /// With ExpiredTranche if deadline has already passed.
  /// @param trancheMerkleRoot Tranche's merkle root
  /// @param claimable Total amount of claimable tokens for this tranche
  /// @param deadline Timestamp in which the tranche will become unclaimable for users
  function createTranche(
    bytes32 trancheMerkleRoot,
    uint112 claimable,
    uint32 deadline
  ) external;

  /// @notice Claims an airdrop for the corresponding tranche and sends it to the owner of the airdrop
  /// @dev Will revert:
  /// With InvalidMerkleRoot if trancheMerkleRoot is zero bytes.
  /// With InvalidAmount if amount is zero.
  /// With ZeroAddress if recipient or claimee is zero.
  /// With InvalidProof if merkeProof is invalid.
  /// With ExpiredTranche if tranche already expired.
  /// With AlreadyClaimed if tranche and proof already used.
  /// @param trancheMerkleRoot Tranche's merkle root
  /// @param claimee Owner address of the airdrop
  /// @param amount Total amount of claimable tokens by the msg.sender
  /// @param merkleProof Merkle proof to check airdrop claim validation
  function claimAndSendToClaimee(
    bytes32 trancheMerkleRoot,
    address claimee,
    uint112 amount,
    bytes32[] calldata merkleProof
  ) external;

  /// @notice Claims an airdrop for the corresponding tranche and sends it to the owner of the airdrop
  /// @dev Will revert:
  /// With InvalidMerkleRoot if trancheMerkleRoot is zero bytes.
  /// With InvalidAmount if amount is zero.
  /// With ZeroAddress if recipient or claimee is zero.
  /// With InvalidProof if merkeProof is invalid.
  /// With ExpiredTranche if tranche already expired.
  /// With AlreadyClaimed if tranche and proof already used.
  /// @param trancheMerkleRoot Tranche's merkle root
  /// @param amount Total amount of claimable tokens by the msg.sender
  /// @param recipient Receiver address of the airdropped tokens
  /// @param merkleProof Merkle proof to check airdrop claim validation
  function claimAndTransfer(
    bytes32 trancheMerkleRoot,
    uint112 amount,
    address recipient,
    bytes32[] calldata merkleProof
  ) external;

  /// @notice Withdraws the unclaimed tokens of a tranche past its deadline.
  /// @dev Will revert:
  /// With InvalidMerkleRoot if trancheMerkleRoot is zero bytes.
  /// With TrancheStillAcrive if the tranche is still active (not past its deadline).
  /// @param trancheMerkleRoot Tranche's merkle root
  /// @param recipient Recipient of unclaimed tranche tokens.
  /// @return unclaimed Amount of unclaimed airdropped tokens of tranche.
  function closeTranche(bytes32 trancheMerkleRoot, address recipient) external returns (uint112 unclaimed);
}
