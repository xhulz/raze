import path from "node:path";
import { verifyFixes } from "../../core/verifier";
import { ensureFoundryProject } from "../../core/planner";
import { success, info, warn } from "../../utils/logger";

/**
 * Executes the CLI verify command, running proof and regression tests and printing verdicts.
 *
 * @param projectRoot - Absolute path to the Foundry project root.
 * @param options - CLI options for contract filter and offline mode.
 */
export async function runVerifyCommand(
  projectRoot: string,
  options: { contract?: string; offline?: boolean }
): Promise<void> {
  await ensureFoundryProject(projectRoot);
  const result = await verifyFixes(projectRoot, options);

  if (result.overallVerdict === "no-scaffolds") {
    warn("No scaffolds found. Run `raze fuzz` first to generate proof scaffolds.");
    return;
  }

  for (const c of result.contracts) {
    const proofLabel = c.proofRun.summary
      ? `${c.proofRun.summary.passed} passed, ${c.proofRun.summary.failed} failed`
      : "error";
    const regLabel = c.regressionRun.summary
      ? `${c.regressionRun.summary.passed} passed, ${c.regressionRun.summary.failed} failed`
      : "error";

    if (c.verdict === "fix-verified") {
      success(`${c.contractName}: fix verified`);
    } else if (c.verdict === "fix-incomplete") {
      warn(`${c.contractName}: fix incomplete`);
    } else {
      warn(`${c.contractName}: error`);
    }

    info(`  proof_scaffold: ${proofLabel}`);
    info(`  regression:     ${regLabel}`);
    info(`  ${c.reason}`);
  }

  info(`Report: ${path.relative(projectRoot, result.reportPath)}`);

  if (result.overallVerdict !== "all-fixed") {
    process.exitCode = 1;
  }
}
