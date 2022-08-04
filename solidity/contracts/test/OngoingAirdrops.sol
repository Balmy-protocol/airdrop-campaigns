// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.7 <0.9.0;

import '../OngoingAirdrops.sol';

contract OngoingAirdropsMock is OngoingAirdrops {
  constructor(address _superAdmin, address[] memory _initialAdmins) OngoingAirdrops(_superAdmin, _initialAdmins) {}

  function setTotalAirdroppedByCampaignAndToken(
    bytes32 _campaign,
    IERC20 _token,
    uint256 _amount
  ) external {
    totalAirdroppedByCampaignAndToken[_getIdOfCampaignAndToken(_campaign, _token)] = _amount;
  }
}
