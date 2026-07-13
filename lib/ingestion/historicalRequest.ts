export const HISTORICAL_SCHEDULE_TIMEZONE = "UTC";
export const MAX_MANUAL_HISTORICAL_RANGE_DAYS = 31;

export type HistoricalExecutionSource = "scheduled" | "manual" | "cli";

export type HistoricalImportRequest = {
  from: Date;
  to: Date;
  force: boolean;
  source: HistoricalExecutionSource;
};

export function parseUtcDateKey(value: string, field = "date") {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${field} must be a YYYY-MM-DD value.`);
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error(`${field} must be a valid calendar date.`);
  }
  return date;
}

export function formatUtcDateKey(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

export function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function getYesterdayUtc(now = new Date()) {
  const yesterday = startOfUtcDay(now);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  return yesterday;
}

export function enumerateUtcDateRange(from: Date, to: Date) {
  const dates: Date[] = [];
  const current = startOfUtcDay(from);
  const end = startOfUtcDay(to);
  while (current.getTime() <= end.getTime()) {
    dates.push(new Date(current));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return dates;
}

export function getInclusiveDayCount(from: Date, to: Date) {
  return Math.floor((startOfUtcDay(to).getTime() - startOfUtcDay(from).getTime()) / 86_400_000) + 1;
}

export function validateHistoricalImportRequest(
  request: HistoricalImportRequest,
  options: { now?: Date; enforceCompletedDays?: boolean; maxDays?: number | null } = {}
) {
  const now = options.now ?? new Date();
  const enforceCompletedDays = options.enforceCompletedDays ?? request.source !== "cli";
  const maxDays = options.maxDays === undefined
    ? request.source === "manual" ? MAX_MANUAL_HISTORICAL_RANGE_DAYS : null
    : options.maxDays;

  if (Number.isNaN(request.from.getTime()) || Number.isNaN(request.to.getTime())) {
    throw new Error("Historical import dates must be valid YYYY-MM-DD values.");
  }

  const from = startOfUtcDay(request.from);
  const to = startOfUtcDay(request.to);
  if (from.getTime() > to.getTime()) {
    throw new Error("From date must be before or equal to To date.");
  }

  const today = startOfUtcDay(now);
  if (enforceCompletedDays && to.getTime() >= today.getTime()) {
    throw new Error("Historical imports may only include completed UTC calendar days.");
  }
  if (!enforceCompletedDays && to.getTime() > today.getTime()) {
    throw new Error("Historical imports cannot include a future date.");
  }

  const dayCount = getInclusiveDayCount(from, to);
  if (maxDays !== null && dayCount > maxDays) {
    throw new Error(`Historical imports are limited to ${maxDays} inclusive days per request.`);
  }

  return { ...request, from, to, dayCount };
}

export function buildScheduledHistoricalRequest(now = new Date()): HistoricalImportRequest {
  const yesterday = getYesterdayUtc(now);
  return {
    from: yesterday,
    to: yesterday,
    force: false,
    source: "scheduled"
  };
}

export function parseManualHistoricalImportForm(formData: FormData, now = new Date()) {
  const from = parseUtcDateKey(String(formData.get("from") ?? ""), "From date");
  const to = parseUtcDateKey(String(formData.get("to") ?? ""), "To date");
  const force = formData.get("force") === "on";
  return validateHistoricalImportRequest(
    { from, to, force, source: "manual" },
    { now, enforceCompletedDays: true, maxDays: MAX_MANUAL_HISTORICAL_RANGE_DAYS }
  );
}
