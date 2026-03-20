import path from "node:path";
import { promises as fs } from "node:fs";
import type { AttackPipelineResult } from "./types.js";
import { formatExecutionSummaryBlock, formatFinalStatusBlock } from "./presentation.js";

export async function writeReport(result: Omit<AttackPipelineResult, "reportPath">): Promise<string> {
  const reportsDir = path.join(result.projectRoot, ".raze", "reports");
  await fs.mkdir(reportsDir, { recursive: true });

  const reportPath = path.join(reportsDir, "fuzz.md");
  const findingLines = result.findings.length
    ? result.findings
        .map(
          (finding, index) =>
            `## ${index + 1}. ${finding.type}\n\n- Contract: ${finding.contract}\n- Confidence: ${finding.confidence}\n- Description: ${finding.description}\n- Attack vector: ${finding.attackVector}\n- Suggested proof strategy: ${finding.suggestedTest}\n- Functions: ${finding.functions.join(", ") || "n/a"}\n`
        )
        .join("\n")
    : "No concrete risk signals were identified by the current deterministic agents.\n";

  const validatedPlanLines = result.validatedPlans.length
    ? result.validatedPlans
        .map(
          (plan, index) =>
            `## ${index + 1}. ${plan.attackType}\n\n- Source: ${plan.planSource}\n- Contract: ${plan.contractName}\n- Functions: ${plan.resolvedFunctions.join(", ")}\n- Hypothesis: ${plan.attackHypothesis}\n- Proof goal: ${plan.proofGoal}\n- Expected outcome: ${plan.expectedOutcome}\n- Assertion kind: ${plan.assertionKind}\n- Target state variable: ${plan.targetStateVariable ?? "not resolved"}\n`
        )
        .join("\n")
    : "No validated attack plans were materialized.\n";

  const testLines = result.generatedTests.length
    ? result.generatedTests
        .map((test) => `- ${path.relative(result.projectRoot, test.testFilePath)} (${test.findingType}, ${test.planSource}, proof scaffold)`)
        .join("\n")
    : "- No proof scaffolds generated";

  const executionBlock = formatExecutionSummaryBlock(
    result.forgeRun,
    result.generatedTests.length,
    "Forge totals cover the whole project run, not only the scaffolds generated in this invocation."
  );

  const content = `# Raze Fuzz Report

## Overview

- Contract: ${result.analysis.contractName}
- Analysis source: ${result.analysisSource}
- Hypothesis status: ${result.hypothesisStatus}
- Proof status: ${result.proofStatus}
- Generated tests in this run: ${result.generatedTests.length}

## Final Status

${formatFinalStatusBlock(result.assessment)}

## Heuristic Findings

${findingLines}
## Validated Attack Plans

${validatedPlanLines}
## Generated Tests In This Run

${testLines}

${executionBlock}`;

  await fs.writeFile(reportPath, content, "utf8");
  return reportPath;
}
