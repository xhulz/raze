import dotenv from "dotenv";

/**
 * Loads environment variables from a .env file using dotenv.
 */
export function loadEnv(): void {
  dotenv.config({ quiet: true });
}
