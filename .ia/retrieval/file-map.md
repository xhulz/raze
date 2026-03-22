# File Map

Maps task areas to exact source files.

## Core pipeline

| File | Responsibility |
|---|---|
| `src/core/types.ts` | Shared types across the pipeline |
| `src/core/pipeline.ts` | Pipeline stage sequencing |
| `src/core/orchestrator.ts` | Orchestration logic |
| `src/core/planner.ts` | Attack plan intake and normalization |
| `src/core/attacker.ts` | Symbol validation and attack materialization |
| `src/core/tester.ts` | Proof scaffold generation |
| `src/core/runner.ts` | Forge test execution |
| `src/core/reporter.ts` | Structured result reporting |
| `src/core/assessment.ts` | Security assessment logic |
| `src/core/attackSuite.ts` | Multi-attack suite coordination |
| `src/core/developerFuzz.ts` | Developer fuzz test generation |
| `src/core/hardening.ts` | Hardening suggestion logic |
| `src/core/presentation.ts` | Output formatting for reports |

## Attack agents

| File | Responsibility |
|---|---|
| `src/agents/reentrancy.agent.ts` | Reentrancy-specific attack logic |
| `src/agents/accessControl.agent.ts` | Access control attack logic |
| `src/agents/arithmetic.agent.ts` | Arithmetic vulnerability attack logic |

## CLI interface

| File | Responsibility |
|---|---|
| `src/interfaces/cli/index.ts` | CLI entry point and command registration |
| `src/interfaces/cli/init.ts` | Project initialization and bootstrap |
| `src/interfaces/cli/fuzz.ts` | Fuzz test runner command |
| `src/interfaces/cli/devFuzz.ts` | Developer fuzz generation command |
| `src/interfaces/cli/doctor.ts` | Environment diagnostics command |

## MCP interface

| File | Responsibility |
|---|---|
| `src/interfaces/mcp/server.ts` | MCP server setup |
| `src/interfaces/mcp/tools.ts` | MCP tool definitions and handlers |

## Utils

| File | Responsibility |
|---|---|
| `src/utils/detect.ts` | Foundry project detection |
| `src/utils/env.ts` | Environment variable access |
| `src/utils/exec.ts` | Shell command execution |
| `src/utils/logger.ts` | Logging utilities |

## Templates

- `templates/raze/` — scaffold templates for target Foundry projects (`.ia`, rules, context)
