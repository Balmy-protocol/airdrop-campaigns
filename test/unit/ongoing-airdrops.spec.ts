import chai, { expect } from 'chai';
import { when, then } from '@utils/bdd';
import { OngoingAirdrops, OngoingAirdrops__factory } from '@typechained';
import { ethers } from 'hardhat';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { smock } from '@defi-wonderland/smock';
import { takeSnapshot, SnapshotRestorer } from '@nomicfoundation/hardhat-network-helpers';
import { behaviours } from '@utils';
import { constants } from 'ethers';

chai.use(smock.matchers);

describe('OngoingAirdrops', () => {
  let superAdmin: SignerWithAddress, admin: SignerWithAddress;
  let ongoingAirdropsFactory: OngoingAirdrops__factory;
  let ongoingAirdrops: OngoingAirdrops;
  let superAdminRole: string, adminRole: string;
  let snapshot: SnapshotRestorer;

  before('Setup accounts and contracts', async () => {
    [, superAdmin, admin] = await ethers.getSigners();
    ongoingAirdropsFactory = (await ethers.getContractFactory(
      'solidity/contracts/OngoingAirdrops.sol:OngoingAirdrops'
    )) as OngoingAirdrops__factory;
    ongoingAirdrops = await ongoingAirdropsFactory.deploy(superAdmin.address, [admin.address]);
    [superAdminRole, adminRole] = await Promise.all([ongoingAirdrops.SUPER_ADMIN_ROLE(), ongoingAirdrops.ADMIN_ROLE()]);
    snapshot = await takeSnapshot();
  });

  beforeEach(async () => {
    await snapshot.restore();
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
});
