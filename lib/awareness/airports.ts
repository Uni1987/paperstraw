import {
  resolveAirport as resolveOurAirport,
  type AirportMatch
} from "@/lib/airports/ourAirports";

export type AirportMetadata = {
  code: string;
  iata?: string;
  name: string;
  country: string;
  aliases?: string[];
};

type AirportAttribution = {
  code: string;
  label: string;
  country: string;
  method: "ICAO" | "IATA" | "NAME";
};

const unknownAirportTokens = new Set(["", "UNKNOWN", "ENROUTE", "N/A", "NA", "NONE", "NULL"]);

const legacyAirportCodes = new Set(["EHAM", "EGLF", "KTEB", "KLAX", "KLAS", "KJFK", "LFMN", "LFMD", "LSZH", "OMDB"]);

export function getAirportCountry(code: string) {
  return resolveAirportCountry(code) ?? "Unknown";
}

export function getAirportName(code: string) {
  return resolveAirport(code)?.label ?? "Unknown";
}

export function resolveAirport(value: string): AirportAttribution | null {
  const match = resolveOurAirport(value);
  if (!match) return null;
  return toAttribution(match);
}

export function resolveAirportCountry(value: string) {
  return resolveOurAirport(value)?.countryName ?? null;
}

export function resolveAirportCountryCode(value: string) {
  return resolveOurAirport(value)?.countryCode ?? null;
}

export function isAirportAttributed(value: string) {
  return Boolean(resolveAirport(value));
}

export function isCountryAttributed(value: string) {
  return Boolean(resolveAirportCountry(value));
}

export function isLegacyAirportAttributed(value: string) {
  const normalized = normalizeAirportValue(value);
  return legacyAirportCodes.has(normalized);
}

export function isLegacyCountryAttributed(value: string) {
  const normalized = normalizeAirportValue(value);
  if (unknownAirportTokens.has(normalized)) return false;
  return isLegacyAirportAttributed(value);
}

function toAttribution(airport: AirportMatch): AirportAttribution {
  const method = airport.method === "IDENT" ? "ICAO" : airport.method === "COORDINATE" ? "ICAO" : airport.method;
  return {
    code: airport.ident,
    label: airport.name,
    country: airport.countryName,
    method
  };
}

function normalizeAirportValue(value: string) {
  return value.trim().toUpperCase();
}
