# Vulnerabilities

Vulnerability families that Raze supports for attack validation and proof scaffold generation.

## Supported

- **Reentrancy** — cross-function and cross-contract reentrant calls
- **Access control** — missing or bypassed role/ownership checks
- **Arithmetic** — overflow, underflow, precision loss (post-0.8 edge cases still relevant)
- **tx.origin** — authentication using `tx.origin` instead of `msg.sender`
- **Unchecked calls** — ignored return values from low-level calls
- **Flash loan** — unguarded state mutations inside flash loan callbacks (IERC3156, Aave, dYdX, Balancer); assertionKind: `flash-loan-extraction`
- **Price manipulation** — spot price reads from AMM pairs without TWAP or staleness protection (Uniswap V2/V3, Curve); assertionKind: `price-oracle-drift`

## How vulnerabilities are used

- The external AI proposes a vulnerability hypothesis for a given contract
- Raze validates the hypothesis against actual symbols in the project
- A deterministic proof scaffold is generated for the confirmed vulnerability + pattern combination
- Raze does not accept arbitrary vulnerability claims — symbols must resolve

## Where to look in source

- Attack validation logic: `src/core/` (attacker/validator stage)
- Proof scaffold templates per vulnerability: `templates/`
- Attack-specific agent logic: `src/agents/`
