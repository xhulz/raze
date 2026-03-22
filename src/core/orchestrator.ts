import { analyzeAllContracts, analyzeContract } from "./planner.js";
import type {
  AttackFinding,
  AttackPlanInput,
  AttackPipelineInput,
  ContractAnalysis,
  ContractDependencyGraph,
  CrossContractFinding,
  ProjectInspection,
  ValidatedAttackPlan
} from "./types.js";

const SOLIDITY_IDENTIFIER_REGEX = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

function assertSolidityIdentifier(value: string, field: string): void {
  if (!SOLIDITY_IDENTIFIER_REGEX.test(value)) {
    throw new Error(`Attack plan field "${field}" contains an invalid Solidity identifier: "${value}"`);
  }
}

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

  if (attackPlan.attackType === "flash-loan") {
    return (
      publicVars.find((variable) => variable.type.startsWith("mapping") && variable.keyType?.trim() === "address") ??
      publicVars.find((variable) => variable.type.startsWith("uint"))
    );
  }

  if (attackPlan.attackType === "price-manipulation") {
    return (
      publicVars.find((variable) => variable.name.toLowerCase().includes("price") || variable.name.toLowerCase().includes("reserve")) ??
      publicVars.find((variable) => variable.type.startsWith("uint"))
    );
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
  const { analyses, graph } = await analyzeAllContracts(projectRoot);
  const crossContractFindings = deriveCrossContractFindings(analyses, graph);

  return {
    projectRoot,
    contracts: analyses.map((analysis) => ({
      contractName: analysis.contractName,
      contractPath: analysis.contractPath,
      functions: analysis.functions,
      inheritedSignals: analysis.inheritedSignals,
      riskSignals: analysis.riskSignals,
      recommendedAgents: analysis.recommendedAgents,
      importedPaths: analysis.importedPaths
    })),
    dependencyGraph: graph,
    crossContractFindings
  };
}

function inferFlashLoanRole(functions: string[]): "lender" | "receiver" {
  const lenderFns = ["flashLoan", "flashBorrow", "flashLoanSimple"];
  const receiverFns = ["onFlashLoan", "executeOperation", "receiveFlashLoan", "callFunction"];
  if (functions.some((fn) => lenderFns.includes(fn))) return "lender";
  if (functions.some((fn) => receiverFns.includes(fn))) return "receiver";
  return "receiver"; // default for backward compatibility
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

  if (attackPlan.targetStateVariable) {
    assertSolidityIdentifier(attackPlan.targetStateVariable, "targetStateVariable");
  }
  const stateVariable = inferTargetStateVariable(analysis, attackPlan, primarySignature);
  if (attackPlan.targetStateVariable && !stateVariable) {
    throw new Error(`Attack plan references unknown state variable: ${attackPlan.targetStateVariable}`);
  }

  const normalizedSampleArguments = attackPlan.sampleArguments ?? inferSampleArguments(primarySignature);
  validateSampleArguments(primarySignature, normalizedSampleArguments);

  const flashLoanRole =
    attackPlan.attackType === "flash-loan"
      ? inferFlashLoanRole(analysis.functions)
      : undefined;

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
      normalizedSampleArguments,
      flashLoanRole
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
      continue;
    }

    if (finding.type === "flash-loan") {
      plans.push({
        attackType: finding.type,
        contractName: analysis.contractName,
        functionNames: [functionName],
        attackHypothesis: finding.attackVector,
        proofGoal: "Demonstrate that a flash loan callback can extract or skew protected state in one atomic transaction.",
        expectedOutcome: "Contract balance or reserve mapping diverges from pre-loan baseline after the callback completes.",
        callerRole: "attacker-contract",
        assertionKind: "flash-loan-extraction",
        sampleArguments: inferSampleArguments(signature)
      });
      continue;
    }

    if (finding.type === "price-manipulation") {
      plans.push({
        attackType: finding.type,
        contractName: analysis.contractName,
        functionNames: [functionName],
        attackHypothesis: finding.attackVector,
        proofGoal: "Demonstrate that skewed AMM reserves cause the price-consuming function to return a manipulated result.",
        expectedOutcome: "The observed price or collateral value deviates from the fair-price baseline when reserves are manipulated.",
        callerRole: "attacker",
        assertionKind: "price-oracle-drift",
        sampleArguments: inferSampleArguments(signature)
      });
    }
  }

  return plans;
}

export function deriveCrossContractFindings(analyses: ContractAnalysis[], graph: ContractDependencyGraph): CrossContractFinding[] {
  const pathToAnalysis = new Map(analyses.map((a) => [a.contractPath, a]));
  const findings: CrossContractFinding[] = [];

  for (const edge of graph.callSurface) {
    const callerAnalysis = pathToAnalysis.get(edge.caller);
    const calleeAnalysis = pathToAnalysis.get(edge.callee);
    if (!callerAnalysis || !calleeAnalysis) continue;

    if (
      calleeAnalysis.riskSignals.includes("spot-price-read") &&
      !callerAnalysis.source.includes("consult(") &&
      !callerAnalysis.source.includes("price0CumulativeLast")
    ) {
      findings.push({
        type: "price-manipulation",
        confidence: "medium",
        callerContract: callerAnalysis.contractName,
        calleeContract: calleeAnalysis.contractName,
        calleeFunction: edge.functionName,
        description: `${callerAnalysis.contractName} calls ${calleeAnalysis.contractName}.${edge.functionName}() which reads a manipulable spot price without TWAP protection.`,
        attackVector: `Manipulate the callee's AMM reserves before ${callerAnalysis.contractName} invokes ${edge.functionName}(), causing the caller to act on a skewed price in the same block.`
      });
    }

    if (
      calleeAnalysis.riskSignals.includes("flash-loan-callback") &&
      !callerAnalysis.source.includes("nonReentrant")
    ) {
      findings.push({
        type: "flash-loan",
        confidence: "medium",
        callerContract: callerAnalysis.contractName,
        calleeContract: calleeAnalysis.contractName,
        calleeFunction: edge.functionName,
        description: `${callerAnalysis.contractName} calls into ${calleeAnalysis.contractName}.${edge.functionName}() which participates in a flash loan flow without reentrancy protection.`,
        attackVector: `Trigger the flash loan callback through ${callerAnalysis.contractName} to manipulate shared state atomically without a reentrancy guard.`
      });
    }
  }

  return findings;
}
