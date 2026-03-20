import { execFile } from "node:child_process";

export interface ExecResult {
  ok: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
}

export function execFileSafe(
  command: string,
  args: string[],
  options: { cwd?: string } = {}
): Promise<ExecResult> {
  return new Promise((resolve) => {
    execFile(command, args, { cwd: options.cwd }, (error, stdout, stderr) => {
      if (error) {
        resolve({
          ok: false,
          exitCode: typeof error.code === "number" ? error.code : 1,
          stdout: stdout ?? "",
          stderr: stderr || error.message
        });
        return;
      }

      resolve({
        ok: true,
        exitCode: 0,
        stdout: stdout ?? "",
        stderr: stderr ?? ""
      });
    });
  });
}
