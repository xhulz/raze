export type AttackType = "reentrancy" | "access-control" | "arithmetic" | "flash-loan" | "price-manipulation";

export type Confidence = "low" | "medium" | "high";

export type AssertionKind = "unauthorized-state-change" | "arithmetic-drift" | "reentrant-state-inconsistency" | "flash-loan-extraction" | "price-oracle-drift";
export type AnalysisSource = "heuristic" | "ai-orchestrated";
export type HypothesisStatus = "none" | "ai-proposed" | "validated";
export type ProofStatus = "no-scaffold" | "scaffold-generated" | "executed";

export interface AttackPipelineInput {
  projectRoot: string;
  contractSelector?: string;
  runForge?: boolean;
  offline?: boolean;
  attackPlan?: AttackPlanInput;
  executionContext: "cli" | "mcp";
}

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

export interface AttackFinding {
  type: AttackType;
  confidence: Confidence;
  description: string;
  attackVector: string;
  suggestedTest: string;
  contract: string;
  functions: string[];
}

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

export interface ValidatedAttackPlan extends AttackPlanInput {
  contractName: string;
  contractPath: string;
  resolvedFunctions: string[];
  planSource: "ai-authored" | "heuristic-fallback";
  targetStateVariableType?: string;
  targetStateVariableKeyType?: string;
  normalizedSampleArguments: Array<string | number | boolean>;
  flashLoanRole?: "lender" | "receiver";
}

export interface GeneratedTest {
  findingType: AttackType;
  testFilePath: string;
  source: string;
  planSource: "ai-authored" | "heuristic-fallback";
  proofIntent: string;
}

export interface DeveloperFuzzPlan {
  contractName: string;
  functionName: string;
  family: "success-path" | "input-boundary" | "access-sensitive" | "state-transition";
  description: string;
}

export interface DeveloperGeneratedTest {
  contractName: string;
  functionName: string;
  family: DeveloperFuzzPlan["family"];
  testFilePath: string;
  source: string;
}

export interface DeveloperFuzzResult {
  projectRoot: string;
  analysis: ContractAnalysis;
  plans: DeveloperFuzzPlan[];
  generatedTests: DeveloperGeneratedTest[];
  skippedFunctions: string[];
}

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

export interface AttackAssessment {
  findingStatus: "no-findings" | "heuristic-findings";
  testStatus: "no-tests" | "proof-scaffolds-generated";
  executionStatus: "not-run" | "forge-passed" | "forge-failed";
  confirmationStatus: "none" | "suspected-only" | "validated-plan" | "executed-scaffold" | "confirmed-by-execution";
  decision: "fix-now" | "investigate" | "review" | "no-action";
  decisionReason: string;
  interpretation: string;
}

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

export interface HardeningSuggestion {
  title: string;
  issue: string;
  whyItMatters: string;
  recommendedChange: string;
  confidence: Confidence;
  behaviorChange: boolean;
  followUpTest: string;
}

export interface HardeningSuggestionResult {
  projectRoot: string;
  analysis: ContractAnalysis;
  findings: AttackFinding[];
  suggestions: HardeningSuggestion[];
}

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

export interface AttackSuiteResult {
  projectRoot: string;
  analysis: ContractAnalysis;
  suiteMode: "ai-authored" | "heuristic-fallback";
  planResults: AttackSuitePlanResult[];
  familySummary: AttackSuiteFamilyResult[];
  forgeRun?: ForgeRunResult;
  reportPath: string;
}

export interface AttackAgent {
  type: AttackType;
  analyze(input: ContractAnalysis): AttackFinding[];
}

export interface ContractDependencyEdge {
  importingContract: string;
  importedPath: string;
  importedContractNames: string[];
}

export interface ContractDependencyGraph {
  nodes: string[];
  edges: ContractDependencyEdge[];
  callSurface: Array<{
    caller: string;
    callee: string;
    functionName: string;
  }>;
}

export interface CrossContractFinding {
  type: AttackType;
  confidence: Confidence;
  callerContract: string;
  calleeContract: string;
  calleeFunction: string;
  description: string;
  attackVector: string;
}

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
