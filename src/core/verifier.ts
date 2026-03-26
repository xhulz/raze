import { promises as fs } from "node:fs";
import path from "node:path";
import { runForgeTests } from "./runner";
import type {
  ForgeRunResult,
  VerifyContractResult,
  VerifyResult,
} from "./types";

/**
 * Interprets proof and regression Forge runs to determine whether a fix has been verified.
 *
 * @param proofRun - Forge run result for the proof scaffold tests (expected to fail after a fix).
 * @param regressionRun - Forge run result for the regression tests (expected to pass after a fix).
 * @returns Object with a verdict ("fix-verified", "fix-incomplete", or "error") and a human-readable reason.
 */
export function interpretVerifyResults(
  proofRun: ForgeRunResult,
  regressionRun: ForgeRunResult,
): { verdict: VerifyContractResult["verdict"]; reason: string } {
  if (!proofRun.summary || !regressionRun.summary) {
    return { verdict: "error", reason: "Forge output could not be parsed." };
  }

  const proofStillPasses = proofRun.summary.passed > 0;
  const regressionFails = regressionRun.summary.failed > 0;
  const regressionRan =
    proofRun.summary.passed +
      proofRun.summary.failed +
      regressionRun.summary.passed +
      regressionRun.summary.failed >
    0;

  if (!regressionRan) {
    return { verdict: "error", reason: "No tests were executed." };
  }

  if (
    !proofStillPasses &&
    regressionRun.summary.passed > 0 &&
    !regressionFails
  ) {
    return {
      verdict: "fix-verified",
      reason:
        "Proof scaffold fails (bug gone) and regression passes (fix holds).",
    };
  }

  const reasons: string[] = [];
  if (proofStillPasses) {
    reasons.push(
      `Proof scaffold still passes (${proofRun.summary.passed} passed) — vulnerability still exploitable.`,
    );
  }
  if (regressionFails) {
    reasons.push(
      `Regression test fails (${regressionRun.summary.failed} failed) — fix not effective.`,
    );
  }
  if (reasons.length === 0 && regressionRun.summary.passed === 0) {
    reasons.push("No regression tests found — cannot confirm fix.");
  }

  return { verdict: "fix-incomplete", reason: reasons.join(" ") };
}

/**
 * Discovers existing proof scaffold test files grouped by contract name.
 *
 * @param projectRoot - Absolute path to the Foundry project root.
 * @param contractFilter - Optional contract name to filter discovered scaffolds.
 * @returns Map from contract name to array of scaffold file paths.
 */
async function discoverScaffolds(
  projectRoot: string,
  contractFilter?: string,
): Promise<Map<string, string[]>> {
  const testDir = path.join(projectRoot, "test", "raze");
  const exists = await fs
    .access(testDir)
    .then(() => true)
    .catch(() => false);
  if (!exists) return new Map();

  const files = await fs.readdir(testDir);
  const scaffolds = new Map<string, string[]>();

  for (const file of files) {
    if (!file.endsWith(".t.sol")) continue;
    const contractName = file.split(".")[0];
    if (contractFilter && contractName !== contractFilter) continue;
    const list = scaffolds.get(contractName) ?? [];
    list.push(path.join(testDir, file));
    scaffolds.set(contractName, list);
  }

  return scaffolds;
}

/**
 * Generates the Markdown content for a verification report.
 *
 * @param result - The verification result with per-contract verdicts.
 * @returns Markdown string for the verification report.
 */
function writeVerifyReport(result: VerifyResult): string {
  const overallLabel =
    result.overallVerdict === "all-fixed" ? "ALL FIXED" : "INCOMPLETE";

  const table = result.contracts
    .map((c) => {
      const attackType = c.scaffoldFiles
        .map((f) => path.basename(f).split(".")[1])
        .join(", ");
      const proofLabel = c.proofRun.summary
        ? `${c.proofRun.summary.passed} passed, ${c.proofRun.summary.failed} failed`
        : "error";
      const regLabel = c.regressionRun.summary
        ? `${c.regressionRun.summary.passed} passed, ${c.regressionRun.summary.failed} failed`
        : "error";
      return `| ${c.contractName} | ${attackType} | ${proofLabel} | ${regLabel} | ${c.verdict} |`;
    })
    .join("\n");

  const details = result.contracts
    .map((c) => {
      const label =
        c.verdict === "fix-verified"
          ? "FIX VERIFIED"
          : c.verdict === "fix-incomplete"
            ? "FIX INCOMPLETE"
            : "ERROR";
      return `### ${c.contractName}: ${label}\n\n${c.reason}`;
    })
    .join("\n\n");

  return `# Raze Verification Report

## Overall: ${overallLabel}

| Contract | Type | Proof (should fail) | Regression (should pass) | Verdict |
|---|---|---|---|---|
${table}

---

${details}

---

_Verified at ${new Date().toISOString()}_
`;
}

/**
 * Verifies applied fixes by running proof scaffolds and regression tests, then writing a verification report.
 *
 * @param projectRoot - Absolute path to the Foundry project root.
 * @param options - Optional filters for contract name and offline mode.
 * @returns Verification result with per-contract verdicts, overall verdict, and report path.
 */
export async function verifyFixes(
  projectRoot: string,
  options: { contract?: string; offline?: boolean } = {},
): Promise<VerifyResult> {
  const scaffolds = await discoverScaffolds(projectRoot, options.contract);

  if (scaffolds.size === 0) {
    const reportPath = path.join(projectRoot, ".raze", "reports", "verify.md");
    const result: VerifyResult = {
      projectRoot,
      contracts: [],
      overallVerdict: "no-scaffolds",
      reportPath,
    };
    await fs.mkdir(path.dirname(reportPath), { recursive: true });
    await fs.writeFile(
      reportPath,
      "# Raze Verification Report\n\nNo scaffolds found. Run `raze fuzz` first.\n",
      "utf8",
    );
    return result;
  }

  const contracts: VerifyContractResult[] = [];

  for (const [contractName, files] of scaffolds) {
    const matchPath = `test/raze/${contractName}.*`;
    const proofRun = await runForgeTests(projectRoot, {
      matchTest: "proof_scaffold",
      matchPath,
      offline: options.offline,
    });
    const regressionRun = await runForgeTests(projectRoot, {
      matchTest: "regression",
      matchPath,
      offline: options.offline,
    });

    const { verdict, reason } = interpretVerifyResults(proofRun, regressionRun);
    contracts.push({
      contractName,
      scaffoldFiles: files,
      proofRun,
      regressionRun,
      verdict,
      reason,
    });
  }

  let overallVerdict: VerifyResult["overallVerdict"];
  if (contracts.every((c) => c.verdict === "fix-verified")) {
    overallVerdict = "all-fixed";
  } else if (contracts.some((c) => c.verdict === "error")) {
    overallVerdict = "error";
  } else {
    overallVerdict = "some-incomplete";
  }

  const reportPath = path.join(projectRoot, ".raze", "reports", "verify.md");
  const verifyResult: VerifyResult = {
    projectRoot,
    contracts,
    overallVerdict,
    reportPath,
  };

  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, writeVerifyReport(verifyResult), "utf8");

  return verifyResult;
}
