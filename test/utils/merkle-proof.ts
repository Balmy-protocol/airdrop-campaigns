import { MerkleTree } from 'merkletreejs';
import { ethers } from 'hardhat';
import { BigNumber } from 'ethers';

export function getLeaf(address: string, amount: BigNumber): Buffer {
  return Buffer.from(ethers.utils.solidityKeccak256(['address', 'uint256'], [address, amount]).slice(2), 'hex');
}

export function createMerkleTree(accounts: { address: string }[], amounts: BigNumber[]): MerkleTree {
  const leaves = accounts.map((account, i) => {
    return getLeaf(account.address, amounts[i]);
  });

  return new MerkleTree(leaves, ethers.utils.keccak256, { sortPairs: true });
}
