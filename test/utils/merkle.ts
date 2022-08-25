import { MerkleTree } from 'merkletreejs';
import { keccak256 } from 'ethers/lib/utils';
import { IOngoingCampaigns } from '@typechained';
import { BigNumber, ethers } from 'ethers';

export function getLeaf(address: string, tokenAllocation: IOngoingCampaigns.TokenAmountStruct[]): string {
  let leafString = address;
  for (let i = 0; i < tokenAllocation.length; i++) {
    // Can't do normal abi encode because on solidity
    // we are just concating used bytes.
    const amountEncoded = ethers.utils.defaultAbiCoder.encode(['uint256'], [BigNumber.from(tokenAllocation[i].amount)]);
    leafString += `${tokenAllocation[i].token.toString().slice(2)}${amountEncoded.slice(2)}`;
  }
  return keccak256(leafString);
}

export function createMerkleTree(
  addresses: string[],
  tokensAllocations: IOngoingCampaigns.TokenAmountStruct[][]
): { tree: MerkleTree; leaves: string[] } {
  const leaves = addresses.map((address, i) => getLeaf(address, tokensAllocations[i]));
  return {
    tree: new MerkleTree(leaves, keccak256, { sortPairs: true }),
    leaves,
  };
}
