import type { AttackAgent, AttackFinding, ContractAnalysis } from "../core/types";

const PRIVILEGED_FUNCTIONS = ["mint", "burn", "pause", "upgrade", "setOwner", "setAdmin"];

/**
 * Detects missing or weak access control on privileged state-changing functions.
 */
export class AccessControlAgent implements AttackAgent {
  readonly type = "access-control" as const;

  /**
   * Checks for privileged functions lacking explicit guards and for unsafe tx.origin authorization patterns.
   *
   * @param input - Parsed contract analysis containing source code, function names, and inherited signals.
   * @returns An array of findings describing access control weaknesses.
   */
  analyze(input: ContractAnalysis): AttackFinding[] {
    const findings: AttackFinding[] = [];
    const privileged = input.functions.filter((name) => PRIVILEGED_FUNCTIONS.includes(name));
    const hasExplicitGuard =
      input.source.includes("onlyOwner") ||
      input.source.includes("onlyRole") ||
      input.inheritedSignals.includes("Ownable") ||
      input.inheritedSignals.includes("AccessControl");

    if (privileged.length > 0 && !hasExplicitGuard) {
      findings.push({
        type: this.type,
        confidence: "high",
        description: "Privileged state-changing functions were detected without strong access control signals.",
        attackVector: "An unprivileged caller invokes admin-like functions and mutates protected state.",
        suggestedTest: "Call the privileged function from an arbitrary address and assert that the mutation succeeds unexpectedly.",
        contract: input.contractName,
        functions: privileged
      });
    }

    if (input.source.includes("tx.origin")) {
      findings.push({
        type: this.type,
        confidence: "medium",
        description: "Authorization appears to depend on tx.origin, which is unsafe and phishing-prone.",
        attackVector: "An attacker routes the victim through an intermediate contract so tx.origin stays privileged.",
        suggestedTest: "Invoke the protected action through an attacker contract and assert that origin-based authorization still passes.",
        contract: input.contractName,
        functions: input.functions
      });
    }

    return findings;
  }
}
