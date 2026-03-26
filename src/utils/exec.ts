import { execFile } from "node:child_process";

/** Result of a child process execution with exit code and captured output. */
export interface ExecResult {
  ok: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
}

/**
 * Executes a command safely, resolving with the result instead of rejecting on non-zero exit.
 *
 * @param command - The executable to run.
 * @param args - Array of command-line arguments.
 * @param options - Optional execution options including working directory.
 * @returns Promise resolving to the execution result with ok flag, exit code, and output.
 */
export function execFileSafe(
  command: string,
  args: string[],
  options: { cwd?: string } = {},
): Promise<ExecResult> {
  return new Promise((resolve) => {
    execFile(command, args, { cwd: options.cwd }, (error, stdout, stderr) => {
      if (error) {
        resolve({
          ok: false,
          exitCode: typeof error.code === "number" ? error.code : 1,
          stdout: stdout ?? "",
          stderr: stderr || error.message,
        });
        return;
      }

      resolve({
        ok: true,
        exitCode: 0,
        stdout: stdout ?? "",
        stderr: stderr ?? "",
      });
    });
  });
}
