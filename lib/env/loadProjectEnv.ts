import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

export function loadProjectEnv(cwd = projectRoot, override = false) {
  for (const fileName of [".env.local", ".env"]) {
    const path = resolve(cwd, fileName);
    if (!existsSync(path)) continue;

    const lines = readFileSync(path, "utf8").split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex === -1) continue;

      const key = trimmed.slice(0, separatorIndex).trim();
      const rawValue = trimmed.slice(separatorIndex + 1).trim();
      if (!key || (!override && process.env[key] !== undefined)) continue;
      process.env[key] = stripQuotes(rawValue);
    }
  }
}

export function requireEnv(name: string) {
  if (!process.env[name]) {
    throw new Error(
      `Missing ${name}. Add it to .env or set it in PowerShell with: $env:${name}="..."`
    );
  }
}

function stripQuotes(value: string) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}
