# Open Questions

## flash-loan scaffold: lender vs receiver pattern mismatch

**Discovered:** 2026-03-22, manual MCP test against `raze-playground/FlashLoanVault.sol`

**Problem:** `buildFlashLoanTest` in `src/core/tester.ts` generates a scaffold that assumes the target contract is a flash loan *receiver* (implements `onFlashLoan` / `executeOperation` / etc.). It deploys a `MockFlashLender` and has the attacker call `lender.flashLoan(...)`, then inside the callback calls `target.onFlashLoan(...)`.

When the target IS the lender (e.g., a vault that exposes `flashLoan(address borrower, uint256 amount)`), the scaffold calls a non-existent function on the target, the state never changes, and the assertion `require(afterValue != beforeValue, "flash loan did not skew observable state")` always fails.

**Fix direction:** Detect which role the contract plays:
- If contract has `flashLoan(` / `flashBorrow(` → it's a **lender**: scaffold should deploy an attacker that implements `onFlashLoan` and calls `target.flashLoan(address(this), amount)` directly. Assert state divergence inside the callback or after.
- If contract has `onFlashLoan` / `executeOperation` / `receiveFlashLoan` → it's a **receiver**: current scaffold is correct.

**Files affected:**
- `src/core/tester.ts` — `buildFlashLoanTest()`, split into `buildFlashLoanLenderTest()` and `buildFlashLoanReceiverTest()`
- `src/core/planner.ts` — `analyzeContract` could expose a `flashLoanRole: "lender" | "receiver"` signal to guide scaffold selection
- `test/fixtures/flash-loan/` — update fixture scaffold after fix
