import path from "node:path";
import { promises as fs } from "node:fs";
import type { AttackPipelineInput, AttackType, ContractAnalysis } from "./types.js";

const CONTRACT_REGEX = /contract\s+([A-Za-z_][A-Za-z0-9_]*)/g;
const FUNCTION_REGEX = /function\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g;

export async function ensureFoundryProject(projectRoot: string): Promise<void> {
  const foundryToml = path.join(projectRoot, "foundry.toml");
  try {
    await fs.access(foundryToml);
  } catch {
    throw new Error(`Foundry project not detected at ${projectRoot}. Missing foundry.toml`);
  }
}

export async function discoverContracts(projectRoot: string): Promise<string[]> {
  await ensureFoundryProject(projectRoot);
  const srcDir = path.join(projectRoot, "src");
  const stack = [srcDir];
  const contracts: string[] = [];

  while (stack.length > 0) {
    const current = stack.pop()!;
    const entries = await fs.readdir(current, { withFileTypes: true }).catch(() => []);
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

export async function selectContract(projectRoot: string, selector?: string): Promise<string> {
  const contracts = await discoverContracts(projectRoot);
  if (contracts.length === 0) {
    throw new Error(`No Solidity contracts found under ${path.join(projectRoot, "src")}`);
  }

  if (!selector) {
    return contracts[0];
  }

  const normalizedSelector = selector.toLowerCase();
  const matches = contracts.filter((contractPath) => {
    const basename = path.basename(contractPath, ".sol").toLowerCase();
    return contractPath.toLowerCase().includes(normalizedSelector) || basename === normalizedSelector;
  });

  if (matches.length === 1) {
    return matches[0];
  }

  if (matches.length > 1) {
    throw new Error(`Contract selector "${selector}" is ambiguous`);
  }

  throw new Error(`Contract selector "${selector}" did not match any contract`);
}

function extractContractName(source: string, contractPath: string): string {
  const matches = [...source.matchAll(CONTRACT_REGEX)];
  if (matches.length > 0) {
    return matches[0][1];
  }
  return path.basename(contractPath, ".sol");
}

function extractFunctions(source: string): string[] {
  return [...source.matchAll(FUNCTION_REGEX)].map((match) => match[1]);
}

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
  return [...signals];
}

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
  return [...signals];
}

function recommendAgents(source: string, functions: string[], inheritedSignals: string[], riskSignals: string[]): AttackType[] {
  const agents = new Set<AttackType>();

  if (riskSignals.includes("low-level-call") || functions.some((name) => ["withdraw", "claim", "execute"].includes(name))) {
    agents.add("reentrancy");
  }

  if (
    inheritedSignals.includes("Ownable") ||
    inheritedSignals.includes("AccessControl") ||
    riskSignals.includes("owner-state") ||
    functions.some((name) => ["mint", "burn", "pause", "upgrade"].includes(name))
  ) {
    agents.add("access-control");
  }

  if (riskSignals.includes("arithmetic-mutation") || riskSignals.includes("unchecked-block")) {
    agents.add("arithmetic");
  }

  if (agents.size === 0) {
    agents.add("reentrancy");
    agents.add("access-control");
    agents.add("arithmetic");
  }

  return [...agents];
}

export async function analyzeContract(input: AttackPipelineInput): Promise<ContractAnalysis> {
  const contractPath = await selectContract(input.projectRoot, input.contractSelector);
  const source = await fs.readFile(contractPath, "utf8");
  const functions = extractFunctions(source);
  const inheritedSignals = extractInheritedSignals(source);
  const riskSignals = extractRiskSignals(source);

  return {
    contractName: extractContractName(source, contractPath),
    contractPath,
    functions,
    inheritedSignals,
    riskSignals,
    recommendedAgents: recommendAgents(source, functions, inheritedSignals, riskSignals),
    source
  };
}
