[![Lint](https://github.com/Balmy-protocol/airdrop-campaigns/actions/workflows/lint.yml/badge.svg?branch=main)](https://github.com/Balmy-protocol/airdrop-campaigns/actions/workflows/lint.yml)
[![Tests](https://github.com/Balmy-protocol/airdrop-campaigns/actions/workflows/tests.yml/badge.svg?branch=main)](https://github.com/Balmy-protocol/airdrop-campaigns/actions/workflows/tests.yml)
[![Slither Analysis](https://github.com/Balmy-protocol/airdrop-campaigns/actions/workflows/slither.yml/badge.svg?branch=main)](https://github.com/Balmy-protocol/airdrop-campaigns/actions/workflows/slither.yml)

# Ongoing airdrops / campaigns

This repository holds the [OngoingAirdrops.sol](./solidity/contracts/OngoingAirdrops.sol) smart contract. This contract is meant to handle multiple ongoing airdrops, also referred to as **campaigns**.

## Multiple campaigns

Let's say a protocol wants to do a one-time referral reward in USDC for all users that have executed some action. Additionally, this protocol wants to do a one-time airdrop of some loyalty token.

Instead of having to deploy multiple airdrop claiming smart contracts and making more difficult the task to maintain subgraphs, frontends, etc. they can now create both campaigns on this contract. One might be called `Best swappers` and the other one `Loyalty Program Q1`.

## Ongoing campaigns

Another potential use case would be if a protocol wants to implement an on-going (not a one time) referral campaign that for one reason or another cannot be calculated and / or distributed directly on-chain. Instead of having multiple claim contracts, this `OngoingAirdrops` contract can be used instead

## Technical details

On-going campaigns work by updating the merkle root whenever we want to add tokens to user allocations.

Merkle root **should** be built by leaves, each of which will be representing a user. This leaf will be calculated by the sum of all previous user allocation plus the new one.

`leaf(U, A) = leaf(U, A - 1) + ... + leaf(A, 1)`

An example: Let's say Alice was able to claim `5 Tokens A` for the first instance of a campaign, and now she is rewarded `15 tokens A` for the second instance. In this case, her leaf on the updated root should be `20 tokens A`.

So, in order for on-going campaigns to not break we should always maintain one invariant: Whenever we update a campaign through `updateCampaign` the new token allocations should also always be the sum all of previous allocations, plus the new one.

Another example of how allocations updates should look like:

```
First allocation
- User 1
  - Token A = 50
  - Token B = 20
- User 2
  - Token A = 10
  - Token B = 5
- Total
  - Token A = 60
  - Token B = 25

Second Allocation
- User 1
  - Token A = 10
  - Token B = 5
- User 2
  - Token A = 0
  - Token B = 30
- User 1 final leaf information
  - Token A = 50 + 10 = 60
  - Token B = 20 + 5 = 25
- User 2 final leaf information
  - Token A = 10 + 0 = 10
  - Token B = 5 + 30 = 35
- Total
  - Token A = 70
  - Token B = 60
```

Maintaining this invariant while also tracking what the user has claimed helps us being able to identify how much is currently claimable.

In order to derive the amount to be claimed by a user we use: `Claimable(U) = TotalAirdropped(U) - Total Claimed(U)`

## Package

The package will contain:

- Artifacts can be found under `@balmy/airdrop-campaigns/artifacts`
- Compatible deployments for [hardhat-deploy](https://github.com/wighawag/hardhat-deploy) plugin under the `@balmy/airdrop-campaigns/deployments` folder.
- Typescript smart contract typings under `@balmy/airdrop-campaigns/typechained`

## Documentation

Everything that you need to know as a developer on how to use all repository smart contracts can be found in the [documented interfaces](./solidity/interfaces/).

## Installation

To install with [**Hardhat**](https://github.com/nomiclabs/hardhat) or [**Truffle**](https://github.com/trufflesuite/truffle):

#### YARN

```sh
yarn add @balmy/airdrop-campaigns
```

### NPM

```sh
npm install @balmy/airdrop-campaigns
```
