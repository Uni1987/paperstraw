export type CruiseMapPeriodId = "week" | "month" | "since-monitoring";

export const CRUISE_MAP_PERIODS: Array<{
  id: CruiseMapPeriodId;
  label: string;
  subtitle: string;
  legendTitle: string;
}> = [
  {
    id: "week",
    label: "This week",
    subtitle: "Observed verified cruise activity this week.",
    legendTitle: "WEEKLY CRUISE ACTIVITY"
  },
  {
    id: "month",
    label: "This month",
    subtitle: "Observed verified cruise activity this month.",
    legendTitle: "MONTHLY CRUISE ACTIVITY"
  },
  {
    id: "since-monitoring",
    label: "Since monitoring began",
    subtitle: "Observed verified cruise activity since monitoring began.",
    legendTitle: "CRUISE ACTIVITY SINCE MONITORING BEGAN"
  }
];

export const DEFAULT_CRUISE_MAP_PERIOD: CruiseMapPeriodId = "since-monitoring";
export const MAX_PUBLIC_CRUISE_SHIP_ID_LENGTH = 64;

export function normalizeCruiseMapPeriod(value: string | null | undefined): CruiseMapPeriodId {
  return CRUISE_MAP_PERIODS.some((period) => period.id === value) ? (value as CruiseMapPeriodId) : DEFAULT_CRUISE_MAP_PERIOD;
}

export function parsePublicCruiseShipId(value: string | null | undefined) {
  if (!value || value.length > MAX_PUBLIC_CRUISE_SHIP_ID_LENGTH) return null;
  return /^[a-z0-9][a-z0-9_-]*$/i.test(value) ? value : null;
}

