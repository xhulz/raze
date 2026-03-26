import path from "node:path";
import { promises as fs } from "node:fs";
import type { AttackPipelineResult } from "./types.js";
import { deriveSeverity, describeVerdictSummary, interpretForgeResult } from "./presentation.js";
import { suggestionsFromFindings } from "./hardening.js";

/**
 * Writes a Markdown security report summarizing findings, verdicts, proof scaffolds, and next steps.
 *
 * @param result - Pipeline result data excluding the report path (which this function generates).
 * @returns Absolute path to the written report file.
 */
export async function writeReport(result: Omit<AttackPipelineResult, "reportPath">): Promise<string> {
  const reportsDir = path.join(result.projectRoot, ".raze", "reports");
  await fs.mkdir(reportsDir, { recursive: true });

  const reportPath = path.join(reportsDir, "fuzz.md");

  const suggestions = suggestionsFromFindings(result.findings);
  const fixByType = new Map<string, (typeof suggestions)[0]>();
  for (const finding of result.findings) {
    const match = suggestions.find((s) => {
      if (finding.type === "access-control") return s.title.includes("authorization");
      if (finding.type === "reentrancy") return s.title.includes("Finalize");
      if (finding.type === "arithmetic") return s.title.includes("arithmetic");
      if (finding.type === "flash-loan") return s.title.includes("flash loan");
      if (finding.type === "price-manipulation") return s.title.includes("price");
      return false;
    });
    if (match) fixByType.set(finding.type, match);
  }

  // Verdict table
  const decisionLabel = result.assessment.decision.toUpperCase();
  const verdictSummary = describeVerdictSummary(result.assessment, result.findings);

  const verdictTable =
    result.findings.length > 0
      ? `| # | Type | Contract | Function(s) | Severity |\n|---|---|---|---|---|\n` +
        result.findings
          .map((f, i) => {
            const severity = deriveSeverity(f.confidence, result.assessment.decision);
            return `| ${i + 1} | ${f.type} | ${f.contract} | ${f.functions.join(", ") || "—"} | ${severity} |`;
          })
          .join("\n")
      : "_No concrete risk signals were identified._";

  // Finding blocks — one per finding, everything inline
  const findingBlocks =
    result.findings.length > 0
      ? result.findings
          .map((finding, index) => {
            const severity = deriveSeverity(finding.confidence, result.assessment.decision);
            const scaffold = result.generatedTests.find((t) => t.findingType === finding.type);
            const scaffoldLine = scaffold
              ? `**Proof test:** \`${path.relative(result.projectRoot, scaffold.testFilePath)}\``
              : "_No proof scaffold was generated for this finding._";
            const fix = fixByType.get(finding.type);
            const fixBlock = fix
              ? `**How to fix:** ${fix.title}\n- Why it matters: ${fix.whyItMatters}\n- What to change: ${fix.recommendedChange}`
              : "";
            // Include hypothesis only when AI-authored and different from the generic attack vector
            const plan = result.validatedPlans.find((p) => p.attackType === finding.type);
            const hypothesisLine =
              plan && plan.planSource === "ai-authored" && plan.attackHypothesis !== finding.attackVector
                ? `**Attack hypothesis:** ${plan.attackHypothesis}`
                : "";

            return `### Finding ${index + 1} — ${finding.type} [${severity}]

**Contract:** ${finding.contract}
**Functions:** ${finding.functions.join(", ") || "—"}
**What:** ${finding.description}
**How it's exploited:** ${finding.attackVector}
${hypothesisLine ? `${hypothesisLine}  \n` : ""}
${fixBlock}

${scaffoldLine}`;
          })
          .join("\n\n---\n\n")
      : "_No concrete risk signals were identified by the current agents._";

  // Next step — one clear action
  const scaffoldPath =
    result.generatedTests.length > 0
      ? path.relative(result.projectRoot, result.generatedTests[0]!.testFilePath)
      : null;

  const nextStep = buildNextStep(result.assessment.confirmationStatus, scaffoldPath, result.forgeRun?.command);

  // Execution block
  const forgeInterpretation = interpretForgeResult(result.forgeRun);
  const executionBlock = result.forgeRun
    ? `## Execution\n\n- Command: \`${result.forgeRun.command}\`\n- ${forgeInterpretation}`
    : `## Execution\n\n- ${forgeInterpretation}`;

  // Cross-contract section
  const crossContractSection = result.crossContractFindings?.length
    ? `## Cross-Contract Risk Signals\n\n${result.crossContractFindings
        .map(
          (f, i) =>
            `### ${i + 1}. ${f.type} (${f.confidence})\n\n- Caller: ${f.callerContract}\n- Callee: ${f.calleeContract}.${f.calleeFunction}()\n- What: ${f.description}\n- Attack vector: ${f.attackVector}\n`
        )
        .join("\n")}`
    : "";

  const content = `# Raze Security Report — ${result.analysis.contractName}

## Verdict: ${decisionLabel}

> ${verdictSummary}

${verdictTable}

---

## Findings

${findingBlocks}

---

## What to do next

${nextStep}

---

${executionBlock}
${crossContractSection ? `\n${crossContractSection}` : ""}
---

_Analysis source: ${result.analysisSource} · ${result.generatedTests.length} proof scaffold(s) generated in this run_
`;

  await fs.writeFile(reportPath, content, "utf8");
  return reportPath;
}

function buildNextStep(
  confirmationStatus: string,
  scaffoldPath: string | null,
  forgeCommand: string | undefined
): string {
  const matchFlag = scaffoldPath ? `--match-path ${scaffoldPath} ` : "";
  const root = forgeCommand?.match(/--root ([^\s]+)/)?.[1] ?? ".";
  const cmd = `forge test --root ${root} ${matchFlag.trim()} -vv`;

  switch (confirmationStatus) {
    case "confirmed-by-execution":
      return `The vulnerability was confirmed by execution. Apply the fix described above, then re-run the proof scaffold to verify the fix is effective:\n\n\`\`\`bash\n${cmd}\n\`\`\`\n\nA reverted test means the fix is working.`;
    case "executed-scaffold":
      return `The scaffold was executed but the result is inconclusive. Run with verbose output to inspect the test behavior:\n\n\`\`\`bash\n${cmd}\n\`\`\``;
    case "validated-plan":
      return `A proof scaffold was generated but not yet run. Execute it to confirm whether the vulnerability is exploitable:\n\n\`\`\`bash\n${cmd}\n\`\`\`\n\nIf the test passes → vulnerability is real. If it reverts → fix is already in place.`;
    case "suspected-only":
      return `Suspicious patterns were found but no proof scaffold was generated. Run the full attack suite to go deeper:\n\n\`\`\`bash\nraze fuzz ${root}\n\`\`\``;
    default:
      return "No vulnerabilities were confirmed. No immediate action required.";
  }
}
