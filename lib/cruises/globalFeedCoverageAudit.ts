import { monitorEventLoopDelay } from "node:perf_hooks";
import { AISSTREAM_ENDPOINT, getAisStreamApiKey } from "@/lib/cruises/config";
import { VERIFIED_GLOBAL_BOUNDING_BOX, messageDataToString, usesExactVerifiedGlobalBoundingBox } from "@/lib/cruises/aisstream";
import { calculateAverageKbPerSecond, calculateNetworkProjection, calculateProcessCpuPercent, getUtf8ByteLength } from "@/lib/cruises/globalFeedBenchmark";
import { isValidImoWithChecksum } from "@/lib/cruises/registry";
import { prisma } from "@/lib/prisma";

export const GLOBAL_FEED_COVERAGE_AUDIT_DEFAULT_RUNTIME_MS = 600000;
export const GLOBAL_FEED_COVERAGE_AUDIT_MAX_RUNTIME_WITHOUT_OVERRIDE_MS = 30 * 60 * 1000;
export const GLOBAL_FEED_COVERAGE_AUDIT_DEFAULT_REPORT_INTERVAL_MS = 10000;
export const GLOBAL_FEED_COVERAGE_AUDIT_DEFAULT_RECENT_DAYS = 7;
export const GLOBAL_FEED_COVERAGE_AUDIT_CONNECTION_LABEL = "global-feed-coverage-audit";
export const GLOBAL_FEED_COVERAGE_AUDIT_MESSAGE_TYPES = ["PositionReport", "ShipStaticData"] as const;

export type GlobalFeedCoverageAuditFormat = "terminal" | "json" | "markdown";
export type StaticRegistryMatchClassification =
  | "ALREADY_LINKED_MMSI"
  | "NEW_MMSI_CANDIDATE_FOR_EXISTING_REGISTRY_ENTRY"
  | "MMSI_CONFLICT_REVIEW_REQUIRED";
export type GlobalFeedCoverageVerdict =
  | "STRONG_SIGNAL_FOR_GLOBAL_LOCAL_FILTER"
  | "PROMISING_BUT_NEEDS_LONGER_AUDIT"
  | "INSUFFICIENT_EVIDENCE"
  | "DATA_PATH_PROBLEM";

export type GlobalFeedCoverageAuditOptions = {
  maxRuntimeMs: number;
  reportIntervalMs: number;
  format: GlobalFeedCoverageAuditFormat;
  recentDays: number;
};

export type CoverageRegistryState = {
  acceptedRegistryImoSet: Set<string>;
  registryCoverageStateByImo: Map<string, { hasLinkedMmsi: boolean; linkedMmsi: string | null; publicEligible: boolean }>;
  verifiedMmsiToImo: Map<string, string>;
  acceptedRegistryVessels: number;
  acceptedRegistryVesselsWithExistingLinkedMmsi: number;
  acceptedRegistryVesselsWithoutLinkedMmsi: number;
  verifiedPublicEligibleVessels: number;
};

type MemorySnapshotMb = {
  rss: number;
  heapUsed: number;
  heapTotal: number;
  external: number;
};

type CoverageAuditState = {
  startedAt: Date;
  endedAt: Date | null;
  requestedRuntimeMs: number;
  socketOpened: boolean;
  subscriptionSent: boolean;
  connectedDurationMs: number;
  closeCode: number | null;
  closeReason: string | null;
  errors: string[];
  reconnectCount: 0;
  totalMessages: number;
  totalBytesReceived: number;
  malformedMessages: number;
  messagesMissingUsableMmsi: number;
  messagesMissingUsableImo: number;
  messagesByType: Record<string, number>;
  positionReportMessages: number;
  shipStaticDataMessages: number;
  knownVerifiedMmsiPositionMatches: number;
  nonVerifiedPositionMessagesDiscarded: number;
  distinctVerifiedMmsisObserved: Set<string>;
  linkedRegistryImosObservedByPosition: Set<string>;
  checksumValidImoValuesSeen: number;
  exactAcceptedRegistryStaticMatches: number;
  distinctAcceptedRegistryImosSeenViaStaticData: Set<string>;
  staticMatchesAlreadyLinkedToSameMmsi: number;
  newMmsiCandidatesForExistingRegistryEntry: number;
  mmsiConflictReviewRequired: number;
  nonRegistryStaticMessagesDiscarded: number;
  combinedObservedRegistryImos: Set<string>;
  peakOneSecondRate: number;
  recentIntervalRate: number;
  intervalMessages: number;
  intervalBytes: number;
  intervalPositionReports: number;
  intervalStaticMessages: number;
  intervalVerifiedMatches: number;
  intervalStaticMatches: number;
  intervalNewCandidates: number;
  intervalConflicts: number;
  secondWindowMessages: number;
  secondWindowBytes: number;
  lastSecondStartedAt: number;
  peakOneSecondBytes: number;
  memoryStart: MemorySnapshotMb;
  memoryPeak: MemorySnapshotMb;
  memoryEnd: MemorySnapshotMb;
  cpuStart: NodeJS.CpuUsage;
  cpuLastInterval: NodeJS.CpuUsage;
  cpuEnd: NodeJS.CpuUsage | null;
  lastCpuIntervalAtMs: number;
  peakIntervalCpuPercent: number;
  latestIntervalCpuPercent: number;
  averageCpuPercent: number;
  eventLoopMeanMs: number;
  eventLoopP95Ms: number;
  eventLoopMaxMs: number;
  unhandledErrors: number;
  peakPendingMessages: number;
  backlogObserved: boolean;
  databaseWritesAttempted: 0;
  databaseWritesCompleted: 0;
};

type AisCoverageMessage = {
  MessageType?: string;
  MetaData?: { MMSI?: number | string };
  Message?: {
    PositionReport?: Record<string, unknown>;
    ShipStaticData?: Record<string, unknown>;
    StandardClassBPositionReport?: Record<string, unknown>;
  };
};

export function validateGlobalFeedCoverageAuditOptions(options: { maxRuntimeMs: number; reportIntervalMs?: number; recentDays?: number; allowLongRun?: boolean }) {
  if (!Number.isFinite(options.maxRuntimeMs) || options.maxRuntimeMs <= 0) throw new Error("--max-runtime-ms requires a positive number.");
  if (options.maxRuntimeMs > GLOBAL_FEED_COVERAGE_AUDIT_MAX_RUNTIME_WITHOUT_OVERRIDE_MS && !options.allowLongRun) {
    throw new Error("Coverage audit runtimes over 30 minutes require --allow-long-run.");
  }
  if (options.reportIntervalMs !== undefined && (!Number.isFinite(options.reportIntervalMs) || options.reportIntervalMs <= 0)) {
    throw new Error("--report-interval-ms requires a positive number.");
  }
  if (options.recentDays !== undefined && (!Number.isFinite(options.recentDays) || options.recentDays <= 0)) {
    throw new Error("--recent-days requires a positive number.");
  }
}

export function buildGlobalFeedCoverageAuditSubscriptionPayload(apiKey: string) {
  return {
    APIKey: apiKey,
    BoundingBoxes: [VERIFIED_GLOBAL_BOUNDING_BOX],
    FilterMessageTypes: [...GLOBAL_FEED_COVERAGE_AUDIT_MESSAGE_TYPES]
  };
}

export function getGlobalFeedCoverageSubscriptionSummary(payload: ReturnType<typeof buildGlobalFeedCoverageAuditSubscriptionPayload>, subscriptionSentAfterMs: number) {
  return {
    label: GLOBAL_FEED_COVERAGE_AUDIT_CONNECTION_LABEL,
    boundingBoxes: payload.BoundingBoxes.length,
    usesExactGlobalBoundingBox: usesExactVerifiedGlobalBoundingBox(payload.BoundingBoxes),
    coordinateOrder: "[latitude, longitude]",
    filterMessageTypes: payload.FilterMessageTypes,
    hasMmsiFilter: false,
    subscriptionSentAfterMs
  };
}

export function createGlobalFeedCoverageAuditState(options: Pick<GlobalFeedCoverageAuditOptions, "maxRuntimeMs">): CoverageAuditState {
  const memory = getMemorySnapshotMb();
  const cpuStart = process.cpuUsage();
  const now = Date.now();
  return {
    startedAt: new Date(),
    endedAt: null,
    requestedRuntimeMs: options.maxRuntimeMs,
    socketOpened: false,
    subscriptionSent: false,
    connectedDurationMs: 0,
    closeCode: null,
    closeReason: null,
    errors: [],
    reconnectCount: 0,
    totalMessages: 0,
    totalBytesReceived: 0,
    malformedMessages: 0,
    messagesMissingUsableMmsi: 0,
    messagesMissingUsableImo: 0,
    messagesByType: {},
    positionReportMessages: 0,
    shipStaticDataMessages: 0,
    knownVerifiedMmsiPositionMatches: 0,
    nonVerifiedPositionMessagesDiscarded: 0,
    distinctVerifiedMmsisObserved: new Set(),
    linkedRegistryImosObservedByPosition: new Set(),
    checksumValidImoValuesSeen: 0,
    exactAcceptedRegistryStaticMatches: 0,
    distinctAcceptedRegistryImosSeenViaStaticData: new Set(),
    staticMatchesAlreadyLinkedToSameMmsi: 0,
    newMmsiCandidatesForExistingRegistryEntry: 0,
    mmsiConflictReviewRequired: 0,
    nonRegistryStaticMessagesDiscarded: 0,
    combinedObservedRegistryImos: new Set(),
    peakOneSecondRate: 0,
    recentIntervalRate: 0,
    intervalMessages: 0,
    intervalBytes: 0,
    intervalPositionReports: 0,
    intervalStaticMessages: 0,
    intervalVerifiedMatches: 0,
    intervalStaticMatches: 0,
    intervalNewCandidates: 0,
    intervalConflicts: 0,
    secondWindowMessages: 0,
    secondWindowBytes: 0,
    lastSecondStartedAt: Date.now(),
    peakOneSecondBytes: 0,
    memoryStart: memory,
    memoryPeak: memory,
    memoryEnd: memory,
    cpuStart,
    cpuLastInterval: cpuStart,
    cpuEnd: null,
    lastCpuIntervalAtMs: now,
    peakIntervalCpuPercent: 0,
    latestIntervalCpuPercent: 0,
    averageCpuPercent: 0,
    eventLoopMeanMs: 0,
    eventLoopP95Ms: 0,
    eventLoopMaxMs: 0,
    unhandledErrors: 0,
    peakPendingMessages: 0,
    backlogObserved: false,
    databaseWritesAttempted: 0,
    databaseWritesCompleted: 0
  };
}

export async function runGlobalFeedCoverageAudit(options: GlobalFeedCoverageAuditOptions) {
  const apiKey = getAisStreamApiKey();
  if (!apiKey) throw new Error("Missing AISSTREAM_API_KEY.");
  console.warn("Global feed coverage audit is read-only. Stop benchmark/discovery/hybrid/verified-global workers before starting to avoid AISStream connection-limit interference.");

  const registryState = await loadCoverageRegistryState();
  const state = createGlobalFeedCoverageAuditState(options);
  const histogram = monitorEventLoopDelay({ resolution: 20 });
  histogram.enable();
  const startedAtMs = Date.now();
  let pendingMessages = 0;

  await new Promise<void>((resolve) => {
    const socket = new WebSocket(AISSTREAM_ENDPOINT);
    let resolved = false;
    const runtimeTimer = setTimeout(() => {
      socket.close(1000, "coverage audit runtime complete");
      finish();
    }, options.maxRuntimeMs);
    const reportTimer = setInterval(() => {
      updateRuntimeHealth(state);
      updateIntervalCpu(state);
      state.eventLoopP95Ms = nsToMs(histogram.percentile(95));
      state.eventLoopMaxMs = nsToMs(histogram.max);
      state.recentIntervalRate = state.intervalMessages / Math.max(1, options.reportIntervalMs / 1000);
      const recentIntervalKbPerSecond = bytesToKb(state.intervalBytes) / Math.max(1, options.reportIntervalMs / 1000);
      printCoverageLiveStatus(state, recentIntervalKbPerSecond);
      resetIntervalCounters(state);
    }, options.reportIntervalMs);
    runtimeTimer.unref?.();
    reportTimer.unref?.();

    const finish = () => {
      if (resolved) return;
      resolved = true;
      clearTimeout(runtimeTimer);
      clearInterval(reportTimer);
      state.endedAt = new Date();
      state.connectedDurationMs = Date.now() - startedAtMs;
      state.cpuEnd = process.cpuUsage(state.cpuStart);
      state.averageCpuPercent = calculateProcessCpuPercent(state.cpuEnd.user + state.cpuEnd.system, state.connectedDurationMs);
      state.memoryEnd = getMemorySnapshotMb();
      state.memoryPeak = maxMemorySnapshot(state.memoryPeak, state.memoryEnd);
      state.eventLoopMeanMs = nsToMs(histogram.mean);
      state.eventLoopP95Ms = nsToMs(histogram.percentile(95));
      state.eventLoopMaxMs = nsToMs(histogram.max);
      histogram.disable();
      resolve();
    };

    socket.addEventListener("open", () => {
      state.socketOpened = true;
      const openedAtMs = Date.now();
      const payload = buildGlobalFeedCoverageAuditSubscriptionPayload(apiKey);
      socket.send(JSON.stringify(payload));
      state.subscriptionSent = true;
      const summary = getGlobalFeedCoverageSubscriptionSummary(payload, Date.now() - openedAtMs);
      console.log(`AISStream global coverage audit connected | subscription=${JSON.stringify(summary)}`);
    });

    socket.addEventListener("message", (event) => {
      pendingMessages += 1;
      state.peakPendingMessages = Math.max(state.peakPendingMessages, pendingMessages);
      if (pendingMessages > 1000) state.backlogObserved = true;
      void handleCoverageAuditMessage(event, registryState, state)
        .catch((error) => {
          state.unhandledErrors += 1;
          state.errors.push(sanitizeLogValue(error));
        })
        .finally(() => {
          pendingMessages -= 1;
        });
    });

    socket.addEventListener("close", (event) => {
      state.closeCode = typeof event.code === "number" ? event.code : null;
      state.closeReason = sanitizeLogValue(event.reason) || null;
      finish();
    });

    socket.addEventListener("error", (event) => {
      state.errors.push(sanitizeLogValue(event));
      finish();
    });
  });

  updateRuntimeHealth(state);
  return toSerializableCoverageAuditReport(state, registryState, options);
}

export async function handleCoverageAuditMessage(event: unknown, registryState: CoverageRegistryState, state: CoverageAuditState) {
  const text = await messageDataToString(event);
  if (!text) {
    state.malformedMessages += 1;
    return;
  }
  const byteLength = getUtf8ByteLength(text);
  state.totalBytesReceived += byteLength;
  state.intervalBytes += byteLength;

  let payload: AisCoverageMessage;
  try {
    payload = JSON.parse(text) as AisCoverageMessage;
  } catch {
    state.malformedMessages += 1;
    return;
  }

  state.totalMessages += 1;
  state.intervalMessages += 1;
  updateOneSecondRate(state, byteLength);
  updateRuntimeHealth(state);

  const messageType = payload.MessageType || "Unknown";
  state.messagesByType[messageType] = (state.messagesByType[messageType] ?? 0) + 1;
  if (messageType === "PositionReport") handleCoveragePositionReport(payload, registryState, state);
  if (messageType === "ShipStaticData") handleCoverageShipStaticData(payload, registryState, state);
}

export function handleCoveragePositionReport(payload: AisCoverageMessage, registryState: CoverageRegistryState, state: CoverageAuditState) {
  state.positionReportMessages += 1;
  state.intervalPositionReports += 1;
  const mmsi = extractCoverageMmsi(payload);
  if (!mmsi) {
    state.messagesMissingUsableMmsi += 1;
    state.nonVerifiedPositionMessagesDiscarded += 1;
    return;
  }
  const imo = registryState.verifiedMmsiToImo.get(mmsi);
  if (!imo) {
    state.nonVerifiedPositionMessagesDiscarded += 1;
    return;
  }
  state.knownVerifiedMmsiPositionMatches += 1;
  state.intervalVerifiedMatches += 1;
  state.distinctVerifiedMmsisObserved.add(mmsi);
  state.linkedRegistryImosObservedByPosition.add(imo);
  state.combinedObservedRegistryImos.add(imo);
}

export function handleCoverageShipStaticData(payload: AisCoverageMessage, registryState: CoverageRegistryState, state: CoverageAuditState) {
  state.shipStaticDataMessages += 1;
  state.intervalStaticMessages += 1;
  const mmsi = extractCoverageMmsi(payload);
  if (!mmsi) state.messagesMissingUsableMmsi += 1;
  const imo = extractCoverageImo(payload);
  if (!imo || !isValidImoWithChecksum(imo)) {
    state.messagesMissingUsableImo += 1;
    state.nonRegistryStaticMessagesDiscarded += 1;
    return;
  }
  state.checksumValidImoValuesSeen += 1;
  if (!registryState.acceptedRegistryImoSet.has(imo)) {
    state.nonRegistryStaticMessagesDiscarded += 1;
    return;
  }

  state.exactAcceptedRegistryStaticMatches += 1;
  state.intervalStaticMatches += 1;
  state.distinctAcceptedRegistryImosSeenViaStaticData.add(imo);
  state.combinedObservedRegistryImos.add(imo);
  const registryEntry = registryState.registryCoverageStateByImo.get(imo);
  const classification = classifyStaticRegistryMatch(registryEntry?.linkedMmsi ?? null, mmsi);
  if (classification === "ALREADY_LINKED_MMSI") state.staticMatchesAlreadyLinkedToSameMmsi += 1;
  if (classification === "NEW_MMSI_CANDIDATE_FOR_EXISTING_REGISTRY_ENTRY") {
    state.newMmsiCandidatesForExistingRegistryEntry += 1;
    state.intervalNewCandidates += 1;
  }
  if (classification === "MMSI_CONFLICT_REVIEW_REQUIRED") {
    state.mmsiConflictReviewRequired += 1;
    state.intervalConflicts += 1;
  }
}

export function classifyStaticRegistryMatch(linkedMmsi: string | null, observedMmsi: string | null): StaticRegistryMatchClassification | null {
  if (linkedMmsi && observedMmsi && linkedMmsi === observedMmsi) return "ALREADY_LINKED_MMSI";
  if (linkedMmsi && observedMmsi && linkedMmsi !== observedMmsi) return "MMSI_CONFLICT_REVIEW_REQUIRED";
  if (!linkedMmsi && observedMmsi) return "NEW_MMSI_CANDIDATE_FOR_EXISTING_REGISTRY_ENTRY";
  return null;
}

export function extractCoverageMmsi(payload: AisCoverageMessage) {
  const value =
    payload.MetaData?.MMSI ??
    payload.Message?.PositionReport?.UserID ??
    payload.Message?.PositionReport?.MMSI ??
    payload.Message?.ShipStaticData?.UserID ??
    payload.Message?.ShipStaticData?.MMSI ??
    payload.Message?.StandardClassBPositionReport?.UserID ??
    payload.Message?.StandardClassBPositionReport?.MMSI;
  const normalized = String(value ?? "").trim();
  return /^\d{9}$/.test(normalized) && normalized !== "000000000" ? normalized : null;
}

export function extractCoverageImo(payload: AisCoverageMessage) {
  const value = payload.Message?.ShipStaticData?.ImoNumber ?? payload.Message?.ShipStaticData?.IMO ?? payload.Message?.PositionReport?.ImoNumber ?? payload.Message?.PositionReport?.IMO;
  const normalized = String(value ?? "").replace(/^IMO/i, "").trim();
  return /^\d{7}$/.test(normalized) && normalized !== "0000000" ? normalized : null;
}

export function getCoverageVerdict(input: {
  requestedRuntimeMs: number;
  connectedDurationMs: number;
  socketOpened: boolean;
  subscriptionSent: boolean;
  reconnectCount: number;
  unhandledErrors: number;
  backlogObserved: boolean;
  eventLoopP95Ms: number;
  closeCode: number | null;
  positionReportMessages: number;
  shipStaticDataMessages: number;
  knownVerifiedMmsiPositionMatches: number;
  exactAcceptedRegistryStaticMatches: number;
  checksumValidImoValuesSeen: number;
}) {
  const stable =
    input.socketOpened &&
    input.subscriptionSent &&
    input.reconnectCount === 0 &&
    input.unhandledErrors === 0 &&
    !input.backlogObserved &&
    input.eventLoopP95Ms <= 100 &&
    (!input.closeCode || input.closeCode === 1000 || input.connectedDurationMs >= input.requestedRuntimeMs * 0.95);
  if (!stable) return "DATA_PATH_PROBLEM" satisfies GlobalFeedCoverageVerdict;
  if (input.positionReportMessages === 0 || input.shipStaticDataMessages === 0) return "DATA_PATH_PROBLEM" satisfies GlobalFeedCoverageVerdict;
  if (input.connectedDurationMs < input.requestedRuntimeMs * 0.95) return "INSUFFICIENT_EVIDENCE" satisfies GlobalFeedCoverageVerdict;
  if (input.knownVerifiedMmsiPositionMatches > 0 && (input.exactAcceptedRegistryStaticMatches > 0 || input.checksumValidImoValuesSeen > 0)) {
    return "STRONG_SIGNAL_FOR_GLOBAL_LOCAL_FILTER" satisfies GlobalFeedCoverageVerdict;
  }
  if (input.knownVerifiedMmsiPositionMatches > 0 || input.checksumValidImoValuesSeen > 0) {
    return "PROMISING_BUT_NEEDS_LONGER_AUDIT" satisfies GlobalFeedCoverageVerdict;
  }
  return "INSUFFICIENT_EVIDENCE" satisfies GlobalFeedCoverageVerdict;
}

export function toSerializableCoverageAuditReport(state: CoverageAuditState, registryState: CoverageRegistryState, options: GlobalFeedCoverageAuditOptions) {
  const averageMessagesPerSecond = state.connectedDurationMs > 0 ? state.totalMessages / (state.connectedDurationMs / 1000) : 0;
  const averageInboundKbPerSecond = calculateAverageKbPerSecond(state.totalBytesReceived, state.connectedDurationMs);
  const networkProjection = calculateNetworkProjection(state.totalBytesReceived, state.connectedDurationMs);
  const linkedObserved = state.linkedRegistryImosObservedByPosition.size;
  const unlinkedObserved = [...state.combinedObservedRegistryImos].filter((imo) => !registryState.registryCoverageStateByImo.get(imo)?.hasLinkedMmsi).length;
  const verdict = getCoverageVerdict({
    requestedRuntimeMs: state.requestedRuntimeMs,
    connectedDurationMs: state.connectedDurationMs,
    socketOpened: state.socketOpened,
    subscriptionSent: state.subscriptionSent,
    reconnectCount: state.reconnectCount,
    unhandledErrors: state.unhandledErrors,
    backlogObserved: state.backlogObserved,
    eventLoopP95Ms: state.eventLoopP95Ms,
    closeCode: state.closeCode,
    positionReportMessages: state.positionReportMessages,
    shipStaticDataMessages: state.shipStaticDataMessages,
    knownVerifiedMmsiPositionMatches: state.knownVerifiedMmsiPositionMatches,
    exactAcceptedRegistryStaticMatches: state.exactAcceptedRegistryStaticMatches,
    checksumValidImoValuesSeen: state.checksumValidImoValuesSeen
  });
  return {
    generatedAt: (state.endedAt ?? new Date()).toISOString(),
    verdict,
    auditWindowLabel: "Observed during this audit window, not global fleet completeness.",
    options: {
      requestedRuntimeMs: options.maxRuntimeMs,
      reportIntervalMs: options.reportIntervalMs,
      recentDays: options.recentDays
    },
    subscription: getGlobalFeedCoverageSubscriptionSummary(buildGlobalFeedCoverageAuditSubscriptionPayload("[redacted]"), 0),
    connection: {
      socketOpenedSuccessfully: state.socketOpened,
      subscriptionSentSuccessfully: state.subscriptionSent,
      connectedDurationMs: state.connectedDurationMs,
      closeCode: state.closeCode,
      closeReason: state.closeReason,
      errors: state.errors,
      reconnectCount: state.reconnectCount
    },
    feedHealth: {
      totalMessages: state.totalMessages,
      averageMessagesPerSecond: round(averageMessagesPerSecond),
      peakOneSecondRate: state.peakOneSecondRate,
      messagesByType: state.messagesByType,
      malformedMessages: state.malformedMessages,
      messagesWithNoUsableMmsi: state.messagesMissingUsableMmsi,
      messagesWithNoUsableImo: state.messagesMissingUsableImo
    },
    registryCoverage: {
      acceptedRegistryVessels: registryState.acceptedRegistryVessels,
      acceptedRegistryVesselsWithExistingLinkedMmsi: registryState.acceptedRegistryVesselsWithExistingLinkedMmsi,
      acceptedRegistryVesselsWithoutLinkedMmsi: registryState.acceptedRegistryVesselsWithoutLinkedMmsi,
      verifiedPublicEligibleVessels: registryState.verifiedPublicEligibleVessels,
      distinctExistingVerifiedMmsisObserved: state.distinctVerifiedMmsisObserved.size,
      linkedVerifiedMmsisObservedPercent: percentage(state.distinctVerifiedMmsisObserved.size, registryState.acceptedRegistryVesselsWithExistingLinkedMmsi),
      linkedRegistryVesselsObservedThroughPositionReport: linkedObserved,
      positionMessageMatchesForKnownVerifiedMmsis: state.knownVerifiedMmsiPositionMatches
    },
    staticDataEnrichment: {
      totalShipStaticDataMessagesReceived: state.shipStaticDataMessages,
      checksumValidImoValuesSeen: state.checksumValidImoValuesSeen,
      exactAcceptedRegistryImoMatches: state.exactAcceptedRegistryStaticMatches,
      distinctAcceptedRegistryImosSeenViaStaticData: state.distinctAcceptedRegistryImosSeenViaStaticData.size,
      staticMatchesAlreadyLinkedToSameMmsi: state.staticMatchesAlreadyLinkedToSameMmsi,
      newMmsiCandidatesForRegistryEntriesCurrentlyLackingMmsi: state.newMmsiCandidatesForExistingRegistryEntry,
      mmsiConflictReviewRequired: state.mmsiConflictReviewRequired,
      acceptedRegistryEntriesStillUnseenInStaticData: Math.max(0, registryState.acceptedRegistryVessels - state.distinctAcceptedRegistryImosSeenViaStaticData.size)
    },
    combinedCoverage: {
      distinctRegistryVesselsObservedByEitherMethod: state.combinedObservedRegistryImos.size,
      combinedObservedRegistryCoverageRate: percentage(state.combinedObservedRegistryImos.size, registryState.acceptedRegistryVessels),
      observedCoverageAmongCurrentlyLinkedMmsiRegistryVessels: percentage(linkedObserved, registryState.acceptedRegistryVesselsWithExistingLinkedMmsi),
      observedCoverageAmongCurrentlyUnlinkedRegistryVessels: percentage(unlinkedObserved, registryState.acceptedRegistryVesselsWithoutLinkedMmsi),
      label: "Observed during this audit window, not global fleet completeness."
    },
    discoverySafety: {
      nonVerifiedPositionMessagesDiscarded: state.nonVerifiedPositionMessagesDiscarded,
      nonRegistryStaticMessagesDiscarded: state.nonRegistryStaticMessagesDiscarded,
      potentialNewMmsiCandidatesRequiringReview: state.newMmsiCandidatesForExistingRegistryEntry,
      conflictsRequiringHumanReview: state.mmsiConflictReviewRequired,
      databaseWritesAttempted: state.databaseWritesAttempted,
      databaseWritesCompleted: state.databaseWritesCompleted,
      rawPayloadRetention: false,
      unsafeMatchingUsed: false
    },
    resources: {
      inboundBytes: state.totalBytesReceived,
      inboundMb: round(bytesToMb(state.totalBytesReceived)),
      averageInboundKbPerSecond: round(averageInboundKbPerSecond),
      peakInboundKbPerSecond: round(bytesToKb(state.peakOneSecondBytes)),
      projectedGbPerDay: networkProjection.gbPerDay,
      projectedGbPer30DayMonth: networkProjection.gbPer30DayMonth,
      projectionNote: "Linear estimate based on the observed benchmark window.",
      processCpuAveragePercent: round(state.averageCpuPercent),
      processCpuPeakPercent: round(state.peakIntervalCpuPercent),
      rssStartPeakEndMb: [state.memoryStart.rss, state.memoryPeak.rss, state.memoryEnd.rss],
      heapUsedStartPeakEndMb: [state.memoryStart.heapUsed, state.memoryPeak.heapUsed, state.memoryEnd.heapUsed],
      eventLoopMeanMs: round(state.eventLoopMeanMs),
      eventLoopP95Ms: round(state.eventLoopP95Ms),
      eventLoopMaxMs: round(state.eventLoopMaxMs),
      backlogObserved: state.backlogObserved
    },
    caveats: [
      "This audit is read-only and does not prove all registry ships are reachable.",
      "Static-data matches are evidence for later review, not automatic identity updates.",
      "Coverage is observed during this audit window, not global fleet completeness."
    ]
  };
}

export function formatGlobalFeedCoverageAuditReport(report: ReturnType<typeof toSerializableCoverageAuditReport>, format: GlobalFeedCoverageAuditFormat) {
  if (format === "json") return `${JSON.stringify(report, null, 2)}\n`;
  if (format === "markdown") {
    return `# Global AISStream Coverage Audit

Generated: ${report.generatedAt}

## Executive Summary

- Verdict: **${report.verdict}**
- Accepted registry vessels: ${report.registryCoverage.acceptedRegistryVessels}
- Linked MMSI vessels: ${report.registryCoverage.acceptedRegistryVesselsWithExistingLinkedMmsi}
- Unlinked registry vessels: ${report.registryCoverage.acceptedRegistryVesselsWithoutLinkedMmsi}
- Verified MMSIs observed: ${report.registryCoverage.distinctExistingVerifiedMmsisObserved}
- Exact registry IMO static matches: ${report.staticDataEnrichment.exactAcceptedRegistryImoMatches}
- New MMSI candidates: ${report.staticDataEnrichment.newMmsiCandidatesForRegistryEntriesCurrentlyLackingMmsi}
- Conflict count: ${report.staticDataEnrichment.mmsiConflictReviewRequired}
- Combined observed registry coverage: ${report.combinedCoverage.combinedObservedRegistryCoverageRate}%
- Label: ${report.auditWindowLabel}

## Subscription

| Metric | Value |
| --- | --- |
| WebSocket connections | 1 |
| Bounding boxes | ${report.subscription.boundingBoxes} |
| Uses exact global bounding box | ${report.subscription.usesExactGlobalBoundingBox} |
| Coordinate order | ${report.subscription.coordinateOrder} |
| MMSI filter | ${report.subscription.hasMmsiFilter} |
| Message types | ${report.subscription.filterMessageTypes.join(", ")} |

## Feed Health

| Metric | Value |
| --- | ---: |
| Total messages | ${report.feedHealth.totalMessages} |
| Average messages/sec | ${report.feedHealth.averageMessagesPerSecond} |
| Peak one-second rate | ${report.feedHealth.peakOneSecondRate} |
| PositionReport messages | ${report.feedHealth.messagesByType.PositionReport ?? 0} |
| ShipStaticData messages | ${report.feedHealth.messagesByType.ShipStaticData ?? 0} |
| Malformed messages | ${report.feedHealth.malformedMessages} |
| No usable MMSI | ${report.feedHealth.messagesWithNoUsableMmsi} |
| No usable IMO | ${report.feedHealth.messagesWithNoUsableImo} |

## Static Data Enrichment

| Metric | Value |
| --- | ---: |
| Checksum-valid IMO values seen | ${report.staticDataEnrichment.checksumValidImoValuesSeen} |
| Exact accepted-registry IMO matches | ${report.staticDataEnrichment.exactAcceptedRegistryImoMatches} |
| Distinct accepted registry IMOs via static data | ${report.staticDataEnrichment.distinctAcceptedRegistryImosSeenViaStaticData} |
| Already linked confirmations | ${report.staticDataEnrichment.staticMatchesAlreadyLinkedToSameMmsi} |
| New MMSI candidates | ${report.staticDataEnrichment.newMmsiCandidatesForRegistryEntriesCurrentlyLackingMmsi} |
| Conflicts requiring review | ${report.staticDataEnrichment.mmsiConflictReviewRequired} |
| Accepted registry entries unseen in static data | ${report.staticDataEnrichment.acceptedRegistryEntriesStillUnseenInStaticData} |

## Resources

| Metric | Value |
| --- | ---: |
| Inbound bytes | ${report.resources.inboundBytes} |
| Inbound MB | ${report.resources.inboundMb} |
| Average / peak KB/sec | ${report.resources.averageInboundKbPerSecond} / ${report.resources.peakInboundKbPerSecond} |
| Projected GB/day | ${report.resources.projectedGbPerDay} |
| Projected GB/30-day month | ${report.resources.projectedGbPer30DayMonth} |
| Process CPU average / peak % | ${report.resources.processCpuAveragePercent} / ${report.resources.processCpuPeakPercent} |
| RSS start/peak/end MB | ${report.resources.rssStartPeakEndMb.join(" / ")} |
| Heap used start/peak/end MB | ${report.resources.heapUsedStartPeakEndMb.join(" / ")} |
| Event-loop mean/p95/max ms | ${report.resources.eventLoopMeanMs} / ${report.resources.eventLoopP95Ms} / ${report.resources.eventLoopMaxMs} |
| Backlog observed | ${report.resources.backlogObserved} |

## Safety

| Metric | Value |
| --- | ---: |
| Non-verified position messages discarded | ${report.discoverySafety.nonVerifiedPositionMessagesDiscarded} |
| Non-registry static messages discarded | ${report.discoverySafety.nonRegistryStaticMessagesDiscarded} |
| Database writes attempted | ${report.discoverySafety.databaseWritesAttempted} |
| Database writes completed | ${report.discoverySafety.databaseWritesCompleted} |
| Raw payload retention | ${report.discoverySafety.rawPayloadRetention} |
| Unsafe matching used | ${report.discoverySafety.unsafeMatchingUsed} |

## Caveats

${report.caveats.map((caveat) => `- ${caveat}`).join("\n")}
`;
  }
  return [
    "Global AISStream Coverage Audit",
    `Generated: ${report.generatedAt}`,
    `Verdict: ${report.verdict}`,
    `Accepted registry vessels: ${report.registryCoverage.acceptedRegistryVessels}`,
    `Linked MMSI vessels: ${report.registryCoverage.acceptedRegistryVesselsWithExistingLinkedMmsi}`,
    `Unlinked registry vessels: ${report.registryCoverage.acceptedRegistryVesselsWithoutLinkedMmsi}`,
    `Verified MMSIs observed: ${report.registryCoverage.distinctExistingVerifiedMmsisObserved}`,
    `Exact registry IMO static matches: ${report.staticDataEnrichment.exactAcceptedRegistryImoMatches}`,
    `New MMSI candidates: ${report.staticDataEnrichment.newMmsiCandidatesForRegistryEntriesCurrentlyLackingMmsi}`,
    `Conflict count: ${report.staticDataEnrichment.mmsiConflictReviewRequired}`,
    `Combined observed registry coverage: ${report.combinedCoverage.combinedObservedRegistryCoverageRate}%`,
    `Messages/sec average/peak: ${report.feedHealth.averageMessagesPerSecond}/${report.feedHealth.peakOneSecondRate}`,
    `PositionReport/ShipStaticData: ${report.feedHealth.messagesByType.PositionReport ?? 0}/${report.feedHealth.messagesByType.ShipStaticData ?? 0}`,
    `Inbound MB: ${report.resources.inboundMb}`,
    `Average/peak KB/sec: ${report.resources.averageInboundKbPerSecond}/${report.resources.peakInboundKbPerSecond}`,
    `Projected GB/day/month: ${report.resources.projectedGbPerDay}/${report.resources.projectedGbPer30DayMonth}`,
    `Process CPU average/peak %: ${report.resources.processCpuAveragePercent}/${report.resources.processCpuPeakPercent}`,
    `RSS start/peak/end MB: ${report.resources.rssStartPeakEndMb.join("/")}`,
    `Event-loop mean/p95/max ms: ${report.resources.eventLoopMeanMs}/${report.resources.eventLoopP95Ms}/${report.resources.eventLoopMaxMs}`,
    `Database writes attempted/completed: ${report.discoverySafety.databaseWritesAttempted}/${report.discoverySafety.databaseWritesCompleted}`,
    `Label: ${report.auditWindowLabel}`,
    `Caveat: ${report.caveats.join(" ")}`
  ].join("\n") + "\n";
}

async function loadCoverageRegistryState(): Promise<CoverageRegistryState> {
  const rows = await prisma.$queryRaw<
    Array<{
      imo: string;
      mmsi: string | null;
      public_eligible: boolean;
    }>
  >`
    SELECT
      r.imo,
      s.mmsi,
      CASE
        WHEN v.verification_status = 'VERIFIED_OCEAN_CRUISE'
          AND v.confidence = 'HIGH'
          AND r.registry_decision = 'ACCEPT'
          AND r.imo = s.imo
        THEN true
        ELSE false
      END AS public_eligible
    FROM cruise_vessel_registry_entries r
    LEFT JOIN cruise_vessel_verifications v ON v.registry_entry_id = r.id
    LEFT JOIN cruise_ships s ON s.id = v.ship_id
    WHERE r.registry_decision = 'ACCEPT'
      AND r.imo ~ '^[0-9]{7}$'
  `;

  const acceptedRegistryImoSet = new Set<string>();
  const registryCoverageStateByImo = new Map<string, { hasLinkedMmsi: boolean; linkedMmsi: string | null; publicEligible: boolean }>();
  const verifiedMmsiToImo = new Map<string, string>();
  for (const row of rows) {
    if (!isValidImoWithChecksum(row.imo)) continue;
    acceptedRegistryImoSet.add(row.imo);
    const existing = registryCoverageStateByImo.get(row.imo);
    const mmsi = /^\d{9}$/.test(row.mmsi ?? "") ? row.mmsi : null;
    const publicEligible = Boolean(row.public_eligible);
    registryCoverageStateByImo.set(row.imo, {
      hasLinkedMmsi: Boolean(existing?.hasLinkedMmsi || mmsi),
      linkedMmsi: existing?.linkedMmsi ?? mmsi,
      publicEligible: Boolean(existing?.publicEligible || publicEligible)
    });
    if (mmsi && publicEligible) verifiedMmsiToImo.set(mmsi, row.imo);
  }

  let linked = 0;
  let publicEligible = 0;
  for (const entry of registryCoverageStateByImo.values()) {
    if (entry.hasLinkedMmsi) linked += 1;
    if (entry.publicEligible) publicEligible += 1;
  }
  return {
    acceptedRegistryImoSet,
    registryCoverageStateByImo,
    verifiedMmsiToImo,
    acceptedRegistryVessels: acceptedRegistryImoSet.size,
    acceptedRegistryVesselsWithExistingLinkedMmsi: linked,
    acceptedRegistryVesselsWithoutLinkedMmsi: Math.max(0, acceptedRegistryImoSet.size - linked),
    verifiedPublicEligibleVessels: publicEligible
  };
}

function updateOneSecondRate(state: CoverageAuditState, byteLength: number) {
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

function updateRuntimeHealth(state: CoverageAuditState) {
  state.memoryPeak = maxMemorySnapshot(state.memoryPeak, getMemorySnapshotMb());
}

function updateIntervalCpu(state: CoverageAuditState) {
  const now = Date.now();
  const current = process.cpuUsage();
  const cpuPercent = calculateProcessCpuPercent(current.user - state.cpuLastInterval.user + current.system - state.cpuLastInterval.system, now - state.lastCpuIntervalAtMs);
  state.latestIntervalCpuPercent = cpuPercent;
  state.peakIntervalCpuPercent = Math.max(state.peakIntervalCpuPercent, cpuPercent);
  state.cpuLastInterval = current;
  state.lastCpuIntervalAtMs = now;
}

function printCoverageLiveStatus(state: CoverageAuditState, recentIntervalKbPerSecond: number) {
  console.log(
    [
      "AISStream global coverage audit status",
      `msgsSec=${round(state.recentIntervalRate)}`,
      `kbSec=${round(recentIntervalKbPerSecond)}`,
      `positionReports=${state.intervalPositionReports}`,
      `staticData=${state.intervalStaticMessages}`,
      `knownVerifiedMatches=${state.intervalVerifiedMatches}`,
      `exactRegistryStaticMatches=${state.intervalStaticMatches}`,
      `newMmsiCandidates=${state.intervalNewCandidates}`,
      `conflicts=${state.intervalConflicts}`,
      `rssMb=${state.memoryPeak.rss}`,
      `eventLoopP95Ms=${round(state.eventLoopP95Ms)}`
    ].join(" | ")
  );
}

function resetIntervalCounters(state: CoverageAuditState) {
  state.intervalMessages = 0;
  state.intervalBytes = 0;
  state.intervalPositionReports = 0;
  state.intervalStaticMessages = 0;
  state.intervalVerifiedMatches = 0;
  state.intervalStaticMatches = 0;
  state.intervalNewCandidates = 0;
  state.intervalConflicts = 0;
}

function sanitizeLogValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "string") return value.replace(/[\r\n]+/g, " ").replace(/\d{7,9}/g, "[redacted-id]").slice(0, 200);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Error) return value.message.replace(/\d{7,9}/g, "[redacted-id]").slice(0, 200);
  return String(value).replace(/[\r\n]+/g, " ").replace(/\d{7,9}/g, "[redacted-id]").slice(0, 200);
}

function percentage(part: number, total: number) {
  if (total <= 0) return 0;
  return round((part / total) * 100);
}

function getMemorySnapshotMb(): MemorySnapshotMb {
  const memory = process.memoryUsage();
  return {
    rss: bytesToMb(memory.rss),
    heapUsed: bytesToMb(memory.heapUsed),
    heapTotal: bytesToMb(memory.heapTotal),
    external: bytesToMb(memory.external)
  };
}

function maxMemorySnapshot(a: MemorySnapshotMb, b: MemorySnapshotMb): MemorySnapshotMb {
  return {
    rss: Math.max(a.rss, b.rss),
    heapUsed: Math.max(a.heapUsed, b.heapUsed),
    heapTotal: Math.max(a.heapTotal, b.heapTotal),
    external: Math.max(a.external, b.external)
  };
}

function bytesToMb(value: number) {
  return round(value / 1024 / 1024);
}

function bytesToKb(value: number) {
  return value / 1024;
}

function nsToMs(value: number) {
  return Number.isFinite(value) ? value / 1_000_000 : 0;
}

function round(value: number) {
  return Math.round(value * 10) / 10;
}
