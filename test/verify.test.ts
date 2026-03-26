import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { interpretVerifyResults } from "../src/core/verifier";
import type { ForgeRunResult } from "../src/core/types";

function makeForgeRun(passed: number, failed: number, skipped = 0): ForgeRunResult {
  return {
    command: "forge test",
    ok: failed === 0,
    exitCode: failed > 0 ? 1 : 0,
    stdout: `${passed} passed; ${failed} failed; ${skipped} skipped`,
    stderr: "",
    summary: { passed, failed, skipped }
  };
}

describe("interpretVerifyResults", () => {
  test("fix-verified when proof fails and regression passes", () => {
    const result = interpretVerifyResults(
      makeForgeRun(0, 1),
      makeForgeRun(1, 0)
    );
    assert.equal(result.verdict, "fix-verified");
  });

  test("fix-incomplete when proof still passes", () => {
    const result = interpretVerifyResults(
      makeForgeRun(1, 0),
      makeForgeRun(1, 0)
    );
    assert.equal(result.verdict, "fix-incomplete");
    assert.match(result.reason, /still passes/);
  });

  test("fix-incomplete when regression fails", () => {
    const result = interpretVerifyResults(
      makeForgeRun(0, 1),
      makeForgeRun(0, 1)
    );
    assert.equal(result.verdict, "fix-incomplete");
    assert.match(result.reason, /not effective/);
  });

  test("fix-incomplete when both proof passes and regression fails", () => {
    const result = interpretVerifyResults(
      makeForgeRun(1, 0),
      makeForgeRun(0, 1)
    );
    assert.equal(result.verdict, "fix-incomplete");
    assert.match(result.reason, /still passes/);
    assert.match(result.reason, /not effective/);
  });

  test("error when summary is missing", () => {
    const broken: ForgeRunResult = {
      command: "forge test",
      ok: false,
      exitCode: 1,
      stdout: "compilation failed",
      stderr: "",
      summary: undefined
    };
    const result = interpretVerifyResults(broken, makeForgeRun(1, 0));
    assert.equal(result.verdict, "error");
  });
});
