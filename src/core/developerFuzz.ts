import path from "node:path";
import { promises as fs } from "node:fs";
import { analyzeContract } from "./planner.js";
import {
  parsePublicFunctionSignatures,
  parsePublicStateVariables,
  sanitizeIdentifier,
  type FunctionSignature,
  type PublicStateVariable
} from "./solidity.js";
import type { AttackPipelineInput, DeveloperFuzzPlan, DeveloperFuzzResult, DeveloperGeneratedTest } from "./types.js";

/**
 * Selects the best public state variable to observe for a given function signature.
 *
 * @param source - Raw Solidity source code.
 * @param signature - The function signature being tested.
 * @returns The most suitable public state variable, or undefined if none found.
 */
function chooseObservableState(source: string, signature: FunctionSignature): PublicStateVariable | undefined {
  const variables = parsePublicStateVariables(source);
  if (signature.paramTypes.length >= 2 && signature.paramTypes[0] === "address" && signature.paramTypes[1].startsWith("uint")) {
    return variables.find((variable) => variable.type.startsWith("mapping") && variable.keyType === "address");
  }
  return variables.find((variable) => variable.type.startsWith("uint")) ?? variables.find((variable) => variable.type.startsWith("mapping"));
}

/**
 * Builds a Solidity expression to read the value of an observable state variable.
 *
 * @param variable - The public state variable to observe.
 * @param signature - The function signature (used to determine key argument naming).
 * @returns Solidity expression string for reading the variable.
 */
function buildObservedExpression(variable: PublicStateVariable, signature: FunctionSignature): string {
  if (variable.type.startsWith("mapping")) {
    const keyType = variable.keyType?.trim() ?? "address";
    const keyArgName = keyType === "address" ? "actor" : "key";
    return `target.${variable.name}(${keyArgName})`;
  }
  return `target.${variable.name}()`;
}

/**
 * Generates typed argument declarations for a fuzz test function based on parameter types.
 *
 * @param signature - The function signature to derive argument names and types from.
 * @returns Array of objects with Solidity type and generated argument name.
 */
function buildTypedArgs(signature: FunctionSignature): Array<{ type: string; name: string }> {
  return signature.paramTypes.map((type, index) => {
    if (type === "address") {
      return { type, name: "actor" };
    }
    if (type.startsWith("uint") || type.startsWith("int")) {
      return { type, name: `value${index + 1}` };
    }
    if (type === "bool") {
      return { type, name: `flag${index + 1}` };
    }
    return { type, name: `arg${index + 1}` };
  });
}

/**
 * Builds a comma-separated call argument string from the function signature's typed args.
 *
 * @param signature - The function signature to derive call arguments from.
 * @returns Comma-separated argument names string for use in a Solidity function call.
 */
function buildCallArguments(signature: FunctionSignature): string {
  return buildTypedArgs(signature)
    .map((arg) => arg.name)
    .join(", ");
}

/**
 * Derives the set of fuzz test family plans applicable to a single function.
 *
 * @param contractName - Name of the contract under test.
 * @param signature - The function signature to plan tests for.
 * @param source - Raw Solidity source code of the contract.
 * @returns Array of developer fuzz plans covering applicable test families.
 */
function buildFamilyPlan(contractName: string, signature: FunctionSignature, source: string): DeveloperFuzzPlan[] {
  const plans: DeveloperFuzzPlan[] = [
    {
      contractName,
      functionName: signature.name,
      family: "success-path",
      description: `Exercise ${signature.name} through a broad public success path fuzz run.`
    }
  ];

  if (signature.paramTypes.some((type) => type.startsWith("uint") || type.startsWith("int"))) {
    plans.push({
      contractName,
      functionName: signature.name,
      family: "input-boundary",
      description: `Exercise numeric boundary inputs for ${signature.name}.`
    });
  }

  if (["mint", "burn", "pause", "upgrade"].includes(signature.name)) {
    plans.push({
      contractName,
      functionName: signature.name,
      family: "access-sensitive",
      description: `Exercise ${signature.name} as a privileged-looking mutation path.`
    });
  }

  if (chooseObservableState(source, signature)) {
    plans.push({
      contractName,
      functionName: signature.name,
      family: "state-transition",
      description: `Exercise ${signature.name} while checking an observable state transition.`
    });
  }

  return plans;
}

/**
 * Builds the Solidity fuzz test function body for a specific family plan.
 *
 * @param contractName - Name of the contract under test.
 * @param signature - The function signature being tested.
 * @param source - Raw Solidity source code of the contract.
 * @param plan - The developer fuzz plan specifying the test family.
 * @returns Solidity test function source string, or null if the family cannot be materialized.
 */
function buildTestFunction(contractName: string, signature: FunctionSignature, source: string, plan: DeveloperFuzzPlan): string | null {
  const args = buildTypedArgs(signature);
  const argDecl = args.map((arg) => `${arg.type} ${arg.name}`).join(", ");
  const callArgs = buildCallArguments(signature);
  const observable = chooseObservableState(source, signature);

  if (plan.family === "success-path") {
    return `    function testFuzz_${sanitizeIdentifier(signature.name)}_success(${argDecl}) public {
        ${contractName} target = new ${contractName}();
        target.${signature.name}(${callArgs});
    }
`;
  }

  if (plan.family === "input-boundary") {
    return `    function testFuzz_${sanitizeIdentifier(signature.name)}_numeric_inputs(${argDecl}) public {
        ${contractName} target = new ${contractName}();
        target.${signature.name}(${callArgs});
    }
`;
  }

  if (plan.family === "access-sensitive") {
    if (!observable) {
      return null;
    }
    const observedExpr = buildObservedExpression(observable, signature);
    return `    function testFuzz_${sanitizeIdentifier(signature.name)}_access_sensitive(${argDecl}) public {
        ${contractName} target = new ${contractName}();
        uint256 beforeValue = uint256(${observedExpr});
        target.${signature.name}(${callArgs});
        uint256 afterValue = uint256(${observedExpr});
        require(afterValue >= beforeValue, "access-sensitive path did not preserve observable monotonicity");
    }
`;
  }

  if (plan.family === "state-transition") {
    if (!observable) {
      return null;
    }
    const observedExpr = buildObservedExpression(observable, signature);
    const directionCheck =
      ["decrement", "burn", "withdraw"].includes(signature.name)
        ? 'require(afterValue <= beforeValue, "observable state unexpectedly increased");'
        : 'require(afterValue >= beforeValue, "observable state unexpectedly decreased");';
    return `    function testFuzz_${sanitizeIdentifier(signature.name)}_state_transition(${argDecl}) public {
        ${contractName} target = new ${contractName}();
        uint256 beforeValue = uint256(${observedExpr});
        target.${signature.name}(${callArgs});
        uint256 afterValue = uint256(${observedExpr});
        ${directionCheck}
    }
`;
  }

  return null;
}

/**
 * Generates developer-oriented fuzz test files for public functions of a target contract.
 *
 * @param input - Object containing the project root, optional contract/function selectors, goal, and execution context.
 * @returns Result including analysis, generated fuzz test plans, test files, and any skipped functions.
 */
export async function generateDeveloperFuzzTests(
  input: Pick<AttackPipelineInput, "projectRoot" | "contractSelector"> & {
    functionSelector?: string;
    goal?: string;
    executionContext?: AttackPipelineInput["executionContext"];
  }
): Promise<DeveloperFuzzResult> {
  const analysis = await analyzeContract({
    projectRoot: input.projectRoot,
    contractSelector: input.contractSelector,
    executionContext: input.executionContext ?? "mcp"
  });
  const signatures = parsePublicFunctionSignatures(analysis.source);
  const selectedSignatures = input.functionSelector
    ? signatures.filter((signature) => signature.name === input.functionSelector)
    : signatures;
  const plans = selectedSignatures.flatMap((signature) => buildFamilyPlan(analysis.contractName, signature, analysis.source));

  const skippedFunctions = selectedSignatures
    .filter((signature) => !plans.some((plan) => plan.functionName === signature.name))
    .map((signature) => signature.name);

  const testDir = path.join(input.projectRoot, "test", "raze");
  await fs.mkdir(testDir, { recursive: true });

  const generatedTests = new Map<string, DeveloperGeneratedTest>();
  for (const signature of selectedSignatures) {
    const functionPlans = plans.filter((plan) => plan.functionName === signature.name);
    const testFunctions = functionPlans
      .map((plan) => buildTestFunction(analysis.contractName, signature, analysis.source, plan))
      .filter((source): source is string => Boolean(source));

    if (testFunctions.length === 0) {
      skippedFunctions.push(signature.name);
      continue;
    }

    const fileName = `${analysis.contractName}.${sanitizeIdentifier(signature.name)}.fuzz.t.sol`;
    const testFilePath = path.join(testDir, fileName);
    const relativeImport = path.relative(path.dirname(testFilePath), analysis.contractPath).replace(/\\/g, "/");
    const contractImport = relativeImport.startsWith(".") ? relativeImport : `./${relativeImport}`;
    const source = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {${analysis.contractName}} from "${contractImport}";

contract ${analysis.contractName}${sanitizeIdentifier(signature.name)}DeveloperFuzzTest {
${testFunctions.join("\n")}
}
`;
    await fs.writeFile(testFilePath, source, "utf8");
    generatedTests.set(signature.name, {
      contractName: analysis.contractName,
      functionName: signature.name,
      family: functionPlans[0]?.family ?? "success-path",
      testFilePath,
      source
    });
  }

  return {
    projectRoot: input.projectRoot,
    analysis,
    plans,
    generatedTests: [...generatedTests.values()],
    skippedFunctions: [...new Set(skippedFunctions)]
  };
}
