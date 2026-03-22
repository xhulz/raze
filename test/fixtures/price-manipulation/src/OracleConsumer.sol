// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IUniswapV2Pair {
    function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast);
}

contract OracleConsumer {
    IUniswapV2Pair public pair;
    mapping(address => uint256) public collateral;

    constructor(address _pair) {
        pair = IUniswapV2Pair(_pair);
    }

    // Reads spot price from AMM — no TWAP, vulnerable to single-block manipulation
    function getPrice() public view returns (uint256) {
        (uint112 reserve0, uint112 reserve1,) = pair.getReserves();
        require(reserve0 > 0, "zero reserve");
        return (uint256(reserve1) * 1e18) / uint256(reserve0);
    }

    function deposit(address user, uint256 amount) external {
        collateral[user] += amount;
    }

    // Uses spot price to determine liquidation — vulnerable to price manipulation
    function liquidate(address user) external {
        uint256 price = getPrice();
        uint256 userCollateral = collateral[user];
        // Liquidation threshold based on manipulable spot price
        require(userCollateral * price < 1e18, "position is healthy");
        collateral[user] = 0;
    }
}
