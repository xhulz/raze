import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import { promises as fs } from "node:fs";
import { runFuzzCommand } from "../src/interfaces/cli/fuzz";
import { runDeveloperFuzzCommand } from "../src/interfaces/cli/devFuzz";
import { runDoctorCommand } from "../src/interfaces/cli/doctor";

const fixturesRoot = path.resolve("test/fixtures");

async function withCapturedStdout(run: () => Promise<void>): Promise<string> {
  const chunks: string[] = [];
  const originalWrite = process.stdout.write.bind(process.stdout);
  process.stdout.write = ((chunk: string | Uint8Array) => {
    chunks.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
    return true;
  }) as typeof process.stdout.write;

  try {
    await run();
  } finally {
    process.stdout.write = originalWrite;
  }

  return chunks.join("");
}

test("runDeveloperFuzzCommand prints generated test files and fuzz families", async () => {
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "raze-cli-devfuzz-"));
  await fs.cp(path.join(fixturesRoot, "access-control"), tmpRoot, { recursive: true });

  const output = await withCapturedStdout(async () => {
    await runDeveloperFuzzCommand(tmpRoot, { contract: "Token" });
  });

  assert.match(output, /Analyzed Token/);
  assert.match(output, /Generated developer fuzz tests:/);
  assert.match(output, /Generated test files:/);
  assert.match(output, /test\/raze\/Token\.mint\.fuzz\.t\.sol/);
  assert.match(output, /Fuzz families:/);
  assert.match(output, /mint: success-path, input-boundary, access-sensitive, state-transition/);
});

test("runFuzzCommand prints contract name, decision, proof scaffolds, forge totals, and report path", async () => {
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "raze-cli-fuzz-"));
  await fs.cp(path.join(fixturesRoot, "access-control"), tmpRoot, { recursive: true });

  const output = await withCapturedStdout(async () => {
    await runFuzzCommand(tmpRoot, { contract: "Token", run: true, offline: true });
  });

  assert.match(output, /Token —/);
  assert.match(output, /Proof scaffolds:/);
  assert.match(output, /test\/raze\/Token\.access_control\.t\.sol/);
  assert.match(output, /Report: \.raze\/reports\/fuzz\.md/);
});

test("runDoctorCommand prints version, build path, runtime initialization, and contract count", async () => {
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "raze-cli-doctor-"));
  await fs.cp(path.join(fixturesRoot, "access-control"), tmpRoot, { recursive: true });
  await fs.mkdir(path.join(tmpRoot, ".raze", ".ia"), { recursive: true });
  await fs.writeFile(path.join(tmpRoot, ".raze", ".ia", "agents.md"), "# test\n", "utf8");

  const output = await withCapturedStdout(async () => {
    await runDoctorCommand(tmpRoot);
  });

  assert.match(output, /Raze\s+0\.1\.\d+/);
  assert.match(output, /Build output\s+ready/);
  assert.match(output, /Build path\s+.*dist\/src\/interfaces\/mcp\/server\.js/);
  assert.match(output, /Runtime context\s+\.raze initialized/);
  assert.match(output, /Contracts\s+1 detected/);
});
