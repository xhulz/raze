# Examples

This directory contains minimal Foundry projects you can use to try Raze immediately after installing.

## vault — reentrancy

A simple ETH vault with a classic reentrancy bug: `withdraw()` sends ETH before zeroing the balance.

### Try it in 3 steps

**Step 1 — Install Raze and initialize the project**

```bash
cd examples/vault
npx raze init
```

**Step 2 — Analyze via MCP**

Open `src/Vault.sol` in your editor and ask your AI:

```
analyze this smart contract
```

Raze will inspect the project, detect the reentrancy pattern, and propose an attack plan.

**Step 3 — Generate and run the proof scaffold**

Ask your AI to call `raze_generate_proof_scaffold` with the proposed plan, then run:

```bash
forge test --match-path test/raze/Vault.reentrancy.t.sol -vv
```

A passing `test_reentrancy_proof_scaffold` confirms the bug is exploitable.
A passing `test_reentrancy_regression` (after you apply the fix) confirms the fix is effective.

### Or use the CLI directly

```bash
cd examples/vault
npx raze fuzz . --contract Vault --run
```

The report is written to `.raze/reports/fuzz.md`.
