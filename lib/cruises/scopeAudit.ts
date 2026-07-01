import type { CruiseRegion } from "@/lib/cruises/config";
import { CRUISE_REGIONS } from "@/lib/cruises/config";

export type CruiseScopeAuditCategory =
  | "LIKELY_OCEAN_CRUISE"
  | "POSSIBLE_OCEAN_CRUISE"
  | "LIKELY_NON_CRUISE_PASSENGER"
  | "INSUFFICIENT_METADATA";

export type CruiseScopeAuditVessel = {
  id?: string;
  name: string | null;
  imo: string | null;
  mmsi: string | null;
  operator: string | null;
  shipType: string | null;
  grossTonnage: number | null;
  length: number | null;
  width: number | null;
  destination: string | null;
  latestLatitude?: number | null;
  latestLongitude?: number | null;
  latestSpeedOverGround?: number | null;
  latestNavigationalStatus?: string | null;
  hasMrvRecord?: boolean;
  hasStaticPayload?: boolean;
};

export type CruiseScopeClassification = {
  category: CruiseScopeAuditCategory;
  evidence: string[];
};

export const CURRENT_AIS_FILTER_RULES = {
  subscribedMessageTypes: ["PositionReport", "StandardClassBPositionReport", "ShipStaticData"],
  acceptedShipTypeCodes: "Numeric AIS ship type codes 60-69",
  acceptedShipTypeText: "Text containing passenger or cruise",
  knownIdentityRule:
    "A position/static message may be accepted when IMO or MMSI matches an existing cruise_ships record and either the stored or incoming shipType looks passenger/cruise; existing identity records with IMO/MMSI can also continue through known-ship handling.",
  rejectionRules: [
    "Unreadable or invalid JSON socket payload",
    "Corrupt or incomplete AIS position message",
    "Invalid, out-of-range, or zero-island coordinates",
    "Speed over 45 knots",
    "Duplicate in-memory AIS message key",
    "Neither passenger-like AIS type/text nor known cruise_ships identity",
    "Duplicate coordinates against latest stored position",
    "Non-increasing timestamp against latest stored position",
    "Implied jump speed over 70 knots within 12 hours"
  ],
  scopeConclusion: "Current filter may admit non-cruise passenger vessels"
} as const;

const OCEAN_CRUISE_OPERATOR_PATTERNS = [
  "aida",
  "azamara",
  "carnival",
  "celebrity",
  "costa",
  "cunard",
  "disney cruise",
  "holland america",
  "hurtigruten",
  "msc",
  "norwegian cruise",
  "oceania",
  "p&o cruises",
  "ponant",
  "princess",
  "regent",
  "royal caribbean",
  "seabourn",
  "silversea",
  "tui cruises",
  "viking",
  "virgin voyages"
];

const OCEAN_CRUISE_NAME_PATTERNS = [
  "aida",
  "azamara",
  "carnival",
  "celebrity",
  "costa",
  "disney",
  "msc",
  "norwegian",
  "princess",
  "seabourn",
  "silversea",
  "viking",
  "voyager",
  "cruise",
  "explorer",
  "expedition"
];

const NON_CRUISE_PATTERNS = [
  "ferry",
  "ropax",
  "ro-pax",
  "ro pax",
  "ro/ro",
  "roro",
  "commuter",
  "water taxi",
  "watertaxi",
  "river",
  "shuttle",
  "fast craft",
  "fast ferry",
  "high speed",
  "hsc",
  "jetfoil",
  "hydrofoil",
  "catamaran",
  "excursion",
  "day tour",
  "sightseeing",
  "tour boat",
  "dinner cruise",
  "yacht",
  "superyacht",
  "research",
  "navy",
  "military",
  "government",
  "pilot",
  "tug",
  "service",
  "barge",
  "hotel ship",
  "floating hotel"
];

export function classifyCruiseScope(vessel: CruiseScopeAuditVessel): CruiseScopeClassification {
  const evidence: string[] = [];
  const text = searchableText(vessel);
  const shipType = normalizeText(vessel.shipType);
  const operator = normalizeText(vessel.operator);
  const name = normalizeText(vessel.name);
  const destination = normalizeText(vessel.destination);
  const passengerType = looksLikePassengerType(vessel.shipType);
  const explicitCruiseType = shipType.includes("cruise");
  const ferryLike = containsPattern(text, NON_CRUISE_PATTERNS);
  const oceanOperator = containsPattern(operator, OCEAN_CRUISE_OPERATOR_PATTERNS);
  const cruiseName = containsPattern(name, OCEAN_CRUISE_NAME_PATTERNS);
  const destinationCruiseLike = containsPattern(destination, ["cruise", "passenger terminal", "cruise terminal"]);
  const hasLargeCruiseScale = hasOceanCruiseScale(vessel);
  const hasExpeditionScale = hasExpeditionCruiseScale(vessel);

  if (passengerType) evidence.push(`passenger AIS/type signal: ${vessel.shipType ?? "passenger-like text"}`);
  if (explicitCruiseType) evidence.push("explicit cruise ship type text");
  if (vessel.imo) evidence.push("IMO present");
  else evidence.push("IMO absent");
  if (vessel.mmsi) evidence.push("MMSI present");
  else evidence.push("MMSI absent");
  if (vessel.operator) evidence.push(`operator present: ${vessel.operator}`);
  else evidence.push("operator absent");
  if (vessel.length !== null) evidence.push(`length present: ${formatNumber(vessel.length)} m`);
  else evidence.push("length absent");
  if (vessel.width !== null) evidence.push(`width present: ${formatNumber(vessel.width)} m`);
  else evidence.push("width absent");
  if (vessel.grossTonnage !== null) evidence.push(`gross tonnage present: ${formatNumber(vessel.grossTonnage)}`);
  else evidence.push("gross tonnage absent");
  if (vessel.hasMrvRecord) evidence.push("MRV annual emissions record available");
  if (vessel.hasStaticPayload) evidence.push("static AIS metadata available");
  if (oceanOperator) evidence.push("operator/name resembles known ocean cruise brand");
  if (cruiseName) evidence.push("vessel name contains cruise-like signal");
  if (destinationCruiseLike) evidence.push("destination contains cruise terminal signal");
  if (hasLargeCruiseScale) evidence.push("dimensions/tonnage are consistent with mainstream ocean cruise scale");
  if (hasExpeditionScale) evidence.push("dimensions/tonnage are consistent with expedition cruise scale");
  if (ferryLike) evidence.push("ferry/RoPax/commuter/river/day-vessel/service-like signal detected");
  if (vessel.latestSpeedOverGround !== null && vessel.latestSpeedOverGround !== undefined) {
    evidence.push(`latest speed available: ${formatNumber(vessel.latestSpeedOverGround)} kn`);
  }

  if (ferryLike && !(explicitCruiseType || oceanOperator || vessel.hasMrvRecord)) {
    return { category: "LIKELY_NON_CRUISE_PASSENGER", evidence };
  }

  const strongCruiseSignals = countTrue([explicitCruiseType, oceanOperator, vessel.hasMrvRecord === true, hasLargeCruiseScale]);
  const expeditionSignals = countTrue([hasExpeditionScale, cruiseName, oceanOperator, vessel.hasMrvRecord === true]);
  if ((strongCruiseSignals >= 2 && Boolean(vessel.imo || vessel.mmsi)) || expeditionSignals >= 3) {
    return { category: "LIKELY_OCEAN_CRUISE", evidence };
  }

  if (passengerType && (cruiseName || destinationCruiseLike || hasLargeCruiseScale || hasExpeditionScale || vessel.hasMrvRecord)) {
    return { category: "POSSIBLE_OCEAN_CRUISE", evidence };
  }

  if (passengerType || vessel.imo || vessel.mmsi || vessel.shipType || vessel.length || vessel.grossTonnage) {
    return { category: "INSUFFICIENT_METADATA", evidence };
  }

  evidence.push("no reliable cruise-scope metadata available");
  return { category: "INSUFFICIENT_METADATA", evidence };
}

export function findCruiseRegionForPosition(latitude: number | null | undefined, longitude: number | null | undefined, regions: CruiseRegion[] = CRUISE_REGIONS) {
  if (latitude === null || latitude === undefined || longitude === null || longitude === undefined) return "Unknown";
  for (const region of regions) {
    const [[minLat, minLon], [maxLat, maxLon]] = region.boundingBox;
    if (latitude >= minLat && latitude <= maxLat && longitude >= minLon && longitude <= maxLon) return region.name;
  }
  return "Outside monitored regions";
}

function searchableText(vessel: CruiseScopeAuditVessel) {
  return [vessel.name, vessel.operator, vessel.shipType, vessel.destination].map((value) => normalizeText(value)).join(" ");
}

function normalizeText(value: unknown) {
  return String(value ?? "").toLowerCase().trim();
}

function containsPattern(value: string, patterns: string[]) {
  return patterns.some((pattern) => value.includes(pattern));
}

function looksLikePassengerType(value: unknown) {
  if (value === null || value === undefined || value === "") return false;
  if (typeof value === "number") return value >= 60 && value <= 69;
  const text = String(value).toLowerCase();
  const numeric = Number(text);
  if (Number.isFinite(numeric)) return numeric >= 60 && numeric <= 69;
  return text.includes("passenger") || text.includes("cruise");
}

function hasOceanCruiseScale(vessel: CruiseScopeAuditVessel) {
  const length = vessel.length ?? 0;
  const width = vessel.width ?? 0;
  const grossTonnage = vessel.grossTonnage ?? 0;
  return length >= 180 || grossTonnage >= 25_000 || (length >= 130 && width >= 20 && grossTonnage >= 10_000);
}

function hasExpeditionCruiseScale(vessel: CruiseScopeAuditVessel) {
  const length = vessel.length ?? 0;
  const width = vessel.width ?? 0;
  const grossTonnage = vessel.grossTonnage ?? 0;
  return (length >= 75 && length < 180 && width >= 12) || (grossTonnage >= 3_000 && grossTonnage < 25_000);
}

function countTrue(values: boolean[]) {
  return values.filter(Boolean).length;
}

function formatNumber(value: number) {
  return Number.isInteger(value) ? value.toLocaleString("en-US") : value.toLocaleString("en-US", { maximumFractionDigits: 1 });
}
