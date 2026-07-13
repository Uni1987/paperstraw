import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireExplicitPrivateJetsDatabaseUrl } from "@/lib/database/config";
import { ImportStatuses } from "./importStatus";
import { ADSB_LOL_DATA_SOURCE } from "./providerConstants";
import {
  enumerateUtcDateRange,
  formatUtcDateKey,
  validateHistoricalImportRequest,
  type HistoricalExecutionSource,
  type HistoricalImportRequest
} from "./historicalRequest";
import { IngestionModes } from "./state";

const JOB_METADATA_PREFIX = "PAPERSTRAW_HISTORICAL_JOB:";
const ACTIVE_JOB_STALE_AFTER_MS = 6 * 60 * 60 * 1000;

export type HistoricalJobMetadata = {
  kind: "paperstraw-historical-job";
  jobId: string;
  from: string;
  to: string;
  force: boolean;
  source: HistoricalExecutionSource;
  datesRequested: number;
  datesClaimed: number;
  datesImported: number;
  datesSkipped: number;
  datesPartial: number;
  datesFailed: number;
  workflowUrl?: string;
  message?: string;
};

export type PreparedHistoricalJob = {
  jobId: string;
  request: HistoricalImportRequest;
  status: "queued" | "skipped";
  claimedDateKeys: string[];
  skippedDateKeys: string[];
};

type HistoricalImportLogRow = {
  id: string;
  timestamp: Date | string;
  runStartedAt: Date | string | null;
  runEndedAt: Date | string | null;
  status: string;
  recordsFetched: number;
  recordsConsidered: number;
  recordsImported: number;
  errors: string | null;
};

type ExistingArchiveDate = {
  dateKey: string;
  status: string;
  updatedAt: Date | string;
};

export async function prepareHistoricalImportJob(request: HistoricalImportRequest): Promise<PreparedHistoricalJob> {
  requireExplicitPrivateJetsDatabaseUrl();
  const validated = validateHistoricalImportRequest(request);
  const dates = enumerateUtcDateRange(validated.from, validated.to);
  const dateKeys = dates.map(formatUtcDateKey);
  const jobId = randomUUID();
  const now = new Date();
  const staleBefore = new Date(now.getTime() - ACTIVE_JOB_STALE_AFTER_MS);

  return prisma.$transaction(async (tx) => {
    for (const dateKey of dateKeys) {
      await tx.$queryRaw<Array<{ lock: string }>>`
        SELECT pg_advisory_xact_lock(hashtext(${`paperstraw-private-jets-historical:${dateKey}`}))::text AS "lock"
      `;
    }
    const existing = await tx.$queryRaw<ExistingArchiveDate[]>`
      SELECT "dateKey", "status", "updatedAt"
      FROM "ProcessedArchiveDate"
      WHERE "provider" = ${ADSB_LOL_DATA_SOURCE}
        AND "dateKey" IN (${Prisma.join(dateKeys)})
      FOR UPDATE
    `;
    const existingByDate = new Map(existing.map((row) => [row.dateKey, row]));
    const active = existing.filter((row) =>
      (row.status === ImportStatuses.QUEUED || row.status === ImportStatuses.RUNNING) &&
      new Date(row.updatedAt).getTime() >= staleBefore.getTime()
    );
    if (active.length) {
      throw new Error(`A historical import is already queued or running for ${active.map((row) => row.dateKey).join(", ")}.`);
    }

    const skippedDateKeys = request.force
      ? []
      : dateKeys.filter((dateKey) => existingByDate.get(dateKey)?.status === ImportStatuses.SUCCESS);
    const claimedDateKeys = dateKeys.filter((dateKey) => !skippedDateKeys.includes(dateKey));
    const status = claimedDateKeys.length ? ImportStatuses.QUEUED : ImportStatuses.SKIPPED;
    const metadata = buildHistoricalJobMetadata({
      jobId,
      request,
      datesRequested: dateKeys.length,
      datesClaimed: claimedDateKeys.length,
      datesSkipped: skippedDateKeys.length,
      message: claimedDateKeys.length ? "Waiting for GitHub Actions runner." : "All requested dates were already imported successfully."
    });

    await tx.$executeRaw`
      INSERT INTO "ImportLog" (
        "id", "provider", "mode", "timestamp", "runStartedAt", "runEndedAt", "status",
        "recordsFetched", "recordsConsidered", "recordsImported", "errors"
      ) VALUES (
        ${jobId}, ${ADSB_LOL_DATA_SOURCE}, ${IngestionModes.HISTORICAL_BOOTSTRAP}, ${now},
        ${null}, ${claimedDateKeys.length ? null : now}, ${status}, 0, 0, 0, ${encodeHistoricalJobDetails(metadata)}
      )
    `;

    for (const dateKey of claimedDateKeys) {
      await tx.$executeRaw`
        INSERT INTO "ProcessedArchiveDate" (
          "id", "provider", "dateKey", "status", "recordsImported", "error", "processedAt", "updatedAt"
        ) VALUES (
          ${randomUUID()}, ${ADSB_LOL_DATA_SOURCE}, ${dateKey}, ${ImportStatuses.QUEUED}, 0,
          ${`Queued by historical job ${jobId}.`}, ${now}, ${now}
        )
        ON CONFLICT ("provider", "dateKey") DO UPDATE SET
          "status" = excluded."status",
          "error" = excluded."error",
          "updatedAt" = excluded."updatedAt"
      `;
    }

    return {
      jobId,
      request: { from: validated.from, to: validated.to, force: request.force, source: request.source },
      status: claimedDateKeys.length ? "queued" : "skipped",
      claimedDateKeys,
      skippedDateKeys
    };
  });
}

export async function markHistoricalJobRunning(jobId: string, dateKeys: string[]) {
  const now = new Date();
  await prisma.$transaction([
    prisma.$executeRaw`
      UPDATE "ImportLog"
      SET "status" = ${ImportStatuses.RUNNING}, "runStartedAt" = ${now}, "timestamp" = ${now}
      WHERE "id" = ${jobId} AND "mode" = ${IngestionModes.HISTORICAL_BOOTSTRAP}
    `,
    prisma.$executeRaw`
      UPDATE "ProcessedArchiveDate"
      SET "status" = ${ImportStatuses.RUNNING}, "error" = NULL, "updatedAt" = ${now}
      WHERE "provider" = ${ADSB_LOL_DATA_SOURCE}
        AND "dateKey" IN (${Prisma.join(dateKeys)})
        AND "status" = ${ImportStatuses.QUEUED}
    `
  ]);
}

export async function getHistoricalJob(jobId: string) {
  requireExplicitPrivateJetsDatabaseUrl();
  const rows = await prisma.$queryRaw<HistoricalImportLogRow[]>`
    SELECT "id", "timestamp", "runStartedAt", "runEndedAt", "status",
           "recordsFetched", "recordsConsidered", "recordsImported", "errors"
    FROM "ImportLog"
    WHERE "id" = ${jobId} AND "mode" = ${IngestionModes.HISTORICAL_BOOTSTRAP}
    LIMIT 1
  `;
  const row = rows[0] ?? null;
  if (!row) return null;
  return { ...row, ...parseHistoricalJobDetails(row.errors) };
}

export async function getRecentHistoricalJobs(limit = 8) {
  requireExplicitPrivateJetsDatabaseUrl();
  const rows = await prisma.$queryRaw<HistoricalImportLogRow[]>`
    SELECT "id", "timestamp", "runStartedAt", "runEndedAt", "status",
           "recordsFetched", "recordsConsidered", "recordsImported", "errors"
    FROM "ImportLog"
    WHERE "provider" = ${ADSB_LOL_DATA_SOURCE}
      AND "mode" = ${IngestionModes.HISTORICAL_BOOTSTRAP}
    ORDER BY "timestamp" DESC
    LIMIT ${limit}
  `;
  return rows.map((row) => ({ ...row, ...parseHistoricalJobDetails(row.errors) }));
}

export async function setHistoricalJobWorkflowUrl(job: PreparedHistoricalJob, workflowUrl: string) {
  const metadata = buildHistoricalJobMetadata({
    jobId: job.jobId,
    request: job.request,
    datesRequested: job.claimedDateKeys.length + job.skippedDateKeys.length,
    datesClaimed: job.claimedDateKeys.length,
    datesSkipped: job.skippedDateKeys.length,
    workflowUrl,
    message: "GitHub Actions workflow dispatched."
  });
  await prisma.$executeRaw`
    UPDATE "ImportLog"
    SET "errors" = ${encodeHistoricalJobDetails(metadata)}
    WHERE "id" = ${job.jobId} AND "status" = ${ImportStatuses.QUEUED}
  `;
}

export async function completeHistoricalJob({
  jobId,
  metadata,
  status,
  recordsFetched,
  recordsConsidered,
  recordsImported,
  error
}: {
  jobId: string;
  metadata: HistoricalJobMetadata;
  status: string;
  recordsFetched: number;
  recordsConsidered: number;
  recordsImported: number;
  error?: string | null;
}) {
  const now = new Date();
  await prisma.$executeRaw`
    UPDATE "ImportLog"
    SET "status" = ${status},
        "timestamp" = ${now},
        "runEndedAt" = ${now},
        "recordsFetched" = ${recordsFetched},
        "recordsConsidered" = ${recordsConsidered},
        "recordsImported" = ${recordsImported},
        "errors" = ${encodeHistoricalJobDetails(metadata, error)}
    WHERE "id" = ${jobId}
  `;
}

export async function failQueuedHistoricalJob(job: PreparedHistoricalJob, message: string) {
  const now = new Date();
  const metadata = buildHistoricalJobMetadata({
    jobId: job.jobId,
    request: job.request,
    datesRequested: job.claimedDateKeys.length + job.skippedDateKeys.length,
    datesClaimed: job.claimedDateKeys.length,
    datesSkipped: job.skippedDateKeys.length,
    datesFailed: job.claimedDateKeys.length,
    message: "Workflow dispatch failed. The request may be retried."
  });
  await prisma.$transaction([
    prisma.$executeRaw`
      UPDATE "ImportLog"
      SET "status" = ${ImportStatuses.FAILED}, "runEndedAt" = ${now}, "timestamp" = ${now},
          "errors" = ${encodeHistoricalJobDetails(metadata, message)}
      WHERE "id" = ${job.jobId}
    `,
    prisma.$executeRaw`
      UPDATE "ProcessedArchiveDate"
      SET "status" = ${ImportStatuses.FAILED}, "error" = ${message}, "updatedAt" = ${now}
      WHERE "provider" = ${ADSB_LOL_DATA_SOURCE}
        AND "dateKey" IN (${Prisma.join(job.claimedDateKeys)})
        AND "status" = ${ImportStatuses.QUEUED}
    `
  ]);
}

export async function failRunningHistoricalJob(jobId: string, dateKeys: string[], metadata: HistoricalJobMetadata, message: string) {
  const now = new Date();
  await prisma.$transaction([
    prisma.$executeRaw`
      UPDATE "ImportLog"
      SET "status" = ${ImportStatuses.FAILED}, "runEndedAt" = ${now}, "timestamp" = ${now},
          "errors" = ${encodeHistoricalJobDetails(metadata, message)}
      WHERE "id" = ${jobId}
    `,
    prisma.$executeRaw`
      UPDATE "ProcessedArchiveDate"
      SET "status" = ${ImportStatuses.FAILED}, "error" = ${message}, "updatedAt" = ${now}
      WHERE "provider" = ${ADSB_LOL_DATA_SOURCE}
        AND "dateKey" IN (${Prisma.join(dateKeys)})
        AND "status" IN (${ImportStatuses.QUEUED}, ${ImportStatuses.RUNNING})
    `
  ]);
}

export function buildHistoricalJobMetadata({
  jobId,
  request,
  datesRequested,
  datesClaimed,
  datesImported = 0,
  datesSkipped = 0,
  datesPartial = 0,
  datesFailed = 0,
  workflowUrl,
  message
}: {
  jobId: string;
  request: HistoricalImportRequest;
  datesRequested: number;
  datesClaimed: number;
  datesImported?: number;
  datesSkipped?: number;
  datesPartial?: number;
  datesFailed?: number;
  workflowUrl?: string;
  message?: string;
}): HistoricalJobMetadata {
  return {
    kind: "paperstraw-historical-job",
    jobId,
    from: formatUtcDateKey(request.from),
    to: formatUtcDateKey(request.to),
    force: request.force,
    source: request.source,
    datesRequested,
    datesClaimed,
    datesImported,
    datesSkipped,
    datesPartial,
    datesFailed,
    workflowUrl,
    message
  };
}

export function encodeHistoricalJobDetails(metadata: HistoricalJobMetadata, error?: string | null) {
  return `${JOB_METADATA_PREFIX}${JSON.stringify(metadata)}${error ? `\n${error}` : ""}`;
}

export function parseHistoricalJobDetails(value: string | null | undefined) {
  if (!value?.startsWith(JOB_METADATA_PREFIX)) return { metadata: null, error: value ?? null };
  const [firstLine, ...errorLines] = value.split("\n");
  try {
    const metadata = JSON.parse(firstLine.slice(JOB_METADATA_PREFIX.length)) as HistoricalJobMetadata;
    return { metadata, error: errorLines.join("\n") || null };
  } catch {
    return { metadata: null, error: value };
  }
}
