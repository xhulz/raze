# Result Interpretation

Use `assessment.confirmationStatus` as the source of truth for final vulnerability wording.
Use `assessment.decision` and `assessment.decisionReason` as the source of truth for the short human action line.
Use `assessment.interpretation` to elaborate, not to override the status.
Prefer a short natural-language final status line over repeating raw field names.

## Decision Map

- `fix-now`
  - Allowed: "fix this issue", "fix now"
  - Example: "Decision: fix this issue now."

- `investigate`
  - Allowed: "investigate", "investigate before treating as fixed or safe"
  - Example: "Decision: investigate before treating this as fixed or safe."

- `review`
  - Allowed: "review this risk signal", "review later"
  - Example: "Decision: review this risk signal."

- `no-action`
  - Allowed: "no immediate action", "no issue to act on"
  - Example: "Decision: no immediate action."

## Status Map

- `none`
  - Allowed: "no confirmed issue", "no supported issue identified"
  - Prohibited: "safe because Forge passed", "confirmed exploit"
  - Example: "No confirmed issue was produced by this run."

- `suspected-only`
  - Allowed: "heuristically suspected", "risk flagged by heuristics"
  - Prohibited: "confirmed", "proven", "reproduced"
  - Example: "The issue is heuristically suspected, but not validated or execution-confirmed."

- `validated-plan`
  - Allowed: "validated hypothesis", "validated attack plan"
  - Prohibited: "confirmed by execution", "proven exploit"
  - Example: "The attack plan is validated against real symbols, but not execution-confirmed."

- `executed-scaffold`
  - Allowed: "executed scaffold", "executed proof scaffold, not fully confirmed"
  - Prohibited: "confirmed exploit", "safe because tests passed"
  - Example: "The proof scaffold executed successfully, but the exploit is not fully confirmed."

- `confirmed-by-execution`
  - Allowed: "confirmed by execution", "execution-backed confirmation"
  - Prohibited: "only suspected", "only scaffolded"
  - Example: "The unsafe behavior is confirmed by execution for this scaffold family."

## Preferred Final Status Style

- Prefer: "Final issue status: confirmed by execution."
- Prefer: "Final issue status: the proof scaffold executed successfully, but the exploit is not fully confirmed."
- Avoid: "assessment.confirmationStatus: confirmed-by-execution"
- Avoid: "assessment.interpretation: ..."

## Failure Modes To Avoid

- `forgeRun.ok === true` does not mean the contract is safe.
- `forgeRun.ok === true` does not mean the exploit is confirmed unless `confirmationStatus` is `confirmed-by-execution`.
- If a free-form summary conflicts with `confirmationStatus`, the summary is wrong.
