import path from "node:path";
import { promises as fs } from "node:fs";
import { analyzeContract } from "./planner.js";
import { runAttackAgents } from "./attacker.js";
import { buildAttackAssessment } from "./assessment.js";
import { deriveFallbackPlans, validateAttackPlan } from "./orchestrator.js";
import { formatExecutionSummaryBlock } from "./presentation.js";
import { generateProofScaffolds } from "./tester.js";
import { runForgeTests } from "./runner.js";
import type {
  AttackPipelineInput,
  AttackPlanInput,
  AttackSuiteFamilyResult,
  AttackSuitePlanResult,
  AttackSuiteResult,
  AttackType,
  ProofStatus,
  ValidatedAttackPlan
} from "./types.js";

const ALL_ATTACK_TYPES: AttackType[] = ["reentrancy", "access-control", "arithmetic"];

function toFamilySummary(planResults: AttackSuitePlanResult[]): AttackSuiteFamilyResult[] {
  return ALL_ATTACK_TYPES.map((attackType) => {
    const familyPlans = planResults.filter((plan) => plan.attackType === attackType);
    const findings = familyPlans.flatMap((plan) => plan.findings);
    const validatedPlans = familyPlans.flatMap((plan) => (plan.validatedPlan ? [plan.validatedPlan] : []));
    const generatedTests = familyPlans.flatMap((plan) => plan.generatedTests);
    const proofStatus =
      generatedTests.length > 0
        ? familyPlans.some((plan) => plan.proofStatus === "executed")
          ? "executed"
          : "scaffold-generated"
        : "no-scaffold";
    return {
      attackType,
      findings,
      validatedPlans,
      generatedTests,
      analysisSource: familyPlans.some((plan) => plan.analysisSource === "ai-orchestrated") ? "ai-orchestrated" : "heuristic",
      hypothesisStatus: familyPlans.some((plan) => plan.hypothesisStatus === "validated")
        ? "validated"
        : familyPlans.some((plan) => plan.hypothesisStatus === "ai-proposed")
          ? "ai-proposed"
          : "none",
      proofStatus,
      assessment: buildAttackAssessment({
        findings,
        validatedPlans,
        generatedTests
      })
    };
  });
}

async function writeAttackSuiteReport(result: Omit<AttackSuiteResult, "reportPath">): Promise<string> {
  const reportsDir = path.join(result.projectRoot, ".raze", "reports");
  await fs.mkdir(reportsDir, { recursive: true });
  const reportPath = path.join(reportsDir, "attack-suite.md");

  const planSections = result.planResults
    .map((plan, index) => {
      const tests = plan.generatedTests.length > 0 ? plan.generatedTests.map((test) => `- ${path.relative(result.projectRoot, test.testFilePath)}`).join("\n") : "- none";
      return `## Plan ${index + 1} (${plan.attackType})

- Suite mode: ${result.suiteMode}
- Decision: ${plan.assessment.decision}
- Why: ${plan.assessment.decisionReason}
- Analysis source: ${plan.analysisSource}
- Hypothesis status: ${plan.hypothesisStatus}
- Proof status: ${plan.proofStatus}
- Confirmation status: ${plan.assessment.confirmationStatus}
- Interpretation: ${plan.assessment.interpretation}
- Authored hypothesis: ${plan.authoredPlan?.attackHypothesis ?? "n/a"}
- Validated functions: ${plan.validatedPlan?.resolvedFunctions.join(", ") ?? "none"}

### Tests

${tests}
`;
    })
    .join("\n");

  const familySections = result.familySummary
    .map(
      (family) => `## ${family.attackType}

- Plans: ${result.planResults.filter((plan) => plan.attackType === family.attackType).length}
- Decision: ${family.assessment.decision}
- Why: ${family.assessment.decisionReason}
- Confirmation status: ${family.assessment.confirmationStatus}
- Interpretation: ${family.assessment.interpretation}
`
    )
    .join("\n");

  const generatedTestsInRun = result.planResults.flatMap((plan) => plan.generatedTests);
  const forgeSection = formatExecutionSummaryBlock(
    result.forgeRun,
    generatedTestsInRun.length,
    "Forge totals cover the whole project run, not only the tests generated in this suite invocation."
  );

  const content = `# Raze Attack Suite Report

## Overview

- Contract: ${result.analysis.contractName}
- Suite mode: ${result.suiteMode}
- Plan results: ${result.planResults.length}
- Generated tests in this run: ${generatedTestsInRun.length}

## Plan Results

${planSections}

## Family Summary

${familySections}

${forgeSection}
`;

  await fs.writeFile(reportPath, content, "utf8");
  return reportPath;
}

async function buildPlanResult(
  input: Pick<AttackPipelineInput, "projectRoot" | "contractSelector" | "executionContext">,
  plan: AttackPlanInput,
  planSource: "ai-authored" | "heuristic-fallback"
): Promise<AttackSuitePlanResult> {
  const { analysis, validatedPlan } = await validateAttackPlan(input, plan, planSource);
  const findings = runAttackAgents(analysis).filter((finding) => finding.type === validatedPlan.attackType);
  const generatedTests = await generateProofScaffolds(input.projectRoot, [validatedPlan]);
  return {
    attackType: validatedPlan.attackType,
    authoredPlan: plan,
    findings,
    validatedPlan,
    generatedTests,
    analysisSource: planSource === "ai-authored" ? "ai-orchestrated" : "heuristic",
    hypothesisStatus: planSource === "ai-authored" ? "validated" : "none",
    proofStatus: generatedTests.length > 0 ? "scaffold-generated" : "no-scaffold",
    assessment: buildAttackAssessment({
      findings,
      validatedPlans: [validatedPlan],
      generatedTests
    })
  };
}

function finalizePlanResults(planResults: AttackSuitePlanResult[], forgeRun: AttackSuiteResult["forgeRun"]): AttackSuitePlanResult[] {
  return planResults.map((plan) => {
    const proofStatus = (plan.generatedTests.length > 0 ? (forgeRun ? "executed" : "scaffold-generated") : "no-scaffold") as ProofStatus;
    return {
      ...plan,
      proofStatus,
      assessment: buildAttackAssessment({
        findings: plan.findings,
        validatedPlans: plan.validatedPlan ? [plan.validatedPlan] : [],
        generatedTests: plan.generatedTests,
        forgeRun
      })
    };
  });
}

export async function runAttackSuite(
  input: Pick<AttackPipelineInput, "projectRoot" | "contractSelector" | "offline" | "runForge" | "executionContext"> & {
    attackPlans?: AttackPlanInput[];
  }
): Promise<AttackSuiteResult> {
  const analysis = await analyzeContract(input);
  const suiteMode = input.attackPlans && input.attackPlans.length > 0 ? "ai-authored" : "heuristic-fallback";

  let planResults: AttackSuitePlanResult[];
  if (suiteMode === "ai-authored") {
    planResults = await Promise.all(input.attackPlans!.map(async (plan) => buildPlanResult(input, plan, "ai-authored")));
  } else {
    const findings = runAttackAgents(analysis);
    const fallbackPlans = await deriveFallbackPlans(analysis, findings);
    planResults = await Promise.all(fallbackPlans.map(async (plan) => buildPlanResult(input, plan, "heuristic-fallback")));
  }

  const forgeRun = input.runForge ? await runForgeTests(input.projectRoot, { offline: input.offline }) : undefined;
  const finalizedPlanResults = finalizePlanResults(planResults, forgeRun);
  const familySummary = toFamilySummary(finalizedPlanResults).map((family) => ({
    ...family,
    assessment: buildAttackAssessment({
      findings: family.findings,
      validatedPlans: family.validatedPlans,
      generatedTests: family.generatedTests,
      forgeRun
    })
  }));

  const reportPath = await writeAttackSuiteReport({
    projectRoot: input.projectRoot,
    analysis,
    suiteMode,
    planResults: finalizedPlanResults,
    familySummary,
    forgeRun
  });

  return {
    projectRoot: input.projectRoot,
    analysis,
    suiteMode,
    planResults: finalizedPlanResults,
    familySummary,
    forgeRun,
    reportPath
  };
}
