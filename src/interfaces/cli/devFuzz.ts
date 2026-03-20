import path from "node:path";
import { generateDeveloperFuzzTests } from "../../core/developerFuzz.js";
import { info, success } from "../../utils/logger.js";

export async function runDeveloperFuzzCommand(
  projectRoot: string,
  options: {
    contract?: string;
    function?: string;
  }
): Promise<void> {
  const result = await generateDeveloperFuzzTests({
    projectRoot,
    contractSelector: options.contract,
    functionSelector: options.function,
    executionContext: "cli"
  });

  success(`Analyzed ${result.analysis.contractName}`);
  info(`Selected functions: ${result.generatedTests.map((generated) => generated.functionName).join(", ") || "none"}`);
  info(`Generated developer fuzz tests: ${result.generatedTests.length}`);

  if (result.generatedTests.length > 0) {
    info("Generated test files:");
    for (const generatedTest of result.generatedTests) {
      info(`- ${path.relative(projectRoot, generatedTest.testFilePath)}`);
    }
  }

  if (result.skippedFunctions.length > 0) {
    info(`Skipped functions: ${result.skippedFunctions.join(", ")}`);
  }

  const familiesByFunction = new Map<string, Set<string>>();
  for (const plan of result.plans) {
    if (!familiesByFunction.has(plan.functionName)) {
      familiesByFunction.set(plan.functionName, new Set());
    }
    familiesByFunction.get(plan.functionName)?.add(plan.family);
  }

  info("Fuzz families:");
  for (const [functionName, families] of familiesByFunction.entries()) {
    info(`- ${functionName}: ${[...families].join(", ")}`);
  }
}
