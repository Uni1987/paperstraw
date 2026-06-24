import { estimateAirportDistanceKm } from "./airports";
import { DataSourceProviders } from "./providerConstants";
import type { NormalizedFlightRecord, ProviderClient } from "./types";

type OpenSkyFlight = {
  icao24: string;
  firstSeen: number;
  estDepartureAirport?: string | null;
  lastSeen: number;
  estArrivalAirport?: string | null;
  callsign?: string | null;
};

export class OpenSkyClient implements ProviderClient {
  provider = DataSourceProviders.OPENSKY;

  constructor(
    private readonly username = process.env.OPENSKY_USERNAME,
    private readonly password = process.env.OPENSKY_PASSWORD,
    private readonly baseUrl = "https://opensky-network.org/api"
  ) {}

  async fetchRecentFlights(): Promise<NormalizedFlightRecord[]> {
    const end = Math.floor(Date.now() / 1000);
    const begin = end - 60 * 60 * 2;
    const url = new URL(`${this.baseUrl}/flights/all`);
    url.searchParams.set("begin", String(begin));
    url.searchParams.set("end", String(end));

    const response = await fetch(url, {
      headers:
        this.username && this.password
          ? { Authorization: `Basic ${Buffer.from(`${this.username}:${this.password}`).toString("base64")}` }
          : {},
      cache: "no-store"
    });

    if (response.status === 404) return [];
    if (!response.ok) {
      throw new Error(`OpenSky request failed with ${response.status}`);
    }

    const flights = (await response.json()) as OpenSkyFlight[];
    return flights.flatMap((flight) => {
      if (!flight.estDepartureAirport || !flight.estArrivalAirport) return [];
      const distanceKm = estimateAirportDistanceKm(flight.estDepartureAirport, flight.estArrivalAirport);
      if (!distanceKm) return [];

      return [
        {
          icaoHex: flight.icao24,
          registration: null,
          aircraftType: "UNKNOWN",
          verifiedPublicEntity: null,
          originAirport: flight.estDepartureAirport,
          destinationAirport: flight.estArrivalAirport,
          departureAt: new Date(flight.firstSeen * 1000),
          arrivalAt: new Date(flight.lastSeen * 1000),
          distanceKm,
          dataSource: DataSourceProviders.OPENSKY,
          sourceRecordId: `${flight.icao24}-${flight.firstSeen}-${flight.lastSeen}`,
          sourceAttribution: "OpenSky Network API"
        } satisfies NormalizedFlightRecord
      ];
    });
  }
}
