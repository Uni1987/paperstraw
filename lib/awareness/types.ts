import type { Co2Equivalents } from "./equivalents";

export type AggregateFlight = {
  departureAt: Date;
  originAirport: string;
  destinationAirport: string;
  distanceKm: number;
  estimatedCo2Kg: number;
  aircraftType?: string | null;
};

export type AwarenessMetric = {
  label: string;
  value: string;
  detail: string;
};

export type AwarenessSeriesPoint = {
  period: string;
  estimatedCo2Kg: number;
  flights: number;
};

export type AwarenessRankPoint = {
  label: string;
  estimatedCo2Kg: number;
  flights: number;
  distanceKm: number;
};

export type AwarenessDashboardData = {
  isDemo: boolean;
  sourceNotice?: string;
  todayFlights: number;
  todayDistanceKm: number;
  todayCo2Kg: number;
  yearCo2Kg: number;
  yearFlights: number;
  yearDistanceKm: number;
  equivalents: Co2Equivalents;
  dailySeries: AwarenessSeriesPoint[];
  monthlySeries: AwarenessSeriesPoint[];
  topCountries: AwarenessRankPoint[];
  topAirports: AwarenessRankPoint[];
  aircraftTypes: AwarenessRankPoint[];
};
