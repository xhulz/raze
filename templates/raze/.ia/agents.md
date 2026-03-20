# Raze Runtime Context

Planner -> Attacker -> Tester -> Runner -> Reporter

Raze does not provide its own LLM. The external AI is expected to drive the reasoning loop.

- Planner: the external AI chooses target contracts, attack hypotheses, and proof goals.
- Attacker: the external AI proposes concrete exploit ideas and caller roles.
- Tester: Raze validates those ideas against real symbols and turns supported plans into deterministic Foundry proof scaffolds.
- Runner: Raze executes `forge test` when requested.
- Reporter: Raze writes reproducible outputs under `.raze/reports/`.

Heuristic findings from Raze are guardrails and hints. They are not the only source of attack intent.

When summarizing MCP results, keep these sections separate:

- heuristic hints from Raze
- validated attack plans
- generated proof scaffolds
- Forge execution results
- final issue status in natural language

Final conclusions must come from structured result fields, not free-form intuition. Always inspect:

- `analysisSource`
- `hypothesisStatus`
- `proofStatus`
- `assessment.confirmationStatus`
- `assessment.decision`
- `assessment.decisionReason`
- `assessment.interpretation`

Use this confirmation mapping:

- `none` -> no confirmed issue
- `suspected-only` -> heuristic suspicion only
- `validated-plan` -> validated hypothesis or plan, not execution-confirmed
- `executed-scaffold` -> scaffold executed, but exploit not fully confirmed
- `confirmed-by-execution` -> execution-backed confirmation

Recommended phrasing:

- Use `assessment.decision` for the short human action line.
- Say "confirmed by execution" only for `confirmed-by-execution`.
- Say "executed scaffold" for `executed-scaffold`.
- Say "validated hypothesis" or "validated plan" for `validated-plan`.
- If `assessment.confirmationStatus` is present, do not invent stronger wording than it allows.
- If the scaffold or Forge result feels stronger than `confirmationStatus`, trust `confirmationStatus`.

For the final issue status section, prefer natural language over raw field dumps. Good examples:

- "Final issue status: confirmed by execution."
- "Final issue status: the proof scaffold executed successfully, but the exploit is not fully confirmed."
- "Final issue status: the attack plan is validated, but not yet execution-confirmed."
- "Decision: fix this issue now."
- "Decision: investigate before treating this as fixed or safe."

Common MCP patterns:

- Use `raze_attack` for one authored attack plan.
- Use `raze_run_attack_suite` for multiple authored attack plans in one run.
- Use `raze_generate_developer_fuzz_tests` when the developer wants broad per-function Foundry fuzz coverage rather than an exploit proof.
- Use `raze_suggest_hardening` after analysis when the developer asks how to reduce attack surface or tighten safety.

Do not call `raze_attack` or `raze_run_attack_suite` without authored plans. In MCP mode:

- `raze_attack` requires `attackPlan`
- `raze_run_attack_suite` requires `attackPlans`

If those fields are missing, recover by retrying with the required authored plan input rather than asking Raze to derive heuristic fallback behavior inside MCP.
