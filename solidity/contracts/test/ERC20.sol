// SPDX-License-Identifier: UNLICENSED

pragma solidity >=0.8.7 <0.9.0;

import '@openzeppelin/contracts/token/ERC20/ERC20.sol';

contract ERC20Mock is ERC20 {
  constructor(
    string memory _name,
    string memory _symbol,
    address _initialAccount,
    uint256 _initialBalance
  ) ERC20(_name, _symbol) {
    _mint(_initialAccount, _initialBalance);
  }
}
