export const ImportStatuses = {
  SUCCESS: "SUCCESS",
  PARTIAL: "PARTIAL",
  FAILED: "FAILED"
} as const;

export type ImportStatusValue = (typeof ImportStatuses)[keyof typeof ImportStatuses];
