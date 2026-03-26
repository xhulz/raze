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
import {
  projectSchema,
  validateAttackPlanSchema,
  attackSchemaMcp,
  attackSuiteSchemaMcp,
  developerFuzzSchema,
  reportWriteSchema,
  verifySchema
} from "./schemas.js";

/** Registry of all Raze MCP tool definitions with schemas and execute handlers. */
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
    schema: verifySchema,
    async execute(input: unknown) {
      const parsed = verifySchema.parse(input);
      return verifyFixes(parsed.projectRoot, {
        contract: parsed.contractSelector,
        offline: parsed.offline
      });
    }
  }
} as const;

/** Union type of all registered Raze MCP tool names. */
export type RazeToolName = keyof typeof toolDefinitions;
