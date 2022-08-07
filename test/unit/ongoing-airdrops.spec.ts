import chai, { expect } from 'chai';
import { when, then, given } from '@utils/bdd';
import { IERC20, IOngoingAirdrops, OngoingAirdropsMock, OngoingAirdropsMock__factory } from '@typechained';
import { ethers } from 'hardhat';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { smock, FakeContract } from '@defi-wonderland/smock';
import { takeSnapshot, SnapshotRestorer } from '@nomicfoundation/hardhat-network-helpers';
import { BigNumber, BigNumberish, constants, utils } from 'ethers';
import { randomHex } from 'web3-utils';
import { getArgsFromEvent } from '@utils/event-utils';
import { behaviours } from '@utils';
import { TransactionResponse } from '@ethersproject/providers';
import { generateRandomAddress } from '@utils/wallet';
import { createMerkleTree, getLeaf } from '@utils/merkle';
import MerkleTree from 'merkletreejs';

chai.use(smock.matchers);

describe('OngoingAirdrops', () => {
  let user: SignerWithAddress;
  let superAdmin: SignerWithAddress, admin: SignerWithAddress;
  let ongoingAirdropsFactory: OngoingAirdropsMock__factory;
  let ongoingAirdrops: OngoingAirdropsMock;
  let superAdminRole: string, adminRole: string;
  let snapshot: SnapshotRestorer;

  const tokens: FakeContract<IERC20>[] = [];

  before('Setup accounts and contracts', async () => {
    [user, superAdmin, admin] = await ethers.getSigners();
    ongoingAirdropsFactory = (await ethers.getContractFactory(
      'solidity/contracts/test/OngoingAirdrops.sol:OngoingAirdropsMock'
    )) as OngoingAirdropsMock__factory;
    for (let i = 0; i < 10; i++) {
      tokens.push(await smock.fake('IERC20'));
    }
    ongoingAirdrops = await ongoingAirdropsFactory.deploy(superAdmin.address, [admin.address]);
    [superAdminRole, adminRole] = await Promise.all([ongoingAirdrops.SUPER_ADMIN_ROLE(), ongoingAirdrops.ADMIN_ROLE()]);
    snapshot = await takeSnapshot();
  });

  beforeEach(async () => {
    await snapshot.restore();
    for (let i = 0; i < tokens.length; i++) {
      tokens[i].transfer.reset();
      tokens[i].transferFrom.reset();
      tokens[i].transfer.returns(true);
      tokens[i].transferFrom.returns(true);
    }
  });

  describe('constructor', () => {
    when('super admin is zero address', () => {
      then('tx is reverted with custom error', async () => {
        await behaviours.deployShouldRevertWithCustomError({
          contract: ongoingAirdropsFactory,
          args: [constants.AddressZero, []],
          customErrorName: 'ZeroAddress',
        });
      });
    });
    when('all arguments are valid', () => {
      then('super admin is set correctly', async () => {
        const hasRole = await ongoingAirdrops.hasRole(superAdminRole, superAdmin.address);
        expect(hasRole).to.be.true;
      });
      then('initial admins are set correctly', async () => {
        const hasRole = await ongoingAirdrops.hasRole(adminRole, admin.address);
        expect(hasRole).to.be.true;
      });
      then('super admin role is set as super admin role', async () => {
        const admin = await ongoingAirdrops.getRoleAdmin(superAdminRole);
        expect(admin).to.equal(superAdminRole);
      });
      then('super admin role is set as admin role', async () => {
        const admin = await ongoingAirdrops.getRoleAdmin(adminRole);
        expect(admin).to.equal(superAdminRole);
      });
    });
  });

  describe('updateCampaign', () => {
    when('sending an empty campaign', () => {
      then('tx is reverted with custom error', async () => {
        await expect(ongoingAirdrops.connect(admin).updateCampaign(constants.HashZero, randomHex(32), [])).to.be.revertedWithCustomError(
          ongoingAirdrops,
          'InvalidCampaign'
        );
      });
    });
    when('sending an empty merkle root', () => {
      then('tx is reverted with custom error', async () => {
        await expect(ongoingAirdrops.connect(admin).updateCampaign(randomHex(32), constants.HashZero, [])).to.be.revertedWithCustomError(
          ongoingAirdrops,
          'InvalidMerkleRoot'
        );
      });
    });
    when('sending empty token allocations', () => {
      then('tx is reverted with custom error', async () => {
        await expect(ongoingAirdrops.connect(admin).updateCampaign(randomHex(32), randomHex(32), [])).to.be.revertedWithCustomError(
          ongoingAirdrops,
          'InvalidTokenAmount'
        );
      });
    });

    when('sending a token allocation that reduces total airdropped token on campaign', () => {
      const token = randomHex(20);
      const campaign = randomHex(32);
      const airdroppedAmount = BigNumber.from('10');
      given(async () => {
        await ongoingAirdrops.setTotalAirdroppedByCampaignAndToken(campaign, token, airdroppedAmount);
      });
      then('tx is reverted with custom error', async () => {
        await expect(
          ongoingAirdrops.connect(admin).updateCampaign(campaign, randomHex(32), [{ token, amount: airdroppedAmount.sub(1) }])
        ).to.be.revertedWithCustomError(ongoingAirdrops, 'InvalidTokenAmount');
      });
    });

    testUpdateCampaign({
      title: 'its the first time setting a campaign',
      previousAllocations: [0, 0],
      newAllocations: [100, 230],
    });

    testUpdateCampaign({
      title: 'campaign already had some allocation',
      previousAllocations: [69, 10],
      newAllocations: [100, 230],
    });

    behaviours.shouldBeExecutableOnlyByRole({
      contract: () => ongoingAirdrops,
      funcAndSignature: 'updateCampaign(bytes32,bytes32,(address,uint256)[])',
      params: [constants.HashZero, constants.HashZero, []],
      addressWithRole: () => admin,
      role: () => adminRole,
    });
  });

  describe('claimAndSendToClaimee', () => {
    const CAMPAIGN = randomHex(32);
    const CLAIMEE = generateRandomAddress();
    const TOKENS_AMOUNTS: IOngoingAirdrops.TokenAmountStruct[] = [
      {
        token: generateRandomAddress(),
        amount: 1000,
      },
      {
        token: generateRandomAddress(),
        amount: 12469,
      },
    ];
    const PROOF = [randomHex(32), randomHex(32)];
    given(async () => {
      await ongoingAirdrops.claimAndSendToClaimee(CAMPAIGN, CLAIMEE, TOKENS_AMOUNTS, PROOF);
    });
    it('calls internal claim with claimee and recipient as same address', async () => {
      const internalClaimCall = await ongoingAirdrops.internalClaimCall();
      const internalClaimCallTokensAmounts = await ongoingAirdrops.getInternalClaimCallTokensAmounts();
      const internalClaimCallProof = await ongoingAirdrops.getInternalClaimCallProof();
      expect(internalClaimCall.campaign).to.be.equal(CAMPAIGN);
      expect(internalClaimCall.claimee).to.be.equal(CLAIMEE);
      expect(internalClaimCall.recipient).to.be.equal(CLAIMEE);
      expect(internalClaimCallProof).to.be.eql(PROOF);
      expect(internalClaimCallTokensAmounts.length).to.be.equal(TOKENS_AMOUNTS.length);
      internalClaimCallTokensAmounts.forEach((tokenAmount, i) => {
        expect(tokenAmount.token).to.be.equal(TOKENS_AMOUNTS[i].token);
        expect(tokenAmount.amount).to.be.equal(TOKENS_AMOUNTS[i].amount);
      });
    });
  });

  describe('claimAndTransfer', () => {
    const CAMPAIGN = randomHex(32);
    const RECIPIENT = generateRandomAddress();
    const TOKENS_AMOUNTS: IOngoingAirdrops.TokenAmountStruct[] = [
      {
        token: generateRandomAddress(),
        amount: 1000,
      },
      {
        token: generateRandomAddress(),
        amount: 12469,
      },
    ];
    const PROOF = [randomHex(32), randomHex(32)];
    given(async () => {
      await ongoingAirdrops.claimAndTransfer(CAMPAIGN, TOKENS_AMOUNTS, RECIPIENT, PROOF);
    });
    it('calls internal claim with claimee as message sender and the correct recipient', async () => {
      const internalClaimCall = await ongoingAirdrops.internalClaimCall();
      const internalClaimCallTokensAmounts = await ongoingAirdrops.getInternalClaimCallTokensAmounts();
      const internalClaimCallProof = await ongoingAirdrops.getInternalClaimCallProof();
      expect(internalClaimCall.campaign).to.be.equal(CAMPAIGN);
      expect(internalClaimCall.claimee).to.be.equal(user.address);
      expect(internalClaimCall.recipient).to.be.equal(RECIPIENT);
      expect(internalClaimCallProof).to.be.eql(PROOF);
      expect(internalClaimCallTokensAmounts.length).to.be.equal(TOKENS_AMOUNTS.length);
      internalClaimCallTokensAmounts.forEach((tokenAmount, i) => {
        expect(tokenAmount.token).to.be.equal(TOKENS_AMOUNTS[i].token);
        expect(tokenAmount.amount).to.be.equal(TOKENS_AMOUNTS[i].amount);
      });
    });
  });

  describe('_claim', () => {
    when('sending an empty campaign', () => {
      then('tx is reverted with custom error', async () => {
        await expect(
          ongoingAirdrops.claim(constants.HashZero, generateRandomAddress(), [], generateRandomAddress(), [])
        ).to.be.revertedWithCustomError(ongoingAirdrops, 'InvalidCampaign');
      });
    });
    when('claimee is zero address', () => {
      then('tx is reverted with custom error', async () => {
        await expect(ongoingAirdrops.claim(randomHex(32), constants.AddressZero, [], generateRandomAddress(), [])).to.be.revertedWithCustomError(
          ongoingAirdrops,
          'ZeroAddress'
        );
      });
    });
    when('recipient is zero address', () => {
      then('tx is reverted with custom error', async () => {
        await expect(ongoingAirdrops.claim(randomHex(32), generateRandomAddress(), [], constants.AddressZero, [])).to.be.revertedWithCustomError(
          ongoingAirdrops,
          'ZeroAddress'
        );
      });
    });
    when('sending empty tokens amounts', () => {
      then('tx is reverted with custom error', async () => {
        await expect(
          ongoingAirdrops.claim(randomHex(32), generateRandomAddress(), [], generateRandomAddress(), [])
        ).to.be.revertedWithCustomError(ongoingAirdrops, 'InvalidTokenAmount');
      });
    });
    when('sending empty merkle proof', () => {
      then('tx is reverted with custom error', async () => {
        await expect(
          ongoingAirdrops.claim(
            randomHex(32),
            generateRandomAddress(),
            [{ token: generateRandomAddress(), amount: 1 }],
            generateRandomAddress(),
            []
          )
        ).to.be.revertedWithCustomError(ongoingAirdrops, 'InvalidProof');
      });
    });
    when('claiming from a random campaign with root zero', () => {
      const campaign = randomHex(32);
      let tokenAllocation: IOngoingAirdrops.TokenAmountStruct[];
      given(async () => {
        tokenAllocation = [{ token: tokens[0].address, amount: BigNumber.from('100') }];
        await ongoingAirdrops.setTotalAirdroppedByCampaignAndToken(campaign, tokenAllocation[0].token, tokenAllocation[0].amount);
      });
      then('tx is reverted with custom error', async () => {
        // Random proof for root zero
        await expect(
          ongoingAirdrops.claim(campaign, user.address, tokenAllocation, generateRandomAddress(), [randomHex(32)])
        ).to.be.revertedWithCustomError(ongoingAirdrops, 'InvalidProof');
        // Hash zero for root zero
        await expect(
          ongoingAirdrops.claim(campaign, user.address, tokenAllocation, generateRandomAddress(), [constants.HashZero])
        ).to.be.revertedWithCustomError(ongoingAirdrops, 'InvalidProof');
        // Having a valid proof for a root zero
        const { tree, leaves } = createMerkleTree([user.address], [tokenAllocation]);
        const leaf = getLeaf(user.address, tokenAllocation);
        const proof = tree.getHexProof(leaf);
        await expect(
          ongoingAirdrops.claim(campaign, user.address, tokenAllocation, generateRandomAddress(), proof)
        ).to.be.revertedWithCustomError(ongoingAirdrops, 'InvalidProof');
      });
    });
    when('all arguments are valid', () => {
      let usersAllocations: IOngoingAirdrops.TokenAmountStruct[][];
      let tree: MerkleTree;
      let leaves: string[];
      let campaignTokens: FakeContract<IERC20>[];
      const campaign = ethers.utils.formatBytes32String('my-campaign');
      const users = [generateRandomAddress(), generateRandomAddress(), generateRandomAddress()];
      const allocations = [
        [10, 10],
        [0, 5],
        [50, 23],
      ];
      given(async () => {
        campaignTokens = tokens.slice(0, 2);
        ({ usersAllocations, tree, leaves } = await updateCampaign({
          campaign,
          users,
          tokens: campaignTokens,
          allocations,
        }));
      });
      context('and user had already claimed', () => {
        given(async () => {
          await ongoingAirdrops.claim(campaign, users[0], usersAllocations[0], generateRandomAddress(), tree.getHexProof(leaves[0]));
        });
        then('tx is reverted with custom error', async () => {
          await expect(
            ongoingAirdrops.claim(campaign, users[0], usersAllocations[0], generateRandomAddress(), tree.getHexProof(leaves[0]))
          ).to.be.revertedWithCustomError(ongoingAirdrops, 'AlreadyClaimed');
        });
      });
      context('and user has something to claim', () => {
        let claimTx: TransactionResponse;
        const RECIPIENT = generateRandomAddress();
        given(async () => {
          claimTx = await ongoingAirdrops.claim(campaign, users[0], usersAllocations[0], RECIPIENT, tree.getHexProof(leaves[0]));
        });
        then('total amount claimed by campaign, token and user is updated', async () => {
          for (let i = 0; i < campaignTokens.length; i++) {
            expect(
              await ongoingAirdrops.amountClaimedByCampaignTokenAndClaimee(
                getIdOfCampaignUserAndToken(campaign, campaignTokens[i].address, users[0])
              )
            ).to.be.equal(usersAllocations[0][i].amount);
          }
        });
        then('total claimed by campaign and token is updated', async () => {
          for (let i = 0; i < campaignTokens.length; i++) {
            expect(
              await ongoingAirdrops.totalClaimedByCampaignAndToken(getIdOfCampaignAndToken(campaign, campaignTokens[i].address))
            ).to.be.equal(usersAllocations[0][i].amount);
          }
        });
        then('sends correct amount of tokens to recipient', async () => {
          for (let i = 0; i < campaignTokens.length; i++) {
            const [to, amount] = campaignTokens[i].transfer.getCall(0).args;
            expect(to).to.be.equal(RECIPIENT);
            expect(amount).to.be.equal(usersAllocations[0][i].amount);
          }
        });
        then('emits event with correct information', async () => {
          const args = await getArgsFromEvent(claimTx, 'Claimed');
          expect(args.campaign).to.be.equal(campaign);
          expect(args.initiator).to.be.equal(user.address);
          expect(args.claimee).to.be.equal(users[0]);
          expect(args.recipient).to.be.equal(RECIPIENT);
          expect(args.tokensAmount.length).to.be.equal(usersAllocations[0].length);
          for (let i = 0; i < args.tokensAmount.length; i++) {
            expect(args.tokensAmount[i].token).to.be.equal(usersAllocations[0][i].token);
            expect(args.tokensAmount[i].amount).to.be.equal(usersAllocations[0][i].amount);
          }
          expect(args.claimed.length).to.be.equal(allocations[0].length);
          for (let i = 0; i < args.claimed.length; i++) {
            expect(args.claimed[i]).to.be.equal(allocations[0][i]);
            expect(args.claimed[i]).to.be.equal(allocations[0][i]);
          }
        });
      });
    });
  });

  describe('shutdown', () => {
    when('sending zero address recipient', () => {
      then('tx is reverted with custom error', async () => {
        await expect(ongoingAirdrops.connect(admin).shutdown(constants.HashZero, [], constants.AddressZero)).to.be.revertedWithCustomError(
          ongoingAirdrops,
          'ZeroAddress'
        );
      });
    });

    testShutdown({
      title: 'there is no claimed tokens',
      totalAirdropped: [100, 200, 300],
      totalClaimed: [0, 0, 0],
    });

    testShutdown({
      title: 'some tokens were claimed',
      totalAirdropped: [100, 200, 300],
      totalClaimed: [50, 4, 280],
    });

    testShutdown({
      title: 'some tokens were all claimed',
      totalAirdropped: [100, 200, 300],
      totalClaimed: [50, 4, 300],
    });

    testShutdown({
      title: 'all tokens were claimed',
      totalAirdropped: [100, 200, 300],
      totalClaimed: [100, 200, 300],
    });

    behaviours.shouldBeExecutableOnlyByRole({
      contract: () => ongoingAirdrops,
      funcAndSignature: 'shutdown(bytes32,address[],address)',
      params: [constants.HashZero, [], constants.AddressZero],
      addressWithRole: () => admin,
      role: () => adminRole,
    });
  });

  function testUpdateCampaign({
    title,
    previousAllocations,
    newAllocations,
  }: {
    title: string;
    previousAllocations: number[];
    newAllocations: number[];
  }) {
    const root = randomHex(32);
    const campaign = randomHex(32);
    when(title, () => {
      let updateTx: TransactionResponse;
      given(async () => {
        for (let i = 0; i < previousAllocations.length; i++) {
          await ongoingAirdrops.setTotalAirdroppedByCampaignAndToken(campaign, tokens[i].address, previousAllocations[i]);
        }
        updateTx = await ongoingAirdrops.connect(admin).updateCampaign(
          campaign,
          root,
          newAllocations.map((allocation, i) => {
            return { token: tokens[i].address, amount: allocation };
          })
        );
      });
      then('updates total airdropped amount by campaign and token', async () => {
        for (let i = 0; i < previousAllocations.length; i++) {
          expect(await ongoingAirdrops.totalAirdroppedByCampaignAndToken(getIdOfCampaignAndToken(campaign, tokens[i].address))).to.be.equal(
            newAllocations[i]
          );
        }
      });
      then('transfers the correct amount to the contract', () => {
        for (let i = 0; i < previousAllocations.length; i++) {
          expect(tokens[i].transferFrom).to.have.been.calledOnceWith(
            admin.address,
            ongoingAirdrops.address,
            newAllocations[i] - previousAllocations[i]
          );
        }
      });
      then('updates root', async () => {
        expect(await ongoingAirdrops.roots(campaign)).to.be.equal(root);
      });
      then('emits event with correct information', async () => {
        const transactionArgs = await getArgsFromEvent(updateTx, 'CampaignUpdated');
        expect(transactionArgs.campaign).to.be.equal(campaign);
        expect(transactionArgs.root).to.be.equal(root);
        expect(transactionArgs.tokensAllocation.length).to.equal(newAllocations.length);
        for (let i = 0; i < transactionArgs.tokensAllocation.length; i++) {
          expect(transactionArgs.tokensAllocation[i].token).to.be.equal(tokens[i].address);
          expect(transactionArgs.tokensAllocation[i].amount).to.be.equal(newAllocations[i]);
        }
      });
    });
  }

  function testShutdown({ title, totalAirdropped, totalClaimed }: { title: string; totalAirdropped: number[]; totalClaimed: number[] }) {
    const campaign = randomHex(32);
    const unclaimed = totalAirdropped.map((airdropped, i) => airdropped - totalClaimed[i]);
    const recipient = generateRandomAddress();
    let tokenAddresses: string[];
    when(title, () => {
      let shutdownTx: TransactionResponse;
      given(async () => {
        tokenAddresses = [];
        for (let i = 0; i < totalAirdropped.length; i++) {
          await ongoingAirdrops.setTotalAirdroppedByCampaignAndToken(campaign, tokens[i].address, totalAirdropped[i]);
          await ongoingAirdrops.setTotalClaimedByCampaignAndToken(campaign, tokens[i].address, totalClaimed[i]);
          tokenAddresses.push(tokens[i].address);
        }
        shutdownTx = await ongoingAirdrops.connect(admin).shutdown(campaign, tokenAddresses, recipient);
      });
      then('root is set to zero hash', async () => {
        expect(await ongoingAirdrops.roots(campaign)).to.be.equal(constants.HashZero);
      });
      then('total claimed by campaign and token gets removed', async () => {
        for (let i = 0; i < totalAirdropped.length; i++) {
          expect(await ongoingAirdrops.totalClaimedByCampaignAndToken(getIdOfCampaignAndToken(campaign, tokens[i].address))).to.be.equal(0);
        }
      });
      then('total airdropped by campaign and token gets removed', async () => {
        for (let i = 0; i < totalAirdropped.length; i++) {
          expect(await ongoingAirdrops.totalAirdroppedByCampaignAndToken(getIdOfCampaignAndToken(campaign, tokens[i].address))).to.be.equal(0);
        }
      });
      then('transfers out the correct amount to the recipient', () => {
        for (let i = 0; i < totalAirdropped.length; i++) {
          expect(tokens[i].transfer).to.have.been.calledOnceWith(recipient, unclaimed[i]);
        }
      });
      then('emits event with correct information', async () => {
        const transactionArgs = await getArgsFromEvent(shutdownTx, 'CampaignShutDown');
        expect(transactionArgs.campaign).to.be.equal(campaign);
        expect(transactionArgs.tokens).to.be.eql(tokenAddresses);
        expect(transactionArgs.recipient).to.be.equal(recipient);
        expect(transactionArgs.unclaimed.length).to.equal(unclaimed.length);
        for (let i = 0; i < transactionArgs.unclaimed.length; i++) {
          expect(transactionArgs.unclaimed[i]).to.be.equal(unclaimed[i]);
        }
      });
    });
  }

  async function updateCampaign({
    campaign,
    users,
    tokens,
    allocations,
  }: {
    campaign: string;
    users: string[];
    tokens: FakeContract<IERC20>[];
    allocations: BigNumberish[][];
  }) {
    const tokenAddresses = tokens.map((token) => token.address);
    const usersAllocations: IOngoingAirdrops.TokenAmountStruct[][] = users.map((_, i) =>
      tokenAddresses.map((token, j) => {
        return {
          token,
          amount: allocations[i][j],
        };
      })
    );
    const { tree, leaves } = createMerkleTree(users, usersAllocations);
    const root = tree.getHexRoot();
    const totalAllocations = tokenAddresses.map((token, i) => {
      const totalAllocation = allocations.reduce((prevValue, currentValue) => prevValue.add(currentValue[i]), constants.Zero);
      return {
        token,
        amount: totalAllocation,
      };
    });
    await ongoingAirdrops.connect(admin).updateCampaign(campaign, root, totalAllocations);
    return {
      usersAllocations,
      tree,
      leaves,
      root,
    };
  }

  function getIdOfCampaignUserAndToken(campaign: string, tokenAddress: string, userAddress: string): string {
    return ethers.utils.keccak256(`${campaign}${tokenAddress.slice(2)}${userAddress.slice(2)}`);
  }

  function getIdOfCampaignAndToken(campaign: string, tokenAddress: string): string {
    return ethers.utils.keccak256(`${campaign}${tokenAddress.slice(2)}`);
  }
});
