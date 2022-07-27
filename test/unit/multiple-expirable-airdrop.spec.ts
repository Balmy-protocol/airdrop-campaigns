import chai, { expect } from 'chai';
import { behaviours } from '@utils';
import { when, then } from '@utils/bdd';
import { constants } from 'ethers';
import { IERC20, MultipleExpirableAirdrops, MultipleExpirableAirdrops__factory } from '@typechained';
import { ethers } from 'hardhat';
import { generateRandomAddress } from '@utils/wallet';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { smock, FakeContract } from '@defi-wonderland/smock';
import { takeSnapshot, SnapshotRestorer } from '@nomicfoundation/hardhat-network-helpers';

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
  });

  describe('constructor', () => {
    when('claimable token is zero address', () => {
      then('tx is reverted with reason error', async () => {
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
});
