import type {
  AttackAssessment,
  AttackFinding,
  Confidence,
  ForgeRunResult,
} from "./types";

/**
 * Produces a human-readable one-line verdict summary based on the assessment confirmation status and finding count.
 *
 * @param assessment - The computed attack assessment with confirmation status and decision.
 * @param findings - Array of attack findings used to determine the count in the summary.
 * @returns A single-sentence verdict summary string.
 */
export function describeVerdictSummary(
  assessment: AttackAssessment,
  findings: AttackFinding[],
): string {
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

/**
 * Interprets a Forge test run result into a human-readable explanation of what the outcome means.
 *
 * @param forgeRun - The Forge run result, or undefined if Forge was not executed.
 * @returns Descriptive string explaining the Forge execution outcome.
 */
export function interpretForgeResult(
  forgeRun: ForgeRunResult | undefined,
): string {
  if (!forgeRun) return "Forge was not run in this analysis.";
  const s = forgeRun.summary;
  if (forgeRun.ok) {
    if (s)
      return `All tests passed — ${s.passed} passed, ${s.failed} failed. If the scaffold test passed, the vulnerability is still exploitable.`;
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

/**
 * Derives a severity label (CRITICAL, HIGH, MEDIUM, LOW, INFORMATIONAL) from confidence level and assessment decision.
 *
 * @param confidence - The confidence level of the finding (high, medium, or low).
 * @param decision - The assessment decision (fix-now, investigate, review, or no-action).
 * @returns Severity label string.
 */
export function deriveSeverity(
  confidence: Confidence,
  decision: AttackAssessment["decision"],
): string {
  if (confidence === "high" && decision === "fix-now") return "CRITICAL";
  if (confidence === "high") return "HIGH";
  if (
    confidence === "medium" &&
    (decision === "fix-now" || decision === "investigate")
  )
    return "MEDIUM";
  if (confidence === "low") return "LOW";
  return "INFORMATIONAL";
}

/**
 * Describes the recommended next action based on the current confirmation status of the assessment.
 *
 * @param confirmationStatus - The confirmation status from the attack assessment.
 * @returns Human-readable instruction string for the next step.
 */
export function describeNextStep(
  confirmationStatus: AttackAssessment["confirmationStatus"],
): string {
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

/**
 * Converts an assessment decision enum value into a short human-readable action phrase.
 *
 * @param decision - The assessment decision (fix-now, investigate, review, or no-action).
 * @returns Short phrase describing what to do (e.g., "fix this issue now").
 */
export function describeDecision(
  decision: AttackAssessment["decision"],
): string {
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

/**
 * Formats a Markdown block summarizing the Forge execution result for inclusion in reports.
 *
 * @param forgeRun - The Forge run result, or undefined if not executed.
 * @param generatedTestsInRun - Number of test files generated in the current run.
 * @param note - Contextual note to append to the execution summary block.
 * @returns Formatted Markdown string with the execution summary.
 */
export function formatExecutionSummaryBlock(
  forgeRun: ForgeRunResult | undefined,
  generatedTestsInRun: number,
  note: string,
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
    forgeRun.summary
      ? `${forgeRun.summary.passed} passed, ${forgeRun.summary.failed} failed, ${forgeRun.summary.skipped} skipped`
      : "not parsed from Forge output"
  }
- Note: ${note}
`;
}
