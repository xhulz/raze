import type {
  AttackAgent,
  AttackFinding,
  ContractAnalysis,
} from "../core/types";

/**
 * Detects unchecked arithmetic operations that may lead to overflow or underflow vulnerabilities.
 */
export class ArithmeticAgent implements AttackAgent {
  readonly type = "arithmetic" as const;

  /**
   * Scans the contract source for unchecked arithmetic mutations that could wrap around numeric boundaries.
   *
   * @param input - Parsed contract analysis containing source code, function names, and inherited signals.
   * @returns An array of findings describing potential arithmetic overflow or underflow vectors.
   */
  analyze(input: ContractAnalysis): AttackFinding[] {
    const findings: AttackFinding[] = [];
    const uncheckedMutation = input.source.match(
      /unchecked\s*\{[\s\S]*?(\+\+|--|\+=|-=|\*=)/,
    );
    const counterFunctions = input.functions.filter((name) =>
      ["increment", "decrement", "update", "rebalance", "setLimit"].includes(
        name,
      ),
    );

    if (uncheckedMutation) {
      findings.push({
        type: this.type,
        confidence: "high",
        description:
          "Unchecked arithmetic mutation detected in contract logic.",
        attackVector:
          "Caller drives arithmetic to wrap or underflow and pushes the contract into an invalid state.",
        suggestedTest:
          "Constrain fuzz inputs around numeric boundaries and assert that arithmetic invariants fail under unchecked math.",
        contract: input.contractName,
        functions: counterFunctions,
      });
    }

    return findings;
  }
}
