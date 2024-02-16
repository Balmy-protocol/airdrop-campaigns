// import chai, { expect } from 'chai';
// import { when, then, given } from '@utils/bdd';
// import { IERC20, IOngoingCampaigns, OngoingCampaignsMock, OngoingCampaignsMock__factory } from '@typechained';
// import { ethers } from 'hardhat';
// import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
// import { smock, FakeContract } from '@defi-wonderland/smock';
// import { takeSnapshot, SnapshotRestorer } from '@nomicfoundation/hardhat-network-helpers';
// import { BigNumber, BigNumberish, constants } from 'ethers';
// import { randomHex } from 'web3-utils';
// import { getArgsFromEvent } from '@utils/event-utils';
// import { behaviours } from '@utils';
// import { TransactionResponse } from '@ethersproject/providers';
// import { generateRandomAddress } from '@utils/wallet';
// import { createMerkleTree } from '@utils/merkle';
// import MerkleTree from 'merkletreejs';

// chai.use(smock.matchers);

// describe('OngoingCampaigns', () => {
//   let user: SignerWithAddress;
//   let superAdmin: SignerWithAddress, admin: SignerWithAddress;
//   let ongoingCampaignsFactory: OngoingCampaignsMock__factory;
//   let ongoingCampaigns: OngoingCampaignsMock;
//   let superAdminRole: string, adminRole: string;
//   let snapshot: SnapshotRestorer;

//   const tokens: FakeContract<IERC20>[] = [];

//   before('Setup accounts and contracts', async () => {
//     [user, superAdmin, admin] = await ethers.getSigners();
//     ongoingCampaignsFactory = (await ethers.getContractFactory(
//       'solidity/contracts/test/OngoingCampaigns.sol:OngoingCampaignsMock'
//     )) as OngoingCampaignsMock__factory;
//     for (let i = 0; i < 10; i++) {
//       tokens.push(await smock.fake('IERC20'));
//     }
//     ongoingCampaigns = await ongoingCampaignsFactory.deploy(superAdmin.address, [admin.address]);
//     [superAdminRole, adminRole] = await Promise.all([ongoingCampaigns.DEFAULT_ADMIN_ROLE(), ongoingCampaigns.ADMIN_ROLE()]);
//     snapshot = await takeSnapshot();
//   });

//   beforeEach(async () => {
//     await snapshot.restore();
//     for (let i = 0; i < tokens.length; i++) {
//       tokens[i].transfer.reset();
//       tokens[i].transferFrom.reset();
//       tokens[i].transfer.returns(true);
//       tokens[i].transferFrom.returns(true);
//     }
//   });

//   describe('constructor', () => {
//     when('super admin is zero address', () => {
//       then('tx is reverted with custom error', async () => {
//         await behaviours.deployShouldRevertWithCustomError({
//           contract: ongoingCampaignsFactory,
//           args: [constants.AddressZero, []],
//           customErrorName: 'AccessControlInvalidDefaultAdmin',
//         });
//       });
//     });
//     when('all arguments are valid', () => {
//       then('super admin is set correctly', async () => {
//         const hasRole = await ongoingCampaigns.hasRole(superAdminRole, superAdmin.address);
//         expect(hasRole).to.be.true;
//       });
//       then('initial admins are set correctly', async () => {
//         const hasRole = await ongoingCampaigns.hasRole(adminRole, admin.address);
//         expect(hasRole).to.be.true;
//       });
//       then('super admin role is set as super admin role', async () => {
//         const admin = await ongoingCampaigns.getRoleAdmin(superAdminRole);
//         expect(admin).to.equal(superAdminRole);
//       });
//       then('super admin role is set as admin role', async () => {
//         const admin = await ongoingCampaigns.getRoleAdmin(adminRole);
//         expect(admin).to.equal(superAdminRole);
//       });
//     });
//   });

//   describe('updateCampaign', () => {
//     when('sending an empty campaign', () => {
//       then('tx is reverted with custom error', async () => {
//         await expect(ongoingCampaigns.connect(admin).updateCampaign(constants.HashZero, randomHex(32), [])).to.be.revertedWithCustomError(
//           ongoingCampaigns,
//           'InvalidCampaign'
//         );
//       });
//     });
//     when('sending an empty merkle root', () => {
//       then('tx is reverted with custom error', async () => {
//         await expect(ongoingCampaigns.connect(admin).updateCampaign(randomHex(32), constants.HashZero, [])).to.be.revertedWithCustomError(
//           ongoingCampaigns,
//           'InvalidMerkleRoot'
//         );
//       });
//     });
//     when('sending empty token allocations', () => {
//       then('tx is reverted with custom error', async () => {
//         await expect(ongoingCampaigns.connect(admin).updateCampaign(randomHex(32), randomHex(32), [])).to.be.revertedWithCustomError(
//           ongoingCampaigns,
//           'InvalidTokenAmount'
//         );
//       });
//     });

//     when('sending a token allocation that reduces total airdropped token on campaign', () => {
//       const token = randomHex(20);
//       const campaign = randomHex(32);
//       const airdroppedAmount = BigNumber.from('10');
//       given(async () => {
//         await ongoingCampaigns.setTotalAirdroppedByCampaignAndToken(campaign, token, airdroppedAmount);
//       });
//       then('tx is reverted with custom error', async () => {
//         await expect(
//           ongoingCampaigns.connect(admin).updateCampaign(campaign, randomHex(32), [{ token, amount: airdroppedAmount.sub(1) }])
//         ).to.be.revertedWithCustomError(ongoingCampaigns, 'InvalidTokenAmount');
//       });
//     });

//     testUpdateCampaign({
//       title: 'its the first time setting a campaign',
//       previousAllocations: [0, 0],
//       newAllocations: [100, 230],
//     });

//     testUpdateCampaign({
//       title: 'campaign already had some allocation',
//       previousAllocations: [69, 10],
//       newAllocations: [100, 230],
//     });

//     behaviours.shouldBeExecutableOnlyByRole({
//       contract: () => ongoingCampaigns,
//       funcAndSignature: 'updateCampaign(bytes32,bytes32,(address,uint256)[])',
//       params: [constants.HashZero, constants.HashZero, []],
//       addressWithRole: () => admin,
//       role: () => adminRole,
//     });
//   });

//   describe('claimAndSendToClaimee', () => {
//     const CAMPAIGN = randomHex(32);
//     const CLAIMEE = generateRandomAddress();
//     const TOKENS_AMOUNTS: IOngoingCampaigns.TokenAmountStruct[] = [
//       {
//         token: generateRandomAddress(),
//         amount: 1000,
//       },
//       {
//         token: generateRandomAddress(),
//         amount: 12469,
//       },
//     ];
//     const PROOF = [randomHex(32), randomHex(32)];
//     given(async () => {
//       await ongoingCampaigns.claimAndSendToClaimee(CAMPAIGN, CLAIMEE, TOKENS_AMOUNTS, PROOF);
//     });
//     it('calls internal claim with claimee and recipient as same address', async () => {
//       const internalClaimCall = await ongoingCampaigns.internalClaimCall();
//       const internalClaimCallTokensAmounts = await ongoingCampaigns.getInternalClaimCallTokensAmounts();
//       const internalClaimCallProof = await ongoingCampaigns.getInternalClaimCallProof();
//       expect(internalClaimCall.campaign).to.be.equal(CAMPAIGN);
//       expect(internalClaimCall.claimee).to.be.equal(CLAIMEE);
//       expect(internalClaimCall.recipient).to.be.equal(CLAIMEE);
//       expect(internalClaimCallProof).to.be.eql(PROOF);
//       expect(internalClaimCallTokensAmounts.length).to.be.equal(TOKENS_AMOUNTS.length);
//       internalClaimCallTokensAmounts.forEach((tokenAmount, i) => {
//         expect(tokenAmount.token).to.be.equal(TOKENS_AMOUNTS[i].token);
//         expect(tokenAmount.amount).to.be.equal(TOKENS_AMOUNTS[i].amount);
//       });
//     });
//   });

//   describe('claimAndTransfer', () => {
//     const CAMPAIGN = randomHex(32);
//     const RECIPIENT = generateRandomAddress();
//     const TOKENS_AMOUNTS: IOngoingCampaigns.TokenAmountStruct[] = [
//       {
//         token: generateRandomAddress(),
//         amount: 1000,
//       },
//       {
//         token: generateRandomAddress(),
//         amount: 12469,
//       },
//     ];
//     const PROOF = [randomHex(32), randomHex(32)];
//     given(async () => {
//       await ongoingCampaigns.claimAndTransfer(CAMPAIGN, TOKENS_AMOUNTS, RECIPIENT, PROOF);
//     });
//     it('calls internal claim with claimee as message sender and the correct recipient', async () => {
//       const internalClaimCall = await ongoingCampaigns.internalClaimCall();
//       const internalClaimCallTokensAmounts = await ongoingCampaigns.getInternalClaimCallTokensAmounts();
//       const internalClaimCallProof = await ongoingCampaigns.getInternalClaimCallProof();
//       expect(internalClaimCall.campaign).to.be.equal(CAMPAIGN);
//       expect(internalClaimCall.claimee).to.be.equal(user.address);
//       expect(internalClaimCall.recipient).to.be.equal(RECIPIENT);
//       expect(internalClaimCallProof).to.be.eql(PROOF);
//       expect(internalClaimCallTokensAmounts.length).to.be.equal(TOKENS_AMOUNTS.length);
//       internalClaimCallTokensAmounts.forEach((tokenAmount, i) => {
//         expect(tokenAmount.token).to.be.equal(TOKENS_AMOUNTS[i].token);
//         expect(tokenAmount.amount).to.be.equal(TOKENS_AMOUNTS[i].amount);
//       });
//     });
//   });

//   describe('_claim', () => {
//     when('recipient is zero address', () => {
//       then('tx is reverted with custom error', async () => {
//         await expect(
//           ongoingCampaigns.internalClaim(randomHex(32), generateRandomAddress(), constants.AddressZero, [], [])
//         ).to.be.revertedWithCustomError(ongoingCampaigns, 'ZeroAddress');
//       });
//     });
//     when('sending empty merkle proof', () => {
//       then('tx is reverted with custom error', async () => {
//         await expect(
//           ongoingCampaigns.internalClaim(
//             randomHex(32),
//             generateRandomAddress(),
//             generateRandomAddress(),
//             [{ token: generateRandomAddress(), amount: 1 }],
//             []
//           )
//         ).to.be.revertedWithCustomError(ongoingCampaigns, 'InvalidProof');
//       });
//     });
//     when('claiming from a random campaign with root zero', () => {
//       const campaign = randomHex(32);
//       let tokenAllocation: IOngoingCampaigns.TokenAmountStruct[];
//       given(async () => {
//         tokenAllocation = [{ token: tokens[0].address, amount: BigNumber.from('100') }];
//         await ongoingCampaigns.setTotalAirdroppedByCampaignAndToken(campaign, tokenAllocation[0].token, tokenAllocation[0].amount);
//       });
//       then('tx is reverted with custom error', async () => {
//         // Random proof for root zero
//         await expect(
//           ongoingCampaigns.internalClaim(campaign, user.address, generateRandomAddress(), tokenAllocation, [randomHex(32)])
//         ).to.be.revertedWithCustomError(ongoingCampaigns, 'InvalidProof');
//         // Hash zero for root zero
//         await expect(
//           ongoingCampaigns.internalClaim(campaign, user.address, generateRandomAddress(), tokenAllocation, [constants.HashZero])
//         ).to.be.revertedWithCustomError(ongoingCampaigns, 'InvalidProof');
//         // Having a valid proof for a root zero
//         const { tree, leaves } = createMerkleTree([user.address], [tokenAllocation]);
//         const proof = tree.getHexProof(leaves[0]);
//         await expect(
//           ongoingCampaigns.internalClaim(campaign, user.address, generateRandomAddress(), tokenAllocation, proof)
//         ).to.be.revertedWithCustomError(ongoingCampaigns, 'InvalidProof');
//       });
//     });
//     when('all arguments are valid', () => {
//       let claimeesAllocations: IOngoingCampaigns.TokenAmountStruct[][];
//       let tree: MerkleTree;
//       let leaves: string[];
//       let campaignTokens: FakeContract<IERC20>[];
//       const campaign = ethers.utils.formatBytes32String('my-campaign');
//       const claimees = [generateRandomAddress(), generateRandomAddress(), generateRandomAddress()];
//       const allocations = [
//         [10, 10],
//         [0, 5],
//         [50, 23],
//       ];
//       given(async () => {
//         campaignTokens = tokens.slice(0, 2);
//         ({ claimeesAllocations, tree, leaves } = await updateCampaign({
//           campaign,
//           claimees,
//           tokens: campaignTokens,
//           allocations,
//         }));
//       });
//       context('and claimee has something to claim', () => {
//         let claimTx: TransactionResponse;
//         const RECIPIENT = generateRandomAddress();
//         given(async () => {
//           claimTx = await ongoingCampaigns.internalClaim(campaign, claimees[0], RECIPIENT, claimeesAllocations[0], tree.getHexProof(leaves[0]));
//         });
//         then('total amount claimed by campaign, token and claimee is updated', async () => {
//           for (let i = 0; i < campaignTokens.length; i++) {
//             expect(await ongoingCampaigns.amountClaimed(campaign, campaignTokens[i].address, claimees[0])).to.be.equal(
//               claimeesAllocations[0][i].amount
//             );
//           }
//         });
//         then('total claimed by campaign and token is updated', async () => {
//           for (let i = 0; i < campaignTokens.length; i++) {
//             expect(await ongoingCampaigns.totalClaimed(campaign, campaignTokens[i].address)).to.be.equal(claimeesAllocations[0][i].amount);
//           }
//         });
//         then('sends correct amount of tokens to recipient', async () => {
//           for (let i = 0; i < campaignTokens.length; i++) {
//             expect(campaignTokens[i].transfer).to.have.been.calledOnceWith(RECIPIENT, claimeesAllocations[0][i].amount);
//           }
//         });
//         then('emits event with correct information', async () => {
//           const args = await getArgsFromEvent(claimTx, 'Claimed');
//           expect(args.campaign).to.be.equal(campaign);
//           expect(args.claimee).to.be.equal(claimees[0]);
//           expect(args.recipient).to.be.equal(RECIPIENT);
//           expect(args.tokens.length).to.be.equal(claimeesAllocations[0].length);
//           for (let i = 0; i < args.tokens.length; i++) {
//             expect(args.tokens[i]).to.be.equal(claimeesAllocations[0][i].token);
//           }
//           expect(args.claimed.length).to.be.equal(allocations[0].length);
//           for (let i = 0; i < args.claimed.length; i++) {
//             expect(args.claimed[i]).to.be.equal(allocations[0][i]);
//             expect(args.claimed[i]).to.be.equal(allocations[0][i]);
//           }
//         });
//       });
//     });
//   });

//   describe('shutdown', () => {
//     when('sending zero address recipient', () => {
//       then('tx is reverted with custom error', async () => {
//         await expect(ongoingCampaigns.connect(admin).shutdown(constants.HashZero, [], constants.AddressZero)).to.be.revertedWithCustomError(
//           ongoingCampaigns,
//           'ZeroAddress'
//         );
//       });
//     });

//     testShutdown({
//       title: 'there is no claimed tokens',
//       totalAirdropped: [100, 200, 300],
//       totalClaimed: [0, 0, 0],
//     });

//     testShutdown({
//       title: 'some tokens were claimed',
//       totalAirdropped: [100, 200, 300],
//       totalClaimed: [50, 4, 280],
//     });

//     testShutdown({
//       title: 'some tokens were all claimed',
//       totalAirdropped: [100, 200, 300],
//       totalClaimed: [50, 4, 300],
//     });

//     testShutdown({
//       title: 'all tokens were claimed',
//       totalAirdropped: [100, 200, 300],
//       totalClaimed: [100, 200, 300],
//     });

//     behaviours.shouldBeExecutableOnlyByRole({
//       contract: () => ongoingCampaigns,
//       funcAndSignature: 'shutdown(bytes32,address[],address)',
//       params: [constants.HashZero, [], constants.AddressZero],
//       addressWithRole: () => admin,
//       role: () => adminRole,
//     });
//   });

//   function testUpdateCampaign({
//     title,
//     previousAllocations,
//     newAllocations,
//   }: {
//     title: string;
//     previousAllocations: number[];
//     newAllocations: number[];
//   }) {
//     const root = randomHex(32);
//     const campaign = randomHex(32);
//     when(title, () => {
//       let updateTx: TransactionResponse;
//       given(async () => {
//         for (let i = 0; i < previousAllocations.length; i++) {
//           await ongoingCampaigns.setTotalAirdroppedByCampaignAndToken(campaign, tokens[i].address, previousAllocations[i]);
//         }
//         updateTx = await ongoingCampaigns.connect(admin).updateCampaign(
//           campaign,
//           root,
//           newAllocations.map((allocation, i) => {
//             return { token: tokens[i].address, amount: allocation };
//           })
//         );
//       });
//       then('updates total airdropped amount by campaign and token', async () => {
//         for (let i = 0; i < previousAllocations.length; i++) {
//           expect(await ongoingCampaigns.totalAirdropped(campaign, tokens[i].address)).to.be.equal(newAllocations[i]);
//         }
//       });
//       then('transfers the correct amount to the contract', () => {
//         for (let i = 0; i < previousAllocations.length; i++) {
//           expect(tokens[i].transferFrom).to.have.been.calledOnceWith(
//             admin.address,
//             ongoingCampaigns.address,
//             newAllocations[i] - previousAllocations[i]
//           );
//         }
//       });
//       then('updates root', async () => {
//         expect(await ongoingCampaigns.roots(campaign)).to.be.equal(root);
//       });
//       then('emits event with correct information', async () => {
//         const transactionArgs = await getArgsFromEvent(updateTx, 'CampaignUpdated');
//         expect(transactionArgs.campaign).to.be.equal(campaign);
//         expect(transactionArgs.root).to.be.equal(root);
//         expect(transactionArgs.tokensAllocation.length).to.equal(newAllocations.length);
//         for (let i = 0; i < transactionArgs.tokensAllocation.length; i++) {
//           expect(transactionArgs.tokensAllocation[i].token).to.be.equal(tokens[i].address);
//           expect(transactionArgs.tokensAllocation[i].amount).to.be.equal(newAllocations[i]);
//         }
//       });
//     });
//   }

//   function testShutdown({ title, totalAirdropped, totalClaimed }: { title: string; totalAirdropped: number[]; totalClaimed: number[] }) {
//     const campaign = randomHex(32);
//     const unclaimed = totalAirdropped.map((airdropped, i) => airdropped - totalClaimed[i]);
//     const recipient = generateRandomAddress();
//     let tokenAddresses: string[];
//     when(title, () => {
//       let shutdownTx: TransactionResponse;
//       given(async () => {
//         tokenAddresses = [];
//         for (let i = 0; i < totalAirdropped.length; i++) {
//           await ongoingCampaigns.setTotalAirdroppedByCampaignAndToken(campaign, tokens[i].address, totalAirdropped[i]);
//           await ongoingCampaigns.setTotalClaimedByCampaignAndToken(campaign, tokens[i].address, totalClaimed[i]);
//           tokenAddresses.push(tokens[i].address);
//         }
//         shutdownTx = await ongoingCampaigns.connect(admin).shutdown(campaign, tokenAddresses, recipient);
//       });
//       then('root is set to zero hash', async () => {
//         expect(await ongoingCampaigns.roots(campaign)).to.be.equal(constants.HashZero);
//       });
//       then('total claimed by campaign and token gets removed', async () => {
//         for (let i = 0; i < totalAirdropped.length; i++) {
//           expect(await ongoingCampaigns.totalClaimed(campaign, tokens[i].address)).to.be.equal(0);
//         }
//       });
//       then('total airdropped by campaign and token gets removed', async () => {
//         for (let i = 0; i < totalAirdropped.length; i++) {
//           expect(await ongoingCampaigns.totalAirdropped(campaign, tokens[i].address)).to.be.equal(0);
//         }
//       });
//       then('transfers out the correct amount to the recipient', () => {
//         for (let i = 0; i < totalAirdropped.length; i++) {
//           if (unclaimed[i] > 0) {
//             expect(tokens[i].transfer).to.have.been.calledOnceWith(recipient, unclaimed[i]);
//           } else {
//             expect(tokens[i].transfer).to.not.have.been.called;
//           }
//         }
//       });
//       then('emits event with correct information', async () => {
//         const transactionArgs = await getArgsFromEvent(shutdownTx, 'CampaignShutDown');
//         expect(transactionArgs.campaign).to.be.equal(campaign);
//         expect(transactionArgs.tokens).to.be.eql(tokenAddresses);
//         expect(transactionArgs.recipient).to.be.equal(recipient);
//         expect(transactionArgs.unclaimed.length).to.equal(unclaimed.length);
//         for (let i = 0; i < transactionArgs.unclaimed.length; i++) {
//           expect(transactionArgs.unclaimed[i]).to.be.equal(unclaimed[i]);
//         }
//       });
//     });
//   }

//   async function updateCampaign({
//     campaign,
//     claimees,
//     tokens,
//     allocations,
//   }: {
//     campaign: string;
//     claimees: string[];
//     tokens: FakeContract<IERC20>[];
//     allocations: BigNumberish[][];
//   }) {
//     const tokenAddresses = tokens.map((token) => token.address);
//     const claimeesAllocations: IOngoingCampaigns.TokenAmountStruct[][] = claimees.map((_, i) =>
//       tokenAddresses.map((token, j) => {
//         return {
//           token,
//           amount: allocations[i][j],
//         };
//       })
//     );
//     const { tree, leaves } = createMerkleTree(claimees, claimeesAllocations);
//     const root = tree.getHexRoot();
//     const totalAllocations = tokenAddresses.map((token, i) => {
//       const totalAllocation = allocations.reduce((prevValue, currentValue) => prevValue.add(currentValue[i]), constants.Zero);
//       return {
//         token,
//         amount: totalAllocation,
//       };
//     });
//     await ongoingCampaigns.connect(admin).updateCampaign(campaign, root, totalAllocations);
//     return {
//       claimeesAllocations,
//       tree,
//       leaves,
//       root,
//     };
//   }
// });
