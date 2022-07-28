// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.7 <0.9.0;

import '../MultipleExpirableAirdrops.sol';

contract MultipleExpirableAirdropsMock is MultipleExpirableAirdrops {
  constructor(address _governor, IERC20 _claimableToken) MultipleExpirableAirdrops(_governor, _claimableToken) {}

  function setTranchesClaimed(bytes32 _root, uint112 _claimed) external {
    tranches[_root].claimed = _claimed;
  }
}
