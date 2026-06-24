import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { ImportStatuses, type ImportStatusValue } from "./importStatus";
import type { DataSourceProviderValue } from "./providerConstants";

export const IngestionModes = {
  DAILY_API: "DAILY_API",
  HISTORICAL_BOOTSTRAP: "HISTORICAL_BOOTSTRAP"
} as const;

export type IngestionModeValue = (typeof IngestionModes)[keyof typeof IngestionModes];

export type IngestionCursorRow = {
  id: string;
  provider: string;
  mode: string;
  lastImportedAt: Date | string | null;
  lastSuccessfulImportAt: Date | string | null;
  lastRunAt: Date | string | null;
  lastStatus: string | null;
  lastError: string | null;
  recordsImported: number;
  createdAt: Date | string;
  updatedAt: Date | string;
};

export type ImportLogSummaryRow = {
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

export type ProcessedArchiveDateRow = {
  id: string;
  provider: string;
  dateKey: string;
  status: string;
  releaseTag: string | null;
  assetNames: string | null;
  filesScanned: number;
  filesMatched: number;
  recordsParsed: number;
  privateJetMatches: number;
  recordsImported: number;
  error: string | null;
  processedAt: Date | string;
  updatedAt: Date | string;
};

type CursorUpdate = {
  provider: DataSourceProviderValue;
  mode: IngestionModeValue;
  status: ImportStatusValue;
  recordsImported: number;
  lastImportedAt?: Date | null;
  error?: string | null;
};

type ArchiveDateUpdate = {
  provider: DataSourceProviderValue;
  dateKey: string;
  status: ImportStatusValue;
  recordsImported: number;
  releaseTag?: string | null;
  assetNames?: string[] | null;
  filesScanned?: number;
  filesMatched?: number;
  recordsParsed?: number;
  privateJetMatches?: number;
  error?: string | null;
};

export async function getIngestionCursor(provider: DataSourceProviderValue, mode: IngestionModeValue) {
  const rows = await prisma.$queryRaw<IngestionCursorRow[]>`
    SELECT * FROM "IngestionCursor"
    WHERE "provider" = ${provider} AND "mode" = ${mode}
    LIMIT 1
  `;
  return rows[0] ?? null;
}

export async function updateIngestionCursor(update: CursorUpdate) {
  const now = new Date();
  const lastSuccessfulImportAt = update.status === ImportStatuses.SUCCESS ? now : null;
  await prisma.$executeRaw`
    INSERT INTO "IngestionCursor" (
      "id",
      "provider",
      "mode",
      "lastImportedAt",
      "lastSuccessfulImportAt",
      "lastRunAt",
      "lastStatus",
      "lastError",
      "recordsImported",
      "updatedAt"
    )
    VALUES (
      ${randomUUID()},
      ${update.provider},
      ${update.mode},
      ${update.lastImportedAt ?? null},
      ${lastSuccessfulImportAt},
      ${now},
      ${update.status},
      ${update.error ?? null},
      ${update.recordsImported},
      ${now}
    )
    ON CONFLICT("provider", "mode") DO UPDATE SET
      "lastImportedAt" = COALESCE(excluded."lastImportedAt", "IngestionCursor"."lastImportedAt"),
      "lastSuccessfulImportAt" = COALESCE(excluded."lastSuccessfulImportAt", "IngestionCursor"."lastSuccessfulImportAt"),
      "lastRunAt" = excluded."lastRunAt",
      "lastStatus" = excluded."lastStatus",
      "lastError" = excluded."lastError",
      "recordsImported" = excluded."recordsImported",
      "updatedAt" = excluded."updatedAt"
  `;
}

export async function getProcessedArchiveDate(provider: DataSourceProviderValue, dateKey: string) {
  const rows = await prisma.$queryRaw<ProcessedArchiveDateRow[]>`
    SELECT * FROM "ProcessedArchiveDate"
    WHERE "provider" = ${provider} AND "dateKey" = ${dateKey}
    LIMIT 1
  `;
  return rows[0] ?? null;
}

export async function upsertProcessedArchiveDate(update: ArchiveDateUpdate) {
  const now = new Date();
  const assetNames = update.assetNames?.join(", ") ?? null;
  await prisma.$executeRaw`
    INSERT INTO "ProcessedArchiveDate" (
      "id",
      "provider",
      "dateKey",
      "status",
      "releaseTag",
      "assetNames",
      "filesScanned",
      "filesMatched",
      "recordsParsed",
      "privateJetMatches",
      "recordsImported",
      "error",
      "processedAt",
      "updatedAt"
    )
    VALUES (
      ${randomUUID()},
      ${update.provider},
      ${update.dateKey},
      ${update.status},
      ${update.releaseTag ?? null},
      ${assetNames},
      ${update.filesScanned ?? 0},
      ${update.filesMatched ?? 0},
      ${update.recordsParsed ?? 0},
      ${update.privateJetMatches ?? 0},
      ${update.recordsImported},
      ${update.error ?? null},
      ${now},
      ${now}
    )
    ON CONFLICT("provider", "dateKey") DO UPDATE SET
      "status" = excluded."status",
      "releaseTag" = COALESCE(excluded."releaseTag", "ProcessedArchiveDate"."releaseTag"),
      "assetNames" = COALESCE(excluded."assetNames", "ProcessedArchiveDate"."assetNames"),
      "filesScanned" = excluded."filesScanned",
      "filesMatched" = excluded."filesMatched",
      "recordsParsed" = excluded."recordsParsed",
      "privateJetMatches" = excluded."privateJetMatches",
      "recordsImported" = excluded."recordsImported",
      "error" = excluded."error",
      "processedAt" = excluded."processedAt",
      "updatedAt" = excluded."updatedAt"
  `;
}

export async function hasExistingHistoricalRecords(dateKey: string, provider: DataSourceProviderValue) {
  const rows = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*) as count
    FROM "Flight"
    WHERE "dataSource" = ${provider}
      AND "sourceRecordId" LIKE ${`adsb-lol-history-${dateKey}%`}
  `;
  return Number(rows[0]?.count ?? 0);
}

export async function getImportStatusSummary() {
  const [cursors, processedArchiveDates, recentImportLogs] = await Promise.all([
    prisma.$queryRaw<IngestionCursorRow[]>`
      SELECT * FROM "IngestionCursor"
      ORDER BY "provider" ASC, "mode" ASC
    `,
    prisma.$queryRaw<ProcessedArchiveDateRow[]>`
      SELECT * FROM "ProcessedArchiveDate"
      ORDER BY "dateKey" DESC
      LIMIT 10
    `,
    prisma.$queryRaw<ImportLogSummaryRow[]>`
      SELECT "id", "provider", "mode", "timestamp", "runStartedAt", "runEndedAt", "status", "recordsFetched", "recordsConsidered", "recordsImported", "errors"
      FROM "ImportLog"
      ORDER BY "timestamp" DESC
      LIMIT 8
    `
  ]);

  return { cursors, processedArchiveDates, recentImportLogs };
}
