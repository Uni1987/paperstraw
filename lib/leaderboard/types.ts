export type LeaderboardView = "aircraft" | "entity";
export type LeaderboardPeriod = "monthly" | "yearly";

export type LeaderboardRow = {
  rank: number;
  label: string;
  secondaryLabel?: string;
  flights: number;
  totalDistanceKm: number;
  estimatedCo2Kg: number;
  averageCo2KgPerFlight: number;
};

export type TimeSeriesPoint = {
  period: string;
  estimatedCo2Kg: number;
  flights: number;
};

export type DashboardData = {
  leaderboard: LeaderboardRow[];
  timeSeries: TimeSeriesPoint[];
  topAircraft: LeaderboardRow[];
  topEntities: LeaderboardRow[];
  sourceNotice?: string;
};
