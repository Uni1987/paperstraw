import { NextResponse } from "next/server";
import { runDailyIngestion } from "@/lib/ingestion/daily";
import { isAuthorizedCronRequest } from "@/lib/ingestion/cronAuth";

type CronIngestResult = {
  provider: string;
  imported: number;
  skipped: number;
  fetched: number;
  considered: number;
  lastImportedAt: Date | null;
  errors: string[];
  rollups: number;
};

type CronIngestDependencies = {
  runRecentIngestion?: () => Promise<CronIngestResult>;
};

export async function handleCronIngest(request: Request, dependencies: CronIngestDependencies = {}) {
  if (!isMiddlewareAuthenticated(request) && !isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized cron request" }, { status: 401 });
  }

  const runRecentIngestion = dependencies.runRecentIngestion ?? runDailyIngestion;

  try {
    const result = await runRecentIngestion();
    return NextResponse.json(
      {
        provider: result.provider,
        status: result.errors.length ? "partial" : "success",
        fetched: result.fetched,
        considered: result.considered,
        imported: result.imported,
        skipped: result.skipped,
        rollups: result.rollups,
        lastImportedAt: result.lastImportedAt,
        errors: result.errors
      },
      { status: result.errors.length ? 207 : 200 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        status: "failed",
        error: error instanceof Error ? error.message : "Cron ingest failed"
      },
      { status: 500 }
    );
  }
}

function isMiddlewareAuthenticated(request: Request) {
  return request.headers.get("x-paperstraw-admin-authenticated") === "1";
}
