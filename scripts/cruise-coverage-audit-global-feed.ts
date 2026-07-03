import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  GLOBAL_FEED_COVERAGE_AUDIT_DEFAULT_RECENT_DAYS,
  GLOBAL_FEED_COVERAGE_AUDIT_DEFAULT_REPORT_INTERVAL_MS,
  GLOBAL_FEED_COVERAGE_AUDIT_DEFAULT_RUNTIME_MS,
  type GlobalFeedCoverageAuditFormat,
  formatGlobalFeedCoverageAuditReport,
  runGlobalFeedCoverageAudit,
  validateGlobalFeedCoverageAuditOptions
} from "@/lib/cruises/globalFeedCoverageAudit";
import { loadProjectEnv } from "@/lib/env/loadProjectEnv";
import { prisma } from "@/lib/prisma";

loadProjectEnv();

async function main() {
  const options = parseArgs(process.argv.slice(2));
  validateGlobalFeedCoverageAuditOptions({
    maxRuntimeMs: options.maxRuntimeMs,
    reportIntervalMs: options.reportIntervalMs,
    recentDays: options.recentDays,
    allowLongRun: options.allowLongRun
  });
  const report = await runGlobalFeedCoverageAudit({
    maxRuntimeMs: options.maxRuntimeMs,
    reportIntervalMs: options.reportIntervalMs,
    format: options.format,
    recentDays: options.recentDays
  });
  const output = formatGlobalFeedCoverageAuditReport(report, options.format);
  if (options.output) {
    const outputPath = resolve(options.output);
    if (existsSync(outputPath) && !options.force) throw new Error(`Refusing to overwrite ${outputPath}. Re-run with --force to replace it.`);
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, output, "utf8");
    console.log(`Global feed coverage audit written to ${outputPath}`);
  } else {
    process.stdout.write(output);
  }
}

function parseArgs(args: string[]) {
  const options: {
    maxRuntimeMs: number;
    reportIntervalMs: number;
    format: GlobalFeedCoverageAuditFormat;
    output: string | null;
    force: boolean;
    allowLongRun: boolean;
    recentDays: number;
  } = {
    maxRuntimeMs: GLOBAL_FEED_COVERAGE_AUDIT_DEFAULT_RUNTIME_MS,
    reportIntervalMs: GLOBAL_FEED_COVERAGE_AUDIT_DEFAULT_REPORT_INTERVAL_MS,
    format: "terminal",
    output: null,
    force: false,
    allowLongRun: false,
    recentDays: GLOBAL_FEED_COVERAGE_AUDIT_DEFAULT_RECENT_DAYS
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
    if (arg === "--format") {
      const value = args[index + 1] as GlobalFeedCoverageAuditFormat | undefined;
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
    if (arg === "--recent-days") {
      const value = Number(args[index + 1]);
      if (!Number.isFinite(value) || value <= 0) throw new Error("--recent-days requires a positive number.");
      options.recentDays = value;
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
