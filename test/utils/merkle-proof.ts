import { MerkleTree } from 'merkletreejs';
import { BigNumber } from 'ethers';
import { keccak256, solidityKeccak256 } from 'ethers/lib/utils';

export function getLeaf(address: string, amount: BigNumber) {
  return Buffer.from(solidityKeccak256(['address', 'uint112'], [address, amount]).slice(2), 'hex');
}

export function createMerkleTree(addresses: string[], amount: BigNumber[]): MerkleTree {
  const leaves = addresses.map((address, i) => getLeaf(address, amount[i]));
  return new MerkleTree(leaves, keccak256, { sortPairs: true });
}
