import type { AttackAssessment, ForgeRunResult } from "./types.js";

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
