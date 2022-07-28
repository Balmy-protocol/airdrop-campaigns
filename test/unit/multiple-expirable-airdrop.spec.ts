import chai, { expect } from 'chai';
import moment from 'moment';
import { BigNumber, constants, utils } from 'ethers';
import { randomHex } from 'web3-utils';
import { ethers } from 'hardhat';
import { behaviours } from '@utils';
import { when, then, given } from '@utils/bdd';
import { IERC20, MultipleExpirableAirdropsMock, MultipleExpirableAirdropsMock__factory } from '@typechained';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { smock, FakeContract } from '@defi-wonderland/smock';
import { takeSnapshot, SnapshotRestorer, time } from '@nomicfoundation/hardhat-network-helpers';
import { TransactionResponse } from '@ethersproject/providers';
import { createMerkleTree, getLeaf } from '@utils/merkle-proof';
import MerkleTree from 'merkletreejs';
import { getAddress } from 'ethers/lib/utils';

chai.use(smock.matchers);

describe('MultipleExpirableAirdrop', () => {
  let governor: SignerWithAddress;
  let user: SignerWithAddress;
  let claimableToken: FakeContract<IERC20>;
  let multipleExpirablesAirdrop: MultipleExpirableAirdropsMock;
  let multipleExpirablesAirdropFactory: MultipleExpirableAirdropsMock__factory;
  let snapshot: SnapshotRestorer;

  before('Setup accounts and contracts', async () => {
    [governor, user] = await ethers.getSigners();
    claimableToken = await smock.fake('IERC20');
    multipleExpirablesAirdropFactory = (await ethers.getContractFactory(
      'solidity/contracts/test/MultipleExpirableAirdrops.sol:MultipleExpirableAirdropsMock'
    )) as MultipleExpirableAirdropsMock__factory;
    multipleExpirablesAirdrop = await multipleExpirablesAirdropFactory.deploy(governor.address, claimableToken.address);
    snapshot = await takeSnapshot();
  });

  beforeEach(async () => {
    claimableToken.transferFrom.reset();
    claimableToken.transfer.reset();
    claimableToken.transferFrom.returns(true);
    claimableToken.transfer.returns(true);
    await snapshot.restore();
  });

  describe('constructor', () => {
    when('claimable token is zero address', () => {
      then('tx is reverted with custom error', async () => {
        await behaviours.deployShouldRevertWithCustomError({
          contract: multipleExpirablesAirdropFactory,
          args: [randomHex(20), constants.AddressZero],
          customErrorName: 'ZeroAddress',
        });
      });
    });
    when('all arguments are valid', () => {
      then('governor is set correctly', async () => {
        expect(await multipleExpirablesAirdrop.governor()).to.be.equal(governor.address);
      });
      then('claimable token is set correctly', async () => {
        expect(await multipleExpirablesAirdrop.claimableToken()).to.be.equal(claimableToken.address);
      });
    });
  });

  describe('createTranche', () => {
    when('sending an empty merkle root', () => {
      then('tx is reverted with custom error', async () => {
        await expect(
          multipleExpirablesAirdrop.createTranche(constants.HashZero, 1, moment().add('1', 'week').unix())
        ).to.be.revertedWithCustomError(multipleExpirablesAirdrop, 'InvalidMerkleRoot');
      });
    });
    when('sending claimable amount as zero', () => {
      then('tx is reverted with custom error', async () => {
        await expect(multipleExpirablesAirdrop.createTranche(randomHex(32), 0, moment().add('1', 'week').unix())).to.be.revertedWithCustomError(
          multipleExpirablesAirdrop,
          'InvalidAmount'
        );
      });
    });
    when('trying to create a tranche with a deadline previous than now', () => {
      then('tx is reverted with custom error', async () => {
        await expect(
          multipleExpirablesAirdrop.createTranche(randomHex(32), 1, moment().subtract('1', 'second').unix())
        ).to.be.revertedWithCustomError(multipleExpirablesAirdrop, 'ExpiredTranche');
      });
    });
    when('all arguments are valid', () => {
      let createTx: TransactionResponse;
      const ROOT = randomHex(32);
      const CLAIMABLE_AMOUNT = utils.parseEther('420.69');
      const DEADLINE = moment().add('1', 'week').unix();
      given(async () => {
        createTx = await multipleExpirablesAirdrop.createTranche(ROOT, CLAIMABLE_AMOUNT, DEADLINE);
      });
      then('funds get transfered from msg sender to contract', () => {
        expect(claimableToken.transferFrom).to.have.been.calledWith(governor.address, multipleExpirablesAirdrop.address, CLAIMABLE_AMOUNT);
      });
      then('tranche gets created', async () => {
        expect(await multipleExpirablesAirdrop.tranches(ROOT)).to.be.eql([CLAIMABLE_AMOUNT, constants.Zero, DEADLINE]);
      });
      then('emits event with information', async () => {
        await expect(createTx).to.emit(multipleExpirablesAirdrop, 'TrancheCreated').withArgs(ROOT, CLAIMABLE_AMOUNT, DEADLINE);
      });
    });
    behaviours.shouldBeExecutableOnlyByGovernor({
      contract: () => multipleExpirablesAirdrop,
      funcAndSignature: 'createTranche(bytes32,uint112,uint32)',
      params: [constants.HashZero, 0, 0],
      governor: () => governor,
    });
  });

  describe('closeTranche', () => {
    const ROOT = randomHex(32);
    when('sending an empty merkle root', () => {
      then('tx is reverted with custom error', async () => {
        await expect(multipleExpirablesAirdrop.closeTranche(constants.HashZero, randomHex(20))).to.be.revertedWithCustomError(
          multipleExpirablesAirdrop,
          'InvalidMerkleRoot'
        );
      });
    });
    when('sending an empty recipient', () => {
      then('tx is reverted with custom error', async () => {
        await expect(multipleExpirablesAirdrop.closeTranche(randomHex(32), constants.AddressZero)).to.be.revertedWithCustomError(
          multipleExpirablesAirdrop,
          'ZeroAddress'
        );
      });
    });
    when('tranche is still active', () => {
      given(async () => {
        await multipleExpirablesAirdrop.createTranche(ROOT, 1, moment().add('1', 'week').unix());
      });
      then('tx is reverted with custom error', async () => {
        await expect(multipleExpirablesAirdrop.closeTranche(ROOT, randomHex(20))).to.be.revertedWithCustomError(
          multipleExpirablesAirdrop,
          'TrancheStillActive'
        );
      });
    });
    when('tranche deadline has passed', () => {
      testCloseTranche({
        contextTitle: 'all claimable tokens were claimed',
        root: ROOT,
        claimable: utils.parseEther('420.69'),
        claimed: constants.Zero,
      });
      testCloseTranche({
        contextTitle: 'some tokens were claimed',
        root: ROOT,
        claimable: utils.parseEther('420.69'),
        claimed: utils.parseEther('420.69').div(2),
      });
    });
    behaviours.shouldBeExecutableOnlyByGovernor({
      contract: () => multipleExpirablesAirdrop,
      funcAndSignature: 'closeTranche(bytes32,address)',
      params: [constants.HashZero, constants.AddressZero],
      governor: () => governor,
    });
  });

  function testCloseTranche({
    contextTitle,
    root,
    claimable,
    claimed,
  }: {
    contextTitle: string;
    root: string;
    claimable: BigNumber;
    claimed: BigNumber;
  }): void {
    context(contextTitle, () => {
      let closeTx: TransactionResponse;
      const RECIPIENT = getAddress(randomHex(20));
      const DEADLINE = moment().add('1', 'week').unix();
      const unclaimed = claimable.sub(claimed);
      given(async () => {
        await multipleExpirablesAirdrop.createTranche(root, claimable, DEADLINE);
        if (claimed.gt(0)) {
          await multipleExpirablesAirdrop.setTranchesClaimed(root, claimed);
        }
        await time.increaseTo(DEADLINE + 1);
        closeTx = await multipleExpirablesAirdrop.closeTranche(root, RECIPIENT);
      });
      then('sends unclaimed tokens to recipient', async () => {
        const { args } = claimableToken.transfer.getCall(0);
        expect(args[0]).to.be.equal(RECIPIENT);
        expect(args[1]).to.be.equal(unclaimed);
      });
      then('updates tranche information to be all claimed', async () => {
        const { claimable, claimed, deadline } = await multipleExpirablesAirdrop.tranches(root);
        expect(claimable).to.be.equal(claimable);
        expect(claimed).to.be.equal(claimable);
        expect(deadline).to.be.equal(DEADLINE);
      });
      then('emits event with information', async () => {
        await expect(closeTx).to.emit(multipleExpirablesAirdrop, 'TrancheClosed').withArgs(root, RECIPIENT, unclaimed);
      });
    });
  }
});
