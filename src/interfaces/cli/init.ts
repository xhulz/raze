import path from "node:path";
import { promises as fs } from "node:fs";
import { fileURLToPath } from "node:url";
import { detectEnvironment } from "../../utils/detect.js";
import { info, success, warn } from "../../utils/logger.js";
import { ensureFoundryProject } from "../../core/planner.js";

/**
 * Creates a file at the given path with the specified content, creating parent directories as needed.
 *
 * @param filePath - Absolute path to the file.
 * @param content - Content to write.
 */
async function ensureFile(filePath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, "utf8");
}

/**
 * Creates a timestamped backup copy of a file.
 *
 * @param filePath - Absolute path to the file to back up.
 * @returns Absolute path to the created backup file.
 */
async function backupFile(filePath: string): Promise<string> {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = `${filePath}.${stamp}.bak`;
  await fs.copyFile(filePath, backupPath);
  return backupPath;
}

/**
 * Resolves the absolute path to the Raze package root directory.
 *
 * @returns Absolute path to the package root.
 */
function resolvePackageRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
}

/**
 * Builds the MCP server entry configuration pointing to the Raze server script.
 *
 * @param projectRoot - Absolute path to the Foundry project root.
 * @returns Object with command and args for the MCP server entry.
 */
function buildMcpEntry(projectRoot: string): { command: string; args: string[] } {
  void projectRoot;
  const packageRoot = resolvePackageRoot();
  return {
    command: "node",
    args: [path.join(packageRoot, "dist", "src", "interfaces", "mcp", "server.js")]
  };
}

/**
 * Returns a human-readable label for the currently detected editor/agent environment.
 *
 * @returns Environment label string, or null if the environment is unknown.
 */
function currentEnvironmentLabel(): string | null {
  if (process.env.CODEX_INTERNAL_ORIGINATOR_OVERRIDE === "codex_vscode" || process.env.__CFBundleIdentifier === "com.microsoft.VSCode") {
    return "VS Code (Codex)";
  }
  if (process.env.CURSOR_TRACE_ID) {
    return "Cursor";
  }
  if (process.env.CLAUDECODE) {
    return "Claude Desktop";
  }
  return null;
}

/**
 * Merges the Raze MCP server entry into an existing or new MCP configuration file.
 *
 * @param target - The MCP target describing the editor kind, name, and config file path.
 * @param entry - The MCP server entry with command and args.
 */
async function mergeMcpConfig(
  target: { kind: "vscode" | "cursor" | "claude"; name: string; configPath: string },
  entry: { command: string; args: string[] }
): Promise<void> {
  let data: Record<string, unknown> = {};
  const exists = await fs
    .access(target.configPath)
    .then(() => true)
    .catch(() => false);

  if (exists) {
    await backupFile(target.configPath);
    const raw = await fs.readFile(target.configPath, "utf8");
    data = raw.trim() ? (JSON.parse(raw) as Record<string, unknown>) : {};
  } else {
    await fs.mkdir(path.dirname(target.configPath), { recursive: true });
  }

  if (target.kind === "vscode") {
    const servers = ((data.servers as Record<string, unknown> | undefined) ?? {}) as Record<string, unknown>;
    servers.raze = {
      type: "stdio",
      command: entry.command,
      args: entry.args
    };
    data.servers = servers;
    if (!Array.isArray(data.inputs)) {
      data.inputs = [];
    }
  } else {
    const mcpServers = ((data.mcpServers as Record<string, unknown> | undefined) ?? {}) as Record<string, unknown>;
    mcpServers.raze = entry;
    data.mcpServers = mcpServers;
  }

  await fs.writeFile(target.configPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

/**
 * Executes the CLI init command, configuring MCP targets and initializing the project runtime directory.
 *
 * @param projectRoot - Absolute path to the Foundry project root.
 */
export async function runInitCommand(projectRoot: string): Promise<void> {
  const env = await detectEnvironment();
  await ensureFoundryProject(projectRoot);
  await fs.mkdir(path.join(projectRoot, ".raze", "reports"), { recursive: true });

  const mcpEntry = buildMcpEntry(projectRoot);
  for (const target of env.supportedMcpTargets) {
    await mergeMcpConfig(target, mcpEntry);
  }

  const currentLabel = currentEnvironmentLabel();
  if (currentLabel) {
    success(`MCP configured for current environment: ${currentLabel}`);
  }

  const additionalTargets = env.supportedMcpTargets
    .map((target) => target.name)
    .filter((name) => name !== currentLabel);

  if (additionalTargets.length > 0) {
    info(`Also configured on disk: ${additionalTargets.join(", ")}`);
  }

  if (env.supportedMcpTargets.length === 0) {
    warn("MCP-compatible environment not auto-configured");
  }

  if (!env.forge.ok) {
    warn("Foundry was not detected. Install forge before running fuzz execution.");
  }

  success("Environment ready");
  info("");
  info('You can now ask:');
  info('"analyze this smart contract"');
}
