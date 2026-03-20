import { analyzeContract } from "./planner.js";
import { runAttackAgents } from "./attacker.js";
import { buildAttackAssessment } from "./assessment.js";
import { generateProofScaffolds } from "./tester.js";
import { runForgeTests } from "./runner.js";
import { writeReport } from "./reporter.js";
import { deriveFallbackPlans, validateAttackPlan } from "./orchestrator.js";
import type { AttackPipelineInput, AttackPipelineResult } from "./types.js";

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
  const assessment = buildAttackAssessment({
    findings,
    validatedPlans,
    generatedTests,
    forgeRun
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
    assessment
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
    reportPath
  };
}
