// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC3156FlashBorrower {
    function onFlashLoan(
        address initiator,
        address token,
        uint256 amount,
        uint256 fee,
        bytes calldata data
    ) external returns (bytes32);
}

interface IERC3156FlashLender {
    function flashLoan(
        IERC3156FlashBorrower receiver,
        address token,
        uint256 amount,
        bytes calldata data
    ) external returns (bool);
}

contract FlashLoanVault is IERC3156FlashBorrower {
    mapping(address => uint256) public balances;
    address public lender;

    constructor(address _lender) {
        lender = _lender;
    }

    function deposit(address to, uint256 amount) external {
        balances[to] += amount;
    }

    function withdraw(address from, uint256 amount) external {
        require(balances[from] >= amount, "insufficient balance");
        balances[from] -= amount;
    }

    // Flash loan callback — no nonReentrant guard, mutates balances inside callback
    function onFlashLoan(
        address initiator,
        address,
        uint256 amount,
        uint256,
        bytes calldata
    ) external override returns (bytes32) {
        // Vulnerable: mutates balance mapping inside flash loan callback without invariant check
        balances[initiator] += amount;
        return keccak256("ERC3156FlashBorrower.onFlashLoan");
    }
}
