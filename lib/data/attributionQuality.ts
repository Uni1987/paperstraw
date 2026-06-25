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

type EndpointCount = {
  value: string;
  count: number;
};

export async function getAttributionQualityReport(): Promise<AttributionQualityReport> {
  const endpointCounts = await prisma.$queryRaw<Array<{ endpoint: string | null; count: bigint }>>`
    SELECT endpoint, SUM(count)::bigint AS count
    FROM (
      SELECT UPPER(TRIM(COALESCE("originAirport", ''))) AS endpoint, COUNT(*)::bigint AS count
      FROM "Flight"
      GROUP BY 1
      UNION ALL
      SELECT UPPER(TRIM(COALESCE("destinationAirport", ''))) AS endpoint, COUNT(*)::bigint AS count
      FROM "Flight"
      GROUP BY 1
    ) grouped_endpoints
    GROUP BY endpoint
  `;

  return buildAttributionQualityReportFromCounts(
    endpointCounts.map((row) => ({
      value: row.endpoint ?? "",
      count: Number(row.count)
    }))
  );
}

export function buildAttributionQualityReport(endpoints: string[]): AttributionQualityReport {
  const counts = new Map<string, number>();
  for (const endpoint of endpoints) {
    const key = normalizeEndpoint(endpoint);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return buildAttributionQualityReportFromCounts(
    [...counts.entries()].map(([value, count]) => ({ value, count }))
  );
}

export function buildAttributionQualityReportFromCounts(endpointCounts: EndpointCount[]): AttributionQualityReport {
  const normalizedCounts = endpointCounts.map((endpoint) => ({
    value: normalizeEndpoint(endpoint.value),
    count: endpoint.count
  }));
  const totalEndpoints = sumCounts(normalizedCounts);
  const totalRecords = Math.floor(totalEndpoints / 2);
  const countryAttributedEndpoints = sumMatchingCounts(normalizedCounts, isCountryAttributed);
  const airportAttributedEndpoints = sumMatchingCounts(normalizedCounts, isAirportAttributed);
  const legacyUnknownCountryEndpoints = sumMatchingCounts(normalizedCounts, (endpoint) => !isLegacyCountryAttributed(endpoint));
  const legacyUnknownAirportEndpoints = sumMatchingCounts(normalizedCounts, (endpoint) => !isLegacyAirportAttributed(endpoint));

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
    topUnattributedEndpointValues: topUnattributedEndpoints(normalizedCounts),
    sourceFieldNotes: [
      "Stored Flight records currently contain originAirport and destinationAirport text fields only.",
      "The schema does not store IATA, airport name, country code, latitude/longitude, or source airport metadata per flight.",
      "ADSB.lol historical imports collapsed coordinates to the nearest known airport during import; when no airport was within the old limited lookup radius, UNKNOWN was stored.",
      "ADSB.lol recent type snapshots are position snapshots rather than completed routes, so destination can be ENROUTE.",
      "OpenSky records can provide estimated departure and arrival ICAO airport fields when available."
    ]
  };
}

function topUnattributedEndpoints(endpoints: EndpointCount[]) {
  return endpoints
    .filter((endpoint) => !isAirportAttributed(endpoint.value) && !isCountryAttributed(endpoint.value))
    .map((endpoint) => ({ value: endpoint.value || "EMPTY", count: endpoint.count }))
    .sort((left, right) => right.count - left.count)
    .slice(0, 8)
    .map(({ value, count }) => ({ value, count }));
}

function normalizeEndpoint(endpoint: string) {
  return (endpoint || "").trim().toUpperCase();
}

function sumCounts(endpoints: EndpointCount[]) {
  return endpoints.reduce((total, endpoint) => total + endpoint.count, 0);
}

function sumMatchingCounts(endpoints: EndpointCount[], predicate: (endpoint: string) => boolean) {
  return endpoints.reduce((total, endpoint) => total + (predicate(endpoint.value) ? endpoint.count : 0), 0);
}

function percent(value: number, total: number) {
  if (!total) return 0;
  return Math.round((value / total) * 1000) / 10;
}
