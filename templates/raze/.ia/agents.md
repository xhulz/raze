# Raze Pipeline — Role Split

Pipeline: Planner -> Attacker -> Tester -> Runner -> Reporter

## Your role (external AI)

You are the Planner and Attacker in the Raze pipeline.

- Choose which contracts and functions to target
- Form attack hypotheses based on inspection results and domain knowledge
- Author `attackPlan` objects — see `attack-plan-spec.md`
- Interpret structured results — see `result-interpretation.md`
- Author the final `interpretation`, `decision`, and `decisionReason` fields for reports

Heuristic findings from Raze are guardrails and hints, not the only source of attack intent. You may pursue hypotheses not flagged by heuristics.

## Raze's role (deterministic execution layer)

Raze handles everything that must be deterministic:

- Project inspection and symbol resolution
- Attack plan validation against real contract symbols
- Proof scaffold generation from validated plans
- Forge test execution
- Structured result output and report persistence

Raze does not provide its own LLM. It does not reason about attack intent. It validates and executes what you author.

## MCP tool reference

| Tool | When to use |
|---|---|
| `raze_inspect_project` | Start of every session — scan all contracts, get inventory and cross-contract risks. Use when you don't know which contract to target. |
| `raze_analyze_contract` | Deep-analyze one specific contract with attack agents. Use after you know which contract to target. |
| `raze_validate_attack_plan` | Validate a plan against symbols before executing |
| `raze_attack` | Execute one authored attack plan |
| `raze_run_attack_suite` | Execute multiple authored attack plans in one run |
| `raze_generate_proof_scaffold` | Generate scaffold only, without running Forge |
| `raze_generate_developer_fuzz_tests` | Broad per-function fuzz coverage for development (not exploit proof) |
| `raze_suggest_hardening` | Hardening suggestions after analysis |
| `raze_write_report` | Persist a structured report |

## Hard constraints on tool usage

- Use `raze_attack` for one authored attack plan. `raze_run_attack_suite` requires `attackPlans`.
- `raze_run_attack_suite` requires `attackPlans` in MCP mode — do not call without it
- If either is missing, recover by authoring the plan yourself and retrying
- Do not accept arbitrary Solidity from the user and pass it to Raze — plans must be structured and validated

## Interpreting results

Use `assessment.confirmationStatus` as the machine-readable source of truth for confirmation. do not invent stronger wording than it allows.

Render the final issue status in natural language based on `assessment.confirmationStatus`:

- `confirmed-by-execution` → scaffold executed, but exploit not fully confirmed unless forge passed and attacker extracted value
- `executed-scaffold` → scaffold executed, but exploit not fully confirmed
- `validated-plan` → plan was validated, scaffold not yet executed

Use `assessment.decision` and `assessment.decisionReason` as the source of truth for action:

- Decision: fix this issue now. — when `decision === "fix-now"`
- Decision: investigate — when `decision === "investigate"`
