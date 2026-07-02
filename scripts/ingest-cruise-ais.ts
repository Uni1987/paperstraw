import { loadProjectEnv, requireEnv } from "@/lib/env/loadProjectEnv";
import { runAisStreamWorker } from "@/lib/cruises/aisstream";

async function main() {
  loadProjectEnv();
  requireEnv("DATABASE_URL");
  const options = parseArgs(process.argv.slice(2));
  await runAisStreamWorker({ mode: options.mode, maxRuntimeMs: options.maxRuntimeMs });
}

function parseArgs(args: string[]) {
  const options: { mode: string | null; maxRuntimeMs: number | null } = { mode: null, maxRuntimeMs: null };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--") continue;
    if (arg === "--mode") {
      options.mode = args[index + 1] ?? null;
      if (!options.mode) throw new Error("--mode requires discovery, verified-global, or hybrid.");
      index += 1;
      continue;
    }
    if (arg === "--max-runtime-ms") {
      const value = Number(args[index + 1]);
      if (!Number.isFinite(value) || value <= 0) throw new Error("--max-runtime-ms requires a positive number.");
      options.maxRuntimeMs = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
