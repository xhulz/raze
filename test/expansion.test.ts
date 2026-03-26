import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import { promises as fs } from "node:fs";
import { generateDeveloperFuzzTests } from "../src/core/developerFuzz";
import { suggestHardening } from "../src/core/hardening";
import { runAttackSuite } from "../src/core/attackSuite";
import { toolDefinitions } from "../src/interfaces/mcp/tools";

const fixturesRoot = path.resolve("test/fixtures");

async function createSuiteFixture(): Promise<string> {
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "raze-suite-"));
  await fs.mkdir(path.join(tmpRoot, "src"), { recursive: true });
  await fs.writeFile(
    path.join(tmpRoot, "foundry.toml"),
    `[profile.default]
src = "src"
test = "test"
`,
    "utf8"
  );
  await fs.writeFile(
    path.join(tmpRoot, "src", "Mega.sol"),
    `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract Mega {
    address public owner;
    mapping(address => uint256) public balances;
    uint256 public value;

    constructor() {
        owner = msg.sender;
    }

    function deposit() external payable {
        balances[msg.sender] += msg.value;
    }

    function withdraw() external {
        uint256 amount = balances[msg.sender];
        require(amount > 0, "empty");
        (bool ok,) = msg.sender.call{value: amount}("");
        require(ok, "send failed");
        balances[msg.sender] = 0;
    }

    function mint(uint256 amount) external {
        value += amount;
    }

    function decrement(uint256 amount) external {
        unchecked {
            value -= amount;
        }
    }
}
`,
    "utf8"
  );
  return tmpRoot;
}

test("generateDeveloperFuzzTests emits deterministic per-function fuzz tests", async () => {
  const result = await generateDeveloperFuzzTests({
    projectRoot: path.join(fixturesRoot, "access-control"),
    contractSelector: "Token"
  });

  assert.ok(result.plans.length >= 2);
  assert.ok(result.plans.some((plan) => plan.family === "success-path" && plan.functionName === "mint"));
  assert.ok(result.plans.some((plan) => plan.family === "input-boundary" && plan.functionName === "mint"));
  assert.ok(result.generatedTests.some((generated) => generated.functionName === "mint"));
  assert.match(result.generatedTests[0]?.source ?? "", /testFuzz_mint_success/);
});

test("suggestHardening returns security-focused remediations", async () => {
  const result = await suggestHardening({
    projectRoot: path.join(fixturesRoot, "reentrancy"),
    contractSelector: "Vault"
  });

  assert.ok(result.suggestions.length > 0);
  assert.ok(result.suggestions.some((suggestion) => suggestion.title.includes("Finalize internal accounting")));
  assert.ok(result.suggestions.every((suggestion) => !suggestion.recommendedChange.toLowerCase().includes("gas")));
});

test("runAttackSuite uses AI-authored plans as the primary suite mode and preserves family summaries as derived metadata", async () => {
  const tmpRoot = await createSuiteFixture();
  const result = await runAttackSuite({
    projectRoot: tmpRoot,
    contractSelector: "Mega",
    runForge: true,
    offline: true,
    attackPlans: [
      {
        attackType: "reentrancy",
        contractName: "Mega",
        functionNames: ["withdraw"],
        attackHypothesis: "withdraw performs an external call before balances are cleared.",
        proofGoal: "Show a reentrant callback can revisit withdraw and extract excess value.",
        expectedOutcome: "The attacker ends with more ether than initially deposited.",
        callerRole: "attacker-contract",
        assertionKind: "reentrant-state-inconsistency",
        sampleArguments: []
      },
      {
        attackType: "access-control",
        contractName: "Mega",
        functionNames: ["mint"],
        attackHypothesis: "mint mutates privileged state without access control.",
        proofGoal: "Show an arbitrary caller can mutate tracked state through mint.",
        expectedOutcome: "The observable value changes after an unauthorized mint call.",
        callerRole: "attacker",
        assertionKind: "unauthorized-state-change",
        sampleArguments: [1]
      }
    ],
    executionContext: "mcp"
  });

  assert.equal(result.suiteMode, "ai-authored");
  assert.equal(result.planResults.length, 2);
  assert.ok(result.planResults.every((plan) => plan.validatedPlan));
  assert.ok(result.planResults.some((plan) => plan.attackType === "reentrancy" && plan.assessment.confirmationStatus === "confirmed-by-execution"));
  assert.ok(result.planResults.some((plan) => plan.attackType === "access-control" && plan.assessment.confirmationStatus === "confirmed-by-execution"));
  assert.equal(result.familySummary.length, 5);
  assert.ok(result.familySummary.some((family) => family.attackType === "reentrancy"));
  assert.ok(result.familySummary.some((family) => family.attackType === "access-control"));
  assert.ok(result.forgeRun?.ok);
  assert.match(result.reportPath, /\.raze\/reports\/attack-suite\.md$/);
});

test("runAttackSuite falls back to heuristic sweep when no plans are supplied", async () => {
  const tmpRoot = await createSuiteFixture();
  const result = await runAttackSuite({
    projectRoot: tmpRoot,
    contractSelector: "Mega",
    executionContext: "mcp"
  });

  assert.equal(result.suiteMode, "heuristic-fallback");
  assert.ok(result.planResults.length > 0);
  assert.ok(result.planResults.every((plan) => plan.analysisSource === "heuristic"));
});

test("raze_attack schema rejects calls without attackPlan", async () => {
  await assert.rejects(
    () => toolDefinitions.raze_attack.execute({
      projectRoot: path.join(fixturesRoot, "access-control"),
      contractSelector: "Token"
    }),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.match(err.message, /attackPlan|invalid/i);
      return true;
    }
  );
});

test("raze_run_attack_suite schema rejects calls without attackPlans", async () => {
  await assert.rejects(
    () => toolDefinitions.raze_run_attack_suite.execute({
      projectRoot: path.join(fixturesRoot, "access-control"),
      contractSelector: "Token"
    }),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.match(err.message, /attackPlans|invalid/i);
      return true;
    }
  );
});
