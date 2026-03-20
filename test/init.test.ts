import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import { promises as fs } from "node:fs";
import { runInitCommand } from "../src/interfaces/cli/init.js";

const fixtureRoot = path.resolve("test/fixtures/reentrancy");

test("runInitCommand writes .raze scaffolding and merges MCP config with backup", async () => {
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "raze-init-"));
  await fs.cp(fixtureRoot, tmpRoot, { recursive: true });

  const cursorConfig = path.join(tmpRoot, "cursor-mcp.json");
  await fs.writeFile(
    cursorConfig,
    JSON.stringify(
      {
        mcpServers: {
          existing: {
            command: "node",
            args: ["existing.js"]
          }
        }
      },
      null,
      2
    ),
    "utf8"
  );

  process.env.RAZE_CURSOR_CONFIG_PATH = cursorConfig;
  process.env.RAZE_CLAUDE_CONFIG_PATH = path.join(tmpRoot, "claude-mcp.json");
  const vscodeConfig = path.join(tmpRoot, "vscode-mcp.json");
  process.env.RAZE_VSCODE_CONFIG_PATH = vscodeConfig;
  await fs.writeFile(
    vscodeConfig,
    JSON.stringify(
      {
        servers: {
          existingVsCode: {
            type: "http",
            url: "http://localhost:8787/sse"
          }
        },
        inputs: []
      },
      null,
      2
    ),
    "utf8"
  );

  try {
    await runInitCommand(tmpRoot);
    const agents = await fs.readFile(path.join(tmpRoot, ".raze", ".ia", "agents.md"), "utf8");
    const rules = await fs.readFile(path.join(tmpRoot, ".raze", ".ia", "rules.md"), "utf8");
    const resultInterpretation = await fs.readFile(path.join(tmpRoot, ".raze", ".ia", "result-interpretation.md"), "utf8");
    const vulnerabilities = await fs.readFile(path.join(tmpRoot, ".raze", ".ia", "context", "vulnerabilities.md"), "utf8");
    const merged = JSON.parse(await fs.readFile(cursorConfig, "utf8")) as {
      mcpServers: Record<string, { command: string; args: string[] }>;
    };
    const mergedVsCode = JSON.parse(await fs.readFile(vscodeConfig, "utf8")) as {
      servers: Record<string, { type: string; command?: string; args?: string[]; url?: string }>;
      inputs: unknown[];
    };
    const backups = (await fs.readdir(tmpRoot)).filter((entry) => entry.startsWith("cursor-mcp.json.") && entry.endsWith(".bak"));

    await assert.rejects(fs.access(path.join(tmpRoot, ".codexrc")));
    await fs.access(path.join(tmpRoot, ".raze", "reports"));
    assert.match(agents, /Planner -> Attacker -> Tester -> Runner -> Reporter/);
    assert.match(agents, /assessment\.confirmationStatus/);
    assert.match(agents, /scaffold executed, but exploit not fully confirmed/);
    assert.match(agents, /do not invent stronger wording than it allows/);
    assert.match(agents, /final issue status in natural language/);
    assert.match(agents, /assessment\.decision/);
    assert.match(agents, /Decision: fix this issue now\./);
    assert.match(agents, /Use `raze_attack` for one authored attack plan/);
    assert.match(agents, /`raze_run_attack_suite` requires `attackPlans`/);
    assert.match(rules, /Always generate compileable Solidity/);
    assert.match(rules, /Derive final severity and confirmation wording from `assessment\.confirmationStatus`/);
    assert.match(rules, /Never equate `forgeRun\.ok === true` with "safe" or "confirmed exploit" by itself/);
    assert.match(rules, /If a free-form summary conflicts with `assessment\.confirmationStatus`, the summary is wrong/);
    assert.match(resultInterpretation, /Use `assessment\.confirmationStatus` as the source of truth/);
    assert.match(resultInterpretation, /Use `assessment\.decision` and `assessment\.decisionReason` as the source of truth/);
    assert.match(resultInterpretation, /`fix-now`/);
    assert.match(resultInterpretation, /`executed-scaffold`/);
    assert.match(resultInterpretation, /`confirmed-by-execution`/);
    assert.match(resultInterpretation, /does not mean the contract is safe/);
    assert.match(resultInterpretation, /Prefer: "Final issue status: confirmed by execution\."/);
    assert.match(resultInterpretation, /Avoid: "assessment\.confirmationStatus: confirmed-by-execution"/);
    assert.match(vulnerabilities, /reentrancy/);
    assert.equal(merged.mcpServers.existing.command, "node");
    assert.equal(merged.mcpServers.raze.command, "node");
    assert.match(merged.mcpServers.raze.args[0], /dist\/src\/interfaces\/mcp\/server\.js$/);
    assert.equal(mergedVsCode.servers.existingVsCode.type, "http");
    assert.equal(mergedVsCode.servers.raze.type, "stdio");
    assert.equal(mergedVsCode.servers.raze.command, "node");
    assert.match(mergedVsCode.servers.raze.args?.[0] ?? "", /dist\/src\/interfaces\/mcp\/server\.js$/);
    assert.ok(Array.isArray(mergedVsCode.inputs));
    assert.ok(backups.length >= 1);
  } finally {
    delete process.env.RAZE_CURSOR_CONFIG_PATH;
    delete process.env.RAZE_CLAUDE_CONFIG_PATH;
    delete process.env.RAZE_VSCODE_CONFIG_PATH;
  }
});
