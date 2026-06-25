import type { DataSourceProviderValue } from "./providerConstants";
import type { AggregateFlight } from "@/lib/awareness/types";

export type NormalizedFlightRecord = {
  icaoHex: string;
  registration?: string | null;
  aircraftType: string;
  verifiedPublicEntity?: string | null;
  originAirport: string;
  destinationAirport: string;
  originAirportIdent?: string | null;
  destinationAirportIdent?: string | null;
  originCountryCode?: string | null;
  destinationCountryCode?: string | null;
  attributionSource?: string | null;
  attributionConfidence?: number | null;
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
  updatedAttribution: number;
  errors: string[];
  importedFlights: AggregateFlight[];
};
