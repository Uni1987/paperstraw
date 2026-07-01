export const AISSTREAM_ENDPOINT = "wss://stream.aisstream.io/v0/stream";
export const CRUISE_MRV_SOURCE = "EMSA THETIS-MRV";
export const CRUISE_AIS_SOURCE = "AISStream.io";
export const CRUISE_ESTIMATION_METHOD_VERSION = "cruise-ais-mrv-v1";

export type CruiseRegion = {
  id: string;
  name: string;
  boundingBox: [[number, number], [number, number]];
};

export const CRUISE_REGIONS = [
  {
    id: "mediterranean",
    name: "Mediterranean",
    boundingBox: [
      [30.0, -6.5],
      [46.5, 37.0]
    ]
  },
  {
    id: "caribbean",
    name: "Caribbean",
    boundingBox: [
      [7.0, -89.5],
      [28.5, -58.0]
    ]
  },
  {
    id: "north-sea",
    name: "North Sea",
    boundingBox: [
      [50.0, -5.5],
      [61.5, 9.5]
    ]
  },
  {
    id: "baltic-sea",
    name: "Baltic Sea",
    boundingBox: [
      [53.5, 9.0],
      [66.5, 31.5]
    ]
  },
  {
    id: "alaska",
    name: "Alaska",
    boundingBox: [
      [51.0, -170.0],
      [61.5, -128.0]
    ]
  },
  {
    id: "norwegian-fjords",
    name: "Norwegian Fjords",
    boundingBox: [
      [58.0, 4.0],
      [71.5, 32.0]
    ]
  },
  {
    id: "us-east-coast",
    name: "US East Coast",
    boundingBox: [
      [24.0, -82.5],
      [46.5, -63.0]
    ]
  },
  {
    id: "us-west-coast",
    name: "US West Coast",
    boundingBox: [
      [31.5, -125.5],
      [49.2, -116.5]
    ]
  },
  {
    id: "mexico-baja-california",
    name: "Mexico / Baja California",
    boundingBox: [
      [18.0, -116.5],
      [32.8, -104.5]
    ]
  },
  {
    id: "canary-madeira-azores",
    name: "Canary Islands / Madeira / Azores",
    boundingBox: [
      [24.0, -32.5],
      [40.5, -12.5]
    ]
  },
  {
    id: "red-sea",
    name: "Red Sea",
    boundingBox: [
      [12.0, 32.0],
      [30.5, 44.0]
    ]
  },
  {
    id: "persian-gulf-dubai",
    name: "Persian Gulf / Dubai",
    boundingBox: [
      [23.0, 48.0],
      [30.5, 57.5]
    ]
  },
  {
    id: "singapore-southeast-asia",
    name: "Singapore / Southeast Asia",
    boundingBox: [
      [-7.5, 95.0],
      [16.5, 124.0]
    ]
  },
  {
    id: "japan",
    name: "Japan",
    boundingBox: [
      [30.0, 128.0],
      [46.5, 146.5]
    ]
  },
  {
    id: "australia-east-coast",
    name: "Australia East Coast",
    boundingBox: [
      [-43.8, 145.0],
      [-10.0, 154.5]
    ]
  },
  {
    id: "new-zealand",
    name: "New Zealand",
    boundingBox: [
      [-47.5, 165.0],
      [-33.0, 179.5]
    ]
  },
  {
    id: "south-pacific",
    name: "South Pacific",
    boundingBox: [
      [-24.5, -180.0],
      [-10.0, -145.0]
    ]
  },
  {
    id: "south-america-patagonia",
    name: "South America / Patagonia",
    boundingBox: [
      [-56.5, -77.5],
      [-32.0, -51.0]
    ]
  },
  {
    id: "antarctica-approach-routes",
    name: "Antarctica cruise approach routes",
    boundingBox: [
      [-66.5, -75.0],
      [-52.0, -48.0]
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
  return getCruiseRegionConfig().regions;
}

export function getCruiseRegionConfig(): { regions: CruiseRegion[]; source: "default" | "override" } {
  const raw = process.env.AISSTREAM_BOUNDING_BOXES?.trim();
  if (!raw) return { regions: [...CRUISE_REGIONS], source: "default" };

  try {
    const parsed = JSON.parse(raw) as CruiseRegion[];
    return { regions: validateCruiseRegions(parsed, "AISSTREAM_BOUNDING_BOXES"), source: "override" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown parsing error";
    throw new Error(`Invalid AISSTREAM_BOUNDING_BOXES: ${message}`);
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

export function validateCruiseRegions(value: unknown, label = "cruise regions"): CruiseRegion[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be a JSON array of region objects.`);
  }
  if (value.length === 0) {
    throw new Error(`${label} must include at least one region.`);
  }

  const ids = new Set<string>();
  return value.map((region, index) => {
    if (!region || typeof region !== "object") {
      throw new Error(`${label}[${index}] must be an object.`);
    }
    const candidate = region as CruiseRegion;
    if (!isStableRegionId(candidate.id)) {
      throw new Error(`${label}[${index}].id must be a lowercase stable id using letters, numbers, and hyphens.`);
    }
    if (ids.has(candidate.id)) {
      throw new Error(`${label} contains duplicate region id "${candidate.id}".`);
    }
    ids.add(candidate.id);
    if (typeof candidate.name !== "string" || !candidate.name.trim()) {
      throw new Error(`${label}[${index}].name must be a non-empty string.`);
    }
    if (!Array.isArray(candidate.boundingBox) || candidate.boundingBox.length !== 2) {
      throw new Error(`${label}[${index}].boundingBox must be [[minLat,minLon],[maxLat,maxLon]].`);
    }

    const [southWest, northEast] = candidate.boundingBox;
    if (!isCoordinatePair(southWest) || !isCoordinatePair(northEast)) {
      throw new Error(`${label}[${index}].boundingBox coordinates must be finite numbers.`);
    }
    const [minLat, minLon] = southWest;
    const [maxLat, maxLon] = northEast;
    if (minLat < -90 || maxLat > 90 || minLon < -180 || maxLon > 180) {
      throw new Error(`${label}[${index}].boundingBox coordinates are outside valid latitude/longitude ranges.`);
    }
    if (minLat >= maxLat || minLon >= maxLon) {
      throw new Error(`${label}[${index}].boundingBox must use southwest then northeast coordinate order.`);
    }

    return {
      id: candidate.id,
      name: candidate.name.trim(),
      boundingBox: [
        [minLat, minLon],
        [maxLat, maxLon]
      ]
    };
  });
}

function isStableRegionId(value: unknown) {
  return typeof value === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

function isCoordinatePair(value: unknown): value is [number, number] {
  return Array.isArray(value) && value.length === 2 && value.every((coordinate) => typeof coordinate === "number" && Number.isFinite(coordinate));
}
