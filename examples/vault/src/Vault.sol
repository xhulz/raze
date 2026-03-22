// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice A simple ETH vault with a reentrancy vulnerability.
/// Users can deposit and withdraw ETH. The withdraw function sends ETH
/// before updating the balance — a classic reentrancy bug.
contract Vault {
    mapping(address => uint256) public balances;

    function deposit() external payable {
        balances[msg.sender] += msg.value;
    }

    function withdraw() external {
        uint256 amount = balances[msg.sender];
        require(amount > 0, "empty");
        (bool ok,) = msg.sender.call{value: amount}("");
        require(ok, "send failed");
        balances[msg.sender] = 0; // balance cleared after transfer — bug is here
    }
}
