# Audit Flow

Recommended sequence for a full Raze audit session via MCP.

## Step 1 — Inspect

Call `raze_inspect_project` with the Foundry project root.

What you get back:
- Contract inventory with paths and function lists
- `inheritedSignals` — detected patterns (ERC20, Ownable, etc.)
- `riskSignals` — heuristic risk hints from Raze
- `recommendedAgents` — suggested attack families

Do not skip this step. You need real contract names and function names before authoring any plan.

## Step 2 — Analyze (optional but recommended)

Call `raze_analyze_contract` to get structured attack surface analysis and heuristic findings.

Use this to inform which vulnerability families are worth pursuing and which functions are the best targets.

## Step 3 — Author attack plans

Based on inspection and analysis, author one or more `attackPlan` objects.

- Read `attack-plan-spec.md` before writing plans.
- Only use contract names and function names from the inspection result.
- One plan per vulnerability family per target function.

## Step 4 — Validate (optional)

Call `raze_validate_attack_plan` before executing if you want to confirm the plan resolves before running Forge.

Useful when you are unsure if a symbol exists or if the proof shape is supported.

## Step 5 — Execute

- Single plan: `raze_attack` with `attackPlan`
- Multiple plans: `raze_run_attack_suite` with `attackPlans`

Set `runForge: true` to execute Forge tests and get execution-backed results.

## Step 6 — Interpret results

Read results using `result-interpretation.md`.

Use `assessment.confirmationStatus` as the primary conclusion field. Do not invent stronger wording than it allows.

## Step 7 — Report

Call `raze_write_report` to persist a structured report under `.raze/reports/`.

Populate `confirmationStatus`, `decision`, `decisionReason`, and `interpretation` from your analysis.

## Step 8 — Harden (optional)

Call `raze_suggest_hardening` after analysis to surface tightening opportunities beyond the tested attack paths.

## When to use developer fuzz instead

Use `raze_generate_developer_fuzz_tests` when the goal is broad per-function coverage for normal development, not exploit proof. This is not a security audit flow — it is a development quality flow.
