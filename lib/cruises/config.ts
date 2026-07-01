export const AISSTREAM_ENDPOINT = "wss://stream.aisstream.io/v0/stream";
export const CRUISE_MRV_SOURCE = "EMSA THETIS-MRV";
export const CRUISE_AIS_SOURCE = "AISStream.io";
export const CRUISE_ESTIMATION_METHOD_VERSION = "cruise-ais-mrv-v1";

export type CruiseRegion = {
  name: string;
  boundingBox: [[number, number], [number, number]];
};

export const CRUISE_REGIONS = [
  {
    name: "Mediterranean",
    boundingBox: [
      [30.0, -6.5],
      [46.5, 37.0]
    ]
  },
  {
    name: "Caribbean",
    boundingBox: [
      [7.0, -89.5],
      [28.5, -58.0]
    ]
  },
  {
    name: "North Sea",
    boundingBox: [
      [50.0, -5.5],
      [61.5, 9.5]
    ]
  },
  {
    name: "Baltic Sea",
    boundingBox: [
      [53.5, 9.0],
      [66.5, 31.5]
    ]
  },
  {
    name: "Alaska",
    boundingBox: [
      [51.0, -170.0],
      [61.5, -128.0]
    ]
  },
  {
    name: "Norwegian Fjords",
    boundingBox: [
      [58.0, 4.0],
      [71.5, 32.0]
    ]
  },
  {
    name: "US East Coast",
    boundingBox: [
      [24.0, -82.5],
      [46.5, -63.0]
    ]
  }
] satisfies CruiseRegion[];

export function isCruisesEnabled() {
  return process.env.ENABLE_CRUISES === "true";
}

export function isAisStreamIngestionEnabled() {
  return process.env.ENABLE_AISSTREAM_INGESTION === "true";
}

export function getAisStreamApiKey() {
  return process.env.AISSTREAM_API_KEY?.trim() ?? "";
}

export function getAisStreamLogLevel() {
  const level = process.env.AISSTREAM_LOG_LEVEL?.toLowerCase().trim();
  return level === "debug" || level === "info" || level === "warn" || level === "error" ? level : "info";
}

export function getCruiseRegions(): CruiseRegion[] {
  const raw = process.env.AISSTREAM_BOUNDING_BOXES?.trim();
  if (!raw) return [...CRUISE_REGIONS];

  try {
    const parsed = JSON.parse(raw) as CruiseRegion[];
    if (!Array.isArray(parsed)) return [...CRUISE_REGIONS];
    const valid = parsed.filter(isCruiseRegion);
    return valid.length ? valid : [...CRUISE_REGIONS];
  } catch {
    console.warn("Invalid AISSTREAM_BOUNDING_BOXES JSON. Falling back to built-in cruise regions.");
    return [...CRUISE_REGIONS];
  }
}

export function parseOptionalNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const normalized = String(value)
    .replace(/[,\s]/g, "")
    .replace(/[^\d.-]/g, "");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function isCruiseRegion(value: unknown): value is CruiseRegion {
  if (!value || typeof value !== "object") return false;
  const candidate = value as CruiseRegion;
  return (
    typeof candidate.name === "string" &&
    Array.isArray(candidate.boundingBox) &&
    candidate.boundingBox.length === 2 &&
    candidate.boundingBox.every(
      (point) =>
        Array.isArray(point) &&
        point.length === 2 &&
        point.every((coordinate) => typeof coordinate === "number" && Number.isFinite(coordinate))
    )
  );
}
