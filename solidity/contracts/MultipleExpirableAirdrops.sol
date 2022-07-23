// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity >=0.8.7 <0.9.0;

import './utils/Governable.sol';
import '../interfaces/IMultipleExpirableAirdrops.sol';

abstract contract MultipleExpirableAirdrops is IMultipleExpirableAirdrops, Governable {
  constructor(address _governor) Governable(_governor) {}
}
