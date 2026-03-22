// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./PriceOracle.sol";

contract LendingPool {
    PriceOracle public oracle;
    mapping(address => uint256) public collateral;

    constructor(address _oracle) {
        oracle = PriceOracle(_oracle);
    }

    function deposit(address user, uint256 amount) external {
        collateral[user] += amount;
    }

    // Reads spot price from oracle to decide liquidation — no TWAP
    function liquidate(address user) external {
        uint256 price = oracle.getPrice();
        uint256 userCollateral = collateral[user];
        require(userCollateral * price < 1e18, "position is healthy");
        collateral[user] = 0;
    }
}
