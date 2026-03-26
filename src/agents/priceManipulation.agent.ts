import type {
  AttackAgent,
  AttackFinding,
  ContractAnalysis,
} from "../core/types";

/**
 * Detects price manipulation vulnerabilities by identifying unprotected spot price reads from AMMs and oracles.
 */
export class PriceManipulationAgent implements AttackAgent {
  readonly type = "price-manipulation" as const;

  /**
   * Checks for AMM spot price reads and oracle queries lacking TWAP or staleness protection.
   *
   * @param input - Parsed contract analysis containing source code, function names, and inherited signals.
   * @returns An array of findings describing potential price manipulation attack vectors.
   */
  analyze(input: ContractAnalysis): AttackFinding[] {
    const findings: AttackFinding[] = [];

    const hasAMMSignal =
      input.source.includes("IUniswapV2Pair") ||
      input.source.includes("IUniswapV2Router") ||
      input.source.includes("IUniswapV3Pool") ||
      input.source.includes("ICurvePool") ||
      input.source.includes("getAmountsOut") ||
      input.source.includes("getAmountsIn") ||
      input.inheritedSignals.includes("AMM");

    const priceFunctions = [
      "getPrice",
      "getReserves",
      "latestAnswer",
      "latestRoundData",
      "slot0",
      "observe",
    ];
    const hasPriceRead =
      input.functions.some((name) => priceFunctions.includes(name)) ||
      input.riskSignals.includes("spot-price-read") ||
      input.riskSignals.includes("stale-oracle-read");

    const hasTWAP =
      input.source.includes("consult(") ||
      input.source.includes("observe(") ||
      input.source.includes("price0CumulativeLast") ||
      input.source.includes("price1CumulativeLast");

    const hasChainlinkStaleness =
      input.source.includes("updatedAt") &&
      input.source.match(/updatedAt\s*[><!]/) !== null;

    const isProtected = hasTWAP || hasChainlinkStaleness;

    if (hasAMMSignal && hasPriceRead && !isProtected) {
      findings.push({
        type: this.type,
        confidence: "high",
        description:
          "Contract reads a spot price from an AMM pair without TWAP or staleness protection. A single large swap in the same block can shift the observed price before the price-dependent function consumes it.",
        attackVector:
          "Execute a large swap on the AMM pair to skew reserves, then call the price-consuming function in the same transaction. The contract acts on the manipulated price, enabling undercollateralized borrows, unfair liquidations, or inflated mints.",
        suggestedTest:
          "Deploy a MockAMMPair with configurable getReserves(). Set skewed reserves, call the price-dependent target function, and assert the result deviates from the fair-price baseline.",
        contract: input.contractName,
        functions: input.functions.filter((name) =>
          [
            ...priceFunctions,
            "liquidate",
            "borrow",
            "mint",
            "getCollateralValue",
          ].includes(name),
        ),
      });
    } else if (hasPriceRead && !isProtected) {
      findings.push({
        type: this.type,
        confidence: "medium",
        description:
          "Contract reads a price from an oracle or external source without staleness or manipulation checks.",
        attackVector:
          "Feed a stale or manipulated price value to the price-consuming function to trigger unintended behavior.",
        suggestedTest:
          "Mock the oracle return value to an extreme price and assert the contract responds safely.",
        contract: input.contractName,
        functions: input.functions.filter((name) =>
          priceFunctions.includes(name),
        ),
      });
    }

    return findings;
  }
}
