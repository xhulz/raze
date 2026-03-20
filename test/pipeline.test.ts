import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import { promises as fs } from "node:fs";
import { analyzeContract, discoverContracts } from "../src/core/planner.js";
import { runAttackAgents } from "../src/core/attacker.js";
import { deriveFallbackPlans, validateAttackPlan } from "../src/core/orchestrator.js";
import { generateProofScaffolds } from "../src/core/tester.js";
import { runAttackPipeline } from "../src/core/pipeline.js";

const fixturesRoot = path.resolve("test/fixtures");

test("discoverContracts finds solidity files in a Foundry project", async () => {
  const contracts = await discoverContracts(path.join(fixturesRoot, "reentrancy"));
  assert.equal(contracts.length, 1);
  assert.match(contracts[0], /Vault\.sol$/);
});

test("analyzeContract selects attack agents for reentrancy fixture", async () => {
  const analysis = await analyzeContract({
    projectRoot: path.join(fixturesRoot, "reentrancy"),
    executionContext: "cli"
  });

  assert.equal(analysis.contractName, "Vault");
  assert.ok(analysis.recommendedAgents.includes("reentrancy"));
});

test("attack agents return findings for access control fixture", async () => {
  const analysis = await analyzeContract({
    projectRoot: path.join(fixturesRoot, "access-control"),
    executionContext: "cli"
  });

  const findings = runAttackAgents(analysis);
  assert.ok(findings.some((finding) => finding.type === "access-control"));
});

test("generateProofScaffolds writes deterministic Foundry tests", async () => {
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "raze-tests-"));
  await fs.cp(path.join(fixturesRoot, "arithmetic"), tmpRoot, { recursive: true });
  const analysis = await analyzeContract({
    projectRoot: tmpRoot,
    executionContext: "cli"
  });
  const findings = runAttackAgents(analysis);
  const fallbackPlans = await deriveFallbackPlans(analysis, findings);
  const validatedPlans = await Promise.all(
    fallbackPlans.map(async (plan) => (await validateAttackPlan({ projectRoot: tmpRoot, executionContext: "cli" }, plan, "heuristic-fallback")).validatedPlan)
  );
  const tests = await generateProofScaffolds(tmpRoot, validatedPlans);

  assert.ok(tests.length > 0);
  assert.match(tests[0].source, /import \{Counter\} from "\.\.\/\.\.\/src\/Counter\.sol";/);
});

test("runAttackPipeline produces a report", async () => {
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "raze-pipeline-"));
  await fs.cp(path.join(fixturesRoot, "reentrancy"), tmpRoot, { recursive: true });
  const result = await runAttackPipeline({
    projectRoot: tmpRoot,
    executionContext: "cli"
  });

  const report = await fs.readFile(result.reportPath, "utf8");
  assert.ok(result.generatedTests.length > 0);
  assert.match(result.reportPath, /\.raze\/reports\/fuzz\.md$/);
  assert.match(report, /Raze Fuzz Report/);
  assert.equal(result.assessment.findingStatus, "heuristic-findings");
  assert.equal(result.assessment.decision, "investigate");
  assert.match(report, /Heuristic Findings/);
  assert.match(report, /Generated Tests In This Run/);
  assert.match(report, /Decision: investigate/);
  assert.match(report, /Why: There is validated attack evidence/);
  assert.match(report, /Next step:/);
});
