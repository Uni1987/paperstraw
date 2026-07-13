import { NextResponse } from "next/server";
import { dispatchHistoricalImportWorkflow } from "@/lib/ingestion/githubHistoricalWorkflow";
import { isAuthorizedCronRequest } from "@/lib/ingestion/cronAuth";
import { buildScheduledHistoricalRequest, formatUtcDateKey, type HistoricalImportRequest } from "@/lib/ingestion/historicalRequest";

type CronDispatchResult = {
  jobId: string;
  status: "queued" | "skipped";
  claimedDateKeys: string[];
  skippedDateKeys: string[];
  workflowUrl: string | null;
};

type CronIngestDependencies = {
  now?: () => Date;
  dispatch?: (request: HistoricalImportRequest) => Promise<CronDispatchResult>;
};

export async function handleCronIngest(request: Request, dependencies: CronIngestDependencies = {}) {
  if (!isMiddlewareAuthenticated(request) && !isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized cron request" }, { status: 401 });
  }

  const historicalRequest = buildScheduledHistoricalRequest((dependencies.now ?? (() => new Date()))());
  const dateKey = formatUtcDateKey(historicalRequest.from);

  try {
    const result = await (dependencies.dispatch ?? dispatchHistoricalImportWorkflow)(historicalRequest);
    return NextResponse.json(
      {
        jobId: result.jobId,
        status: result.status,
        execution: result.status === "queued" ? "github-actions-dispatched" : "not-dispatched",
        source: "scheduled",
        timezone: "UTC",
        from: dateKey,
        to: dateKey,
        force: false,
        claimedDates: result.claimedDateKeys,
        skippedDates: result.skippedDateKeys,
        workflowUrl: result.workflowUrl
      },
      { status: result.status === "queued" ? 202 : 200 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Scheduled historical import dispatch failed";
    const conflict = message.includes("already queued or running");
    return NextResponse.json(
      {
        status: conflict ? "skipped" : "failed",
        source: "scheduled",
        timezone: "UTC",
        from: dateKey,
        to: dateKey,
        force: false,
        error: message
      },
      { status: conflict ? 200 : 500 }
    );
  }
}

function isMiddlewareAuthenticated(request: Request) {
  return request.headers.get("x-paperstraw-admin-authenticated") === "1";
}
