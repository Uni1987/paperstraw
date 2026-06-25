import { gunzipSync } from "node:zlib";
import { prisma } from "@/lib/prisma";
import { recalculateAggregateRollups } from "@/lib/awareness/rollups";
import { estimateCoordinateDistanceKm, findNearestKnownAirport } from "./airports";
import { importFlights } from "./importer";
import { ImportStatuses } from "./importStatus";
import { isLikelyPrivateJetType } from "./privateJets";
import { ADSB_LOL_DATA_SOURCE } from "./providerConstants";
import {
  getProcessedArchiveDate,
  hasExistingHistoricalRecords,
  IngestionModes,
  updateIngestionCursor,
  upsertProcessedArchiveDate
} from "./state";
import type { NormalizedFlightRecord } from "./types";

const RELEASE_PODS = ["planes-readsb-prod-0", "planes-readsb-prod-1", "planes-readsb-staging-0"];
const GITHUB_API_BASE = "https://api.github.com/repos/adsblol";
const FILE_SAMPLE_LIMIT = 80;

type HistoricalIngestionOptions = {
  from: Date;
  to: Date;
  force?: boolean;
  onProgress?: (message: string) => void;
};

type HistoricalIngestionResult = {
  imported: number;
  datesProcessed: number;
  datesUnavailable: number;
  datesSkipped: number;
  attributionUpdated: number;
  rollups: number;
  errors: string[];
};

type GitHubRelease = {
  tag_name: string;
  name?: string | null;
  html_url: string;
  assets: GitHubAsset[];
};

type GitHubAsset = {
  name: string;
  size: number;
  browser_download_url: string;
};

type SelectedRelease = {
  release: GitHubRelease;
  assets: GitHubAsset[];
  totalBytes: number;
};

type ReadsbAircraft = {
  hex?: string;
  icaoHex?: string;
  icao24?: string;
  r?: string;
  registration?: string;
  t?: string;
  type?: string;
  aircraftType?: string;
  lat?: number;
  lon?: number;
};

type ReadsbHistoryPayload = {
  now?: number;
  aircraft?: ReadsbAircraft[];
  ac?: ReadsbAircraft[];
};

type ReadsbTracePayload = {
  icao?: string;
  hex?: string;
  r?: string;
  registration?: string;
  t?: string;
  type?: string;
  aircraftType?: string;
  timestamp?: number;
  trace?: unknown[];
};

type ArchiveFileKind = "snapshot" | "trace";

type ArchiveScanStats = {
  filesScanned: number;
  filesMatched: number;
  matchedFileNames: string[];
  scannedFileSamples: string[];
  compressedJsonSamples: string[];
  topLevelEntries: Record<string, number>;
  recordsParsed: number;
  privateJetMatches: number;
};

type AircraftTrack = {
  icaoHex: string;
  registration: string | null;
  aircraftType: string;
  firstAt: Date;
  lastAt: Date;
  firstPosition: GeoPosition;
  lastPosition: GeoPosition;
  distanceKm: number;
};

type GeoPosition = {
  lat: number;
  lon: number;
};

type TarEntry = {
  name: string;
  size: number;
};

export async function runHistoricalIngestion(options: HistoricalIngestionOptions): Promise<HistoricalIngestionResult> {
  validateDateRange(options.from, options.to);

  const dates = enumerateDates(options.from, options.to);
  const years = new Set<number>();
  const errors: string[] = [];
  let imported = 0;
  let attributionUpdated = 0;
  let datesUnavailable = 0;
  let datesSkipped = 0;

  options.onProgress?.(`Historical import range: ${formatDateKey(options.from)} to ${formatDateKey(options.to)} (${dates.length} day(s)).`);
  if (options.force) {
    options.onProgress?.(
      "Historical reprocess mode enabled: already-successful archive dates will be scanned again; existing flights only receive attribution field updates."
    );
  }

  for (const date of dates) {
    const dateKey = formatDateKey(date);
    years.add(date.getUTCFullYear());
    options.onProgress?.(`[${dateKey}] Checking ADSB.lol GitHub archive...`);

    try {
      const processedDate = await getProcessedArchiveDate(ADSB_LOL_DATA_SOURCE, dateKey);
      if (shouldSkipHistoricalDate({ force: options.force, processedStatus: processedDate?.status, existingHistoricalRecords: 0 })) {
        datesSkipped += 1;
        options.onProgress?.(`[${dateKey}] Already processed successfully; skipping archive scan.`);
        continue;
      }

      const existingHistoricalRecords = await hasExistingHistoricalRecords(dateKey, ADSB_LOL_DATA_SOURCE);
      if (shouldSkipHistoricalDate({ force: options.force, processedStatus: processedDate?.status, existingHistoricalRecords })) {
        datesSkipped += 1;
        await upsertProcessedArchiveDate({
          provider: ADSB_LOL_DATA_SOURCE,
          dateKey,
          status: ImportStatuses.SUCCESS,
          recordsImported: existingHistoricalRecords,
          error: "Marked processed from existing historical flight records."
        });
        options.onProgress?.(
          `[${dateKey}] Found ${existingHistoricalRecords} existing historical record(s); marked date processed and skipped archive scan.`
        );
        continue;
      }

      const release = await findBestReleaseForDate(date);
      if (!release) {
        datesUnavailable += 1;
        options.onProgress?.(`[${dateKey}] No archive release found; skipped.`);
        await logUnavailableDate(dateKey);
        continue;
      }

      options.onProgress?.(
        `[${dateKey}] Using ${release.release.tag_name} (${release.assets.length} split tar asset(s), ${formatBytes(release.totalBytes)}).`
      );
      options.onProgress?.(`[${dateKey}] Release name: ${release.release.name || release.release.tag_name}`);
      options.onProgress?.(`[${dateKey}] Asset names found: ${release.release.assets.map((asset) => asset.name).join(", ")}`);
      options.onProgress?.(`[${dateKey}] Split tar assets selected: ${release.assets.map((asset) => asset.name).join(", ")}`);

      const { records, stats } = await fetchHistoricalRecordsForRelease(date, release, options.onProgress);
      options.onProgress?.(
        `[${dateKey}] Files scanned: ${stats.filesScanned}; files matched: ${stats.filesMatched}; records parsed: ${stats.recordsParsed}; private jet matches: ${stats.privateJetMatches}.`
      );
      if (stats.matchedFileNames.length) {
        options.onProgress?.(
          `[${dateKey}] Matched file samples (${stats.matchedFileNames.length} of ${stats.filesMatched}): ${stats.matchedFileNames.join(", ")}`
        );
      }
      if (stats.scannedFileSamples.length) {
        options.onProgress?.(`[${dateKey}] Scanned file samples: ${stats.scannedFileSamples.join(", ")}`);
      }
      if (stats.compressedJsonSamples.length) {
        options.onProgress?.(`[${dateKey}] JSON file samples: ${stats.compressedJsonSamples.join(", ")}`);
      }
      options.onProgress?.(`[${dateKey}] Top-level archive entries: ${formatTopLevelEntries(stats.topLevelEntries)}`);
      const result = await importFlights(records, ADSB_LOL_DATA_SOURCE, {
        updateDuplicateAttribution: Boolean(options.force)
      });
      imported += result.imported;
      attributionUpdated += result.updatedAttribution;
      if (result.errors.length) errors.push(...result.errors.map((error) => `${dateKey}: ${error}`));
      await upsertProcessedArchiveDate({
        provider: ADSB_LOL_DATA_SOURCE,
        dateKey,
        status: result.errors.length ? ImportStatuses.PARTIAL : ImportStatuses.SUCCESS,
        releaseTag: release.release.tag_name,
        assetNames: release.assets.map((asset) => asset.name),
        filesScanned: stats.filesScanned,
        filesMatched: stats.filesMatched,
        recordsParsed: stats.recordsParsed,
        privateJetMatches: stats.privateJetMatches,
        recordsImported: result.imported,
        error: result.errors.join("\n") || null
      });
      options.onProgress?.(
        `[${dateKey}] Records imported: ${result.imported}; duplicate attribution updates: ${result.updatedAttribution}.`
      );
    } catch (error) {
      const message = `${dateKey}: ${error instanceof Error ? error.message : "Unknown historical import error"}`;
      errors.push(message);
      datesUnavailable += 1;
      options.onProgress?.(`[${dateKey}] ${message}; skipped.`);
      await upsertProcessedArchiveDate({
        provider: ADSB_LOL_DATA_SOURCE,
        dateKey,
        status: ImportStatuses.FAILED,
        recordsImported: 0,
        error: message
      });
      await prisma.importLog.create({
        data: {
          provider: ADSB_LOL_DATA_SOURCE,
          status: ImportStatuses.FAILED,
          recordsImported: 0,
          errors: message
        }
      });
    }
  }

  let rollups = 0;
  for (const year of years) {
    const result = await recalculateAggregateRollups(new Date(Date.UTC(year, 0, 1)));
    rollups += result.rollups;
  }

  options.onProgress?.(`Recalculated ${rollups} aggregate rollup row(s).`);
  await updateIngestionCursor({
    provider: ADSB_LOL_DATA_SOURCE,
    mode: IngestionModes.HISTORICAL_BOOTSTRAP,
    status: errors.length ? (imported > 0 || datesSkipped > 0 ? ImportStatuses.PARTIAL : ImportStatuses.FAILED) : ImportStatuses.SUCCESS,
    recordsImported: imported,
    lastImportedAt: dates.length ? dates[dates.length - 1] : null,
    error: errors.join("\n") || null
  });

  return {
    imported,
    datesProcessed: dates.length,
    datesUnavailable,
    datesSkipped,
    attributionUpdated,
    rollups,
    errors
  };
}

export function shouldSkipHistoricalDate({
  force,
  processedStatus,
  existingHistoricalRecords
}: {
  force?: boolean;
  processedStatus?: string | null;
  existingHistoricalRecords: number;
}) {
  if (force) return false;
  return processedStatus === ImportStatuses.SUCCESS || existingHistoricalRecords > 0;
}

async function fetchHistoricalRecordsForRelease(
  date: Date,
  release: SelectedRelease,
  onProgress?: (message: string) => void
): Promise<{ records: NormalizedFlightRecord[]; stats: ArchiveScanStats }> {
  const tracks = new Map<string, AircraftTrack>();
  const stats: ArchiveScanStats = {
    filesScanned: 0,
    filesMatched: 0,
    matchedFileNames: [],
    scannedFileSamples: [],
    compressedJsonSamples: [],
    topLevelEntries: {},
    recordsParsed: 0,
    privateJetMatches: 0
  };

  await streamSplitTarAssets(
    release.assets,
    (entry) => {
      stats.filesScanned += 1;
      if (stats.scannedFileSamples.length < FILE_SAMPLE_LIMIT) stats.scannedFileSamples.push(entry.name);
      const topLevel = getTopLevelEntry(entry.name);
      stats.topLevelEntries[topLevel] = (stats.topLevelEntries[topLevel] ?? 0) + 1;
      if (/\.json(\.gz)?$/i.test(entry.name) && stats.compressedJsonSamples.length < FILE_SAMPLE_LIMIT) {
        stats.compressedJsonSamples.push(entry.name);
      }
      const kind = getArchiveFileKind(entry.name);
      if (kind) {
        stats.filesMatched += 1;
        if (stats.matchedFileNames.length < FILE_SAMPLE_LIMIT) stats.matchedFileNames.push(entry.name);
      }
      return kind !== null;
    },
    async (entry, body) => {
      const kind = getArchiveFileKind(entry.name);
      if (!kind) return;
      const result =
        kind === "trace" ? mergeTracePayload(tracks, date, entry.name, body) : mergeSnapshotPayload(tracks, date, entry.name, body);
      stats.recordsParsed += result.recordsParsed;
      stats.privateJetMatches += result.privateJetMatches;
      if (stats.filesMatched % 1000 === 0) {
        onProgress?.(`[${formatDateKey(date)}] Matched ${stats.filesMatched} importable archive file(s).`);
      }
    }
  );

  return { records: [...tracks.values()].map((track) => trackToRecord(track, date)), stats };
}

async function findBestReleaseForDate(date: Date): Promise<SelectedRelease | null> {
  const year = date.getUTCFullYear();
  const dateKey = formatReleaseDate(date);
  const releases: SelectedRelease[] = [];

  for (const pod of RELEASE_PODS) {
    const tag = `v${dateKey}-${pod}`;
    const release = await fetchGitHubRelease(year, tag);
    if (!release) continue;
    const assets = release.assets.filter((asset) => /\.tar\.a[a-z]+$/i.test(asset.name)).sort((a, b) => a.name.localeCompare(b.name));
    if (!assets.length) continue;
    releases.push({
      release,
      assets,
      totalBytes: assets.reduce((total, asset) => total + asset.size, 0)
    });
  }

  return releases.sort((a, b) => b.totalBytes - a.totalBytes)[0] ?? null;
}

async function fetchGitHubRelease(year: number, tag: string): Promise<GitHubRelease | null> {
  const token = process.env.GITHUB_TOKEN;
  const response = await fetch(`${GITHUB_API_BASE}/globe_history_${year}/releases/tags/${encodeURIComponent(tag)}`, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "PaperStraw historical ingestion",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    cache: "no-store"
  });

  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`GitHub release lookup failed for ${tag} with ${response.status}`);
  return (await response.json()) as GitHubRelease;
}

async function streamSplitTarAssets(
  assets: GitHubAsset[],
  shouldCollect: (entry: TarEntry) => boolean,
  onEntry: (entry: TarEntry, body: Buffer) => Promise<void>
) {
  const reader = new SplitTarReader(shouldCollect, onEntry);
  for (const asset of assets) {
    const response = await fetch(asset.browser_download_url, {
      headers: {
        Accept: "application/octet-stream",
        "User-Agent": "PaperStraw historical ingestion",
        ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {})
      },
      cache: "no-store"
    });

    if (!response.ok) throw new Error(`GitHub asset download failed for ${asset.name} with ${response.status}`);
    if (!response.body) throw new Error(`GitHub asset download for ${asset.name} had no response body`);

    for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
      await reader.push(Buffer.from(chunk));
    }
  }
  await reader.finish();
}

class SplitTarReader {
  private pending = Buffer.alloc(0);
  private current: {
    entry: TarEntry;
    remaining: number;
    padding: number;
    chunks: Buffer[];
    collect: boolean;
  } | null = null;
  private ended = false;

  constructor(
    private readonly shouldCollect: (entry: TarEntry) => boolean,
    private readonly onEntry: (entry: TarEntry, body: Buffer) => Promise<void>
  ) {}

  async push(chunk: Buffer) {
    if (this.ended) return;
    this.pending = Buffer.concat([this.pending, chunk]);
    await this.drain();
  }

  async finish() {
    await this.drain();
  }

  private async drain() {
    while (!this.ended) {
      if (!this.current) {
        if (this.pending.length < 512) return;
        const header = this.pending.subarray(0, 512);
        this.pending = this.pending.subarray(512);
        if (isEmptyTarBlock(header)) {
          this.ended = true;
          return;
        }

        const entry = parseTarHeader(header);
        this.current = {
          entry,
          remaining: entry.size,
          padding: (512 - (entry.size % 512)) % 512,
          chunks: [],
          collect: this.shouldCollect(entry)
        };
      }

      if (this.current.remaining > 0) {
        if (this.pending.length === 0) return;
        const take = Math.min(this.current.remaining, this.pending.length);
        const bodyChunk = this.pending.subarray(0, take);
        if (this.current.collect) this.current.chunks.push(Buffer.from(bodyChunk));
        this.pending = this.pending.subarray(take);
        this.current.remaining -= take;
      }

      if (this.current.remaining === 0) {
        if (this.pending.length < this.current.padding) return;
        if (this.current.padding > 0) this.pending = this.pending.subarray(this.current.padding);

        const complete = this.current;
        this.current = null;
        if (complete.collect) {
          await this.onEntry(complete.entry, Buffer.concat(complete.chunks));
        }
      }
    }
  }
}

function mergeSnapshotPayload(tracks: Map<string, AircraftTrack>, date: Date, name: string, archivePayload: Buffer) {
  const text = decodeArchiveJsonBody(name, archivePayload);
  const payloads = parseJsonOrJsonLines(text) as Array<ReadsbHistoryPayload | ReadsbAircraft>;
  let recordsParsed = 0;
  let privateJetMatches = 0;

  for (const payload of payloads) {
    const rows = getSnapshotRows(payload);
    const timestamp = parseHistoryTimestamp("now" in payload ? payload.now : undefined, date);
    recordsParsed += rows.length;

    for (const row of rows) {
      const aircraftType = (row.aircraftType ?? row.t ?? row.type ?? "").trim().toUpperCase();
      if (!isLikelyPrivateJetType(aircraftType)) continue;
      privateJetMatches += 1;

      const icaoHex = (row.icaoHex ?? row.icao24 ?? row.hex ?? "").trim().toUpperCase();
      const lat = Number(row.lat);
      const lon = Number(row.lon);
      if (!icaoHex || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;

      mergeTrackPosition(tracks, {
        icaoHex,
        registration: (row.registration ?? row.r ?? null)?.trim() || null,
        aircraftType,
        timestamp,
        position: { lat, lon }
      });
    }
  }

  return { recordsParsed, privateJetMatches };
}

function mergeTracePayload(tracks: Map<string, AircraftTrack>, date: Date, name: string, archivePayload: Buffer) {
  const payload = JSON.parse(decodeArchiveJsonBody(name, archivePayload)) as ReadsbTracePayload;
  const recordsParsed = 1;
  const aircraftType = (payload.aircraftType ?? payload.t ?? payload.type ?? "").trim().toUpperCase();
  if (!isLikelyPrivateJetType(aircraftType)) return { recordsParsed, privateJetMatches: 0 };

  const icaoHex = (payload.icao ?? payload.hex ?? "").trim().toUpperCase();
  if (!icaoHex) return { recordsParsed, privateJetMatches: 1 };

  const baseTimestamp = parseHistoryTimestamp(payload.timestamp, date);
  const points = Array.isArray(payload.trace) ? payload.trace : [];

  for (const point of points) {
    if (!Array.isArray(point)) continue;
    const offsetSeconds = Number(point[0]);
    const lat = Number(point[1]);
    const lon = Number(point[2]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

    mergeTrackPosition(tracks, {
      icaoHex,
      registration: (payload.registration ?? payload.r ?? null)?.trim() || null,
      aircraftType,
      timestamp: Number.isFinite(offsetSeconds) ? new Date(baseTimestamp.getTime() + offsetSeconds * 1000) : baseTimestamp,
      position: { lat, lon }
    });
  }

  return { recordsParsed, privateJetMatches: 1 };
}

function mergeTrackPosition(
  tracks: Map<string, AircraftTrack>,
  point: {
    icaoHex: string;
    registration: string | null;
    aircraftType: string;
    timestamp: Date;
    position: GeoPosition;
  }
) {
  const existing = tracks.get(point.icaoHex);
  if (!existing) {
    tracks.set(point.icaoHex, {
      icaoHex: point.icaoHex,
      registration: point.registration,
      aircraftType: point.aircraftType,
      firstAt: point.timestamp,
      lastAt: point.timestamp,
      firstPosition: point.position,
      lastPosition: point.position,
      distanceKm: 0
    });
    return;
  }

  if (!existing.registration) existing.registration = point.registration;
  if (point.timestamp.getTime() >= existing.lastAt.getTime()) {
    existing.distanceKm += estimateCoordinateDistanceKm(existing.lastPosition, point.position);
    existing.lastAt = point.timestamp;
    existing.lastPosition = point.position;
  }
  if (point.timestamp.getTime() < existing.firstAt.getTime()) {
    existing.firstAt = point.timestamp;
    existing.firstPosition = point.position;
  }
}

function trackToRecord(track: AircraftTrack, date: Date): NormalizedFlightRecord {
  const dateKey = formatDateKey(date);
  const distanceKm = Math.max(25, Math.round(track.distanceKm || estimateCoordinateDistanceKm(track.firstPosition, track.lastPosition)));
  const origin = nearestAirport(track.firstPosition);
  const destination = nearestAirport(track.lastPosition);
  const confidenceValues = [origin?.confidence, destination?.confidence].filter((value): value is number => typeof value === "number");

  return {
    icaoHex: track.icaoHex,
    registration: track.registration,
    aircraftType: track.aircraftType,
    verifiedPublicEntity: null,
    originAirport: origin?.ident ?? "UNKNOWN",
    destinationAirport: destination?.ident ?? "UNKNOWN",
    originAirportIdent: origin?.ident ?? null,
    destinationAirportIdent: destination?.ident ?? null,
    originCountryCode: origin?.countryCode ?? null,
    destinationCountryCode: destination?.countryCode ?? null,
    attributionSource: origin || destination ? "OurAirports coordinate match" : null,
    attributionConfidence: confidenceValues.length ? Math.min(...confidenceValues) : null,
    departureAt: track.firstAt,
    arrivalAt: track.lastAt.getTime() > track.firstAt.getTime() ? track.lastAt : null,
    distanceKm,
    dataSource: ADSB_LOL_DATA_SOURCE,
    sourceRecordId: `adsb-lol-history-${dateKey}-${track.icaoHex}-${track.aircraftType}`,
    sourceAttribution: `ADSB.lol globe_history_${date.getUTCFullYear()} GitHub archive for ${dateKey}`
  };
}

function nearestAirport(position: GeoPosition) {
  const nearest = findNearestKnownAirport(position.lat, position.lon);
  return nearest;
}

function parseTarHeader(header: Buffer): TarEntry {
  const name = readTarString(header, 0, 100);
  const prefix = readTarString(header, 345, 155);
  const sizeRaw = readTarString(header, 124, 12).replace(/\0/g, "").trim();
  const size = Number.parseInt(sizeRaw || "0", 8);
  if (!Number.isFinite(size)) throw new Error(`Invalid tar entry size for ${name}`);
  return { name: prefix ? `${prefix}/${name}` : name, size };
}

function readTarString(buffer: Buffer, start: number, length: number) {
  return buffer.subarray(start, start + length).toString("utf8").replace(/\0.*$/, "");
}

function isEmptyTarBlock(block: Buffer) {
  return block.every((byte) => byte === 0);
}

function getArchiveFileKind(name: string): ArchiveFileKind | null {
  const normalized = name.replace(/\\/g, "/").replace(/^\.\//, "").toLowerCase();
  if (!/\.json(\.gz)?$/i.test(normalized)) return null;
  if (normalized.startsWith("traces/") || normalized.includes("/traces/")) return "trace";
  if (/(^|\/)history_[^/]+\.json\.gz$/i.test(normalized)) return "snapshot";
  if (normalized.startsWith("globe_history/") || normalized.includes("/globe_history/")) return "snapshot";
  return null;
}

function decodeArchiveJsonBody(name: string, body: Buffer) {
  if (name.toLowerCase().endsWith(".gz") || isGzipBuffer(body)) return gunzipSync(body).toString("utf8");
  return body.toString("utf8");
}

function isGzipBuffer(body: Buffer) {
  return body.length >= 2 && body[0] === 0x1f && body[1] === 0x8b;
}

function getTopLevelEntry(name: string) {
  return name.replace(/\\/g, "/").replace(/^\.\//, "").split("/")[0] || ".";
}

function formatTopLevelEntries(entries: Record<string, number>) {
  return Object.entries(entries)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => `${name}:${count}`)
    .join(", ");
}

function parseJsonOrJsonLines(text: string): unknown[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return trimmed
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  }
}

function getSnapshotRows(payload: ReadsbHistoryPayload | ReadsbAircraft): ReadsbAircraft[] {
  if ("aircraft" in payload && Array.isArray(payload.aircraft)) return payload.aircraft;
  if ("ac" in payload && Array.isArray(payload.ac)) return payload.ac;
  if ("hex" in payload || "icaoHex" in payload || "icao24" in payload) return [payload as ReadsbAircraft];
  return [];
}

function parseHistoryTimestamp(value: number | undefined, fallbackDate: Date) {
  if (Number.isFinite(value)) {
    const timestamp = Number(value);
    return new Date(timestamp > 1_000_000_000_000 ? timestamp : timestamp * 1000);
  }
  return new Date(Date.UTC(fallbackDate.getUTCFullYear(), fallbackDate.getUTCMonth(), fallbackDate.getUTCDate(), 12, 0, 0));
}

async function logUnavailableDate(dateKey: string) {
  await upsertProcessedArchiveDate({
    provider: ADSB_LOL_DATA_SOURCE,
    dateKey,
    status: ImportStatuses.PARTIAL,
    recordsImported: 0,
    error: `ADSB.lol historical archive unavailable for ${dateKey}; skipped.`
  });
  await prisma.importLog.create({
    data: {
      provider: ADSB_LOL_DATA_SOURCE,
      status: ImportStatuses.PARTIAL,
      recordsImported: 0,
      errors: `ADSB.lol historical archive unavailable for ${dateKey}; skipped.`
    }
  });
}

function validateDateRange(from: Date, to: Date) {
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) throw new Error("Historical import dates must be valid YYYY-MM-DD values.");
  if (from.getTime() > to.getTime()) throw new Error("--from must be before or equal to --to.");
}

function enumerateDates(from: Date, to: Date) {
  const dates: Date[] = [];
  const current = startOfUtcDay(from);
  const end = startOfUtcDay(to);
  while (current.getTime() <= end.getTime()) {
    dates.push(new Date(current));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return dates;
}

function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function formatReleaseDate(date: Date) {
  return `${date.getUTCFullYear()}.${String(date.getUTCMonth() + 1).padStart(2, "0")}.${String(date.getUTCDate()).padStart(2, "0")}`;
}

export function formatDateKey(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GiB`;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
  return `${Math.round(bytes / 1024).toLocaleString()} KiB`;
}
