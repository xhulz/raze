# Vulnerabilities — Hypothesis Guide

Use this to form attack hypotheses after inspecting a contract. Each family maps to an `attackType` and an `assertionKind`.

---

## Reentrancy

**`attackType`**: `reentrancy`
**`assertionKind`**: `reentrant-state-inconsistency`

**Hypothesis pattern**: `[function] performs an external call before updating [state variable], enabling a reentrant callback to re-enter and observe or corrupt inconsistent state.`

**What to look for:**
- Functions that send ETH or call external contracts before updating balances or flags
- `withdraw`, `claim`, `redeem`, `transfer` patterns
- Missing reentrancy guards (`nonReentrant`, `_status` flags)
- CEI (Checks-Effects-Interactions) violations — interaction before effect

**callerRole**: `"attacker"` with a malicious fallback/receive function

**Severity signal**: High if ETH or token balance can be drained. Medium if state inconsistency is observable but not directly profitable.

---

## Access Control

**`attackType`**: `access-control`
**`assertionKind`**: `unauthorized-state-change`

**Hypothesis pattern**: `[function] is a privileged mutation path that lacks [ownership/role] check, allowing any caller to [change critical state].`

**What to look for:**
- Functions missing `onlyOwner`, `onlyRole`, or equivalent modifier
- Admin functions (`mint`, `burn`, `pause`, `upgrade`, `setFee`, `setOwner`) with no guard
- Contracts that inherit `Ownable` or `AccessControl` but don't apply modifiers consistently
- `tx.origin` used for authentication instead of `msg.sender`

**callerRole**: `"unauthorized-user"` or `"non-owner"`

**Severity signal**: Critical if attacker can drain funds, mint unlimited tokens, or disable safety mechanisms. High if they can corrupt governance or configuration state.

---

## Arithmetic

**`attackType`**: `arithmetic`
**`assertionKind`**: `arithmetic-drift`

**Hypothesis pattern**: `[function] performs [arithmetic operation] on [state variable] without [bound check / precision guard], enabling [overflow / underflow / precision loss] that corrupts the accounting.`

**What to look for:**
- Unchecked arithmetic blocks (`unchecked { }`) around balance or share calculations
- Division before multiplication in fee or share calculations (precision loss)
- Casting between uint types that can truncate
- Solidity >=0.8 does not overflow by default, but `unchecked` blocks are a common explicit bypass
- Vault or token contracts with share/asset ratio calculations

**targetStateVariable**: the balance, share, or counter that drifts

**Severity signal**: High if token supply or user balance can be manipulated. Medium if precision loss is small and bounded.
