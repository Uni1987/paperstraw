import { monitorEventLoopDelay } from "node:perf_hooks";
import { AISSTREAM_ENDPOINT, getAisStreamApiKey } from "@/lib/cruises/config";
import { AISSTREAM_FILTER_MESSAGE_TYPES, VERIFIED_GLOBAL_BOUNDING_BOX, messageDataToString, usesExactVerifiedGlobalBoundingBox } from "@/lib/cruises/aisstream";
import { prisma } from "@/lib/database/cruises";

export const GLOBAL_FEED_BENCHMARK_DEFAULT_RUNTIME_MS = 120000;
export const GLOBAL_FEED_BENCHMARK_MAX_RUNTIME_WITHOUT_OVERRIDE_MS = 15 * 60 * 1000;
export const GLOBAL_FEED_BENCHMARK_DEFAULT_REPORT_INTERVAL_MS = 10000;
export const GLOBAL_FEED_BENCHMARK_DEFAULT_POSITION_RETENTION_DAYS = 90;
export const GLOBAL_FEED_BENCHMARK_DEFAULT_VERIFIED_POSITION_BYTES = 250;
export const GLOBAL_FEED_BENCHMARK_DEFAULT_DAILY_AGGREGATE_BYTES = 500;
export const GLOBAL_FEED_BENCHMARK_CONNECTION_LABEL = "global-feed-benchmark";
export const GLOBAL_FEED_BENCHMARK_MESSAGE_TYPES = {
  positions: ["PositionReport"],
  "positions-and-static": ["PositionReport", "ShipStaticData"]
} as const;

export type GlobalFeedBenchmarkProfile = keyof typeof GLOBAL_FEED_BENCHMARK_MESSAGE_TYPES;
export type GlobalFeedBenchmarkFormat = "terminal" | "json" | "markdown";
export type GlobalFeedBenchmarkVerdict = "STABLE_FOR_LONGER_TEST" | "INCONCLUSIVE" | "UNSTABLE";
export type GlobalFeedBenchmarkScaleRecommendation =
  | "LOCAL_TEST_ONLY"
  | "SUITABLE_FOR_LONGER_LOCAL_SOAK_TEST"
  | "CANDIDATE_FOR_SMALL_CLOUD_WORKER_TEST"
  | "NEEDS_OPTIMISATION_BEFORE_CLOUD_TEST";

export type GlobalFeedBenchmarkOptions = {
  maxRuntimeMs: number;
  messageProfile: GlobalFeedBenchmarkProfile;
  reportIntervalMs: number;
  format: GlobalFeedBenchmarkFormat;
  positionRetentionDays: number;
  estimatedVerifiedPositionBytes: number;
  estimatedDailyAggregateBytes: number;
};

export type MemorySnapshotMb = {
  rss: number;
  heapUsed: number;
  heapTotal: number;
  external: number;
};

export type GlobalFeedBenchmarkState = {
  startedAt: Date;
  endedAt: Date | null;
  requestedRuntimeMs: number;
  messageProfile: GlobalFeedBenchmarkProfile;
  socketOpened: boolean;
  subscriptionSent: boolean;
  connectedDurationMs: number;
  closeCode: number | null;
  closeReason: string | null;
  errors: string[];
  reconnectCount: number;
  totalMessages: number;
  totalBytesReceived: number;
  malformedMessages: number;
  messagesMissingUsableMmsi: number;
  messagesByType: Record<string, number>;
  verifiedMmsiCountLoaded: number;
  messagesMatchedToVerifiedMmsis: number;
  distinctVerifiedMmsisObserved: Set<string>;
  discardedUnverifiedMessages: number;
  peakOneSecondRate: number;
  recentIntervalRate: number;
  intervalMessages: number;
  intervalBytes: number;
  secondWindowMessages: number;
  secondWindowBytes: number;
  lastSecondStartedAt: number;
  peakOneSecondBytes: number;
  memoryStartMb: number;
  memoryPeakMb: number;
  memoryEndMb: number;
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
  intervalPeakEventLoopDelayMs: number;
  unhandledErrors: number;
  peakPendingMessages: number;
  backlogObserved: boolean;
  databaseWritesAttempted: 0;
  databaseWritesCompleted: 0;
  positionRetentionDays: number;
  estimatedVerifiedPositionBytes: number;
  estimatedDailyAggregateBytes: number;
};

type AisBenchmarkMessage = {
  MessageType?: string;
  MetaData?: { MMSI?: number | string };
  Message?: {
    PositionReport?: Record<string, unknown>;
    ShipStaticData?: Record<string, unknown>;
    StandardClassBPositionReport?: Record<string, unknown>;
  };
};

export function validateGlobalFeedBenchmarkOptions(options: { maxRuntimeMs: number; allowLongRun?: boolean }) {
  if (!Number.isFinite(options.maxRuntimeMs) || options.maxRuntimeMs <= 0) throw new Error("--max-runtime-ms requires a positive number.");
  if (options.maxRuntimeMs > GLOBAL_FEED_BENCHMARK_MAX_RUNTIME_WITHOUT_OVERRIDE_MS && !options.allowLongRun) {
    throw new Error("Benchmark runtimes over 15 minutes require --allow-long-run.");
  }
}

export function buildGlobalFeedSubscriptionPayload(apiKey: string, profile: GlobalFeedBenchmarkProfile) {
  return {
    APIKey: apiKey,
    BoundingBoxes: [VERIFIED_GLOBAL_BOUNDING_BOX],
    FilterMessageTypes: [...GLOBAL_FEED_BENCHMARK_MESSAGE_TYPES[profile]]
  };
}

export function getGlobalFeedSubscriptionSummary(payload: ReturnType<typeof buildGlobalFeedSubscriptionPayload>, subscriptionSentAfterMs: number) {
  return {
    label: GLOBAL_FEED_BENCHMARK_CONNECTION_LABEL,
    boundingBoxes: payload.BoundingBoxes.length,
    usesExactGlobalBoundingBox: usesExactVerifiedGlobalBoundingBox(payload.BoundingBoxes),
    filterMessageTypes: payload.FilterMessageTypes,
    hasMmsiFilter: false,
    subscriptionSentAfterMs
  };
}

export function createGlobalFeedBenchmarkState(
  options: Pick<GlobalFeedBenchmarkOptions, "maxRuntimeMs" | "messageProfile"> &
    Partial<Pick<GlobalFeedBenchmarkOptions, "positionRetentionDays" | "estimatedVerifiedPositionBytes" | "estimatedDailyAggregateBytes">>,
  verifiedMmsiCountLoaded: number
): GlobalFeedBenchmarkState {
  const memory = getMemorySnapshotMb();
  const cpuStart = process.cpuUsage();
  const now = Date.now();
  return {
    startedAt: new Date(),
    endedAt: null,
    requestedRuntimeMs: options.maxRuntimeMs,
    messageProfile: options.messageProfile,
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
    messagesByType: {},
    verifiedMmsiCountLoaded,
    messagesMatchedToVerifiedMmsis: 0,
    distinctVerifiedMmsisObserved: new Set(),
    discardedUnverifiedMessages: 0,
    peakOneSecondRate: 0,
    recentIntervalRate: 0,
    intervalMessages: 0,
    intervalBytes: 0,
    secondWindowMessages: 0,
    secondWindowBytes: 0,
    lastSecondStartedAt: Date.now(),
    peakOneSecondBytes: 0,
    memoryStartMb: memory.rss,
    memoryPeakMb: memory.rss,
    memoryEndMb: memory.rss,
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
    intervalPeakEventLoopDelayMs: 0,
    unhandledErrors: 0,
    peakPendingMessages: 0,
    backlogObserved: false,
    databaseWritesAttempted: 0,
    databaseWritesCompleted: 0,
    positionRetentionDays: options.positionRetentionDays ?? GLOBAL_FEED_BENCHMARK_DEFAULT_POSITION_RETENTION_DAYS,
    estimatedVerifiedPositionBytes: options.estimatedVerifiedPositionBytes ?? GLOBAL_FEED_BENCHMARK_DEFAULT_VERIFIED_POSITION_BYTES,
    estimatedDailyAggregateBytes: options.estimatedDailyAggregateBytes ?? GLOBAL_FEED_BENCHMARK_DEFAULT_DAILY_AGGREGATE_BYTES
  };
}

export async function runGlobalFeedBenchmark(options: GlobalFeedBenchmarkOptions) {
  const apiKey = getAisStreamApiKey();
  if (!apiKey) throw new Error("Missing AISSTREAM_API_KEY.");
  const verifiedMmsis = await loadVerifiedBenchmarkMmsis();
  const verifiedSet = new Set(verifiedMmsis);
  const state = createGlobalFeedBenchmarkState(options, verifiedSet.size);
  const histogram = monitorEventLoopDelay({ resolution: 20 });
  histogram.enable();
  const startedAtMs = Date.now();
  let pendingMessages = 0;

  await new Promise<void>((resolve) => {
    const socket = new WebSocket(AISSTREAM_ENDPOINT);
    let resolved = false;
    const runtimeTimer = setTimeout(() => {
      socket.close(1000, "benchmark runtime complete");
      finish();
    }, options.maxRuntimeMs);
    const reportTimer = setInterval(() => {
      updateRuntimeHealth(state);
      updateIntervalCpu(state);
      state.eventLoopP95Ms = nsToMs(histogram.percentile(95));
      state.intervalPeakEventLoopDelayMs = Math.max(state.intervalPeakEventLoopDelayMs, nsToMs(histogram.max));
      state.recentIntervalRate = state.intervalMessages / Math.max(1, options.reportIntervalMs / 1000);
      const recentIntervalKbPerSecond = bytesToKb(state.intervalBytes) / Math.max(1, options.reportIntervalMs / 1000);
      state.intervalMessages = 0;
      state.intervalBytes = 0;
      printLiveStatus(state, recentIntervalKbPerSecond);
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
      const memory = getMemorySnapshotMb();
      state.memoryEnd = memory;
      state.memoryEndMb = memory.rss;
      state.memoryPeakMb = Math.max(state.memoryPeakMb, state.memoryEndMb);
      state.memoryPeak = maxMemorySnapshot(state.memoryPeak, memory);
      state.averageCpuPercent = calculateProcessCpuPercent(state.cpuEnd.user + state.cpuEnd.system, state.connectedDurationMs);
      state.eventLoopMeanMs = nsToMs(histogram.mean);
      state.eventLoopP95Ms = nsToMs(histogram.percentile(95));
      state.eventLoopMaxMs = nsToMs(histogram.max);
      state.intervalPeakEventLoopDelayMs = Math.max(state.intervalPeakEventLoopDelayMs, state.eventLoopMaxMs);
      histogram.disable();
      resolve();
    };

    socket.addEventListener("open", () => {
      state.socketOpened = true;
      const openedAtMs = Date.now();
      const payload = buildGlobalFeedSubscriptionPayload(apiKey, options.messageProfile);
      socket.send(JSON.stringify(payload));
      state.subscriptionSent = true;
      const summary = getGlobalFeedSubscriptionSummary(payload, Date.now() - openedAtMs);
      console.log(`AISStream global benchmark connected | subscription=${JSON.stringify(summary)}`);
    });

    socket.addEventListener("message", (event) => {
      pendingMessages += 1;
      state.peakPendingMessages = Math.max(state.peakPendingMessages, pendingMessages);
      if (pendingMessages > 1000) state.backlogObserved = true;
      void handleBenchmarkMessage(event, verifiedSet, state)
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
  return toSerializableGlobalFeedBenchmarkReport(state);
}

export async function handleBenchmarkMessage(event: unknown, verifiedMmsis: Set<string>, state: GlobalFeedBenchmarkState) {
  const text = await messageDataToString(event);
  if (!text) {
    state.malformedMessages += 1;
    return;
  }
  const byteLength = getUtf8ByteLength(text);
  state.totalBytesReceived += byteLength;
  state.intervalBytes += byteLength;
  let payload: AisBenchmarkMessage;
  try {
    payload = JSON.parse(text) as AisBenchmarkMessage;
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
  const mmsi = extractBenchmarkMmsi(payload);
  if (!mmsi) {
    state.messagesMissingUsableMmsi += 1;
    return;
  }
  if (verifiedMmsis.has(mmsi)) {
    state.messagesMatchedToVerifiedMmsis += 1;
    state.distinctVerifiedMmsisObserved.add(mmsi);
    return;
  }
  state.discardedUnverifiedMessages += 1;
}

export function extractBenchmarkMmsi(payload: AisBenchmarkMessage) {
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

export function getGlobalFeedBenchmarkVerdict(input: {
  requestedRuntimeMs: number;
  connectedDurationMs: number;
  socketOpened: boolean;
  reconnectCount: number;
  unhandledErrors: number;
  totalMessages: number;
  backlogObserved: boolean;
  eventLoopP95Ms: number;
  memoryStartMb: number;
  memoryPeakMb: number;
  closeCode: number | null;
}) {
  if (!input.socketOpened || input.unhandledErrors > 0 || input.reconnectCount > 0 || input.backlogObserved) return "UNSTABLE" satisfies GlobalFeedBenchmarkVerdict;
  if (input.closeCode && input.closeCode !== 1000 && input.connectedDurationMs < input.requestedRuntimeMs * 0.95) return "UNSTABLE" satisfies GlobalFeedBenchmarkVerdict;
  if (input.eventLoopP95Ms > 100 || input.memoryPeakMb > input.memoryStartMb + 500) return "UNSTABLE" satisfies GlobalFeedBenchmarkVerdict;
  if (input.connectedDurationMs < input.requestedRuntimeMs * 0.95 || input.totalMessages === 0 || input.requestedRuntimeMs < 60000) {
    return "INCONCLUSIVE" satisfies GlobalFeedBenchmarkVerdict;
  }
  return "STABLE_FOR_LONGER_TEST" satisfies GlobalFeedBenchmarkVerdict;
}

export function toSerializableGlobalFeedBenchmarkReport(state: GlobalFeedBenchmarkState) {
  const averageMessagesPerSecond = state.connectedDurationMs > 0 ? state.totalMessages / (state.connectedDurationMs / 1000) : 0;
  const averageInboundKbPerSecond = calculateAverageKbPerSecond(state.totalBytesReceived, state.connectedDurationMs);
  const discardedPercentage = state.totalMessages ? (state.discardedUnverifiedMessages / state.totalMessages) * 100 : 0;
  const trackedObservedPercentage = state.verifiedMmsiCountLoaded ? (state.distinctVerifiedMmsisObserved.size / state.verifiedMmsiCountLoaded) * 100 : 0;
  const networkProjection = calculateNetworkProjection(state.totalBytesReceived, state.connectedDurationMs);
  const storageEstimate = calculateStorageEstimate({
    verifiedMessagesMatched: state.messagesMatchedToVerifiedMmsis,
    distinctVerifiedMmsisObserved: state.distinctVerifiedMmsisObserved.size,
    connectedDurationMs: state.connectedDurationMs,
    positionRetentionDays: state.positionRetentionDays,
    estimatedVerifiedPositionBytes: state.estimatedVerifiedPositionBytes,
    estimatedDailyAggregateBytes: state.estimatedDailyAggregateBytes
  });
  const verdict = getGlobalFeedBenchmarkVerdict({
    requestedRuntimeMs: state.requestedRuntimeMs,
    connectedDurationMs: state.connectedDurationMs,
    socketOpened: state.socketOpened,
    reconnectCount: state.reconnectCount,
    unhandledErrors: state.unhandledErrors,
    totalMessages: state.totalMessages,
    backlogObserved: state.backlogObserved,
    eventLoopP95Ms: state.eventLoopP95Ms,
    memoryStartMb: state.memoryStartMb,
    memoryPeakMb: state.memoryPeakMb,
    closeCode: state.closeCode
  });
  return {
    generatedAt: (state.endedAt ?? new Date()).toISOString(),
    verdict,
    connection: {
      socketOpenedSuccessfully: state.socketOpened,
      subscriptionSentSuccessfully: state.subscriptionSent,
      connectedDurationMs: state.connectedDurationMs,
      closeCode: state.closeCode,
      closeReason: state.closeReason,
      errors: state.errors,
      reconnectCount: state.reconnectCount
    },
    feedVolume: {
      totalMessagesReceived: state.totalMessages,
      averageMessagesPerSecond: round(averageMessagesPerSecond),
      peakOneSecondRate: state.peakOneSecondRate,
      mostRecentIntervalRate: round(state.recentIntervalRate),
      messagesByType: state.messagesByType,
      malformedOrUnparseableMessages: state.malformedMessages,
      messagesMissingUsableMmsi: state.messagesMissingUsableMmsi
    },
    network: {
      totalBytesReceived: state.totalBytesReceived,
      totalMbReceived: round(bytesToMb(state.totalBytesReceived)),
      averageBytesPerMessage: state.totalMessages ? round(state.totalBytesReceived / state.totalMessages) : 0,
      averageInboundKbPerSecond: round(averageInboundKbPerSecond),
      peakOneSecondInboundKbPerSecond: round(bytesToKb(state.peakOneSecondBytes)),
      projectedGbPerHour: networkProjection.gbPerHour,
      projectedGbPerDay: networkProjection.gbPerDay,
      projectedGbPer30DayMonth: networkProjection.gbPer30DayMonth,
      projectionNote: "Linear estimate based on the observed benchmark window."
    },
    localFiltering: {
      verifiedMmsiCountLoadedAtStartup: state.verifiedMmsiCountLoaded,
      messagesMatchedToVerifiedMmsis: state.messagesMatchedToVerifiedMmsis,
      distinctVerifiedMmsisObserved: state.distinctVerifiedMmsisObserved.size,
      percentageDiscardedAsNotVerified: round(discardedPercentage),
      percentageOfTrackedVerifiedMmsisObserved: round(trackedObservedPercentage)
    },
    processHealth: {
      memoryStartMb: state.memoryStartMb,
      memoryPeakMb: state.memoryPeakMb,
      memoryEndMb: state.memoryEndMb,
      memory: {
        startMb: state.memoryStart,
        peakMb: state.memoryPeak,
        endMb: state.memoryEnd
      },
      cpuUserMs: state.cpuEnd ? round(state.cpuEnd.user / 1000) : 0,
      cpuSystemMs: state.cpuEnd ? round(state.cpuEnd.system / 1000) : 0,
      averageProcessCpuPercent: round(state.averageCpuPercent),
      peakIntervalProcessCpuPercent: round(state.peakIntervalCpuPercent),
      eventLoopDelayMeanMs: round(state.eventLoopMeanMs),
      eventLoopDelayP95Ms: round(state.eventLoopP95Ms),
      eventLoopDelayMaxMs: round(state.eventLoopMaxMs),
      intervalPeakEventLoopDelayMs: round(state.intervalPeakEventLoopDelayMs),
      unhandledErrors: state.unhandledErrors,
      peakPendingMessages: state.peakPendingMessages,
      backlogObserved: state.backlogObserved
    },
    databaseSafety: {
      databaseWritesAttempted: state.databaseWritesAttempted,
      databaseWritesCompleted: state.databaseWritesCompleted
    },
    storageEstimate,
    resourceAndScaleEstimate: {
      inboundGbPer30DayMonth: networkProjection.gbPer30DayMonth,
      averageInboundKbPerSecond: round(averageInboundKbPerSecond),
      peakInboundKbPerSecond: round(bytesToKb(state.peakOneSecondBytes)),
      averageProcessCpuPercent: round(state.averageCpuPercent),
      peakProcessCpuPercent: round(state.peakIntervalCpuPercent),
      memoryPeakMb: state.memoryPeakMb,
      estimatedVerifiedWritesPerDay: storageEstimate.estimatedVerifiedPositionsPerDay,
      estimatedRawPositionStorageForRetentionMb: storageEstimate.estimatedRawVerifiedPositionStorageForRetentionMb,
      estimatedDailyAggregateStoragePerMonthMb: storageEstimate.estimatedDailyAggregateStoragePerMonthMb,
      recommendation: getScaleRecommendation({
        verdict,
        averageInboundKbPerSecond,
        peakInboundKbPerSecond: bytesToKb(state.peakOneSecondBytes),
        averageCpuPercent: state.averageCpuPercent,
        peakCpuPercent: state.peakIntervalCpuPercent,
        memoryPeakMb: state.memoryPeakMb,
        eventLoopP95Ms: state.eventLoopP95Ms,
        backlogObserved: state.backlogObserved
      })
    },
    caveats: [
      "This short benchmark does not prove production readiness.",
      "This benchmark does not prove global AIS coverage.",
      "This benchmark does not claim all cruise vessels are tracked."
    ]
  };
}

export function formatGlobalFeedBenchmarkReport(report: ReturnType<typeof toSerializableGlobalFeedBenchmarkReport>, format: GlobalFeedBenchmarkFormat) {
  if (format === "json") return `${JSON.stringify(report, null, 2)}\n`;
  if (format === "markdown") {
    return `# Full-World AISStream Benchmark

Generated: ${report.generatedAt}

## Executive Summary

- Verdict: **${report.verdict}**
- Total messages received: ${report.feedVolume.totalMessagesReceived}
- Average messages/sec: ${report.feedVolume.averageMessagesPerSecond}
- Peak one-second rate: ${report.feedVolume.peakOneSecondRate}
- Total inbound bytes: ${report.network.totalBytesReceived}
- Total inbound MB: ${report.network.totalMbReceived}
- Average bytes/message: ${report.network.averageBytesPerMessage}
- Average inbound KB/sec: ${report.network.averageInboundKbPerSecond}
- Peak inbound KB/sec: ${report.network.peakOneSecondInboundKbPerSecond}
- Projected inbound GB/hour: ${report.network.projectedGbPerHour}
- Projected inbound GB/day: ${report.network.projectedGbPerDay}
- Projected inbound GB/30-day month: ${report.network.projectedGbPer30DayMonth}
- Verified MMSIs loaded: ${report.localFiltering.verifiedMmsiCountLoadedAtStartup}
- Verified messages matched: ${report.localFiltering.messagesMatchedToVerifiedMmsis}
- Distinct verified MMSIs observed: ${report.localFiltering.distinctVerifiedMmsisObserved}
- Discarded as not verified: ${report.localFiltering.percentageDiscardedAsNotVerified}%
- Database writes attempted: ${report.databaseSafety.databaseWritesAttempted}
- Database writes completed: ${report.databaseSafety.databaseWritesCompleted}
- Scale recommendation: ${report.resourceAndScaleEstimate.recommendation}

## Connection

| Metric | Value |
| --- | --- |
| Socket opened | ${report.connection.socketOpenedSuccessfully} |
| Subscription sent | ${report.connection.subscriptionSentSuccessfully} |
| Duration ms | ${report.connection.connectedDurationMs} |
| Close code | ${report.connection.closeCode ?? "none"} |
| Reconnect count | ${report.connection.reconnectCount} |

## Process Health

| Metric | Value |
| --- | ---: |
| RSS start/peak/end MB | ${report.processHealth.memory.startMb.rss} / ${report.processHealth.memory.peakMb.rss} / ${report.processHealth.memory.endMb.rss} |
| Heap used start/peak/end MB | ${report.processHealth.memory.startMb.heapUsed} / ${report.processHealth.memory.peakMb.heapUsed} / ${report.processHealth.memory.endMb.heapUsed} |
| Heap total start/peak/end MB | ${report.processHealth.memory.startMb.heapTotal} / ${report.processHealth.memory.peakMb.heapTotal} / ${report.processHealth.memory.endMb.heapTotal} |
| External memory start/peak/end MB | ${report.processHealth.memory.startMb.external} / ${report.processHealth.memory.peakMb.external} / ${report.processHealth.memory.endMb.external} |
| Average process CPU % | ${report.processHealth.averageProcessCpuPercent} |
| Peak interval process CPU % | ${report.processHealth.peakIntervalProcessCpuPercent} |
| CPU user time ms | ${report.processHealth.cpuUserMs} |
| CPU system time ms | ${report.processHealth.cpuSystemMs} |
| Event-loop mean ms | ${report.processHealth.eventLoopDelayMeanMs} |
| Event-loop p95 ms | ${report.processHealth.eventLoopDelayP95Ms} |
| Event-loop max ms | ${report.processHealth.eventLoopDelayMaxMs} |
| Interval peak event-loop delay ms | ${report.processHealth.intervalPeakEventLoopDelayMs} |
| Peak pending messages | ${report.processHealth.peakPendingMessages} |
| Backlog observed | ${report.processHealth.backlogObserved} |

## Future Storage Estimate

| Metric | Value |
| --- | ---: |
| Verified positions/hour | ${report.storageEstimate.estimatedVerifiedPositionsPerHour} |
| Verified positions/day | ${report.storageEstimate.estimatedVerifiedPositionsPerDay} |
| Verified positions/30-day month | ${report.storageEstimate.estimatedVerifiedPositionsPer30DayMonth} |
| Raw position storage for retention MB | ${report.storageEstimate.estimatedRawVerifiedPositionStorageForRetentionMb} |
| Daily aggregate storage/month MB | ${report.storageEstimate.estimatedDailyAggregateStoragePerMonthMb} |
| Position retention days | ${report.storageEstimate.assumptions.positionRetentionDays} |
| Estimated verified position bytes | ${report.storageEstimate.assumptions.estimatedVerifiedPositionBytes} |
| Estimated daily aggregate bytes | ${report.storageEstimate.assumptions.estimatedDailyAggregateBytes} |

## Resource & Scale Estimate

| Metric | Value |
| --- | ---: |
| Inbound GB/month projection | ${report.resourceAndScaleEstimate.inboundGbPer30DayMonth} |
| Average / peak inbound KB/sec | ${report.resourceAndScaleEstimate.averageInboundKbPerSecond} / ${report.resourceAndScaleEstimate.peakInboundKbPerSecond} |
| Process CPU average / peak % | ${report.resourceAndScaleEstimate.averageProcessCpuPercent} / ${report.resourceAndScaleEstimate.peakProcessCpuPercent} |
| Memory peak MB | ${report.resourceAndScaleEstimate.memoryPeakMb} |
| Estimated verified writes/day | ${report.resourceAndScaleEstimate.estimatedVerifiedWritesPerDay} |
| Raw position storage for retention MB | ${report.resourceAndScaleEstimate.estimatedRawPositionStorageForRetentionMb} |
| Daily aggregate storage/month MB | ${report.resourceAndScaleEstimate.estimatedDailyAggregateStoragePerMonthMb} |
| Recommendation | ${report.resourceAndScaleEstimate.recommendation} |

Assumptions: ${report.storageEstimate.assumptions.positionRetentionDays} retention days, ${report.storageEstimate.assumptions.estimatedVerifiedPositionBytes} bytes per verified position, ${report.storageEstimate.assumptions.estimatedDailyAggregateBytes} bytes per daily aggregate row. Projections are linear estimates based on the observed benchmark window.

## Caveats

${report.caveats.map((caveat) => `- ${caveat}`).join("\n")}
`;
  }
  return [
    "Full-World AISStream Benchmark",
    `Generated: ${report.generatedAt}`,
    `Verdict: ${report.verdict}`,
    `Messages: ${report.feedVolume.totalMessagesReceived}`,
    `Average messages/sec: ${report.feedVolume.averageMessagesPerSecond}`,
    `Peak one-second rate: ${report.feedVolume.peakOneSecondRate}`,
    `Inbound bytes/MB: ${report.network.totalBytesReceived}/${report.network.totalMbReceived}`,
    `Average bytes/message: ${report.network.averageBytesPerMessage}`,
    `Average/peak inbound KB/sec: ${report.network.averageInboundKbPerSecond}/${report.network.peakOneSecondInboundKbPerSecond}`,
    `Projected inbound GB/hour/day/30-day month: ${report.network.projectedGbPerHour}/${report.network.projectedGbPerDay}/${report.network.projectedGbPer30DayMonth}`,
    `Verified MMSIs loaded: ${report.localFiltering.verifiedMmsiCountLoadedAtStartup}`,
    `Verified messages matched: ${report.localFiltering.messagesMatchedToVerifiedMmsis}`,
    `Distinct verified MMSIs observed: ${report.localFiltering.distinctVerifiedMmsisObserved}`,
    `Discarded as not verified: ${report.localFiltering.percentageDiscardedAsNotVerified}%`,
    `Event-loop p95 ms: ${report.processHealth.eventLoopDelayP95Ms}`,
    `Event-loop mean/max/interval-peak ms: ${report.processHealth.eventLoopDelayMeanMs}/${report.processHealth.eventLoopDelayMaxMs}/${report.processHealth.intervalPeakEventLoopDelayMs}`,
    `Process CPU average/peak %: ${report.processHealth.averageProcessCpuPercent}/${report.processHealth.peakIntervalProcessCpuPercent}`,
    `Process CPU user/system ms: ${report.processHealth.cpuUserMs}/${report.processHealth.cpuSystemMs}`,
    `RSS start/peak/end MB: ${report.processHealth.memoryStartMb}/${report.processHealth.memoryPeakMb}/${report.processHealth.memoryEndMb}`,
    `Heap used start/peak/end MB: ${report.processHealth.memory.startMb.heapUsed}/${report.processHealth.memory.peakMb.heapUsed}/${report.processHealth.memory.endMb.heapUsed}`,
    `Heap total start/peak/end MB: ${report.processHealth.memory.startMb.heapTotal}/${report.processHealth.memory.peakMb.heapTotal}/${report.processHealth.memory.endMb.heapTotal}`,
    `External memory start/peak/end MB: ${report.processHealth.memory.startMb.external}/${report.processHealth.memory.peakMb.external}/${report.processHealth.memory.endMb.external}`,
    `Estimated verified writes/hour/day/month: ${report.storageEstimate.estimatedVerifiedPositionsPerHour}/${report.storageEstimate.estimatedVerifiedPositionsPerDay}/${report.storageEstimate.estimatedVerifiedPositionsPer30DayMonth}`,
    `Estimated verified writes/day: ${report.storageEstimate.estimatedVerifiedPositionsPerDay}`,
    `Estimated raw verified-position storage for retention MB: ${report.storageEstimate.estimatedRawVerifiedPositionStorageForRetentionMb}`,
    `Estimated daily aggregate storage/month MB: ${report.storageEstimate.estimatedDailyAggregateStoragePerMonthMb}`,
    `Scale recommendation: ${report.resourceAndScaleEstimate.recommendation}`,
    `Database writes attempted/completed: ${report.databaseSafety.databaseWritesAttempted}/${report.databaseSafety.databaseWritesCompleted}`,
    `Caveat: ${report.caveats.join(" ")}`
  ].join("\n") + "\n";
}

async function loadVerifiedBenchmarkMmsis() {
  const rows = await prisma.$queryRaw<Array<{ mmsi: string | null }>>`
    SELECT DISTINCT s.mmsi
    FROM cruise_ships s
    INNER JOIN cruise_vessel_verifications v ON v.ship_id = s.id
    INNER JOIN cruise_vessel_registry_entries r ON r.id = v.registry_entry_id
    WHERE v.verification_status = 'VERIFIED_OCEAN_CRUISE'
      AND v.confidence = 'HIGH'
      AND r.registry_decision = 'ACCEPT'
      AND r.imo = s.imo
      AND s.mmsi IS NOT NULL
  `;
  return rows.map((row) => row.mmsi).filter((mmsi): mmsi is string => /^\d{9}$/.test(mmsi ?? "")).sort();
}

function updateOneSecondRate(state: GlobalFeedBenchmarkState, byteLength: number) {
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

function updateRuntimeHealth(state: GlobalFeedBenchmarkState) {
  const memory = getMemorySnapshotMb();
  state.memoryPeak = maxMemorySnapshot(state.memoryPeak, memory);
  state.memoryPeakMb = state.memoryPeak.rss;
}

function updateIntervalCpu(state: GlobalFeedBenchmarkState) {
  const now = Date.now();
  const current = process.cpuUsage();
  const diffUser = current.user - state.cpuLastInterval.user;
  const diffSystem = current.system - state.cpuLastInterval.system;
  const elapsedMs = now - state.lastCpuIntervalAtMs;
  const cpuPercent = calculateProcessCpuPercent(diffUser + diffSystem, elapsedMs);
  state.latestIntervalCpuPercent = cpuPercent;
  state.peakIntervalCpuPercent = Math.max(state.peakIntervalCpuPercent, cpuPercent);
  state.cpuLastInterval = current;
  state.lastCpuIntervalAtMs = now;
}

function printLiveStatus(state: GlobalFeedBenchmarkState, recentIntervalKbPerSecond: number) {
  const projected = calculateNetworkProjection(state.totalBytesReceived, Math.max(1, Date.now() - state.startedAt.getTime()));
  console.log(
    [
      "AISStream global benchmark status",
      `msgsSec=${round(state.recentIntervalRate)}`,
      `kbSec=${round(recentIntervalKbPerSecond)}`,
      `verifiedMatches=${state.messagesMatchedToVerifiedMmsis}`,
      `distinctVerifiedObserved=${state.distinctVerifiedMmsisObserved.size}`,
      `discardedUnverified=${state.discardedUnverifiedMessages}`,
      `cpu=${round(state.latestIntervalCpuPercent)}%`,
      `rssMb=${state.memoryPeak.rss}`,
      `eventLoopP95Ms=${round(state.eventLoopP95Ms)}`,
      `estimatedGbMonth=${projected.gbPer30DayMonth}`,
      `pending=${state.peakPendingMessages}`
    ].join(" | ")
  );
}

function sanitizeLogValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "string") return value.replace(/[\r\n]+/g, " ").slice(0, 200);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Error) return value.message.slice(0, 200);
  return String(value).replace(/[\r\n]+/g, " ").slice(0, 200);
}

function bytesToMb(value: number) {
  return round(value / 1024 / 1024);
}

function bytesToKb(value: number) {
  return value / 1024;
}

function bytesToGb(value: number) {
  return value / 1024 / 1024 / 1024;
}

function nsToMs(value: number) {
  return Number.isFinite(value) ? value / 1_000_000 : 0;
}

export function getUtf8ByteLength(value: string) {
  return Buffer.byteLength(value, "utf8");
}

export function calculateAverageKbPerSecond(totalBytes: number, durationMs: number) {
  if (durationMs <= 0 || totalBytes <= 0) return 0;
  return bytesToKb(totalBytes) / (durationMs / 1000);
}

export function calculateNetworkProjection(totalBytes: number, durationMs: number) {
  if (durationMs <= 0 || totalBytes <= 0) return { gbPerHour: 0, gbPerDay: 0, gbPer30DayMonth: 0 };
  const bytesPerMs = totalBytes / durationMs;
  const gbPerHour = bytesToGb(bytesPerMs * 60 * 60 * 1000);
  return {
    gbPerHour: round(gbPerHour),
    gbPerDay: round(gbPerHour * 24),
    gbPer30DayMonth: round(gbPerHour * 24 * 30)
  };
}

export function calculateProcessCpuPercent(cpuMicros: number, elapsedMs: number) {
  if (elapsedMs <= 0 || cpuMicros <= 0) return 0;
  return Math.min(100, Math.max(0, (cpuMicros / (elapsedMs * 1000)) * 100));
}

export function calculateStorageEstimate(input: {
  verifiedMessagesMatched: number;
  distinctVerifiedMmsisObserved: number;
  connectedDurationMs: number;
  positionRetentionDays: number;
  estimatedVerifiedPositionBytes: number;
  estimatedDailyAggregateBytes: number;
}) {
  const perMs = input.connectedDurationMs > 0 ? input.verifiedMessagesMatched / input.connectedDurationMs : 0;
  const perHour = perMs * 60 * 60 * 1000;
  const perDay = perHour * 24;
  const perMonth = perDay * 30;
  const rawRetentionBytes = perDay * input.positionRetentionDays * input.estimatedVerifiedPositionBytes;
  const dailyAggregateBytes = input.distinctVerifiedMmsisObserved * 30 * input.estimatedDailyAggregateBytes;
  return {
    assumptions: {
      positionRetentionDays: input.positionRetentionDays,
      estimatedVerifiedPositionBytes: input.estimatedVerifiedPositionBytes,
      estimatedDailyAggregateBytes: input.estimatedDailyAggregateBytes
    },
    estimatedVerifiedPositionsPerHour: Math.round(perHour),
    estimatedVerifiedPositionsPerDay: Math.round(perDay),
    estimatedVerifiedPositionsPer30DayMonth: Math.round(perMonth),
    estimatedRawVerifiedPositionStorageForRetentionMb: round(bytesToMb(rawRetentionBytes)),
    estimatedDailyAggregateStoragePerMonthMb: round(bytesToMb(dailyAggregateBytes)),
    estimateNote: "Linear estimate based on observed verified matches and configurable per-row assumptions."
  };
}

export function getScaleRecommendation(input: {
  verdict: GlobalFeedBenchmarkVerdict;
  averageInboundKbPerSecond: number;
  peakInboundKbPerSecond: number;
  averageCpuPercent: number;
  peakCpuPercent: number;
  memoryPeakMb: number;
  eventLoopP95Ms: number;
  backlogObserved: boolean;
}): GlobalFeedBenchmarkScaleRecommendation {
  if (input.verdict === "UNSTABLE" || input.backlogObserved || input.eventLoopP95Ms > 100 || input.peakCpuPercent > 85 || input.memoryPeakMb > 1024) {
    return "NEEDS_OPTIMISATION_BEFORE_CLOUD_TEST";
  }
  if (input.verdict === "INCONCLUSIVE") return "LOCAL_TEST_ONLY";
  if (input.averageCpuPercent <= 25 && input.memoryPeakMb <= 512 && input.eventLoopP95Ms <= 50) return "CANDIDATE_FOR_SMALL_CLOUD_WORKER_TEST";
  return "SUITABLE_FOR_LONGER_LOCAL_SOAK_TEST";
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

function round(value: number) {
  return Math.round(value * 10) / 10;
}
