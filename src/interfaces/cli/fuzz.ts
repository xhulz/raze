import path from "node:path";
import { runAttackPipeline } from "../../core/pipeline.js";
import { describeDecision } from "../../core/presentation.js";
import { info, success } from "../../utils/logger.js";

/**
 * Executes the CLI fuzz command, running the attack pipeline and printing results.
 *
 * @param projectRoot - Absolute path to the Foundry project root.
 * @param options - CLI options for contract selector, forge execution, and offline mode.
 */
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

  success(`${result.analysis.contractName} — ${describeDecision(result.assessment.decision)}`);
  info(result.assessment.decisionReason);

  if (result.generatedTests.length > 0) {
    info("Proof scaffolds:");
    for (const generatedTest of result.generatedTests) {
      info(`  ${path.relative(projectRoot, generatedTest.testFilePath)}`);
    }
  }

  if (result.forgeRun?.summary) {
    const { passed, failed, skipped } = result.forgeRun.summary;
    info(`Forge: ${passed} passed, ${failed} failed, ${skipped} skipped`);
  }

  info(`Report: ${path.relative(projectRoot, result.reportPath)}`);
}
