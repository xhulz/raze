import dotenv from "dotenv";

export function loadEnv(): void {
  dotenv.config({ quiet: true });
}
