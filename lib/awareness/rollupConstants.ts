export const AggregatePeriods = {
  DAY: "DAY",
  MONTH: "MONTH",
  YEAR: "YEAR"
} as const;

export const AggregateGroups = {
  GLOBAL: "GLOBAL",
  COUNTRY: "COUNTRY",
  AIRPORT: "AIRPORT",
  AIRCRAFT_TYPE: "AIRCRAFT_TYPE"
} as const;

export type AggregatePeriodValue = (typeof AggregatePeriods)[keyof typeof AggregatePeriods];
export type AggregateGroupValue = (typeof AggregateGroups)[keyof typeof AggregateGroups];

export type StoredAggregateRollup = {
  id?: string;
  period: AggregatePeriodValue;
  group: AggregateGroupValue;
  key: string;
  periodStart: Date;
  flights: number;
  distanceKm: unknown;
  estimatedCo2Kg: unknown;
};
