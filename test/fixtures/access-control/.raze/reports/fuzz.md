# Raze Fuzz Report

## Assessment

- Finding status: heuristic-findings
- Test status: proof-scaffolds-generated
- Execution status: forge-passed
- Interpretation: Heuristic findings were identified, proof scaffolds were generated, and the generated test suite executed successfully. This is not equivalent to a confirmed exploit by itself.

## Heuristic Findings

## 1. access-control

- Contract: Token
- Confidence: high
- Description: Privileged state-changing functions were detected without strong access control signals.
- Attack vector: An unprivileged caller invokes admin-like functions and mutates protected state.
- Suggested proof strategy: Call the privileged function from an arbitrary address and assert that the mutation succeeds unexpectedly.
- Functions: mint

## Generated Proof Scaffolds

- test/raze/Token.access_control.t.sol (access-control, proof scaffold)

## Forge Run

- Command: `forge test --offline --root /Users/marcosschulz/Documents/Code/IA/AUDIT/test/fixtures/access-control`
- Execution success: true
- Exit code: 0
