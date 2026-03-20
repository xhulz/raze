import { AccessControlAgent } from "../agents/accessControl.agent.js";
import { ArithmeticAgent } from "../agents/arithmetic.agent.js";
import { ReentrancyAgent } from "../agents/reentrancy.agent.js";
import type { AttackAgent, AttackFinding, ContractAnalysis } from "./types.js";

const AGENTS: Record<string, AttackAgent> = {
  reentrancy: new ReentrancyAgent(),
  "access-control": new AccessControlAgent(),
  arithmetic: new ArithmeticAgent()
};

export function runAttackAgents(analysis: ContractAnalysis): AttackFinding[] {
  const findings: AttackFinding[] = [];

  for (const agentType of analysis.recommendedAgents) {
    const agent = AGENTS[agentType];
    if (!agent) {
      continue;
    }
    findings.push(...agent.analyze(analysis));
  }

  return findings;
}
