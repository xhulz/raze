# raze

Raze is an open-source, AI-orchestrated smart contract security tool for Foundry projects.

It is built for developers who want to explore, validate, and prove smart contract security issues with their existing AI, without giving up deterministic execution.

Raze does not ship its own LLM. Instead, it works with your existing AI through MCP and gives that AI a deterministic execution layer for:

- project inspection
- attack validation
- deterministic proof scaffolding
- Foundry execution
- developer fuzz generation
- structured reporting

The external AI can then:

- analyze a contract
- propose attack hypotheses
- choose proof goals
- call Raze tools to validate and execute those ideas

Raze helps turn smart contract security reasoning into validated, executable proof, and it is being built in the open from day one.

No API key is required. No Docker is used.

## Install

```bash
npm install raze
```

For local development in this repository:

```bash
npm install
npm run build
```

## Internal Development System

This repository also contains an internal `.ia/` directory used to help Codex, Cursor, and Claude build Raze consistently.

- it is local and file-based
- it is not part of the product runtime
- it defines routing, retrieval, memory, and specialized agent instructions for development work
- it is separate from the runtime context that `raze init` generates for user projects

## Bootstrap

Run `init` inside a Foundry project:

```bash
npx raze init
```

That command:

- detects Node.js and Foundry
- detects supported MCP-capable environments
- scaffolds `.raze/`
- configures MCP for supported editors with safe backups

Expected output:

```text
✔ Environment ready
✔ MCP configured for Cursor

You can now ask:
"analyze this smart contract"
```

## CLI

```bash
raze init [path]
raze doctor [path]
raze fuzz [path] [--contract <path-or-name>] [--run]
raze dev-fuzz [path] [--contract <path-or-name>] [--function <name>]
```

`raze fuzz` is the fallback mode when the tool is not being called over MCP. It keeps the heuristic-first path available for local and CI usage.

Quick examples:

```bash
raze init
raze doctor
raze fuzz . --contract Counter --run --offline
raze dev-fuzz . --contract Counter
raze dev-fuzz . --contract Counter --function mint
```

CLI usage guidance:

- `raze init` bootstraps `.raze/` and editor MCP configuration.
- `raze doctor` checks the local Raze version, Foundry, MCP config paths, build output, and whether `.raze/.ia` is initialized in the target project.
- `raze fuzz` is the local fallback path when you want Raze to derive heuristic attack plans outside MCP.
- `raze dev-fuzz` is the local developer workflow for generating broad deterministic Foundry fuzz tests per function.
- ASCII branding is intentionally deferred until after this functional v1 closeout.

## Golden Paths

If you want to audit a contract:

1. Run `raze init` in the Foundry project.
2. Use MCP with `raze_attack` for one authored plan or `raze_run_attack_suite` for multiple authored plans.
3. Read the final result from `assessment.decision`, `assessment.decisionReason`, and `assessment.confirmationStatus`.

If you want to generate fuzz tests as a developer:

1. Run `raze dev-fuzz . --contract <ContractName>`.
2. Review the generated files under `test/raze/`.
3. Run `forge test --offline` or `raze fuzz . --run --offline` to execute locally.

If you want to harden a contract after analysis:

1. Use `raze_suggest_hardening` after inspection or attack execution.
2. Apply the recommended remediation for the confirmed or investigated issue.
3. Add the suggested follow-up test so the unsafe behavior stays covered.

## MCP

The primary interface is the MCP server at:

```text
dist/src/interfaces/mcp/server.js
```

It exposes:

- `raze_inspect_project`
- `raze_validate_attack_plan`
- `raze_generate_proof_scaffold`
- `raze_generate_developer_fuzz_tests`
- `raze_suggest_hardening`
- `raze_run_attack_suite`
- `raze_attack`
- `raze_analyze_contract`
- `raze_run_fuzz_tests`
- `raze_write_report`

VS Code/Codex requires MCP tool names to contain only `[a-z0-9_-]`, so Raze uses `snake_case` tool names.

`raze_attack` remains a compatibility wrapper. The preferred MCP flow is staged:

1. inspect or analyze
2. let the user's AI propose an attack plan
3. validate that plan against real symbols
4. generate a deterministic proof scaffold
5. run Foundry
6. persist a structured report

In MCP mode, `raze_attack` requires an authored `attackPlan`. It does not silently fall back to heuristic plan derivation.

`raze_run_attack_suite` is the multi-plan variant:

- preferred mode: the external AI supplies multiple authored `attackPlans`
- in MCP mode, `attackPlans` are required
- heuristic sweep remains a CLI/local fallback behavior, not the primary MCP meaning
- results are organized per authored plan first, with family summary as secondary metadata

## How To Read MCP Results

Use these fields as the interpretation contract:

- `analysisSource`
- `hypothesisStatus`
- `proofStatus`
- `assessment.confirmationStatus`
- `assessment.decision`
- `assessment.decisionReason`
- `assessment.interpretation`

Rules:

- `assessment.confirmationStatus` is the source of truth for conclusion wording
- `assessment.decision` is the source of truth for the short human action line
- `assessment.interpretation` elaborates, but does not override the status
- `forgeRun.ok === true` never means “safe” by itself
- `forgeRun.ok === true` never means “confirmed exploit” unless `confirmationStatus` is `confirmed-by-execution`
- prefer a short natural-language final status line over repeating raw field names verbatim

Examples:

- `fix-now` -> “Fix this issue.”
- `investigate` -> “Investigate before treating this as fixed or safe.”
- `executed-scaffold` -> “The proof scaffold executed successfully, but the exploit is not fully confirmed.”
- `confirmed-by-execution` -> “The unsafe behavior is confirmed by execution.”

## Prompt Examples

Use these as copy-paste starting points in Cursor, Claude Desktop, or Codex.

Single authored attack:

```text
Call raze_attack with this exact input and summarize the result using the structured fields:

{
  "projectRoot": "/path/to/project",
  "contractSelector": "Counter",
  "runForge": true,
  "offline": true,
  "attackPlan": {
    "attackType": "access-control",
    "contractName": "Counter",
    "functionNames": ["mint"],
    "attackHypothesis": "mint is a privileged mutation path that lacks access control",
    "proofGoal": "show that an arbitrary caller can mutate tracked state through mint",
    "expectedOutcome": "the observable state changes after an unauthorized mint call",
    "callerRole": "attacker",
    "assertionKind": "unauthorized-state-change",
    "sampleArguments": [5]
  }
}
```

AI-authored multi-plan suite:

```text
Call raze_run_attack_suite with this exact input and summarize the result per plan first, family summary second:

{
  "projectRoot": "/path/to/project",
  "contractSelector": "Counter",
  "runForge": true,
  "offline": true,
  "attackPlans": [
    {
      "attackType": "access-control",
      "contractName": "Counter",
      "functionNames": ["mint"],
      "attackHypothesis": "mint is a privileged mutation path that lacks access control",
      "proofGoal": "show that an arbitrary caller can mutate tracked state through mint",
      "expectedOutcome": "the observable state changes after an unauthorized mint call",
      "callerRole": "attacker",
      "assertionKind": "unauthorized-state-change",
      "sampleArguments": [5]
    }
  ]
}
```

Developer fuzz generation:

```text
Use raze_generate_developer_fuzz_tests with this input and summarize the selected fuzz families, generated test files, and skipped functions:

{
  "projectRoot": "/path/to/project",
  "contractSelector": "Counter"
}
```

Hardening suggestions:

```text
Use raze_suggest_hardening with this input and summarize the security-focused remediations, behavior changes, and follow-up tests:

{
  "projectRoot": "/path/to/project",
  "contractSelector": "Counter"
}
```

MCP attack flows require authored plans. If `raze_attack` or `raze_run_attack_suite` is called without `attackPlan` or `attackPlans`, Raze will return a structured recovery error instead of silently falling back.

Interpret `confirmationStatus` directly:

- `confirmed-by-execution` -> say the issue is confirmed by execution
- `executed-scaffold` -> say the scaffold executed, but the exploit is not fully confirmed
- never infer final severity from `forgeRun.ok` alone

## Project layout

```text
.ia/
  agents/
  retrieval/
  memory/
  flows/
  context/
templates/
  raze/
    context/
src/
  agents/
  core/
  interfaces/
  utils/
```

## Internal Vs Runtime

- `.ia/` is internal to this repository and supports the development workflow of Raze itself.
- `.raze/` is generated by `raze init` inside the consumer project and holds runtime context and reports.
- consumer projects should not receive the internal `.ia/` system.

## Runtime Layout

`raze init` generates:

```text
.raze/
  .ia/
    agents.md
    rules.md
    result-interpretation.md
    context/
      vulnerabilities.md
      patterns.md
  reports/
```

The files under `.raze/.ia/` are runtime context for the external AI. They describe how the AI should collaborate with Raze:

- the AI proposes hypotheses and proof intent
- Raze validates symbols and supported proof shapes
- Raze rejects hallucinated functions and unsupported plans
- Raze never accepts arbitrary unconstrained Solidity from the AI
- final vulnerability wording must come from structured result fields, not from “Forge passed” alone

For MCP consumers, the interpretation contract is:

- inspect `analysisSource`, `hypothesisStatus`, `proofStatus`, `assessment.confirmationStatus`, and `assessment.interpretation`
- use `assessment.confirmationStatus` as the source of truth for conclusion wording
- never treat `forgeRun.ok === true` as meaning “safe” or “confirmed exploit” by itself

Recommended phrasing:

- `confirmed-by-execution` -> “confirmed by execution”
- `executed-scaffold` -> “executed scaffold, not fully confirmed exploit”
- `validated-plan` -> “validated hypothesis/plan”
- `suspected-only` -> “heuristically suspected”

## Scope

Raze v1 targets Foundry projects only and focuses on three vulnerability classes:

- reentrancy
- access control
- arithmetic issues
