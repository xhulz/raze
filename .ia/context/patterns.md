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

- Pattern detection logic: `src/core/` (inspect stage)
- Pattern-to-template mapping: `templates/`
