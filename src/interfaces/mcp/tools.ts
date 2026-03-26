import { z } from "zod";
import { analyzeContract } from "../../core/planner.js";
import { runAttackPipeline } from "../../core/pipeline.js";
import { generateDeveloperFuzzTests } from "../../core/developerFuzz.js";
import { suggestHardening } from "../../core/hardening.js";
import { runAttackSuite } from "../../core/attackSuite.js";
import { generateProofScaffolds } from "../../core/tester.js";
import { runAttackAgents } from "../../core/attacker.js";
import { inspectProject, validateAttackPlan } from "../../core/orchestrator.js";
import { writeReport } from "../../core/reporter.js";
import { verifyFixes } from "../../core/verifier.js";

const attackPlanSchema = z.object({
  attackType: z.enum(["reentrancy", "access-control", "arithmetic", "flash-loan", "price-manipulation"]),
  contractName: z.string().min(1).optional(),
  functionNames: z.array(z.string().min(1)).min(1),
  attackHypothesis: z.string().min(1),
  proofGoal: z.string().min(1),
  expectedOutcome: z.string().min(1),
  callerRole: z.string().min(1).optional(),
  targetStateVariable: z.string().min(1).optional(),
  assertionKind: z.enum(["unauthorized-state-change", "arithmetic-drift", "reentrant-state-inconsistency", "flash-loan-extraction", "price-oracle-drift"]),
  sampleArguments: z.array(z.union([z.string(), z.number(), z.boolean()])).optional()
});

const projectSchema = z.object({
  projectRoot: z.string().min(1),
  contractSelector: z.string().min(1).optional()
});

const developerFuzzSchema = projectSchema.extend({
  functionSelector: z.string().min(1).optional(),
  goal: z.string().min(1).optional()
});

const validatedPlanSchema = attackPlanSchema.extend({
  contractName: z.string(),
  contractPath: z.string(),
  resolvedFunctions: z.array(z.string()),
  planSource: z.enum(["ai-authored", "heuristic-fallback"]),
  targetStateVariableType: z.string().optional(),
  targetStateVariableKeyType: z.string().optional(),
  normalizedSampleArguments: z.array(z.union([z.string(), z.number(), z.boolean()]))
});

const generatedTestSchema = z.object({
  findingType: z.enum(["reentrancy", "access-control", "arithmetic", "flash-loan", "price-manipulation"]),
  testFilePath: z.string(),
  source: z.string(),
  planSource: z.enum(["ai-authored", "heuristic-fallback"]),
  proofIntent: z.string()
});

const forgeRunSchema = z.object({
  command: z.string(),
  ok: z.boolean(),
  exitCode: z.number(),
  stdout: z.string(),
  stderr: z.string(),
  summary: z
    .object({
      passed: z.number(),
      failed: z.number(),
      skipped: z.number()
    })
    .optional()
});

const findingSchema = z.object({
  type: z.enum(["reentrancy", "access-control", "arithmetic", "flash-loan", "price-manipulation"]),
  confidence: z.enum(["low", "medium", "high"]),
  description: z.string(),
  attackVector: z.string(),
  suggestedTest: z.string(),
  contract: z.string(),
  functions: z.array(z.string())
});

const validateAttackPlanSchema = projectSchema.extend({
  attackPlan: attackPlanSchema
});

// MCP-specific schemas: attackPlan/attackPlans are required (not optional).
// Avoids client-side enum validation failures caused by z.enum() inside optional nested objects.
const attackSchemaMcp = projectSchema.extend({
  runForge: z.boolean().optional(),
  offline: z.boolean().optional(),
  attackPlan: attackPlanSchema
});

const attackSuiteSchema = projectSchema.extend({
  offline: z.boolean().optional(),
  runForge: z.boolean().optional(),
  attackPlans: z.array(attackPlanSchema).optional()
});

const attackSuiteSchemaMcp = projectSchema.extend({
  offline: z.boolean().optional(),
  runForge: z.boolean().optional(),
  attackPlans: z.array(attackPlanSchema)
});


const reportWriteSchema = z.object({
  projectRoot: z.string().min(1),
  contractSelector: z.string().min(1).optional(),
  findings: z.array(findingSchema).default([]),
  validatedPlans: z.array(validatedPlanSchema).default([]),
  generatedTests: z.array(generatedTestSchema).default([]),
  forgeRun: forgeRunSchema.optional(),
  analysisSource: z.enum(["heuristic", "ai-orchestrated"]).default("ai-orchestrated"),
  hypothesisStatus: z.enum(["none", "ai-proposed", "validated"]).default("validated"),
  proofStatus: z.enum(["no-scaffold", "scaffold-generated", "executed"]).default("scaffold-generated"),
  confirmationStatus: z.enum(["none", "suspected-only", "validated-plan", "executed-scaffold", "confirmed-by-execution"]).default("validated-plan"),
  decision: z.enum(["fix-now", "investigate", "review", "no-action"]).default("investigate"),
  decisionReason: z.string().min(1).default("Review the structured result before deciding on remediation."),
  interpretation: z.string().min(1)
});

function missingPlanError(kind: "attackPlan" | "attackPlans") {
  const minimalExampleInput =
    kind === "attackPlan"
      ? {
          projectRoot: "/path/to/foundry-project",
          contractSelector: "Counter",
          runForge: true,
          offline: true,
          attackPlan: {
            attackType: "access-control",
            contractName: "Counter",
            functionNames: ["mint"],
            attackHypothesis: "mint is a privileged mutation path that lacks access control",
            proofGoal: "show that an arbitrary caller can mutate tracked state through mint",
            expectedOutcome: "the observable state changes after an unauthorized mint call",
            callerRole: "attacker",
            assertionKind: "unauthorized-state-change",
            sampleArguments: [5]
          }
        }
      : {
          projectRoot: "/path/to/foundry-project",
          contractSelector: "Counter",
          runForge: true,
          offline: true,
          attackPlans: [
            {
              attackType: "access-control",
              contractName: "Counter",
              functionNames: ["mint"],
              attackHypothesis: "mint is a privileged mutation path that lacks access control",
              proofGoal: "show that an arbitrary caller can mutate tracked state through mint",
              expectedOutcome: "the observable state changes after an unauthorized mint call",
              callerRole: "attacker",
              assertionKind: "unauthorized-state-change",
              sampleArguments: [5]
            }
          ]
        };

  return {
    error: {
      code: "missing_ai_authored_plan",
      message:
        kind === "attackPlan"
          ? "MCP attack execution requires an AI-authored `attackPlan`. Heuristic fallback is only available via CLI/local mode."
          : "MCP attack suite execution requires AI-authored `attackPlans`. Heuristic fallback is only available via CLI/local mode.",
      missing: kind,
      guidance:
        kind === "attackPlan"
          ? "Provide `attackPlan` in MCP mode, or use the CLI fallback if you want Raze to derive plans heuristically."
          : "Provide `attackPlans` in MCP mode, or use the CLI fallback if you want Raze to derive plans heuristically.",
      whatHappened:
        kind === "attackPlan"
          ? "The MCP attack flow was called without an authored single-plan payload."
          : "The MCP attack suite flow was called without authored multi-plan input.",
      whatToSend:
        kind === "attackPlan"
          ? "Retry with `attackPlan` populated with the attack type, target functions, proof goal, and expected outcome."
          : "Retry with `attackPlans`, where each item is an authored attack plan with target functions, proof goal, and expected outcome.",
      exampleMinimalInput: minimalExampleInput,
      cliFallbackHint:
        kind === "attackPlan"
          ? "Use `raze fuzz` in the CLI if you want Raze to derive a heuristic fallback plan locally."
          : "Use `raze fuzz` in the CLI if you want Raze to derive heuristic fallback plans locally."
    }
  };
}

export const toolDefinitions = {
  raze_inspect_project: {
    description: "Scan all contracts in a Foundry project and return the full inventory, dependency graph, and cross-contract risk signals. Use this first when you don't know which contract to target.",
    schema: z.object({
      projectRoot: z.string().min(1)
    }),
    async execute(input: unknown) {
      const parsed = z.object({ projectRoot: z.string().min(1) }).parse(input);
      return inspectProject(parsed.projectRoot);
    }
  },
  raze_attack: {
    description: "Execute a single AI-authored attack plan over a contract.",
    schema: attackSchemaMcp,
    async execute(input: unknown) {
      const parsed = attackSchemaMcp.parse(input);
      return runAttackPipeline({
        projectRoot: parsed.projectRoot,
        contractSelector: parsed.contractSelector,
        runForge: parsed.runForge,
        offline: parsed.offline,
        attackPlan: parsed.attackPlan,
        executionContext: "mcp"
      });
    }
  },
  raze_generate_developer_fuzz_tests: {
    description: "Generate broad deterministic per-function Foundry fuzz tests for normal contract development work.",
    schema: developerFuzzSchema,
    async execute(input: unknown) {
      const parsed = developerFuzzSchema.parse(input);
      return generateDeveloperFuzzTests(parsed);
    }
  },
  raze_analyze_contract: {
    description: "Deep-analyze a single contract with attack agents and return heuristic findings per vulnerability class. Use this after you know which contract to target.",
    schema: projectSchema,
    async execute(input: unknown) {
      const parsed = projectSchema.parse(input);
      const analysis = await analyzeContract({
        projectRoot: parsed.projectRoot,
        contractSelector: parsed.contractSelector,
        executionContext: "mcp"
      });
      return {
        analysis,
        heuristicFindings: runAttackAgents(analysis)
      };
    }
  },
  raze_suggest_hardening: {
    description: "Suggest security-focused hardening and follow-up tests after analyzing a contract.",
    schema: projectSchema,
    async execute(input: unknown) {
      const parsed = projectSchema.parse(input);
      return suggestHardening(parsed);
    }
  },
  raze_validate_attack_plan: {
    description: "Validate an AI-authored attack or proof plan against real project symbols and normalize it into a scaffold-ready shape.",
    schema: validateAttackPlanSchema,
    async execute(input: unknown) {
      const parsed = validateAttackPlanSchema.parse(input);
      const result = await validateAttackPlan(
        {
          projectRoot: parsed.projectRoot,
          contractSelector: parsed.contractSelector,
          executionContext: "mcp"
        },
        parsed.attackPlan,
        "ai-authored"
      );
      return result;
    }
  },
  raze_generate_proof_scaffold: {
    description: "Generate deterministic Foundry proof scaffolds from a validated or AI-authored attack plan.",
    schema: validateAttackPlanSchema,
    async execute(input: unknown) {
      const parsed = validateAttackPlanSchema.parse(input);
      const { analysis, validatedPlan } = await validateAttackPlan(
        {
          projectRoot: parsed.projectRoot,
          contractSelector: parsed.contractSelector,
          executionContext: "mcp"
        },
        parsed.attackPlan,
        "ai-authored"
      );
      const tests = await generateProofScaffolds(parsed.projectRoot, [validatedPlan]);
      return {
        analysis,
        validatedPlan,
        tests
      };
    }
  },
  raze_run_attack_suite: {
    description: "Run an AI-authored multi-plan attack suite across the target contract.",
    schema: attackSuiteSchemaMcp,
    async execute(input: unknown) {
      const parsed = attackSuiteSchemaMcp.parse(input);
      return runAttackSuite({
        projectRoot: parsed.projectRoot,
        contractSelector: parsed.contractSelector,
        offline: parsed.offline,
        runForge: parsed.runForge,
        attackPlans: parsed.attackPlans,
        executionContext: "mcp"
      });
    }
  },
  raze_write_report: {
    description: "Persist a structured Raze report from validated plans, generated proof scaffolds, and optional forge results.",
    schema: reportWriteSchema,
    async execute(input: unknown) {
      const parsed = reportWriteSchema.parse(input);
      const analysis = await analyzeContract({
        projectRoot: parsed.projectRoot,
        contractSelector: parsed.contractSelector ?? parsed.validatedPlans[0]?.contractName,
        executionContext: "mcp"
      });
      const reportPath = await writeReport({
        projectRoot: parsed.projectRoot,
        analysis,
        findings: parsed.findings,
        validatedPlans: parsed.validatedPlans,
        generatedTests: parsed.generatedTests,
        forgeRun: parsed.forgeRun,
        analysisSource: parsed.analysisSource,
        hypothesisStatus: parsed.hypothesisStatus,
        proofStatus: parsed.proofStatus,
        assessment: {
          findingStatus: parsed.findings.length > 0 ? "heuristic-findings" : "no-findings",
          testStatus: parsed.generatedTests.length > 0 ? "proof-scaffolds-generated" : "no-tests",
          executionStatus: parsed.forgeRun ? (parsed.forgeRun.ok ? "forge-passed" : "forge-failed") : "not-run",
          confirmationStatus: parsed.confirmationStatus,
          decision: parsed.decision,
          decisionReason: parsed.decisionReason,
          interpretation: parsed.interpretation
        }
      });
      return { reportPath };
    }
  },
  raze_verify_fix: {
    description: "Run proof and regression tests to verify a developer's fix is effective. Returns per-contract verdict: fix-verified, fix-incomplete, or error.",
    schema: z.object({
      projectRoot: z.string().min(1),
      contractSelector: z.string().min(1).optional(),
      offline: z.boolean().optional()
    }),
    async execute(input: unknown) {
      const parsed = z.object({
        projectRoot: z.string().min(1),
        contractSelector: z.string().min(1).optional(),
        offline: z.boolean().optional()
      }).parse(input);
      return verifyFixes(parsed.projectRoot, {
        contract: parsed.contractSelector,
        offline: parsed.offline
      });
    }
  }
} as const;

export type RazeToolName = keyof typeof toolDefinitions;
