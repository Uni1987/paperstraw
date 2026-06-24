import { getDataRefreshIntervalMinutes } from "./refresh";

export const CRON_ENDPOINT_PATH = "/api/cron/ingest";
export const VERCEL_CRON_SCHEDULE = "0 * * * *";

export function getCronScheduleIntervalMinutes(schedule = VERCEL_CRON_SCHEDULE) {
  const normalized = schedule.trim().replace(/\s+/g, " ");
  if (normalized === "0 * * * *") return 60;

  const everyMinutesMatch = normalized.match(/^\*\/(\d+) \* \* \* \*$/);
  if (everyMinutesMatch) return Number(everyMinutesMatch[1]);

  return null;
}

export function getCronOperationalStatus(env: NodeJS.ProcessEnv = process.env) {
  const refreshIntervalMinutes = getDataRefreshIntervalMinutes(env);
  const scheduleIntervalMinutes = getCronScheduleIntervalMinutes();
  const cronSecret = env["CRON_SECRET"]?.trim() ?? "";

  return {
    endpointPath: CRON_ENDPOINT_PATH,
    vercelSchedule: VERCEL_CRON_SCHEDULE,
    refreshIntervalMinutes,
    scheduleIntervalMinutes,
    scheduleMatchesRefresh: scheduleIntervalMinutes === refreshIntervalMinutes,
    cronSecretConfigured: Boolean(cronSecret),
    cronSecretIsDefault: cronSecret === "change-me"
  };
}
