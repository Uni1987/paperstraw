import { loadProjectEnv } from "@/lib/env/loadProjectEnv";
import {
  GLOBAL_LOCAL_FILTER_DEFAULT_POSITION_RETENTION_DAYS,
  GLOBAL_LOCAL_FILTER_DEFAULT_REVIEW_QUEUE_LIMIT,
  formatGlobalLocalFilterReport,
  getGlobalLocalFilterDefaultReportIntervalMs,
  runGlobalLocalFilterIngest,
  validateGlobalLocalFilterOptions
} from "@/lib/cruises/globalLocalFilterIngest";
import { prisma } from "@/lib/prisma";

loadProjectEnv();

async function main() {
  const options = parseArgs(process.argv.slice(2));
  validateGlobalLocalFilterOptions(options);
  const report = await runGlobalLocalFilterIngest(options);
  process.stdout.write(formatGlobalLocalFilterReport(report));
}

function parseArgs(args: string[]) {
  const options: {
    maxRuntimeMs: number | null;
    reportIntervalMs: number;
    positionRetentionDays: number;
    reviewQueueLimit: number;
    dryRun: boolean;
    noEmissions: boolean;
    allowLongRun: boolean;
  } = {
    maxRuntimeMs: null,
    reportIntervalMs: getGlobalLocalFilterDefaultReportIntervalMs(),
    positionRetentionDays: GLOBAL_LOCAL_FILTER_DEFAULT_POSITION_RETENTION_DAYS,
    reviewQueueLimit: GLOBAL_LOCAL_FILTER_DEFAULT_REVIEW_QUEUE_LIMIT,
    dryRun: false,
    noEmissions: false,
    allowLongRun: false
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--") continue;
    if (arg === "--max-runtime-ms") {
      const value = Number(args[index + 1]);
      if (!Number.isFinite(value) || value <= 0) throw new Error("--max-runtime-ms requires a positive number.");
      options.maxRuntimeMs = value;
      index += 1;
      continue;
    }
    if (arg === "--report-interval-ms") {
      const value = Number(args[index + 1]);
      if (!Number.isFinite(value) || value <= 0) throw new Error("--report-interval-ms requires a positive number.");
      options.reportIntervalMs = value;
      index += 1;
      continue;
    }
    if (arg === "--position-retention-days") {
      const value = Number(args[index + 1]);
      if (!Number.isInteger(value) || value <= 0) throw new Error("--position-retention-days requires a positive integer.");
      options.positionRetentionDays = value;
      index += 1;
      continue;
    }
    if (arg === "--review-queue-limit") {
      const value = Number(args[index + 1]);
      if (!Number.isInteger(value) || value <= 0) throw new Error("--review-queue-limit requires a positive integer.");
      options.reviewQueueLimit = value;
      index += 1;
      continue;
    }
    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (arg === "--no-emissions") {
      options.noEmissions = true;
      continue;
    }
    if (arg === "--allow-long-run") {
      options.allowLongRun = true;
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
