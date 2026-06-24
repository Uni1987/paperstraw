import { prisma } from "@/lib/prisma";
import { getDataRefreshIntervalMinutes, formatRefreshInterval } from "@/lib/config/refresh";
import { ImportStatuses } from "./importStatus";
import { ADSB_LOL_DATA_SOURCE } from "./providerConstants";
import { IngestionModes } from "./state";

export type ImportFreshnessLog = {
  id: string;
  provider: string;
  mode: string | null;
  timestamp: Date | string;
  runStartedAt: Date | string | null;
  runEndedAt: Date | string | null;
  status: string;
  recordsFetched: number;
  recordsConsidered: number;
  recordsImported: number;
  errors: string | null;
};

export type ImportFreshness = {
  refreshIntervalMinutes: number;
  refreshIntervalLabel: string;
  latestStatus: string | null;
  latestRunAt: Date | null;
  latestRunStartedAt: Date | null;
  latestRunEndedAt: Date | null;
  latestRecordsFetched: number;
  latestRecordsConsidered: number;
  latestRecordsImported: number;
  lastSuccessfulUpdateAt: Date | null;
  nextExpectedUpdateAt: Date | null;
  latestUpdateFailed: boolean;
  publicMessage: string;
};

export async function getImportFreshness(): Promise<ImportFreshness> {
  const intervalMinutes = getDataRefreshIntervalMinutes();
  const logs = await prisma.$queryRaw<ImportFreshnessLog[]>`
    SELECT
      "id",
      "provider",
      "mode",
      "timestamp",
      "runStartedAt",
      "runEndedAt",
      "status",
      "recordsFetched",
      "recordsConsidered",
      "recordsImported",
      "errors"
    FROM "ImportLog"
    WHERE "provider" = ${ADSB_LOL_DATA_SOURCE}
      AND ("mode" = ${IngestionModes.DAILY_API} OR "mode" IS NULL)
    ORDER BY "timestamp" DESC
    LIMIT 25
  `;

  return buildImportFreshness(logs, intervalMinutes);
}

export function buildImportFreshness(logs: ImportFreshnessLog[], refreshIntervalMinutes: number): ImportFreshness {
  const latest = logs[0] ?? null;
  const latestSuccessful = logs.find((log) => log.status === ImportStatuses.SUCCESS || log.status === ImportStatuses.PARTIAL) ?? null;
  const latestRunAt = normalizeDate(latest?.timestamp ?? null);
  const latestRunStartedAt = normalizeDate(latest?.runStartedAt ?? null);
  const latestRunEndedAt = normalizeDate(latest?.runEndedAt ?? latest?.timestamp ?? null);
  const lastSuccessfulUpdateAt = normalizeDate(latestSuccessful?.runEndedAt ?? latestSuccessful?.timestamp ?? null);
  const latestUpdateFailed = latest?.status === ImportStatuses.FAILED && Boolean(lastSuccessfulUpdateAt);
  const nextExpectedUpdateAt = lastSuccessfulUpdateAt
    ? new Date(lastSuccessfulUpdateAt.getTime() + refreshIntervalMinutes * 60 * 1000)
    : null;

  return {
    refreshIntervalMinutes,
    refreshIntervalLabel: formatRefreshInterval(refreshIntervalMinutes),
    latestStatus: latest?.status ?? null,
    latestRunAt,
    latestRunStartedAt,
    latestRunEndedAt,
    latestRecordsFetched: latest?.recordsFetched ?? 0,
    latestRecordsConsidered: latest?.recordsConsidered ?? 0,
    latestRecordsImported: latest?.recordsImported ?? 0,
    lastSuccessfulUpdateAt,
    nextExpectedUpdateAt,
    latestUpdateFailed,
    publicMessage: buildFreshnessMessage({
      latestUpdateFailed,
      lastSuccessfulUpdateAt,
      refreshIntervalMinutes
    })
  };
}

export function buildFreshnessMessage({
  latestUpdateFailed,
  lastSuccessfulUpdateAt,
  refreshIntervalMinutes
}: {
  latestUpdateFailed: boolean;
  lastSuccessfulUpdateAt: Date | null;
  refreshIntervalMinutes: number;
}) {
  if (latestUpdateFailed && lastSuccessfulUpdateAt) {
    return `Latest update failed. Showing last successful data from ${formatFreshnessDate(lastSuccessfulUpdateAt)}.`;
  }

  if (lastSuccessfulUpdateAt) {
    return `Last successful update: ${formatFreshnessDate(lastSuccessfulUpdateAt)}.`;
  }

  return `${formatRefreshInterval(refreshIntervalMinutes)}. No successful update has run yet.`;
}

export function formatFreshnessDate(date: Date | null) {
  if (!date) return "n/a";
  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function normalizeDate(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
