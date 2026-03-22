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

export async function runForgeTests(projectRoot: string, options: { offline?: boolean } = {}): Promise<ForgeRunResult> {
  const args = ["test", "--match-test", "proof_scaffold", ...(options.offline ? ["--offline"] : []), "--root", projectRoot];
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
