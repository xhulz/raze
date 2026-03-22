import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import { promises as fs } from "node:fs";
import { validateAttackPlan } from "../src/core/orchestrator.js";
import { generateProofScaffolds } from "../src/core/tester.js";
import { runAttackPipeline } from "../src/core/pipeline.js";

const fixturesRoot = path.resolve("test/fixtures");

test("validateAttackPlan rejects hallucinated contract functions", async () => {
  await assert.rejects(
    validateAttackPlan(
      {
        projectRoot: path.join(fixturesRoot, "access-control"),
        contractSelector: "Token",
        executionContext: "mcp"
      },
      {
        attackType: "access-control",
        contractName: "Token",
        functionNames: ["burnEverything"],
        attackHypothesis: "Call a function that does not exist.",
        proofGoal: "This should be rejected before scaffold generation.",
        expectedOutcome: "Validation fails.",
        assertionKind: "unauthorized-state-change"
      },
      "ai-authored"
    ),
    /unknown contract functions: burnEverything/
  );
});

test("generateProofScaffolds materializes an access-control proof with observable mutation assertions", async () => {
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "raze-ai-plan-"));
  await fs.cp(path.join(fixturesRoot, "access-control"), tmpRoot, { recursive: true });
  const { validatedPlan } = await validateAttackPlan(
    {
      projectRoot: tmpRoot,
      contractSelector: "Token",
      executionContext: "mcp"
    },
    {
      attackType: "access-control",
      contractName: "Token",
      functionNames: ["mint"],
      attackHypothesis: "An arbitrary caller can mint balances for itself.",
      proofGoal: "Show that an unprivileged caller mutates balances without a revert.",
      expectedOutcome: "balances(attacker) changes after the call.",
      callerRole: "attacker",
      targetStateVariable: "balances",
      assertionKind: "unauthorized-state-change",
      sampleArguments: ["0x000000000000000000000000000000000000BEEF", 5]
    },
    "ai-authored"
  );

  const [generated] = await generateProofScaffolds(tmpRoot, [validatedPlan]);
  assert.match(generated.source, /uint256 beforeValue = uint256\(target\.balances\(0x000000000000000000000000000000000000BEEF\)\);/);
  assert.match(generated.source, /vm\.prank\(address\(0xDEAD\)\);/);
  assert.match(generated.source, /target\.mint\(0x000000000000000000000000000000000000BEEF, 5\);/);
  assert.match(generated.source, /require\(afterValue != beforeValue, "unauthorized call did not mutate observable state"\);/);
  assert.match(generated.source, /interface Vm/);
  // Regression scaffold assertions
  assert.match(generated.source, /function test_access_control_regression/);
  assert.match(generated.source, /vm\.expectRevert\(\)/);
});

test("runAttackPipeline reports ai-orchestrated provenance distinctly from heuristic fallback", async () => {
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "raze-ai-pipeline-"));
  await fs.cp(path.join(fixturesRoot, "access-control"), tmpRoot, { recursive: true });

  const result = await runAttackPipeline({
    projectRoot: tmpRoot,
    contractSelector: "Token",
    executionContext: "mcp",
    attackPlan: {
      attackType: "access-control",
      contractName: "Token",
      functionNames: ["mint"],
      attackHypothesis: "Mint is a privileged path with no guard.",
      proofGoal: "Demonstrate unauthorized state mutation.",
      expectedOutcome: "balances(attacker) changes after mint.",
      callerRole: "attacker",
      targetStateVariable: "balances",
      assertionKind: "unauthorized-state-change",
      sampleArguments: ["0x000000000000000000000000000000000000BEEF", 1]
    }
  });

  assert.equal(result.analysisSource, "ai-orchestrated");
  assert.equal(result.hypothesisStatus, "validated");
  assert.equal(result.proofStatus, "scaffold-generated");
  assert.equal(result.assessment.confirmationStatus, "validated-plan");
  assert.equal(result.assessment.decision, "investigate");
  assert.equal(result.validatedPlans.length, 1);
  assert.equal(result.validatedPlans[0]?.planSource, "ai-authored");
  assert.match(result.assessment.interpretation, /validated plan, not a confirmed exploit/i);
});

test("runAttackPipeline can confirm reentrancy when the scaffold proves reentry and extracted value", async () => {
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "raze-reentrancy-pipeline-"));
  await fs.cp(path.join(fixturesRoot, "reentrancy"), tmpRoot, { recursive: true });

  const result = await runAttackPipeline({
    projectRoot: tmpRoot,
    contractSelector: "Vault",
    executionContext: "mcp",
    runForge: true,
    offline: true,
    attackPlan: {
      attackType: "reentrancy",
      contractName: "Vault",
      functionNames: ["withdraw"],
      attackHypothesis: "withdraw performs an external call before balances are cleared.",
      proofGoal: "Show that a callback can revisit withdraw before the balance is zeroed.",
      expectedOutcome: "The generated scaffold should exercise the reentrancy setup path.",
      callerRole: "attacker-contract",
      assertionKind: "reentrant-state-inconsistency",
      sampleArguments: []
    }
  });

  assert.equal(result.forgeRun?.ok, true);
  assert.equal(result.assessment.confirmationStatus, "confirmed-by-execution");
  assert.equal(result.assessment.decision, "fix-now");
  assert.match(result.assessment.decisionReason, /reproduced the unsafe behavior/i);
  assert.match(result.generatedTests[0]?.source ?? "", /reentrant callback was not observed/);
  assert.match(result.generatedTests[0]?.source ?? "", /attacker did not extract excess value/);
  assert.match(result.assessment.interpretation, /execution-backed confirmation/i);
});

test("generateProofScaffolds uses lender scaffold for contracts that expose flashLoan()", async () => {
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "raze-flash-lender-"));
  await fs.cp(path.join(fixturesRoot, "flash-loan-lender"), tmpRoot, { recursive: true });

  const { validatedPlan } = await validateAttackPlan(
    {
      projectRoot: tmpRoot,
      contractSelector: "FlashLoanVault",
      executionContext: "mcp"
    },
    {
      attackType: "flash-loan",
      contractName: "FlashLoanVault",
      functionNames: ["flashLoan"],
      attackHypothesis: "flashLoan updates totalDeposits before the callback with no invariant check.",
      proofGoal: "Show totalDeposits is inflated during the callback.",
      expectedOutcome: "observedStateValue > beforeValue after the attack.",
      callerRole: "attacker-contract",
      targetStateVariable: "totalDeposits",
      assertionKind: "flash-loan-extraction"
    },
    "ai-authored"
  );

  assert.equal(validatedPlan.flashLoanRole, "lender");

  const [generated] = await generateProofScaffolds(tmpRoot, [validatedPlan]);
  assert.match(generated.source, /target\.flashLoan\(address\(this\)/);
  assert.match(generated.source, /FlashLoanVaultFlashLoanBorrower/);
  assert.match(generated.source, /observedStateValue/);
  assert.doesNotMatch(generated.source, /MockFlashLender/);
});
