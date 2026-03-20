import test from "node:test";
import assert from "node:assert/strict";
import { toolDefinitions } from "../src/interfaces/mcp/tools.js";

test("MCP tool names are valid for VS Code/Codex", () => {
  const toolNames = Object.keys(toolDefinitions);
  assert.ok(toolNames.length > 0);
  for (const toolName of toolNames) {
    assert.match(toolName, /^[a-z0-9_-]+$/);
  }
});
