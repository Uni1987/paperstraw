import { stat } from "node:fs/promises";
import { join } from "node:path";
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
  departureAt: Date;
  estimatedCo2Kg: unknown;
};

export async function getDataReport(): Promise<DataReport> {
  const [dashboard, flights, importLogs, archiveDates, databaseFileSize, freshness, attributionQuality] = await Promise.all([
    getAwarenessDashboardData(),
    prisma.flight.findMany({
      select: {
        departureAt: true,
        estimatedCo2Kg: true
      },
      orderBy: {
        departureAt: "asc"
      }
    }),
    prisma.importLog.findMany({
      orderBy: {
        timestamp: "desc"
      }
    }),
    getHistoricalArchiveDates(),
    getDatabaseFileSize(),
    getImportFreshness(),
    getAttributionQualityReport()
  ]);

  const totalFlights = flights.length;
  const totalCo2Kg = flights.reduce((total, flight) => total + Number(flight.estimatedCo2Kg), 0);
  const earliestFlight = flights[0]?.departureAt ?? null;
  const latestFlight = flights[flights.length - 1]?.departureAt ?? null;
  const importedDayCount = new Set(flights.map((flight) => dateKey(flight.departureAt))).size;
  const successfulImports = importLogs.filter((log) => log.status === "SUCCESS").length;
  const failedImports = importLogs.filter((log) => log.status === "FAILED").length;
  const partialImports = importLogs.filter((log) => log.status === "PARTIAL").length;
  const latestSuccessfulImportAt = importLogs.find((log) => log.status === "SUCCESS")?.timestamp ?? null;
  const importSuccessRate = importLogs.length ? (successfulImports / importLogs.length) * 100 : 0;

  return {
    isDemo: dashboard.isDemo,
    summary: [
      { label: "Total flights imported", value: totalFlights.toLocaleString(), detail: "Source-attributed aggregate records" },
      { label: "Total estimated CO2 calculated", value: formatTonnes(totalCo2Kg), detail: "All imported flight records" },
      { label: "Date coverage", value: formatCoverage(earliestFlight, latestFlight), detail: "Earliest to latest imported departure date" },
      { label: "Earliest flight date", value: formatDateOnly(earliestFlight), detail: "Imported records only" },
      { label: "Latest flight date", value: formatDateOnly(latestFlight), detail: "Imported records only" },
      { label: "Imported days", value: importedDayCount.toLocaleString(), detail: "Distinct dates with imported flights" },
      { label: "Import success rate", value: `${Math.round(importSuccessRate).toLocaleString()}%`, detail: `${successfulImports} of ${importLogs.length} import logs` },
      { label: "Database file size", value: databaseFileSize, detail: "Local SQLite database when available" }
    ],
    importHealth: {
      totalImports: importLogs.length,
      successfulImports,
      failedImports,
      partialImports,
      latestSuccessfulImportAt,
      recentImportLogs: importLogs.slice(0, 8),
      historicalArchiveDates: archiveDates
    },
    flightsPerDay: buildFlightsPerDay(flights),
    importsPerDay: buildImportsPerDay(importLogs),
    aircraftTypes: dashboard.aircraftTypes,
    topCountries: dashboard.topCountries,
    topAirports: dashboard.topAirports,
    freshness,
    attributionQuality
  };
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
      SELECT dateKey, status, recordsImported, filesScanned, filesMatched, releaseTag
      FROM ProcessedArchiveDate
      ORDER BY dateKey DESC
      LIMIT 8
    `;
  } catch {
    return [];
  }
}

async function getDatabaseFileSize() {
  try {
    const stats = await stat(join(process.cwd(), "prisma", "dev.db"));
    return formatBytes(stats.size);
  } catch {
    return "Unavailable";
  }
}

function buildFlightsPerDay(flights: FlightSummaryRow[]): DataSeriesPoint[] {
  const grouped = new Map<string, number>();
  for (const flight of flights) {
    const key = dateKey(flight.departureAt);
    grouped.set(key, (grouped.get(key) ?? 0) + 1);
  }

  return [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(-30)
    .map(([period, flights]) => ({
      period: formatShortDate(period),
      flights
    }));
}

function buildImportsPerDay(importLogs: Array<{ timestamp: Date; status: string; recordsImported: number }>): DataSeriesPoint[] {
  const grouped = new Map<string, { recordsImported: number; successfulImports: number; failedImports: number }>();
  for (const log of importLogs) {
    const key = dateKey(log.timestamp);
    const existing = grouped.get(key) ?? { recordsImported: 0, successfulImports: 0, failedImports: 0 };
    existing.recordsImported += log.recordsImported;
    if (log.status === "SUCCESS") existing.successfulImports += 1;
    if (log.status === "FAILED") existing.failedImports += 1;
    grouped.set(key, existing);
  }

  return [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(-30)
    .map(([period, values]) => ({
      period: formatShortDate(period),
      ...values
    }));
}

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
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

function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024).toLocaleString()} KB`;
  return `${bytes.toLocaleString()} B`;
}
