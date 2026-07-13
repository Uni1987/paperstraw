export const CRON_ENDPOINT_PATH = "/api/cron/ingest";
export const VERCEL_CRON_SCHEDULE = "0 6 * * *";
export const CRON_TIMEZONE = "UTC";

export function getCronScheduleIntervalMinutes(schedule = VERCEL_CRON_SCHEDULE) {
  const normalized = schedule.trim().replace(/\s+/g, " ");
  if (/^\d+ \d+ \* \* \*$/.test(normalized)) return 24 * 60;

  return null;
}

export function formatCronScheduleLabel(schedule = VERCEL_CRON_SCHEDULE) {
  const minutes = getCronScheduleIntervalMinutes(schedule);
  if (!minutes) return "Custom schedule";
  if (minutes === 24 * 60) return "Daily";
  if (minutes < 60) return `Every ${minutes} minutes`;
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return `Every ${hours} ${hours === 1 ? "hour" : "hours"}`;
  }
  return `Every ${minutes} minutes`;
}

export function getCronOperationalStatus(env: NodeJS.ProcessEnv = process.env) {
  const scheduleIntervalMinutes = getCronScheduleIntervalMinutes();
  const cronSecret = env["CRON_SECRET"]?.trim() ?? "";

  return {
    endpointPath: CRON_ENDPOINT_PATH,
    vercelSchedule: VERCEL_CRON_SCHEDULE,
    timezone: CRON_TIMEZONE,
    scheduleLabel: formatCronScheduleLabel(),
    scheduleIntervalMinutes,
    cronSecretConfigured: Boolean(cronSecret),
    cronSecretIsDefault: cronSecret === "change-me"
  };
}
