import path from "node:path";
import { runAttackPipeline } from "../../core/pipeline.js";
import { describeConfirmationStatus, describeDecision } from "../../core/presentation.js";
import { info, success } from "../../utils/logger.js";

function describeMode(analysisSource: string): string {
  return analysisSource === "ai-orchestrated" ? "AI-authored attack execution" : "Heuristic fallback";
}

export async function runFuzzCommand(
  projectRoot: string,
  options: {
    contract?: string;
    run?: boolean;
    offline?: boolean;
  }
): Promise<void> {
  const result = await runAttackPipeline({
    projectRoot,
    contractSelector: options.contract,
    runForge: Boolean(options.run),
    offline: Boolean(options.offline),
    executionContext: "cli"
  });

  success(`Analyzed ${result.analysis.contractName}`);
  info(`Mode: ${describeMode(result.analysisSource)}`);
  info(`Heuristic findings: ${result.findings.length}`);
  info(`Validated attack plans: ${result.validatedPlans.length}`);
  info(`Generated proof scaffolds in this run: ${result.generatedTests.length}`);
  if (result.generatedTests.length > 0) {
    info("Generated test files:");
    for (const generatedTest of result.generatedTests) {
      info(`- ${path.relative(projectRoot, generatedTest.testFilePath)}`);
    }
  }

  if (result.forgeRun) {
    info("Execution summary:");
    info(`- Forge command: ${result.forgeRun.command}`);
    info(`- Forge success: ${String(result.forgeRun.ok)}`);
    info(
      `- Overall Forge totals: ${
        result.forgeRun.summary
          ? `${result.forgeRun.summary.passed} passed, ${result.forgeRun.summary.failed} failed, ${result.forgeRun.summary.skipped} skipped`
          : "not parsed from Forge output"
      }`
    );
    info("- Note: Forge totals may include preexisting tests outside this run.");
  }

  info(`Decision: ${describeDecision(result.assessment.decision)}.`);
  info(`Why: ${result.assessment.decisionReason}`);
  info(`Final issue status: ${describeConfirmationStatus(result.assessment.confirmationStatus)}.`);
  info(`Interpretation: ${result.assessment.interpretation}`);
  info(`Report: ${path.relative(projectRoot, result.reportPath)}`);
}
