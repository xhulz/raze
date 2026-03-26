import { AccessControlAgent } from "../agents/accessControl.agent";
import { ArithmeticAgent } from "../agents/arithmetic.agent";
import { FlashLoanAgent } from "../agents/flashLoan.agent";
import { PriceManipulationAgent } from "../agents/priceManipulation.agent";
import { ReentrancyAgent } from "../agents/reentrancy.agent";
import type { AttackAgent, AttackFinding, ContractAnalysis } from "./types";

const AGENTS: Record<string, AttackAgent> = {
  reentrancy: new ReentrancyAgent(),
  "access-control": new AccessControlAgent(),
  arithmetic: new ArithmeticAgent(),
  "flash-loan": new FlashLoanAgent(),
  "price-manipulation": new PriceManipulationAgent(),
};

/**
 * Runs all recommended deterministic attack agents against a contract analysis and collects findings.
 *
 * @param analysis - Contract analysis containing recommended agents, source, and risk signals.
 * @returns Array of attack findings produced by the executed agents.
 */
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
