import type { DataSourceProviderValue } from "./providerConstants";

export type NormalizedFlightRecord = {
  icaoHex: string;
  registration?: string | null;
  aircraftType: string;
  verifiedPublicEntity?: string | null;
  originAirport: string;
  destinationAirport: string;
  departureAt: Date;
  arrivalAt?: Date | null;
  distanceKm: number;
  dataSource: DataSourceProviderValue;
  sourceRecordId?: string | null;
  sourceAttribution: string;
};

export type ProviderClient = {
  provider: DataSourceProviderValue;
  fetchRecentFlights(): Promise<NormalizedFlightRecord[]>;
};

export type ImportResult = {
  imported: number;
  skipped: number;
  errors: string[];
};
