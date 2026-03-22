import type { AttackAssessment, AttackFinding, Confidence, GeneratedTest, ForgeRunResult } from "./types.js";

export function describeVerdictSummary(assessment: AttackAssessment, findings: AttackFinding[]): string {
  const count = findings.length;
  const noun = count === 1 ? "vulnerability was" : "vulnerabilities were";
  switch (assessment.confirmationStatus) {
    case "confirmed-by-execution":
      return `${count} ${noun} confirmed by execution — fix immediately.`;
    case "executed-scaffold":
      return `${count} potential ${noun} reproduced by the proof scaffold — review before shipping.`;
    case "validated-plan":
      return count > 0
        ? `${count} potential ${noun} identified — run Forge to confirm.`
        : "A potential vulnerability was identified — run Forge to confirm.";
    case "suspected-only":
      return "Suspicious patterns found — author an attack plan to investigate further.";
    default:
      return "No vulnerabilities were found in this analysis.";
  }
}

export function interpretForgeResult(forgeRun: ForgeRunResult | undefined): string {
  if (!forgeRun) return "Forge was not run in this analysis.";
  const s = forgeRun.summary;
  if (forgeRun.ok) {
    if (s) return `All tests passed — ${s.passed} passed, ${s.failed} failed. If the scaffold test passed, the vulnerability is still exploitable.`;
    return "Forge completed successfully.";
  }
  if (s && s.failed > 0) {
    return `Forge ran — ${s.passed} passed, ${s.failed} failed. The proof scaffold test reverted. If a fix was recently applied, this is the expected outcome — the vulnerability is no longer exploitable. Run with \`-vv\` to see the revert message.`;
  }
  if (s && s.failed === 0 && s.passed > 0) {
    return `Forge returned exit code ${forgeRun.exitCode} but ${s.passed} tests passed and none failed. The scaffold may have failed to compile or had a runtime error outside test logic. Run manually with \`-vv\` to see details.`;
  }
  return `Forge returned exit code ${forgeRun.exitCode}. Run manually with \`-vv\` to see details.`;
}

export function deriveSeverity(confidence: Confidence, decision: AttackAssessment["decision"]): string {
  if (confidence === "high" && decision === "fix-now") return "CRITICAL";
  if (confidence === "high") return "HIGH";
  if (confidence === "medium" && (decision === "fix-now" || decision === "investigate")) return "MEDIUM";
  if (confidence === "low") return "LOW";
  return "INFORMATIONAL";
}

export function formatSummaryBlock(
  findings: AttackFinding[],
  assessment: AttackAssessment,
  generatedTests: GeneratedTest[]
): string {
  const severity = findings.length > 0
    ? deriveSeverity(findings[0].confidence, assessment.decision)
    : "INFORMATIONAL";

  const confirmedFindings = findings.filter((f) =>
    generatedTests.some((t) => t.findingType === f.type)
  );

  const confirmedLine = confirmedFindings.length > 0
    ? confirmedFindings
        .map((f) => `${f.contract}.${f.functions[0] ?? "?"} (${f.type}, ${deriveSeverity(f.confidence, assessment.decision).toLowerCase()})`)
        .join(", ")
    : "none";

  const decisionLabel = assessment.decision === "fix-now"
    ? `fix-now — ${confirmedFindings.length} issue(s) confirmed`
    : assessment.decision;

  const next = describeNextStep(assessment.confirmationStatus);

  return `## Summary

- Decision: ${decisionLabel}
- Severity: ${severity}
- Confirmed: ${confirmedLine}
- Next: ${next}
`;
}

export function describeNextStep(confirmationStatus: AttackAssessment["confirmationStatus"]): string {
  switch (confirmationStatus) {
    case "confirmed-by-execution":
      return "Harden the affected contract path and add a regression test that preserves the reproduced proof.";
    case "executed-scaffold":
      return "Strengthen the scaffold or add a tighter assertion before treating this as a confirmed exploit.";
    case "validated-plan":
      return "Run Forge against the generated scaffold to move from a validated plan to an execution-backed result.";
    case "suspected-only":
      return "Convert the heuristic suspicion into an authored plan and generate a proof scaffold.";
    default:
      return "No confirmed issue was reproduced in this run. Review the heuristic hints and decide whether to author a deeper plan.";
  }
}

export function describeConfirmationStatus(status: AttackAssessment["confirmationStatus"]): string {
  switch (status) {
    case "confirmed-by-execution":
      return "confirmed by execution";
    case "executed-scaffold":
      return "executed scaffold, not fully confirmed exploit";
    case "validated-plan":
      return "validated plan, not yet execution-confirmed";
    case "suspected-only":
      return "heuristically suspected only";
    default:
      return "no confirmed issue";
  }
}

export function describeDecision(decision: AttackAssessment["decision"]): string {
  switch (decision) {
    case "fix-now":
      return "fix this issue now";
    case "investigate":
      return "investigate before treating as fixed or safe";
    case "review":
      return "review this risk signal";
    default:
      return "no immediate action";
  }
}

export function formatFinalStatusBlock(assessment: AttackAssessment): string {
  return `- Decision: ${assessment.decision}
- Why: ${assessment.decisionReason}
- Finding status: ${assessment.findingStatus}
- Test status: ${assessment.testStatus}
- Execution status: ${assessment.executionStatus}
- Confirmation status: ${assessment.confirmationStatus}
- Interpretation: ${assessment.interpretation}
- Next step: ${describeNextStep(assessment.confirmationStatus)}`;
}

export function formatExecutionSummaryBlock(
  forgeRun: ForgeRunResult | undefined,
  generatedTestsInRun: number,
  note: string
): string {
  if (!forgeRun) {
    return `## Execution Result

- Not executed
- Generated tests in this run: ${generatedTestsInRun}
`;
  }

  return `## Execution Result

- Command: \`${forgeRun.command}\`
- Execution success: ${forgeRun.ok}
- Exit code: ${forgeRun.exitCode}
- Generated tests in this run: ${generatedTestsInRun}
- Overall Forge totals: ${
    forgeRun.summary ? `${forgeRun.summary.passed} passed, ${forgeRun.summary.failed} failed, ${forgeRun.summary.skipped} skipped` : "not parsed from Forge output"
  }
- Note: ${note}
`;
}
