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
import { getAddress } from 'ethers/lib/utils';
import { getLeaf, createMerkleTree } from '@utils/merkle-proof';
import MerkleTree from 'merkletreejs';

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

  describe('claimAndSendToClaimee', () => {
    const ROOT = randomHex(32);
    const CLAIMEE = getAddress(randomHex(20));
    const CLAIMABLE_AMOUNT = utils.parseEther('12.34');
    const PROOF = [randomHex(32), randomHex(32)];
    given(async () => {
      await multipleExpirablesAirdrop.claimAndSendToClaimee(ROOT, CLAIMEE, CLAIMABLE_AMOUNT, PROOF);
    });
    it('calls internal claim with claimee and recipient as same address', async () => {
      const internalClaimCall = await multipleExpirablesAirdrop.internalClaimCall();
      const internalClaimCallProof = await multipleExpirablesAirdrop.getInternalClaimCallProof();
      expect(internalClaimCall._trancheMerkleRoot).to.be.equal(ROOT);
      expect(internalClaimCall._claimee).to.be.equal(CLAIMEE);
      expect(internalClaimCall._amount).to.be.equal(CLAIMABLE_AMOUNT);
      expect(internalClaimCall._recipient).to.be.equal(CLAIMEE);
      expect(internalClaimCallProof).to.be.eql(PROOF);
    });
  });

  describe('claimAndTransfer', () => {
    const ROOT = randomHex(32);
    const RECIPIENT = getAddress(randomHex(20));
    const CLAIMABLE_AMOUNT = utils.parseEther('12.34');
    const PROOF = [randomHex(32), randomHex(32)];
    given(async () => {
      await multipleExpirablesAirdrop.connect(user).claimAndTransfer(ROOT, CLAIMABLE_AMOUNT, RECIPIENT, PROOF);
    });
    it('calls internal claim with claimee as message sender', async () => {
      const internalClaimCall = await multipleExpirablesAirdrop.internalClaimCall();
      const internalClaimCallProof = await multipleExpirablesAirdrop.getInternalClaimCallProof();
      expect(internalClaimCall._trancheMerkleRoot).to.be.equal(ROOT);
      expect(internalClaimCall._claimee).to.be.equal(user.address);
      expect(internalClaimCall._amount).to.be.equal(CLAIMABLE_AMOUNT);
      expect(internalClaimCall._recipient).to.be.equal(RECIPIENT);
      expect(internalClaimCallProof).to.be.eql(PROOF);
    });
  });

  describe('_claim', () => {
    let proof: string[];
    let root: string;
    const CLAIMEE_1 = getAddress(randomHex(20));
    const CLAIMEE_2 = getAddress(randomHex(20));
    const RECIPIENT = getAddress(randomHex(20));
    const CLAIMABLE_AMOUNT_1 = utils.parseEther('12.34');
    const CLAIMABLE_AMOUNT_2 = utils.parseEther('420.69');
    const DEADLINE = moment().add('1', 'week').unix();
    given(async () => {
      let tree: MerkleTree;
      ({ tree, root } = await createTranche({
        addresses: [CLAIMEE_1, CLAIMEE_2],
        amounts: [CLAIMABLE_AMOUNT_1, CLAIMABLE_AMOUNT_2],
        deadline: DEADLINE,
      }));
      proof = tree.getHexProof(getLeaf(CLAIMEE_1, CLAIMABLE_AMOUNT_1));
    });
    when('sending an empty merkle root', () => {
      then('tx is reverted with custom error', async () => {
        await expect(
          multipleExpirablesAirdrop.claim(constants.HashZero, CLAIMEE_1, CLAIMABLE_AMOUNT_1, RECIPIENT, proof)
        ).to.be.revertedWithCustomError(multipleExpirablesAirdrop, 'InvalidMerkleRoot');
      });
    });
    when('sending zero amount', () => {
      then('tx is reverted with custom error', async () => {
        await expect(multipleExpirablesAirdrop.claim(root, CLAIMEE_1, constants.Zero, RECIPIENT, proof)).to.be.revertedWithCustomError(
          multipleExpirablesAirdrop,
          'InvalidAmount'
        );
      });
    });
    when('claimee is zero address', () => {
      then('tx is reverted with custom error', async () => {
        await expect(
          multipleExpirablesAirdrop.claim(root, constants.AddressZero, CLAIMABLE_AMOUNT_1, RECIPIENT, proof)
        ).to.be.revertedWithCustomError(multipleExpirablesAirdrop, 'ZeroAddress');
      });
    });
    when('recipient is zero address', () => {
      then('tx is reverted with custom error', async () => {
        await expect(
          multipleExpirablesAirdrop.claim(root, CLAIMEE_1, CLAIMABLE_AMOUNT_1, constants.AddressZero, proof)
        ).to.be.revertedWithCustomError(multipleExpirablesAirdrop, 'ZeroAddress');
      });
    });
    when('sending empty merkle proof', () => {
      then('tx is reverted with custom error', async () => {
        await expect(multipleExpirablesAirdrop.claim(root, CLAIMEE_1, CLAIMABLE_AMOUNT_1, RECIPIENT, [])).to.be.revertedWithCustomError(
          multipleExpirablesAirdrop,
          'InvalidProof'
        );
      });
    });
    when('airdrop has expired', () => {
      given(async () => {
        await time.increaseTo(DEADLINE + 1);
      });
      then('tx is reverted with custom error', async () => {
        await expect(multipleExpirablesAirdrop.claim(root, CLAIMEE_1, CLAIMABLE_AMOUNT_1, RECIPIENT, proof)).to.be.revertedWithCustomError(
          multipleExpirablesAirdrop,
          'ExpiredTranche'
        );
      });
    });
    when('sending an invalid merkle proof', () => {
      then('tx is reverted with custom error', async () => {
        await expect(
          multipleExpirablesAirdrop.claim(root, CLAIMEE_1, CLAIMABLE_AMOUNT_1, RECIPIENT, [randomHex(32), randomHex(32)])
        ).to.be.revertedWithCustomError(multipleExpirablesAirdrop, 'InvalidProof');
      });
    });
    when('claiming an already claimed tranche proof', () => {
      given(async () => {
        await multipleExpirablesAirdrop.claim(root, CLAIMEE_1, CLAIMABLE_AMOUNT_1, RECIPIENT, proof);
      });
      then('tx is reverted with custom error', async () => {
        await expect(multipleExpirablesAirdrop.claim(root, CLAIMEE_1, CLAIMABLE_AMOUNT_1, RECIPIENT, proof)).to.be.revertedWithCustomError(
          multipleExpirablesAirdrop,
          'AlreadyClaimed'
        );
      });
    });
    when('all arguments are valid', () => {
      let claimTx: TransactionResponse;
      given(async () => {
        claimTx = await multipleExpirablesAirdrop.claim(root, CLAIMEE_1, CLAIMABLE_AMOUNT_1, RECIPIENT, proof);
      });
      then(`sets tranche and claimee's proof as claimed`, async () => {
        expect(await multipleExpirablesAirdrop.claimedTranches(getClaimId(root, CLAIMEE_1))).to.be.true;
      });
      then(`adds amount claimed to total tranche's claimed amount`, async () => {
        const { claimed } = await multipleExpirablesAirdrop.tranches(root);
        expect(claimed).to.be.equal(CLAIMABLE_AMOUNT_1);
      });
      then('emits event with information', async () => {
        expect(claimTx).to.emit(multipleExpirablesAirdrop, 'TrancheClaimed').withArgs(root, CLAIMEE_1, CLAIMABLE_AMOUNT_2, RECIPIENT);
      });
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

  function getClaimId(root: string, claimeeAddress: string): string {
    return ethers.utils.solidityKeccak256(['bytes32', 'address'], [root, claimeeAddress]);
  }

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

  async function createTranche({
    addresses,
    amounts,
    deadline,
  }: {
    addresses: string[];
    amounts: BigNumber[];
    deadline: number;
  }): Promise<{ tree: MerkleTree; root: string }> {
    const tree = createMerkleTree(addresses, amounts);
    const root = tree.getHexRoot();
    const totalAmount = amounts.reduce((prevValue, currentValue) => prevValue.add(currentValue), constants.Zero);
    await multipleExpirablesAirdrop.createTranche(root, totalAmount, deadline);
    return {
      tree,
      root,
    };
  }
});
