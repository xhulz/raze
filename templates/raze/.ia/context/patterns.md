# Patterns — Attack Vector Guide

Use this after inspection to map detected contract patterns to plausible attack vectors.

---

## ERC20

**`inheritedSignals` to look for**: `ERC20`, `IERC20`

**Vectors to consider:**
- `mint` without access control → `access-control` / `unauthorized-state-change`
- `burn` without access control → same
- `transfer` or `transferFrom` hooks that make external calls → `reentrancy`
- Fee-on-transfer with division → `arithmetic` / precision loss
- `approve` + `transferFrom` with unchecked allowance arithmetic

**High-value target functions**: `mint`, `burn`, `transfer`, `transferFrom`, `approve`

---

## Ownable

**`inheritedSignals` to look for**: `Ownable`, `OwnableUpgradeable`

**Vectors to consider:**
- Admin functions without `onlyOwner` modifier → `access-control`
- `transferOwnership` callable by non-owner → `access-control`
- Functions that check `tx.origin == owner` instead of `msg.sender` → `access-control`

**High-value target functions**: any state-mutating admin function, `transferOwnership`, `renounceOwnership`

---

## AccessControl (role-based)

**`inheritedSignals` to look for**: `AccessControl`, `IAccessControl`

**Vectors to consider:**
- Role-gated functions missing `onlyRole` → `access-control`
- Role assignment functions without role check → allows role escalation
- Default admin role (`DEFAULT_ADMIN_ROLE`) callable by arbitrary accounts

**High-value target functions**: `grantRole`, `revokeRole`, any `MINTER_ROLE` / `PAUSER_ROLE` gated function

---

## Vault / Pull Payment

**`inheritedSignals` to look for**: `vault`, `deposit`, `withdraw`, `claim`, `redeem`

**Vectors to consider:**
- `withdraw` or `claim` with external call before balance update → `reentrancy`
- Share/asset ratio calculation with integer division → `arithmetic` / precision loss
- Deposit → withdraw path with no minimum shares check → `arithmetic` / inflation attack
- `redeem` with no access check → `access-control`

**High-value target functions**: `withdraw`, `claim`, `redeem`, `deposit`

**targetStateVariable candidates**: `balances`, `shares`, `totalAssets`, `totalSupply`

---

## Treasury / Admin Executor

**`inheritedSignals` to look for**: `execute`, `proposal`, `timelock`, `governor`

**Vectors to consider:**
- `execute` callable before timelock expiry → `access-control`
- Proposal execution without quorum check → `access-control`
- ETH transfer in `execute` without reentrancy guard → `reentrancy`

**High-value target functions**: `execute`, `queue`, `cancel`, `propose`
