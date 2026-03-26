import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import { promises as fs } from "node:fs";
import { analyzeContract, discoverContracts } from "../src/core/planner";
import { runAttackAgents } from "../src/core/attacker";
import { deriveFallbackPlans, validateAttackPlan } from "../src/core/orchestrator";
import { generateProofScaffolds } from "../src/core/tester";
import { runAttackPipeline } from "../src/core/pipeline";

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

test("analyzeContract selects flash-loan agent for flash-loan fixture", async () => {
  const analysis = await analyzeContract({
    projectRoot: path.join(fixturesRoot, "flash-loan"),
    executionContext: "cli"
  });

  assert.equal(analysis.contractName, "FlashLoanVault");
  assert.ok(analysis.recommendedAgents.includes("flash-loan"), `expected flash-loan in ${analysis.recommendedAgents.join(", ")}`);
});

test("flash-loan agent returns findings for flash-loan fixture", async () => {
  const analysis = await analyzeContract({
    projectRoot: path.join(fixturesRoot, "flash-loan"),
    executionContext: "cli"
  });

  const findings = runAttackAgents(analysis);
  assert.ok(findings.some((f) => f.type === "flash-loan"), `expected flash-loan finding, got: ${findings.map((f) => f.type).join(", ")}`);
  const finding = findings.find((f) => f.type === "flash-loan")!;
  assert.ok(finding.confidence === "high" || finding.confidence === "medium");
  assert.ok(finding.functions.includes("onFlashLoan"));
});

test("analyzeContract selects price-manipulation agent for price-manipulation fixture", async () => {
  const analysis = await analyzeContract({
    projectRoot: path.join(fixturesRoot, "price-manipulation"),
    executionContext: "cli"
  });

  assert.equal(analysis.contractName, "OracleConsumer");
  assert.ok(analysis.recommendedAgents.includes("price-manipulation"), `expected price-manipulation in ${analysis.recommendedAgents.join(", ")}`);
});

test("price-manipulation agent returns findings for price-manipulation fixture", async () => {
  const analysis = await analyzeContract({
    projectRoot: path.join(fixturesRoot, "price-manipulation"),
    executionContext: "cli"
  });

  const findings = runAttackAgents(analysis);
  assert.ok(findings.some((f) => f.type === "price-manipulation"), `expected price-manipulation finding, got: ${findings.map((f) => f.type).join(", ")}`);
  const finding = findings.find((f) => f.type === "price-manipulation")!;
  assert.equal(finding.confidence, "high");
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
  assert.match(report, /Raze Security Report/);
  assert.equal(result.assessment.findingStatus, "heuristic-findings");
  assert.equal(result.assessment.decision, "investigate");
  assert.match(report, /Findings/);
  assert.match(report, /Verdict/);
  assert.match(report, /INVESTIGATE/);
  assert.match(report, /What to do next/);
});

test("reentrancy scaffold includes regression test function", async () => {
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "raze-reentrancy-regression-"));
  await fs.cp(path.join(fixturesRoot, "reentrancy"), tmpRoot, { recursive: true });
  const result = await runAttackPipeline({
    projectRoot: tmpRoot,
    executionContext: "cli",
    attackPlan: {
      attackType: "reentrancy",
      contractName: "Vault",
      functionNames: ["withdraw"],
      attackHypothesis: "withdraw performs an external call before balances are cleared.",
      proofGoal: "Show that a callback can revisit withdraw before the balance is zeroed.",
      expectedOutcome: "Attacker callback reaches the target function multiple times.",
      callerRole: "attacker-contract",
      assertionKind: "reentrant-state-inconsistency",
      sampleArguments: []
    }
  });

  const source = result.generatedTests[0]?.source ?? "";
  assert.match(source, /function test_reentrancy_regression/);
  assert.match(source, /reentrant callback should have been blocked by fix/);
  assert.match(source, /attacker should not extract excess value after fix/);
});

test("cross-contract findings upgrade decision from no-action to review", async () => {
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "raze-cross-contract-"));
  await fs.cp(path.join(fixturesRoot, "cross-contract"), tmpRoot, { recursive: true });
  const result = await runAttackPipeline({
    projectRoot: tmpRoot,
    executionContext: "cli"
  });

  assert.ok(
    result.assessment.decision === "review" || result.assessment.decision === "investigate" || result.assessment.decision === "fix-now",
    `expected decision >= review, got: ${result.assessment.decision}`
  );
  assert.ok((result.crossContractFindings?.length ?? 0) > 0, "expected cross-contract findings");
});
