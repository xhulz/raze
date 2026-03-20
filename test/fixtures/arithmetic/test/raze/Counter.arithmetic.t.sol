// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Counter} from "../../src/Counter.sol";

contract CounterarithmeticTest {
    function test_arithmetic_proof_scaffold() public {
        Counter target = new Counter();
        uint256 beforeValue = uint256(target.value());
        target.decrement(1);
        uint256 afterValue = uint256(target.value());
        require(afterValue != beforeValue, "arithmetic path did not change observable state");
        require(afterValue > beforeValue, "expected arithmetic drift was not observed");
    }

}
