// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract Counter {
    uint256 public value;

    function decrement(uint256 amount) external {
        unchecked {
            value -= amount;
        }
    }
}
