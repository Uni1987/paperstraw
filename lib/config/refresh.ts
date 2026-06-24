export const DEFAULT_DATA_REFRESH_INTERVAL_MINUTES = 24 * 60;

export function getDataRefreshIntervalMinutes(env: NodeJS.ProcessEnv = process.env) {
  return parseDataRefreshIntervalMinutes(env["DATA_REFRESH_INTERVAL_MINUTES"]);
}

export function parseDataRefreshIntervalMinutes(value: string | number | null | undefined) {
  const numericValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numericValue) || numericValue <= 0) return DEFAULT_DATA_REFRESH_INTERVAL_MINUTES;

  const rounded = Math.round(numericValue);
  if (rounded < 15) return 15;
  if (rounded > 24 * 60) return 24 * 60;
  return rounded;
}

export function formatRefreshInterval(minutes: number) {
  return "Updated throughout the day using scheduled and manual data imports.";
}
