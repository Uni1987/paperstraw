import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { loadProjectEnv } from "@/lib/env/loadProjectEnv";
import {
  GLOBAL_FEED_BENCHMARK_DEFAULT_REPORT_INTERVAL_MS,
  GLOBAL_FEED_BENCHMARK_DEFAULT_RUNTIME_MS,
  GLOBAL_FEED_BENCHMARK_DEFAULT_DAILY_AGGREGATE_BYTES,
  GLOBAL_FEED_BENCHMARK_DEFAULT_POSITION_RETENTION_DAYS,
  GLOBAL_FEED_BENCHMARK_DEFAULT_VERIFIED_POSITION_BYTES,
  type GlobalFeedBenchmarkFormat,
  type GlobalFeedBenchmarkProfile,
  formatGlobalFeedBenchmarkReport,
  runGlobalFeedBenchmark,
  validateGlobalFeedBenchmarkOptions
} from "@/lib/cruises/globalFeedBenchmark";
import { prisma } from "@/lib/prisma";

loadProjectEnv();

async function main() {
  const options = parseArgs(process.argv.slice(2));
  validateGlobalFeedBenchmarkOptions({ maxRuntimeMs: options.maxRuntimeMs, allowLongRun: options.allowLongRun });
  const report = await runGlobalFeedBenchmark({
    maxRuntimeMs: options.maxRuntimeMs,
    messageProfile: options.messageProfile,
    reportIntervalMs: options.reportIntervalMs,
    format: options.format,
    positionRetentionDays: options.positionRetentionDays,
    estimatedVerifiedPositionBytes: options.estimatedVerifiedPositionBytes,
    estimatedDailyAggregateBytes: options.estimatedDailyAggregateBytes
  });
  const output = formatGlobalFeedBenchmarkReport(report, options.format);
  if (options.output) {
    const outputPath = resolve(options.output);
    if (existsSync(outputPath) && !options.force) throw new Error(`Refusing to overwrite ${outputPath}. Re-run with --force to replace it.`);
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, output, "utf8");
    console.log(`Global feed benchmark written to ${outputPath}`);
  } else {
    process.stdout.write(output);
  }
}

function parseArgs(args: string[]) {
  const options: {
    maxRuntimeMs: number;
    messageProfile: GlobalFeedBenchmarkProfile;
    reportIntervalMs: number;
    format: GlobalFeedBenchmarkFormat;
    output: string | null;
    force: boolean;
    allowLongRun: boolean;
    positionRetentionDays: number;
    estimatedVerifiedPositionBytes: number;
    estimatedDailyAggregateBytes: number;
  } = {
    maxRuntimeMs: GLOBAL_FEED_BENCHMARK_DEFAULT_RUNTIME_MS,
    messageProfile: "positions",
    reportIntervalMs: GLOBAL_FEED_BENCHMARK_DEFAULT_REPORT_INTERVAL_MS,
    format: "terminal",
    output: null,
    force: false,
    allowLongRun: false,
    positionRetentionDays: GLOBAL_FEED_BENCHMARK_DEFAULT_POSITION_RETENTION_DAYS,
    estimatedVerifiedPositionBytes: GLOBAL_FEED_BENCHMARK_DEFAULT_VERIFIED_POSITION_BYTES,
    estimatedDailyAggregateBytes: GLOBAL_FEED_BENCHMARK_DEFAULT_DAILY_AGGREGATE_BYTES
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
    if (arg === "--message-profile") {
      const value = args[index + 1] as GlobalFeedBenchmarkProfile | undefined;
      if (!value || !["positions", "positions-and-static"].includes(value)) throw new Error("--message-profile requires positions or positions-and-static.");
      options.messageProfile = value;
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
    if (arg === "--format") {
      const value = args[index + 1] as GlobalFeedBenchmarkFormat | undefined;
      if (!value || !["terminal", "json", "markdown"].includes(value)) throw new Error("--format requires terminal, json, or markdown.");
      options.format = value;
      index += 1;
      continue;
    }
    if (arg === "--output") {
      options.output = args[index + 1] ?? null;
      if (!options.output) throw new Error("--output requires a path.");
      index += 1;
      continue;
    }
    if (arg === "--force") {
      options.force = true;
      continue;
    }
    if (arg === "--allow-long-run") {
      options.allowLongRun = true;
      continue;
    }
    if (arg === "--position-retention-days") {
      const value = Number(args[index + 1]);
      if (!Number.isInteger(value) || value <= 0) throw new Error("--position-retention-days requires a positive integer.");
      options.positionRetentionDays = value;
      index += 1;
      continue;
    }
    if (arg === "--estimated-verified-position-bytes") {
      const value = Number(args[index + 1]);
      if (!Number.isInteger(value) || value <= 0) throw new Error("--estimated-verified-position-bytes requires a positive integer.");
      options.estimatedVerifiedPositionBytes = value;
      index += 1;
      continue;
    }
    if (arg === "--estimated-daily-aggregate-bytes") {
      const value = Number(args[index + 1]);
      if (!Number.isInteger(value) || value <= 0) throw new Error("--estimated-daily-aggregate-bytes requires a positive integer.");
      options.estimatedDailyAggregateBytes = value;
      index += 1;
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
