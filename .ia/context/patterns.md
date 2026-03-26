# Patterns

Recognized contract patterns that Raze can inspect and target.

## Supported

- **ERC20** — standard token, approval/transfer flows
- **Ownable** — single-owner access control via `onlyOwner`
- **AccessControl** — role-based access (OpenZeppelin)
- **Vault** — deposit/withdraw patterns, balance accounting
- **Pull payment** — receiver-initiated withdrawal, credit ledger

## How patterns are used

- During project inspection, Raze detects which patterns are present
- Detected patterns inform the external AI's attack hypothesis space
- Proof scaffold templates are selected based on detected pattern + vulnerability combination

## Where to look in source

- Pattern detection logic: `src/core/planner.ts` (inspect stage)
- Shared parsing: `src/core/solidity.ts` (signatures, state vars)
- Scaffold templates: `src/core/tester.ts` (per attack type)

## Code Organization Patterns

- **Helper extraction**: when a regex, parser, or utility is used in >1 module, extract to `solidity.ts`
- **Schema/tool separation**: MCP schemas in `schemas.ts`, handlers in `tools.ts`
- **Single-responsibility files**: each core module covers one pipeline stage
