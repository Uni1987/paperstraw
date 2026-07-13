import { requireExplicitPrivateJetsDatabaseUrl, requirePrivateJetsDatabaseUrl } from "../lib/database/config";
import { loadProjectEnv } from "../lib/env/loadProjectEnv";
import type { HistoricalExecutionSource } from "../lib/ingestion/historicalRequest";

loadProjectEnv();

const provider = process.argv[2];

async function main() {
  if (provider !== "daily" && provider !== "historical" && provider !== "adsb_lol" && provider !== "adsb_exchange" && provider !== "opensky") {
    console.error(
      "Usage: pnpm ingest:daily, pnpm ingest:historical --from YYYY-MM-DD --to YYYY-MM-DD [--force|--reprocess], pnpm ingest:adsb-lol, pnpm ingest:adsb or pnpm ingest:opensky"
    );
    process.exit(1);
  }

  if (provider === "daily") {
    requirePrivateJetsDatabaseUrl();
    const { runDailyIngestion } = await import("../lib/ingestion/daily");
    const result = await runDailyIngestion();
    console.log(
      `Recent API refresh used ${result.provider}, fetched ${result.fetched} record(s), considered ${result.considered} newer record(s), imported ${result.imported} record(s), skipped ${result.skipped} duplicate record(s), recalculated ${result.rollups} rollup(s).`
    );
    if (result.errors.length) {
      console.error(result.errors.join("\n"));
      process.exitCode = 1;
    }
    return;
  }

  if (provider === "historical") {
    requireExplicitPrivateJetsDatabaseUrl();
    const { runHistoricalImportJob } = await import("../lib/ingestion/historicalRunner");
    const { from, to, force, source, jobId } = parseHistoricalDateArgs(process.argv.slice(3));
    const result = await runHistoricalImportJob({
      from,
      to,
      force,
      source
    }, {
      jobId,
      onProgress: (message) => console.log(message)
    });
    console.log(
      `Historical job ${result.jobId} finished with ${result.jobStatus}: processed ${result.datesProcessed} day(s), skipped ${result.datesSkipped} already-processed day(s), imported ${result.imported} record(s), updated attribution on ${result.attributionUpdated} duplicate record(s), encountered ${result.datesUnavailable} unavailable/failed day(s), recalculated ${result.rollups} rollup(s).`
    );
    if (result.errors.length) {
      console.error(result.errors.join("\n"));
      process.exitCode = 1;
    }
    return;
  }

  requirePrivateJetsDatabaseUrl();
  const { runScheduledIngestion } = await import("../lib/ingestion/scheduled");
  const result = await runScheduledIngestion(provider);
  console.log(`Imported ${result.imported} record(s).`);
  if (result.errors.length) {
    console.error(result.errors.join("\n"));
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

function parseHistoricalDateArgs(args: string[]) {
  const today = new Date();
  const defaultFrom = "2026-01-01";
  const defaultTo = formatDateArg(today);
  const fromArg = getFlagValue(args, "--from") ?? defaultFrom;
  const toArg = getFlagValue(args, "--to") ?? defaultTo;
  const sourceValue = getFlagValue(args, "--execution-source") ?? "cli";
  if (sourceValue !== "cli" && sourceValue !== "manual" && sourceValue !== "scheduled") {
    throw new Error("--execution-source must be cli, manual, or scheduled.");
  }
  const source: HistoricalExecutionSource = sourceValue;
  return {
    from: parseDateArg(fromArg, "--from"),
    to: parseDateArg(toArg, "--to"),
    force: hasFlag(args, "--force") || hasFlag(args, "--reprocess"),
    source,
    jobId: getFlagValue(args, "--job-id")
  };
}

function getFlagValue(args: string[], flag: string) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

function hasFlag(args: string[], flag: string) {
  return args.includes(flag);
}

function parseDateArg(value: string | undefined, flag: string) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${flag} must be a YYYY-MM-DD value.`);
  }
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error(`${flag} must be a valid calendar date.`);
  }
  return date;
}

function formatDateArg(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
