import assert from "node:assert/strict";
import test from "node:test";
import { toolDefinitions } from "../src/interfaces/mcp/tools";

test("MCP tool names are valid for VS Code/Codex", () => {
  const toolNames = Object.keys(toolDefinitions);
  assert.ok(toolNames.length > 0);
  for (const toolName of toolNames) {
    assert.match(toolName, /^[a-z0-9_-]+$/);
  }
});

test("raze_verify_fix tool is registered", () => {
  assert.ok("raze_verify_fix" in toolDefinitions);
});
