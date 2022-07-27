import chai, { expect } from 'chai';
import { behaviours } from '@utils';
import { when, then, given } from '@utils/bdd';
import { constants, utils } from 'ethers';
import { randomHex } from 'web3-utils';
import { IERC20, MultipleExpirableAirdrops, MultipleExpirableAirdrops__factory } from '@typechained';
import { ethers } from 'hardhat';
import { generateRandomAddress } from '@utils/wallet';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { smock, FakeContract } from '@defi-wonderland/smock';
import { takeSnapshot, SnapshotRestorer } from '@nomicfoundation/hardhat-network-helpers';
import moment from 'moment';
import { TransactionResponse } from '@ethersproject/providers';

chai.use(smock.matchers);

describe('MultipleExpirableAirdrop', () => {
  let governor: SignerWithAddress;
  let user: SignerWithAddress;
  let claimableToken: FakeContract<IERC20>;
  let multipleExpirablesAirdropFactory: MultipleExpirableAirdrops__factory;
  let multipleExpirablesAirdrop: MultipleExpirableAirdrops;
  let snapshot: SnapshotRestorer;

  before('Setup accounts and contracts', async () => {
    [governor, user] = await ethers.getSigners();
    claimableToken = await smock.fake('IERC20');
    multipleExpirablesAirdropFactory = (await ethers.getContractFactory(
      'solidity/contracts/MultipleExpirableAirdrops.sol:MultipleExpirableAirdrops'
    )) as MultipleExpirableAirdrops__factory;
    multipleExpirablesAirdrop = await multipleExpirablesAirdropFactory.deploy(governor.address, claimableToken.address);
    snapshot = await takeSnapshot();
  });

  beforeEach(async () => {
    await snapshot.restore();
    claimableToken.transferFrom.reset();
  });

  describe('constructor', () => {
    when('claimable token is zero address', () => {
      then('tx is reverted with custom error', async () => {
        await behaviours.deployShouldRevertWithCustomError({
          contract: multipleExpirablesAirdropFactory,
          args: [generateRandomAddress(), constants.AddressZero],
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
        await expect(
          multipleExpirablesAirdrop.createTranche(utils.randomBytes(32), 0, moment().add('1', 'week').unix())
        ).to.be.revertedWithCustomError(multipleExpirablesAirdrop, 'InvalidAmount');
      });
    });
    when('trying to create a tranche with a deadline previous than now', () => {
      then('tx is reverted with custom error', async () => {
        await expect(
          multipleExpirablesAirdrop.createTranche(utils.randomBytes(32), 1, moment().subtract('1', 'second').unix())
        ).to.be.revertedWithCustomError(multipleExpirablesAirdrop, 'ExpiredTranche');
      });
    });
    when('all arguments are valid', () => {
      let createTx: TransactionResponse;
      const ROOT = utils.randomBytes(32);
      const CLAIMABLE_AMOUNT = utils.parseEther('420.69');
      const DEADLINE = moment().add('1', 'week').unix();
      given(async () => {
        claimableToken.transferFrom.returns(true);
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
});
