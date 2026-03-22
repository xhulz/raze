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

/// @notice Flash loan vault that acts as a lender.
/// Vulnerability: updates totalDeposits before the callback with no invariant check.
contract FlashLoanVault {
    mapping(address => uint256) public balances;
    uint256 public totalDeposits;

    function deposit() external payable {
        balances[msg.sender] += msg.value;
        totalDeposits += msg.value;
    }

    function withdraw(uint256 amount) external {
        require(balances[msg.sender] >= amount, "insufficient balance");
        balances[msg.sender] -= amount;
        totalDeposits -= amount;
        payable(msg.sender).transfer(amount);
    }

    function flashLoan(address borrower, uint256 amount) external {
        uint256 balanceBefore = address(this).balance;
        require(balanceBefore >= amount, "insufficient liquidity");

        // State inflated before callback — no invariant snapshot
        balances[borrower] += amount;
        totalDeposits += amount;

        IERC3156FlashBorrower(borrower).onFlashLoan(
            msg.sender,
            address(0),
            amount,
            0,
            bytes("")
        );

        require(address(this).balance >= balanceBefore, "flash loan not repaid");

        balances[borrower] -= amount;
        totalDeposits -= amount;
    }

    receive() external payable {}
}
