import path from "node:path";
import { promises as fs } from "node:fs";
import { fileURLToPath } from "node:url";
import { detectEnvironment } from "../../utils/detect.js";
import { info, success, warn } from "../../utils/logger.js";
import { ensureFoundryProject } from "../../core/planner.js";

async function ensureFile(filePath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, "utf8");
}

async function backupFile(filePath: string): Promise<string> {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = `${filePath}.${stamp}.bak`;
  await fs.copyFile(filePath, backupPath);
  return backupPath;
}

function resolvePackageRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
}

async function copyTemplateTree(sourceRoot: string, targetRoot: string): Promise<void> {
  await fs.mkdir(path.dirname(targetRoot), { recursive: true });
  await fs.cp(sourceRoot, targetRoot, { recursive: true });
}

function buildMcpEntry(projectRoot: string): { command: string; args: string[] } {
  void projectRoot;
  const packageRoot = resolvePackageRoot();
  return {
    command: "node",
    args: [path.join(packageRoot, "dist", "src", "interfaces", "mcp", "server.js")]
  };
}

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

export async function runInitCommand(projectRoot: string): Promise<void> {
  const env = await detectEnvironment();
  await ensureFoundryProject(projectRoot);
  await copyTemplateTree(path.join(resolvePackageRoot(), "templates", "raze"), path.join(projectRoot, ".raze"));
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
