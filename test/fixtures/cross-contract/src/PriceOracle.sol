// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IUniswapV2Pair {
    function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast);
}

contract PriceOracle {
    IUniswapV2Pair public pair;

    constructor(address _pair) {
        pair = IUniswapV2Pair(_pair);
    }

    // Returns spot price — no TWAP, vulnerable to single-block manipulation
    function getPrice() public view returns (uint256) {
        (uint112 reserve0, uint112 reserve1,) = pair.getReserves();
        require(reserve0 > 0, "zero reserve");
        return (uint256(reserve1) * 1e18) / uint256(reserve0);
    }
}
