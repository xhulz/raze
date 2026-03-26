import { analyzeAllContracts, analyzeContract, discoverContracts } from "./planner";
import { runAttackAgents } from "./attacker";
import { buildAttackAssessment } from "./assessment";
import { generateProofScaffolds } from "./tester";
import { runForgeTests } from "./runner";
import { writeReport } from "./reporter";
import { deriveCrossContractFindings, deriveFallbackPlans, validateAttackPlan } from "./orchestrator";
import type { AttackPipelineInput, AttackPipelineResult, CrossContractFinding } from "./types";

/**
 * Runs the full attack pipeline: analyze, plan, scaffold, optionally execute tests, assess, and report.
 *
 * @param input - Pipeline input containing project root, contract selector, attack plan, and execution flags.
 * @returns Complete pipeline result with analysis, findings, tests, assessment, and report path.
 */
export async function runAttackPipeline(input: AttackPipelineInput): Promise<AttackPipelineResult> {
  const analysis = await analyzeContract(input);
  const findings = runAttackAgents(analysis);
  const analysisSource = input.attackPlan ? "ai-orchestrated" : "heuristic";
  const validatedPlans = input.attackPlan
    ? [(await validateAttackPlan(input, input.attackPlan, "ai-authored")).validatedPlan]
    : await Promise.all((await deriveFallbackPlans(analysis, findings)).map(async (plan) => (await validateAttackPlan(input, plan, "heuristic-fallback")).validatedPlan));
  const generatedTests = await generateProofScaffolds(input.projectRoot, validatedPlans);
  const forgeRun = input.runForge ? await runForgeTests(input.projectRoot, { offline: input.offline }) : undefined;
  const hypothesisStatus = input.attackPlan ? "validated" : "none";
  const proofStatus = generatedTests.length > 0 ? (forgeRun ? "executed" : "scaffold-generated") : "no-scaffold";

  // Derive cross-contract findings when the project has multiple contracts
  let crossContractFindings: CrossContractFinding[] | undefined;
  const allSolFiles = await discoverContracts(input.projectRoot);
  if (allSolFiles.length > 1) {
    const { analyses, graph } = await analyzeAllContracts(input.projectRoot);
    crossContractFindings = deriveCrossContractFindings(analyses, graph).filter(
      (f) => f.callerContract === analysis.contractName || f.calleeContract === analysis.contractName
    );
  }

  const assessment = buildAttackAssessment({
    findings,
    validatedPlans,
    generatedTests,
    forgeRun,
    crossContractFindings,
    targetContractName: analysis.contractName
  });
  const reportPath = await writeReport({
    projectRoot: input.projectRoot,
    analysis,
    findings,
    validatedPlans,
    generatedTests,
    forgeRun,
    analysisSource,
    hypothesisStatus,
    proofStatus,
    assessment,
    crossContractFindings
  });

  return {
    projectRoot: input.projectRoot,
    analysis,
    findings,
    validatedPlans,
    generatedTests,
    forgeRun,
    analysisSource,
    hypothesisStatus,
    proofStatus,
    assessment,
    reportPath,
    crossContractFindings
  };
}
