import { promises as fs } from "node:fs";
import path from "node:path";
import type {
  AttackPipelineInput,
  AttackType,
  ContractAnalysis,
  ContractDependencyEdge,
  ContractDependencyGraph,
} from "./types";

const CONTRACT_REGEX = /contract\s+([A-Za-z_][A-Za-z0-9_]*)/g;
const FUNCTION_REGEX = /function\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g;

/**
 * Validates that the given directory contains a Foundry project by checking for foundry.toml.
 *
 * @param projectRoot - Absolute path to the project root directory.
 * @returns Resolves when the project is confirmed; throws if foundry.toml is missing.
 */
export async function ensureFoundryProject(projectRoot: string): Promise<void> {
  const foundryToml = path.join(projectRoot, "foundry.toml");
  try {
    await fs.access(foundryToml);
  } catch {
    throw new Error(
      `Foundry project not detected at ${projectRoot}. Missing foundry.toml`,
    );
  }
}

/**
 * Recursively discovers all Solidity contract files under the project's src directory.
 *
 * @param projectRoot - Absolute path to the Foundry project root.
 * @returns Sorted array of absolute paths to discovered .sol files.
 */
export async function discoverContracts(
  projectRoot: string,
): Promise<string[]> {
  await ensureFoundryProject(projectRoot);
  const srcDir = path.join(projectRoot, "src");
  const stack = [srcDir];
  const contracts: string[] = [];

  while (stack.length > 0) {
    const current = stack.pop()!;
    const entries = await fs
      .readdir(current, { withFileTypes: true })
      .catch(() => []);
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.isFile() && entry.name.endsWith(".sol")) {
        contracts.push(fullPath);
      }
    }
  }

  return contracts.sort();
}

/**
 * Selects a single contract file by name or partial path, or returns the first discovered contract when no selector is given.
 *
 * @param projectRoot - Absolute path to the Foundry project root.
 * @param selector - Optional contract name or partial path to match against discovered contracts.
 * @returns Absolute path to the matched contract file.
 */
export async function selectContract(
  projectRoot: string,
  selector?: string,
): Promise<string> {
  const contracts = await discoverContracts(projectRoot);
  if (contracts.length === 0) {
    throw new Error(
      `No Solidity contracts found under ${path.join(projectRoot, "src")}`,
    );
  }

  if (!selector) {
    return contracts[0];
  }

  const normalizedSelector = selector.toLowerCase();
  const matches = contracts.filter((contractPath) => {
    const basename = path.basename(contractPath, ".sol").toLowerCase();
    return (
      contractPath.toLowerCase().includes(normalizedSelector) ||
      basename === normalizedSelector
    );
  });

  if (matches.length === 1) {
    return matches[0];
  }

  if (matches.length > 1) {
    throw new Error(`Contract selector "${selector}" is ambiguous`);
  }

  throw new Error(`Contract selector "${selector}" did not match any contract`);
}

/**
 * Extracts the primary contract name from Solidity source, falling back to the file basename.
 *
 * @param source - Raw Solidity source code.
 * @param contractPath - File path used as fallback for the contract name.
 * @returns The extracted contract name.
 */
function extractContractName(source: string, contractPath: string): string {
  const matches = [...source.matchAll(CONTRACT_REGEX)];
  if (matches.length > 0) {
    return matches[0][1];
  }
  return path.basename(contractPath, ".sol");
}

/**
 * Extracts all function names from Solidity source code.
 *
 * @param source - Raw Solidity source code.
 * @returns Array of function name strings.
 */
function extractFunctions(source: string): string[] {
  return [...source.matchAll(FUNCTION_REGEX)].map((match) => match[1]);
}

/**
 * Detects inherited contract signals (e.g. Ownable, ERC20, ReentrancyGuard) from source code.
 *
 * @param source - Raw Solidity source code.
 * @returns Array of detected inherited signal identifiers.
 */
function extractInheritedSignals(source: string): string[] {
  const signals = new Set<string>();
  if (source.includes("Ownable")) {
    signals.add("Ownable");
  }
  if (source.includes("ERC20")) {
    signals.add("ERC20");
  }
  if (source.includes("ReentrancyGuard")) {
    signals.add("ReentrancyGuard");
  }
  if (source.includes("AccessControl")) {
    signals.add("AccessControl");
  }
  // Flash loan interface signals
  if (
    source.includes("IERC3156") ||
    source.includes("IFlashLoanReceiver") ||
    source.includes("IFlashLoanSimpleReceiver")
  ) {
    signals.add("IERC3156");
  }
  if (
    source.includes("Aave") ||
    source.includes("IPool") ||
    source.includes("IPoolAddressesProvider")
  ) {
    signals.add("Aave");
  }
  if (source.includes("dYdX") || source.includes("ISoloMargin")) {
    signals.add("dYdX");
  }
  // AMM / oracle signals
  if (
    source.includes("IUniswapV2") ||
    source.includes("IUniswapV3") ||
    source.includes("ICurvePool")
  ) {
    signals.add("AMM");
  }
  if (
    source.includes("AggregatorV3Interface") ||
    source.includes("latestRoundData") ||
    source.includes("Chainlink")
  ) {
    signals.add("Chainlink");
  }
  return [...signals];
}

/**
 * Detects risk signals (e.g. low-level calls, unchecked blocks, flash-loan callbacks) from source code.
 *
 * @param source - Raw Solidity source code.
 * @returns Array of detected risk signal identifiers.
 */
function extractRiskSignals(source: string): string[] {
  const signals = new Set<string>();
  if (source.match(/call\s*\{/)) {
    signals.add("low-level-call");
  }
  if (source.includes("tx.origin")) {
    signals.add("tx-origin");
  }
  if (source.match(/\bowner\b/)) {
    signals.add("owner-state");
  }
  if (source.match(/\+\+|--|\+=|-=|\*=/)) {
    signals.add("arithmetic-mutation");
  }
  if (source.includes("unchecked")) {
    signals.add("unchecked-block");
  }
  // Flash loan callback signals
  if (
    source.match(/\.flashLoan\s*\(/) ||
    source.match(/\.flashLoanSimple\s*\(/) ||
    source.match(/\.flash\s*\(/) ||
    source.includes("onFlashLoan") ||
    source.includes("executeOperation") ||
    source.includes("receiveFlashLoan")
  ) {
    signals.add("flash-loan-callback");
  }
  // Spot price read signals
  if (
    source.match(/getReserves\s*\(/) ||
    source.match(/getPrice\s*\(/) ||
    source.match(/slot0\s*\(/)
  ) {
    signals.add("spot-price-read");
  }
  if (source.match(/latestAnswer\s*\(/) && !source.match(/updatedAt\s*[><!]/)) {
    signals.add("stale-oracle-read");
  }
  return [...signals];
}

/**
 * Determines which attack agents should be run based on source patterns, functions, and signals.
 *
 * @param source - Raw Solidity source code.
 * @param functions - Extracted function names from the contract.
 * @param inheritedSignals - Detected inherited contract signals.
 * @param riskSignals - Detected risk signals.
 * @returns Array of recommended attack type identifiers.
 */
function recommendAgents(
  _source: string,
  functions: string[],
  inheritedSignals: string[],
  riskSignals: string[],
): AttackType[] {
  const agents = new Set<AttackType>();

  if (
    riskSignals.includes("low-level-call") ||
    functions.some((name) => ["withdraw", "claim", "execute"].includes(name))
  ) {
    agents.add("reentrancy");
  }

  if (
    inheritedSignals.includes("Ownable") ||
    inheritedSignals.includes("AccessControl") ||
    riskSignals.includes("owner-state") ||
    functions.some((name) =>
      ["mint", "burn", "pause", "upgrade"].includes(name),
    )
  ) {
    agents.add("access-control");
  }

  if (
    riskSignals.includes("arithmetic-mutation") ||
    riskSignals.includes("unchecked-block")
  ) {
    agents.add("arithmetic");
  }

  if (
    riskSignals.includes("flash-loan-callback") ||
    inheritedSignals.includes("IERC3156") ||
    inheritedSignals.includes("Aave") ||
    inheritedSignals.includes("dYdX") ||
    functions.some((name) =>
      [
        "onFlashLoan",
        "executeOperation",
        "callFunction",
        "receiveFlashLoan",
      ].includes(name),
    )
  ) {
    agents.add("flash-loan");
  }

  if (
    riskSignals.includes("spot-price-read") ||
    riskSignals.includes("stale-oracle-read") ||
    inheritedSignals.includes("AMM") ||
    functions.some((name) =>
      ["getPrice", "getReserves", "latestAnswer"].includes(name),
    )
  ) {
    agents.add("price-manipulation");
  }

  if (agents.size === 0) {
    agents.add("reentrancy");
    agents.add("access-control");
    agents.add("arithmetic");
  }

  return [...agents];
}

/**
 * Resolves imported file paths from Solidity import statements, excluding external packages.
 *
 * @param source - Raw Solidity source code.
 * @param contractPath - Absolute path of the importing contract file for resolution.
 * @returns Array of resolved absolute paths for local imports.
 */
function extractImportedPaths(source: string, contractPath: string): string[] {
  const importRegex = /import\s+(?:\{[^}]+\}\s+from\s+|)["']([^"']+)["']/g;
  const resolved: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = importRegex.exec(source)) !== null) {
    const importPath = match[1];
    if (!importPath.startsWith("@") && !importPath.startsWith("forge-std")) {
      resolved.push(path.resolve(path.dirname(contractPath), importPath));
    }
  }
  return resolved;
}

/**
 * Performs static analysis on a single contract, extracting functions, risk signals, and recommended attack agents.
 *
 * @param input - Pipeline input containing the project root and optional contract selector.
 * @returns Analysis result with contract metadata, functions, risk signals, and recommended agents.
 */
export async function analyzeContract(
  input: AttackPipelineInput,
): Promise<ContractAnalysis> {
  const contractPath = await selectContract(
    input.projectRoot,
    input.contractSelector,
  );
  const source = await fs.readFile(contractPath, "utf8");
  const functions = extractFunctions(source);
  const inheritedSignals = extractInheritedSignals(source);
  const riskSignals = extractRiskSignals(source);
  const importedPaths = extractImportedPaths(source, contractPath);

  return {
    contractName: extractContractName(source, contractPath),
    contractPath,
    functions,
    inheritedSignals,
    riskSignals,
    recommendedAgents: recommendAgents(
      source,
      functions,
      inheritedSignals,
      riskSignals,
    ),
    source,
    importedPaths,
  };
}

/**
 * Analyzes a single contract file by its absolute path, extracting all metadata.
 *
 * @param contractPath - Absolute path to the Solidity contract file.
 * @param projectRoot - Absolute path to the Foundry project root.
 * @returns Contract analysis result with functions, signals, and recommended agents.
 */
async function analyzeContractByPath(
  contractPath: string,
  _projectRoot: string,
): Promise<ContractAnalysis> {
  const source = await fs.readFile(contractPath, "utf8");
  const functions = extractFunctions(source);
  const inheritedSignals = extractInheritedSignals(source);
  const riskSignals = extractRiskSignals(source);
  const importedPaths = extractImportedPaths(source, contractPath);

  return {
    contractName: extractContractName(source, contractPath),
    contractPath,
    functions,
    inheritedSignals,
    riskSignals,
    recommendedAgents: recommendAgents(
      source,
      functions,
      inheritedSignals,
      riskSignals,
    ),
    source,
    importedPaths,
  };
}

/**
 * Builds an import and call-surface dependency graph from a set of contract analyses.
 *
 * @param analyses - Array of contract analysis results to derive edges from.
 * @returns Dependency graph with nodes, import edges, and cross-contract call surface entries.
 */
export function buildDependencyGraph(
  analyses: ContractAnalysis[],
): ContractDependencyGraph {
  const nodes = analyses.map((a) => a.contractPath);
  const pathToAnalysis = new Map(analyses.map((a) => [a.contractPath, a]));
  const edges: ContractDependencyEdge[] = [];

  for (const analysis of analyses) {
    for (const importedPath of analysis.importedPaths ?? []) {
      const importedAnalysis = pathToAnalysis.get(importedPath);
      if (importedAnalysis) {
        edges.push({
          importingContract: analysis.contractPath,
          importedPath,
          importedContractNames: [importedAnalysis.contractName],
        });
      }
    }
  }

  // Build call surface: detect `varName.functionName(` patterns and resolve callee by state var type
  const callSurface: ContractDependencyGraph["callSurface"] = [];
  const stateVarTypeRegex =
    /(\w+)\s+(?:public\s+|private\s+|internal\s+)?(\w+)\s*;/g;

  for (const analysis of analyses) {
    const varTypeMap = new Map<string, string>();
    let m: RegExpExecArray | null;
    const re = new RegExp(stateVarTypeRegex.source, "g");
    while ((m = re.exec(analysis.source)) !== null) {
      const [, typeName, varName] = m;
      varTypeMap.set(varName, typeName);
    }

    const callRegex = /(\w+)\.(\w+)\s*\(/g;
    while ((m = callRegex.exec(analysis.source)) !== null) {
      const [, varName, fnName] = m;
      const typeName = varTypeMap.get(varName);
      if (typeName) {
        const calleeAnalysis = analyses.find(
          (a) => a.contractName === typeName,
        );
        if (
          calleeAnalysis &&
          calleeAnalysis.contractPath !== analysis.contractPath
        ) {
          callSurface.push({
            caller: analysis.contractPath,
            callee: calleeAnalysis.contractPath,
            functionName: fnName,
          });
        }
      }
    }
  }

  return { nodes, edges, callSurface };
}

/**
 * Analyzes every Solidity contract in the project and builds a cross-contract dependency graph.
 *
 * @param projectRoot - Absolute path to the Foundry project root.
 * @returns Object containing the per-contract analyses and the assembled dependency graph.
 */
export async function analyzeAllContracts(
  projectRoot: string,
): Promise<{ analyses: ContractAnalysis[]; graph: ContractDependencyGraph }> {
  const paths = await discoverContracts(projectRoot);
  const analyses = await Promise.all(
    paths.map((contractPath) =>
      analyzeContractByPath(contractPath, projectRoot),
    ),
  );
  const graph = buildDependencyGraph(analyses);
  return { analyses, graph };
}
