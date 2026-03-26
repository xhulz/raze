/**
 * Writes an informational message to stdout.
 *
 * @param message - The message to print.
 */
export function info(message: string): void {
  process.stdout.write(`${message}\n`);
}

/**
 * Writes a success message to stdout with a checkmark prefix.
 *
 * @param message - The success message to print.
 */
export function success(message: string): void {
  process.stdout.write(`✔ ${message}\n`);
}

/**
 * Writes a warning message to stdout with an exclamation prefix.
 *
 * @param message - The warning message to print.
 */
export function warn(message: string): void {
  process.stdout.write(`! ${message}\n`);
}

/**
 * Writes a failure message to stderr with an X prefix.
 *
 * @param message - The failure message to print.
 */
export function failure(message: string): void {
  process.stderr.write(`✖ ${message}\n`);
}
