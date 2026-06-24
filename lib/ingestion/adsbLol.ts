import { estimateAirportDistanceKm, findNearestKnownAirport } from "./airports";
import { getDataRefreshIntervalMinutes } from "@/lib/config/refresh";
import { filterPrivateJetRecords, PRIVATE_JET_AIRCRAFT_TYPES } from "./privateJets";
import { ADSB_LOL_DATA_SOURCE } from "./providerConstants";
import type { NormalizedFlightRecord, ProviderClient } from "./types";

type AdsbLolRecord = {
  hex?: string;
  icaoHex?: string;
  icao24?: string;
  r?: string;
  registration?: string;
  t?: string;
  type?: string;
  aircraftType?: string;
  orig?: string;
  origin?: string;
  originAirport?: string;
  dest?: string;
  destination?: string;
  destinationAirport?: string;
  departureAt?: string;
  departureTime?: string;
  firstSeen?: string | number;
  arrivalAt?: string;
  arrivalTime?: string;
  lastSeen?: string | number;
  distanceKm?: number;
  distance_km?: number;
  distance?: number;
  flight?: string;
  now?: number;
  seen_pos?: number;
  seen?: number;
  lat?: number;
  lon?: number;
};

export class AdsbLolClient implements ProviderClient {
  provider = ADSB_LOL_DATA_SOURCE;

  constructor(
    private readonly dailyUrl = process.env.ADSB_LOL_DAILY_URL ?? process.env.ADSB_LOL_API_URL,
    private readonly apiBaseUrl = process.env.ADSB_LOL_API_BASE_URL ?? "https://api.adsb.lol/v2"
  ) {}

  async fetchRecentFlights(): Promise<NormalizedFlightRecord[]> {
    if (!this.dailyUrl) return this.fetchTypeSnapshotRecords();

    const response = await fetch(this.dailyUrl, {
      headers: { Accept: "application/json" },
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error(`ADSB.lol request failed with ${response.status}`);
    }

    const payload = await response.json();
    const rows = extractRows(payload);
    return filterPrivateJetRecords(rows.map(normalizeAdsbLolRecord).filter(Boolean) as NormalizedFlightRecord[]);
  }

  private async fetchTypeSnapshotRecords(): Promise<NormalizedFlightRecord[]> {
    const batches: AdsbLolRecord[][] = [];
    for (const aircraftType of PRIVATE_JET_AIRCRAFT_TYPES) {
      const url = `${this.apiBaseUrl.replace(/\/$/, "")}/type/${encodeURIComponent(aircraftType)}`;
      const response = await fetch(url, {
        headers: { Accept: "application/json" },
        cache: "no-store"
      });
      if (response.ok) {
        const payload = await response.json();
        batches.push(extractRows(payload).map((record) => ({ ...record, aircraftType })));
      }
      await delay(250);
    }

    const today = new Date();
    const snapshotAt = roundDownToInterval(today, getDataRefreshIntervalMinutes());
    return batches
      .flat()
      .map((record) => normalizeAdsbLolSnapshotRecord(record, snapshotAt))
      .filter(Boolean) as NormalizedFlightRecord[];
  }
}

function extractRows(payload: unknown): AdsbLolRecord[] {
  if (Array.isArray(payload)) return payload as AdsbLolRecord[];
  if (payload && typeof payload === "object") {
    const objectPayload = payload as { ac?: unknown; flights?: unknown; aircraft?: unknown; records?: unknown; data?: unknown };
    for (const key of ["flights", "records", "data", "aircraft", "ac"] as const) {
      const value = objectPayload[key];
      if (Array.isArray(value)) return value as AdsbLolRecord[];
    }
  }
  return [];
}

function normalizeAdsbLolRecord(record: AdsbLolRecord): NormalizedFlightRecord | null {
  const aircraftType = (record.aircraftType ?? record.type ?? record.t ?? "").trim().toUpperCase();
  const originAirport = (record.originAirport ?? record.origin ?? record.orig ?? "").trim().toUpperCase();
  const destinationAirport = (record.destinationAirport ?? record.destination ?? record.dest ?? "").trim().toUpperCase();
  const departureAt = parseDate(record.departureAt ?? record.departureTime ?? record.firstSeen);
  const arrivalAt = parseDate(record.arrivalAt ?? record.arrivalTime ?? record.lastSeen);
  const explicitDistance = Number(record.distanceKm ?? record.distance_km ?? record.distance);
  const estimatedDistance = originAirport && destinationAirport ? estimateAirportDistanceKm(originAirport, destinationAirport) : null;
  const distanceKm = Number.isFinite(explicitDistance) && explicitDistance > 0 ? explicitDistance : estimatedDistance;
  const icaoHex = (record.icaoHex ?? record.icao24 ?? record.hex ?? "").trim().toUpperCase();

  if (!icaoHex || !aircraftType || !originAirport || !destinationAirport || !departureAt || !distanceKm) {
    return null;
  }

  const sourceRecordId =
    record.flight?.trim() ||
    `${icaoHex}-${originAirport}-${destinationAirport}-${departureAt.toISOString()}-${Math.round(distanceKm)}`;

  return {
    icaoHex,
    registration: record.registration ?? record.r ?? null,
    aircraftType,
    verifiedPublicEntity: null,
    originAirport,
    destinationAirport,
    departureAt,
    arrivalAt,
    distanceKm,
    dataSource: ADSB_LOL_DATA_SOURCE,
    sourceRecordId,
    sourceAttribution: "ADSB.lol scheduled batch import"
  };
}

function normalizeAdsbLolSnapshotRecord(record: AdsbLolRecord, now: Date): NormalizedFlightRecord | null {
  const aircraftType = (record.aircraftType ?? record.type ?? record.t ?? "").trim().toUpperCase();
  const icaoHex = (record.icaoHex ?? record.icao24 ?? record.hex ?? "").trim().toUpperCase();
  const lat = Number(record.lat);
  const lon = Number(record.lon);
  if (!icaoHex || !aircraftType || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const nearestAirport = findNearestKnownAirport(lat, lon);
  if (!nearestAirport) return null;

  const snapshotKey = now.toISOString().slice(0, 16);
  const distanceKm = Math.max(25, nearestAirport.distanceKm);

  return {
    icaoHex,
    registration: record.registration ?? record.r ?? null,
    aircraftType,
    verifiedPublicEntity: null,
    originAirport: nearestAirport.code,
    destinationAirport: "ENROUTE",
    departureAt: now,
    arrivalAt: null,
    distanceKm,
    dataSource: ADSB_LOL_DATA_SOURCE,
    sourceRecordId: `adsb-lol-type-snapshot-${snapshotKey}-${icaoHex}-${aircraftType}`,
    sourceAttribution: "ADSB.lol public aircraft-type API scheduled batch snapshot"
  };
}

function parseDate(value: string | number | undefined) {
  if (value === undefined || value === null || value === "") return null;
  const date = typeof value === "number" ? new Date(value > 1_000_000_000_000 ? value : value * 1000) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function roundDownToInterval(date: Date, intervalMinutes: number) {
  const intervalMs = intervalMinutes * 60 * 1000;
  return new Date(Math.floor(date.getTime() / intervalMs) * intervalMs);
}
