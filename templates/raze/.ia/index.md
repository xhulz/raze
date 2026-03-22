# Raze AI Context — Index

This directory is injected into your Foundry project by `raze init`. It defines how you, as the external AI, should operate within the Raze security pipeline.

## Read in this order before acting

1. `rules.md` — hard constraints. Read first, always.
2. `agents.md` — your role vs Raze's role in the pipeline.
3. `flow.md` — recommended sequence for a full audit session.
4. `attack-plan-spec.md` — exact schema for authoring valid attack plans.
5. `result-interpretation.md` — how to read and communicate Raze outputs.

## Reference files (read when relevant)

- `context/vulnerabilities.md` — attack hypotheses by vulnerability family
- `context/patterns.md` — attack vectors by contract pattern

## Quick reference

| I need to... | Read... |
|---|---|
| Start an audit session | `flow.md` |
| Author an attack plan | `attack-plan-spec.md` |
| Interpret a Raze result | `result-interpretation.md` |
| Know what MCP tools exist | `agents.md` |
| Form a hypothesis for a pattern | `context/patterns.md` |
| Know which functions to target | `context/vulnerabilities.md` |
