# Attack Plan Spec

An `attackPlan` is the structured artifact you author and pass to `raze_attack` or `raze_run_attack_suite`. Raze validates it against real project symbols before generating proof scaffolds.

## Schema

```json
{
  "attackType": "reentrancy" | "access-control" | "arithmetic",
  "contractName": "string (optional — use if targeting a specific contract)",
  "functionNames": ["string", ...],
  "attackHypothesis": "string",
  "proofGoal": "string",
  "expectedOutcome": "string",
  "callerRole": "string (optional)",
  "targetStateVariable": "string (optional)",
  "assertionKind": "unauthorized-state-change" | "arithmetic-drift" | "reentrant-state-inconsistency",
  "sampleArguments": [string | number | boolean, ...] "(optional)"
}
```

## Field guidance

### `attackType`
The vulnerability family. Determines which proof scaffold template is used.
- `reentrancy` → cross-function or cross-contract reentrant call
- `access-control` → missing or bypassable role/owner check
- `arithmetic` → overflow, underflow, or precision loss

### `functionNames`
Array of one or more function names to target. **Must exist in the inspected contract.** Do not guess. Use names returned by `raze_inspect_project`.

### `attackHypothesis`
One sentence describing the suspected vulnerability. Be specific about the mechanism.
- Good: `"withdraw does not update the balance before the external call, enabling reentrant draining"`
- Bad: `"there might be a reentrancy issue"`

### `proofGoal`
What the Foundry test must demonstrate. Frame as an observable state or behavior.
- Good: `"show that an attacker can drain more than their deposited balance through a reentrant withdraw call"`
- Bad: `"prove reentrancy"`

### `expectedOutcome`
What observable state change or contract behavior confirms the exploit.
- Good: `"attacker balance exceeds initial deposit after reentrant withdraw"`
- Bad: `"test passes"`

### `assertionKind`
Maps to `attackType`:
- `reentrancy` → always `reentrant-state-inconsistency`
- `access-control` → always `unauthorized-state-change`
- `arithmetic` → always `arithmetic-drift`

### `callerRole` (optional)
Who initiates the attack. Common values: `"attacker"`, `"unauthorized-user"`, `"non-owner"`.

### `targetStateVariable` (optional)
The state variable the exploit observes or corrupts. Use the exact variable name from the contract source.

### `sampleArguments` (optional)
Example arguments for the targeted function. Used to generate compileable test inputs.
Types: `string`, `number`, `boolean`.

## Valid example

```json
{
  "attackType": "access-control",
  "contractName": "Counter",
  "functionNames": ["mint"],
  "attackHypothesis": "mint is a privileged mutation path that lacks access control, allowing any caller to increase tracked state",
  "proofGoal": "show that an arbitrary caller can mutate tracked state through mint",
  "expectedOutcome": "the observable state changes after an unauthorized mint call",
  "callerRole": "attacker",
  "assertionKind": "unauthorized-state-change",
  "sampleArguments": [5]
}
```

## When Raze rejects a plan

Raze will reject a plan if:
- `functionNames` contains functions not found in the contract
- `contractName` does not resolve to a real contract in the project
- `attackType` and `assertionKind` are mismatched

**Recovery path:**
1. Call `raze_inspect_project` again and copy function names exactly from the response
2. Narrow `functionNames` to the single most targeted function
3. Confirm `assertionKind` matches `attackType` using the mapping above
4. Retry with the corrected plan

Do not ask Raze to derive the plan heuristically as a fallback in MCP mode — author the corrected plan yourself.
