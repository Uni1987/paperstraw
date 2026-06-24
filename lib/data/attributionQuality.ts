import { prisma } from "@/lib/prisma";
import {
  isAirportAttributed,
  isCountryAttributed,
  isLegacyAirportAttributed,
  isLegacyCountryAttributed
} from "@/lib/awareness/airports";

export type AttributionQualityReport = {
  totalRecords: number;
  totalEndpoints: number;
  countryAttributedEndpoints: number;
  countryUnattributedEndpoints: number;
  airportAttributedEndpoints: number;
  airportUnattributedEndpoints: number;
  countryAttributionRate: number;
  airportAttributionRate: number;
  unknownCountryPercent: number;
  unknownAirportPercent: number;
  legacyUnknownCountryEndpoints: number;
  legacyUnknownAirportEndpoints: number;
  publicUnknownCountryBucketAfter: number;
  publicUnknownAirportBucketAfter: number;
  topUnattributedEndpointValues: Array<{ value: string; count: number }>;
  sourceFieldNotes: string[];
};

export async function getAttributionQualityReport(): Promise<AttributionQualityReport> {
  const flights = await prisma.flight.findMany({
    select: {
      originAirport: true,
      destinationAirport: true
    }
  });

  return buildAttributionQualityReport(
    flights.flatMap((flight) => [flight.originAirport, flight.destinationAirport])
  );
}

export function buildAttributionQualityReport(endpoints: string[]): AttributionQualityReport {
  const normalizedEndpoints = endpoints.map((endpoint) => (endpoint || "").trim().toUpperCase());
  const totalEndpoints = normalizedEndpoints.length;
  const totalRecords = Math.floor(totalEndpoints / 2);
  const countryAttributedEndpoints = normalizedEndpoints.filter(isCountryAttributed).length;
  const airportAttributedEndpoints = normalizedEndpoints.filter(isAirportAttributed).length;
  const legacyUnknownCountryEndpoints = normalizedEndpoints.filter((endpoint) => !isLegacyCountryAttributed(endpoint)).length;
  const legacyUnknownAirportEndpoints = normalizedEndpoints.filter((endpoint) => !isLegacyAirportAttributed(endpoint)).length;

  return {
    totalRecords,
    totalEndpoints,
    countryAttributedEndpoints,
    countryUnattributedEndpoints: totalEndpoints - countryAttributedEndpoints,
    airportAttributedEndpoints,
    airportUnattributedEndpoints: totalEndpoints - airportAttributedEndpoints,
    countryAttributionRate: percent(countryAttributedEndpoints, totalEndpoints),
    airportAttributionRate: percent(airportAttributedEndpoints, totalEndpoints),
    unknownCountryPercent: percent(totalEndpoints - countryAttributedEndpoints, totalEndpoints),
    unknownAirportPercent: percent(totalEndpoints - airportAttributedEndpoints, totalEndpoints),
    legacyUnknownCountryEndpoints,
    legacyUnknownAirportEndpoints,
    publicUnknownCountryBucketAfter: 0,
    publicUnknownAirportBucketAfter: 0,
    topUnattributedEndpointValues: topUnattributedEndpoints(normalizedEndpoints),
    sourceFieldNotes: [
      "Stored Flight records currently contain originAirport and destinationAirport text fields only.",
      "The schema does not store IATA, airport name, country code, latitude/longitude, or source airport metadata per flight.",
      "ADSB.lol historical imports collapsed coordinates to the nearest known airport during import; when no airport was within the old limited lookup radius, UNKNOWN was stored.",
      "ADSB.lol recent type snapshots are position snapshots rather than completed routes, so destination can be ENROUTE.",
      "OpenSky records can provide estimated departure and arrival ICAO airport fields when available."
    ]
  };
}

function topUnattributedEndpoints(endpoints: string[]) {
  const counts = new Map<string, number>();
  for (const endpoint of endpoints) {
    if (isAirportAttributed(endpoint) || isCountryAttributed(endpoint)) continue;
    const key = endpoint || "EMPTY";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 8)
    .map(([value, count]) => ({ value, count }));
}

function percent(value: number, total: number) {
  if (!total) return 0;
  return Math.round((value / total) * 1000) / 10;
}
