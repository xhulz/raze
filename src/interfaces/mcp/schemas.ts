import { z } from "zod";

/** Zod schema for an AI-authored or heuristic attack plan input. */
export const attackPlanSchema = z.object({
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

/** Zod schema for project root and optional contract selector. */
export const projectSchema = z.object({
  projectRoot: z.string().min(1),
  contractSelector: z.string().min(1).optional()
});

/** Zod schema for developer fuzz test generation input. */
export const developerFuzzSchema = projectSchema.extend({
  functionSelector: z.string().min(1).optional(),
  goal: z.string().min(1).optional()
});

/** Zod schema for a validated attack plan with resolved symbols. */
export const validatedPlanSchema = attackPlanSchema.extend({
  contractName: z.string(),
  contractPath: z.string(),
  resolvedFunctions: z.array(z.string()),
  planSource: z.enum(["ai-authored", "heuristic-fallback"]),
  targetStateVariableType: z.string().optional(),
  targetStateVariableKeyType: z.string().optional(),
  normalizedSampleArguments: z.array(z.union([z.string(), z.number(), z.boolean()]))
});

/** Zod schema for a generated proof scaffold test. */
export const generatedTestSchema = z.object({
  findingType: z.enum(["reentrancy", "access-control", "arithmetic", "flash-loan", "price-manipulation"]),
  testFilePath: z.string(),
  source: z.string(),
  planSource: z.enum(["ai-authored", "heuristic-fallback"]),
  proofIntent: z.string()
});

/** Zod schema for a Forge test run result. */
export const forgeRunSchema = z.object({
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

/** Zod schema for an attack finding. */
export const findingSchema = z.object({
  type: z.enum(["reentrancy", "access-control", "arithmetic", "flash-loan", "price-manipulation"]),
  confidence: z.enum(["low", "medium", "high"]),
  description: z.string(),
  attackVector: z.string(),
  suggestedTest: z.string(),
  contract: z.string(),
  functions: z.array(z.string())
});

/** Zod schema for the validate-attack-plan MCP tool input. */
export const validateAttackPlanSchema = projectSchema.extend({
  attackPlan: attackPlanSchema
});

/** Zod schema for the single-attack MCP tool input. */
export const attackSchemaMcp = projectSchema.extend({
  runForge: z.boolean().optional(),
  offline: z.boolean().optional(),
  attackPlan: attackPlanSchema
});

/** Zod schema for the attack-suite MCP tool input. */
export const attackSuiteSchemaMcp = projectSchema.extend({
  offline: z.boolean().optional(),
  runForge: z.boolean().optional(),
  attackPlans: z.array(attackPlanSchema)
});

/** Zod schema for the report-write MCP tool input. */
export const reportWriteSchema = z.object({
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

/** Zod schema for the verify-fix MCP tool input. */
export const verifySchema = z.object({
  projectRoot: z.string().min(1),
  contractSelector: z.string().min(1).optional(),
  offline: z.boolean().optional()
});
