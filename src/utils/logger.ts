export function info(message: string): void {
  process.stdout.write(`${message}\n`);
}

export function success(message: string): void {
  process.stdout.write(`✔ ${message}\n`);
}

export function warn(message: string): void {
  process.stdout.write(`! ${message}\n`);
}

export function failure(message: string): void {
  process.stderr.write(`✖ ${message}\n`);
}
