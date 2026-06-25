import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const DEFAULT_MAX_MATCH_RADIUS_KM = 75;
const INCLUDED_AIRPORT_TYPES = new Set(["large_airport", "medium_airport", "small_airport"]);
const OPTIONAL_AIRPORT_TYPES = new Set(["heliport"]);
const UNKNOWN_AIRPORT_TOKENS = new Set(["", "UNKNOWN", "ENROUTE", "N/A", "NA", "NONE", "NULL"]);
const DATASET_PATH = join(process.cwd(), "data", "ourairports", "airports.csv");

export type AirportReference = {
  ident: string;
  iataCode: string | null;
  name: string;
  latitude: number;
  longitude: number;
  countryCode: string;
  countryName: string;
  municipality: string | null;
  region: string | null;
  type: string;
};

export type AirportMatch = AirportReference & {
  distanceKm: number;
  method: "IDENT" | "IATA" | "NAME" | "COORDINATE";
  source: "OurAirports";
  confidence: number;
};

type AirportDataset = {
  airports: AirportReference[];
  byIdent: Map<string, AirportReference>;
  byIata: Map<string, AirportReference>;
  byName: Map<string, AirportReference>;
  spatialIndex: Map<string, AirportReference[]>;
};

let cachedDataset: AirportDataset | null = null;
let countryNames: Intl.DisplayNames | null | undefined;

export function resolveAirport(value: string): AirportMatch | null {
  const normalized = normalizeAirportValue(value);
  if (UNKNOWN_AIRPORT_TOKENS.has(normalized)) return null;

  const dataset = getAirportDataset();
  const byIdent = dataset.byIdent.get(normalized);
  if (byIdent) return toMatch(byIdent, "IDENT", 0);

  const byIata = dataset.byIata.get(normalized);
  if (byIata) return toMatch(byIata, "IATA", 0);

  const byName = dataset.byName.get(normalizeName(value));
  if (byName) return toMatch(byName, "NAME", 0);

  return null;
}

export function findNearestAirport(
  latitude: number,
  longitude: number,
  maxRadiusKm = getAirportMatchMaxRadiusKm()
): AirportMatch | null {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  const dataset = getAirportDataset();
  const latRadius = Math.ceil(maxRadiusKm / 111) + 1;
  const lonRadius = Math.ceil(maxRadiusKm / (111 * Math.max(0.2, Math.cos(toRadians(latitude))))) + 1;
  const centerLat = Math.floor(latitude);
  const centerLon = Math.floor(longitude);
  let nearest: AirportMatch | null = null;

  for (let latCell = centerLat - latRadius; latCell <= centerLat + latRadius; latCell += 1) {
    for (let lonCell = centerLon - lonRadius; lonCell <= centerLon + lonRadius; lonCell += 1) {
      for (const airport of dataset.spatialIndex.get(cellKey(latCell, lonCell)) ?? []) {
        const distanceKm = estimateCoordinateDistanceKm({ lat: latitude, lon: longitude }, { lat: airport.latitude, lon: airport.longitude });
        if (distanceKm > maxRadiusKm) continue;
        if (!nearest || distanceKm < nearest.distanceKm || (distanceKm === nearest.distanceKm && airportPriority(airport) > airportPriority(nearest))) {
          nearest = toMatch(airport, "COORDINATE", distanceKm);
        }
      }
    }
  }

  return nearest;
}

export function estimateAirportDistanceKm(origin: string, destination: string) {
  const from = resolveAirport(origin);
  const to = resolveAirport(destination);
  if (!from || !to) return null;
  return Math.round(estimateCoordinateDistanceKm({ lat: from.latitude, lon: from.longitude }, { lat: to.latitude, lon: to.longitude }));
}

export function estimateCoordinateDistanceKm(from: { lat: number; lon: number }, to: { lat: number; lon: number }) {
  const earthRadiusKm = 6371;
  const dLat = toRadians(to.lat - from.lat);
  const dLon = toRadians(to.lon - from.lon);
  const lat1 = toRadians(from.lat);
  const lat2 = toRadians(to.lat);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
}

export function getAirportDatasetStats() {
  const dataset = getAirportDataset();
  return {
    airports: dataset.airports.length,
    source: "OurAirports airports.csv",
    path: DATASET_PATH
  };
}

export function getAirportMatchMaxRadiusKm(env: NodeJS.ProcessEnv = process.env) {
  const value = Number(env["AIRPORT_MATCH_MAX_RADIUS_KM"]);
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_MAX_MATCH_RADIUS_KM;
  return Math.min(Math.max(Math.round(value), 10), 250);
}

function getAirportDataset(): AirportDataset {
  if (cachedDataset) return cachedDataset;
  if (!existsSync(DATASET_PATH)) {
    throw new Error(`OurAirports dataset not found at ${DATASET_PATH}. Download airports.csv before running imports.`);
  }

  const rows = parseCsv(readFileSync(DATASET_PATH, "utf8"));
  const airports = rows.map(rowToAirport).filter((airport): airport is AirportReference => Boolean(airport));
  const byIdent = new Map<string, AirportReference>();
  const byIata = new Map<string, AirportReference>();
  const byName = new Map<string, AirportReference>();
  const spatialIndex = new Map<string, AirportReference[]>();

  for (const airport of airports) {
    byIdent.set(airport.ident, airport);
    if (airport.iataCode) byIata.set(airport.iataCode, airport);
    byName.set(normalizeName(airport.name), airport);
    byName.set(normalizeName(stripAirportSuffix(airport.name)), airport);
    if (airport.municipality) byName.set(normalizeName(airport.municipality), airport);
    const key = cellKey(Math.floor(airport.latitude), Math.floor(airport.longitude));
    const cell = spatialIndex.get(key) ?? [];
    cell.push(airport);
    spatialIndex.set(key, cell);
  }

  cachedDataset = { airports, byIdent, byIata, byName, spatialIndex };
  return cachedDataset;
}

function rowToAirport(row: Record<string, string>): AirportReference | null {
  const type = row["type"]?.trim() ?? "";
  if (!isIncludedAirportType(type)) return null;

  const ident = (row["icao_code"] || row["ident"] || row["gps_code"] || row["local_code"] || "").trim().toUpperCase();
  const latitude = Number(row["latitude_deg"]);
  const longitude = Number(row["longitude_deg"]);
  const countryCode = (row["iso_country"] || "").trim().toUpperCase();
  if (!ident || !countryCode || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  return {
    ident,
    iataCode: (row["iata_code"] || "").trim().toUpperCase() || null,
    name: (row["name"] || ident).trim(),
    latitude,
    longitude,
    countryCode,
    countryName: getCountryName(countryCode),
    municipality: (row["municipality"] || "").trim() || null,
    region: (row["iso_region"] || "").trim() || null,
    type
  };
}

function isIncludedAirportType(type: string) {
  if (INCLUDED_AIRPORT_TYPES.has(type)) return true;
  return process.env["OURAIRPORTS_INCLUDE_HELIPORTS"] === "true" && OPTIONAL_AIRPORT_TYPES.has(type);
}

function toMatch(airport: AirportReference, method: AirportMatch["method"], distanceKm: number): AirportMatch {
  const radius = getAirportMatchMaxRadiusKm();
  return {
    ...airport,
    distanceKm,
    method,
    source: "OurAirports",
    confidence: method === "COORDINATE" ? Math.max(0.5, 1 - distanceKm / Math.max(radius, 1)) : 1
  };
}

function airportPriority(airport: Pick<AirportReference, "type">) {
  if (airport.type === "large_airport") return 4;
  if (airport.type === "medium_airport") return 3;
  if (airport.type === "small_airport") return 2;
  return 1;
}

function getCountryName(countryCode: string) {
  try {
    countryNames ??= typeof Intl.DisplayNames === "function" ? new Intl.DisplayNames(["en"], { type: "region" }) : null;
    return countryNames?.of(countryCode) ?? countryCode;
  } catch {
    return countryCode;
  }
}

function parseCsv(text: string) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
  const headers = parseCsvLine(lines[0] ?? "");
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
  });
}

function parseCsvLine(line: string) {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      index += 1;
      continue;
    }
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (char === "," && !inQuotes) {
      values.push(current);
      current = "";
      continue;
    }
    current += char;
  }

  values.push(current);
  return values;
}

function normalizeAirportValue(value: string) {
  return value.trim().toUpperCase();
}

function normalizeName(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]+/g, " ").replace(/\s+/g, " ");
}

function stripAirportSuffix(value: string) {
  return value.replace(/\b(INTERNATIONAL|REGIONAL|MUNICIPAL|EXECUTIVE|NATIONAL)?\s*AIRPORT\b/gi, "").trim();
}

function cellKey(latitude: number, longitude: number) {
  return `${latitude}:${longitude}`;
}

function toRadians(degrees: number) {
  return (degrees * Math.PI) / 180;
}
