import chai, { expect } from 'chai';
import { when, then, given } from '@utils/bdd';
import { IERC20, OngoingAirdropsMock, OngoingAirdropsMock__factory } from '@typechained';
import { ethers } from 'hardhat';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { smock, FakeContract } from '@defi-wonderland/smock';
import { takeSnapshot, SnapshotRestorer } from '@nomicfoundation/hardhat-network-helpers';
import { BigNumber, constants } from 'ethers';
import { randomHex } from 'web3-utils';
import { getArgsFromEvent } from '@utils/event-utils';
import { behaviours } from '@utils';
import { TransactionResponse } from '@ethersproject/providers';
import { generateRandomAddress } from '@utils/wallet';

chai.use(smock.matchers);

describe('OngoingAirdrops', () => {
  let superAdmin: SignerWithAddress, admin: SignerWithAddress;
  let ongoingAirdropsFactory: OngoingAirdropsMock__factory;
  let ongoingAirdrops: OngoingAirdropsMock;
  let superAdminRole: string, adminRole: string;
  let snapshot: SnapshotRestorer;

  const tokens: FakeContract<IERC20>[] = [];

  before('Setup accounts and contracts', async () => {
    [, superAdmin, admin] = await ethers.getSigners();
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

  function getIdOfCampaignAndToken(campaign: string, tokenAddress: string): string {
    return ethers.utils.keccak256(`${campaign}${tokenAddress.slice(2)}`);
  }
});
