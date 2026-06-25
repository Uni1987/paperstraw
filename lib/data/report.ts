import { prisma } from "@/lib/prisma";
import { getAwarenessDashboardData } from "@/lib/awareness/aggregates";
import { getAttributionQualityReport, type AttributionQualityReport } from "@/lib/data/attributionQuality";
import { getImportFreshness, type ImportFreshness } from "@/lib/ingestion/freshness";
import type { AwarenessRankPoint } from "@/lib/awareness/types";

export type DataSummaryMetric = {
  label: string;
  value: string;
  detail?: string;
};

export type DataSeriesPoint = {
  period: string;
  flights?: number;
  recordsImported?: number;
  successfulImports?: number;
  failedImports?: number;
};

export type ImportHealthSummary = {
  totalImports: number;
  successfulImports: number;
  failedImports: number;
  partialImports: number;
  latestSuccessfulImportAt: Date | null;
  recentImportLogs: Array<{
    id: string;
    provider: string;
    timestamp: Date;
    status: string;
    recordsImported: number;
    errors: string | null;
  }>;
  historicalArchiveDates: Array<{
    dateKey: string;
    status: string;
    recordsImported: number;
    filesScanned: number;
    filesMatched: number;
    releaseTag: string | null;
  }>;
};

export type DataReport = {
  summary: DataSummaryMetric[];
  importHealth: ImportHealthSummary;
  flightsPerDay: DataSeriesPoint[];
  importsPerDay: DataSeriesPoint[];
  aircraftTypes: AwarenessRankPoint[];
  topCountries: AwarenessRankPoint[];
  topAirports: AwarenessRankPoint[];
  freshness: ImportFreshness;
  attributionQuality: AttributionQualityReport;
  isDemo: boolean;
};

type FlightSummaryRow = {
  dateKey: string;
  flights: bigint;
};

export async function getDataReport(): Promise<DataReport> {
  const [
    dashboard,
    flightSummary,
    importSummary,
    recentImportLogs,
    flightsPerDay,
    importsPerDay,
    archiveDates,
    freshness,
    attributionQuality
  ] = await Promise.all([
    getAwarenessDashboardData(),
    getFlightDatasetSummary(),
    getImportLogSummary(),
    getRecentImportLogs(),
    getFlightsPerDay(),
    getImportsPerDay(),
    getHistoricalArchiveDates(),
    getImportFreshness(),
    getAttributionQualityReport()
  ]);

  const importSuccessRate = importSummary.totalImports ? (importSummary.successfulImports / importSummary.totalImports) * 100 : 0;

  return {
    isDemo: dashboard.isDemo,
    summary: [
      { label: "Total flights imported", value: flightSummary.totalFlights.toLocaleString(), detail: "Source-attributed aggregate records" },
      { label: "Total estimated CO2 calculated", value: formatTonnes(flightSummary.totalCo2Kg), detail: "All imported flight records" },
      { label: "Date coverage", value: formatCoverage(flightSummary.earliestFlight, flightSummary.latestFlight), detail: "Earliest to latest imported departure date" },
      { label: "Earliest flight date", value: formatDateOnly(flightSummary.earliestFlight), detail: "Imported records only" },
      { label: "Latest flight date", value: formatDateOnly(flightSummary.latestFlight), detail: "Imported records only" },
      { label: "Imported days", value: flightSummary.importedDayCount.toLocaleString(), detail: "Distinct dates with imported flights" },
      { label: "Import success rate", value: `${Math.round(importSuccessRate).toLocaleString()}%`, detail: `${importSummary.successfulImports} of ${importSummary.totalImports} import logs` },
      { label: "Database storage", value: "PostgreSQL", detail: "Designed for Neon-managed Postgres" }
    ],
    importHealth: {
      totalImports: importSummary.totalImports,
      successfulImports: importSummary.successfulImports,
      failedImports: importSummary.failedImports,
      partialImports: importSummary.partialImports,
      latestSuccessfulImportAt: importSummary.latestSuccessfulImportAt,
      recentImportLogs,
      historicalArchiveDates: archiveDates
    },
    flightsPerDay,
    importsPerDay,
    aircraftTypes: dashboard.aircraftTypes,
    topCountries: dashboard.topCountries,
    topAirports: dashboard.topAirports,
    freshness,
    attributionQuality
  };
}

async function getFlightDatasetSummary() {
  const rows = await prisma.$queryRaw<
    Array<{
      totalFlights: bigint;
      totalCo2Kg: string | number | null;
      earliestFlight: Date | null;
      latestFlight: Date | null;
      importedDayCount: bigint;
    }>
  >`
    SELECT
      COUNT(*)::bigint AS "totalFlights",
      COALESCE(SUM("estimatedCo2Kg"), 0)::text AS "totalCo2Kg",
      MIN("departureAt") AS "earliestFlight",
      MAX("departureAt") AS "latestFlight",
      COUNT(DISTINCT DATE("departureAt"))::bigint AS "importedDayCount"
    FROM "Flight"
  `;
  const row = rows[0];
  return {
    totalFlights: Number(row?.totalFlights ?? 0),
    totalCo2Kg: Number(row?.totalCo2Kg ?? 0),
    earliestFlight: row?.earliestFlight ?? null,
    latestFlight: row?.latestFlight ?? null,
    importedDayCount: Number(row?.importedDayCount ?? 0)
  };
}

async function getImportLogSummary() {
  const rows = await prisma.$queryRaw<
    Array<{
      totalImports: bigint;
      successfulImports: bigint;
      failedImports: bigint;
      partialImports: bigint;
      latestSuccessfulImportAt: Date | null;
    }>
  >`
    SELECT
      COUNT(*)::bigint AS "totalImports",
      COUNT(*) FILTER (WHERE "status" = 'SUCCESS')::bigint AS "successfulImports",
      COUNT(*) FILTER (WHERE "status" = 'FAILED')::bigint AS "failedImports",
      COUNT(*) FILTER (WHERE "status" = 'PARTIAL')::bigint AS "partialImports",
      MAX("timestamp") FILTER (WHERE "status" = 'SUCCESS') AS "latestSuccessfulImportAt"
    FROM "ImportLog"
  `;
  const row = rows[0];
  return {
    totalImports: Number(row?.totalImports ?? 0),
    successfulImports: Number(row?.successfulImports ?? 0),
    failedImports: Number(row?.failedImports ?? 0),
    partialImports: Number(row?.partialImports ?? 0),
    latestSuccessfulImportAt: row?.latestSuccessfulImportAt ?? null
  };
}

async function getRecentImportLogs() {
  return prisma.importLog.findMany({
    select: {
      id: true,
      provider: true,
      timestamp: true,
      status: true,
      recordsImported: true,
      errors: true
    },
    orderBy: {
      timestamp: "desc"
    },
    take: 8
  });
}

async function getHistoricalArchiveDates() {
  try {
    return await prisma.$queryRaw<
      Array<{
        dateKey: string;
        status: string;
        recordsImported: number;
        filesScanned: number;
        filesMatched: number;
        releaseTag: string | null;
      }>
    >`
      SELECT "dateKey", "status", "recordsImported", "filesScanned", "filesMatched", "releaseTag"
      FROM "ProcessedArchiveDate"
      ORDER BY "dateKey" DESC
      LIMIT 8
    `;
  } catch {
    return [];
  }
}

async function getFlightsPerDay(): Promise<DataSeriesPoint[]> {
  const rows = await prisma.$queryRaw<FlightSummaryRow[]>`
    SELECT "dateKey", flights
    FROM (
      SELECT TO_CHAR(DATE("departureAt"), 'YYYY-MM-DD') AS "dateKey", COUNT(*)::bigint AS flights
      FROM "Flight"
      GROUP BY DATE("departureAt")
      ORDER BY DATE("departureAt") DESC
      LIMIT 30
    ) daily_flights
    ORDER BY "dateKey" ASC
  `;

  return rows.map((row) => ({
    period: formatShortDate(row.dateKey),
    flights: Number(row.flights)
  }));
}

async function getImportsPerDay(): Promise<DataSeriesPoint[]> {
  const rows = await prisma.$queryRaw<
    Array<{
      dateKey: string;
      recordsImported: bigint | number;
      successfulImports: bigint;
      failedImports: bigint;
    }>
  >`
    SELECT "dateKey", "recordsImported", "successfulImports", "failedImports"
    FROM (
      SELECT
        TO_CHAR(DATE("timestamp"), 'YYYY-MM-DD') AS "dateKey",
        COALESCE(SUM("recordsImported"), 0)::bigint AS "recordsImported",
        COUNT(*) FILTER (WHERE "status" = 'SUCCESS')::bigint AS "successfulImports",
        COUNT(*) FILTER (WHERE "status" = 'FAILED')::bigint AS "failedImports"
      FROM "ImportLog"
      GROUP BY DATE("timestamp")
      ORDER BY DATE("timestamp") DESC
      LIMIT 30
    ) daily_imports
    ORDER BY "dateKey" ASC
  `;

  return rows.map((row) => ({
    period: formatShortDate(row.dateKey),
    recordsImported: Number(row.recordsImported),
    successfulImports: Number(row.successfulImports),
    failedImports: Number(row.failedImports)
  }));
}

function formatShortDate(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "2-digit" });
}

function formatDateOnly(date: Date | null) {
  if (!date) return "No records";
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "2-digit" });
}

function formatCoverage(earliest: Date | null, latest: Date | null) {
  if (!earliest || !latest) return "No records";
  return `${formatDateOnly(earliest)} - ${formatDateOnly(latest)}`;
}

function formatTonnes(valueKg: number) {
  return `${Math.round(valueKg / 1000).toLocaleString()} tonnes CO2`;
}
