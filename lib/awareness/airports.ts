export type AirportMetadata = {
  code: string;
  iata?: string;
  name: string;
  country: string;
  aliases?: string[];
};

export const airportMetadata: Record<string, AirportMetadata> = {
  EHAM: { code: "EHAM", iata: "AMS", name: "Amsterdam Schiphol", country: "Netherlands", aliases: ["SCHIPHOL"] },
  EGLF: { code: "EGLF", iata: "FAB", name: "Farnborough", country: "United Kingdom", aliases: ["FARNBOROUGH"] },
  KTEB: { code: "KTEB", iata: "TEB", name: "Teterboro", country: "United States" },
  KLAX: { code: "KLAX", iata: "LAX", name: "Los Angeles", country: "United States", aliases: ["LOS ANGELES INTERNATIONAL"] },
  KLAS: { code: "KLAS", iata: "LAS", name: "Las Vegas", country: "United States", aliases: ["HARRY REID", "MCCARRAN"] },
  KJFK: { code: "KJFK", iata: "JFK", name: "John F. Kennedy", country: "United States" },
  LFMN: { code: "LFMN", iata: "NCE", name: "Nice Cote d'Azur", country: "France", aliases: ["NICE"] },
  LFMD: { code: "LFMD", iata: "CEQ", name: "Cannes Mandelieu", country: "France", aliases: ["CANNES"] },
  LSZH: { code: "LSZH", iata: "ZRH", name: "Zurich", country: "Switzerland" },
  OMDB: { code: "OMDB", iata: "DXB", name: "Dubai International", country: "United Arab Emirates", aliases: ["DUBAI"] }
};

type AirportAttribution = {
  code: string;
  label: string;
  country: string;
  method: "ICAO" | "IATA" | "NAME";
};

const unknownAirportTokens = new Set(["", "UNKNOWN", "ENROUTE", "N/A", "NA", "NONE", "NULL"]);

const reliableIcaoCountryPrefixes: Array<[prefix: string, country: string]> = [
  ["K", "United States"],
  ["EG", "United Kingdom"],
  ["LF", "France"],
  ["ED", "Germany"],
  ["EH", "Netherlands"],
  ["LS", "Switzerland"],
  ["OM", "United Arab Emirates"],
  ["LE", "Spain"],
  ["LI", "Italy"],
  ["EB", "Belgium"],
  ["EI", "Ireland"],
  ["EK", "Denmark"],
  ["EN", "Norway"],
  ["ES", "Sweden"],
  ["EF", "Finland"],
  ["LP", "Portugal"],
  ["LOW", "Austria"],
  ["LO", "Austria"],
  ["LZ", "Slovakia"],
  ["LK", "Czech Republic"],
  ["EP", "Poland"],
  ["LH", "Hungary"],
  ["LG", "Greece"],
  ["LT", "Turkey"],
  ["RJ", "Japan"],
  ["RK", "South Korea"],
  ["ZB", "China"],
  ["ZGGG", "China"],
  ["Z", "China"],
  ["C", "Canada"],
  ["MM", "Mexico"],
  ["SB", "Brazil"],
  ["SA", "Argentina"],
  ["Y", "Australia"],
  ["NZ", "New Zealand"]
];

const iataIndex = new Map<string, AirportMetadata>();
const nameIndex = new Map<string, AirportMetadata>();

for (const airport of Object.values(airportMetadata)) {
  if (airport.iata) iataIndex.set(airport.iata, airport);
  nameIndex.set(normalizeName(airport.name), airport);
  for (const alias of airport.aliases ?? []) {
    nameIndex.set(normalizeName(alias), airport);
  }
}

export function getAirportCountry(code: string) {
  return resolveAirportCountry(code) ?? "Unknown";
}

export function getAirportName(code: string) {
  return resolveAirport(code)?.label ?? "Unknown";
}

export function resolveAirport(value: string): AirportAttribution | null {
  const normalized = normalizeAirportValue(value);
  if (unknownAirportTokens.has(normalized)) return null;

  const byIcao = airportMetadata[normalized];
  if (byIcao) return toAttribution(byIcao, "ICAO");

  const byIata = iataIndex.get(normalized);
  if (byIata) return toAttribution(byIata, "IATA");

  const byName = nameIndex.get(normalizeName(value));
  if (byName) return toAttribution(byName, "NAME");

  return null;
}

export function resolveAirportCountry(value: string) {
  const airport = resolveAirport(value);
  if (airport) return airport.country;

  const normalized = normalizeAirportValue(value);
  if (unknownAirportTokens.has(normalized)) return null;

  for (const [prefix, country] of reliableIcaoCountryPrefixes) {
    if (normalized.startsWith(prefix)) return country;
  }

  return null;
}

export function isAirportAttributed(value: string) {
  return Boolean(resolveAirport(value));
}

export function isCountryAttributed(value: string) {
  return Boolean(resolveAirportCountry(value));
}

export function isLegacyAirportAttributed(value: string) {
  const normalized = normalizeAirportValue(value);
  return Boolean(airportMetadata[normalized]);
}

export function isLegacyCountryAttributed(value: string) {
  return isLegacyAirportAttributed(value);
}

function toAttribution(airport: AirportMetadata, method: AirportAttribution["method"]): AirportAttribution {
  return {
    code: airport.code,
    label: airport.name,
    country: airport.country,
    method
  };
}

function normalizeAirportValue(value: string) {
  return value.trim().toUpperCase();
}

function normalizeName(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]+/g, " ").replace(/\s+/g, " ");
}
