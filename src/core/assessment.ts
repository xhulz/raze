import type { AttackAssessment, GeneratedTest, ValidatedAttackPlan, ForgeRunResult, AttackFinding } from "./types.js";

interface AssessableResult {
  findings: AttackFinding[];
  validatedPlans: ValidatedAttackPlan[];
  generatedTests: GeneratedTest[];
  forgeRun?: ForgeRunResult;
}

function canExecutionConfirm(result: AssessableResult): boolean {
  return (
    result.generatedTests.length > 0 &&
    result.generatedTests.every(
      (test) =>
        test.findingType !== "reentrancy" ||
        (test.source.includes('require(attacker.reentryCount() == 1, "reentrant callback was not observed")') &&
          test.source.includes('require(address(attacker).balance > 1 ether, "attacker did not extract excess value")'))
    )
  );
}

export function buildAttackAssessment(result: AssessableResult): AttackAssessment {
  const findingStatus = result.findings.length > 0 ? "heuristic-findings" : "no-findings";
  const testStatus = result.generatedTests.length > 0 ? "proof-scaffolds-generated" : "no-tests";
  const executionStatus = result.forgeRun ? (result.forgeRun.ok ? "forge-passed" : "forge-failed") : "not-run";
  const confirmationStatus =
    result.generatedTests.length === 0
      ? result.validatedPlans.length > 0
        ? "validated-plan"
        : result.findings.length > 0
          ? "suspected-only"
          : "none"
      : !result.forgeRun
        ? result.validatedPlans.length > 0
          ? "validated-plan"
          : "suspected-only"
        : result.forgeRun.ok
          ? canExecutionConfirm(result)
            ? "confirmed-by-execution"
            : "executed-scaffold"
          : "validated-plan";

  let interpretation = "No concrete risk signals were detected by the current deterministic heuristics.";
  if (confirmationStatus === "confirmed-by-execution") {
    interpretation =
      "A validated attack plan was materialized into a proof scaffold and the resulting Forge run reproduced the targeted unsafe behavior. Treat this as execution-backed confirmation for the supported scaffold family.";
  } else if (confirmationStatus === "executed-scaffold") {
    interpretation =
      "A validated attack plan was materialized and the scaffold executed successfully, but this scaffold family is not strong enough to claim exploit confirmation by itself. Treat the result as an executed proof scaffold, not a fully confirmed exploit.";
  } else if (findingStatus === "heuristic-findings" && testStatus === "proof-scaffolds-generated" && executionStatus === "forge-failed") {
    interpretation =
      "Heuristic findings were identified and proof scaffolds were generated, but Forge execution failed. Review the generated tests and execution output before drawing conclusions.";
  } else if (confirmationStatus === "validated-plan") {
    interpretation =
      "Attack intent was validated against real project symbols and a supported proof shape, but execution has not yet confirmed the issue. Treat this as a validated plan, not a confirmed exploit.";
  } else if (findingStatus === "heuristic-findings") {
    interpretation =
      "Heuristic findings were identified. Review the generated output and attack rationale before treating them as confirmed vulnerabilities.";
  }

  let decision: AttackAssessment["decision"] = "no-action";
  let decisionReason = "No confirmed issue was reproduced in this run.";

  if (confirmationStatus === "confirmed-by-execution") {
    decision = "fix-now";
    decisionReason = "Raze reproduced the unsafe behavior in execution.";
  } else if (confirmationStatus === "executed-scaffold" || confirmationStatus === "validated-plan") {
    decision = "investigate";
    decisionReason = "There is validated attack evidence, but the issue is not fully confirmed by execution yet.";
  } else if (confirmationStatus === "suspected-only") {
    decision = "review";
    decisionReason = "Heuristic findings suggest risk, but no validated execution-backed proof exists yet.";
  }

  return {
    findingStatus,
    testStatus,
    executionStatus,
    confirmationStatus,
    decision,
    decisionReason,
    interpretation
  };
}
