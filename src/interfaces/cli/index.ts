#!/usr/bin/env node
import path from "node:path";
import { Command } from "commander";
import { loadEnv } from "../../utils/env.js";
import { runInitCommand } from "./init.js";
import { runDoctorCommand } from "./doctor.js";
import { runFuzzCommand } from "./fuzz.js";
import { runDeveloperFuzzCommand } from "./devFuzz.js";
import { failure } from "../../utils/logger.js";

loadEnv();

const program = new Command();

program.name("raze").description("MCP-first smart contract attack engine").version("0.1.0");

program
  .command("init")
  .argument("[path]", "Foundry project root", process.cwd())
  .action(async (targetPath) => {
    await runInitCommand(path.resolve(targetPath));
  });

program
  .command("doctor")
  .argument("[path]", "Foundry project root", process.cwd())
  .action(async (targetPath) => {
    await runDoctorCommand(path.resolve(targetPath));
  });

program
  .command("fuzz")
  .argument("[path]", "Foundry project root", process.cwd())
  .option("--contract <path-or-name>", "Specific contract to target")
  .option("--run", "Execute forge test after generating tests", false)
  .option("--offline", "Execute forge test in offline mode", false)
  .action(async (targetPath, options) => {
    await runFuzzCommand(path.resolve(targetPath), options);
  });

program
  .command("dev-fuzz")
  .argument("[path]", "Foundry project root", process.cwd())
  .option("--contract <path-or-name>", "Specific contract to target")
  .option("--function <name>", "Specific public or external function to target")
  .action(async (targetPath, options) => {
    await runDeveloperFuzzCommand(path.resolve(targetPath), options);
  });

program.parseAsync(process.argv).catch((error: unknown) => {
  failure(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
