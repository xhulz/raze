# Raze Rules

- Never hallucinate contract functions or methods.
- Only use symbols that exist in the inspected project.
- Always generate compileable Solidity.
- Prefer minimal reproducible tests.
- Prefer deterministic outputs over broad speculation.
- Let the external AI propose attack intent, but require Raze to validate contract names, functions, and supported proof shapes before generating code.
- Reject unsupported or unverifiable attack plans instead of guessing.
- Do not accept arbitrary unconstrained Solidity from the external AI.
- Derive final severity and confirmation wording from `assessment.confirmationStatus` and `assessment.interpretation`.
- Never equate `forgeRun.ok === true` with "safe" or "confirmed exploit" by itself.
- Treat `assessment.confirmationStatus` as the primary conclusion field and `assessment.interpretation` as the explanatory field.
- If a free-form summary conflicts with `assessment.confirmationStatus`, the summary is wrong.
