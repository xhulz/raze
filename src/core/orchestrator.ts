import { analyzeContract, discoverContracts } from "./planner.js";
import type {
  AttackFinding,
  AttackPlanInput,
  AttackPipelineInput,
  ContractAnalysis,
  ProjectInspection,
  ValidatedAttackPlan
} from "./types.js";

interface FunctionSignature {
  name: string;
  paramTypes: string[];
}

interface PublicStateVariable {
  name: string;
  type: string;
  keyType?: string;
}

const FUNCTION_SIGNATURE_REGEX = /function\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)/g;
const PUBLIC_STATE_REGEX = /(mapping\s*\(\s*([^=]+)=>\s*([^)]+)\)|[A-Za-z0-9_]+)\s+public\s+([A-Za-z_][A-Za-z0-9_]*)/g;

function parseFunctionSignatures(source: string): FunctionSignature[] {
  return [...source.matchAll(FUNCTION_SIGNATURE_REGEX)].map((match) => {
    const rawParams = match[2].trim();
    const paramTypes =
      rawParams.length === 0
        ? []
        : rawParams.split(",").map((param) => {
            const tokens = param.trim().split(/\s+/);
            return tokens[0];
          });
    return {
      name: match[1],
      paramTypes
    };
  });
}

function parsePublicStateVariables(source: string): PublicStateVariable[] {
  return [...source.matchAll(PUBLIC_STATE_REGEX)].map((match) => {
    const fullType = match[1].trim();
    const keyType = match[2]?.trim();
    return {
      name: match[4],
      type: fullType,
      keyType
    };
  });
}

function inferTargetStateVariable(analysis: ContractAnalysis, attackPlan: AttackPlanInput, signature: FunctionSignature): PublicStateVariable | undefined {
  const publicVars = parsePublicStateVariables(analysis.source);
  if (attackPlan.targetStateVariable) {
    return publicVars.find((variable) => variable.name === attackPlan.targetStateVariable);
  }

  if (attackPlan.attackType === "access-control") {
    if (signature.paramTypes.length >= 2 && signature.paramTypes[0] === "address" && signature.paramTypes[1].startsWith("uint")) {
      return publicVars.find((variable) => variable.type.startsWith("mapping") && variable.keyType?.trim() === "address");
    }
    return publicVars.find((variable) => variable.type.startsWith("uint"));
  }

  if (attackPlan.attackType === "arithmetic") {
    return publicVars.find((variable) => variable.type.startsWith("uint"));
  }

  if (attackPlan.attackType === "reentrancy") {
    return publicVars.find((variable) => variable.type.startsWith("mapping")) ?? publicVars.find((variable) => variable.type.startsWith("uint"));
  }

  return undefined;
}

function inferSampleArguments(signature: FunctionSignature): Array<string | number | boolean> {
  return signature.paramTypes.map((type) => {
    if (type === "address") {
      return "0x000000000000000000000000000000000000BEEF";
    }
    if (type === "bool") {
      return true;
    }
    if (type.startsWith("uint") || type.startsWith("int")) {
      return 1;
    }
    return 1;
  });
}

function validateSampleArguments(signature: FunctionSignature, sampleArguments: Array<string | number | boolean>): void {
  if (signature.paramTypes.length !== sampleArguments.length) {
    throw new Error(`Attack plan references ${signature.name} with ${sampleArguments.length} sample arguments, expected ${signature.paramTypes.length}`);
  }
}

function toContractSelector(input: AttackPipelineInput): string | undefined {
  return input.attackPlan?.contractName ?? input.contractSelector;
}

export async function inspectProject(projectRoot: string): Promise<ProjectInspection> {
  const contracts = await discoverContracts(projectRoot);
  const analyses = await Promise.all(
    contracts.map(async (contractPath) =>
      analyzeContract({
        projectRoot,
        contractSelector: contractPath,
        executionContext: "mcp"
      })
    )
  );

  return {
    projectRoot,
    contracts: analyses.map((analysis) => ({
      contractName: analysis.contractName,
      contractPath: analysis.contractPath,
      functions: analysis.functions,
      inheritedSignals: analysis.inheritedSignals,
      riskSignals: analysis.riskSignals,
      recommendedAgents: analysis.recommendedAgents
    }))
  };
}

export async function validateAttackPlan(
  input: AttackPipelineInput,
  attackPlan: AttackPlanInput,
  planSource: "ai-authored" | "heuristic-fallback"
): Promise<{ analysis: ContractAnalysis; validatedPlan: ValidatedAttackPlan }> {
  const analysis = await analyzeContract({
    ...input,
    contractSelector: toContractSelector({ ...input, attackPlan })
  });

  const signatures = parseFunctionSignatures(analysis.source);
  const resolvedFunctions = attackPlan.functionNames.filter((name) => analysis.functions.includes(name));
  if (resolvedFunctions.length !== attackPlan.functionNames.length) {
    const missingFunctions = attackPlan.functionNames.filter((name) => !analysis.functions.includes(name));
    throw new Error(`Attack plan references unknown contract functions: ${missingFunctions.join(", ")}`);
  }

  const primarySignature = signatures.find((signature) => signature.name === resolvedFunctions[0]);
  if (!primarySignature) {
    throw new Error(`Could not resolve function signature for ${resolvedFunctions[0]}`);
  }

  const stateVariable = inferTargetStateVariable(analysis, attackPlan, primarySignature);
  if (attackPlan.targetStateVariable && !stateVariable) {
    throw new Error(`Attack plan references unknown state variable: ${attackPlan.targetStateVariable}`);
  }

  const normalizedSampleArguments = attackPlan.sampleArguments ?? inferSampleArguments(primarySignature);
  validateSampleArguments(primarySignature, normalizedSampleArguments);

  return {
    analysis,
    validatedPlan: {
      ...attackPlan,
      contractName: analysis.contractName,
      contractPath: analysis.contractPath,
      resolvedFunctions,
      planSource,
      targetStateVariable: stateVariable?.name,
      targetStateVariableType: stateVariable?.type,
      targetStateVariableKeyType: stateVariable?.keyType?.trim(),
      normalizedSampleArguments
    }
  };
}

export async function deriveFallbackPlans(analysis: ContractAnalysis, findings: AttackFinding[]): Promise<AttackPlanInput[]> {
  const signatures = parseFunctionSignatures(analysis.source);
  const plans: AttackPlanInput[] = [];

  for (const finding of findings) {
    const functionName = finding.functions[0];
    if (!functionName) {
      continue;
    }
    const signature = signatures.find((item) => item.name === functionName);
    if (!signature) {
      continue;
    }

    if (finding.type === "access-control") {
      plans.push({
        attackType: finding.type,
        contractName: analysis.contractName,
        functionNames: [functionName],
        attackHypothesis: finding.attackVector,
        proofGoal: "Show that an unprivileged caller can invoke a privileged mutation path.",
        expectedOutcome: "State mutates without an access-control revert.",
        callerRole: "attacker",
        assertionKind: "unauthorized-state-change",
        sampleArguments: inferSampleArguments(signature)
      });
      continue;
    }

    if (finding.type === "arithmetic") {
      plans.push({
        attackType: finding.type,
        contractName: analysis.contractName,
        functionNames: [functionName],
        attackHypothesis: finding.attackVector,
        proofGoal: "Show that arithmetic operations can drift the tracked invariant.",
        expectedOutcome: "Observed state jumps or wraps unexpectedly after the target call.",
        callerRole: "attacker",
        assertionKind: "arithmetic-drift",
        sampleArguments: inferSampleArguments(signature)
      });
      continue;
    }

    if (finding.type === "reentrancy") {
      plans.push({
        attackType: finding.type,
        contractName: analysis.contractName,
        functionNames: [functionName],
        attackHypothesis: finding.attackVector,
        proofGoal: "Demonstrate that a reentrant callback can revisit the vulnerable path.",
        expectedOutcome: "Attacker callback reaches the target function multiple times in one flow.",
        callerRole: "attacker-contract",
        assertionKind: "reentrant-state-inconsistency",
        sampleArguments: inferSampleArguments(signature)
      });
    }
  }

  return plans;
}
