export type AirportEmissionPoint = {
  airportIdent?: string;
  airportName?: string;
  iataCode?: string | null;
  municipality?: string | null;
  countryCode?: string;
  countryName?: string;
  latitude: number;
  longitude: number;
  totalCo2Kg: number;
};

export type AirportMapPeriodId = "month" | "ytd";

export type AirportMapPeriodPayload = {
  id: AirportMapPeriodId;
  label: string;
  subtitle: string;
  points: AirportEmissionPoint[];
};

export const AIRPORT_MAP_PERIODS: Array<Omit<AirportMapPeriodPayload, "points">> = [
  {
    id: "month",
    label: "This month",
    subtitle: "Aggregate CO2 emissions from private jet activity at airports this month."
  },
  {
    id: "ytd",
    label: "YTD",
    subtitle: "Aggregate CO2 emissions from private jet activity at airports year to date."
  }
];

export const DEFAULT_AIRPORT_MAP_PERIOD: AirportMapPeriodId = "ytd";

export function isAirportMapPeriodId(value: string | null | undefined): value is AirportMapPeriodId {
  return AIRPORT_MAP_PERIODS.some((period) => period.id === value);
}

export function normalizeAirportMapPeriod(value: string | null | undefined): AirportMapPeriodId {
  return isAirportMapPeriodId(value) ? value : DEFAULT_AIRPORT_MAP_PERIOD;
}

export function filterAirportMapPeriodPayloads(periods: AirportMapPeriodPayload[] | undefined): AirportMapPeriodPayload[] {
  return periods?.filter((period) => isAirportMapPeriodId(period.id)) ?? [];
}

export function getAirportMapPeriodRange(period: AirportMapPeriodId, latestAvailableAt: Date) {
  const latestDayStart = startOfDay(latestAvailableAt);
  const end = new Date(latestAvailableAt);

  if (period === "month") {
    return { start: new Date(latestDayStart.getFullYear(), latestDayStart.getMonth(), 1), end };
  }

  return { start: new Date(latestDayStart.getFullYear(), 0, 1), end };
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}
