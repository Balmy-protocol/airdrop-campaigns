import chai, { expect } from 'chai';
import { when, then } from '@utils/bdd';
import { OngoingAirdrops, OngoingAirdrops__factory } from '@typechained';
import { ethers } from 'hardhat';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { smock } from '@defi-wonderland/smock';
import { takeSnapshot, SnapshotRestorer } from '@nomicfoundation/hardhat-network-helpers';

chai.use(smock.matchers);

describe('OngoingAirdrops', () => {
  let governor: SignerWithAddress;
  let ongoingAirdropsFactory: OngoingAirdrops__factory;
  let ongoingAirdrops: OngoingAirdrops;
  let snapshot: SnapshotRestorer;

  before('Setup accounts and contracts', async () => {
    [governor] = await ethers.getSigners();
    ongoingAirdropsFactory = (await ethers.getContractFactory(
      'solidity/contracts/OngoingAirdrops.sol:OngoingAirdrops'
    )) as OngoingAirdrops__factory;
    ongoingAirdrops = await ongoingAirdropsFactory.deploy(governor.address);
    snapshot = await takeSnapshot();
  });

  beforeEach(async () => {
    await snapshot.restore();
  });

  describe('constructor', () => {
    when('all arguments are valid', () => {
      then('governor is set correctly', async () => {
        expect(await ongoingAirdrops.governor()).to.be.equal(governor.address);
      });
    });
  });
});
