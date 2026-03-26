import type { AttackAssessment, CrossContractFinding, GeneratedTest, ValidatedAttackPlan, ForgeRunResult, AttackFinding } from "./types.js";

interface AssessableResult {
  findings: AttackFinding[];
  validatedPlans: ValidatedAttackPlan[];
  generatedTests: GeneratedTest[];
  forgeRun?: ForgeRunResult;
  crossContractFindings?: CrossContractFinding[];
  targetContractName?: string;
}

function canExecutionConfirm(result: AssessableResult): boolean {
  return (
    result.generatedTests.length > 0 &&
    result.generatedTests.every(
      (test) =>
        test.findingType !== "reentrancy" ||
        (test.source.includes('require(attacker.reentryCount() == 2, "reentrant callback was not observed")') &&
          test.source.includes('require(address(attacker).balance > 1 ether, "attacker did not extract excess value")'))
    )
  );
}

export function buildAttackAssessment(result: AssessableResult): AttackAssessment {
  const findingStatus = result.findings.length > 0 ? "heuristic-findings" : "no-findings";
  const testStatus = result.generatedTests.length > 0 ? "proof-scaffolds-generated" : "no-tests";
  const executionStatus = result.forgeRun ? (result.forgeRun.ok ? "forge-passed" : "forge-failed") : "not-run";
  let confirmationStatus: AttackAssessment["confirmationStatus"] =
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

  // Cross-contract upgrade pass: findings referencing the target contract upgrade the decision
  const relevantCrossContract = (result.crossContractFindings ?? []).filter(
    (f) =>
      !result.targetContractName ||
      f.callerContract === result.targetContractName ||
      f.calleeContract === result.targetContractName
  );

  if (relevantCrossContract.length > 0) {
    const highOrMedium = relevantCrossContract.some((f) => f.confidence === "high" || f.confidence === "medium");
    if (decision === "no-action") {
      decision = "review";
      decisionReason = `No direct findings, but cross-contract risk signal detected: ${relevantCrossContract[0]!.callerContract} → ${relevantCrossContract[0]!.calleeContract}.${relevantCrossContract[0]!.calleeFunction}().`;
    } else if (decision === "review" && highOrMedium) {
      decision = "investigate";
      decisionReason += ` Cross-contract risk signal: ${relevantCrossContract[0]!.callerContract} → ${relevantCrossContract[0]!.calleeContract}.${relevantCrossContract[0]!.calleeFunction}().`;
    }
    if (confirmationStatus === "none") {
      confirmationStatus = "suspected-only";
    }
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
