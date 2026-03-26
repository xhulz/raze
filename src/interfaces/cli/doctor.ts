import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { discoverContracts } from "../../core/planner";
import type { DetectedEnvironment } from "../../core/types";
import { detectEnvironment } from "../../utils/detect";
import { info } from "../../utils/logger";

/**
 * Formats a label-value pair as a fixed-width row for CLI output.
 *
 * @param label - The row label, left-padded to 18 characters.
 * @param value - The row value.
 * @returns Formatted row string.
 */
function row(label: string, value: string): string {
  return `${label.padEnd(18)} ${value}`;
}

/**
 * Infers the preferred code editor from the detected environment.
 *
 * @param env - The detected development environment.
 * @returns Human-readable editor description string.
 */
function inferPreferredEditor(env: DetectedEnvironment): string {
  if (env.currentEditor !== "unknown") {
    return `${env.currentEditor} (active session)`;
  }
  if (env.vscode.detected) {
    return env.vscode.codexExtensionDetected
      ? "vscode (inferred from MCP config and Codex extension)"
      : "vscode (inferred from MCP config)";
  }
  if (env.cursor.detected) {
    return "cursor (inferred from MCP config)";
  }
  if (env.claude.detected) {
    return "claude (inferred from MCP config)";
  }
  return "unknown";
}

/**
 * Infers the preferred AI agent from the detected environment.
 *
 * @param env - The detected development environment.
 * @returns Human-readable agent description string.
 */
function inferPreferredAgent(env: DetectedEnvironment): string {
  if (env.currentAgent !== "unknown") {
    return `${env.currentAgent} (active session)`;
  }
  if (env.vscode.codexExtensionDetected) {
    return "codex (inferred from installed VS Code extension)";
  }
  if (env.claude.detected) {
    return "claude (inferred from MCP config)";
  }
  return "unknown";
}

/**
 * Executes the CLI doctor command, printing environment diagnostics.
 *
 * @param projectRoot - Absolute path to the Foundry project root.
 */
export async function runDoctorCommand(projectRoot: string): Promise<void> {
  const env = await detectEnvironment();
  const packageRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    "..",
    "..",
    "..",
  );
  const buildPath = path.join(
    packageRoot,
    "dist",
    "src",
    "interfaces",
    "mcp",
    "server.js",
  );
  const buildExists = await fs.access(buildPath).then(
    () => true,
    () => false,
  );
  const packageJson = JSON.parse(
    await fs.readFile(path.join(packageRoot, "package.json"), "utf8"),
  ) as { version?: string };
  const runtimeRoot = path.join(projectRoot, ".raze");
  const runtimeInitialized = await fs
    .access(path.join(runtimeRoot, ".ia", "agents.md"))
    .then(
      () => true,
      () => false,
    );
  const contracts = await discoverContracts(projectRoot).catch(() => []);

  info(row("Raze", packageJson.version ?? "unknown"));
  info(row("Node.js", env.node.ok ? (env.node.version ?? "ok") : "missing"));
  info(row("Foundry", env.forge.ok ? (env.forge.version ?? "ok") : "missing"));
  info(row("Editor context", inferPreferredEditor(env)));
  info(row("Agent context", inferPreferredAgent(env)));
  info(
    row(
      "VS Code MCP",
      env.vscode.detected
        ? `${env.vscode.configPath ?? "detected"}${env.vscode.codexExtensionDetected ? " (Codex detected)" : ""}`
        : "not detected",
    ),
  );
  info(
    row(
      "Cursor MCP",
      env.cursor.detected
        ? (env.cursor.configPath ?? "detected")
        : "not detected",
    ),
  );
  info(
    row(
      "Claude MCP",
      env.claude.detected
        ? (env.claude.configPath ?? "detected")
        : "not detected",
    ),
  );
  info(row("Build output", buildExists ? "ready" : "missing dist build"));
  info(row("Build path", buildExists ? buildPath : "missing"));
  info(
    row(
      "Runtime context",
      runtimeInitialized ? ".raze initialized" : ".raze not initialized",
    ),
  );
  info(
    row(
      "Contracts",
      contracts.length > 0 ? `${contracts.length} detected` : "none detected",
    ),
  );
}
