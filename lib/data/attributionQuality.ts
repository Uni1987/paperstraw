import { Prisma } from "@prisma/client";
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
  airportEndpoint: string;
  countryCode?: string | null;
  legacyEndpoint?: string | null;
  count: number;
};

export type AttributionQualityPeriod = {
  from?: Date;
  to?: Date;
};

export async function getAttributionQualityReport(period: AttributionQualityPeriod = {}): Promise<AttributionQualityReport> {
  const dateFilter =
    period.from && period.to
      ? Prisma.sql`WHERE "departureAt" >= ${period.from} AND "departureAt" < ${period.to}`
      : Prisma.empty;

  const endpointCounts = await prisma.$queryRaw<
    Array<{
      airportEndpoint: string | null;
      countryCode: string | null;
      legacyEndpoint: string | null;
      count: bigint;
    }>
  >`
    SELECT "airportEndpoint", "countryCode", "legacyEndpoint", SUM(count)::bigint AS count
    FROM (
      SELECT
        UPPER(TRIM(COALESCE(NULLIF("originAirportIdent", ''), "originAirport", ''))) AS "airportEndpoint",
        UPPER(TRIM(COALESCE("originCountryCode", ''))) AS "countryCode",
        UPPER(TRIM(COALESCE("originAirport", ''))) AS "legacyEndpoint",
        COUNT(*)::bigint AS count
      FROM "Flight"
      ${dateFilter}
      GROUP BY 1, 2, 3
      UNION ALL
      SELECT
        UPPER(TRIM(COALESCE(NULLIF("destinationAirportIdent", ''), "destinationAirport", ''))) AS "airportEndpoint",
        UPPER(TRIM(COALESCE("destinationCountryCode", ''))) AS "countryCode",
        UPPER(TRIM(COALESCE("destinationAirport", ''))) AS "legacyEndpoint",
        COUNT(*)::bigint AS count
      FROM "Flight"
      ${dateFilter}
      GROUP BY 1, 2, 3
    ) grouped_endpoints
    GROUP BY "airportEndpoint", "countryCode", "legacyEndpoint"
  `;

  return buildAttributionQualityReportFromCounts(
    endpointCounts.map((row) => ({
      airportEndpoint: row.airportEndpoint ?? "",
      countryCode: row.countryCode ?? "",
      legacyEndpoint: row.legacyEndpoint ?? "",
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
    [...counts.entries()].map(([value, count]) => ({ airportEndpoint: value, legacyEndpoint: value, count }))
  );
}

export function buildAttributionQualityReportFromCounts(endpointCounts: EndpointCount[]): AttributionQualityReport {
  const normalizedCounts = endpointCounts.map((endpoint) => ({
    airportEndpoint: normalizeEndpoint(endpoint.airportEndpoint),
    countryCode: normalizeEndpoint(endpoint.countryCode ?? ""),
    legacyEndpoint: normalizeEndpoint(endpoint.legacyEndpoint ?? endpoint.airportEndpoint),
    count: endpoint.count
  }));
  const totalEndpoints = sumCounts(normalizedCounts);
  const totalRecords = Math.floor(totalEndpoints / 2);
  const countryAttributedEndpoints = sumMatchingCounts(normalizedCounts, isCountryEndpointAttributed);
  const airportAttributedEndpoints = sumMatchingCounts(normalizedCounts, (endpoint) => isAirportAttributed(endpoint.airportEndpoint));
  const legacyUnknownCountryEndpoints = sumMatchingCounts(normalizedCounts, (endpoint) => !isLegacyCountryAttributed(endpoint.legacyEndpoint ?? ""));
  const legacyUnknownAirportEndpoints = sumMatchingCounts(normalizedCounts, (endpoint) => !isLegacyAirportAttributed(endpoint.legacyEndpoint ?? ""));

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
      "Quality metrics prefer originAirportIdent and destinationAirportIdent, then fall back to the legacy originAirport and destinationAirport text fields.",
      "Country attribution prefers stored originCountryCode and destinationCountryCode, then falls back to resolving the selected airport endpoint.",
      "Legacy before/after metrics continue to show how many endpoints were unknown under the older originAirport and destinationAirport text-only calculation.",
      "ADSB.lol recent type snapshots are position snapshots rather than completed routes, so destination can be ENROUTE.",
      "OpenSky records can provide estimated departure and arrival ICAO airport fields when available."
    ]
  };
}

function topUnattributedEndpoints(endpoints: EndpointCount[]) {
  return endpoints
    .filter((endpoint) => !isAirportAttributed(endpoint.airportEndpoint) && !isCountryEndpointAttributed(endpoint))
    .map((endpoint) => ({ value: endpoint.airportEndpoint || "EMPTY", count: endpoint.count }))
    .sort((left, right) => right.count - left.count)
    .slice(0, 8)
    .map(({ value, count }) => ({ value, count }));
}

function isCountryEndpointAttributed(endpoint: Pick<EndpointCount, "airportEndpoint" | "countryCode">) {
  return isCountryCodeAttributed(endpoint.countryCode ?? "") || isCountryAttributed(endpoint.airportEndpoint);
}

function isCountryCodeAttributed(countryCode: string) {
  const normalized = normalizeEndpoint(countryCode);
  return /^[A-Z]{2}$/.test(normalized);
}

function normalizeEndpoint(endpoint: string) {
  return (endpoint || "").trim().toUpperCase();
}

function sumCounts(endpoints: EndpointCount[]) {
  return endpoints.reduce((total, endpoint) => total + endpoint.count, 0);
}

function sumMatchingCounts(endpoints: EndpointCount[], predicate: (endpoint: EndpointCount) => boolean) {
  return endpoints.reduce((total, endpoint) => total + (predicate(endpoint) ? endpoint.count : 0), 0);
}

function percent(value: number, total: number) {
  if (!total) return 0;
  return Math.round((value / total) * 1000) / 10;
}
