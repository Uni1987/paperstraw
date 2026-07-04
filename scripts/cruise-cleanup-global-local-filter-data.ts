import { GLOBAL_LOCAL_FILTER_DEFAULT_POSITION_RETENTION_DAYS, cleanupGlobalLocalFilterData } from "@/lib/cruises/globalLocalFilterIngest";
import { loadProjectEnv } from "@/lib/env/loadProjectEnv";
import { prisma } from "@/lib/prisma";

loadProjectEnv();

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = await cleanupGlobalLocalFilterData({ retentionDays: options.retentionDays, apply: options.apply });
  console.log("Cruise global-local-filter cleanup");
  console.log(`Mode: ${result.apply ? "APPLY" : "DRY_RUN"}`);
  console.log(`Cutoff: ${result.cutoff.toISOString()}`);
  console.log(`Rows matched: ${result.rowsMatched}`);
  console.log(`Rows deleted: ${result.rowsDeleted}`);
  if (!result.apply) console.log("No rows deleted. Re-run with --apply to delete matched old verified cruise positions.");
}

function parseArgs(args: string[]) {
  const options = {
    retentionDays: GLOBAL_LOCAL_FILTER_DEFAULT_POSITION_RETENTION_DAYS,
    apply: false
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--") continue;
    if (arg === "--retention-days" || arg === "--position-retention-days") {
      const value = Number(args[index + 1]);
      if (!Number.isInteger(value) || value <= 0) throw new Error("--retention-days requires a positive integer.");
      options.retentionDays = value;
      index += 1;
      continue;
    }
    if (arg === "--apply") {
      options.apply = true;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
