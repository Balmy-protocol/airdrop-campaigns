import chai, { expect } from 'chai';
import { when, then, given } from '@utils/bdd';
import { IERC20, IOngoingAirdrops, OngoingAirdropsMock, OngoingAirdropsMock__factory } from '@typechained';
import { ethers } from 'hardhat';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { smock, FakeContract } from '@defi-wonderland/smock';
import { takeSnapshot, SnapshotRestorer } from '@nomicfoundation/hardhat-network-helpers';
import { BigNumber, constants } from 'ethers';
import { randomHex } from 'web3-utils';
import moment from 'moment';
import { behaviours } from '@utils';
import { TransactionResponse } from '@ethersproject/providers';
import { getArgsFromEvent } from '@utils/event-utils';

chai.use(smock.matchers);

describe('OngoingAirdrops', () => {
  let governor: SignerWithAddress;
  let ongoingAirdropsFactory: OngoingAirdropsMock__factory;
  let ongoingAirdrops: OngoingAirdropsMock;
  let snapshot: SnapshotRestorer;

  const tokens: FakeContract<IERC20>[] = [];

  before('Setup accounts and contracts', async () => {
    [governor] = await ethers.getSigners();
    ongoingAirdropsFactory = (await ethers.getContractFactory(
      'solidity/contracts/test/OngoingAirdrops.sol:OngoingAirdropsMock'
    )) as OngoingAirdropsMock__factory;
    ongoingAirdrops = await ongoingAirdropsFactory.deploy(governor.address);
    for (let i = 0; i < 10; i++) {
      tokens.push(await smock.fake('IERC20'));
    }
    snapshot = await takeSnapshot();
  });

  beforeEach(async () => {
    await snapshot.restore();
    for (let i = 0; i < 10; i++) {
      tokens[i].transferFrom.reset();
      tokens[i].transferFrom.returns(true);
    }
  });

  describe('constructor', () => {
    when('all arguments are valid', () => {
      then('governor is set correctly', async () => {
        expect(await ongoingAirdrops.governor()).to.be.equal(governor.address);
      });
    });
  });

  describe('updateCampaign', () => {
    when('sending an empty campaign', () => {
      then('tx is reverted with custom error', async () => {
        await expect(ongoingAirdrops.updateCampaign(constants.HashZero, randomHex(32), [], 0)).to.be.revertedWithCustomError(
          ongoingAirdrops,
          'InvalidCampaign'
        );
      });
    });
    when('sending an empty merkle root', () => {
      then('tx is reverted with custom error', async () => {
        await expect(ongoingAirdrops.updateCampaign(randomHex(32), constants.HashZero, [], 0)).to.be.revertedWithCustomError(
          ongoingAirdrops,
          'InvalidMerkleRoot'
        );
      });
    });
    when('sending empty token allocations', () => {
      then('tx is reverted with custom error', async () => {
        await expect(ongoingAirdrops.updateCampaign(randomHex(32), randomHex(32), [], 0)).to.be.revertedWithCustomError(
          ongoingAirdrops,
          'InvalidTokenAmount'
        );
      });
    });
    when('trying to create a tranche with a deadline previous than now', () => {
      then('tx is reverted with custom error', async () => {
        await expect(
          ongoingAirdrops.updateCampaign(
            randomHex(32),
            randomHex(32),
            [{ token: randomHex(20), amount: constants.One }],
            moment().subtract('1', 'second').unix()
          )
        ).to.be.revertedWithCustomError(ongoingAirdrops, 'InvalidDeadline');
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
          ongoingAirdrops.updateCampaign(campaign, randomHex(32), [{ token, amount: airdroppedAmount.sub(1) }], moment().add('1', 'week').unix())
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

    behaviours.shouldBeExecutableOnlyByGovernor({
      contract: () => ongoingAirdrops,
      funcAndSignature: 'updateCampaign(bytes32,bytes32,(address,uint256)[],uint32)',
      params: [constants.HashZero, constants.HashZero, [], 0],
      governor: () => governor,
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
    const deadline = moment().add('1', 'week').unix();
    when(title, () => {
      let updateTx: TransactionResponse;
      given(async () => {
        for (let i = 0; i < previousAllocations.length; i++) {
          await ongoingAirdrops.setTotalAirdroppedByCampaignAndToken(campaign, tokens[i].address, previousAllocations[i]);
        }
        updateTx = await ongoingAirdrops.updateCampaign(
          campaign,
          root,
          newAllocations.map((allocation, i) => {
            return { token: tokens[i].address, amount: allocation };
          }),
          deadline
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
            governor.address,
            ongoingAirdrops.address,
            newAllocations[i] - previousAllocations[i]
          );
        }
      });
      then('updates root', async () => {
        expect(await ongoingAirdrops.roots(campaign)).to.be.equal(root);
      });
      then('updates deadline correctly', async () => {
        expect(await ongoingAirdrops.deadline(campaign)).to.be.equal(deadline);
      });
      then('emits event with correct information', async () => {
        const transactionArgs = await getArgsFromEvent(updateTx, 'CampaignUpdated');
        expect(transactionArgs.campaign).to.be.equal(campaign);
        expect(transactionArgs.root).to.be.equal(root);
        expect(transactionArgs.deadline).to.be.equal(deadline);
        expect(transactionArgs.tokensAllocation.length).to.equal(newAllocations.length);
        for (let i = 0; i < transactionArgs.tokensAllocation.length; i++) {
          expect(transactionArgs.tokensAllocation[i].token).to.be.equal(tokens[i].address);
          expect(transactionArgs.tokensAllocation[i].amount).to.be.equal(newAllocations[i]);
        }
      });
    });
  }

  function getIdOfCampaignAndToken(campaign: string, tokenAddress: string): string {
    return ethers.utils.keccak256(`${campaign}${tokenAddress.slice(2)}`);
  }
});
