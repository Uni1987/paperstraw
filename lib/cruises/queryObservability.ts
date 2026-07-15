const DEFAULT_SLOW_QUERY_THRESHOLD_MS = 1_500;
const MIN_SLOW_QUERY_THRESHOLD_MS = 250;
const MAX_SLOW_QUERY_THRESHOLD_MS = 10_000;
const PUBLIC_CRUISE_QUERY_OPERATIONS = new Set([
  "dashboard-aggregate-queries",
  "dashboard-base-queries",
  "map-period-queries",
  "public-data-summary",
  "ship-detail",
  "ship-eligibility",
  "verified-vessel-lookup"
]);

type QueryResultCount = number | null;

export async function observePublicCruiseQuery<T>(
  operation: string,
  query: () => Promise<T>,
  resultCount: (result: T) => QueryResultCount = inferResultCount,
  cacheStatus: "refresh" | "uncached" = "refresh"
): Promise<T> {
  const startedAt = Date.now();
  try {
    const result = await query();
    const durationMs = Date.now() - startedAt;
    if (shouldLogCruiseQuery(durationMs)) {
      logCruiseQueryEvent({ operation, outcome: "success", durationMs, resultCount: resultCount(result), cacheStatus });
    }
    return result;
  } catch {
    logCruiseQueryEvent({ operation, outcome: "failure", durationMs: Date.now() - startedAt, resultCount: null, cacheStatus });
    throw new Error("Cruise data query failed.");
  }
}

export function getCruiseSlowQueryThresholdMs(value = process.env.CRUISE_SLOW_QUERY_MS) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_SLOW_QUERY_THRESHOLD_MS;
  return Math.min(MAX_SLOW_QUERY_THRESHOLD_MS, Math.max(MIN_SLOW_QUERY_THRESHOLD_MS, Math.round(parsed)));
}

export function buildPublicCruiseQueryEvent(input: {
  operation: string;
  outcome: "success" | "failure";
  durationMs: number;
  resultCount: QueryResultCount;
  cacheStatus?: "refresh" | "uncached";
}) {
  return {
    event: "paperstraw.cruises.public-query",
    operation: sanitizeOperation(input.operation),
    outcome: input.outcome,
    durationMs: Math.max(0, Math.round(input.durationMs)),
    resultCount: input.resultCount === null ? null : Math.max(0, Math.round(input.resultCount)),
    cacheStatus: input.cacheStatus ?? "refresh"
  };
}

function shouldLogCruiseQuery(durationMs: number) {
  return process.env.CRUISE_QUERY_TIMING === "true" || durationMs >= getCruiseSlowQueryThresholdMs();
}

function logCruiseQueryEvent(input: Parameters<typeof buildPublicCruiseQueryEvent>[0]) {
  console.warn(JSON.stringify(buildPublicCruiseQueryEvent(input)));
}

function inferResultCount(value: unknown): QueryResultCount {
  if (Array.isArray(value)) return value.length;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return null;
}

function sanitizeOperation(value: string) {
  const safe = value.replace(/[^a-z0-9._-]/gi, "-").slice(0, 80);
  return PUBLIC_CRUISE_QUERY_OPERATIONS.has(safe) ? safe : "unrecognized-operation";
}
