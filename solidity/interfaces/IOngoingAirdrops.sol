// SPDX-License-Identifier: GPL-2.0-or-later
/* solhint-disable wonderland/non-state-vars-leading-underscore */
pragma solidity >=0.8.7 <0.9.0;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';

/**
 * @title A contract that will enable users to claim from multiple ongoing airdrops.
 * @notice This contract will enable multiple ongoing and updateable airdrops (called campaigns). Each of this campaigns
 *         will be able to hold airdrop information for multiple tokens through their root.
 *         Additionally, admins will be able to shutdown a campaign whenever it choses to. Since this is a pretty
 *         permissioned contract, admins have full control over the funds. Some modifications can be done so its less
 *         permissioned.
 */
interface IOngoingAirdrops {
  /**
   * @notice Token and amount information
   * @dev Struct that will hold an ERC20 token, and an amount.
   */
  struct TokenAmount {
    IERC20 token;
    uint256 amount;
  }

  /// @notice Thrown when a campaign is invalid, or zero bytes.
  error InvalidCampaign();

  /// @notice Thrown when a campaign does not exist or merkle root is invalid.
  error InvalidMerkleRoot();

  /// @notice Thrown when trying to update a campaign or claiming with invalid token amount.
  error InvalidTokenAmount();

  /// @notice Thrown when trying to do operations on a zero address.
  error ZeroAddress();

  /// @notice Thrown when validating an airdrop claim with the proof is invalid.
  error InvalidProof();

  /// @notice Thrown when trying to claim an expired campaign.
  error ExpiredCampaing();

  /// @notice Thrown when user tries to claim a campaign without having a new claim.
  error AlreadyClaimed();

  /**
   * @notice Emitted when a campaign is updated
   * @param campaign Campaign name updated
   * @param root Merkle root that will be used to validate campaign claims
   * @param tokensAllocation Array of the sum of all tokens and amounts airdropped in the campaign
   */
  event CampaignUpdated(bytes32 campaign, bytes32 root, TokenAmount[] tokensAllocation);

  /**
   * @notice Emitted when a balance a tranche gets closed
   * @param campaign Campaign being shut down
   * @param tokens Unclaimed tokens to take from campaign
   * @param unclaimed Amount of unclaimed tokens sent
   * @param recipient Address that will receive unclaimed tokens
   */
  event CampaignShutDown(bytes32 campaign, IERC20[] tokens, uint256[] unclaimed, address recipient);

  /**
   * @notice Emitted when a user claims a tranche.
   * @param campaign Campaign being claimed
   * @param initiator Address of the person initiating the claim
   * @param claimee Address of the person claiming the airdrop
   * @param tokensAmount Tokens and amounts being used to get leaf
   * @param claimed Total amount of claimed tokens where token claimed = tokensAmount[index].token
   * @param recipient Address that will receive the tokens being claimed
   */
  event Claimed(bytes32 campaign, address initiator, address claimee, TokenAmount[] tokensAmount, uint256[] claimed, address recipient);

  /**
   * @notice Exposes campaign's merkle root used to prove user claims
   * @dev This value cannot be modified
   * @param campaign Campaign's name
   * @return A hash representing a merkle root
   */
  function roots(bytes32 campaign) external view returns (bytes32);

  /**
   * @notice Exposes token amount claimed by user on a given campaign
   * @dev This value cannot be modified
   * @param campaignTokenAndClaimeeId Id built by hashing concatenated values of: Campaign name, token address and user address.
   * @return Amount claimed
   */
  function amountClaimedByCampaignTokenAndClaimee(bytes32 campaignTokenAndClaimeeId) external view returns (uint256);

  /**
   * @notice Total sum of all airdropped amounts of a given token and campaign.
   * @dev This value cannot be modified
   * @param campaignAndTokenId Id built by hashing concatenated values of: Campaign name and token address.
   * @return Sum of all airdropped amounts
   */
  function totalAirdroppedByCampaignAndToken(bytes32 campaignAndTokenId) external view returns (uint256);

  /**
   * @notice Total amount claimed of a given token and campaign.
   * @dev This value cannot be modified
   * @param campaignAndTokenId Id built by hashing concatenated values of: Campaign name and token address.
   * @return Total amount claimed
   */
  function totalClaimedByCampaignAndToken(bytes32 campaignAndTokenId) external view returns (uint256);

  /**
   * @notice Updates campaign information: Tokens allocation and merkle root.
   * @dev Only callable by governor.
   * Will revert:
   *   - With InvalidCampaign if campaign is zero bytes.
   *   - With InvalidMerkleRoot if trancheMerkleRoot is zero bytes.
   *   - With InvalidTokenAmount if length is zero.
   * @param campaign Campaign being updated
   * @param root Campaign's merkle root that will be used to prove user claims
   * @param tokensAllocation Array of sum of all airdropped amounts and token on campaign being.
   */
  function updateCampaign(
    bytes32 campaign,
    bytes32 root,
    TokenAmount[] calldata tokensAllocation
  ) external;

  /**
   * @notice Claims an airdrop for the corresponding campaign and sends it to the owner of the airdrop
   * @dev Will revert:
   *   - With InvalidCampaign if campaign is zero bytes.
   *   - With ZeroAddress if recipient or claimee is zero.
   *   - With InvalidTokenAmount if length is zero.
   *   - With InvalidProof if proof is invalid.
   *   - With ExpiredCampaing if campaign already expired.
   *   - With AlreadyClaimed if campaign and proof already used, or there is nothing new to claim
   * @param campaign Campaign being claimed
   * @param claimee Address that is the owner of the airdrop
   * @param tokensAmounts Array of sum of all airdropped amounts and token on campaign being claimed.
   * @param proof Merkle proof to check airdrop claim validation
   */
  function claimAndSendToClaimee(
    bytes32 campaign,
    address claimee,
    TokenAmount[] calldata tokensAmounts,
    bytes32[] calldata proof
  ) external;

  /**
   * @notice Claims an airdrop for the corresponding tranche and sends it to the owner of the airdrop
   * @dev Will revert:
   *   - With InvalidCampaign if campaign is zero bytes.
   *   - With ZeroAddress if recipient or claimee is zero.
   *   - With InvalidTokenAmount if length is zero.
   *   - With InvalidProof if proof is invalid.
   *   - With ExpiredCampaing if campaign already expired.
   *   - With AlreadyClaimed if campaign and proof already used, or there is nothing new to claim
   * @param campaign Campaign being claimed
   * @param tokensAmounts Array of sum of all airdropped amounts and token on campaign being claimed.
   * @param recipient Receiver address of the airdropped tokens
   * @param proof Merkle proof to check airdrop claim validation
   */
  function claimAndTransfer(
    bytes32 campaign,
    TokenAmount[] calldata tokensAmounts,
    address recipient,
    bytes32[] calldata proof
  ) external;

  /**
   * @notice Withdraws the unclaimed tokens of a tranche.
   * @dev Only callable by governor.
   * @param campaign Campaign being shutdown.
   * @param tokens Array of the token addresses being taken from contract.
   * @param recipient Recipient of unclaimed tranche tokens.
   * @return unclaimed Amount of unclaimed tokens on campaign shutted down.
   */
  function shutdown(
    bytes32 campaign,
    IERC20[] calldata tokens,
    address recipient
  ) external returns (uint256[] memory unclaimed);
}
