import { SnapshotRestorer, takeSnapshot } from '@nomicfoundation/hardhat-network-helpers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { ERC20Mock, ERC20Mock__factory, MultipleExpirableAirdrops, MultipleExpirableAirdrops__factory } from '@typechained';
import { BigNumber, constants, utils } from 'ethers';
import { then, when } from '@utils/bdd';
import { ethers } from 'hardhat';
import crypto from 'crypto';
import { generateRandomAddress } from '@utils/wallet';
import { createMerkleTree, getLeaf } from '@utils/merkle-proof';
import MerkleTree from 'merkletreejs';
import moment from 'moment';
import { expect } from 'chai';
import { randomHex } from 'web3-utils';
import { time } from '@nomicfoundation/hardhat-network-helpers';

describe('MultipleExpirableAirdrops - e2e', () => {
  let governor: SignerWithAddress;
  let snapshot: SnapshotRestorer;
  let claimableToken: ERC20Mock;

  let multipleExpirablesAirdrop: MultipleExpirableAirdrops;
  let multipleExpirablesAirdropFactory: MultipleExpirableAirdrops__factory;

  before('Setup accounts and contracts', async () => {
    [governor] = await ethers.getSigners();
    const erc20Factory = (await ethers.getContractFactory('solidity/contracts/test/ERC20.sol:ERC20Mock')) as ERC20Mock__factory;
    claimableToken = await erc20Factory.deploy('MF Token', 'MFT', governor.address, constants.MaxUint256);
    multipleExpirablesAirdropFactory = (await ethers.getContractFactory(
      'solidity/contracts/MultipleExpirableAirdrops.sol:MultipleExpirableAirdrops'
    )) as MultipleExpirableAirdrops__factory;
    multipleExpirablesAirdrop = await multipleExpirablesAirdropFactory.deploy(governor.address, claimableToken.address);
    snapshot = await takeSnapshot();
  });

  beforeEach(async () => {
    await snapshot.restore();
  });

  when('trying to claim with a wrong proof a valid combination of claimee and amount', () => {
    then('tx gets reverted with custom error', async () => {
      const { root, addresses, amounts } = await createTranche({
        deadline: moment().add('1', 'day').unix(),
      });
      await expect(
        multipleExpirablesAirdrop.claimAndSendToClaimee(root, addresses[0], amounts[0], [randomHex(32)])
      ).to.be.revertedWithCustomError(multipleExpirablesAirdrop, 'InvalidProof');
    });
  });

  when('trying to claim with a valid proof but an invalid combination of claimee and amount', () => {
    then('tx gets reverted with custom error', async () => {
      const { root, amounts, proofs } = await createTranche({
        deadline: moment().add('1', 'day').unix(),
      });
      await expect(
        multipleExpirablesAirdrop.claimAndSendToClaimee(root, generateRandomAddress(), amounts[0], proofs[0])
      ).to.be.revertedWithCustomError(multipleExpirablesAirdrop, 'InvalidProof');
    });
  });

  when('everything gets claimed', () => {
    then('it works as expected', async () => {
      const { root, addresses, amounts, proofs } = await createTranche({
        deadline: moment().add('1', 'day').unix(),
      });
      for (let i = 0; i < addresses.length; i++) {
        expect(await claimableToken.balanceOf(addresses[i])).to.be.equal(0);
        await multipleExpirablesAirdrop.claimAndSendToClaimee(root, addresses[i], amounts[i], proofs[i]);
        expect(await claimableToken.balanceOf(addresses[i])).to.be.equal(amounts[i]);
      }
    });
  });

  when('not everything gets claimed and tranche gets closed', () => {
    then('it works as expected', async () => {
      const deadline = moment().add('1', 'day').unix();
      const { root, addresses, amounts, proofs } = await createTranche({
        deadline,
      });
      for (let i = 0; i < addresses.length - 1; i++) {
        expect(await claimableToken.balanceOf(addresses[i])).to.be.equal(0);
        await multipleExpirablesAirdrop.claimAndSendToClaimee(root, addresses[i], amounts[i], proofs[i]);
        expect(await claimableToken.balanceOf(addresses[i])).to.be.equal(amounts[i]);
      }
      await time.increaseTo(deadline + 1);
      const randomRecipient = generateRandomAddress();
      await multipleExpirablesAirdrop.connect(governor).closeTranche(root, randomRecipient);
      expect(await claimableToken.balanceOf(randomRecipient)).to.be.equal(amounts[amounts.length - 1]);
    });
  });

  when('there are more than two tranches and users claim in both of them', () => {
    then('it works as expected', async () => {
      const firstDeadline = moment().add('1', 'week').unix();
      const secondDeadline = moment().add('2', 'weeks').unix();
      const {
        root: firstRoot,
        addresses,
        amounts: firstAmounts,
        proofs: firstProofs,
      } = await createTranche({
        deadline: firstDeadline,
      });
      const {
        root: secondRoot,
        amounts: secondAmounts,
        proofs: secondProofs,
      } = await createTranche({
        addresses,
        deadline: secondDeadline,
      });
      // Half of the users claim the first tranche
      for (let i = 0; i < addresses.length / 2; i++) {
        expect(await claimableToken.balanceOf(addresses[i])).to.be.equal(0);
        await multipleExpirablesAirdrop.claimAndSendToClaimee(firstRoot, addresses[i], firstAmounts[i], firstProofs[i]);
        expect(await claimableToken.balanceOf(addresses[i])).to.be.equal(firstAmounts[i]);
      }
      // Increate time
      await time.increaseTo(firstDeadline - moment.duration('3', 'days').as('seconds'));
      // All users but one claim all tranche 2
      for (let i = 0; i < addresses.length - 1; i++) {
        const initalBalance = i < addresses.length / 2 ? firstAmounts[i] : constants.Zero;
        expect(await claimableToken.balanceOf(addresses[i])).to.be.equal(initalBalance);
        await multipleExpirablesAirdrop.claimAndSendToClaimee(secondRoot, addresses[i], secondAmounts[i], secondProofs[i]);
        expect(await claimableToken.balanceOf(addresses[i])).to.be.equal(initalBalance.add(secondAmounts[i]));
      }
      // Lets expire first tranche
      await time.increaseTo(firstDeadline + 1);
      const randomRecipient = generateRandomAddress();
      // Close first tranche
      await multipleExpirablesAirdrop.connect(governor).closeTranche(firstRoot, randomRecipient);
      // Lets count unclaimed from first tranche
      const unclaimedFromFirstTranche = firstAmounts
        .slice(Math.floor(firstAmounts.length / 2) + 1)
        .reduce((prevValue, currentValue) => prevValue.add(currentValue), constants.Zero);
      expect(await claimableToken.balanceOf(randomRecipient)).to.be.equal(unclaimedFromFirstTranche);
      // Expiring second tranche
      await time.increaseTo(secondDeadline + 1);
      await multipleExpirablesAirdrop.connect(governor).closeTranche(secondRoot, randomRecipient);
      expect(await claimableToken.balanceOf(randomRecipient)).to.be.equal(
        unclaimedFromFirstTranche.add(secondAmounts[secondAmounts.length - 1])
      );
    });
  });

  async function createTranche({ addresses, deadline }: { addresses?: string[]; deadline: number }): Promise<{
    tree: MerkleTree;
    root: string;
    addresses: string[];
    amounts: BigNumber[];
    proofs: string[][];
  }> {
    addresses = addresses ?? [];
    const amounts: BigNumber[] = [];
    for (let i = 0; i < 15; i++) {
      if (addresses.length < 15) addresses.push(generateRandomAddress());
      amounts.push(BigNumber.from(`${crypto.randomInt(15, 9999)}`));
    }
    const tree = createMerkleTree(addresses, amounts);
    const root = tree.getHexRoot();
    const totalAmount = amounts.reduce((prevValue, currentValue) => prevValue.add(currentValue), constants.Zero);
    await claimableToken.connect(governor).approve(multipleExpirablesAirdrop.address, totalAmount);
    await multipleExpirablesAirdrop.createTranche(root, totalAmount, deadline);
    const proofs = addresses.map((address, i) => tree.getHexProof(getLeaf(address, amounts[i])));
    return {
      addresses,
      amounts,
      proofs,
      tree,
      root,
    };
  }
});
