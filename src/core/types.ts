/** Supported vulnerability class identifiers. */
export type AttackType =
  | "reentrancy"
  | "access-control"
  | "arithmetic"
  | "flash-loan"
  | "price-manipulation";

/** Finding confidence level. */
export type Confidence = "low" | "medium" | "high";

/** Assertion kind used to classify proof scaffold goals. */
export type AssertionKind =
  | "unauthorized-state-change"
  | "arithmetic-drift"
  | "reentrant-state-inconsistency"
  | "flash-loan-extraction"
  | "price-oracle-drift";
/** Origin of the contract analysis (heuristic or AI-orchestrated). */
export type AnalysisSource = "heuristic" | "ai-orchestrated";
/** Lifecycle status of an attack hypothesis. */
export type HypothesisStatus = "none" | "ai-proposed" | "validated";
/** Lifecycle status of a proof scaffold. */
export type ProofStatus = "no-scaffold" | "scaffold-generated" | "executed";

/** Top-level input for the attack pipeline. */
export interface AttackPipelineInput {
  projectRoot: string;
  contractSelector?: string;
  runForge?: boolean;
  offline?: boolean;
  attackPlan?: AttackPlanInput;
  executionContext: "cli" | "mcp";
}

/** Static analysis result for a single Solidity contract. */
export interface ContractAnalysis {
  contractName: string;
  contractPath: string;
  functions: string[];
  inheritedSignals: string[];
  riskSignals: string[];
  recommendedAgents: AttackType[];
  source: string;
  importedPaths?: string[];
}

/** A single heuristic attack finding produced by an attack agent. */
export interface AttackFinding {
  type: AttackType;
  confidence: Confidence;
  description: string;
  attackVector: string;
  suggestedTest: string;
  contract: string;
  functions: string[];
}

/** AI-authored or heuristic-derived attack plan before validation. */
export interface AttackPlanInput {
  attackType: AttackType;
  contractName?: string;
  functionNames: string[];
  attackHypothesis: string;
  proofGoal: string;
  expectedOutcome: string;
  callerRole?: string;
  targetStateVariable?: string;
  assertionKind: AssertionKind;
  sampleArguments?: Array<string | number | boolean>;
}

/** Attack plan validated against real contract symbols and ready for scaffold generation. */
export interface ValidatedAttackPlan extends AttackPlanInput {
  contractName: string;
  contractPath: string;
  resolvedFunctions: string[];
  planSource: "ai-authored" | "heuristic-fallback";
  targetStateVariableType?: string;
  targetStateVariableKeyType?: string;
  normalizedSampleArguments: Array<string | number | boolean>;
  flashLoanRole?: "lender" | "receiver";
  reentrancySetupFunction?: string;
  constructorArgs?: string;
}

/** Metadata for a generated Solidity proof-of-concept test file. */
export interface GeneratedTest {
  findingType: AttackType;
  testFilePath: string;
  source: string;
  planSource: "ai-authored" | "heuristic-fallback";
  proofIntent: string;
}

/** Plan describing a developer-oriented fuzz test for a single function. */
export interface DeveloperFuzzPlan {
  contractName: string;
  functionName: string;
  family:
    | "success-path"
    | "input-boundary"
    | "access-sensitive"
    | "state-transition";
  description: string;
}

/** Metadata for a generated developer fuzz test file. */
export interface DeveloperGeneratedTest {
  contractName: string;
  functionName: string;
  family: DeveloperFuzzPlan["family"];
  testFilePath: string;
  source: string;
}

/** Aggregate result of the developer fuzz test generation pipeline. */
export interface DeveloperFuzzResult {
  projectRoot: string;
  analysis: ContractAnalysis;
  plans: DeveloperFuzzPlan[];
  generatedTests: DeveloperGeneratedTest[];
  skippedFunctions: string[];
}

/** Result of a single Forge test execution. */
export interface ForgeRunResult {
  command: string;
  ok: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  summary?: {
    passed: number;
    failed: number;
    skipped: number;
  };
}

/** Structured assessment produced after analyzing findings, plans, and execution results. */
export interface AttackAssessment {
  findingStatus: "no-findings" | "heuristic-findings";
  testStatus: "no-tests" | "proof-scaffolds-generated";
  executionStatus: "not-run" | "forge-passed" | "forge-failed";
  confirmationStatus:
    | "none"
    | "suspected-only"
    | "validated-plan"
    | "executed-scaffold"
    | "confirmed-by-execution";
  decision: "fix-now" | "investigate" | "review" | "no-action";
  decisionReason: string;
  interpretation: string;
}

/** Complete result of the attack pipeline including analysis, tests, assessment, and report. */
export interface AttackPipelineResult {
  projectRoot: string;
  analysis: ContractAnalysis;
  findings: AttackFinding[];
  validatedPlans: ValidatedAttackPlan[];
  generatedTests: GeneratedTest[];
  forgeRun?: ForgeRunResult;
  analysisSource: AnalysisSource;
  hypothesisStatus: HypothesisStatus;
  proofStatus: ProofStatus;
  assessment: AttackAssessment;
  reportPath: string;
  crossContractFindings?: CrossContractFinding[];
}

/** Verification result for a single contract's proof and regression tests. */
export interface VerifyContractResult {
  contractName: string;
  scaffoldFiles: string[];
  proofRun: ForgeRunResult;
  regressionRun: ForgeRunResult;
  verdict: "fix-verified" | "fix-incomplete" | "no-scaffolds" | "error";
  reason: string;
}

/** Aggregate verification result across all contracts in the project. */
export interface VerifyResult {
  projectRoot: string;
  contracts: VerifyContractResult[];
  overallVerdict: "all-fixed" | "some-incomplete" | "no-scaffolds" | "error";
  reportPath: string;
}

/** A single hardening recommendation derived from attack findings. */
export interface HardeningSuggestion {
  title: string;
  issue: string;
  whyItMatters: string;
  recommendedChange: string;
  confidence: Confidence;
  behaviorChange: boolean;
  followUpTest: string;
}

/** Result of the hardening suggestion pipeline for a contract. */
export interface HardeningSuggestionResult {
  projectRoot: string;
  analysis: ContractAnalysis;
  findings: AttackFinding[];
  suggestions: HardeningSuggestion[];
}

/** Per-attack-type aggregated result within an attack suite. */
export interface AttackSuiteFamilyResult {
  attackType: AttackType;
  findings: AttackFinding[];
  validatedPlans: ValidatedAttackPlan[];
  generatedTests: GeneratedTest[];
  analysisSource: AnalysisSource;
  hypothesisStatus: HypothesisStatus;
  proofStatus: ProofStatus;
  assessment: AttackAssessment;
}

/** Result of a single plan execution within an attack suite. */
export interface AttackSuitePlanResult {
  attackType: AttackType;
  authoredPlan?: AttackPlanInput;
  findings: AttackFinding[];
  validatedPlan?: ValidatedAttackPlan;
  generatedTests: GeneratedTest[];
  analysisSource: AnalysisSource;
  hypothesisStatus: HypothesisStatus;
  proofStatus: ProofStatus;
  assessment: AttackAssessment;
}

/** Complete result of a multi-plan attack suite execution. */
export interface AttackSuiteResult {
  projectRoot: string;
  analysis: ContractAnalysis;
  suiteMode: "ai-authored" | "heuristic-fallback";
  planResults: AttackSuitePlanResult[];
  familySummary: AttackSuiteFamilyResult[];
  forgeRun?: ForgeRunResult;
  reportPath: string;
}

/** Interface for a deterministic attack agent that analyzes a contract for a specific vulnerability class. */
export interface AttackAgent {
  type: AttackType;
  analyze(input: ContractAnalysis): AttackFinding[];
}

/** A directed edge in the contract dependency graph representing an import relationship. */
export interface ContractDependencyEdge {
  importingContract: string;
  importedPath: string;
  importedContractNames: string[];
}

/** Dependency graph capturing import relationships and cross-contract call surface. */
export interface ContractDependencyGraph {
  nodes: string[];
  edges: ContractDependencyEdge[];
  callSurface: Array<{
    caller: string;
    callee: string;
    functionName: string;
  }>;
}

/** A cross-contract risk finding derived from the dependency graph call surface. */
export interface CrossContractFinding {
  type: AttackType;
  confidence: Confidence;
  callerContract: string;
  calleeContract: string;
  calleeFunction: string;
  description: string;
  attackVector: string;
}

/** Full project inspection result with per-contract metadata and cross-contract analysis. */
export interface ProjectInspection {
  projectRoot: string;
  contracts: Array<{
    contractName: string;
    contractPath: string;
    functions: string[];
    inheritedSignals: string[];
    riskSignals: string[];
    recommendedAgents: AttackType[];
    importedPaths?: string[];
  }>;
  dependencyGraph: ContractDependencyGraph;
  crossContractFindings: CrossContractFinding[];
}

/** Detected development environment including toolchain versions and MCP targets. */
export interface DetectedEnvironment {
  node: {
    ok: boolean;
    version: string | null;
  };
  forge: {
    ok: boolean;
    version: string | null;
  };
  cursor: {
    detected: boolean;
    configPath: string | null;
  };
  claude: {
    detected: boolean;
    configPath: string | null;
  };
  vscode: {
    detected: boolean;
    configPath: string | null;
    codexExtensionDetected: boolean;
  };
  currentEditor: "cursor" | "claude" | "vscode" | "unknown";
  currentAgent: "codex" | "claude" | "unknown";
  supportedMcpTargets: Array<{
    kind: "vscode" | "cursor" | "claude";
    name: string;
    configPath: string;
  }>;
}
