import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/database/cruises";
import {
  AISSTREAM_ENDPOINT,
  CRUISE_AIS_SOURCE,
  type CruiseAisIngestMode,
  getAisStreamApiKey,
  getAisStreamLogLevel,
  getCruiseAisIngestMode,
  getCruiseRegionConfig,
  isAisStreamIngestionEnabled
} from "@/lib/cruises/config";
import { estimateAndStoreCruiseDailyEmissions, haversineNm } from "@/lib/cruises/estimation";
import {
  AISSTREAM_MMSI_FILTER_LIMIT,
  buildVerifiedAisAllowlistReport,
  getVerifiedAisSubscriptionMmsis,
  splitMmsiBatches,
  type CoveragePublicEligibleShip,
  type CoverageRegistryEntry,
  type VerifiedAisAllowlistReport
} from "@/lib/cruises/registryCoverage";

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
  mode: CruiseAisIngestMode;
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

export type AisConnectionType = "discovery" | "verified-global";

export type AisConnectionConfig = {
  label: string;
  type: AisConnectionType;
  boundingBoxes?: Array<[[number, number], [number, number]]>;
  mmsis?: string[];
};

export const AIS_DIAGNOSTIC_PROFILES = [
  "discovery",
  "verified-global",
  "hybrid-discovery-first",
  "hybrid-verified-first",
  "hybrid-one-batch",
  "hybrid-two-batches",
  "hybrid-three-batches"
] as const;

export type AisDiagnosticProfile = (typeof AIS_DIAGNOSTIC_PROFILES)[number];

type AisStartupOptions = {
  mode?: string | null;
  maxRuntimeMs?: number | null;
  diagnosticProfile?: string | null;
  discoveryRegionLimit?: number | null;
  connectionStaggerMs?: number | null;
  verifiedBatchLimit?: number | null;
};

type AisConnectionStats = {
  label: string;
  type: AisConnectionType;
  connected: boolean;
  unhealthy: boolean;
  messagesReceived: number;
  positionsStored: number;
  filteredMessages: number;
  reconnectCount: number;
  consecutiveFailures: number;
  startedAt: Date | null;
  lastMessageAt: Date | null;
  lastError: string | null;
};

type AisMessageContext = {
  label: string;
  type: AisConnectionType;
};

const MAX_RECONNECT_DELAY_MS = 10 * 60 * 1000;
const RAPID_FAILURE_BACKOFF_MS = 60000;
const RAPID_FAILURE_WINDOW_MS = 1000;
const CONCURRENT_CONNECTION_LIMIT_WARNING_FAILURES = 3;
const MAX_ALLOWED_SPEED_KNOTS = 45;
const MAX_IMPLIED_SPEED_KNOTS = 70;
const DUPLICATE_CACHE_TTL_MS = 10 * 60 * 1000;
const LOG_INTERVAL_MS = 60 * 1000;
const DEFAULT_CONNECTION_STAGGER_MS = 1500;
export const AISSTREAM_FILTER_MESSAGE_TYPES = ["PositionReport", "StandardClassBPositionReport", "ShipStaticData"] as const;
export const VERIFIED_GLOBAL_BOUNDING_BOX: [[number, number], [number, number]] = [
  [-90, -180],
  [90, 180]
];

const recentMessageKeys = new Map<string, number>();
const degradedWarnings = new Set<string>();
const connectionLimitWarnings = new Set<string>();
const stats: AisWorkerStats = {
  mode: "discovery",
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
const connectionStats = new Map<string, AisConnectionStats>();

export async function runAisStreamWorker(options: AisStartupOptions = {}) {
  if (!isAisStreamIngestionEnabled()) {
    console.log("AISStream ingestion is disabled. Set ENABLE_AISSTREAM_INGESTION=true to run it.");
    return;
  }

  const apiKey = getAisStreamApiKey();
  if (!apiKey) {
    throw new Error("Missing AISSTREAM_API_KEY.");
  }

  const diagnosticProfile = parseAisDiagnosticProfile(options.diagnosticProfile);
  const mode = diagnosticProfile ? getModeForDiagnosticProfile(diagnosticProfile) : getCruiseAisIngestMode(options.mode);
  stats.mode = mode;
  logInfo(
    [
      `CRUISE AIS INGESTION MODE: ${mode}`,
      `Diagnostic profile: ${diagnosticProfile ?? "none"}`,
      `Environment target: ${process.env.CRUISE_AIS_ENVIRONMENT_TARGET?.trim() || "development / cruises-dev"}`,
      "Production deployment: not configured"
    ].join("\n")
  );

  const connections = await buildAisConnectionConfigs(mode, diagnosticProfile, options.discoveryRegionLimit ?? null, options.verifiedBatchLimit ?? null);
  if (!connections.length) {
    logWarn("No AISStream connections configured; worker stopped safely.");
    return;
  }

  for (const connection of connections) connectionStats.set(connection.label, createConnectionStats(connection));
  logInfo(`AISStream worker starting ${connections.length} connection(s): ${connections.map((connection) => connection.label).join(", ")}`);
  startStatsLogger();
  const controller = new AbortController();
  const runtimeTimer =
    options.maxRuntimeMs && options.maxRuntimeMs > 0
      ? setTimeout(() => {
          logInfo(`AISStream max runtime reached (${options.maxRuntimeMs}ms); stopping worker cleanly.`);
          controller.abort();
        }, options.maxRuntimeMs)
      : null;
  runtimeTimer?.unref?.();
  const staggerMs = options.connectionStaggerMs ?? getConnectionStaggerMs();
  try {
    await Promise.all(connections.map((connection, index) => startConnectionWithStagger(apiKey, connection, controller.signal, index, staggerMs)));
  } finally {
    if (runtimeTimer) clearTimeout(runtimeTimer);
  }
}

async function startConnectionWithStagger(apiKey: string, connection: AisConnectionConfig, signal: AbortSignal, index: number, staggerMs: number) {
  const delayMs = Math.max(0, index * staggerMs);
  if (delayMs > 0) {
    logInfo(`${connection.label} startup stagger | delayMs=${delayMs}`);
    await sleep(delayMs, signal);
  }
  if (signal.aborted) return;
  await connectForever(apiKey, connection, signal);
}

async function buildAisConnectionConfigs(
  mode: CruiseAisIngestMode,
  diagnosticProfile: AisDiagnosticProfile | null = null,
  discoveryRegionLimit: number | null = null,
  verifiedBatchLimit: number | null = null
): Promise<AisConnectionConfig[]> {
  const connections: AisConnectionConfig[] = [];
  const includeDiscovery = mode === "discovery" || mode === "hybrid";
  const includeVerifiedGlobal = mode === "verified-global" || mode === "hybrid";

  if (includeDiscovery) {
    const regionConfig = getCruiseRegionConfig();
    const regions = discoveryRegionLimit && discoveryRegionLimit > 0 ? regionConfig.regions.slice(0, discoveryRegionLimit) : regionConfig.regions;
    const sourceLabel = regionConfig.source === "default" ? "default cruise corridors" : "AISSTREAM_BOUNDING_BOXES override";
    logInfo(
      `Discovery AISStream subscription uses ${regions.length} configured region(s) from ${sourceLabel}: ${regions.map((region) => region.name).join(", ")}`
    );
    connections.push({
      label: "discovery-corridors",
      type: "discovery",
      boundingBoxes: regions.map((region) => region.boundingBox)
    });
  }

  if (includeVerifiedGlobal) {
    const allowlist = await loadVerifiedAisAllowlist();
    const mmsis = getVerifiedAisSubscriptionMmsis(allowlist);
    const diagnosticBatchCount = getDiagnosticBatchCount(diagnosticProfile);
    const selection = selectVerifiedGlobalMmsis(mmsis, mode, AISSTREAM_MMSI_FILTER_LIMIT, diagnosticBatchCount, verifiedBatchLimit);
    const selectedMmsis = selection.selectedMmsis;
    const selectedBatches = splitMmsiBatches(selectedMmsis, AISSTREAM_MMSI_FILTER_LIMIT);
    logInfo(
      [
        "Verified global AIS allowlist loaded",
        `verifiedRegistryEntries=${allowlist.totalVerifiedRegistryAcceptEntries}`,
        `eligibleMmsis=${mmsis.length}`,
        `missingMmsis=${allowlist.linkedEntriesMissingMmsi}`,
        `conflictingMmsis=${allowlist.duplicateOrConflictingMmsis.length}`,
        `batches=${selectedBatches.length}`,
        `batchSizes=${selectedBatches.map((batch) => batch.length).join(",") || "none"}`
      ].join(" | ")
    );
    if (selection.partialCoverage) {
      logWarn(
        [
          "Hybrid verified-global batch limit active",
          `verifiedBatchLimit=${selection.activeBatchLimit}`,
          `includedMmsis=${selection.selectedMmsis.length}`,
          `excludedMmsis=${selection.excludedMmsiCount}`,
          "partialVerifiedGlobalCoverage=true"
        ].join(" | ")
      );
    }
    const emptyDecision = selectedMmsis.length ? null : getEmptyAllowlistStartupDecision(mode);
    if (emptyDecision === "refuse") {
      throw new Error("Verified-global AIS ingestion refused to start: no verified public-eligible MMSIs are available.");
    }
    if (emptyDecision === "continue-discovery") {
      logWarn("Hybrid AIS ingestion has no verified public-eligible MMSIs; continuing with discovery corridors only.");
    }
    connections.push(...buildVerifiedGlobalConnectionConfigs(selectedMmsis, AISSTREAM_MMSI_FILTER_LIMIT));
  }

  return orderConnectionsForDiagnostic(connections, diagnosticProfile);
}

export function buildVerifiedGlobalConnectionConfigs(mmsis: string[], limit = AISSTREAM_MMSI_FILTER_LIMIT): AisConnectionConfig[] {
  return splitMmsiBatches(mmsis, limit).map((batch, index) => ({
    label: `verified-global-batch-${index + 1}`,
    type: "verified-global",
    boundingBoxes: [VERIFIED_GLOBAL_BOUNDING_BOX],
    mmsis: batch
  }));
}

export function selectVerifiedGlobalMmsis(
  mmsis: string[],
  mode: CruiseAisIngestMode,
  providerBatchLimit = AISSTREAM_MMSI_FILTER_LIMIT,
  diagnosticBatchCount: number | null = null,
  verifiedBatchLimit: number | null = null
) {
  const hybridBatchLimit = mode === "hybrid" && verifiedBatchLimit && verifiedBatchLimit > 0 ? verifiedBatchLimit : null;
  const activeBatchLimit = diagnosticBatchCount ?? hybridBatchLimit;
  const selectedMmsis = activeBatchLimit ? mmsis.slice(0, activeBatchLimit * providerBatchLimit) : mmsis;
  return {
    selectedMmsis,
    activeBatchLimit,
    excludedMmsiCount: Math.max(0, mmsis.length - selectedMmsis.length),
    partialCoverage: mode === "hybrid" && Boolean(hybridBatchLimit) && selectedMmsis.length < mmsis.length
  };
}

export function getEmptyAllowlistStartupDecision(mode: CruiseAisIngestMode): "refuse" | "continue-discovery" | "start-without-global" {
  if (mode === "verified-global") return "refuse";
  if (mode === "hybrid") return "continue-discovery";
  return "start-without-global";
}

export function getReconnectDelayMs(reconnectAttempt: number, consecutiveFailures: number, lastConnectElapsedMs: number | null) {
  const baseDelayMs = Math.min(MAX_RECONNECT_DELAY_MS, 2000 * 2 ** Math.min(reconnectAttempt, 8));
  const rapidProviderFailure = lastConnectElapsedMs !== null && lastConnectElapsedMs < RAPID_FAILURE_WINDOW_MS && consecutiveFailures >= 2;
  if (!rapidProviderFailure) return baseDelayMs;
  const rapidBackoffMs = Math.min(MAX_RECONNECT_DELAY_MS, RAPID_FAILURE_BACKOFF_MS * 2 ** Math.max(0, consecutiveFailures - 2));
  return Math.max(baseDelayMs, rapidBackoffMs);
}

export function isLikelyConcurrentConnectionLimit(consecutiveFailures: number, lastConnectElapsedMs: number | null) {
  return lastConnectElapsedMs !== null && lastConnectElapsedMs < RAPID_FAILURE_WINDOW_MS && consecutiveFailures >= CONCURRENT_CONNECTION_LIMIT_WARNING_FAILURES;
}

export function parseAisDiagnosticProfile(value?: string | null): AisDiagnosticProfile | null {
  const normalized = value?.trim();
  if (!normalized) return null;
  if ((AIS_DIAGNOSTIC_PROFILES as readonly string[]).includes(normalized)) return normalized as AisDiagnosticProfile;
  throw new Error(`Invalid AIS diagnostic profile "${value}". Supported values: ${AIS_DIAGNOSTIC_PROFILES.join(", ")}.`);
}

function getModeForDiagnosticProfile(profile: AisDiagnosticProfile): CruiseAisIngestMode {
  if (profile === "discovery") return "discovery";
  if (profile === "verified-global") return "verified-global";
  return "hybrid";
}

function getDiagnosticBatchCount(profile: AisDiagnosticProfile | null) {
  if (profile === "hybrid-one-batch") return 1;
  if (profile === "hybrid-two-batches") return 2;
  if (profile === "hybrid-three-batches") return 3;
  return null;
}

function orderConnectionsForDiagnostic(connections: AisConnectionConfig[], profile: AisDiagnosticProfile | null) {
  if (profile === "hybrid-verified-first") {
    return [...connections].sort((a, b) => (a.type === b.type ? 0 : a.type === "verified-global" ? -1 : 1));
  }
  return connections;
}

async function connectForever(apiKey: string, connection: AisConnectionConfig, signal: AbortSignal) {
  let reconnectAttempt = 0;

  while (!signal.aborted) {
    await connectOnce(apiKey, connection, signal, reconnectAttempt + 1);
    if (signal.aborted) break;

    reconnectAttempt += 1;
    stats.reconnectCount += 1;
    const current = getConnectionStats(connection);
    current.connected = false;
    current.reconnectCount += 1;
    const elapsedMs = current.startedAt ? Date.now() - current.startedAt.getTime() : null;
    const delayMs = getReconnectDelayMs(reconnectAttempt, current.consecutiveFailures, elapsedMs);
    evaluateHybridDegradedState();
    if (isLikelyConcurrentConnectionLimit(current.consecutiveFailures, elapsedMs) && !connectionLimitWarnings.has(connection.label)) {
      connectionLimitWarnings.add(connection.label);
      logWarn(
        [
          `${connection.label} likelyConcurrentConnectionLimit`,
          `consecutiveRapidFailures=${current.consecutiveFailures}`,
          `lastConnectElapsedMs=${elapsedMs}`,
          `backoffSeconds=${Math.round(delayMs / 1000)}`,
          "AISStream may be limiting concurrent WebSocket connections for this API key"
        ].join(" | ")
      );
    }
    logInfo(
      [
        `${connection.label} reconnect scheduled`,
        `attempt=${reconnectAttempt}`,
        `delaySeconds=${Math.round(delayMs / 1000)}`,
        `consecutiveFailures=${current.consecutiveFailures}`,
        `lastConnectElapsedMs=${elapsedMs ?? "unknown"}`
      ].join(" | ")
    );
    await sleep(delayMs, signal);
  }
}

async function connectOnce(apiKey: string, connection: AisConnectionConfig, signal: AbortSignal, reconnectAttempt: number) {
  await new Promise<void>((resolve) => {
    const socket = new WebSocket(AISSTREAM_ENDPOINT);
    const current = getConnectionStats(connection);
    const startedAt = Date.now();
    current.startedAt = new Date(startedAt);
    let resolved = false;
    const finish = () => {
      if (resolved) return;
      resolved = true;
      current.connected = false;
      signal.removeEventListener("abort", abort);
      resolve();
    };
    const abort = () => {
      socket.close();
      finish();
    };
    if (signal.aborted) {
      socket.close();
      finish();
      return;
    }
    signal.addEventListener("abort", abort, { once: true });

    socket.addEventListener("open", () => {
      if (signal.aborted) {
        socket.close();
        return;
      }
      current.connected = true;
      current.unhealthy = false;
      current.consecutiveFailures = 0;
      stats.lastConnectedAt = new Date();
      current.lastError = null;
      stats.lastError = null;
      const subscriptionOpenedAt = Date.now();
      const subscription = sendAisSubscription(socket, apiKey, connection, subscriptionOpenedAt);
      logInfo(
        [
          `${connection.label} connected`,
          `type=${connection.type}`,
          `reconnectAttempt=${reconnectAttempt}`,
          `readyState=${socket.readyState}`,
          `subscriptionSentAfterMs=${subscription.sentAfterMs}`,
          `subscription=${JSON.stringify(subscription.summary)}`
        ].join(" | ")
      );
    });

    socket.addEventListener("message", (event) => {
      void handleSocketMessage(event, connection).catch((error) => {
        stats.filteredMessages += 1;
        current.filteredMessages += 1;
        stats.lastError = error instanceof Error ? error.message : "Unknown AIS message error";
        current.lastError = stats.lastError;
        logError(`${connection.label} AISStream message failed`, error);
      });
    });

    socket.addEventListener("close", (event) => {
      if (resolved) return;
      const diagnostic = formatCloseDiagnostic(connection, socket.readyState, event, startedAt, reconnectAttempt);
      current.lastError = diagnostic;
      current.connected = false;
      current.unhealthy = true;
      current.consecutiveFailures += 1;
      stats.lastError = diagnostic;
      logWarn(diagnostic);
      finish();
    });

    socket.addEventListener("error", (error) => {
      current.connected = false;
      const diagnostic = formatErrorDiagnostic(connection, socket.readyState, error, startedAt, reconnectAttempt);
      stats.lastError = diagnostic;
      current.lastError = diagnostic;
      current.unhealthy = true;
      current.consecutiveFailures += 1;
      logWarn(diagnostic);
      socket.close();
      finish();
    });
  });
}

export function buildSubscriptionPayload(apiKey: string, connection: AisConnectionConfig) {
  const boundingBoxes = getSubscriptionBoundingBoxes(connection);
  const payload: Record<string, unknown> = {
    APIKey: apiKey,
    FilterMessageTypes: [...AISSTREAM_FILTER_MESSAGE_TYPES]
  };
  if (boundingBoxes.length) payload.BoundingBoxes = boundingBoxes;
  if (connection.type === "verified-global") payload.FiltersShipMMSI = connection.mmsis ?? [];
  return payload;
}

export function sendAisSubscription(
  socket: Pick<WebSocket, "send">,
  apiKey: string,
  connection: AisConnectionConfig,
  openedAtMs = Date.now(),
  now: () => number = Date.now
) {
  const payload = buildSubscriptionPayload(apiKey, connection);
  socket.send(JSON.stringify(payload));
  const sentAfterMs = now() - openedAtMs;
  return {
    payload,
    sentAfterMs,
    summary: getSubscriptionSummary(connection)
  };
}

export function getSubscriptionSummary(connection: AisConnectionConfig) {
  const boundingBoxes = getSubscriptionBoundingBoxes(connection);
  return {
    label: connection.label,
    type: connection.type,
    boundingBoxes: boundingBoxes.length,
    usesExactGlobalBoundingBox: connection.type === "verified-global" ? usesExactVerifiedGlobalBoundingBox(boundingBoxes) : false,
    mmsis: connection.mmsis?.length ?? 0,
    messageTypes: [...AISSTREAM_FILTER_MESSAGE_TYPES]
  };
}

function getSubscriptionBoundingBoxes(connection: AisConnectionConfig) {
  if (connection.type === "verified-global") return [VERIFIED_GLOBAL_BOUNDING_BOX];
  return connection.boundingBoxes ?? [];
}

export function usesExactVerifiedGlobalBoundingBox(boundingBoxes: Array<[[number, number], [number, number]]>) {
  return (
    boundingBoxes.length === 1 &&
    boundingBoxes[0]?.[0]?.[0] === -90 &&
    boundingBoxes[0]?.[0]?.[1] === -180 &&
    boundingBoxes[0]?.[1]?.[0] === 90 &&
    boundingBoxes[0]?.[1]?.[1] === 180
  );
}

function describeConnectionSubscription(connection: AisConnectionConfig) {
  if (connection.type === "discovery") return `Subscribed to ${connection.boundingBoxes?.length ?? 0} bounding box(es).`;
  return `Subscribed to ${connection.mmsis?.length ?? 0} verified MMSI(s).`;
}

async function handleSocketMessage(event: MessageEvent, context: AisMessageContext) {
  stats.messagesReceived += 1;
  const current = getConnectionStats(context);
  current.messagesReceived += 1;
  current.lastMessageAt = new Date();
  const payloadText = await messageDataToString(event);
  if (!payloadText) {
    stats.filteredMessages += 1;
    current.filteredMessages += 1;
    logWarn(`AISStream message skipped: unreadable payload type=${describePayloadType(event)}`);
    return;
  }

  let payload: AisMessage;
  try {
    payload = JSON.parse(payloadText) as AisMessage;
  } catch {
    stats.filteredMessages += 1;
    current.filteredMessages += 1;
    logWarn(`AISStream message skipped: invalid JSON type=${describePayloadType(event)} preview="${previewPayload(payloadText)}"`);
    return;
  }

  const result = await handleAisMessage(payload, context);
  if (!result.persisted) {
    stats.filteredMessages += 1;
    current.filteredMessages += 1;
    logDebug(`AIS message filtered${result.reason ? `: ${result.reason}` : ""}`);
    return;
  }

  stats.positionsStored += 1;
  current.positionsStored += 1;
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

export async function handleAisMessage(payload: AisMessage, context: AisMessageContext = { label: "unknown", type: "discovery" }): Promise<PersistedPosition> {
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

  const created = await prisma.cruisePosition.createMany({
    data: [
      {
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
        rawPayload: withIngestionAttribution(payload, context) as Prisma.InputJsonValue
      }
    ],
    skipDuplicates: true
  });
  if (created.count === 0) return { persisted: false, shipId: identity.ship.id, reason: "duplicate-position-record" };

  return { persisted: true, shipId: identity.ship.id };
}

async function loadVerifiedAisAllowlist(): Promise<VerifiedAisAllowlistReport> {
  const [registryEntries, publicEligibleShips] = await Promise.all([getVerifiedRegistryEntries(), getPublicEligibleShips()]);
  return buildVerifiedAisAllowlistReport({
    registryEntries,
    publicEligibleShips,
    mmsiFilterLimit: AISSTREAM_MMSI_FILTER_LIMIT
  });
}

async function getVerifiedRegistryEntries(): Promise<CoverageRegistryEntry[]> {
  const rows = await prisma.$queryRaw<Array<{
    imo: string;
    operator: string;
    operator_group: string | null;
    registry_decision: CoverageRegistryEntry["registryDecision"];
    active_status: CoverageRegistryEntry["activeStatus"];
    vessel_segment: CoverageRegistryEntry["vesselSegment"];
  }>>`
    SELECT imo, operator, operator_group, registry_decision, active_status, vessel_segment
    FROM cruise_vessel_registry_entries
  `;
  return rows.map((row) => ({
    imo: row.imo,
    operator: row.operator,
    operatorGroup: row.operator_group,
    registryDecision: row.registry_decision,
    activeStatus: row.active_status,
    vesselSegment: row.vessel_segment
  }));
}

async function getPublicEligibleShips(): Promise<CoveragePublicEligibleShip[]> {
  return prisma.$queryRaw<CoveragePublicEligibleShip[]>`
    SELECT DISTINCT s.id, s.imo, s.mmsi
    FROM cruise_ships s
    INNER JOIN cruise_vessel_verifications v ON v.ship_id = s.id
    INNER JOIN cruise_vessel_registry_entries r ON r.id = v.registry_entry_id
    WHERE v.verification_status = 'VERIFIED_OCEAN_CRUISE'
      AND v.confidence = 'HIGH'
      AND r.registry_decision = 'ACCEPT'
      AND r.imo = s.imo
  `;
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

function createConnectionStats(connection: AisConnectionConfig): AisConnectionStats {
  return {
    label: connection.label,
    type: connection.type,
    connected: false,
    unhealthy: false,
    messagesReceived: 0,
    positionsStored: 0,
    filteredMessages: 0,
    reconnectCount: 0,
    consecutiveFailures: 0,
    startedAt: null,
    lastMessageAt: null,
    lastError: null
  };
}

function getConnectionStats(connection: AisMessageContext): AisConnectionStats {
  const existing = connectionStats.get(connection.label);
  if (existing) return existing;
  const created = createConnectionStats({ label: connection.label, type: connection.type });
  connectionStats.set(connection.label, created);
  return created;
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
    const connectionRows = [...connectionStats.values()];
    const connectedConnections = connectionRows.filter((connection) => connection.connected).length;
    const discoveryConnections = connectionRows.filter((connection) => connection.type === "discovery");
    const verifiedConnections = connectionRows.filter((connection) => connection.type === "verified-global");
    const discoveryMessages = discoveryConnections.reduce((total, connection) => total + connection.messagesReceived, 0);
    const discoveryPositions = discoveryConnections.reduce((total, connection) => total + connection.positionsStored, 0);
    const connectedVerifiedGlobalBatches = verifiedConnections.filter((connection) => connection.connected).length;
    const discoveryHealthy = discoveryConnections.length ? discoveryConnections.some((connection) => connection.connected) : false;
    const verifiedGlobalHealthy = verifiedConnections.length ? connectedVerifiedGlobalBatches > 0 : false;
    const hybridStatus = getHybridHealthStatus(connectionRows);
    logInfo(
      [
        "AISStream status",
        `mode=${stats.mode}`,
        `totalConnections=${connectionRows.length}`,
        `connectedConnections=${connectedConnections}`,
        `shipsTracked=${stats.shipsTracked.size}`,
        `messagesReceived=${stats.messagesReceived}`,
        `positionsStored=${stats.positionsStored}`,
        `filteredMessages=${stats.filteredMessages}`,
        `identityConflicts=${stats.identityConflicts}`,
        `shipsCreated=${stats.shipsCreated}`,
        `shipsUpdated=${stats.shipsUpdated}`,
        `reconnectCount=${stats.reconnectCount}`,
        `lastConnectedAt=${stats.lastConnectedAt?.toISOString() ?? "never"}`,
        `lastError=${stats.lastError ?? "none"}`,
        `discoveryMessages=${discoveryMessages}`,
        `discoveryPositions=${discoveryPositions}`,
        `discoveryHealthy=${discoveryHealthy}`,
        `verifiedGlobalHealthy=${verifiedGlobalHealthy}`,
        `verifiedGlobalBatches=${verifiedConnections.length}`,
        `connectedVerifiedGlobalBatches=${connectedVerifiedGlobalBatches}`,
        `hybridHealthy=${hybridStatus.hybridHealthy}`,
        `degraded=${hybridStatus.degraded}`
      ].join(" | ")
    );
    for (const connection of connectionRows) {
      logInfo(
        [
          `AISStream connection ${connection.label}`,
          `type=${connection.type}`,
          `connected=${connection.connected}`,
          `unhealthy=${connection.unhealthy}`,
          `messagesReceived=${connection.messagesReceived}`,
          `positionsStored=${connection.positionsStored}`,
          `filteredMessages=${connection.filteredMessages}`,
          `reconnectCount=${connection.reconnectCount}`,
          `consecutiveFailures=${connection.consecutiveFailures}`,
          `lastMessageAt=${connection.lastMessageAt?.toISOString() ?? "never"}`,
          `lastError=${connection.lastError ?? "none"}`
        ].join(" | ")
      );
    }
  }, LOG_INTERVAL_MS);
  interval.unref?.();
}

function evaluateHybridDegradedState() {
  const connectionRows = [...connectionStats.values()];
  const status = getHybridHealthStatus(connectionRows);
  if (status.degraded !== "none" && !degradedWarnings.has(status.degraded)) {
    degradedWarnings.add(status.degraded);
    logWarn(status.degraded);
  }
}

export function getHybridDegradedStatus(connectionRows: Array<Pick<AisConnectionStats, "type" | "connected" | "unhealthy"> & { label?: string }>) {
  return getHybridHealthStatus(connectionRows).degraded;
}

export function getHybridHealthStatus(connectionRows: Array<Pick<AisConnectionStats, "type" | "connected" | "unhealthy"> & { label?: string }>) {
  const discoveryConnections = connectionRows.filter((connection) => connection.type === "discovery");
  const verifiedConnections = connectionRows.filter((connection) => connection.type === "verified-global");
  if (!discoveryConnections.length || !verifiedConnections.length) {
    return {
      hybridHealthy: true,
      degraded: "none",
      unavailableVerifiedBatches: [] as string[]
    };
  }
  const discoveryHealthy = discoveryConnections.some((connection) => connection.connected);
  const discoveryUnavailable = discoveryConnections.every((connection) => connection.unhealthy && !connection.connected);
  const unavailableVerifiedBatches = verifiedConnections
    .filter((connection) => !connection.connected || connection.unhealthy)
    .map((connection, index) => connection.label ?? `verified-global-batch-${index + 1}`);
  const issues: string[] = [];
  if (discoveryUnavailable && !discoveryHealthy) issues.push("discovery unavailable");
  if (unavailableVerifiedBatches.length) issues.push(`verified batch unavailable: ${unavailableVerifiedBatches.join(", ")}`);
  return {
    hybridHealthy: issues.length === 0,
    degraded: issues.length ? `HYBRID DEGRADED: ${issues.join("; ")}` : "none",
    unavailableVerifiedBatches
  };
}

export function formatCloseDiagnostic(
  connection: Pick<AisConnectionConfig, "label" | "type" | "boundingBoxes" | "mmsis">,
  readyState: number,
  event: unknown,
  startedAtMs: number,
  reconnectAttempt: number
) {
  const close = event as Partial<CloseEvent>;
  return [
    `${connection.label} AISStream closed`,
    `type=${connection.type}`,
    `readyState=${readyState}`,
    `code=${typeof close.code === "number" ? close.code : "unknown"}`,
    `reason=${sanitizeLogValue(close.reason) || "none"}`,
    `wasClean=${typeof close.wasClean === "boolean" ? close.wasClean : "unknown"}`,
    `elapsedMs=${Date.now() - startedAtMs}`,
    `reconnectAttempt=${reconnectAttempt}`,
    `subscription=${JSON.stringify(getSubscriptionSummary(connection as AisConnectionConfig))}`
  ].join(" | ");
}

export function formatErrorDiagnostic(
  connection: Pick<AisConnectionConfig, "label" | "type" | "boundingBoxes" | "mmsis">,
  readyState: number,
  event: unknown,
  startedAtMs: number,
  reconnectAttempt: number
) {
  return [
    `${connection.label} AISStream error`,
    `type=${connection.type}`,
    `readyState=${readyState}`,
    `elapsedMs=${Date.now() - startedAtMs}`,
    `reconnectAttempt=${reconnectAttempt}`,
    `event=${JSON.stringify(extractSafeEventFields(event))}`,
    `subscription=${JSON.stringify(getSubscriptionSummary(connection as AisConnectionConfig))}`
  ].join(" | ");
}

function extractSafeEventFields(event: unknown) {
  if (!event || typeof event !== "object") return { type: typeof event };
  const record = event as Record<string, unknown>;
  return {
    type: sanitizeLogValue(record.type),
    message: sanitizeLogValue(record.message),
    error: sanitizeLogValue(record.error),
    code: sanitizeLogValue(record.code),
    reason: sanitizeLogValue(record.reason),
    wasClean: typeof record.wasClean === "boolean" ? record.wasClean : undefined,
    cancelable: typeof record.cancelable === "boolean" ? record.cancelable : undefined,
    defaultPrevented: typeof record.defaultPrevented === "boolean" ? record.defaultPrevented : undefined
  };
}

function sanitizeLogValue(value: unknown) {
  if (value === null || value === undefined || value === "") return undefined;
  if (typeof value === "string") return value.replace(/[\r\n]+/g, " ").slice(0, 200);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Error) return value.message.slice(0, 200);
  return String(value).replace(/[\r\n]+/g, " ").slice(0, 200);
}

function withIngestionAttribution(payload: AisMessage, context: AisMessageContext) {
  return {
    ...payload,
    PaperStrawIngestion: {
      source: context.type === "verified-global" ? "verified-global" : "discovery-corridors",
      connectionLabel: context.label,
      connectionType: context.type,
      receivedAt: new Date().toISOString()
    }
  };
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

function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(resolve, ms);
    const abort = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      resolve();
    };
    signal?.addEventListener("abort", abort, { once: true });
  });
}

function getConnectionStaggerMs() {
  const raw = process.env.CRUISE_AIS_CONNECTION_STAGGER_MS?.trim();
  if (!raw) return DEFAULT_CONNECTION_STAGGER_MS;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : DEFAULT_CONNECTION_STAGGER_MS;
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
