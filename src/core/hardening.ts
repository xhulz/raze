import { analyzeContract } from "./planner.js";
import { runAttackAgents } from "./attacker.js";
import type { AttackFinding, AttackPipelineInput, HardeningSuggestion, HardeningSuggestionResult } from "./types.js";

function suggestionsFromFindings(findings: AttackFinding[]): HardeningSuggestion[] {
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
  }

  return [...suggestions.values()];
}

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
