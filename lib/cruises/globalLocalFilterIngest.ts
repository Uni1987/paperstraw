import { monitorEventLoopDelay } from "node:perf_hooks";
import { randomUUID } from "node:crypto";
import { AISSTREAM_ENDPOINT, getAisStreamApiKey } from "@/lib/cruises/config";
import { estimateAndStoreCruiseDailyEmissions } from "@/lib/cruises/estimation";
import { VERIFIED_GLOBAL_BOUNDING_BOX, messageDataToString, usesExactVerifiedGlobalBoundingBox } from "@/lib/cruises/aisstream";
import { calculateAverageKbPerSecond, calculateNetworkProjection, calculateProcessCpuPercent, getUtf8ByteLength } from "@/lib/cruises/globalFeedBenchmark";
import { isValidImoWithChecksum } from "@/lib/cruises/registry";
import { prisma } from "@/lib/prisma";

export const GLOBAL_LOCAL_FILTER_MODE = "global-local-filter";
export const GLOBAL_LOCAL_FILTER_SOURCE = "GLOBAL_LOCAL_FILTER";
export const GLOBAL_LOCAL_FILTER_DEFAULT_REPORT_INTERVAL_MS = 30000;
export const GLOBAL_LOCAL_FILTER_MAX_RUNTIME_WITHOUT_OVERRIDE_MS = 30 * 60 * 1000;
export const GLOBAL_LOCAL_FILTER_DEFAULT_POSITION_RETENTION_DAYS = 90;
export const GLOBAL_LOCAL_FILTER_DEFAULT_REVIEW_QUEUE_LIMIT = 10000;
export const GLOBAL_LOCAL_FILTER_FLUSH_INTERVAL_MS = 5000;
export const GLOBAL_LOCAL_FILTER_FLUSH_BATCH_SIZE = 100;
export const GLOBAL_LOCAL_FILTER_MESSAGE_TYPES = ["PositionReport", "ShipStaticData"] as const;

export type GlobalLocalFilterHealthStatus =
  | "HEALTHY"
  | "DEGRADED"
  | "BACKPRESSURE_RISK"
  | "DATABASE_WRITE_FAILURE"
  | "REVIEW_QUEUE_FAILURE"
  | "AISSTREAM_UNAVAILABLE";

export type GlobalLocalFilterOptions = {
  maxRuntimeMs: number | null;
  reportIntervalMs: number;
  positionRetentionDays: number;
  reviewQueueLimit: number;
  dryRun: boolean;
  noEmissions: boolean;
};

export type VerifiedCruiseLookup = {
  mmsiToShip: Map<string, { shipId: string }>;
  acceptedRegistryByImo: Map<string, { registryEntryId: string; linkedMmsi: string | null }>;
};

export type GlobalLocalFilterPosition = {
  shipId: string;
  mmsi: string;
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

export type StaticQueueItem = {
  registryEntryId: string;
  observedMmsi: string;
  observedAt: Date;
  classification: "ALREADY_LINKED_CONFIRMATION" | "NEW_MMSI_CANDIDATE_FOR_EXISTING_REGISTRY_ENTRY" | "MMSI_CONFLICT_REVIEW_REQUIRED";
};

export type GlobalLocalFilterState = {
  startedAt: Date;
  endedAt: Date | null;
  connected: boolean;
  subscriptionSent: boolean;
  connectedDurationMs: number;
  closeCode: number | null;
  closeReason: string | null;
  reconnectCount: number;
  consecutiveFastFailures: number;
  lastError: string | null;
  messagesReceived: number;
  positionReports: number;
  shipStaticData: number;
  totalBytesReceived: number;
  intervalMessages: number;
  intervalBytes: number;
  secondWindowMessages: number;
  secondWindowBytes: number;
  lastSecondStartedAt: number;
  peakOneSecondRate: number;
  peakOneSecondBytes: number;
  verifiedPositionMatches: number;
  positionsStored: number;
  wouldStorePositions: number;
  duplicatePositionsSkipped: number;
  discardedNonVerifiedPositions: number;
  rejectedInvalidPositions: number;
  staticExactRegistryMatches: number;
  newMmsiCandidatesQueued: number;
  wouldQueueNewMmsiCandidates: number;
  mmsiConflictsQueued: number;
  wouldQueueConflicts: number;
  alreadyLinkedConfirmations: number;
  reviewQueueUpdates: number;
  queueWriteFailures: number;
  emissionDaysAffected: number;
  wouldAffectEmissionDays: number;
  emissionRowsInserted: number;
  emissionRowsUpdated: number;
  emissionWriteFailures: number;
  batchFlushes: number;
  pendingWriteBuffer: number;
  databaseWriteBatches: number;
  databaseWritesAttempted: number;
  databaseWritesCompleted: number;
  databaseWriteFailures: number;
  backlogObserved: boolean;
  peakPendingMessages: number;
  memoryStartMb: number;
  memoryPeakMb: number;
  memoryEndMb: number;
  cpuStart: NodeJS.CpuUsage;
  cpuLastInterval: NodeJS.CpuUsage;
  cpuEnd: NodeJS.CpuUsage | null;
  lastCpuIntervalAtMs: number;
  averageCpuPercent: number;
  peakCpuPercent: number;
  latestCpuPercent: number;
  eventLoopP95Ms: number;
  reviewQueueLimitReached: boolean;
};

type AisMessage = {
  MessageType?: string;
  MetaData?: { MMSI?: number | string; time_utc?: string; latitude?: number; longitude?: number };
  Message?: {
    PositionReport?: Record<string, unknown>;
    ShipStaticData?: Record<string, unknown>;
  };
};

export function validateGlobalLocalFilterOptions(options: { maxRuntimeMs: number | null; reportIntervalMs: number; positionRetentionDays: number; reviewQueueLimit: number; allowLongRun?: boolean }) {
  if (options.maxRuntimeMs !== null && (!Number.isFinite(options.maxRuntimeMs) || options.maxRuntimeMs <= 0)) throw new Error("--max-runtime-ms requires a positive number.");
  if (options.maxRuntimeMs !== null && options.maxRuntimeMs > GLOBAL_LOCAL_FILTER_MAX_RUNTIME_WITHOUT_OVERRIDE_MS && !options.allowLongRun) {
    throw new Error("global-local-filter runtimes over 30 minutes require --allow-long-run.");
  }
  if (!Number.isFinite(options.reportIntervalMs) || options.reportIntervalMs <= 0) throw new Error("--report-interval-ms requires a positive number.");
  if (!Number.isInteger(options.positionRetentionDays) || options.positionRetentionDays <= 0) throw new Error("--position-retention-days requires a positive integer.");
  if (!Number.isInteger(options.reviewQueueLimit) || options.reviewQueueLimit <= 0) throw new Error("--review-queue-limit requires a positive integer.");
}

export function buildGlobalLocalFilterSubscriptionPayload(apiKey: string) {
  return {
    APIKey: apiKey,
    BoundingBoxes: [VERIFIED_GLOBAL_BOUNDING_BOX],
    FilterMessageTypes: [...GLOBAL_LOCAL_FILTER_MESSAGE_TYPES]
  };
}

export function getGlobalLocalFilterSubscriptionSummary(payload: ReturnType<typeof buildGlobalLocalFilterSubscriptionPayload>, subscriptionSentAfterMs: number) {
  return {
    mode: GLOBAL_LOCAL_FILTER_MODE,
    globalConnections: 1,
    boundingBoxes: payload.BoundingBoxes.length,
    usesExactGlobalBoundingBox: usesExactVerifiedGlobalBoundingBox(payload.BoundingBoxes),
    coordinateOrder: "[latitude, longitude]",
    filterMessageTypes: payload.FilterMessageTypes,
    hasMmsiFilter: false,
    subscriptionSentAfterMs
  };
}

export function createGlobalLocalFilterState(): GlobalLocalFilterState {
  const memory = getRssMb();
  const cpuStart = process.cpuUsage();
  const now = Date.now();
  return {
    startedAt: new Date(),
    endedAt: null,
    connected: false,
    subscriptionSent: false,
    connectedDurationMs: 0,
    closeCode: null,
    closeReason: null,
    reconnectCount: 0,
    consecutiveFastFailures: 0,
    lastError: null,
    messagesReceived: 0,
    positionReports: 0,
    shipStaticData: 0,
    totalBytesReceived: 0,
    intervalMessages: 0,
    intervalBytes: 0,
    secondWindowMessages: 0,
    secondWindowBytes: 0,
    lastSecondStartedAt: now,
    peakOneSecondRate: 0,
    peakOneSecondBytes: 0,
    verifiedPositionMatches: 0,
    positionsStored: 0,
    wouldStorePositions: 0,
    duplicatePositionsSkipped: 0,
    discardedNonVerifiedPositions: 0,
    rejectedInvalidPositions: 0,
    staticExactRegistryMatches: 0,
    newMmsiCandidatesQueued: 0,
    wouldQueueNewMmsiCandidates: 0,
    mmsiConflictsQueued: 0,
    wouldQueueConflicts: 0,
    alreadyLinkedConfirmations: 0,
    reviewQueueUpdates: 0,
    queueWriteFailures: 0,
    emissionDaysAffected: 0,
    wouldAffectEmissionDays: 0,
    emissionRowsInserted: 0,
    emissionRowsUpdated: 0,
    emissionWriteFailures: 0,
    batchFlushes: 0,
    pendingWriteBuffer: 0,
    databaseWriteBatches: 0,
    databaseWritesAttempted: 0,
    databaseWritesCompleted: 0,
    databaseWriteFailures: 0,
    backlogObserved: false,
    peakPendingMessages: 0,
    memoryStartMb: memory,
    memoryPeakMb: memory,
    memoryEndMb: memory,
    cpuStart,
    cpuLastInterval: cpuStart,
    cpuEnd: null,
    lastCpuIntervalAtMs: now,
    averageCpuPercent: 0,
    peakCpuPercent: 0,
    latestCpuPercent: 0,
    eventLoopP95Ms: 0,
    reviewQueueLimitReached: false
  };
}

export async function runGlobalLocalFilterIngest(options: GlobalLocalFilterOptions) {
  const apiKey = getAisStreamApiKey();
  if (!apiKey) throw new Error("Missing AISSTREAM_API_KEY.");
  if (!options.dryRun) await assertGlobalLocalFilterWriteTablesExist();
  const lookup = await loadGlobalLocalFilterLookup();
  const state = createGlobalLocalFilterState();
  const writer = createGlobalLocalFilterWriter(options, state);
  const histogram = monitorEventLoopDelay({ resolution: 20 });
  histogram.enable();
  const startedAtMs = Date.now();
  const stopAtMs = options.maxRuntimeMs ? startedAtMs + options.maxRuntimeMs : null;
  let pendingMessages = 0;
  let stopped = false;
  let socket: WebSocket | null = null;

  console.warn("global-local-filter is local-development only. Stop benchmark/discovery/hybrid/verified-global workers before running this mode.");

  await new Promise<void>((resolve) => {
    const stopTimer = stopAtMs
      ? setTimeout(() => {
          stopped = true;
          socket?.close(1000, "global-local-filter runtime complete");
        }, Math.max(1, stopAtMs - Date.now()))
      : null;
    const reportTimer = setInterval(() => {
      updateRuntimeHealth(state);
      updateIntervalCpu(state);
      state.eventLoopP95Ms = nsToMs(histogram.percentile(95));
      printGlobalLocalFilterStatus(state);
      resetInterval(state);
    }, options.reportIntervalMs);
    const flushTimer = setInterval(() => {
      void writer.flush();
    }, GLOBAL_LOCAL_FILTER_FLUSH_INTERVAL_MS);
    stopTimer?.unref?.();
    reportTimer.unref?.();
    flushTimer.unref?.();

    const finish = async () => {
      stopped = true;
      clearInterval(reportTimer);
      clearInterval(flushTimer);
      if (stopTimer) clearTimeout(stopTimer);
      await writer.flush();
      state.endedAt = new Date();
      state.connectedDurationMs = Date.now() - startedAtMs;
      if (state.closeCode === 1000 || state.closeReason === "global-local-filter runtime complete") state.lastError = null;
      state.cpuEnd = process.cpuUsage(state.cpuStart);
      state.averageCpuPercent = calculateProcessCpuPercent(state.cpuEnd.user + state.cpuEnd.system, state.connectedDurationMs);
      state.memoryEndMb = getRssMb();
      state.memoryPeakMb = Math.max(state.memoryPeakMb, state.memoryEndMb);
      state.eventLoopP95Ms = nsToMs(histogram.percentile(95));
      histogram.disable();
      resolve();
    };

    const connect = () => {
      if (stopped) return;
      const openedAttemptAt = Date.now();
      socket = new WebSocket(AISSTREAM_ENDPOINT);
      socket.addEventListener("open", () => {
        state.connected = true;
        const openedAtMs = Date.now();
        const payload = buildGlobalLocalFilterSubscriptionPayload(apiKey);
        socket?.send(JSON.stringify(payload));
        state.subscriptionSent = true;
        state.consecutiveFastFailures = 0;
        console.log(`AISStream global-local-filter connected | subscription=${JSON.stringify(getGlobalLocalFilterSubscriptionSummary(payload, Date.now() - openedAtMs))}`);
      });
      socket.addEventListener("message", (event) => {
        pendingMessages += 1;
        state.peakPendingMessages = Math.max(state.peakPendingMessages, pendingMessages);
        if (pendingMessages > 1000 || writer.pendingCount() > GLOBAL_LOCAL_FILTER_FLUSH_BATCH_SIZE * 10) state.backlogObserved = true;
        void handleGlobalLocalFilterMessage(event, lookup, writer, state)
          .catch((error) => {
            state.lastError = sanitizeLogValue(error);
          })
          .finally(() => {
            pendingMessages -= 1;
          });
      });
      socket.addEventListener("close", (event) => {
        state.connected = false;
        state.closeCode = typeof event.code === "number" ? event.code : null;
        state.closeReason = sanitizeLogValue(event.reason) || null;
        if (stopped || (stopAtMs && Date.now() >= stopAtMs)) {
          void finish();
          return;
        }
        state.reconnectCount += 1;
        const rapid = Date.now() - openedAttemptAt < 1000;
        state.consecutiveFastFailures = rapid ? state.consecutiveFastFailures + 1 : 0;
        const delay = getReconnectDelayMs(state.consecutiveFastFailures || state.reconnectCount);
        if (state.consecutiveFastFailures >= 3) state.lastError = "likely concurrent connection limit or rapid AISStream disconnect";
        setTimeout(connect, delay).unref?.();
      });
      socket.addEventListener("error", (event) => {
        state.lastError = sanitizeLogValue(event);
      });
    };

    connect();
  });

  return toGlobalLocalFilterReport(state);
}

export async function handleGlobalLocalFilterMessage(event: unknown, lookup: VerifiedCruiseLookup, writer: GlobalLocalFilterWriter, state: GlobalLocalFilterState) {
  const text = await messageDataToString(event);
  if (!text) return;
  const byteLength = getUtf8ByteLength(text);
  state.totalBytesReceived += byteLength;
  state.intervalBytes += byteLength;
  let payload: AisMessage;
  try {
    payload = JSON.parse(text) as AisMessage;
  } catch {
    return;
  }
  state.messagesReceived += 1;
  state.intervalMessages += 1;
  updateOneSecondRate(state, byteLength);
  updateRuntimeHealth(state);
  if (payload.MessageType === "PositionReport") await handleGlobalLocalFilterPosition(payload, lookup, writer, state);
  if (payload.MessageType === "ShipStaticData") await handleGlobalLocalFilterStaticData(payload, lookup, writer, state);
}

export async function handleGlobalLocalFilterPosition(payload: AisMessage, lookup: VerifiedCruiseLookup, writer: GlobalLocalFilterWriter, state: GlobalLocalFilterState) {
  state.positionReports += 1;
  const mmsi = extractMmsi(payload);
  const verified = mmsi ? lookup.mmsiToShip.get(mmsi) : null;
  if (!mmsi || !verified) {
    state.discardedNonVerifiedPositions += 1;
    return;
  }
  const position = extractVerifiedPosition(payload, verified.shipId, mmsi);
  if (!position || getPositionIssue(position)) {
    state.rejectedInvalidPositions += 1;
    return;
  }
  state.verifiedPositionMatches += 1;
  await writer.enqueuePosition(position);
}

export async function handleGlobalLocalFilterStaticData(payload: AisMessage, lookup: VerifiedCruiseLookup, writer: GlobalLocalFilterWriter, state: GlobalLocalFilterState) {
  state.shipStaticData += 1;
  const mmsi = extractMmsi(payload);
  const imo = extractImo(payload);
  if (!mmsi || !imo || !isValidImoWithChecksum(imo)) return;
  const registry = lookup.acceptedRegistryByImo.get(imo);
  if (!registry) return;
  const classification = classifyGlobalLocalFilterStaticData(registry.linkedMmsi, mmsi);
  if (!classification) return;
  state.staticExactRegistryMatches += 1;
  if (classification === "ALREADY_LINKED_CONFIRMATION") {
    state.alreadyLinkedConfirmations += 1;
    return;
  }
  await writer.enqueueStaticQueueItem({
    registryEntryId: registry.registryEntryId,
    observedMmsi: mmsi,
    observedAt: new Date(),
    classification
  });
}

export function classifyGlobalLocalFilterStaticData(linkedMmsi: string | null, observedMmsi: string) {
  if (linkedMmsi && linkedMmsi === observedMmsi) return "ALREADY_LINKED_CONFIRMATION" satisfies StaticQueueItem["classification"];
  if (linkedMmsi && linkedMmsi !== observedMmsi) return "MMSI_CONFLICT_REVIEW_REQUIRED" satisfies StaticQueueItem["classification"];
  return "NEW_MMSI_CANDIDATE_FOR_EXISTING_REGISTRY_ENTRY" satisfies StaticQueueItem["classification"];
}

export type GlobalLocalFilterWriter = {
  enqueuePosition: (position: GlobalLocalFilterPosition) => Promise<void>;
  enqueueStaticQueueItem: (item: StaticQueueItem) => Promise<void>;
  flush: () => Promise<void>;
  pendingCount: () => number;
};

export function createGlobalLocalFilterWriter(options: Pick<GlobalLocalFilterOptions, "dryRun" | "noEmissions" | "reviewQueueLimit">, state: GlobalLocalFilterState): GlobalLocalFilterWriter {
  const positions: GlobalLocalFilterPosition[] = [];
  const seenPositionKeys = new Set<string>();
  const touchedShipDays = new Set<string>();
  const queueKeys = new Set<string>();
  let flushing: Promise<void> | null = null;

  const writer: GlobalLocalFilterWriter = {
    async enqueuePosition(position) {
      if (seenPositionKeys.has(position.dedupeKey)) {
        state.duplicatePositionsSkipped += 1;
        return;
      }
      seenPositionKeys.add(position.dedupeKey);
      if (options.dryRun) {
        state.wouldStorePositions += 1;
        if (!options.noEmissions) {
          touchedShipDays.add(shipDayKey(position.shipId, position.timestamp));
          state.wouldAffectEmissionDays = touchedShipDays.size;
        }
        return;
      }
      positions.push(position);
      state.pendingWriteBuffer = positions.length;
      if (positions.length >= GLOBAL_LOCAL_FILTER_FLUSH_BATCH_SIZE) await writer.flush();
    },
    async enqueueStaticQueueItem(item) {
      const key = `${item.registryEntryId}:${item.observedMmsi}:${item.classification}`;
      if (queueKeys.has(key)) return;
      queueKeys.add(key);
      if (queueKeys.size > options.reviewQueueLimit) {
        state.reviewQueueLimitReached = true;
        return;
      }
      if (item.classification === "NEW_MMSI_CANDIDATE_FOR_EXISTING_REGISTRY_ENTRY") {
        if (options.dryRun) state.wouldQueueNewMmsiCandidates += 1;
        else state.newMmsiCandidatesQueued += 1;
      }
      if (item.classification === "MMSI_CONFLICT_REVIEW_REQUIRED") {
        if (options.dryRun) state.wouldQueueConflicts += 1;
        else state.mmsiConflictsQueued += 1;
      }
      if (options.dryRun) return;
      try {
        state.databaseWritesAttempted += 1;
        await upsertStaticReviewQueueItem(item);
        state.databaseWritesCompleted += 1;
        state.reviewQueueUpdates += 1;
      } catch (error) {
        state.queueWriteFailures += 1;
        state.lastError = sanitizeLogValue(error);
      }
    },
    async flush() {
      if (flushing) return flushing;
      flushing = flushPositions();
      try {
        await flushing;
      } finally {
        flushing = null;
      }
    },
    pendingCount() {
      return positions.length;
    }
  };

  async function flushPositions() {
    if (!positions.length) return;
    const batch = positions.splice(0, GLOBAL_LOCAL_FILTER_FLUSH_BATCH_SIZE);
    state.pendingWriteBuffer = positions.length;
    state.batchFlushes += 1;
    state.databaseWriteBatches += 1;
    try {
      state.databaseWritesAttempted += batch.length;
      const result = await prisma.cruisePosition.createMany({
        data: batch.map((position) => ({
          shipId: position.shipId,
          mmsi: position.mmsi,
          latitude: position.latitude,
          longitude: position.longitude,
          speedOverGround: position.speedOverGround,
          courseOverGround: position.courseOverGround,
          heading: position.heading,
          navigationalStatus: position.navigationalStatus,
          destination: position.destination,
          timestamp: position.timestamp,
          rawPayload: undefined
        })),
        skipDuplicates: true
      });
      state.databaseWritesCompleted += result.count;
      state.positionsStored += result.count;
      state.duplicatePositionsSkipped += Math.max(0, batch.length - result.count);
      if (!options.noEmissions && result.count > 0) {
        for (const position of batch) touchedShipDays.add(shipDayKey(position.shipId, position.timestamp));
        for (const key of touchedShipDays) {
          const [shipId, date] = key.split("|");
          state.emissionDaysAffected += 1;
          try {
            const result = await estimateAndStoreCruiseDailyEmissions(shipId, new Date(date));
            if (result.action === "inserted") state.emissionRowsInserted += 1;
            else state.emissionRowsUpdated += 1;
          } catch (error) {
            state.emissionWriteFailures += 1;
            state.lastError = sanitizeLogValue(error);
          }
        }
        touchedShipDays.clear();
      }
    } catch (error) {
      state.databaseWriteFailures += 1;
      state.lastError = sanitizeLogValue(error);
    }
  }

  return writer;
}

export function getGlobalLocalFilterHealthStatus(state: Pick<GlobalLocalFilterState, "connected" | "reconnectCount" | "backlogObserved" | "databaseWriteFailures" | "queueWriteFailures" | "lastError" | "consecutiveFastFailures">): GlobalLocalFilterHealthStatus {
  if (!state.connected && state.reconnectCount > 0) return "AISSTREAM_UNAVAILABLE";
  if (state.databaseWriteFailures >= 3) return "DATABASE_WRITE_FAILURE";
  if (state.queueWriteFailures >= 3) return "REVIEW_QUEUE_FAILURE";
  if (state.backlogObserved) return "BACKPRESSURE_RISK";
  if (state.lastError || state.databaseWriteFailures > 0 || state.queueWriteFailures > 0 || state.consecutiveFastFailures > 0) return "DEGRADED";
  return "HEALTHY";
}

export function toGlobalLocalFilterReport(state: GlobalLocalFilterState) {
  const durationMs = state.connectedDurationMs > 0 ? state.connectedDurationMs : Math.max(1, Date.now() - state.startedAt.getTime());
  const averageKb = calculateAverageKbPerSecond(state.totalBytesReceived, durationMs);
  const projection = calculateNetworkProjection(state.totalBytesReceived, durationMs);
  const finalLastError = state.endedAt && (state.closeCode === 1000 || state.closeReason === "global-local-filter runtime complete" || state.lastError === "[object ErrorEvent]") ? null : state.lastError;
  return {
    mode: GLOBAL_LOCAL_FILTER_MODE,
    status: getGlobalLocalFilterHealthStatus({ ...state, lastError: finalLastError }),
    connectedDurationMs: durationMs,
    messagesReceived: state.messagesReceived,
    messagesPerSecond: round(state.messagesReceived / (durationMs / 1000)),
    positionReports: state.positionReports,
    shipStaticData: state.shipStaticData,
    verifiedPositionMatches: state.verifiedPositionMatches,
    positionsStored: state.positionsStored,
    wouldStorePositions: state.wouldStorePositions,
    duplicatePositionsSkipped: state.duplicatePositionsSkipped,
    discardedNonVerifiedPositions: state.discardedNonVerifiedPositions,
    staticExactRegistryMatches: state.staticExactRegistryMatches,
    newMmsiCandidatesQueued: state.newMmsiCandidatesQueued,
    wouldQueueNewMmsiCandidates: state.wouldQueueNewMmsiCandidates,
    mmsiConflictsQueued: state.mmsiConflictsQueued,
    wouldQueueConflicts: state.wouldQueueConflicts,
    reviewQueueUpdates: state.reviewQueueUpdates,
    emissionDaysAffected: state.emissionDaysAffected,
    wouldAffectEmissionDays: state.wouldAffectEmissionDays,
    emissionRowsInserted: state.emissionRowsInserted,
    emissionRowsUpdated: state.emissionRowsUpdated,
    emissionWriteFailures: state.emissionWriteFailures,
    batchFlushes: state.batchFlushes,
    pendingWriteBuffer: state.pendingWriteBuffer,
    reconnectCount: state.reconnectCount,
    lastError: finalLastError ?? "none",
    inboundBytes: state.totalBytesReceived,
    averageKbPerSecond: round(averageKb),
    peakKbPerSecond: round(state.peakOneSecondBytes / 1024),
    projectedGbPerDay: projection.gbPerDay,
    projectedGbPer30DayMonth: projection.gbPer30DayMonth,
    processCpuAveragePercent: round(state.averageCpuPercent),
    processCpuPeakPercent: round(state.peakCpuPercent),
    rssStartPeakEndMb: [state.memoryStartMb, state.memoryPeakMb, state.memoryEndMb],
    eventLoopP95Ms: round(state.eventLoopP95Ms),
    databaseWriteBatches: state.databaseWriteBatches,
    databaseWriteFailures: state.databaseWriteFailures,
    queueWriteFailures: state.queueWriteFailures,
    databaseWritesAttempted: state.databaseWritesAttempted,
    databaseWritesCompleted: state.databaseWritesCompleted,
    backlogObserved: state.backlogObserved
  };
}

export function formatGlobalLocalFilterReport(report: ReturnType<typeof toGlobalLocalFilterReport>) {
  return [
    "Cruise global-local-filter ingest",
    `Status: ${report.status}`,
    `Messages: ${report.messagesReceived}`,
    `Messages/sec: ${report.messagesPerSecond}`,
    `PositionReport/ShipStaticData: ${report.positionReports}/${report.shipStaticData}`,
    `Verified position matches: ${report.verifiedPositionMatches}`,
    `Positions stored/would store: ${report.positionsStored}/${report.wouldStorePositions}`,
    `Duplicate positions skipped: ${report.duplicatePositionsSkipped}`,
    `Discarded non-verified positions: ${report.discardedNonVerifiedPositions}`,
    `Static exact registry matches: ${report.staticExactRegistryMatches}`,
    `New MMSI candidates queued/would queue: ${report.newMmsiCandidatesQueued}/${report.wouldQueueNewMmsiCandidates}`,
    `MMSI conflicts queued/would queue: ${report.mmsiConflictsQueued}/${report.wouldQueueConflicts}`,
    `Review queue updates: ${report.reviewQueueUpdates}`,
    `Emission days affected/would affect: ${report.emissionDaysAffected}/${report.wouldAffectEmissionDays}`,
    `Emission rows inserted/updated/failures: ${report.emissionRowsInserted}/${report.emissionRowsUpdated}/${report.emissionWriteFailures}`,
    `Inbound KB/sec avg/peak: ${report.averageKbPerSecond}/${report.peakKbPerSecond}`,
    `Projected GB/day/month: ${report.projectedGbPerDay}/${report.projectedGbPer30DayMonth}`,
    `CPU avg/peak %: ${report.processCpuAveragePercent}/${report.processCpuPeakPercent}`,
    `RSS start/peak/end MB: ${report.rssStartPeakEndMb.join("/")}`,
    `Event-loop p95 ms: ${report.eventLoopP95Ms}`,
    `Database writes attempted/completed: ${report.databaseWritesAttempted}/${report.databaseWritesCompleted}`,
    `Last error: ${report.lastError}`
  ].join("\n") + "\n";
}

export async function cleanupGlobalLocalFilterData(options: { retentionDays: number; apply: boolean; now?: Date }) {
  const now = options.now ?? new Date();
  const cutoff = new Date(now.getTime() - options.retentionDays * 24 * 60 * 60 * 1000);
  const rows = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS count
    FROM cruise_positions p
    INNER JOIN cruise_vessel_verifications v ON v.ship_id = p.ship_id
    INNER JOIN cruise_vessel_registry_entries r ON r.id = v.registry_entry_id
    WHERE p.timestamp < ${cutoff}
      AND v.verification_status = 'VERIFIED_OCEAN_CRUISE'
      AND v.confidence = 'HIGH'
      AND r.registry_decision = 'ACCEPT'
      AND r.imo = (SELECT s.imo FROM cruise_ships s WHERE s.id = p.ship_id)
  `;
  const count = Number(rows[0]?.count ?? 0);
  if (!options.apply) return { apply: false, cutoff, rowsMatched: count, rowsDeleted: 0 };
  const deleted = await prisma.$executeRaw`
    DELETE FROM cruise_positions p
    USING cruise_vessel_verifications v, cruise_vessel_registry_entries r, cruise_ships s
    WHERE v.ship_id = p.ship_id
      AND r.id = v.registry_entry_id
      AND s.id = p.ship_id
      AND p.timestamp < ${cutoff}
      AND v.verification_status = 'VERIFIED_OCEAN_CRUISE'
      AND v.confidence = 'HIGH'
      AND r.registry_decision = 'ACCEPT'
      AND r.imo = s.imo
  `;
  return { apply: true, cutoff, rowsMatched: count, rowsDeleted: deleted };
}

async function loadGlobalLocalFilterLookup(): Promise<VerifiedCruiseLookup> {
  const verifiedRows = await prisma.$queryRaw<Array<{ ship_id: string; mmsi: string | null }>>`
    SELECT s.id AS ship_id, s.mmsi
    FROM cruise_ships s
    INNER JOIN cruise_vessel_verifications v ON v.ship_id = s.id
    INNER JOIN cruise_vessel_registry_entries r ON r.id = v.registry_entry_id
    WHERE v.verification_status = 'VERIFIED_OCEAN_CRUISE'
      AND v.confidence = 'HIGH'
      AND r.registry_decision = 'ACCEPT'
      AND r.imo = s.imo
      AND s.mmsi IS NOT NULL
  `;
  const registryRows = await prisma.$queryRaw<Array<{ registry_entry_id: string; imo: string; linked_mmsi: string | null }>>`
    SELECT r.id AS registry_entry_id, r.imo, MAX(s.mmsi) AS linked_mmsi
    FROM cruise_vessel_registry_entries r
    LEFT JOIN cruise_vessel_verifications v ON v.registry_entry_id = r.id
    LEFT JOIN cruise_ships s ON s.id = v.ship_id
    WHERE r.registry_decision = 'ACCEPT'
    GROUP BY r.id, r.imo
  `;
  return {
    mmsiToShip: new Map(verifiedRows.filter((row) => isValidMmsi(row.mmsi)).map((row) => [row.mmsi as string, { shipId: row.ship_id }])),
    acceptedRegistryByImo: new Map(
      registryRows
        .filter((row) => isValidImoWithChecksum(row.imo))
        .map((row) => [row.imo, { registryEntryId: row.registry_entry_id, linkedMmsi: isValidMmsi(row.linked_mmsi) ? row.linked_mmsi : null }])
    )
  };
}

async function assertGlobalLocalFilterWriteTablesExist() {
  const rows = await prisma.$queryRaw<Array<{ queue_exists: boolean }>>`
    SELECT to_regclass('public.cruise_static_data_review_queue') IS NOT NULL AS queue_exists
  `;
  if (rows[0]?.queue_exists) return;
  throw new Error("Write-enabled global-local-filter requires the reviewed cruise_static_data_review_queue migration to be applied first. Dry-run remains available.");
}

async function upsertStaticReviewQueueItem(item: StaticQueueItem) {
  await prisma.$executeRaw`
    INSERT INTO cruise_static_data_review_queue (
      id,
      registry_entry_id,
      observed_mmsi,
      observed_at,
      classification,
      source,
      first_seen_at,
      last_seen_at,
      occurrence_count,
      review_status,
      created_at,
      updated_at
    )
    VALUES (
      ${randomUUID()},
      ${item.registryEntryId},
      ${item.observedMmsi},
      ${item.observedAt},
      ${item.classification}::"CruiseStaticReviewClassification",
      ${GLOBAL_LOCAL_FILTER_SOURCE},
      ${item.observedAt},
      ${item.observedAt},
      1,
      'PENDING'::"CruiseStaticReviewStatus",
      NOW(),
      NOW()
    )
    ON CONFLICT (registry_entry_id, observed_mmsi, classification)
    DO UPDATE SET
      last_seen_at = EXCLUDED.last_seen_at,
      observed_at = EXCLUDED.observed_at,
      occurrence_count = cruise_static_data_review_queue.occurrence_count + 1,
      updated_at = NOW()
  `;
}

function extractVerifiedPosition(payload: AisMessage, shipId: string, mmsi: string): GlobalLocalFilterPosition | null {
  const report = payload.Message?.PositionReport;
  if (!report) return null;
  const latitude = Number(readValue(report, "Latitude", "latitude") ?? payload.MetaData?.latitude);
  const longitude = Number(readValue(report, "Longitude", "longitude") ?? payload.MetaData?.longitude);
  const timestamp = normalizeTimestamp(payload.MetaData?.time_utc) ?? new Date();
  const speedOverGround = optionalNumber(readValue(report, "Sog", "SpeedOverGround"));
  const courseOverGround = optionalNumber(readValue(report, "Cog", "CourseOverGround"));
  const heading = optionalInteger(readValue(report, "TrueHeading", "Heading"));
  return {
    shipId,
    mmsi,
    latitude,
    longitude,
    speedOverGround,
    courseOverGround,
    heading,
    navigationalStatus: stringifyOptional(readValue(report, "NavigationalStatus")),
    destination: stringifyOptional(readValue(report, "Destination")),
    timestamp,
    dedupeKey: [mmsi, timestamp.toISOString(), Number.isFinite(latitude) ? latitude.toFixed(4) : "bad-lat", Number.isFinite(longitude) ? longitude.toFixed(4) : "bad-lon"].join(":")
  };
}

function getPositionIssue(position: GlobalLocalFilterPosition) {
  if (!Number.isFinite(position.latitude) || !Number.isFinite(position.longitude)) return "invalid-coordinate";
  if (position.latitude < -90 || position.latitude > 90 || position.longitude < -180 || position.longitude > 180) return "invalid-coordinate";
  if (position.latitude === 0 && position.longitude === 0) return "zero-island-coordinate";
  if (position.speedOverGround !== null && position.speedOverGround > 45) return "speed-over-45-knots";
  if (Number.isNaN(position.timestamp.getTime())) return "invalid-timestamp";
  return null;
}

function extractMmsi(payload: AisMessage) {
  const value = payload.MetaData?.MMSI ?? payload.Message?.PositionReport?.UserID ?? payload.Message?.PositionReport?.MMSI ?? payload.Message?.ShipStaticData?.UserID ?? payload.Message?.ShipStaticData?.MMSI;
  const normalized = String(value ?? "").trim();
  return isValidMmsi(normalized) ? normalized : null;
}

function extractImo(payload: AisMessage) {
  const value = payload.Message?.ShipStaticData?.ImoNumber ?? payload.Message?.ShipStaticData?.IMO;
  const normalized = String(value ?? "").replace(/^IMO/i, "").trim();
  return /^\d{7}$/.test(normalized) ? normalized : null;
}

function readValue(record: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    if (record[key] !== undefined) return record[key];
    const found = Object.keys(record).find((candidate) => candidate.toLowerCase() === key.toLowerCase());
    if (found) return record[found];
  }
  return undefined;
}

function optionalNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function optionalInteger(value: unknown) {
  const parsed = optionalNumber(value);
  return parsed === null ? null : Math.round(parsed);
}

function stringifyOptional(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  return String(value).trim() || null;
}

function normalizeTimestamp(value: unknown) {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function isValidMmsi(value: string | null | undefined): value is string {
  return typeof value === "string" && /^\d{9}$/.test(value) && value !== "000000000";
}

function shipDayKey(shipId: string, date: Date) {
  return `${shipId}|${new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())).toISOString()}`;
}

function updateOneSecondRate(state: GlobalLocalFilterState, byteLength: number) {
  const now = Date.now();
  if (now - state.lastSecondStartedAt >= 1000) {
    state.peakOneSecondRate = Math.max(state.peakOneSecondRate, state.secondWindowMessages);
    state.peakOneSecondBytes = Math.max(state.peakOneSecondBytes, state.secondWindowBytes);
    state.secondWindowMessages = 0;
    state.secondWindowBytes = 0;
    state.lastSecondStartedAt = now;
  }
  state.secondWindowMessages += 1;
  state.secondWindowBytes += byteLength;
}

function updateRuntimeHealth(state: GlobalLocalFilterState) {
  state.memoryPeakMb = Math.max(state.memoryPeakMb, getRssMb());
}

function updateIntervalCpu(state: GlobalLocalFilterState) {
  const now = Date.now();
  const current = process.cpuUsage();
  const cpuPercent = calculateProcessCpuPercent(current.user - state.cpuLastInterval.user + current.system - state.cpuLastInterval.system, now - state.lastCpuIntervalAtMs);
  state.latestCpuPercent = cpuPercent;
  state.peakCpuPercent = Math.max(state.peakCpuPercent, cpuPercent);
  state.cpuLastInterval = current;
  state.lastCpuIntervalAtMs = now;
}

function resetInterval(state: GlobalLocalFilterState) {
  state.intervalMessages = 0;
  state.intervalBytes = 0;
}

function printGlobalLocalFilterStatus(state: GlobalLocalFilterState) {
  const report = toGlobalLocalFilterReport(state);
  console.log(
    [
      `mode=${GLOBAL_LOCAL_FILTER_MODE}`,
      `connected=${state.connected}`,
      `messagesReceived=${state.messagesReceived}`,
      `messagesPerSecond=${report.messagesPerSecond}`,
      `positionReports=${state.positionReports}`,
      `shipStaticData=${state.shipStaticData}`,
      `verifiedPositionMatches=${state.verifiedPositionMatches}`,
      `positionsStored=${state.positionsStored}`,
      `duplicatePositionsSkipped=${state.duplicatePositionsSkipped}`,
      `discardedNonVerifiedPositions=${state.discardedNonVerifiedPositions}`,
      `staticExactRegistryMatches=${state.staticExactRegistryMatches}`,
      `newMmsiCandidatesQueued=${state.newMmsiCandidatesQueued}`,
      `mmsiConflictsQueued=${state.mmsiConflictsQueued}`,
      `reviewQueueUpdates=${state.reviewQueueUpdates}`,
      `emissionDaysAffected=${state.emissionDaysAffected}`,
      `emissionRowsInserted=${state.emissionRowsInserted}`,
      `emissionRowsUpdated=${state.emissionRowsUpdated}`,
      `emissionWriteFailures=${state.emissionWriteFailures}`,
      `batchFlushes=${state.batchFlushes}`,
      `pendingWriteBuffer=${state.pendingWriteBuffer}`,
      `reconnectCount=${state.reconnectCount}`,
      `lastError=${state.lastError ?? "none"}`,
      `rssMB=${state.memoryPeakMb}`,
      `eventLoopP95Ms=${round(state.eventLoopP95Ms)}`,
      `kbSec=${report.averageKbPerSecond}`,
      `projectedGbDay=${report.projectedGbPerDay}`,
      `projectedGbMonth=${report.projectedGbPer30DayMonth}`,
      `databaseWriteBatches=${state.databaseWriteBatches}`,
      `databaseWriteFailures=${state.databaseWriteFailures}`,
      `queueWriteFailures=${state.queueWriteFailures}`,
      `backlogObserved=${state.backlogObserved}`,
      `status=${report.status}`
    ].join(" | ")
  );
}

function getReconnectDelayMs(failures: number) {
  return Math.min(10 * 60 * 1000, Math.max(1000, 1000 * 2 ** Math.min(8, failures)));
}

function sanitizeLogValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "";
  const text = value instanceof Error ? value.message : String(value);
  return text.replace(/[\r\n]+/g, " ").replace(/\d{7,9}/g, "[redacted-id]").slice(0, 180);
}

function getRssMb() {
  return round(process.memoryUsage().rss / 1024 / 1024);
}

function nsToMs(value: number) {
  return Number.isFinite(value) ? value / 1_000_000 : 0;
}

function round(value: number) {
  return Math.round(value * 10) / 10;
}
