import { ImportStatuses } from "./importStatus";
import { requireExplicitPrivateJetsDatabaseUrl } from "@/lib/database/config";
import { runHistoricalIngestion, getHistoricalResultStatus, type HistoricalIngestionResult } from "./historical";
import {
  buildHistoricalJobMetadata,
  completeHistoricalJob,
  failRunningHistoricalJob,
  getHistoricalJob,
  markHistoricalJobRunning,
  prepareHistoricalImportJob
} from "./historicalDispatch";
import {
  enumerateUtcDateRange,
  formatUtcDateKey,
  validateHistoricalImportRequest,
  type HistoricalImportRequest
} from "./historicalRequest";

export async function runHistoricalImportJob(
  request: HistoricalImportRequest,
  options: { jobId?: string; onProgress?: (message: string) => void } = {}
): Promise<HistoricalIngestionResult & { jobId: string; jobStatus: string }> {
  requireExplicitPrivateJetsDatabaseUrl();
  const validated = validateHistoricalImportRequest(request, {
    enforceCompletedDays: request.source !== "cli",
    maxDays: request.source === "manual" ? undefined : null
  });
  const dateKeys = enumerateUtcDateRange(validated.from, validated.to).map(formatUtcDateKey);

  let jobId = options.jobId;
  let workflowUrl: string | undefined;
  if (jobId) {
    const existing = await getHistoricalJob(jobId);
    if (!existing?.metadata) throw new Error("Historical job ID was not found or has invalid metadata.");
    if (
      existing.metadata.from !== formatUtcDateKey(validated.from) ||
      existing.metadata.to !== formatUtcDateKey(validated.to) ||
      existing.metadata.force !== request.force ||
      existing.metadata.source !== request.source
    ) {
      throw new Error("Historical job inputs do not match the queued request.");
    }
    if (existing.status !== ImportStatuses.QUEUED) {
      throw new Error(`Historical job ${jobId} cannot start from status ${existing.status}.`);
    }
    workflowUrl = existing.metadata.workflowUrl;
  } else {
    const prepared = await prepareHistoricalImportJob(request);
    jobId = prepared.jobId;
    if (prepared.status === "skipped") {
      return {
        jobId,
        jobStatus: ImportStatuses.SKIPPED,
        imported: 0,
        datesProcessed: dateKeys.length,
        datesUnavailable: 0,
        datesSkipped: dateKeys.length,
        attributionUpdated: 0,
        rollups: 0,
        recordsFetched: 0,
        recordsConsidered: 0,
        dateResults: dateKeys.map((dateKey) => ({
          dateKey,
          status: "skipped" as const,
          recordsFetched: 0,
          recordsConsidered: 0,
          recordsImported: 0,
          attributionUpdated: 0,
          error: null
        })),
        errors: []
      };
    }
  }

  await markHistoricalJobRunning(jobId, dateKeys);
  options.onProgress?.(`Historical job ${jobId} started via ${request.source}.`);

  try {
    const result = await runHistoricalIngestion({
      from: validated.from,
      to: validated.to,
      force: request.force,
      onProgress: options.onProgress
    });
    const status = getHistoricalResultStatus(result.dateResults, result.errors);
    const metadata = buildHistoricalJobMetadata({
      jobId,
      request,
      datesRequested: dateKeys.length,
      datesClaimed: result.dateResults.filter((item) => item.status !== "skipped").length,
      datesImported: result.dateResults.filter((item) => item.status === "imported").length,
      datesSkipped: result.dateResults.filter((item) => item.status === "skipped").length,
      datesPartial: result.dateResults.filter((item) => item.status === "partial").length,
      datesFailed: result.dateResults.filter((item) => item.status === "failed").length,
      workflowUrl,
      message: status === ImportStatuses.SUCCESS ? "Historical import completed." : "Historical import completed with non-success dates."
    });
    await completeHistoricalJob({
      jobId,
      metadata,
      status,
      recordsFetched: result.recordsFetched,
      recordsConsidered: result.recordsConsidered,
      recordsImported: result.imported,
      error: result.errors.join("\n") || null
    });
    return { ...result, jobId, jobStatus: status };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Historical import failed.";
    const metadata = buildHistoricalJobMetadata({
      jobId,
      request,
      datesRequested: dateKeys.length,
      datesClaimed: dateKeys.length,
      datesFailed: dateKeys.length,
      message: "Historical import failed and may be retried."
    });
    await failRunningHistoricalJob(jobId, dateKeys, metadata, message);
    throw error;
  }
}
