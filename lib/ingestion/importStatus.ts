export const ImportStatuses = {
  QUEUED: "QUEUED",
  RUNNING: "RUNNING",
  SUCCESS: "SUCCESS",
  PARTIAL: "PARTIAL",
  FAILED: "FAILED",
  SKIPPED: "SKIPPED"
} as const;

export type ImportStatusValue = (typeof ImportStatuses)[keyof typeof ImportStatuses];
