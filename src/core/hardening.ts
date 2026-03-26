import { analyzeContract } from "./planner.js";
import { runAttackAgents } from "./attacker.js";
import type { AttackFinding, AttackPipelineInput, HardeningSuggestion, HardeningSuggestionResult } from "./types.js";

/**
 * Derives hardening suggestions from attack findings, mapping each finding type to a remediation recommendation.
 *
 * @param findings - Array of attack findings from heuristic agents.
 * @returns Array of hardening suggestions with titles, recommended changes, and follow-up test guidance.
 */
export function suggestionsFromFindings(findings: AttackFinding[]): HardeningSuggestion[] {
  const suggestions = new Map<string, HardeningSuggestion>();

  for (const finding of findings) {
    if (finding.type === "access-control") {
      suggestions.set("access-control", {
        title: "Add explicit authorization around privileged mutation paths",
        issue: finding.description,
        whyItMatters: "Privileged state-changing paths that stay publicly callable can let arbitrary actors mutate protected state.",
        recommendedChange: "Add an explicit authorization check or role gate before the privileged mutation path executes.",
        confidence: finding.confidence,
        behaviorChange: true,
        followUpTest: `Add a proof test that an unauthorized caller cannot invoke ${finding.functions[0] ?? "the privileged function"}.`
      });
    }

    if (finding.type === "arithmetic") {
      suggestions.set("arithmetic", {
        title: "Guard arithmetic mutation with explicit bounds",
        issue: finding.description,
        whyItMatters: "Unchecked or weakly constrained arithmetic can wrap, drift, or silently violate state assumptions.",
        recommendedChange: "Replace unchecked arithmetic with explicit bounds checks or safer accounting logic for the affected mutation path.",
        confidence: finding.confidence,
        behaviorChange: true,
        followUpTest: `Add a fuzz test proving ${finding.functions[0] ?? "the target function"} cannot underflow, overflow, or drift beyond its intended invariant.`
      });
    }

    if (finding.type === "reentrancy") {
      suggestions.set("reentrancy", {
        title: "Finalize internal accounting before external value transfer",
        issue: finding.description,
        whyItMatters: "External calls before internal state finalization can allow reentrant callbacks to reuse the vulnerable path.",
        recommendedChange: "Apply checks-effects-interactions ordering or an explicit reentrancy guard before the external call occurs.",
        confidence: finding.confidence,
        behaviorChange: true,
        followUpTest: `Keep a reentrancy proof test for ${finding.functions[0] ?? "the withdrawal path"} to show the callback can no longer extract excess value.`
      });
    }

    if (finding.type === "flash-loan") {
      suggestions.set("flash-loan", {
        title: "Add balance invariant checks around flash loan callbacks",
        issue: finding.description,
        whyItMatters: "Flash loan callbacks execute arbitrary logic inside a single transaction. Without invariant checks, an attacker can borrow large sums, distort contract state, and repay before the transaction reverts.",
        recommendedChange: "Record the contract's token balance or critical reserve state before delegating to the callback. Assert the invariant holds after the callback returns and before accepting repayment. Apply nonReentrant to all callback entry points.",
        confidence: finding.confidence,
        behaviorChange: true,
        followUpTest: `Add a proof test using a mock flash lender that shows ${finding.functions[0] ?? "the callback"} cannot be used to skew protected state within a single atomic transaction.`
      });
    }

    if (finding.type === "price-manipulation") {
      suggestions.set("price-manipulation", {
        title: "Replace spot price reads with TWAP or Chainlink feed with staleness check",
        issue: finding.description,
        whyItMatters: "Single-block AMM spot prices can be moved by a large swap in the same transaction, enabling attackers to feed manipulated prices to dependent logic — especially when combined with a flash loan.",
        recommendedChange: "Use a TWAP oracle (Uniswap V3 observe(), or a custom accumulator) with a minimum observation window of at least 15 minutes. If using Chainlink, validate updatedAt against block.timestamp with a staleness threshold. Never trust a single getReserves() call as a price source.",
        confidence: finding.confidence,
        behaviorChange: true,
        followUpTest: `Add a fuzz test that drives manipulated reserves into ${finding.functions[0] ?? "the price-consuming function"} and asserts the result stays within a tolerated band from the fair price baseline.`
      });
    }
  }

  return [...suggestions.values()];
}

/**
 * Analyzes a contract and produces hardening suggestions based on attack findings and risk signals.
 *
 * @param input - Object containing project root, optional contract selector, and optional pre-computed findings.
 * @returns Result with the analysis, findings, and actionable hardening suggestions.
 */
export async function suggestHardening(
  input: Pick<AttackPipelineInput, "projectRoot" | "contractSelector"> & {
    findings?: AttackFinding[];
  }
): Promise<HardeningSuggestionResult> {
  const analysis = await analyzeContract({
    projectRoot: input.projectRoot,
    contractSelector: input.contractSelector,
    executionContext: "mcp"
  });
  const findings = input.findings ?? runAttackAgents(analysis);
  const suggestions = suggestionsFromFindings(findings);

  if (analysis.riskSignals.includes("low-level-call") && !suggestions.some((suggestion) => suggestion.title.includes("Finalize internal accounting"))) {
    suggestions.push({
      title: "Review low-level calls for failure handling and call ordering",
      issue: "Low-level calls are present in the contract surface.",
      whyItMatters: "Low-level calls can widen attack surface and make failure behavior less obvious if not carefully ordered.",
      recommendedChange: "Document expected failure behavior and make sure external calls happen after critical internal effects when possible.",
      confidence: "medium",
      behaviorChange: false,
      followUpTest: "Add a regression test proving failed external calls do not leave partial state updates behind."
    });
  }

  return {
    projectRoot: input.projectRoot,
    analysis,
    findings,
    suggestions
  };
}
