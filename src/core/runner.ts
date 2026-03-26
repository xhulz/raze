import path from "node:path";
import { execFileSafe } from "../utils/exec.js";
import type { ForgeRunResult } from "./types.js";

function parseForgeSummary(stdout: string): ForgeRunResult["summary"] {
  const summaryMatch = stdout.match(/(\d+)\s+passed;\s+(\d+)\s+failed;\s+(\d+)\s+skipped/);
  if (!summaryMatch) {
    return undefined;
  }

  return {
    passed: Number(summaryMatch[1]),
    failed: Number(summaryMatch[2]),
    skipped: Number(summaryMatch[3])
  };
}

/**
 * Executes Forge test commands against the project with configurable test and path matching.
 *
 * @param projectRoot - Absolute path to the Foundry project root.
 * @param options - Optional flags for offline mode, test name match pattern, and file path match pattern.
 * @returns Forge run result including exit code, stdout/stderr, and parsed test summary.
 */
export async function runForgeTests(projectRoot: string, options: { offline?: boolean; matchTest?: string; matchPath?: string } = {}): Promise<ForgeRunResult> {
  const matchTest = options.matchTest ?? "proof_scaffold";
  const args = ["test", "--match-test", matchTest, ...(options.matchPath ? ["--match-path", options.matchPath] : []), ...(options.offline ? ["--offline"] : []), "--root", projectRoot];
  const result = await execFileSafe("forge", args, {
    cwd: projectRoot
  });

  return {
    command: ["forge", ...args].join(" "),
    ok: result.ok,
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
    summary: parseForgeSummary(result.stdout)
  };
}
