import { loadProjectEnv, requireEnv } from "@/lib/env/loadProjectEnv";
import { runAisStreamWorker } from "@/lib/cruises/aisstream";

async function main() {
  loadProjectEnv();
  requireEnv("DATABASE_URL");
  const options = parseArgs(process.argv.slice(2));
  await runAisStreamWorker({
    mode: options.mode,
    maxRuntimeMs: options.maxRuntimeMs,
    diagnosticProfile: options.diagnosticProfile,
    discoveryRegionLimit: options.discoveryRegionLimit,
    connectionStaggerMs: options.connectionStaggerMs,
    verifiedBatchLimit: options.verifiedBatchLimit
  });
}

function parseArgs(args: string[]) {
  const options: {
    mode: string | null;
    maxRuntimeMs: number | null;
    diagnosticProfile: string | null;
    discoveryRegionLimit: number | null;
    connectionStaggerMs: number | null;
    verifiedBatchLimit: number | null;
  } = {
    mode: null,
    maxRuntimeMs: null,
    diagnosticProfile: null,
    discoveryRegionLimit: null,
    connectionStaggerMs: null,
    verifiedBatchLimit: null
  };
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
    if (arg === "--diagnostic-profile") {
      options.diagnosticProfile = args[index + 1] ?? null;
      if (!options.diagnosticProfile) throw new Error("--diagnostic-profile requires a profile name.");
      index += 1;
      continue;
    }
    if (arg === "--discovery-region-limit") {
      const value = Number(args[index + 1]);
      if (!Number.isInteger(value) || value <= 0) throw new Error("--discovery-region-limit requires a positive integer.");
      options.discoveryRegionLimit = value;
      index += 1;
      continue;
    }
    if (arg === "--connection-stagger-ms") {
      const value = Number(args[index + 1]);
      if (!Number.isFinite(value) || value < 0) throw new Error("--connection-stagger-ms requires a non-negative number.");
      options.connectionStaggerMs = value;
      index += 1;
      continue;
    }
    if (arg === "--verified-batch-limit") {
      const value = Number(args[index + 1]);
      if (!Number.isInteger(value) || value <= 0) throw new Error("--verified-batch-limit requires a positive integer.");
      options.verifiedBatchLimit = value;
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
