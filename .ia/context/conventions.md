# Conventions

## Language & Build

- Strict TypeScript with `"module": "NodeNext"`
- ESM imports **without** `.js` extensions in source — `tsc-esm-fix` adds `.js` to compiled output automatically.
- Build: `tsc -p tsconfig.json && tsc-esm-fix --target dist`. Do not add `.js` to imports manually.

## Code Organization

- All exported functions must have TSDoc with `@param` and `@returns`
- Shared Solidity parsing helpers live in `src/core/solidity.ts` — do not duplicate regex or parser logic in individual modules
- MCP schemas live in `src/interfaces/mcp/schemas.ts`, tool definitions in `tools.ts`
- Types and interfaces live in `src/core/types.ts` — do not scatter type definitions across modules
- CLI and MCP stay thin over shared core logic — no business logic in interface layers

## Design Principles

- Deterministic, template-driven outputs
- External AI may propose attack plans, but Raze validates and normalizes them before code generation
- No dead code — remove unused functions, schemas, and imports promptly
