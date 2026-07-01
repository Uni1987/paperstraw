import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  AISSTREAM_ENDPOINT,
  CRUISE_AIS_SOURCE,
  getAisStreamApiKey,
  getAisStreamLogLevel,
  getCruiseRegionConfig,
  isAisStreamIngestionEnabled
} from "@/lib/cruises/config";
import { estimateAndStoreCruiseDailyEmissions, haversineNm } from "@/lib/cruises/estimation";

type AisMessage = {
  MessageType?: string;
  MetaData?: {
    MMSI?: number | string;
    ShipName?: string;
    latitude?: number;
    longitude?: number;
    time_utc?: string;
  };
  Message?: {
    PositionReport?: Record<string, unknown>;
    ShipStaticData?: Record<string, unknown>;
    StandardClassBPositionReport?: Record<string, unknown>;
  };
};

type PersistedPosition = {
  persisted: boolean;
  shipId?: string;
  reason?: string;
};

type NormalizedPosition = {
  mmsi: string;
  imo: string | null;
  shipName: string;
  shipType: string | null;
  latitude: number;
  longitude: number;
  speedOverGround: number | null;
  courseOverGround: number | null;
  heading: number | null;
  navigationalStatus: string | null;
  destination: string | null;
  timestamp: Date;
  dedupeKey: string;
};

export type CruiseShipIdentityInput = {
  imo: string | null;
  mmsi: string | null;
  name?: string | null;
  shipType?: string | null;
  destination?: string | null;
  length?: number | null;
  width?: number | null;
  source: string;
};

export type CruiseShipIdentityRecord = {
  id: string;
  imo: string | null;
  mmsi: string | null;
  shipType: string | null;
};

export type CruiseShipIdentityRepository = {
  findByImo: (imo: string) => Promise<CruiseShipIdentityRecord | null>;
  findByMmsi: (mmsi: string) => Promise<CruiseShipIdentityRecord | null>;
  create: (data: CruiseShipIdentityInput & { name: string }) => Promise<{ id: string }>;
  update: (id: string, data: Partial<CruiseShipIdentityInput>) => Promise<{ id: string }>;
};

type CruiseShipIdentityResolution = {
  ship: { id: string };
  action: "created" | "updated";
  conflicts: string[];
};

type AisWorkerStats = {
  connected: boolean;
  shipsTracked: Set<string>;
  messagesReceived: number;
  positionsStored: number;
  filteredMessages: number;
  identityConflicts: number;
  shipsCreated: number;
  shipsUpdated: number;
  reconnectCount: number;
  lastConnectedAt: Date | null;
  lastError: string | null;
};

const MAX_RECONNECT_DELAY_MS = 120000;
const MAX_ALLOWED_SPEED_KNOTS = 45;
const MAX_IMPLIED_SPEED_KNOTS = 70;
const DUPLICATE_CACHE_TTL_MS = 10 * 60 * 1000;
const LOG_INTERVAL_MS = 60 * 1000;

const recentMessageKeys = new Map<string, number>();
const stats: AisWorkerStats = {
  connected: false,
  shipsTracked: new Set(),
  messagesReceived: 0,
  positionsStored: 0,
  filteredMessages: 0,
  identityConflicts: 0,
  shipsCreated: 0,
  shipsUpdated: 0,
  reconnectCount: 0,
  lastConnectedAt: null,
  lastError: null
};

export async function runAisStreamWorker() {
  if (!isAisStreamIngestionEnabled()) {
    console.log("AISStream ingestion is disabled. Set ENABLE_AISSTREAM_INGESTION=true to run it.");
    return;
  }

  const apiKey = getAisStreamApiKey();
  if (!apiKey) {
    throw new Error("Missing AISSTREAM_API_KEY.");
  }

  const regionConfig = getCruiseRegionConfig();
  const regions = regionConfig.regions;
  const sourceLabel = regionConfig.source === "default" ? "default cruise corridors" : "AISSTREAM_BOUNDING_BOXES override";
  logInfo(`AISStream worker starting with ${regions.length} configured region(s) using ${sourceLabel}: ${regions.map((region) => region.name).join(", ")}`);
  startStatsLogger();
  await connectForever(apiKey, regions.map((region) => region.boundingBox));
}

async function connectForever(apiKey: string, boundingBoxes: Array<[[number, number], [number, number]]>) {
  let reconnectAttempt = 0;

  while (true) {
    await connectOnce(apiKey, boundingBoxes);

    reconnectAttempt += 1;
    stats.reconnectCount += 1;
    stats.connected = false;
    const delayMs = Math.min(MAX_RECONNECT_DELAY_MS, 2000 * 2 ** Math.min(reconnectAttempt, 8));
    logInfo(`AISStream disconnected. Reconnect attempt ${reconnectAttempt}; waiting ${Math.round(delayMs / 1000)}s.`);
    await sleep(delayMs);
  }
}

async function connectOnce(apiKey: string, boundingBoxes: Array<[[number, number], [number, number]]>) {
  await new Promise<void>((resolve) => {
    const socket = new WebSocket(AISSTREAM_ENDPOINT);

    socket.addEventListener("open", () => {
      stats.connected = true;
      stats.lastConnectedAt = new Date();
      stats.lastError = null;
      socket.send(
        JSON.stringify({
          APIKey: apiKey,
          BoundingBoxes: boundingBoxes,
          FilterMessageTypes: ["PositionReport", "StandardClassBPositionReport", "ShipStaticData"]
        })
      );
      logInfo(`AISStream connected. Subscribed to ${boundingBoxes.length} bounding box(es).`);
    });

    socket.addEventListener("message", (event) => {
      void handleSocketMessage(event).catch((error) => {
        stats.filteredMessages += 1;
        stats.lastError = error instanceof Error ? error.message : "Unknown AIS message error";
        logError("AISStream message failed", error);
      });
    });

    socket.addEventListener("close", () => {
      stats.connected = false;
      resolve();
    });

    socket.addEventListener("error", (error) => {
      stats.connected = false;
      stats.lastError = "AISStream socket error";
      logError("AISStream socket error", error);
      socket.close();
    });
  });
}

async function handleSocketMessage(event: MessageEvent) {
  stats.messagesReceived += 1;
  const payloadText = await messageDataToString(event);
  if (!payloadText) {
    stats.filteredMessages += 1;
    logWarn(`AISStream message skipped: unreadable payload type=${describePayloadType(event)}`);
    return;
  }

  let payload: AisMessage;
  try {
    payload = JSON.parse(payloadText) as AisMessage;
  } catch {
    stats.filteredMessages += 1;
    logWarn(`AISStream message skipped: invalid JSON type=${describePayloadType(event)} preview="${previewPayload(payloadText)}"`);
    return;
  }

  const result = await handleAisMessage(payload);
  if (!result.persisted) {
    stats.filteredMessages += 1;
    logDebug(`AIS message filtered${result.reason ? `: ${result.reason}` : ""}`);
    return;
  }

  stats.positionsStored += 1;
  if (result.shipId) {
    stats.shipsTracked.add(result.shipId);
    await estimateAndStoreCruiseDailyEmissions(result.shipId);
  }
}

export async function messageDataToString(input: unknown): Promise<string | null> {
  if (typeof input === "string") return input;
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(input)) return input.toString("utf8");
  if (input instanceof ArrayBuffer) return new TextDecoder().decode(input);
  if (ArrayBuffer.isView(input)) return new TextDecoder().decode(input);
  if (isBlobLike(input)) return input.text();
  if (isDataWrapper(input)) return messageDataToString(input.data);
  return null;
}

export async function handleAisMessage(payload: AisMessage): Promise<PersistedPosition> {
  const messageType = payload.MessageType ?? "";
  if (messageType === "ShipStaticData") {
    const shipId = await upsertShipFromStaticData(payload);
    if (shipId) stats.shipsTracked.add(shipId);
    return { persisted: false, shipId: shipId ?? undefined, reason: "static-voyage-only" };
  }

  const position = extractPosition(payload);
  if (!position) return { persisted: false, reason: "corrupt-or-incomplete-position" };
  const qualityIssue = getPositionQualityIssue(position);
  if (qualityIssue) return { persisted: false, reason: qualityIssue };
  if (isDuplicatePosition(position.dedupeKey)) return { persisted: false, reason: "duplicate-message" };

  const knownShip = await findKnownCruiseShipByIdentity(position);
  if (!knownShip && !looksLikePassengerShip(position.shipType)) {
    return { persisted: false, reason: "not-passenger-or-known-cruise-ship" };
  }

  const identity = await resolveCruiseShipIdentity(defaultCruiseShipIdentityRepository, identityInputFromPosition(position));
  recordIdentityResolution(identity);

  if (identity.ship) {
    const duplicateOrJumpIssue = await getDatabasePositionIssue(identity.ship.id, position);
    if (duplicateOrJumpIssue) return { persisted: false, reason: duplicateOrJumpIssue };
  }

  await prisma.cruisePosition.create({
    data: {
      shipId: identity.ship.id,
      mmsi: position.mmsi,
      latitude: position.latitude,
      longitude: position.longitude,
      speedOverGround: position.speedOverGround,
      courseOverGround: position.courseOverGround,
      heading: position.heading,
      navigationalStatus: position.navigationalStatus,
      destination: position.destination,
      timestamp: position.timestamp,
      rawPayload: payload as Prisma.InputJsonValue
    }
  }).catch((error: unknown) => {
    if (isUniqueConstraintError(error)) return null;
    throw error;
  });

  return { persisted: true, shipId: identity.ship.id };
}

async function upsertShipFromStaticData(payload: AisMessage) {
  const staticData = payload.Message?.ShipStaticData ?? {};
  const mmsi = normalizeIdentifier(readValue(staticData, "UserID", "MMSI") ?? payload.MetaData?.MMSI);
  const imo = normalizeIdentifier(readValue(staticData, "ImoNumber", "IMO"));
  if (!mmsi && !imo) return null;

  const shipType = stringifyOptional(readValue(staticData, "Type", "ShipType"));
  const existing = await findKnownCruiseShipByIdentity({ mmsi: mmsi ?? "", imo, shipType });
  if (!existing && !looksLikePassengerShip(shipType)) return null;

  const name = String(readValue(staticData, "Name", "ShipName") ?? payload.MetaData?.ShipName ?? "").trim();
  const destination = stringifyOptional(readValue(staticData, "Destination"));
  const dimensions = extractDimensions(staticData);

  const data: CruiseShipIdentityInput = {
    imo,
    mmsi,
    name: name || undefined,
    shipType,
    destination,
    length: dimensions.length,
    width: dimensions.width,
    source: CRUISE_AIS_SOURCE
  };

  const identity = await resolveCruiseShipIdentity(defaultCruiseShipIdentityRepository, data);
  recordIdentityResolution(identity);

  logDebug(`AIS static/voyage data updated for ${name || mmsi || imo}.`);
  return identity.ship.id;
}

export async function resolveCruiseShipIdentity(
  repository: CruiseShipIdentityRepository,
  input: CruiseShipIdentityInput
): Promise<CruiseShipIdentityResolution> {
  const imo = isValidImo(input.imo) ? input.imo : null;
  const mmsi = isValidMmsi(input.mmsi) ? input.mmsi : null;
  const conflicts: string[] = [];

  if (imo) {
    const byImo = await repository.findByImo(imo);
    if (byImo) {
      const update = await buildSafeIdentityUpdate(repository, byImo, { ...input, imo, mmsi }, conflicts);
      return {
        ship: await safeUpdateCruiseShip(repository, byImo.id, update, conflicts),
        action: "updated",
        conflicts
      };
    }
  }

  if (mmsi) {
    const byMmsi = await repository.findByMmsi(mmsi);
    if (byMmsi) {
      const update = await buildSafeIdentityUpdate(repository, byMmsi, { ...input, imo, mmsi }, conflicts);
      return {
        ship: await safeUpdateCruiseShip(repository, byMmsi.id, update, conflicts),
        action: "updated",
        conflicts
      };
    }
  }

  return {
    ship: await safeCreateCruiseShip(repository, {
      ...input,
      imo,
      mmsi,
      name: input.name?.trim() || fallbackShipName(imo, mmsi)
    }),
    action: "created",
    conflicts
  };
}

async function buildSafeIdentityUpdate(
  repository: CruiseShipIdentityRepository,
  target: CruiseShipIdentityRecord,
  input: CruiseShipIdentityInput,
  conflicts: string[]
) {
  const update: Partial<CruiseShipIdentityInput> = compactUpdate({
    name: input.name?.trim() || undefined,
    shipType: input.shipType,
    destination: input.destination,
    length: input.length,
    width: input.width,
    source: input.source
  });

  if (input.imo && target.imo !== input.imo) {
    const owner = await repository.findByImo(input.imo);
    if (owner && owner.id !== target.id) {
      conflicts.push(`IMO ${input.imo} already belongs to ship ${owner.id}; keeping ship ${target.id} unchanged`);
    } else {
      update.imo = input.imo;
    }
  }

  if (input.mmsi && target.mmsi !== input.mmsi) {
    const owner = await repository.findByMmsi(input.mmsi);
    if (owner && owner.id !== target.id) {
      conflicts.push(`MMSI ${input.mmsi} already belongs to ship ${owner.id}; keeping ship ${target.id} unchanged`);
    } else {
      update.mmsi = input.mmsi;
    }
  }

  return update;
}

async function safeUpdateCruiseShip(
  repository: CruiseShipIdentityRepository,
  id: string,
  update: Partial<CruiseShipIdentityInput>,
  conflicts: string[]
) {
  try {
    return await repository.update(id, update);
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      conflicts.push(`Unique identity conflict while updating ship ${id}; skipped conflicting metadata`);
      return { id };
    }
    throw error;
  }
}

async function safeCreateCruiseShip(repository: CruiseShipIdentityRepository, data: CruiseShipIdentityInput & { name: string }) {
  try {
    return await repository.create(data);
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;
    const existingByImo = data.imo ? await repository.findByImo(data.imo) : null;
    const existingByMmsi = data.mmsi ? await repository.findByMmsi(data.mmsi) : null;
    const existing = existingByImo ?? existingByMmsi;
    if (existing) return { id: existing.id };
    throw error;
  }
}

async function findKnownCruiseShipByIdentity(position: Pick<NormalizedPosition, "mmsi" | "imo" | "shipType">) {
  const imo = isValidImo(position.imo) ? position.imo : null;
  const mmsi = isValidMmsi(position.mmsi) ? position.mmsi : null;
  const ship = (imo ? await defaultCruiseShipIdentityRepository.findByImo(imo) : null) ?? (mmsi ? await defaultCruiseShipIdentityRepository.findByMmsi(mmsi) : null);
  if (!ship) return null;
  if (looksLikePassengerShip(ship.shipType) || looksLikePassengerShip(position.shipType)) return ship;
  return ship.imo || ship.mmsi ? ship : null;
}

function identityInputFromPosition(position: NormalizedPosition): CruiseShipIdentityInput {
  return {
    imo: position.imo,
    mmsi: position.mmsi,
    name: position.shipName || undefined,
    shipType: position.shipType ?? "Passenger ship",
    destination: position.destination,
    source: CRUISE_AIS_SOURCE
  };
}

const defaultCruiseShipIdentityRepository: CruiseShipIdentityRepository = {
  findByImo: (imo) =>
    prisma.cruiseShip.findUnique({
      where: { imo },
      select: { id: true, imo: true, mmsi: true, shipType: true }
    }),
  findByMmsi: (mmsi) =>
    prisma.cruiseShip.findUnique({
      where: { mmsi },
      select: { id: true, imo: true, mmsi: true, shipType: true }
    }),
  create: (data) =>
    prisma.cruiseShip.create({
      data,
      select: { id: true }
    }),
  update: (id, data) =>
    prisma.cruiseShip.update({
      where: { id },
      data: compactUpdate(data) as Prisma.CruiseShipUpdateInput,
      select: { id: true }
    })
};

function recordIdentityResolution(identity: CruiseShipIdentityResolution) {
  if (identity.action === "created") stats.shipsCreated += 1;
  if (identity.action === "updated") stats.shipsUpdated += 1;
  if (identity.conflicts.length) {
    stats.identityConflicts += identity.conflicts.length;
    for (const conflict of identity.conflicts) logWarn(`AIS identity conflict: ${conflict}`);
  }
}

function extractPosition(payload: AisMessage): NormalizedPosition | null {
  const report = payload.Message?.PositionReport ?? payload.Message?.StandardClassBPositionReport;
  if (!report) return null;

  const latitude = Number(readValue(report, "Latitude", "latitude") ?? payload.MetaData?.latitude);
  const longitude = Number(readValue(report, "Longitude", "longitude") ?? payload.MetaData?.longitude);
  const mmsi = normalizeIdentifier(readValue(report, "UserID", "MMSI") ?? payload.MetaData?.MMSI);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !mmsi) return null;

  const timestamp = normalizeTimestamp(payload.MetaData?.time_utc) ?? new Date();
  const speedOverGround = optionalNumber(readValue(report, "Sog", "SpeedOverGround"));
  const courseOverGround = optionalNumber(readValue(report, "Cog", "CourseOverGround"));
  const heading = optionalInteger(readValue(report, "TrueHeading", "Heading"));
  const navigationalStatus = stringifyOptional(readValue(report, "NavigationalStatus"));
  const shipType = stringifyOptional(readValue(report, "Type", "ShipType"));
  const shipName = payload.MetaData?.ShipName?.trim() ?? "";
  const destination = stringifyOptional(readValue(report, "Destination"));
  const imo = normalizeIdentifier(readValue(report, "ImoNumber", "IMO"));
  const dedupeKey = [mmsi, timestamp.toISOString(), latitude.toFixed(4), longitude.toFixed(4)].join(":");

  return {
    mmsi,
    imo,
    shipName,
    shipType,
    latitude,
    longitude,
    speedOverGround,
    courseOverGround,
    heading,
    navigationalStatus,
    destination,
    timestamp,
    dedupeKey
  };
}

export function getPositionQualityIssue(position: Pick<NormalizedPosition, "latitude" | "longitude" | "speedOverGround" | "timestamp">) {
  if (!Number.isFinite(position.latitude) || !Number.isFinite(position.longitude)) return "invalid-coordinate";
  if (position.latitude < -90 || position.latitude > 90 || position.longitude < -180 || position.longitude > 180) {
    return "invalid-coordinate";
  }
  if (position.latitude === 0 && position.longitude === 0) return "zero-island-coordinate";
  if (position.speedOverGround !== null && position.speedOverGround > MAX_ALLOWED_SPEED_KNOTS) return "speed-over-45-knots";
  if (Number.isNaN(position.timestamp.getTime())) return "invalid-timestamp";
  return null;
}

async function getDatabasePositionIssue(shipId: string, position: NormalizedPosition) {
  const previous = await prisma.cruisePosition.findFirst({
    where: { shipId },
    orderBy: { timestamp: "desc" },
    select: { latitude: true, longitude: true, timestamp: true }
  });
  if (!previous) return null;

  const previousLatitude = Number(previous.latitude);
  const previousLongitude = Number(previous.longitude);
  if (previousLatitude.toFixed(5) === position.latitude.toFixed(5) && previousLongitude.toFixed(5) === position.longitude.toFixed(5)) {
    return "duplicate-coordinate";
  }

  const deltaHours = Math.abs(position.timestamp.getTime() - previous.timestamp.getTime()) / 3600000;
  if (deltaHours <= 0) return "non-increasing-timestamp";
  if (deltaHours <= 12) {
    const distanceNm = haversineNm(
      { latitude: previousLatitude, longitude: previousLongitude },
      { latitude: position.latitude, longitude: position.longitude }
    );
    const impliedSpeed = distanceNm / deltaHours;
    if (impliedSpeed > MAX_IMPLIED_SPEED_KNOTS) return "impossible-position-jump";
  }

  return null;
}

function extractDimensions(staticData: Record<string, unknown>) {
  const dimension = readValue(staticData, "Dimension") as Record<string, unknown> | undefined;
  const a = optionalNumber(dimension ? readValue(dimension, "A") : readValue(staticData, "DimensionA"));
  const b = optionalNumber(dimension ? readValue(dimension, "B") : readValue(staticData, "DimensionB"));
  const c = optionalNumber(dimension ? readValue(dimension, "C") : readValue(staticData, "DimensionC"));
  const d = optionalNumber(dimension ? readValue(dimension, "D") : readValue(staticData, "DimensionD"));
  return {
    length: a !== null && b !== null ? a + b : null,
    width: c !== null && d !== null ? c + d : null
  };
}

function looksLikePassengerShip(value: unknown) {
  if (value === null || value === undefined || value === "") return false;
  if (typeof value === "number") return value >= 60 && value <= 69;
  const text = String(value).toLowerCase();
  const numeric = Number(text);
  if (Number.isFinite(numeric)) return numeric >= 60 && numeric <= 69;
  return text.includes("passenger") || text.includes("cruise");
}

function isValidImo(value: string | null | undefined): value is string {
  return typeof value === "string" && /^\d{7}$/.test(value) && value !== "0000000";
}

function isValidMmsi(value: string | null | undefined): value is string {
  return typeof value === "string" && /^\d{9}$/.test(value) && value !== "000000000";
}

function fallbackShipName(imo: string | null, mmsi: string | null) {
  if (imo) return `IMO ${imo}`;
  if (mmsi) return `MMSI ${mmsi}`;
  return "Unknown cruise ship";
}

function isDuplicatePosition(key: string) {
  const now = Date.now();
  for (const [existingKey, timestamp] of recentMessageKeys.entries()) {
    if (now - timestamp > DUPLICATE_CACHE_TTL_MS) recentMessageKeys.delete(existingKey);
  }
  if (recentMessageKeys.has(key)) return true;
  recentMessageKeys.set(key, now);
  return false;
}

function startStatsLogger() {
  const interval = setInterval(() => {
    logInfo(
      [
        "AISStream status",
        `connected=${stats.connected}`,
        `shipsTracked=${stats.shipsTracked.size}`,
        `messagesReceived=${stats.messagesReceived}`,
        `positionsStored=${stats.positionsStored}`,
        `filteredMessages=${stats.filteredMessages}`,
        `identityConflicts=${stats.identityConflicts}`,
        `shipsCreated=${stats.shipsCreated}`,
        `shipsUpdated=${stats.shipsUpdated}`,
        `reconnectCount=${stats.reconnectCount}`,
        `lastConnectedAt=${stats.lastConnectedAt?.toISOString() ?? "never"}`,
        `lastError=${stats.lastError ?? "none"}`
      ].join(" | ")
    );
  }, LOG_INTERVAL_MS);
  interval.unref?.();
}

function readValue(object: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    if (object[key] !== undefined) return object[key];
    const match = Object.keys(object).find((candidate) => candidate.toLowerCase() === key.toLowerCase());
    if (match) return object[match];
  }
  return undefined;
}

function compactUpdate<T extends Record<string, unknown>>(input: T) {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== null && value !== undefined && value !== "")) as Partial<T>;
}

function optionalNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function optionalInteger(value: unknown) {
  const number = optionalNumber(value);
  return number === null ? null : Math.trunc(number);
}

function stringifyOptional(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  return String(value).trim() || null;
}

function normalizeIdentifier(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  return String(value).replace(/[^\d]/g, "") || null;
}

function normalizeTimestamp(value: unknown) {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function isUniqueConstraintError(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "P2002";
}

function isBlobLike(value: unknown): value is { text: () => Promise<string> } {
  return typeof value === "object" && value !== null && "text" in value && typeof (value as { text?: unknown }).text === "function";
}

function isDataWrapper(value: unknown): value is { data: unknown } {
  return typeof value === "object" && value !== null && "data" in value;
}

function describePayloadType(value: unknown): string {
  const data = isDataWrapper(value) ? value.data : value;
  if (typeof data === "string") return "string";
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(data)) return "Buffer";
  if (data instanceof ArrayBuffer) return "ArrayBuffer";
  if (ArrayBuffer.isView(data)) return data.constructor.name;
  if (isBlobLike(data)) return data.constructor?.name ?? "Blob";
  if (data === null) return "null";
  return typeof data;
}

function previewPayload(value: string) {
  return value.slice(0, 200).replace(/\s+/g, " ").trim();
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function logDebug(message: string) {
  if (getAisStreamLogLevel() === "debug") console.log(message);
}

function logInfo(message: string) {
  const level = getAisStreamLogLevel();
  if (level === "debug" || level === "info") console.log(message);
}

function logWarn(message: string) {
  console.warn(message);
}

function logError(message: string, error: unknown) {
  const level = getAisStreamLogLevel();
  if (level === "error" || level === "warn" || level === "info" || level === "debug") {
    console.error(message, error);
  }
}
