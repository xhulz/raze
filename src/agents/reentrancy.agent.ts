import type { AttackAgent, AttackFinding, ContractAnalysis } from "../core/types";

/**
 * Detects reentrancy vulnerabilities by matching external call patterns against state mutations without guards.
 */
export class ReentrancyAgent implements AttackAgent {
  readonly type = "reentrancy" as const;

  /**
   * Scans the contract source for external value transfers that precede balance mutations without reentrancy protection.
   *
   * @param input - Parsed contract analysis containing source code, function names, and inherited signals.
   * @returns An array of findings describing potential reentrancy attack vectors.
   */
  analyze(input: ContractAnalysis): AttackFinding[] {
    const findings: AttackFinding[] = [];
    const externalCall = input.source.match(/call\s*\{[^}]*value\s*:/) || input.source.match(/\.call\s*\(/);
    const mutatesBalance = input.source.match(/balances?\s*\[/) || input.source.match(/mapping\s*\(.*=>.*\)\s*public\s+\w+/);
    const hasGuard = input.source.includes("nonReentrant") || input.inheritedSignals.includes("ReentrancyGuard");

    if (externalCall && mutatesBalance && !hasGuard) {
      findings.push({
        type: this.type,
        confidence: "high",
        description: "External value transfer appears reachable before reentrancy protection is applied.",
        attackVector: "Attacker re-enters the withdrawal path before internal accounting is finalized.",
        suggestedTest: "Deploy a malicious receiver that re-enters the target withdrawal function until balances diverge.",
        contract: input.contractName,
        functions: input.functions.filter((name) => ["withdraw", "claim", "execute"].includes(name))
      });
    }

    return findings;
  }
}
