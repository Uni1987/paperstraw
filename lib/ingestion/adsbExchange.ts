import { DataSourceProviders } from "./providerConstants";
import type { NormalizedFlightRecord, ProviderClient } from "./types";

type AdsbExchangeFlight = {
  icaoHex?: string;
  icao24?: string;
  hex?: string;
  registration?: string;
  reg?: string;
  aircraftType?: string;
  type?: string;
  origin?: string;
  destination?: string;
  departureAt?: string;
  departureTime?: string;
  arrivalAt?: string;
  arrivalTime?: string;
  distanceKm?: number;
  distance_km?: number;
  verifiedPublicEntity?: string;
  sourceRecordId?: string;
};

export class AdsbExchangeClient implements ProviderClient {
  provider = DataSourceProviders.ADSB_EXCHANGE;

  constructor(
    private readonly apiKey = process.env.ADSB_EXCHANGE_API_KEY,
    private readonly recentFlightsUrl = process.env.ADSB_EXCHANGE_RECENT_FLIGHTS_URL
  ) {}

  async fetchRecentFlights(): Promise<NormalizedFlightRecord[]> {
    if (!this.apiKey) throw new Error("ADSB_EXCHANGE_API_KEY is not configured");
    if (!this.recentFlightsUrl) {
      throw new Error("ADSB_EXCHANGE_RECENT_FLIGHTS_URL is not configured for scheduled ingestion");
    }

    const response = await fetch(this.recentFlightsUrl, {
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "x-api-key": this.apiKey,
        Accept: "application/json"
      },
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error(`ADS-B Exchange request failed with ${response.status}`);
    }

    const payload = (await response.json()) as { flights?: AdsbExchangeFlight[] } | AdsbExchangeFlight[];
    const flights = Array.isArray(payload) ? payload : payload.flights ?? [];
    return flights.map(normalizeAdsbFlight);
  }
}

function normalizeAdsbFlight(flight: AdsbExchangeFlight): NormalizedFlightRecord {
  const departureAt = new Date(flight.departureAt ?? flight.departureTime ?? "");
  const arrivalValue = flight.arrivalAt ?? flight.arrivalTime;

  return {
    icaoHex: flight.icaoHex ?? flight.icao24 ?? flight.hex ?? "",
    registration: flight.registration ?? flight.reg ?? null,
    aircraftType: flight.aircraftType ?? flight.type ?? "UNKNOWN",
    verifiedPublicEntity: flight.verifiedPublicEntity ?? null,
    originAirport: flight.origin ?? "",
    destinationAirport: flight.destination ?? "",
    departureAt,
    arrivalAt: arrivalValue ? new Date(arrivalValue) : null,
    distanceKm: Number(flight.distanceKm ?? flight.distance_km ?? 0),
    dataSource: DataSourceProviders.ADSB_EXCHANGE,
    sourceRecordId: flight.sourceRecordId ?? null,
    sourceAttribution: "ADS-B Exchange API"
  };
}
