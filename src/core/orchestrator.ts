import { analyzeAllContracts, analyzeContract } from "./planner";
import {
  type FunctionSignature,
  type PublicStateVariable,
  parseConstructorArgs,
  parseFunctionSignatures,
  parsePublicStateVariables,
} from "./solidity";
import type {
  AttackFinding,
  AttackPipelineInput,
  AttackPlanInput,
  ContractAnalysis,
  ContractDependencyGraph,
  CrossContractFinding,
  ProjectInspection,
  ValidatedAttackPlan,
} from "./types";

const SOLIDITY_IDENTIFIER_REGEX = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/**
 * Asserts that a value is a valid Solidity identifier, throwing if not.
 *
 * @param value - The string to validate.
 * @param field - The field name for error reporting.
 */
function assertSolidityIdentifier(value: string, field: string): void {
  if (!SOLIDITY_IDENTIFIER_REGEX.test(value)) {
    throw new Error(
      `Attack plan field "${field}" contains an invalid Solidity identifier: "${value}"`,
    );
  }
}

/**
 * Infers the best observable public state variable for a given attack plan and function signature.
 *
 * @param analysis - Contract analysis containing the source code.
 * @param attackPlan - The attack plan with optional explicit target state variable.
 * @param signature - The primary function signature being targeted.
 * @returns The matched public state variable, or undefined if none is suitable.
 */
function inferTargetStateVariable(
  analysis: ContractAnalysis,
  attackPlan: AttackPlanInput,
  signature: FunctionSignature,
): PublicStateVariable | undefined {
  const publicVars = parsePublicStateVariables(analysis.source);
  if (attackPlan.targetStateVariable) {
    return publicVars.find(
      (variable) => variable.name === attackPlan.targetStateVariable,
    );
  }

  if (attackPlan.attackType === "access-control") {
    if (
      signature.paramTypes.length >= 2 &&
      signature.paramTypes[0] === "address" &&
      signature.paramTypes[1].startsWith("uint")
    ) {
      return publicVars.find(
        (variable) =>
          variable.type.startsWith("mapping") &&
          variable.keyType?.trim() === "address",
      );
    }
    return publicVars.find((variable) => variable.type.startsWith("uint"));
  }

  if (attackPlan.attackType === "arithmetic") {
    return publicVars.find((variable) => variable.type.startsWith("uint"));
  }

  if (attackPlan.attackType === "reentrancy") {
    return (
      publicVars.find((variable) => variable.type.startsWith("mapping")) ??
      publicVars.find((variable) => variable.type.startsWith("uint"))
    );
  }

  if (attackPlan.attackType === "flash-loan") {
    return (
      publicVars.find(
        (variable) =>
          variable.type.startsWith("mapping") &&
          variable.keyType?.trim() === "address",
      ) ?? publicVars.find((variable) => variable.type.startsWith("uint"))
    );
  }

  if (attackPlan.attackType === "price-manipulation") {
    return (
      publicVars.find(
        (variable) =>
          variable.name.toLowerCase().includes("price") ||
          variable.name.toLowerCase().includes("reserve"),
      ) ?? publicVars.find((variable) => variable.type.startsWith("uint"))
    );
  }

  return undefined;
}

/**
 * Generates default sample argument values based on the function parameter types.
 *
 * @param signature - The function signature to derive arguments for.
 * @returns Array of default values matching each parameter type.
 */
function inferSampleArguments(
  signature: FunctionSignature,
): Array<string | number | boolean> {
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

/**
 * Validates that the number of sample arguments matches the function parameter count.
 *
 * @param signature - The function signature to validate against.
 * @param sampleArguments - The sample arguments to check.
 */
function validateSampleArguments(
  signature: FunctionSignature,
  sampleArguments: Array<string | number | boolean>,
): void {
  if (signature.paramTypes.length !== sampleArguments.length) {
    throw new Error(
      `Attack plan references ${signature.name} with ${sampleArguments.length} sample arguments, expected ${signature.paramTypes.length}`,
    );
  }
}

/**
 * Extracts the contract selector from the pipeline input, preferring the attack plan's contract name.
 *
 * @param input - Pipeline input with optional contract selector and attack plan.
 * @returns Contract selector string, or undefined if none is specified.
 */
function toContractSelector(input: AttackPipelineInput): string | undefined {
  return input.attackPlan?.contractName ?? input.contractSelector;
}

/**
 * Inspects an entire Foundry project, analyzing all contracts and deriving cross-contract findings.
 *
 * @param projectRoot - Absolute path to the Foundry project root.
 * @returns Full project inspection including per-contract metadata, dependency graph, and cross-contract findings.
 */
export async function inspectProject(
  projectRoot: string,
): Promise<ProjectInspection> {
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
      importedPaths: analysis.importedPaths,
    })),
    dependencyGraph: graph,
    crossContractFindings,
  };
}

const DEPOSIT_PATTERN_PRIORITY = [
  "deposit",
  "stake",
  "add",
  "supply",
  "provide",
  "fund",
  "invest",
];

/**
 * Infers the setup function name (e.g. "deposit") to use before the reentrancy attack call.
 *
 * @param functions - All public functions in the contract.
 * @param attackFunctions - Functions targeted by the attack plan (excluded from candidates).
 * @returns The best matching setup function name, defaulting to "deposit".
 */
function inferReentrancySetupFunction(
  functions: string[],
  attackFunctions: string[],
): string {
  const candidates = functions.filter((fn) => !attackFunctions.includes(fn));
  return (
    DEPOSIT_PATTERN_PRIORITY.find((name) => candidates.includes(name)) ??
    "deposit"
  );
}

/**
 * Infers whether a contract acts as a flash-loan lender or receiver based on its function names.
 *
 * @param functions - All public functions in the contract.
 * @returns The inferred flash loan role, defaulting to "receiver".
 */
function inferFlashLoanRole(functions: string[]): "lender" | "receiver" {
  const lenderFns = ["flashLoan", "flashBorrow", "flashLoanSimple"];
  const receiverFns = [
    "onFlashLoan",
    "executeOperation",
    "receiveFlashLoan",
    "callFunction",
  ];
  if (functions.some((fn) => lenderFns.includes(fn))) return "lender";
  if (functions.some((fn) => receiverFns.includes(fn))) return "receiver";
  return "receiver"; // default for backward compatibility
}

/**
 * Validates an attack plan against the real contract surface, resolving functions, state variables, and sample arguments.
 *
 * @param input - Pipeline input with project root and optional contract selector.
 * @param attackPlan - The attack plan to validate against actual contract symbols.
 * @param planSource - Origin of the plan, either "ai-authored" or "heuristic-fallback".
 * @returns The contract analysis and the fully validated attack plan with resolved symbols.
 */
export async function validateAttackPlan(
  input: AttackPipelineInput,
  attackPlan: AttackPlanInput,
  planSource: "ai-authored" | "heuristic-fallback",
): Promise<{ analysis: ContractAnalysis; validatedPlan: ValidatedAttackPlan }> {
  const analysis = await analyzeContract({
    ...input,
    contractSelector: toContractSelector({ ...input, attackPlan }),
  });

  const signatures = parseFunctionSignatures(analysis.source);
  const resolvedFunctions = attackPlan.functionNames.filter((name) =>
    analysis.functions.includes(name),
  );
  if (resolvedFunctions.length !== attackPlan.functionNames.length) {
    const missingFunctions = attackPlan.functionNames.filter(
      (name) => !analysis.functions.includes(name),
    );
    throw new Error(
      `Attack plan references unknown contract functions: ${missingFunctions.join(", ")}`,
    );
  }

  const primarySignature = signatures.find(
    (signature) => signature.name === resolvedFunctions[0],
  );
  if (!primarySignature) {
    throw new Error(
      `Could not resolve function signature for ${resolvedFunctions[0]}`,
    );
  }

  if (attackPlan.targetStateVariable) {
    assertSolidityIdentifier(
      attackPlan.targetStateVariable,
      "targetStateVariable",
    );
  }
  const stateVariable = inferTargetStateVariable(
    analysis,
    attackPlan,
    primarySignature,
  );
  if (attackPlan.targetStateVariable && !stateVariable) {
    throw new Error(
      `Attack plan references unknown state variable: ${attackPlan.targetStateVariable}`,
    );
  }

  const normalizedSampleArguments =
    attackPlan.sampleArguments ?? inferSampleArguments(primarySignature);
  validateSampleArguments(primarySignature, normalizedSampleArguments);

  const flashLoanRole =
    attackPlan.attackType === "flash-loan"
      ? inferFlashLoanRole(analysis.functions)
      : undefined;

  const reentrancySetupFunction =
    attackPlan.attackType === "reentrancy"
      ? inferReentrancySetupFunction(analysis.functions, resolvedFunctions)
      : undefined;

  const constructorArgs = parseConstructorArgs(analysis.source);

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
      flashLoanRole,
      reentrancySetupFunction,
      constructorArgs,
    },
  };
}

/**
 * Derives heuristic-based fallback attack plans from contract analysis findings when no AI-authored plan is provided.
 *
 * @param analysis - The analyzed contract metadata and source.
 * @param findings - Attack findings produced by the heuristic agents.
 * @returns Array of attack plan inputs, one per actionable finding.
 */
export async function deriveFallbackPlans(
  analysis: ContractAnalysis,
  findings: AttackFinding[],
): Promise<AttackPlanInput[]> {
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
        proofGoal:
          "Show that an unprivileged caller can invoke a privileged mutation path.",
        expectedOutcome: "State mutates without an access-control revert.",
        callerRole: "attacker",
        assertionKind: "unauthorized-state-change",
        sampleArguments: inferSampleArguments(signature),
      });
      continue;
    }

    if (finding.type === "arithmetic") {
      plans.push({
        attackType: finding.type,
        contractName: analysis.contractName,
        functionNames: [functionName],
        attackHypothesis: finding.attackVector,
        proofGoal:
          "Show that arithmetic operations can drift the tracked invariant.",
        expectedOutcome:
          "Observed state jumps or wraps unexpectedly after the target call.",
        callerRole: "attacker",
        assertionKind: "arithmetic-drift",
        sampleArguments: inferSampleArguments(signature),
      });
      continue;
    }

    if (finding.type === "reentrancy") {
      plans.push({
        attackType: finding.type,
        contractName: analysis.contractName,
        functionNames: [functionName],
        attackHypothesis: finding.attackVector,
        proofGoal:
          "Demonstrate that a reentrant callback can revisit the vulnerable path.",
        expectedOutcome:
          "Attacker callback reaches the target function multiple times in one flow.",
        callerRole: "attacker-contract",
        assertionKind: "reentrant-state-inconsistency",
        sampleArguments: inferSampleArguments(signature),
      });
      continue;
    }

    if (finding.type === "flash-loan") {
      plans.push({
        attackType: finding.type,
        contractName: analysis.contractName,
        functionNames: [functionName],
        attackHypothesis: finding.attackVector,
        proofGoal:
          "Demonstrate that a flash loan callback can extract or skew protected state in one atomic transaction.",
        expectedOutcome:
          "Contract balance or reserve mapping diverges from pre-loan baseline after the callback completes.",
        callerRole: "attacker-contract",
        assertionKind: "flash-loan-extraction",
        sampleArguments: inferSampleArguments(signature),
      });
      continue;
    }

    if (finding.type === "price-manipulation") {
      plans.push({
        attackType: finding.type,
        contractName: analysis.contractName,
        functionNames: [functionName],
        attackHypothesis: finding.attackVector,
        proofGoal:
          "Demonstrate that skewed AMM reserves cause the price-consuming function to return a manipulated result.",
        expectedOutcome:
          "The observed price or collateral value deviates from the fair-price baseline when reserves are manipulated.",
        callerRole: "attacker",
        assertionKind: "price-oracle-drift",
        sampleArguments: inferSampleArguments(signature),
      });
    }
  }

  return plans;
}

/**
 * Derives cross-contract risk findings by examining the call surface for unprotected price reads and flash loan flows.
 *
 * @param analyses - Array of per-contract analysis results.
 * @param graph - The project-wide dependency graph with call surface data.
 * @returns Array of cross-contract findings describing inter-contract risk signals.
 */
export function deriveCrossContractFindings(
  analyses: ContractAnalysis[],
  graph: ContractDependencyGraph,
): CrossContractFinding[] {
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
        attackVector: `Manipulate the callee's AMM reserves before ${callerAnalysis.contractName} invokes ${edge.functionName}(), causing the caller to act on a skewed price in the same block.`,
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
        attackVector: `Trigger the flash loan callback through ${callerAnalysis.contractName} to manipulate shared state atomically without a reentrancy guard.`,
      });
    }
  }

  return findings;
}
