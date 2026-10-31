import { validateEnv } from "./validateEnv.js";

try {
  process.loadEnvFile();
} catch (error) {
  if (error.code !== "ENOENT") {
    throw new Error("Unable to load the .env file.");
  }
}

export const env = validateEnv(process.env);
