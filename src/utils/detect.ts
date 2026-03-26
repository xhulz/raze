import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { execFileSafe } from "./exec.js";
import type { DetectedEnvironment } from "../core/types.js";

/**
 * Returns the file path for the Cursor MCP configuration.
 *
 * @returns Absolute path to the Cursor MCP config file.
 */
function getCursorConfigPath(): string {
  return process.env.RAZE_CURSOR_CONFIG_PATH ?? path.join(os.homedir(), ".cursor", "mcp.json");
}

/**
 * Returns candidate file paths for the Claude MCP configuration.
 *
 * @returns Array of absolute paths to check for Claude MCP config.
 */
function getClaudeConfigCandidates(): string[] {
  if (process.env.RAZE_CLAUDE_CONFIG_PATH) {
    return [process.env.RAZE_CLAUDE_CONFIG_PATH];
  }

  return [
    path.join(os.homedir(), ".claude.json"),
    path.join(os.homedir(), ".config", "claude", "mcp.json"),
    path.join(os.homedir(), ".claude", "mcp.json")
  ];
}

/**
 * Returns candidate file paths for the VS Code MCP configuration.
 *
 * @returns Array of absolute paths to check for VS Code MCP config.
 */
function getVsCodeConfigCandidates(): string[] {
  if (process.env.RAZE_VSCODE_CONFIG_PATH) {
    return [process.env.RAZE_VSCODE_CONFIG_PATH];
  }

  return [
    path.join(os.homedir(), "Library", "Application Support", "Code", "User", "mcp.json"),
    path.join(os.homedir(), ".config", "Code", "User", "mcp.json"),
    path.join(os.homedir(), "AppData", "Roaming", "Code", "User", "mcp.json")
  ];
}

/**
 * Checks whether the OpenAI Codex VS Code extension is installed.
 *
 * @returns True if the Codex extension directory is found.
 */
async function detectCodexVsCodeExtension(): Promise<boolean> {
  const extensionsDir = path.join(os.homedir(), ".vscode", "extensions");
  try {
    const entries = await fs.readdir(extensionsDir);
    return entries.some((entry) => entry.startsWith("openai.chatgpt-"));
  } catch {
    return false;
  }
}

/**
 * Checks whether a file exists at the given path.
 *
 * @param filePath - Absolute path to check.
 * @returns True if the file is accessible.
 */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Detects the version of a CLI command by executing it with the given arguments.
 *
 * @param command - The command to execute.
 * @param args - Arguments to pass (typically "--version").
 * @returns Object with ok flag and parsed version string, or null on failure.
 */
async function detectCommandVersion(command: string, args: string[]): Promise<{ ok: boolean; version: string | null }> {
  const result = await execFileSafe(command, args);
  if (!result.ok) {
    return { ok: false, version: null };
  }
  return { ok: true, version: result.stdout.trim() || result.stderr.trim() || null };
}

/**
 * Detects the full development environment including Node.js, Forge, editor, agent, and MCP targets.
 *
 * @returns Detected environment with toolchain versions, editor/agent context, and MCP targets.
 */
export async function detectEnvironment(): Promise<DetectedEnvironment> {
  const cursorConfigPath = getCursorConfigPath();
  const claudeConfigCandidates = getClaudeConfigCandidates();
  const vscodeConfigCandidates = getVsCodeConfigCandidates();
  const nodeVersion = process.version;
  const forge = await detectCommandVersion("forge", ["--version"]);
  const cursorDetected = await fileExists(cursorConfigPath);
  const claudeConfigPath = (await Promise.all(claudeConfigCandidates.map(async (candidate) => ((await fileExists(candidate)) ? candidate : null)))).find(
    Boolean
  ) as string | undefined;
  const vscodeConfigPath = (await Promise.all(vscodeConfigCandidates.map(async (candidate) => ((await fileExists(candidate)) ? candidate : null)))).find(
    Boolean
  ) as string | undefined;
  const codexExtensionDetected = await detectCodexVsCodeExtension();

  const currentEditor: DetectedEnvironment["currentEditor"] =
    process.env.__CFBundleIdentifier === "com.todesktop.230313mzl4w4u92" || process.env.VSCODE_CWD === "/" ? "vscode" :
    process.env.CODEX_INTERNAL_ORIGINATOR_OVERRIDE === "codex_vscode" ? "vscode" :
    process.env.CURSOR_TRACE_ID ? "cursor" :
    process.env.CLAUDECODE ? "claude" :
    "unknown";

  const currentAgent: DetectedEnvironment["currentAgent"] =
    process.env.CODEX_INTERNAL_ORIGINATOR_OVERRIDE === "codex_vscode" || process.env.CODEX_CI ? "codex" :
    process.env.CLAUDECODE ? "claude" :
    "unknown";

  const supportedMcpTargets = [
    ...(vscodeConfigPath ? [{ kind: "vscode" as const, name: codexExtensionDetected ? "VS Code (Codex)" : "VS Code", configPath: vscodeConfigPath }] : []),
    ...(cursorDetected ? [{ kind: "cursor" as const, name: "Cursor", configPath: cursorConfigPath }] : []),
    ...(claudeConfigPath ? [{ kind: "claude" as const, name: "Claude Desktop", configPath: claudeConfigPath }] : [])
  ];

  return {
    node: {
      ok: true,
      version: nodeVersion
    },
    forge,
    cursor: {
      detected: cursorDetected,
      configPath: cursorDetected ? cursorConfigPath : null
    },
    claude: {
      detected: Boolean(claudeConfigPath),
      configPath: claudeConfigPath ?? null
    },
    vscode: {
      detected: Boolean(vscodeConfigPath),
      configPath: vscodeConfigPath ?? null,
      codexExtensionDetected
    },
    currentEditor,
    currentAgent,
    supportedMcpTargets
  };
}
