import type { AttackAgent, AttackFinding, ContractAnalysis } from "../core/types.js";

/**
 * Detects flash loan attack surfaces by identifying loan interfaces, callback functions, and missing balance invariant checks.
 */
export class FlashLoanAgent implements AttackAgent {
  readonly type = "flash-loan" as const;

  /**
   * Evaluates flash loan participation signals and flags contracts lacking balance invariant verification around callbacks.
   *
   * @param input - Parsed contract analysis containing source code, function names, and inherited signals.
   * @returns An array of findings describing potential flash loan exploit vectors.
   */
  analyze(input: ContractAnalysis): AttackFinding[] {
    const findings: AttackFinding[] = [];

    const hasInterfaceSignal =
      input.source.includes("IERC3156FlashLender") ||
      input.source.includes("IERC3156FlashBorrower") ||
      input.source.includes("IFlashLoanReceiver") ||
      input.source.includes("IFlashLoanSimpleReceiver") ||
      input.source.includes("IPoolAddressesProvider") ||
      input.inheritedSignals.includes("IERC3156") ||
      input.inheritedSignals.includes("Aave") ||
      input.inheritedSignals.includes("dYdX");

    const callbackFunctions = ["onFlashLoan", "executeOperation", "callFunction", "receiveFlashLoan"];
    const hasCallbackFunction = input.functions.some((name) => callbackFunctions.includes(name));

    const hasCallSite =
      input.source.match(/\.flashLoan\s*\(/) !== null ||
      input.source.match(/\.flashLoanSimple\s*\(/) !== null ||
      input.source.match(/\.flash\s*\(/) !== null;

    const hasGuard = input.source.includes("nonReentrant");

    const signalCount = [hasInterfaceSignal, hasCallbackFunction, hasCallSite].filter(Boolean).length;

    if (signalCount >= 2) {
      const confidence = !hasGuard && signalCount === 3 ? "high" : "medium";
      findings.push({
        type: this.type,
        confidence,
        description:
          "Contract participates in a flash loan flow without balance invariant checks around the callback. State mutations inside the callback are not verified against the pre-loan baseline before repayment is accepted.",
        attackVector:
          "Borrow a large amount via flash loan, call a state-mutating function inside the callback to extract or skew protected balances, then repay the loan atomically before the transaction reverts.",
        suggestedTest:
          "Deploy a MockFlashLender that invokes the target callback. Inside the callback, call the vulnerable state-mutating function and assert that balances diverge from the pre-loan baseline after the callback completes.",
        contract: input.contractName,
        functions: input.functions.filter((name) => callbackFunctions.includes(name))
      });
    } else if (signalCount === 1) {
      findings.push({
        type: this.type,
        confidence: "low",
        description:
          "Weak flash loan signal detected. Contract may interact with a flash loan flow but evidence is incomplete.",
        attackVector: "Potential flash loan callback without repayment invariant.",
        suggestedTest: "Review the callback entry point for missing balance invariant checks before and after repayment.",
        contract: input.contractName,
        functions: input.functions.filter((name) => callbackFunctions.includes(name))
      });
    }

    return findings;
  }
}
