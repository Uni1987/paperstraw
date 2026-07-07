import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import {
  AISSTREAM_FILTER_MESSAGE_TYPES,
  VERIFIED_GLOBAL_BOUNDING_BOX,
  buildSubscriptionPayload,
  buildVerifiedGlobalConnectionConfigs,
  formatCloseDiagnostic,
  formatErrorDiagnostic,
  getHybridDegradedStatus,
  getHybridHealthStatus,
  getEmptyAllowlistStartupDecision,
  getPositionQualityIssue,
  getReconnectDelayMs,
  getSubscriptionSummary,
  isLikelyConcurrentConnectionLimit,
  messageDataToString,
  parseAisDiagnosticProfile,
  resolveCruiseShipIdentity,
  selectVerifiedGlobalMmsis,
  sendAisSubscription,
  type CruiseShipIdentityInput,
  type CruiseShipIdentityRecord,
  type CruiseShipIdentityRepository
} from "@/lib/cruises/aisstream";
import { CRUISE_REGIONS, getCruiseAisIngestMode, getCruiseRegionConfig, getCruiseRegions, validateCruiseRegions } from "@/lib/cruises/config";
import { estimateCruiseDailyEmissions, haversineNm } from "@/lib/cruises/estimation";
import { parseMrvCsv } from "@/lib/cruises/mrv";
import {
  PAPERSTRAW_HEATMAP_COLORS,
  paperStrawActivityDensityHeatmapColorExpression,
  paperStrawScoreColorExpression
} from "@/lib/maps/paperStrawMapTheme";
import {
  classifyCruiseScope,
  type CruiseScopeAuditCategory,
  type CruiseScopeAuditVessel
} from "@/lib/cruises/scopeAudit";
import {
  buildOperatorRegistryValidationReport,
  buildRegistryStatusSummary,
  buildRegistryValidationReport,
  needsCruiseReviewQueue,
  parseRegistryCsv,
  reconcileCruiseCandidate
} from "@/lib/cruises/registry";
import {
  AISSTREAM_MMSI_FILTER_LIMIT,
  buildRegistryCompletenessReport,
  buildRegistryCoverageReport,
  buildVerifiedAisAllowlistReport,
  getEffectiveRegistryStatus,
  getVerifiedAisSubscriptionMmsis,
  parseRegistryExpansionManifest
} from "@/lib/cruises/registryCoverage";
import {
  CRUISE_MAP_PERIODS,
  CRUISE_POSITION_FRESHNESS_WINDOW_MS,
  DEFAULT_CRUISE_MAP_PERIOD,
  buildCruiseActivityCellPoints,
  buildCruiseOperatorBreakdown,
  buildCruiseSegmentBreakdown,
  buildDailyCruiseEmissionSeries,
  buildCruiseActivityMapPoints,
  buildTopCruiseShipChartRows,
  dedupeCruiseEstimateRows,
  estimateCruiseMapPayloadBytes,
  getCruiseDataStatus,
  getCruiseMapCopy,
  getCruiseMapPeriodRange,
  normalizeCruiseMapPeriod,
  filterPublicCruiseRowsByVerifiedShipIds,
  isPublicVerifiedOceanCruise,
  selectLatestCruisePositionPerShip,
  summarizeCruiseEstimateRows
} from "@/lib/cruises/queries";
import { buildCruiseViabilityAudit, parseOperatorCoverageManifest } from "@/lib/cruises/viabilityAudit";
import {
  buildGlobalFeedSubscriptionPayload,
  calculateAverageKbPerSecond,
  calculateNetworkProjection,
  calculateProcessCpuPercent,
  calculateStorageEstimate,
  createGlobalFeedBenchmarkState,
  extractBenchmarkMmsi,
  formatGlobalFeedBenchmarkReport,
  getGlobalFeedBenchmarkVerdict,
  getScaleRecommendation,
  getGlobalFeedSubscriptionSummary,
  getUtf8ByteLength,
  handleBenchmarkMessage,
  toSerializableGlobalFeedBenchmarkReport,
  validateGlobalFeedBenchmarkOptions
} from "@/lib/cruises/globalFeedBenchmark";
import {
  buildGlobalFeedCoverageAuditSubscriptionPayload,
  classifyStaticRegistryMatch,
  createGlobalFeedCoverageAuditState,
  extractCoverageImo,
  extractCoverageMmsi,
  formatGlobalFeedCoverageAuditReport,
  getCoverageVerdict,
  getGlobalFeedCoverageSubscriptionSummary,
  handleCoverageAuditMessage,
  toSerializableCoverageAuditReport,
  validateGlobalFeedCoverageAuditOptions,
  type CoverageRegistryState
} from "@/lib/cruises/globalFeedCoverageAudit";
import {
  buildGlobalLocalFilterSubscriptionPayload,
  classifyGlobalLocalFilterStaticData,
  createGlobalLocalFilterState,
  createGlobalLocalFilterWriter,
  flushGlobalLocalFilterShutdown,
  formatGlobalLocalFilterStartupSafetyLog,
  formatGlobalLocalFilterReport,
  getGlobalLocalFilterHealthStatus,
  getGlobalLocalFilterDefaultReportIntervalMs,
  getGlobalLocalFilterSubscriptionSummary,
  handleGlobalLocalFilterMessage,
  toGlobalLocalFilterReport,
  validateGlobalLocalFilterWorkerEnvironment,
  validateGlobalLocalFilterOptions,
  waitForGlobalLocalFilterPendingMessages,
  type GlobalLocalFilterPosition,
  type GlobalLocalFilterWriter,
  type StaticQueueItem,
  type VerifiedCruiseLookup
} from "@/lib/cruises/globalLocalFilterIngest";
import {
  assertCanWriteStatusOutput,
  formatGlobalLocalFilterStatusReport,
  getUtcDayRangeForStatusWindow,
  outputContainsSensitiveCruiseIdentity,
  parseGlobalLocalFilterStatusArgs,
  summarizeEmissionStatusRows,
  summarizeObservedVerifiedPositions,
  type GlobalLocalFilterStatusReport
} from "@/lib/cruises/globalLocalFilterStatus";
import {
  MMSI_REVIEW_APPLIED_MARKER,
  assertMmsiReviewMutationTarget,
  buildAppliedResolutionNote,
  buildApprovalResolutionNote,
  buildDismissalResolutionNote,
  evaluateApprovedCandidateForApply,
  evaluateMmsiCandidateForApproval,
  formatMmsiReviewDiagnosticsReport,
  formatMmsiReviewReport,
  formatMmsiReviewRepairPlan,
  getApprovedCandidateApplyPlan,
  isAppliedReviewNote,
  isApprovedReviewNote,
  isDismissedReviewNote,
  parseMmsiReviewArgs,
  type MmsiReviewApplyDiagnosticsReport,
  type MmsiReviewListReport,
  type MmsiReviewRepairPlan,
  type MmsiReviewRow
} from "@/lib/cruises/mmsiReviewWorkflow";

afterEach(() => {
  delete process.env.AISSTREAM_BOUNDING_BOXES;
  delete process.env.CRUISE_AIS_INGEST_MODE;
  delete process.env.CRUISE_WORKER_ENV;
  delete process.env.CRUISE_WORKER_DATABASE_TARGET;
  delete process.env.CRUISE_WORKER_PROFILE;
  delete process.env.CRUISE_WORKER_ALLOW_PRODUCTION;
});

describe("cruise emissions estimation", () => {
  it("uses annual MRV CO2 as a baseline when available", () => {
    const estimate = estimateCruiseDailyEmissions({
      annualCo2Tonnes: 365000,
      annualFuelTonnes: 100000,
      positions: [
        { latitude: 40, longitude: 1, speedOverGround: 14, timestamp: new Date("2026-07-01T00:00:00Z") },
        { latitude: 40.5, longitude: 2, speedOverGround: 15, timestamp: new Date("2026-07-01T06:00:00Z") },
        { latitude: 41, longitude: 3, speedOverGround: 15, timestamp: new Date("2026-07-01T12:00:00Z") }
      ]
    });

    expect(estimate.estimatedCo2Tonnes).toBe(1000);
    expect(estimate.estimatedFuelTonnes).toBeCloseTo(273.973, 3);
    expect(estimate.confidenceScore).toBeGreaterThan(0.8);
    expect(estimate.distanceNm).toBeGreaterThan(100);
  });

  it("falls back to a lower-confidence movement heuristic without MRV data", () => {
    const estimate = estimateCruiseDailyEmissions({
      grossTonnage: 120000,
      positions: [
        { latitude: 25, longitude: -80, speedOverGround: 12, timestamp: new Date("2026-07-01T00:00:00Z") },
        { latitude: 26, longitude: -78, speedOverGround: 13, timestamp: new Date("2026-07-01T06:00:00Z") }
      ]
    });

    expect(estimate.estimatedCo2Tonnes).toBeGreaterThan(0);
    expect(estimate.estimatedFuelTonnes).toBeGreaterThan(0);
    expect(estimate.confidenceScore).toBeLessThan(0.5);
  });

  it("calculates nautical-mile distance between AIS points", () => {
    expect(haversineNm({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 })).toBeCloseTo(60.04, 1);
  });
});

describe("AIS position cleanup", () => {
  it("rejects invalid coordinates and excessive speeds", () => {
    expect(
      getPositionQualityIssue({
        latitude: 95,
        longitude: 4,
        speedOverGround: 12,
        timestamp: new Date("2026-07-01T00:00:00Z")
      })
    ).toBe("invalid-coordinate");

    expect(
      getPositionQualityIssue({
        latitude: 0,
        longitude: 0,
        speedOverGround: 12,
        timestamp: new Date("2026-07-01T00:00:00Z")
      })
    ).toBe("zero-island-coordinate");

    expect(
      getPositionQualityIssue({
        latitude: 40,
        longitude: 4,
        speedOverGround: 46,
        timestamp: new Date("2026-07-01T00:00:00Z")
      })
    ).toBe("speed-over-45-knots");
  });

  it("accepts plausible cruise ship positions", () => {
    expect(
      getPositionQualityIssue({
        latitude: 40,
        longitude: 4,
        speedOverGround: 18,
        timestamp: new Date("2026-07-01T00:00:00Z")
      })
    ).toBeNull();
  });
});

describe("AISStream cruise region configuration", () => {
  it("defaults cruise AIS ingestion to discovery mode", () => {
    delete process.env.CRUISE_AIS_INGEST_MODE;

    expect(getCruiseAisIngestMode()).toBe("discovery");
  });

  it("lets CLI mode override the environment mode", () => {
    process.env.CRUISE_AIS_INGEST_MODE = "discovery";

    expect(getCruiseAisIngestMode("hybrid")).toBe("hybrid");
  });

  it("fails clearly for invalid cruise AIS ingestion modes", () => {
    expect(() => getCruiseAisIngestMode("full-world")).toThrow(/Invalid CRUISE_AIS_INGEST_MODE/);
  });

  it("parses supported AIS diagnostic profiles and rejects invalid ones", () => {
    expect(parseAisDiagnosticProfile("hybrid-verified-first")).toBe("hybrid-verified-first");
    expect(parseAisDiagnosticProfile(null)).toBeNull();
    expect(() => parseAisDiagnosticProfile("everything-at-once")).toThrow(/Invalid AIS diagnostic profile/);
  });

  it("uses all default regions when AISSTREAM_BOUNDING_BOXES is missing", () => {
    delete process.env.AISSTREAM_BOUNDING_BOXES;

    const config = getCruiseRegionConfig();

    expect(config.source).toBe("default");
    expect(config.regions).toHaveLength(CRUISE_REGIONS.length);
    expect(getCruiseRegions()).toHaveLength(CRUISE_REGIONS.length);
  });

  it("uses all default regions when AISSTREAM_BOUNDING_BOXES is blank", () => {
    process.env.AISSTREAM_BOUNDING_BOXES = "   ";

    const config = getCruiseRegionConfig();

    expect(config.source).toBe("default");
    expect(config.regions).toHaveLength(CRUISE_REGIONS.length);
  });

  it("uses a valid explicit override instead of merging with defaults", () => {
    process.env.AISSTREAM_BOUNDING_BOXES = JSON.stringify([
      {
        id: "test-region",
        name: "Test Region",
        boundingBox: [
          [10, 20],
          [12, 22]
        ]
      }
    ]);

    const config = getCruiseRegionConfig();

    expect(config.source).toBe("override");
    expect(config.regions).toEqual([
      {
        id: "test-region",
        name: "Test Region",
        boundingBox: [
          [10, 20],
          [12, 22]
        ]
      }
    ]);
  });

  it("throws a clear error for invalid explicit configuration", () => {
    process.env.AISSTREAM_BOUNDING_BOXES = JSON.stringify([{ id: "Bad Id", name: "Bad", boundingBox: [[0, 0]] }]);

    expect(() => getCruiseRegionConfig()).toThrow(/Invalid AISSTREAM_BOUNDING_BOXES/);
  });

  it("keeps default region ids unique", () => {
    const ids = CRUISE_REGIONS.map((region) => region.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it("defines valid default bounding boxes", () => {
    expect(() => validateCruiseRegions(CRUISE_REGIONS)).not.toThrow();
  });

  it("splits verified global MMSIs into provider-sized connection batches", () => {
    const mmsis = Array.from({ length: 102 }, (_, index) => String(200000000 + index));

    const connections = buildVerifiedGlobalConnectionConfigs(mmsis, AISSTREAM_MMSI_FILTER_LIMIT);

    expect(connections).toHaveLength(3);
    expect(connections.map((connection) => connection.label)).toEqual(["verified-global-batch-1", "verified-global-batch-2", "verified-global-batch-3"]);
    expect(connections.map((connection) => connection.mmsis?.length)).toEqual([50, 50, 2]);
    expect(connections.every((connection) => (connection.mmsis?.length ?? 0) <= AISSTREAM_MMSI_FILTER_LIMIT)).toBe(true);
    expect(connections.every((connection) => connection.boundingBoxes?.length === 1)).toBe(true);
    expect(connections.every((connection) => JSON.stringify(connection.boundingBoxes) === JSON.stringify([VERIFIED_GLOBAL_BOUNDING_BOX]))).toBe(true);
  });

  it("limits verified batches only for hybrid diagnosis and reports excluded MMSIs", () => {
    const mmsis = Array.from({ length: 105 }, (_, index) => String(200000000 + index));

    const hybridSelection = selectVerifiedGlobalMmsis(mmsis, "hybrid", AISSTREAM_MMSI_FILTER_LIMIT, null, 2);
    const hybridConnections = [
      { label: "discovery-corridors", type: "discovery" as const, boundingBoxes: [CRUISE_REGIONS[0].boundingBox] },
      ...buildVerifiedGlobalConnectionConfigs(hybridSelection.selectedMmsis, AISSTREAM_MMSI_FILTER_LIMIT)
    ];
    const verifiedGlobalSelection = selectVerifiedGlobalMmsis(mmsis, "verified-global", AISSTREAM_MMSI_FILTER_LIMIT, null, 2);

    expect(hybridSelection.selectedMmsis).toHaveLength(100);
    expect(hybridSelection.excludedMmsiCount).toBe(5);
    expect(hybridSelection.partialCoverage).toBe(true);
    expect(hybridConnections).toHaveLength(3);
    expect(hybridConnections.map((connection) => connection.label)).toEqual(["discovery-corridors", "verified-global-batch-1", "verified-global-batch-2"]);
    expect(verifiedGlobalSelection.selectedMmsis).toHaveLength(105);
    expect(verifiedGlobalSelection.excludedMmsiCount).toBe(0);
    expect(verifiedGlobalSelection.partialCoverage).toBe(false);
  });

  it("builds AISStream subscription payloads for discovery and verified global modes", () => {
    const discovery = buildSubscriptionPayload("key", {
      label: "discovery-corridors",
      type: "discovery",
      boundingBoxes: CRUISE_REGIONS.slice(0, 1).map((region) => region.boundingBox)
    });
    const verified = buildSubscriptionPayload("key", {
      label: "verified-global-batch-1",
      type: "verified-global",
      boundingBoxes: [[[1, 2], [3, 4]]],
      mmsis: ["215123456"]
    });

    expect(discovery).toMatchObject({ APIKey: "key", BoundingBoxes: [CRUISE_REGIONS[0].boundingBox] });
    expect(discovery).not.toHaveProperty("FiltersShipMMSI");
    expect(discovery).not.toMatchObject({ BoundingBoxes: [VERIFIED_GLOBAL_BOUNDING_BOX] });
    expect(verified).toEqual({
      APIKey: "key",
      BoundingBoxes: [VERIFIED_GLOBAL_BOUNDING_BOX],
      FiltersShipMMSI: ["215123456"],
      FilterMessageTypes: [...AISSTREAM_FILTER_MESSAGE_TYPES]
    });
    const [[southWest, northEast]] = verified.BoundingBoxes as Array<[[number, number], [number, number]]>;
    expect(southWest).toEqual([-90, -180]);
    expect(northEast).toEqual([90, 180]);
  });

  it("summarizes subscription diagnostics without exposing API keys", () => {
    const connection = {
      label: "verified-global-batch-1",
      type: "verified-global" as const,
      boundingBoxes: [[[-90, -180], [90, 180]]] as Array<[[number, number], [number, number]]>,
      mmsis: ["215123456"]
    };
    const payload = buildSubscriptionPayload("secret-api-key", connection);
    const summary = getSubscriptionSummary(connection);

    expect(JSON.stringify(payload)).toContain("secret-api-key");
    expect(JSON.stringify(summary)).not.toContain("secret-api-key");
    expect(summary).toMatchObject({ boundingBoxes: 1, usesExactGlobalBoundingBox: true, mmsis: 1 });
  });

  it("sends verified global subscriptions immediately after socket open", () => {
    const sent: string[] = [];
    const result = sendAisSubscription(
      { send: (payload: string) => sent.push(payload) },
      "key",
      {
        label: "verified-global-batch-1",
        type: "verified-global",
        mmsis: ["215123456"]
      },
      1000,
      () => 1004
    );

    expect(sent).toHaveLength(1);
    expect(result.sentAfterMs).toBe(4);
    expect(result.sentAfterMs).toBeLessThan(3000);
    expect(JSON.parse(sent[0] ?? "{}")).toMatchObject({
      APIKey: "key",
      BoundingBoxes: [VERIFIED_GLOBAL_BOUNDING_BOX],
      FiltersShipMMSI: ["215123456"],
      FilterMessageTypes: [...AISSTREAM_FILTER_MESSAGE_TYPES]
    });
  });

  it("formats close and error diagnostics as concise safe single-line messages", () => {
    const connection = {
      label: "discovery-corridors",
      type: "discovery" as const,
      boundingBoxes: CRUISE_REGIONS.slice(0, 2).map((region) => region.boundingBox)
    };
    const close = formatCloseDiagnostic(connection, 3, { code: 1006, reason: "server closed\nconnection", wasClean: false }, Date.now() - 1250, 2);
    const error = formatErrorDiagnostic(connection, 3, { type: "error", message: "boom", defaultPrevented: false }, Date.now() - 250, 1);

    expect(close).toContain("discovery-corridors AISStream closed");
    expect(close).toContain("code=1006");
    expect(close).toContain("reason=server closed connection");
    expect(close).toContain('"boundingBoxes":2');
    expect(error).toContain("discovery-corridors AISStream error");
    expect(error).toContain('"message":"boom"');
    expect(`${close} ${error}`).not.toContain("secret-api-key");
  });

  it("reports hybrid unhealthy when a required verified global batch is unavailable", () => {
    const status = getHybridHealthStatus([
      { label: "discovery-corridors", type: "discovery", connected: true, unhealthy: false },
      { label: "verified-global-batch-1", type: "verified-global", connected: true, unhealthy: false },
      { label: "verified-global-batch-2", type: "verified-global", connected: true, unhealthy: false },
      { label: "verified-global-batch-3", type: "verified-global", connected: false, unhealthy: true }
    ]);

    expect(status.hybridHealthy).toBe(false);
    expect(status.unavailableVerifiedBatches).toEqual(["verified-global-batch-3"]);
    expect(status.degraded).toBe("HYBRID DEGRADED: verified batch unavailable: verified-global-batch-3");
  });

  it("keeps hybrid healthy only when discovery and every verified batch are active", () => {
    expect(
      getHybridDegradedStatus([
        { label: "discovery-corridors", type: "discovery", connected: true, unhealthy: false },
        { label: "verified-global-batch-1", type: "verified-global", connected: true, unhealthy: false },
        { label: "verified-global-batch-2", type: "verified-global", connected: true, unhealthy: false }
      ])
    ).toBe("none");
  });

  it("backs off noisy rapid provider failures", () => {
    expect(getReconnectDelayMs(1, 1, 100)).toBe(4000);
    expect(getReconnectDelayMs(2, 2, 100)).toBe(60000);
    expect(getReconnectDelayMs(3, 3, 94)).toBe(120000);
    expect(getReconnectDelayMs(8, 8, 94)).toBe(600000);
    expect(getReconnectDelayMs(2, 2, 2000)).toBe(8000);
    expect(isLikelyConcurrentConnectionLimit(2, 94)).toBe(false);
    expect(isLikelyConcurrentConnectionLimit(3, 94)).toBe(true);
  });

  it("uses safe startup decisions for empty verified allowlists", () => {
    expect(getEmptyAllowlistStartupDecision("verified-global")).toBe("refuse");
    expect(getEmptyAllowlistStartupDecision("hybrid")).toBe("continue-discovery");
    expect(getEmptyAllowlistStartupDecision("discovery")).toBe("start-without-global");
  });
});

describe("cruise scope audit classifier", () => {
  it("classifies large ocean cruise ships with strong metadata as likely ocean cruise", () => {
    const result = classifyCruiseScope(
      auditVessel({
        name: "MSC WORLD EUROPA",
        operator: "MSC Cruises",
        shipType: "Passenger/Cruise Ship",
        imo: "9837420",
        mmsi: "215123456",
        grossTonnage: 215000,
        length: 333,
        width: 47,
        hasMrvRecord: true
      })
    );

    expect(result.category).toBe("LIKELY_OCEAN_CRUISE");
    expect(result.evidence).toEqual(expect.arrayContaining(["MRV annual emissions record available", "dimensions/tonnage are consistent with mainstream ocean cruise scale"]));
  });

  it("classifies expedition cruise ships without mainstream scale as likely when evidence is strong", () => {
    const result = classifyCruiseScope(
      auditVessel({
        name: "PONANT EXPEDITION",
        operator: "Ponant",
        shipType: "Passenger ship",
        imo: "9812345",
        mmsi: "228123456",
        grossTonnage: 9900,
        length: 131,
        width: 18,
        hasMrvRecord: true
      })
    );

    expect(result.category).toBe("LIKELY_OCEAN_CRUISE");
  });

  it("does not treat AIS passenger type alone as likely ocean cruise", () => {
    const result = classifyCruiseScope(auditVessel({ shipType: "60", imo: null, name: "UNKNOWN PASSENGER" }));

    expect(result.category).toBe("INSUFFICIENT_METADATA");
    expect(result.evidence.some((item) => item.includes("passenger AIS/type signal"))).toBe(true);
  });

  it.each([
    ["ferry", { name: "CITY FERRY", shipType: "Passenger ship", operator: "Harbor Ferries" }],
    ["RoPax", { name: "BALTIC ROPAX", shipType: "Passenger/RoRo Cargo Ship", operator: "Baltic RoPax" }],
    ["river passenger", { name: "RIVER QUEEN", shipType: "Passenger ship", destination: "River terminal" }],
    ["high-speed craft", { name: "FAST CAT 1", shipType: "High Speed Passenger Craft", operator: "Fast Ferry" }],
    ["misleading passenger ferry metadata", { name: "SEA SHUTTLE", shipType: "Passenger ship", operator: "Commuter Ferry", imo: "1234567" }]
  ])("classifies %s fixtures as likely non-cruise passenger", (_label, overrides) => {
    const result = classifyCruiseScope(auditVessel(overrides));

    expect(result.category).toBe("LIKELY_NON_CRUISE_PASSENGER");
    expect(result.evidence).toEqual(expect.arrayContaining(["ferry/RoPax/commuter/river/day-vessel/service-like signal detected"]));
  });

  it("classifies sparse vessel metadata as insufficient", () => {
    const result = classifyCruiseScope(auditVessel({ name: "MMSI 244000001", imo: null, mmsi: "244000001", shipType: null }));

    expect(result.category).toBe("INSUFFICIENT_METADATA");
  });

  it("keeps audit classification read-only and returns evidence labels", () => {
    const vessel = auditVessel({ name: "CITY FERRY", shipType: "Passenger ship", operator: "Harbor Ferries" });
    const before = JSON.stringify(vessel);
    const result = classifyCruiseScope(vessel);
    const categories: CruiseScopeAuditCategory[] = ["LIKELY_OCEAN_CRUISE", "POSSIBLE_OCEAN_CRUISE", "LIKELY_NON_CRUISE_PASSENGER", "INSUFFICIENT_METADATA"];

    expect(JSON.stringify(vessel)).toBe(before);
    expect(categories).toContain(result.category);
    expect(result.evidence.length).toBeGreaterThan(0);
  });
});

describe("verified ocean cruise registry", () => {
  it("accepts a valid registry entry in dry-run parsing", () => {
    const parsed = parseRegistryCsv(
      [
        "imo,canonical_name,operator,operator_group,vessel_segment,registry_decision,active_status,source_name,source_url,source_checked_at,notes",
        "9837420,MSC World Europa,MSC Cruises,MSC,OCEAN_CRUISE,ACCEPT,ACTIVE,Example Registry,https://example.test/msc-world-europa,2026-07-02,verified"
      ].join("\n")
    );

    expect(parsed.errors).toEqual([]);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]).toMatchObject({ imo: "9837420", registryDecision: "ACCEPT" });
  });

  it("rejects invalid IMO registry rows", () => {
    const parsed = parseRegistryCsv(
      [
        "imo,canonical_name,operator,operator_group,vessel_segment,registry_decision,active_status,source_name,source_url,source_checked_at,notes",
        "1234560,Invalid IMO,Operator,,OCEAN_CRUISE,ACCEPT,ACTIVE,Source,https://example.test,2026-07-02,"
      ].join("\n")
    );

    expect(parsed.errors.join(" ")).toContain("valid checksum");
    expect(parsed.rows).toHaveLength(0);
  });

  it("rejects conflicting duplicate IMO decisions", () => {
    const parsed = parseRegistryCsv(
      [
        "imo,canonical_name,operator,operator_group,vessel_segment,registry_decision,active_status,source_name,source_url,source_checked_at,notes",
        "9837420,MSC World Europa,MSC Cruises,MSC,OCEAN_CRUISE,ACCEPT,ACTIVE,Source,https://example.test/a,2026-07-02,",
        "9837420,MSC World Europa,MSC Cruises,MSC,OCEAN_CRUISE,EXCLUDE,ACTIVE,Source,https://example.test/b,2026-07-02,"
      ].join("\n")
    );

    expect(parsed.errors.join(" ")).toContain("conflicting decisions");
  });

  it("reports registry validation failures and active versus retired counts", () => {
    const report = buildRegistryValidationReport(
      [
        "imo,canonical_name,operator,operator_group,vessel_segment,registry_decision,active_status,source_name,source_url,source_checked_at,notes",
        "1234560,,Example Operator,,RIVER,ACCEPT,BROKEN,Source,,bad-date,",
        "9837420,MSC World Europa,MSC Cruises,MSC,OCEAN_CRUISE,ACCEPT,ACTIVE,Source,https://example.test/a,2026-07-02,",
        "9837420,MSC World Europa,MSC Cruises,MSC,OCEAN_CRUISE,EXCLUDE,RETIRED,Source,https://example.test/b,2026-07-02,"
      ].join("\n")
    );

    expect(report.rowsRead).toBe(3);
    expect(report.totalAcceptRows).toBe(2);
    expect(report.totalExcludeRows).toBe(1);
    expect(report.duplicateImoConflicts).toBe(1);
    expect(report.missingSourceUrls).toBe(1);
    expect(report.missingSourceCheckedDates).toBe(1);
    expect(report.invalidImoRows).toBe(1);
    expect(report.missingCanonicalNameRows).toBe(1);
    expect(report.missingOperatorRows).toBe(0);
    expect(report.missingOrInvalidVesselSegmentRows).toBe(1);
    expect(report.activeStatusCounts).toMatchObject({ ACTIVE: 1, RETIRED: 1, UNKNOWN: 0 });
    expect(report.invalidActiveStatusRows).toBe(1);
    expect(report.validRowCount).toBe(1);
  });

  it("builds a read-only registry status summary", () => {
    expect(
      buildRegistryStatusSummary({
        registryEntries: 20,
        verifiedCandidateMatches: 12,
        acceptedRegistryEntriesNotSeenInAis: 8,
        currentPublicEligibleVessels: 12,
        candidateShipsAwaitingReview: 140
      })
    ).toEqual({
      registryEntries: 20,
      verifiedCandidateMatches: 12,
      acceptedRegistryEntriesNotSeenInAis: 8,
      currentPublicEligibleVessels: 12,
      candidateShipsAwaitingReview: 140
    });
  });

  it("parses registry expansion manifest rows", () => {
    const manifest = parseRegistryExpansionManifest(
      [
        "operator_group,operator,priority,expected_scope,registry_status,official_fleet_source,imo_identity_source,notes",
        "Independent / other major operators,MSC Cruises,1,OCEAN_CRUISE,NOT_STARTED,,,Planned batch",
        "Manual scope review,Hurtigruten Coastal Express,4,REVIEW_REQUIRED,NEEDS_MANUAL_SCOPE_DECISION,,,Manual scope required"
      ].join("\n")
    );

    expect(manifest.errors).toEqual([]);
    expect(manifest.entries).toHaveLength(2);
    expect(manifest.entries[1]).toMatchObject({
      operator: "Hurtigruten Coastal Express",
      expectedScope: "REVIEW_REQUIRED",
      registryStatus: "NEEDS_MANUAL_SCOPE_DECISION"
    });
  });

  it("reports coverage for accepted, excluded and unmatched candidate ships", () => {
    const report = buildRegistryCoverageReport({
      manifestEntries: [
        {
          operatorGroup: "Group A",
          operator: "Operator A",
          priority: 1,
          expectedScope: "OCEAN_CRUISE",
          registryStatus: "IMPORTED",
          officialFleetSource: null,
          imoIdentitySource: null,
          notes: null
        },
        {
          operatorGroup: "Group B",
          operator: "Operator B",
          priority: 2,
          expectedScope: "OCEAN_CRUISE",
          registryStatus: "NOT_STARTED",
          officialFleetSource: null,
          imoIdentitySource: null,
          notes: null
        }
      ],
      registryEntries: [
        {
          imo: "9837420",
          operator: "Operator A",
          operatorGroup: "Group A",
          registryDecision: "ACCEPT",
          activeStatus: "ACTIVE",
          vesselSegment: "OCEAN_CRUISE"
        },
        {
          imo: "9137363",
          operator: "Operator A",
          operatorGroup: "Group A",
          registryDecision: "EXCLUDE",
          activeStatus: "ACTIVE",
          vesselSegment: "OCEAN_CRUISE"
        }
      ],
      proposedRegistryEntries: [
        {
          imo: "9837420",
          operator: "Operator A",
          operatorGroup: "Group A",
          registryDecision: "ACCEPT",
          activeStatus: "ACTIVE",
          vesselSegment: "OCEAN_CRUISE"
        },
        {
          imo: "9876957",
          operator: "Operator B",
          operatorGroup: "Group B",
          registryDecision: "ACCEPT",
          activeStatus: "ACTIVE",
          vesselSegment: "OCEAN_CRUISE"
        }
      ],
      candidateShips: [
        { id: "accepted", imo: "9837420" },
        { id: "excluded", imo: "9137363" },
        { id: "unmatched", imo: "1234567" },
        { id: "missing-imo", imo: null }
      ],
      publicEligibleShips: [{ id: "accepted", imo: "9837420", mmsi: "215123456" }],
      recentAisShipIds: ["accepted"],
      dailyEstimateShipIds: []
    });

    expect(report.registryCoverage.totalAcceptEntries).toBe(1);
    expect(report.registryCoverage.acceptEntriesByOperatorGroup).toEqual({ "Group A": 1 });
    expect(report.aisCandidateCoverage.candidatesMatchedToAcceptedRegistryEntries).toBe(1);
    expect(report.aisCandidateCoverage.candidatesMatchedToExcludedRegistryEntries).toBe(1);
    expect(report.aisCandidateCoverage.unmatchedCandidates).toBe(2);
    expect(report.operatorCoverage.rows.find((row) => row.operator === "Operator A")).toMatchObject({
      manifestStatus: "IMPORTED",
      effectiveRegistryStatus: "IMPORTED",
      importedAcceptedShips: 1,
      proposedAcceptedShips: 0,
      matchedAisShips: 1,
      verifiedPublicShips: 1
    });
    expect(report.operatorCoverage.rows.find((row) => row.operator === "Operator B")).toMatchObject({
      effectiveRegistryStatus: "PROPOSED",
      importedAcceptedShips: 0,
      proposedAcceptedShips: 1
    });
    expect(report.operatorCoverage.operatorsWithZeroRegistryEntries).not.toContain("Operator B");
    expect(report.publicDashboardReadiness.suitability).toBe("internal development only");
  });

  it("keeps effective status rules conservative", () => {
    expect(getEffectiveRegistryStatus("NOT_STARTED", 1, 0)).toBe("IMPORTED");
    expect(getEffectiveRegistryStatus("NOT_STARTED", 0, 2)).toBe("PROPOSED");
    expect(getEffectiveRegistryStatus("NOT_STARTED", 0, 0)).toBe("NOT_STARTED");
    expect(getEffectiveRegistryStatus("NEEDS_MANUAL_SCOPE_DECISION", 2, 2)).toBe("NEEDS_MANUAL_SCOPE_DECISION");
  });

  it("does not claim complete registry coverage without explicit fleet-count evidence", () => {
    const report = buildRegistryCompletenessReport({
      manifestEntries: [
        {
          operatorGroup: "Group A",
          operator: "Operator A",
          priority: 1,
          expectedScope: "OCEAN_CRUISE",
          registryStatus: "NOT_STARTED",
          officialFleetSource: null,
          imoIdentitySource: null,
          notes: null
        },
        {
          operatorGroup: "Group B",
          operator: "Operator B",
          priority: 2,
          expectedScope: "OCEAN_CRUISE",
          registryStatus: "NOT_STARTED",
          officialFleetSource: null,
          imoIdentitySource: null,
          notes: "expected fleet count: 1"
        }
      ],
      registryEntries: [],
      proposedRegistryEntries: [
        {
          imo: "9837420",
          operator: "Operator A",
          operatorGroup: "Group A",
          registryDecision: "ACCEPT",
          activeStatus: "ACTIVE",
          vesselSegment: "OCEAN_CRUISE"
        },
        {
          imo: "9876957",
          operator: "Operator B",
          operatorGroup: "Group B",
          registryDecision: "ACCEPT",
          activeStatus: "ACTIVE",
          vesselSegment: "OCEAN_CRUISE"
        }
      ],
      candidateShips: [{ id: "candidate", imo: "9837420", name: "Operator A Ship", operator: null }],
      publicEligibleShips: []
    });

    expect(report.rows.find((row) => row.operator === "Operator A")).toMatchObject({
      effectiveRegistryStatus: "PROPOSED",
      registryCoverageConfidence: "UNKNOWN"
    });
    expect(report.rows.find((row) => row.operator === "Operator B")).toMatchObject({
      registryCoverageConfidence: "COMPLETE"
    });
  });

  it("builds a verified AIS allowlist from public-eligible ships only", () => {
    const report = buildVerifiedAisAllowlistReport({
      registryEntries: [
        {
          imo: "9837420",
          operator: "Operator A",
          operatorGroup: "Group A",
          registryDecision: "ACCEPT",
          activeStatus: "ACTIVE",
          vesselSegment: "OCEAN_CRUISE"
        },
        {
          imo: "9876957",
          operator: "Operator A",
          operatorGroup: "Group A",
          registryDecision: "ACCEPT",
          activeStatus: "ACTIVE",
          vesselSegment: "OCEAN_CRUISE"
        },
        {
          imo: "9137363",
          operator: "Operator A",
          operatorGroup: "Group A",
          registryDecision: "EXCLUDE",
          activeStatus: "ACTIVE",
          vesselSegment: "OCEAN_CRUISE"
        }
      ],
      publicEligibleShips: [
        { id: "eligible-with-mmsi", imo: "9837420", mmsi: "215123456" },
        { id: "eligible-missing-mmsi", imo: "9876957", mmsi: null },
        { id: "unverified-ship", imo: "0000001", mmsi: "999999999" }
      ],
      mmsiFilterLimit: AISSTREAM_MMSI_FILTER_LIMIT
    });

    expect(report.totalVerifiedRegistryAcceptEntries).toBe(2);
    expect(report.linkedRegistryEntries).toBe(2);
    expect(report.linkedEntriesWithMmsi).toBe(1);
    expect(report.linkedEntriesMissingMmsi).toBe(1);
    expect(report.distinctMmsisReadyForTracking).toBe(1);
    expect(report.mappings).toEqual([{ imo: "9837420", mmsi: "215123456", shipId: "eligible-with-mmsi" }]);
    expect(report.shipsMissingMmsi).toEqual([{ imo: "9876957", shipId: "eligible-missing-mmsi" }]);
  });

  it("flags conflicting MMSI mappings in the verified AIS allowlist", () => {
    const report = buildVerifiedAisAllowlistReport({
      registryEntries: [
        {
          imo: "9837420",
          operator: "Operator A",
          operatorGroup: "Group A",
          registryDecision: "ACCEPT",
          activeStatus: "ACTIVE",
          vesselSegment: "OCEAN_CRUISE"
        },
        {
          imo: "9876957",
          operator: "Operator A",
          operatorGroup: "Group A",
          registryDecision: "ACCEPT",
          activeStatus: "ACTIVE",
          vesselSegment: "OCEAN_CRUISE"
        }
      ],
      publicEligibleShips: [
        { id: "ship-1", imo: "9837420", mmsi: "215123456" },
        { id: "ship-2", imo: "9876957", mmsi: "215123456" }
      ],
      mmsiFilterLimit: 50
    });

    expect(report.duplicateOrConflictingMmsis).toEqual([{ mmsi: "215123456", imos: ["9837420", "9876957"] }]);
  });

  it("excludes conflicting MMSIs from verified global subscriptions", () => {
    const report = buildVerifiedAisAllowlistReport({
      registryEntries: [
        {
          imo: "9837420",
          operator: "Operator A",
          operatorGroup: "Group A",
          registryDecision: "ACCEPT",
          activeStatus: "ACTIVE",
          vesselSegment: "OCEAN_CRUISE"
        },
        {
          imo: "9876957",
          operator: "Operator A",
          operatorGroup: "Group A",
          registryDecision: "ACCEPT",
          activeStatus: "ACTIVE",
          vesselSegment: "OCEAN_CRUISE"
        },
        {
          imo: "9790045",
          operator: "Operator B",
          operatorGroup: "Group B",
          registryDecision: "ACCEPT",
          activeStatus: "ACTIVE",
          vesselSegment: "OCEAN_CRUISE"
        }
      ],
      publicEligibleShips: [
        { id: "ship-1", imo: "9837420", mmsi: "215123456" },
        { id: "ship-2", imo: "9876957", mmsi: "215123456" },
        { id: "ship-3", imo: "9790045", mmsi: "311123456" }
      ],
      mmsiFilterLimit: 50
    });

    expect(getVerifiedAisSubscriptionMmsis(report)).toEqual(["311123456"]);
  });

  it("validates a selected operator batch and flags generic source URLs", () => {
    const report = buildOperatorRegistryValidationReport(
      [
        "imo,canonical_name,operator,operator_group,vessel_segment,registry_decision,active_status,source_name,source_url,source_checked_at,notes",
        "9837420,MSC World Europa,MSC Cruises,MSC Group,OCEAN_CRUISE,ACCEPT,ACTIVE,MSC fleet page,https://www.msccruises.com/fleet,2026-07-02,Official fleet source plus IMO identity source https://www.vesselfinder.com/vessels/details/9837420",
        "9137363,Other Ship,Other Operator,Other Group,OCEAN_CRUISE,ACCEPT,ACTIVE,Source,https://example.test/ship,2026-07-02,Official fleet source plus IMO identity source"
      ].join("\n"),
      { operator: "MSC Cruises", operatorGroup: "MSC Group" }
    );

    expect(report.totalRows).toBe(1);
    expect(report.validRows).toBe(1);
    expect(report.operatorOrGroupMismatchRows).toBe(0);
    expect(report.missingImoIdentityEvidenceRows).toBe(0);
    expect(report.genericSourceUrlWarnings).toHaveLength(1);
  });

  it("reports an operator batch with no ships without creating errors", () => {
    const report = buildOperatorRegistryValidationReport(
      "imo,canonical_name,operator,operator_group,vessel_segment,registry_decision,active_status,source_name,source_url,source_checked_at,notes\n",
      { operator: "MSC Cruises", operatorGroup: "MSC Group" }
    );

    expect(report.totalRows).toBe(0);
    expect(report.validRows).toBe(0);
    expect(report.errors).toEqual([]);
  });

  it("verifies only exact ACCEPT registry IMO matches", () => {
    const decision = reconcileCruiseCandidate(registryCandidate({ imo: "9837420", name: "Different Name" }), {
      id: "registry-1",
      imo: "9837420",
      registryDecision: "ACCEPT",
      sourceName: "Curated Registry"
    });

    expect(decision.verificationStatus).toBe("VERIFIED_OCEAN_CRUISE");
    expect(decision.confidence).toBe("HIGH");
    expect(decision.decisionSource).toBe("curated_registry_exact_imo_accept");
  });

  it("excludes exact EXCLUDE registry IMO matches", () => {
    const decision = reconcileCruiseCandidate(registryCandidate({ imo: "9137363", name: "WSF PUYALLUP" }), {
      id: "registry-2",
      imo: "9137363",
      registryDecision: "EXCLUDE",
      sourceName: "Curated Registry"
    });

    expect(decision.verificationStatus).toBe("EXCLUDED_NON_CRUISE");
    expect(decision.confidence).toBe("HIGH");
  });

  it("never verifies passenger AIS type without a registry match", () => {
    const decision = reconcileCruiseCandidate(registryCandidate({ imo: "9837420", shipType: "Passenger ship" }), null);

    expect(decision.verificationStatus).toBe("REVIEW_REQUIRED");
    expect(decision.verificationStatus).not.toBe("VERIFIED_OCEAN_CRUISE");
  });

  it("never verifies name-only matches", () => {
    const decision = reconcileCruiseCandidate(registryCandidate({ imo: "9137363", name: "MSC World Europa" }), {
      id: "registry-1",
      imo: "9837420",
      registryDecision: "ACCEPT",
      sourceName: "Curated Registry"
    });

    expect(decision.verificationStatus).toBe("REVIEW_REQUIRED");
  });

  it("never verifies MRV-only matches or missing IMO candidates", () => {
    expect(reconcileCruiseCandidate(registryCandidate({ imo: "9837420", hasMrvRecord: true }), null).verificationStatus).toBe("REVIEW_REQUIRED");
    expect(reconcileCruiseCandidate(registryCandidate({ imo: null, hasMrvRecord: true }), null).verificationStatus).toBe("REVIEW_REQUIRED");
  });

  it("keeps dry-run reconciliation as a pure no-write decision helper", () => {
    const candidate = registryCandidate({ imo: "9837420" });
    const before = JSON.stringify(candidate);
    const decision = reconcileCruiseCandidate(candidate, null);

    expect(JSON.stringify(candidate)).toBe(before);
    expect(decision.decisionSource).toBe("no_curated_registry_imo_match");
  });

  it("includes only unresolved statuses in the review queue", () => {
    expect(needsCruiseReviewQueue(null)).toBe(true);
    expect(needsCruiseReviewQueue("UNASSESSED")).toBe(true);
    expect(needsCruiseReviewQueue("REVIEW_REQUIRED")).toBe(true);
    expect(needsCruiseReviewQueue("VERIFIED_OCEAN_CRUISE")).toBe(false);
    expect(needsCruiseReviewQueue("EXCLUDED_NON_CRUISE")).toBe(false);
  });
});

describe("AIS websocket payload parsing", () => {
  it("normalizes string, Buffer, ArrayBuffer, Blob-like, and data-wrapped payloads", async () => {
    const json = '{"MessageType":"PositionReport"}';
    const buffer = Buffer.from(json, "utf8");
    const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    const blobLike = { text: async () => json };

    await expect(messageDataToString(json)).resolves.toBe(json);
    await expect(messageDataToString(buffer)).resolves.toBe(json);
    await expect(messageDataToString(arrayBuffer)).resolves.toBe(json);
    await expect(messageDataToString(blobLike)).resolves.toBe(json);
    await expect(messageDataToString({ data: blobLike })).resolves.toBe(json);
  });
});

describe("cruise dashboard query helpers", () => {
  const now = new Date("2026-07-01T12:00:00Z");

  it("allows only high-confidence verified ocean cruises from exact ACCEPT registry IMO matches", () => {
    expect(
      isPublicVerifiedOceanCruise({
        verificationStatus: "VERIFIED_OCEAN_CRUISE",
        confidence: "HIGH",
        registryDecision: "ACCEPT",
        shipImo: "9837420",
        registryImo: "9837420"
      })
    ).toBe(true);
  });

  it.each([
    ["review required", "REVIEW_REQUIRED", "HIGH", "ACCEPT", "9837420", "9837420"],
    ["unassessed", "UNASSESSED", "HIGH", "ACCEPT", "9837420", "9837420"],
    ["excluded", "EXCLUDED_NON_CRUISE", "HIGH", "ACCEPT", "9837420", "9837420"],
    ["missing verification", null, "HIGH", "ACCEPT", "9837420", "9837420"],
    ["medium confidence", "VERIFIED_OCEAN_CRUISE", "MEDIUM", "ACCEPT", "9837420", "9837420"],
    ["registry exclude", "VERIFIED_OCEAN_CRUISE", "HIGH", "EXCLUDE", "9837420", "9837420"],
    ["name-only or mismatched IMO", "VERIFIED_OCEAN_CRUISE", "HIGH", "ACCEPT", "9837420", "9137363"],
    ["missing IMO", "VERIFIED_OCEAN_CRUISE", "HIGH", "ACCEPT", null, "9837420"]
  ])("excludes %s records from public cruise eligibility", (_label, verificationStatus, confidence, registryDecision, shipImo, registryImo) => {
    expect(
      isPublicVerifiedOceanCruise({
        verificationStatus,
        confidence,
        registryDecision,
        shipImo,
        registryImo
      })
    ).toBe(false);
  });

  it("filters public cruise rows to verified ship ids for totals, map data and rankings", () => {
    const rows = [
      { shipId: "verified", value: 10 },
      { shipId: "review-required", value: 20 },
      { shipId: "unassessed", value: 30 },
      { shipId: "excluded", value: 40 },
      { shipId: "no-verification", value: 50 }
    ];

    expect(filterPublicCruiseRowsByVerifiedShipIds(rows, ["verified"])).toEqual([{ shipId: "verified", value: 10 }]);
    expect(filterPublicCruiseRowsByVerifiedShipIds(rows, [])).toEqual([]);
  });

  it("empty registry produces no public cruise rows", () => {
    expect(filterPublicCruiseRowsByVerifiedShipIds([{ shipId: "candidate", value: 1 }], [])).toHaveLength(0);
  });

  it("selects one latest marker per ship when many AIS positions exist", () => {
    const points = selectLatestCruisePositionPerShip(
      [
        position({ shipId: "ship-1", latitude: 40, longitude: 4, timestamp: new Date("2026-07-01T10:00:00Z") }),
        position({ shipId: "ship-1", latitude: 41, longitude: 5, timestamp: new Date("2026-07-01T11:00:00Z") }),
        position({ shipId: "ship-2", latitude: 25, longitude: -78, timestamp: new Date("2026-07-01T11:30:00Z") })
      ],
      now,
      CRUISE_POSITION_FRESHNESS_WINDOW_MS
    );

    expect(points).toHaveLength(2);
    expect(new Set(points.map((point) => point.shipId)).size).toBe(points.length);
    expect(points.find((point) => point.shipId === "ship-1")?.latitude).toBe(41);
  });

  it("keeps one public marker when the same verified ship is seen through discovery and verified-global paths", () => {
    const duplicateTimestamp = new Date("2026-07-01T11:00:00Z");
    const points = selectLatestCruisePositionPerShip(
      [
        position({ shipId: "verified-ship", latitude: 40, longitude: 4, timestamp: duplicateTimestamp }),
        position({ shipId: "verified-ship", latitude: 40, longitude: 4, timestamp: duplicateTimestamp }),
        position({ shipId: "other-ship", latitude: 25, longitude: -78, timestamp: new Date("2026-07-01T11:30:00Z") })
      ],
      now,
      CRUISE_POSITION_FRESHNESS_WINDOW_MS
    );

    expect(points).toHaveLength(2);
    expect(points.filter((point) => point.shipId === "verified-ship")).toHaveLength(1);
  });

  it("excludes stale positions from currently tracked vessels", () => {
    const points = selectLatestCruisePositionPerShip(
      [
        position({ shipId: "fresh", timestamp: new Date("2026-07-01T11:00:00Z") }),
        position({ shipId: "stale", timestamp: new Date("2026-07-01T02:00:00Z") })
      ],
      now,
      CRUISE_POSITION_FRESHNESS_WINDOW_MS
    );

    expect(points.map((point) => point.shipId)).toEqual(["fresh"]);
    expect(getCruiseDataStatus(new Date("2026-07-01T11:00:00Z"), now)).toBe("Healthy");
    expect(getCruiseDataStatus(new Date("2026-07-01T02:00:00Z"), now)).toBe("Stale");
    expect(getCruiseDataStatus(null, now)).toBe("Awaiting data");
  });

  it("filters invalid coordinates before map rendering", () => {
    const points = selectLatestCruisePositionPerShip(
      [
        position({ shipId: "valid", latitude: 58, longitude: 6 }),
        position({ shipId: "zero", latitude: 0, longitude: 0 }),
        position({ shipId: "swapped", latitude: 120, longitude: 4 })
      ],
      now,
      CRUISE_POSITION_FRESHNESS_WINDOW_MS
    );

    expect(points.map((point) => point.shipId)).toEqual(["valid"]);
  });

  it("deduplicates ship/date/method estimates before totals", () => {
    const date = new Date("2026-07-01T00:00:00Z");
    const rows = [
      estimateRow({ shipId: "ship-1", date, methodVersion: "v1", estimatedCo2Tonnes: 100 }),
      estimateRow({ shipId: "ship-1", date, methodVersion: "v1", estimatedCo2Tonnes: 100 }),
      estimateRow({ shipId: "ship-1", date, methodVersion: "v2", estimatedCo2Tonnes: 125 }),
      estimateRow({ shipId: "ship-2", date, methodVersion: "v1", estimatedCo2Tonnes: 50 })
    ];

    expect(dedupeCruiseEstimateRows(rows)).toHaveLength(3);
    expect(summarizeCruiseEstimateRows(rows).co2Tonnes).toBe(275);
  });

  it("does not double daily totals when duplicate source observations produce equivalent estimates", () => {
    const date = new Date("2026-07-01T00:00:00Z");
    const rows = [
      estimateRow({ shipId: "verified-ship", date, methodVersion: "cruise-ais-mrv-v1", estimatedCo2Tonnes: 200 }),
      estimateRow({ shipId: "verified-ship", date, methodVersion: "cruise-ais-mrv-v1", estimatedCo2Tonnes: 200 })
    ];

    expect(dedupeCruiseEstimateRows(rows)).toHaveLength(1);
    expect(summarizeCruiseEstimateRows(rows).co2Tonnes).toBe(200);
  });

  it("builds the cruise daily chart from observed estimate dates only", () => {
    const rows = [
      estimateRow({ shipId: "verified-1", date: new Date("2026-07-02T00:00:00Z"), methodVersion: "v1", estimatedCo2Tonnes: 120 }),
      estimateRow({ shipId: "verified-1", date: new Date("2026-07-04T00:00:00Z"), methodVersion: "v1", estimatedCo2Tonnes: 80 }),
      estimateRow({ shipId: "verified-2", date: new Date("2026-07-04T00:00:00Z"), methodVersion: "v1", estimatedCo2Tonnes: 20 })
    ];

    expect(buildDailyCruiseEmissionSeries(rows)).toEqual([
      { date: "2026-07-02", label: "Jul 2", estimatedCo2Tonnes: 120 },
      { date: "2026-07-03", label: "Jul 3", estimatedCo2Tonnes: 0 },
      { date: "2026-07-04", label: "Jul 4", estimatedCo2Tonnes: 100 }
    ]);
  });

  it("returns an empty daily chart series when no verified estimate rows are available", () => {
    expect(buildDailyCruiseEmissionSeries([])).toEqual([]);
  });

  it("builds top cruise ship chart rows from positive verified estimates only", () => {
    const date = new Date("2026-07-01T00:00:00Z");
    const rows = [
      estimateRow({ shipId: "ship-a", date, methodVersion: "v1", estimatedCo2Tonnes: 10 }),
      estimateRow({ shipId: "ship-b", date, methodVersion: "v1", estimatedCo2Tonnes: 0 }),
      estimateRow({ shipId: "ship-c", date, methodVersion: "v1", estimatedCo2Tonnes: 25 }),
      estimateRow({ shipId: "ship-d", date, methodVersion: "v1", estimatedCo2Tonnes: 3 })
    ];

    expect(buildTopCruiseShipChartRows(rows, 2).map((row) => ({ shipId: row.shipId, co2Tonnes: row.co2Tonnes }))).toEqual([
      { shipId: "ship-c", co2Tonnes: 25 },
      { shipId: "ship-a", co2Tonnes: 10 }
    ]);
  });

  it("keeps cruise chart data compatible with the public verified-only gate", () => {
    const date = new Date("2026-07-01T00:00:00Z");
    const rows = [
      estimateRow({ shipId: "verified", date, methodVersion: "v1", estimatedCo2Tonnes: 10 }),
      estimateRow({ shipId: "unverified", date, methodVersion: "v1", estimatedCo2Tonnes: 90 })
    ];
    const verifiedRows = filterPublicCruiseRowsByVerifiedShipIds(rows, ["verified"]);

    expect(buildDailyCruiseEmissionSeries(verifiedRows)[0]?.estimatedCo2Tonnes).toBe(10);
    expect(buildTopCruiseShipChartRows(verifiedRows, 6).map((row) => row.shipId)).toEqual(["verified"]);
  });

  it("builds operator breakdowns from verified registry metadata and safe unpublished buckets", () => {
    const date = new Date("2026-07-01T00:00:00Z");
    const rows = [
      estimateRow({ shipId: "ship-a", date, methodVersion: "v1", estimatedCo2Tonnes: 60 }),
      estimateRow({ shipId: "ship-b", date, methodVersion: "v1", estimatedCo2Tonnes: 40 }),
      estimateRow({ shipId: "ship-c", date, methodVersion: "v1", estimatedCo2Tonnes: 20 })
    ];
    const metadata = new Map([
      ["ship-a", { operator: "Example Cruises", vesselSegment: "OCEAN_CRUISE" }],
      ["ship-b", { operator: null, vesselSegment: "EXPEDITION_CRUISE" }],
      ["ship-c", { operator: "Unknown operator", vesselSegment: "OCEAN_CRUISE" }]
    ]);

    expect(buildCruiseOperatorBreakdown(rows, metadata)).toEqual([
      { label: "Example Cruises", estimatedCo2Tonnes: 60, percent: 50 },
      { label: "Operator not published", estimatedCo2Tonnes: 60, percent: 50 }
    ]);
  });

  it("builds segment breakdowns only from actual verified registry segments", () => {
    const date = new Date("2026-07-01T00:00:00Z");
    const rows = [
      estimateRow({ shipId: "ship-a", date, methodVersion: "v1", estimatedCo2Tonnes: 75 }),
      estimateRow({ shipId: "ship-b", date, methodVersion: "v1", estimatedCo2Tonnes: 25 }),
      estimateRow({ shipId: "ship-c", date, methodVersion: "v1", estimatedCo2Tonnes: 10 })
    ];
    const metadata = new Map([
      ["ship-a", { operator: "Example Cruises", vesselSegment: "OCEAN_CRUISE" }],
      ["ship-b", { operator: "Expedition Line", vesselSegment: "EXPEDITION_CRUISE" }]
    ]);

    expect(buildCruiseSegmentBreakdown(rows, metadata)).toEqual([
      { label: "Ocean cruise", estimatedCo2Tonnes: 75, percent: 75 },
      { label: "Expedition cruise", estimatedCo2Tonnes: 25, percent: 25 }
    ]);
  });

  it("uses vessel activity density as the default map mode when no trusted daily CO2 estimate exists", () => {
    const points = buildCruiseActivityMapPoints([position({ shipId: "ship-1" })], []);

    expect(points[0]).toMatchObject({ activityWeight: 1, estimatedCo2Tonnes: null });
  });

  it("keeps equivalent density weights even when real CO2 estimates exist", () => {
    const date = new Date("2026-07-01T00:00:00Z");
    const points = buildCruiseActivityMapPoints(
      [position({ shipId: "ship-1" }), position({ shipId: "ship-2" })],
      [estimateRow({ shipId: "ship-1", date, methodVersion: "v1", estimatedCo2Tonnes: 42.5 })]
    );

    expect(points.map((point) => point.activityWeight)).toEqual([1, 1]);
    expect(points.find((point) => point.shipId === "ship-1")).toMatchObject({ estimatedCo2Tonnes: 42.5 });
    expect(points.find((point) => point.shipId === "ship-2")).toMatchObject({ estimatedCo2Tonnes: null });
  });

  it("does not let high CO2 values create disproportionate default map weights", () => {
    const date = new Date("2026-07-01T00:00:00Z");
    const points = buildCruiseActivityMapPoints(
      [position({ shipId: "ship-1" }), position({ shipId: "ship-2" })],
      [estimateRow({ shipId: "ship-1", date, methodVersion: "v1", estimatedCo2Tonnes: 5000 })]
    );

    expect(points.find((point) => point.shipId === "ship-1")?.activityWeight).toBe(points.find((point) => point.shipId === "ship-2")?.activityWeight);
  });

  it("uses activity-density wording for the default cruise map copy", () => {
    const copy = getCruiseMapCopy("activity");

    expect(copy.legendTitle).toBe("Live cruise vessel activity");
    expect(copy.subtitle).toBe("Latest observed verified cruise positions.");
    expect(`${copy.legendTitle} ${copy.subtitle}`).not.toMatch(/emissions intensity|mixed|CO2 weighting/i);
  });

  it("defines cruise-only map period labels and defaults to since monitoring began", () => {
    expect(DEFAULT_CRUISE_MAP_PERIOD).toBe("since-monitoring");
    expect(CRUISE_MAP_PERIODS.map((period) => period.label)).toEqual(["This week", "This month", "Since monitoring began"]);
    expect(CRUISE_MAP_PERIODS.map((period) => period.legendTitle)).toEqual([
      "WEEKLY CRUISE ACTIVITY",
      "MONTHLY CRUISE ACTIVITY",
      "CRUISE ACTIVITY SINCE MONITORING BEGAN"
    ]);
    expect(normalizeCruiseMapPeriod(undefined)).toBe("since-monitoring");
    expect(normalizeCruiseMapPeriod("")).toBe("since-monitoring");
    expect(normalizeCruiseMapPeriod("week")).toBe("week");
    expect(normalizeCruiseMapPeriod("ytd")).toBe("since-monitoring");
  });

  it("calculates cruise map period boundaries in UTC", () => {
    const wednesday = new Date("2026-07-08T15:30:00.000Z");
    const monitoringStart = new Date("2026-07-03T12:00:00.000Z");

    expect(getCruiseMapPeriodRange("week", wednesday, monitoringStart).start.toISOString()).toBe("2026-07-06T00:00:00.000Z");
    expect(getCruiseMapPeriodRange("week", wednesday, monitoringStart).end).toBe(wednesday);
    expect(getCruiseMapPeriodRange("month", wednesday, monitoringStart).start.toISOString()).toBe("2026-07-01T00:00:00.000Z");
    expect(getCruiseMapPeriodRange("since-monitoring", wednesday, monitoringStart).start).toBe(monitoringStart);
  });

  it("allows overlapping cruise map periods without fabricating visual differences", () => {
    const monday = new Date("2026-06-01T08:15:00.000Z");
    const monitoringStart = new Date("2026-06-01T00:00:00.000Z");

    expect(getCruiseMapPeriodRange("week", monday, monitoringStart).start.toISOString()).toBe(
      getCruiseMapPeriodRange("month", monday, monitoringStart).start.toISOString()
    );
    expect(getCruiseMapPeriodRange("since-monitoring", monday, monitoringStart).start.toISOString()).toBe("2026-06-01T00:00:00.000Z");
  });

  it("builds aggregate cruise activity map cells without exposing vessel identity fields", () => {
    const points = buildCruiseActivityCellPoints(
      [
        {
          latitude: 36.4,
          longitude: 14.2,
          observationCount: 16,
          vesselCount: 4,
          latestTimestamp: new Date("2026-07-08T12:00:00.000Z")
        },
        {
          latitude: 51.8,
          longitude: 3.2,
          observationCount: 4,
          vesselCount: 2,
          latestTimestamp: new Date("2026-07-08T11:00:00.000Z")
        }
      ],
      "This week"
    );

    expect(points).toHaveLength(2);
    expect(points[0]).toMatchObject({
      isAggregate: true,
      shipId: "",
      mmsi: "",
      name: "Verified cruise activity",
      observationCount: 16,
      vesselCount: 4,
      activityWeight: 1,
      periodLabel: "This week"
    });
    expect(points[1]?.activityWeight).toBe(0.5);
  });

  it("uses the shared PaperStraw heatmap palette for cruise activity maps", () => {
    const cruiseGradient = paperStrawActivityDensityHeatmapColorExpression().join(" ");
    const airportScoreGradient = paperStrawScoreColorExpression("emissionScore").join(" ");

    expect(airportScoreGradient).toContain(PAPERSTRAW_HEATMAP_COLORS.low);
    expect(airportScoreGradient).toContain(PAPERSTRAW_HEATMAP_COLORS.midLow);
    expect(airportScoreGradient).toContain(PAPERSTRAW_HEATMAP_COLORS.medium);
    expect(airportScoreGradient).toContain(PAPERSTRAW_HEATMAP_COLORS.high);
    expect(airportScoreGradient).toContain(PAPERSTRAW_HEATMAP_COLORS.peak);
    expect(cruiseGradient).toContain("rgba(91,33,182");
    expect(cruiseGradient).toContain("rgba(219,39,119");
    expect(cruiseGradient).toContain("rgba(249,115,22");
    expect(cruiseGradient).toContain("rgba(250,204,21");
    expect(cruiseGradient).toContain("rgba(255,247,194");
  });

  it("keeps the cruise map payload compact for several thousand vessels", () => {
    const points = Array.from({ length: 3000 }, (_, index) =>
      position({
        shipId: `ship-${index}`,
        latitude: -55 + ((index * 0.13) % 120),
        longitude: -170 + ((index * 0.29) % 340),
        activityWeight: 1,
        estimatedCo2Tonnes: null
      })
    );

    expect(estimateCruiseMapPayloadBytes(points)).toBeLessThan(1_500_000);
  });

  it("keeps public cruise preview copy honest about monitoring-only coverage", () => {
    const cruisePageSource = readFileSync("app/cruises/page.tsx", "utf8");
    const source = [
      cruisePageSource,
      readFileSync("app/cruises/[shipId]/page.tsx", "utf8"),
      readFileSync("components/cruises/CruiseVesselMap.tsx", "utf8"),
      readFileSync("components/cruises/LazyCruiseVesselMap.tsx", "utf8"),
      readFileSync("components/cruises/CruiseDashboardCharts.tsx", "utf8"),
      readFileSync("lib/cruises/queries.ts", "utf8")
    ].join("\n");

    expect(source).toContain("Estimated CO₂ emissions from verified ocean cruise ships observed by PaperStraw since monitoring began");
    expect(source).toContain("Estimated CO₂ emissions over time");
    expect(source).toContain("Top cruise ships by estimated CO₂");
    expect(source).toContain("CO₂ emissions breakdown");
    expect(source).toContain("CO₂ by operator");
    expect(source).toContain("CO₂ by cruise segment");
    expect(source).toContain("CO₂ comparisons");
    expect(source).toContain("Based on estimated verified cruise CO₂ observed since monitoring began.");
    expect(source).toContain("Building observed emissions history.");
    expect(source).toContain("Building observed emissions breakdown.");
    expect(source).toContain("No verified cruise emissions available yet.");
    expect(source).toContain("Latest observed verified cruise positions.");
    expect(source).toContain("Observed verified cruise activity this week.");
    expect(source).toContain("Observed verified cruise activity this month.");
    expect(source).toContain("Observed verified cruise activity since monitoring began.");
    expect(source).toContain("No verified cruise activity observed for this period yet.");
    expect(source).toContain('params.set("period", periodId)');
    expect(source).toContain("Coverage varies by vessel and AIS availability");
    expect(source).toContain("WORLD CRUISE ACTIVITY");
    expect(source).not.toContain("Cruise coverage and freshness");
    expect(source).not.toContain("Positions may be delayed and coverage varies by vessel and AIS availability.");
    expect(source).not.toContain("Estimated emissions from observed activity today");
    expect(source).not.toContain("Estimated emissions from observed activity since monitoring began");
    expect(readFileSync("components/cruises/CruiseDashboardCharts.tsx", "utf8")).not.toMatch(/Unknown operator|review queue|MMSI|IMO|global cruise emissions|annual cruise emissions/i);
    expect(cruisePageSource).not.toContain(">Cruise emissions</p>");
    expect(source).not.toMatch(/\bYTD\b|year-to-date|19 monitored|monitored cruise regions|regional discovery|global cruise emissions|all cruises|real-time exact/i);
  });
});

describe("cruise viability audit", () => {
  const now = new Date("2026-07-02T12:00:00Z");

  it("keeps zero-data state conservative and read-only", () => {
    const report = buildCruiseViabilityAudit({
      recentDays: 7,
      now,
      registryEntries: [],
      verifiedShips: [],
      candidateShipCount: 0,
      positions: [],
      estimates: [],
      manifestRows: []
    });

    expect(report.executiveSummary.acceptedRegistryVessels).toBe(0);
    expect(report.executiveSummary.readinessStatus).toBe("NOT_READY");
    expect(report.goNoGoDecision.currentDecision).toBe("NO_GO");
    expect(report.claimSafetyMatrix.find((row) => row.claim.includes("global ocean cruise fleet"))?.status).toBe("NOT_YET_SAFE");
  });

  it("uses UNKNOWN fleet counts instead of inferred percentages", () => {
    const manifest = parseOperatorCoverageManifest(
      [
        "operator,parentGroup,segment,officialFleetCount,officialFleetCountSource,checkedAt,includedInRegistry,notes,status",
        "Example Cruises,Example Group,OCEAN_CRUISE,,,2026-07-02,true,No denominator,INCLUDED_UNKNOWN_FLEET_COUNT"
      ].join("\n")
    );
    const report = buildCruiseViabilityAudit({
      recentDays: 7,
      now,
      registryEntries: [viabilityRegistryEntry({ imo: "1234567", operator: "Example Cruises" })],
      verifiedShips: [viabilityShip({ shipId: "ship-1", imo: "1234567", mmsi: "244123456", operator: "Example Cruises" })],
      candidateShipCount: 1,
      positions: [],
      estimates: [],
      manifestRows: manifest
    });

    expect(report.registryCoverageByOperator[0]?.officialExpectedFleetCountKnown).toBe(false);
    expect(report.registryCoverageByOperator[0]?.expectedFleetCount).toBeNull();
    expect(report.registryCoverageByOperator[0]?.registryFleetCoveragePercent).toBeNull();
  });

  it("counts recent observed verified vessels and stale vessels by date window", () => {
    const report = buildCruiseViabilityAudit({
      recentDays: 7,
      now,
      registryEntries: [
        viabilityRegistryEntry({ imo: "1234567", operator: "Example Cruises" }),
        viabilityRegistryEntry({ imo: "7654321", operator: "Example Cruises" })
      ],
      verifiedShips: [
        viabilityShip({ shipId: "recent", imo: "1234567", mmsi: "244123456", operator: "Example Cruises" }),
        viabilityShip({ shipId: "stale", imo: "7654321", mmsi: "244123457", operator: "Example Cruises" })
      ],
      candidateShipCount: 2,
      positions: [
        { shipId: "recent", timestamp: new Date("2026-07-02T11:30:00Z") },
        { shipId: "stale", timestamp: new Date("2026-06-01T00:00:00Z") }
      ],
      estimates: [],
      manifestRows: []
    });

    expect(report.executiveSummary.verifiedVesselsRecentlySeenInAis).toBe(1);
    expect(report.aisTrackingQuality.freshnessBuckets.lessThan1Hour).toBe(1);
    expect(report.aisTrackingQuality.freshnessBuckets.olderThan7Days).toBe(1);
    expect(report.aisTrackingQuality.verifiedShipsWithPositionsButNoRecentPositions).toBe(1);
  });

  it("reports hybrid batch-limit exclusion counts", () => {
    const registryEntries = Array.from({ length: 105 }, (_, index) => viabilityRegistryEntry({ imo: String(1000000 + index), operator: "Example Cruises" }));
    const verifiedShips = registryEntries.map((entry, index) =>
      viabilityShip({ shipId: `ship-${index}`, imo: entry.imo, mmsi: String(200000000 + index), operator: "Example Cruises" })
    );

    const report = buildCruiseViabilityAudit({
      recentDays: 7,
      now,
      registryEntries,
      verifiedShips,
      candidateShipCount: 105,
      positions: [],
      estimates: [],
      manifestRows: []
    });

    expect(report.executiveSummary.currentlyTrackableVerifiedVesselsInHybridMode).toBe(100);
    expect(report.executiveSummary.currentlyExcludedVerifiedMmsisBecauseOfHybridBatchLimit).toBe(5);
  });

  it("keeps emissions and global claims unsafe without benchmark and denominator evidence", () => {
    const report = buildCruiseViabilityAudit({
      recentDays: 7,
      now,
      registryEntries: [viabilityRegistryEntry({ imo: "1234567", operator: "Example Cruises" })],
      verifiedShips: [viabilityShip({ shipId: "ship-1", imo: "1234567", mmsi: "244123456", operator: "Example Cruises" })],
      candidateShipCount: 1,
      positions: [{ shipId: "ship-1", timestamp: new Date("2026-07-02T11:30:00Z") }],
      estimates: [{ shipId: "ship-1", date: new Date("2026-07-02T00:00:00Z"), methodVersion: "v1" }],
      manifestRows: []
    });

    expect(report.claimSafetyMatrix.find((row) => row.claim === "Tracking X% of the global ocean cruise fleet")?.status).toBe("NOT_YET_SAFE");
    expect(report.claimSafetyMatrix.find((row) => row.claim === "Tracking global cruise ship emissions")?.status).toBe("NOT_YET_SAFE");
    expect(report.claimSafetyMatrix.find((row) => row.claim === "Showing estimated emissions for verified vessels")?.status).toBe("SAFE_WITH_QUALIFIER");
    expect(report.emissionsDataReadiness.validationNote).toMatch(/validation against independent references/);
  });
});

describe("global AISStream feed benchmark", () => {
  it("builds one full-world subscription without MMSI filters", () => {
    const payload = buildGlobalFeedSubscriptionPayload("secret-key", "positions");
    const summary = getGlobalFeedSubscriptionSummary(payload, 3);

    expect(payload.BoundingBoxes).toEqual([VERIFIED_GLOBAL_BOUNDING_BOX]);
    expect(payload.BoundingBoxes[0][0]).toEqual([-90, -180]);
    expect(payload.BoundingBoxes[0][1]).toEqual([90, 180]);
    expect(payload.FilterMessageTypes).toEqual(["PositionReport"]);
    expect(payload).not.toHaveProperty("FiltersShipMMSI");
    expect(summary).toMatchObject({ boundingBoxes: 1, usesExactGlobalBoundingBox: true, hasMmsiFilter: false, subscriptionSentAfterMs: 3 });
    expect(JSON.stringify(summary)).not.toContain("secret-key");
  });

  it("uses only valid message type names for positions and static profile", () => {
    expect(buildGlobalFeedSubscriptionPayload("key", "positions-and-static").FilterMessageTypes).toEqual(["PositionReport", "ShipStaticData"]);
  });

  it("counts verified MMSI messages locally and discards unknown messages", async () => {
    const state = createGlobalFeedBenchmarkState({ maxRuntimeMs: 120000, messageProfile: "positions" }, 1);
    await handleBenchmarkMessage(
      { data: JSON.stringify({ MessageType: "PositionReport", MetaData: { MMSI: "244123456" }, Message: { PositionReport: { UserID: "244123456" } } }) },
      new Set(["244123456"]),
      state
    );
    await handleBenchmarkMessage(
      { data: JSON.stringify({ MessageType: "PositionReport", MetaData: { MMSI: "111222333" }, Message: { PositionReport: { UserID: "111222333" } } }) },
      new Set(["244123456"]),
      state
    );

    expect(state.messagesMatchedToVerifiedMmsis).toBe(1);
    expect(state.distinctVerifiedMmsisObserved.size).toBe(1);
    expect(state.discardedUnverifiedMessages).toBe(1);
    expect(state.totalBytesReceived).toBeGreaterThan(0);
    expect(state.databaseWritesAttempted).toBe(0);
    expect(state.databaseWritesCompleted).toBe(0);
  });

  it("counts UTF-8 bytes and network projections safely", () => {
    expect(getUtf8ByteLength("abc")).toBe(3);
    expect(getUtf8ByteLength("é")).toBe(2);
    expect(calculateAverageKbPerSecond(1024, 1000)).toBe(1);
    expect(calculateAverageKbPerSecond(1024, 0)).toBe(0);
    expect(calculateNetworkProjection(1024 * 1024 * 1024, 60 * 60 * 1000)).toEqual({
      gbPerHour: 1,
      gbPerDay: 24,
      gbPer30DayMonth: 720
    });
    expect(calculateNetworkProjection(100, 0)).toEqual({ gbPerHour: 0, gbPerDay: 0, gbPer30DayMonth: 0 });
  });

  it("calculates bounded process CPU percentage", () => {
    expect(calculateProcessCpuPercent(500_000, 1000)).toBe(50);
    expect(calculateProcessCpuPercent(2_000_000, 1000)).toBe(100);
    expect(calculateProcessCpuPercent(500_000, 0)).toBe(0);
  });

  it("uses configurable assumptions for future storage estimates", () => {
    const estimate = calculateStorageEstimate({
      verifiedMessagesMatched: 10,
      distinctVerifiedMmsisObserved: 2,
      connectedDurationMs: 60 * 60 * 1000,
      positionRetentionDays: 90,
      estimatedVerifiedPositionBytes: 250,
      estimatedDailyAggregateBytes: 500
    });

    expect(estimate.estimatedVerifiedPositionsPerHour).toBe(10);
    expect(estimate.estimatedVerifiedPositionsPerDay).toBe(240);
    expect(estimate.assumptions).toMatchObject({ positionRetentionDays: 90, estimatedVerifiedPositionBytes: 250, estimatedDailyAggregateBytes: 500 });
    expect(estimate.estimatedRawVerifiedPositionStorageForRetentionMb).toBeGreaterThan(0);
  });

  it("does not retain raw AIS payloads in the serializable report", async () => {
    const raw = JSON.stringify({ MessageType: "PositionReport", MetaData: { MMSI: "244123456" }, raw: "secret raw payload" });
    const state = createGlobalFeedBenchmarkState({ maxRuntimeMs: 120000, messageProfile: "positions" }, 1);
    await handleBenchmarkMessage({ data: raw }, new Set(["244123456"]), state);
    state.endedAt = new Date("2026-07-02T12:00:00Z");
    state.connectedDurationMs = 120000;
    const report = toSerializableGlobalFeedBenchmarkReport(state);

    expect(JSON.stringify(report)).not.toContain("secret raw payload");
    expect(JSON.stringify(report)).not.toContain("244123456");
    expect(report.databaseSafety.databaseWritesAttempted).toBe(0);
    expect(report.network.totalBytesReceived).toBeGreaterThan(0);
  });

  it("extracts MMSI robustly from metadata and body", () => {
    expect(extractBenchmarkMmsi({ MetaData: { MMSI: 244123456 } })).toBe("244123456");
    expect(extractBenchmarkMmsi({ Message: { PositionReport: { UserID: "244123457" } } })).toBe("244123457");
    expect(extractBenchmarkMmsi({ Message: { ShipStaticData: { MMSI: "244123458" } } })).toBe("244123458");
    expect(extractBenchmarkMmsi({ MetaData: { MMSI: "bad" } })).toBeNull();
  });

  it("requires explicit allow-long-run for benchmark runtimes above 15 minutes", () => {
    expect(() => validateGlobalFeedBenchmarkOptions({ maxRuntimeMs: 16 * 60 * 1000 })).toThrow(/allow-long-run/);
    expect(() => validateGlobalFeedBenchmarkOptions({ maxRuntimeMs: 16 * 60 * 1000, allowLongRun: true })).not.toThrow();
  });

  it("produces stable, inconclusive, and unstable verdicts", () => {
    expect(
      getGlobalFeedBenchmarkVerdict({
        requestedRuntimeMs: 120000,
        connectedDurationMs: 120000,
        socketOpened: true,
        reconnectCount: 0,
        unhandledErrors: 0,
        totalMessages: 100,
        backlogObserved: false,
        eventLoopP95Ms: 20,
        memoryStartMb: 100,
        memoryPeakMb: 120,
        closeCode: 1000
      })
    ).toBe("STABLE_FOR_LONGER_TEST");
    expect(
      getGlobalFeedBenchmarkVerdict({
        requestedRuntimeMs: 120000,
        connectedDurationMs: 120000,
        socketOpened: true,
        reconnectCount: 0,
        unhandledErrors: 0,
        totalMessages: 0,
        backlogObserved: false,
        eventLoopP95Ms: 20,
        memoryStartMb: 100,
        memoryPeakMb: 120,
        closeCode: 1000
      })
    ).toBe("INCONCLUSIVE");
    expect(
      getGlobalFeedBenchmarkVerdict({
        requestedRuntimeMs: 120000,
        connectedDurationMs: 100,
        socketOpened: true,
        reconnectCount: 0,
        unhandledErrors: 0,
        totalMessages: 10,
        backlogObserved: true,
        eventLoopP95Ms: 20,
        memoryStartMb: 100,
        memoryPeakMb: 120,
        closeCode: 1006
      })
    ).toBe("UNSTABLE");
  });

  it("keeps formatted output free of API keys, raw MMSIs, and vessel identities", () => {
    const state = createGlobalFeedBenchmarkState({ maxRuntimeMs: 120000, messageProfile: "positions" }, 1);
    state.totalMessages = 1;
    state.totalBytesReceived = 512;
    state.messagesMatchedToVerifiedMmsis = 1;
    state.distinctVerifiedMmsisObserved.add("244123456");
    state.endedAt = new Date("2026-07-02T12:00:00Z");
    const output = formatGlobalFeedBenchmarkReport(toSerializableGlobalFeedBenchmarkReport(state), "json");
    const markdown = formatGlobalFeedBenchmarkReport(toSerializableGlobalFeedBenchmarkReport(state), "markdown");

    expect(output).not.toContain("secret-key");
    expect(output).not.toContain("244123456");
    expect(output).not.toContain("Example Cruise");
    expect(JSON.parse(output).connection.reconnectCount).toBe(0);
    expect(markdown).toContain("Total inbound bytes");
    expect(markdown).toContain("Average bytes/message");
    expect(markdown).toContain("CPU user time ms");
    expect(markdown).toContain("Heap total start/peak/end MB");
    expect(markdown).toContain("Future Storage Estimate");
    expect(markdown).not.toContain("244123456");
  });

  it("uses conservative scale recommendations", () => {
    expect(
      getScaleRecommendation({
        verdict: "UNSTABLE",
        averageInboundKbPerSecond: 10,
        peakInboundKbPerSecond: 20,
        averageCpuPercent: 10,
        peakCpuPercent: 10,
        memoryPeakMb: 100,
        eventLoopP95Ms: 20,
        backlogObserved: false
      })
    ).toBe("NEEDS_OPTIMISATION_BEFORE_CLOUD_TEST");
    expect(
      getScaleRecommendation({
        verdict: "INCONCLUSIVE",
        averageInboundKbPerSecond: 10,
        peakInboundKbPerSecond: 20,
        averageCpuPercent: 10,
        peakCpuPercent: 10,
        memoryPeakMb: 100,
        eventLoopP95Ms: 20,
        backlogObserved: false
      })
    ).toBe("LOCAL_TEST_ONLY");
    expect(
      getScaleRecommendation({
        verdict: "STABLE_FOR_LONGER_TEST",
        averageInboundKbPerSecond: 10,
        peakInboundKbPerSecond: 20,
        averageCpuPercent: 5,
        peakCpuPercent: 10,
        memoryPeakMb: 100,
        eventLoopP95Ms: 20,
        backlogObserved: false
      })
    ).toBe("CANDIDATE_FOR_SMALL_CLOUD_WORKER_TEST");
  });
});

describe("global AISStream coverage audit", () => {
  it("builds exactly one full-world subscription with PositionReport and ShipStaticData only", () => {
    const payload = buildGlobalFeedCoverageAuditSubscriptionPayload("secret-key");
    const summary = getGlobalFeedCoverageSubscriptionSummary(payload, 2);

    expect(payload.BoundingBoxes).toEqual([VERIFIED_GLOBAL_BOUNDING_BOX]);
    expect(payload.BoundingBoxes[0][0]).toEqual([-90, -180]);
    expect(payload.BoundingBoxes[0][1]).toEqual([90, 180]);
    expect(payload.FilterMessageTypes).toEqual(["PositionReport", "ShipStaticData"]);
    expect(payload).not.toHaveProperty("FiltersShipMMSI");
    expect(summary).toMatchObject({
      boundingBoxes: 1,
      usesExactGlobalBoundingBox: true,
      coordinateOrder: "[latitude, longitude]",
      hasMmsiFilter: false,
      subscriptionSentAfterMs: 2
    });
    expect(JSON.stringify(summary)).not.toContain("secret-key");
  });

  it("requires explicit allow-long-run for coverage audits above 30 minutes", () => {
    expect(() => validateGlobalFeedCoverageAuditOptions({ maxRuntimeMs: 31 * 60 * 1000 })).toThrow(/allow-long-run/);
    expect(() => validateGlobalFeedCoverageAuditOptions({ maxRuntimeMs: 31 * 60 * 1000, allowLongRun: true })).not.toThrow();
  });

  it("counts verified MMSI PositionReports and discards unknown MMSIs", async () => {
    const registry = coverageRegistryState();
    const state = createGlobalFeedCoverageAuditState({ maxRuntimeMs: 120000 });
    await handleCoverageAuditMessage(positionAuditMessage("244123456"), registry, state);
    await handleCoverageAuditMessage(positionAuditMessage("111222333"), registry, state);

    expect(state.knownVerifiedMmsiPositionMatches).toBe(1);
    expect(state.distinctVerifiedMmsisObserved.size).toBe(1);
    expect(state.nonVerifiedPositionMessagesDiscarded).toBe(1);
    expect(state.combinedObservedRegistryImos.size).toBe(1);
    expect(state.databaseWritesAttempted).toBe(0);
    expect(state.databaseWritesCompleted).toBe(0);
  });

  it("counts only checksum-valid exact accepted registry IMO static matches", async () => {
    const registry = coverageRegistryState();
    const state = createGlobalFeedCoverageAuditState({ maxRuntimeMs: 120000 });
    await handleCoverageAuditMessage(staticAuditMessage({ mmsi: "244123456", imo: "9837420", name: "Should Not Leak" }), registry, state);
    await handleCoverageAuditMessage(staticAuditMessage({ mmsi: "244123457", imo: "1234560" }), registry, state);
    await handleCoverageAuditMessage(staticAuditMessage({ mmsi: "244123458", imo: "9999999" }), registry, state);
    await handleCoverageAuditMessage({ data: JSON.stringify({ MessageType: "ShipStaticData", MetaData: { ShipName: "Name Only" }, Message: { ShipStaticData: { Name: "Name Only" } } }) }, registry, state);

    expect(state.exactAcceptedRegistryStaticMatches).toBe(1);
    expect(state.checksumValidImoValuesSeen).toBe(1);
    expect(state.messagesMissingUsableImo).toBe(3);
    expect(state.nonRegistryStaticMessagesDiscarded).toBe(3);
    expect(extractCoverageImo({ Message: { ShipStaticData: { ImoNumber: "9837420" } } })).toBe("9837420");
    expect(extractCoverageMmsi({ Message: { ShipStaticData: { MMSI: "244123456" } } })).toBe("244123456");
  });

  it("classifies linked confirmations, new MMSI candidates, and conflicts only in memory", async () => {
    const registry = coverageRegistryState();
    const state = createGlobalFeedCoverageAuditState({ maxRuntimeMs: 120000 });
    await handleCoverageAuditMessage(staticAuditMessage({ mmsi: "244123456", imo: "9837420" }), registry, state);
    await handleCoverageAuditMessage(staticAuditMessage({ mmsi: "244123999", imo: "9837420" }), registry, state);
    await handleCoverageAuditMessage(staticAuditMessage({ mmsi: "244123777", imo: "9137363" }), registry, state);

    expect(classifyStaticRegistryMatch("244123456", "244123456")).toBe("ALREADY_LINKED_MMSI");
    expect(classifyStaticRegistryMatch("244123456", "244123999")).toBe("MMSI_CONFLICT_REVIEW_REQUIRED");
    expect(classifyStaticRegistryMatch(null, "244123777")).toBe("NEW_MMSI_CANDIDATE_FOR_EXISTING_REGISTRY_ENTRY");
    expect(state.staticMatchesAlreadyLinkedToSameMmsi).toBe(1);
    expect(state.mmsiConflictReviewRequired).toBe(1);
    expect(state.newMmsiCandidatesForExistingRegistryEntry).toBe(1);
    expect(state.databaseWritesAttempted).toBe(0);
    expect(state.databaseWritesCompleted).toBe(0);
  });

  it("keeps reports free of raw payloads, vessel names, MMSIs, and IMOs", async () => {
    const registry = coverageRegistryState();
    const state = createGlobalFeedCoverageAuditState({ maxRuntimeMs: 120000 });
    await handleCoverageAuditMessage(staticAuditMessage({ mmsi: "244123456", imo: "9837420", name: "Example Secret Vessel" }), registry, state);
    state.endedAt = new Date("2026-07-03T12:00:00Z");
    state.connectedDurationMs = 120000;
    const report = toSerializableCoverageAuditReport(state, registry, {
      maxRuntimeMs: 120000,
      reportIntervalMs: 10000,
      format: "json",
      recentDays: 7
    });
    const output = formatGlobalFeedCoverageAuditReport(report, "json") + formatGlobalFeedCoverageAuditReport(report, "markdown");

    expect(output).not.toContain("secret-key");
    expect(output).not.toContain("244123456");
    expect(output).not.toContain("9837420");
    expect(output).not.toContain("Example Secret Vessel");
    expect(report.discoverySafety.databaseWritesAttempted).toBe(0);
    expect(report.discoverySafety.databaseWritesCompleted).toBe(0);
    expect(report.discoverySafety.rawPayloadRetention).toBe(false);
    expect(report.discoverySafety.unsafeMatchingUsed).toBe(false);
    expect(report.connection.reconnectCount).toBe(0);
  });

  it("calculates combined observed registry coverage without exposing identities", async () => {
    const registry = coverageRegistryState();
    const state = createGlobalFeedCoverageAuditState({ maxRuntimeMs: 120000 });
    await handleCoverageAuditMessage(positionAuditMessage("244123456"), registry, state);
    await handleCoverageAuditMessage(staticAuditMessage({ mmsi: "244123777", imo: "9137363" }), registry, state);
    state.endedAt = new Date("2026-07-03T12:00:00Z");
    state.connectedDurationMs = 120000;

    const report = toSerializableCoverageAuditReport(state, registry, {
      maxRuntimeMs: 120000,
      reportIntervalMs: 10000,
      format: "terminal",
      recentDays: 7
    });

    expect(report.registryCoverage.acceptedRegistryVessels).toBe(2);
    expect(report.registryCoverage.acceptedRegistryVesselsWithExistingLinkedMmsi).toBe(1);
    expect(report.registryCoverage.acceptedRegistryVesselsWithoutLinkedMmsi).toBe(1);
    expect(report.combinedCoverage.distinctRegistryVesselsObservedByEitherMethod).toBe(2);
    expect(report.combinedCoverage.combinedObservedRegistryCoverageRate).toBe(100);
    expect(report.combinedCoverage.label).toMatch(/audit window/);
  });

  it("produces all coverage verdicts", () => {
    const base = {
      requestedRuntimeMs: 120000,
      connectedDurationMs: 120000,
      socketOpened: true,
      subscriptionSent: true,
      reconnectCount: 0,
      unhandledErrors: 0,
      backlogObserved: false,
      eventLoopP95Ms: 20,
      closeCode: 1000,
      positionReportMessages: 10,
      shipStaticDataMessages: 5,
      knownVerifiedMmsiPositionMatches: 1,
      exactAcceptedRegistryStaticMatches: 1,
      checksumValidImoValuesSeen: 1
    };

    expect(getCoverageVerdict(base)).toBe("STRONG_SIGNAL_FOR_GLOBAL_LOCAL_FILTER");
    expect(getCoverageVerdict({ ...base, exactAcceptedRegistryStaticMatches: 0, checksumValidImoValuesSeen: 0 })).toBe("PROMISING_BUT_NEEDS_LONGER_AUDIT");
    expect(getCoverageVerdict({ ...base, knownVerifiedMmsiPositionMatches: 0, exactAcceptedRegistryStaticMatches: 0, checksumValidImoValuesSeen: 0 })).toBe("INSUFFICIENT_EVIDENCE");
    expect(getCoverageVerdict({ ...base, shipStaticDataMessages: 0 })).toBe("DATA_PATH_PROBLEM");
    expect(getCoverageVerdict({ ...base, reconnectCount: 1 })).toBe("DATA_PATH_PROBLEM");
  });
});

describe("global-local-filter cruise ingest", () => {
  it("builds exactly one global subscription without MMSI filters", () => {
    const payload = buildGlobalLocalFilterSubscriptionPayload("secret-key");
    const summary = getGlobalLocalFilterSubscriptionSummary(payload, 1);

    expect(payload.BoundingBoxes).toEqual([VERIFIED_GLOBAL_BOUNDING_BOX]);
    expect(payload.FilterMessageTypes).toEqual(["PositionReport", "ShipStaticData"]);
    expect(payload).not.toHaveProperty("FiltersShipMMSI");
    expect(summary).toMatchObject({
      mode: "global-local-filter",
      globalConnections: 1,
      usesExactGlobalBoundingBox: true,
      hasMmsiFilter: false,
      coordinateOrder: "[latitude, longitude]"
    });
    expect(JSON.stringify(summary)).not.toContain("secret-key");
  });

  it("requires allow-long-run for bounded runs over 30 minutes", () => {
    expect(() =>
      validateGlobalLocalFilterOptions({
        maxRuntimeMs: 31 * 60 * 1000,
        reportIntervalMs: 30000,
        positionRetentionDays: 90,
        reviewQueueLimit: 10000
      })
    ).toThrow(/allow-long-run/);
    expect(() =>
      validateGlobalLocalFilterOptions({
        maxRuntimeMs: 31 * 60 * 1000,
        reportIntervalMs: 30000,
        positionRetentionDays: 90,
        reviewQueueLimit: 10000,
        allowLongRun: true
      })
    ).not.toThrow();
  });

  it("fails closed when required Railway worker safety environment is missing or invalid", () => {
    const baseEnv = globalLocalFilterWorkerEnv();

    expect(() => validateGlobalLocalFilterWorkerEnvironment({ ...baseEnv, CRUISE_WORKER_ENV: undefined })).toThrow(/CRUISE_WORKER_ENV/);
    expect(() => validateGlobalLocalFilterWorkerEnvironment({ ...baseEnv, CRUISE_WORKER_ENV: "staging" })).toThrow(/Invalid CRUISE_WORKER_ENV/);
    expect(() => validateGlobalLocalFilterWorkerEnvironment({ ...baseEnv, DATABASE_URL: undefined })).toThrow(/DATABASE_URL/);
    expect(() => validateGlobalLocalFilterWorkerEnvironment({ ...baseEnv, AISSTREAM_API_KEY: "" })).toThrow(/AISSTREAM_API_KEY/);
    expect(() => validateGlobalLocalFilterWorkerEnvironment({ ...baseEnv, CRUISE_WORKER_DATABASE_TARGET: undefined })).toThrow(/CRUISE_WORKER_DATABASE_TARGET/);
  });

  it("requires cruises-dev as the Railway development database target", () => {
    expect(() =>
      validateGlobalLocalFilterWorkerEnvironment(globalLocalFilterWorkerEnv({ CRUISE_WORKER_ENV: "railway-development", CRUISE_WORKER_DATABASE_TARGET: "production" }))
    ).toThrow(/cruises-dev/);

    expect(validateGlobalLocalFilterWorkerEnvironment(globalLocalFilterWorkerEnv({ CRUISE_WORKER_ENV: "railway-development" }))).toMatchObject({
      workerEnv: "railway-development",
      databaseTarget: "cruises-dev"
    });
  });

  it("blocks production worker mode unless the explicit future override is present", () => {
    expect(() => validateGlobalLocalFilterWorkerEnvironment(globalLocalFilterWorkerEnv({ CRUISE_WORKER_ENV: "production" }))).toThrow(/CRUISE_WORKER_ALLOW_PRODUCTION/);
    expect(
      validateGlobalLocalFilterWorkerEnvironment(
        globalLocalFilterWorkerEnv({
          CRUISE_WORKER_ENV: "production",
          CRUISE_WORKER_ALLOW_PRODUCTION: "true"
        })
      )
    ).toMatchObject({ workerEnv: "production" });
  });

  it("keeps explicit local development supported and applies the Railway profile report interval", () => {
    expect(validateGlobalLocalFilterWorkerEnvironment(globalLocalFilterWorkerEnv({ CRUISE_WORKER_ENV: "development" }))).toMatchObject({
      workerEnv: "development",
      databaseTarget: "cruises-dev"
    });
    expect(getGlobalLocalFilterDefaultReportIntervalMs(globalLocalFilterWorkerEnv())).toBe(30000);
    expect(getGlobalLocalFilterDefaultReportIntervalMs(globalLocalFilterWorkerEnv({ CRUISE_WORKER_PROFILE: "railway" }))).toBe(60000);
  });

  it("formats startup safety logs without leaking database URLs or API keys", () => {
    const safety = validateGlobalLocalFilterWorkerEnvironment(globalLocalFilterWorkerEnv({ CRUISE_WORKER_PROFILE: "railway" }));
    const output = formatGlobalLocalFilterStartupSafetyLog(safety);

    expect(output).toContain("workerEnv=development");
    expect(output).toContain("databaseTarget=cruises-dev");
    expect(output).toContain("profile=railway");
    expect(output).not.toContain("postgres://user:password@example.invalid/cruises-dev");
    expect(output).not.toContain("secret-ais-key");
  });

  it("flushes pending writes and disconnects during bounded shutdown", async () => {
    const calls: string[] = [];
    await flushGlobalLocalFilterShutdown({
      writer: {
        async flush() {
          calls.push("flush");
        }
      },
      disconnectPrisma: async () => {
        calls.push("disconnect");
      },
      timeoutMs: 50
    });

    expect(calls).toEqual(["flush", "disconnect"]);
  });

  it("waits boundedly for in-flight global-local-filter messages during shutdown", async () => {
    let pending = 1;
    const timer = setTimeout(() => {
      pending = 0;
    }, 10);

    await expect(waitForGlobalLocalFilterPendingMessages(() => pending, 100)).resolves.toBe(0);
    clearTimeout(timer);
  });

  it("does not introduce reconcile apply behavior into the global-local-filter worker", () => {
    const source = readFileSync("lib/cruises/globalLocalFilterIngest.ts", "utf8");

    expect(source).not.toMatch(/reconcileCruiseCandidate|registry:reconcile|--apply/);
  });

  it("stores only known verified MMSI PositionReports and discards unknown MMSIs", async () => {
    const state = createGlobalLocalFilterState();
    const writer = fakeGlobalLocalFilterWriter();
    await handleGlobalLocalFilterMessage(positionAuditMessage("244123456"), globalLocalFilterLookup(), writer, state);
    await handleGlobalLocalFilterMessage(positionAuditMessage("111222333"), globalLocalFilterLookup(), writer, state);

    expect(state.verifiedPositionMatches).toBe(1);
    expect(writer.positions).toHaveLength(1);
    expect(state.discardedNonVerifiedPositions).toBe(1);
    expect(state.databaseWritesAttempted).toBe(0);
    expect(state.databaseWritesCompleted).toBe(0);
  });

  it("rejects invalid verified positions before storage", async () => {
    const state = createGlobalLocalFilterState();
    const writer = fakeGlobalLocalFilterWriter();
    await handleGlobalLocalFilterMessage(positionAuditMessage("244123456", { latitude: 0, longitude: 0 }), globalLocalFilterLookup(), writer, state);
    await handleGlobalLocalFilterMessage(positionAuditMessage("244123456", { speedOverGround: 99 }), globalLocalFilterLookup(), writer, state);

    expect(state.rejectedInvalidPositions).toBe(2);
    expect(writer.positions).toHaveLength(0);
  });

  it("dry-run writer counts would-store and skips duplicate positions without writes", async () => {
    const state = createGlobalLocalFilterState();
    const writer = createGlobalLocalFilterWriter({ dryRun: true, noEmissions: false, reviewQueueLimit: 10000 }, state);
    await handleGlobalLocalFilterMessage(positionAuditMessage("244123456"), globalLocalFilterLookup(), writer, state);
    await handleGlobalLocalFilterMessage(positionAuditMessage("244123456"), globalLocalFilterLookup(), writer, state);
    await writer.flush();

    expect(state.wouldStorePositions).toBe(1);
    expect(state.duplicatePositionsSkipped).toBe(1);
    expect(state.wouldAffectEmissionDays).toBe(1);
    expect(state.databaseWritesAttempted).toBe(0);
    expect(state.databaseWritesCompleted).toBe(0);
  });

  it("no-emissions disables dry-run emission day updates", async () => {
    const state = createGlobalLocalFilterState();
    const writer = createGlobalLocalFilterWriter({ dryRun: true, noEmissions: true, reviewQueueLimit: 10000 }, state);
    await handleGlobalLocalFilterMessage(positionAuditMessage("244123456"), globalLocalFilterLookup(), writer, state);

    expect(state.wouldStorePositions).toBe(1);
    expect(state.wouldAffectEmissionDays).toBe(0);
  });

  it("classifies static data without auto-linking or reconciliation", async () => {
    const state = createGlobalLocalFilterState();
    const writer = fakeGlobalLocalFilterWriter();
    await handleGlobalLocalFilterMessage(staticAuditMessage({ mmsi: "244123456", imo: "9837420", name: "Do Not Leak" }), globalLocalFilterLookup(), writer, state);
    await handleGlobalLocalFilterMessage(staticAuditMessage({ mmsi: "244123777", imo: "9137363" }), globalLocalFilterLookup(), writer, state);
    await handleGlobalLocalFilterMessage(staticAuditMessage({ mmsi: "244123999", imo: "9837420" }), globalLocalFilterLookup(), writer, state);
    await handleGlobalLocalFilterMessage(staticAuditMessage({ mmsi: "244123888", imo: "1234560" }), globalLocalFilterLookup(), writer, state);

    expect(classifyGlobalLocalFilterStaticData("244123456", "244123456")).toBe("ALREADY_LINKED_CONFIRMATION");
    expect(classifyGlobalLocalFilterStaticData(null, "244123777")).toBe("NEW_MMSI_CANDIDATE_FOR_EXISTING_REGISTRY_ENTRY");
    expect(classifyGlobalLocalFilterStaticData("244123456", "244123999")).toBe("MMSI_CONFLICT_REVIEW_REQUIRED");
    expect(state.alreadyLinkedConfirmations).toBe(1);
    expect(writer.queueItems.map((item) => item.classification)).toEqual(["NEW_MMSI_CANDIDATE_FOR_EXISTING_REGISTRY_ENTRY", "MMSI_CONFLICT_REVIEW_REQUIRED"]);
    expect(state.staticExactRegistryMatches).toBe(3);
    expect(state.databaseWritesAttempted).toBe(0);
  });

  it("dry-run queues candidates and conflicts as would-write metrics only", async () => {
    const state = createGlobalLocalFilterState();
    const writer = createGlobalLocalFilterWriter({ dryRun: true, noEmissions: false, reviewQueueLimit: 10000 }, state);
    await handleGlobalLocalFilterMessage(staticAuditMessage({ mmsi: "244123777", imo: "9137363" }), globalLocalFilterLookup(), writer, state);
    await handleGlobalLocalFilterMessage(staticAuditMessage({ mmsi: "244123999", imo: "9837420" }), globalLocalFilterLookup(), writer, state);
    await handleGlobalLocalFilterMessage(staticAuditMessage({ mmsi: "244123999", imo: "9837420" }), globalLocalFilterLookup(), writer, state);

    expect(state.wouldQueueNewMmsiCandidates).toBe(1);
    expect(state.wouldQueueConflicts).toBe(1);
    expect(state.databaseWritesAttempted).toBe(0);
    expect(state.databaseWritesCompleted).toBe(0);
  });

  it("redacts identifiers from formatted reports", async () => {
    const state = createGlobalLocalFilterState();
    const writer = createGlobalLocalFilterWriter({ dryRun: true, noEmissions: false, reviewQueueLimit: 10000 }, state);
    await handleGlobalLocalFilterMessage(staticAuditMessage({ mmsi: "244123777", imo: "9137363", name: "Secret Vessel" }), globalLocalFilterLookup(), writer, state);
    const output = formatGlobalLocalFilterReport(toGlobalLocalFilterReport(state));

    expect(output).not.toContain("244123777");
    expect(output).not.toContain("9137363");
    expect(output).not.toContain("Secret Vessel");
    expect(output).toContain("Database writes attempted/completed: 0/0");
    expect(output).toContain("Emission days affected/would affect: 0/0");
    expect(output).not.toContain("Emission days updated");
  });

  it("reports conservative runtime health statuses", () => {
    expect(getGlobalLocalFilterHealthStatus({ connected: true, reconnectCount: 0, backlogObserved: false, databaseWriteFailures: 0, queueWriteFailures: 0, lastError: null, consecutiveFastFailures: 0 })).toBe("HEALTHY");
    expect(getGlobalLocalFilterHealthStatus({ connected: true, reconnectCount: 0, backlogObserved: true, databaseWriteFailures: 0, queueWriteFailures: 0, lastError: null, consecutiveFastFailures: 0 })).toBe("BACKPRESSURE_RISK");
    expect(getGlobalLocalFilterHealthStatus({ connected: true, reconnectCount: 0, backlogObserved: false, databaseWriteFailures: 3, queueWriteFailures: 0, lastError: null, consecutiveFastFailures: 0 })).toBe("DATABASE_WRITE_FAILURE");
    expect(getGlobalLocalFilterHealthStatus({ connected: true, reconnectCount: 0, backlogObserved: false, databaseWriteFailures: 0, queueWriteFailures: 3, lastError: null, consecutiveFastFailures: 0 })).toBe("REVIEW_QUEUE_FAILURE");
    expect(getGlobalLocalFilterHealthStatus({ connected: false, reconnectCount: 1, backlogObserved: false, databaseWriteFailures: 0, queueWriteFailures: 0, lastError: null, consecutiveFastFailures: 1 })).toBe("AISSTREAM_UNAVAILABLE");
  });
});

describe("AIS cruise ship identity resolution", () => {
  it("updates the IMO record when the same IMO arrives with a new safe MMSI", async () => {
    const repo = new FakeCruiseShipRepository([{ id: "ship-1", imo: "1234567", mmsi: null, shipType: "Passenger ship" }]);

    const result = await resolveCruiseShipIdentity(repo, identity({ imo: "1234567", mmsi: "244123456" }));

    expect(result.ship.id).toBe("ship-1");
    expect(result.conflicts).toEqual([]);
    expect(repo.get("ship-1")?.mmsi).toBe("244123456");
  });

  it("updates the MMSI record when a new safe IMO arrives", async () => {
    const repo = new FakeCruiseShipRepository([{ id: "ship-1", imo: null, mmsi: "244123456", shipType: "Passenger ship" }]);

    const result = await resolveCruiseShipIdentity(repo, identity({ imo: "1234567", mmsi: "244123456" }));

    expect(result.ship.id).toBe("ship-1");
    expect(result.conflicts).toEqual([]);
    expect(repo.get("ship-1")?.imo).toBe("1234567");
  });

  it("keeps processing when an incoming IMO belongs to another ship", async () => {
    const repo = new FakeCruiseShipRepository([
      { id: "imo-owner", imo: "1234567", mmsi: "111111111", shipType: "Passenger ship" },
      { id: "mmsi-owner", imo: null, mmsi: "244123456", shipType: "Passenger ship" }
    ]);

    const result = await resolveCruiseShipIdentity(repo, identity({ imo: "7654321", mmsi: "244123456" }));

    expect(result.ship.id).toBe("mmsi-owner");
    expect(result.conflicts).toEqual([]);
    expect(repo.get("mmsi-owner")?.imo).toBe("7654321");

    const conflicting = await resolveCruiseShipIdentity(repo, identity({ imo: "1234567", mmsi: "244123456" }));
    expect(conflicting.ship.id).toBe("imo-owner");
    expect(conflicting.conflicts[0]).toContain("MMSI 244123456 already belongs to ship mmsi-owner");
    expect(repo.get("imo-owner")?.mmsi).toBe("111111111");
  });

  it("uses MMSI when IMO is missing", async () => {
    const repo = new FakeCruiseShipRepository([{ id: "ship-1", imo: null, mmsi: "244123456", shipType: "Passenger ship" }]);

    const result = await resolveCruiseShipIdentity(repo, identity({ imo: null, mmsi: "244123456" }));

    expect(result.ship.id).toBe("ship-1");
    expect(result.action).toBe("updated");
  });

  it("creates by valid IMO when MMSI is missing", async () => {
    const repo = new FakeCruiseShipRepository([]);

    const result = await resolveCruiseShipIdentity(repo, identity({ imo: "1234567", mmsi: null }));

    expect(result.action).toBe("created");
    expect(repo.get(result.ship.id)?.imo).toBe("1234567");
    expect(repo.get(result.ship.id)?.mmsi).toBeNull();
  });
});

describe("EMSA THETIS-MRV parser", () => {
  it("normalizes common MRV CSV headers", () => {
    const rows = parseMrvCsv(
      [
        "IMO,Ship name,Ship type,Company,Reporting year,Annual CO2 tonnes,Annual fuel tonnes,Distance nm,Time at sea hours",
        "1234567,Example Cruise,Passenger ship,Example Operator,2025,120000,38000,42000,2800"
      ].join("\n")
    );

    expect(rows[0]).toMatchObject({
      imo: "1234567",
      name: "Example Cruise",
      operator: "Example Operator",
      reportingYear: 2025,
      annualCo2Tonnes: 120000
    });
  });
});

describe("global-local-filter status reporting", () => {
  it("parses defaults and optional arguments", () => {
    expect(parseGlobalLocalFilterStatusArgs([])).toMatchObject({
      sinceHours: 24,
      format: "terminal",
      force: false,
      includeReviewDetails: false,
      includeVesselDetails: false
    });

    expect(
      parseGlobalLocalFilterStatusArgs([
        "--",
        "--since-hours",
        "12",
        "--format",
        "markdown",
        "--output",
        "reports/cruises/status.md",
        "--force",
        "--include-review-details",
        "--include-vessel-details"
      ])
    ).toMatchObject({
      sinceHours: 12,
      format: "markdown",
      output: "reports/cruises/status.md",
      force: true,
      includeReviewDetails: true,
      includeVesselDetails: true
    });
  });

  it("requires force when overwriting status output", () => {
    expect(() => assertCanWriteStatusOutput("reports/cruises/status.md", false, () => true)).toThrow(/--force/);
    expect(() => assertCanWriteStatusOutput("reports/cruises/status.md", true, () => true)).not.toThrow();
  });

  it("formats terminal, markdown and JSON output without sensitive identity fields by default", () => {
    const report = globalLocalFilterStatusReport();

    for (const format of ["terminal", "markdown", "json"] as const) {
      const output = formatGlobalLocalFilterStatusReport(report, format);
      expect(output).toContain(format === "json" ? "generatedAt" : format === "markdown" ? "Cruise Global-Local-Filter Status" : "global-local-filter");
      expect(outputContainsSensitiveCruiseIdentity(output)).toBe(false);
      expect(output).not.toContain("244123456");
      expect(output).not.toContain("9837420");
      expect(output).not.toContain("Example Cruise");
      expect(output).not.toContain("rawPayload");
    }
  });

  it("keeps detail flags anonymized", () => {
    const output = formatGlobalLocalFilterStatusReport(
      globalLocalFilterStatusReport({
        reviewQueue: {
          details: [
            {
              id: "queue-1",
              classification: "NEW_MMSI_CANDIDATE_FOR_EXISTING_REGISTRY_ENTRY",
              reviewStatus: "PENDING",
              firstSeenAt: "2026-07-03T10:00:00.000Z",
              lastSeenAt: "2026-07-03T10:05:00.000Z",
              occurrenceCount: 2
            }
          ]
        },
        vesselDetails: [{ label: "Verified vessel #1", positionCount: 3, latestObservedAt: "2026-07-03T10:05:00.000Z" }]
      }),
      "terminal"
    );

    expect(output).toContain("Verified vessel #1");
    expect(output).toContain("queue-1");
    expect(outputContainsSensitiveCruiseIdentity(output)).toBe(false);
    expect(output).not.toContain("244123456");
    expect(output).not.toContain("9837420");
  });

  it("surfaces pending review candidates and conflicts in safety checks", () => {
    const report = globalLocalFilterStatusReport({
      reviewQueue: { pendingRecords: 1, mmsiConflictCount: 1 }
    });

    expect(report.safetyChecks.pendingReviewCandidateExists).toBe(true);
    expect(report.safetyChecks.conflictExists).toBe(true);
    expect(report.safetyChecks.databaseWritesAttempted).toBe(0);
    expect(report.safetyChecks.autoLinkingPerformed).toBe(false);
    expect(report.safetyChecks.reconcileOrImportApplied).toBe(false);
  });

  it("uses UTC calendar days consistently for status windows", () => {
    const range = getUtcDayRangeForStatusWindow(new Date("2026-07-02T23:30:00Z"), new Date("2026-07-03T01:30:00Z"));

    expect(range.start.toISOString()).toBe("2026-07-02T00:00:00.000Z");
    expect(range.endExclusive.toISOString()).toBe("2026-07-04T00:00:00.000Z");
  });

  it("counts valid observed vessels in 24h and 7d windows using UTC timestamps", () => {
    const now = new Date("2026-07-06T12:00:00Z");
    const summary = summarizeObservedVerifiedPositions(
      [
        observedPosition("ship-recent", "2026-07-06T11:59:00Z"),
        observedPosition("ship-boundary", "2026-07-05T12:00:00Z"),
        observedPosition("ship-week", "2026-07-01T12:00:00Z"),
        observedPosition("ship-old", "2026-06-28T12:00:00Z")
      ],
      now
    );

    expect(summary.verifiedVesselsObservedLast24h).toBe(2);
    expect(summary.verifiedVesselsObservedLast7d).toBe(3);
    expect(summary.verifiedVesselsWithStoredPositions).toBe(4);
  });

  it("excludes invalid, zero-island, and future positions from observed status counts", () => {
    const now = new Date("2026-07-06T12:00:00Z");
    const summary = summarizeObservedVerifiedPositions(
      [
        observedPosition("ship-valid", "2026-07-06T11:59:00Z"),
        observedPosition("ship-invalid-lat", "2026-07-06T11:59:00Z", { latitude: 91 }),
        observedPosition("ship-zero", "2026-07-06T11:59:00Z", { latitude: 0, longitude: 0 }),
        observedPosition("ship-future", "2026-07-06T12:01:00Z")
      ],
      now
    );

    expect(summary.verifiedVesselsObservedLast24h).toBe(1);
    expect(summary.verifiedVesselsObservedLast7d).toBe(1);
    expect(summary.verifiedVesselsWithStoredPositions).toBe(1);
  });

  it("distinguishes old estimate dates updated now from exact estimate-date window coverage", () => {
    const summary = summarizeEmissionStatusRows(
      [
        {
          shipId: "ship-1",
          estimateDate: new Date("2026-07-03T00:00:00Z"),
          createdAt: new Date("2026-07-03T00:05:00Z"),
          updatedAt: new Date("2026-07-03T11:15:00Z")
        }
      ],
      new Date("2026-07-03T10:00:00Z"),
      new Date("2026-07-03T12:00:00Z")
    );

    expect(summary.estimateDateRows).toBe(0);
    expect(summary.utcCalendarRows).toBe(1);
    expect(summary.writeRows).toBe(1);
    expect(summary.writeVessels).toBe(1);
  });

  it("distinguishes current estimate dates from write activity when created earlier", () => {
    const summary = summarizeEmissionStatusRows(
      [
        {
          shipId: "ship-1",
          estimateDate: new Date("2026-07-03T00:00:00Z"),
          createdAt: new Date("2026-07-03T00:05:00Z"),
          updatedAt: new Date("2026-07-03T00:05:00Z")
        }
      ],
      new Date("2026-07-03T10:00:00Z"),
      new Date("2026-07-03T12:00:00Z")
    );

    expect(summary.estimateDateRows).toBe(0);
    expect(summary.utcCalendarRows).toBe(1);
    expect(summary.writeRows).toBe(0);
  });
});

describe("cruise MMSI review workflow", () => {
  it("lists pending candidates with identifiers hidden by default", () => {
    const report = mmsiReviewReport();
    const output = formatMmsiReviewReport(report, "terminal");

    expect(output).toContain("Cruise MMSI candidate review queue");
    expect(output).toContain("Identifiers: hidden");
    expect(output).toContain("NEW_MMSI_CANDIDATE_FOR_EXISTING_REGISTRY_ENTRY");
    expect(output).not.toContain("244123456");
    expect(output).not.toContain("9837420");
    expect(output).not.toContain("Example Cruise");
    expect(output).not.toContain("rawPayload");
    expect(output).not.toContain("secret");
  });

  it("only exposes explicit review identifiers when requested", () => {
    const report = mmsiReviewReport({ includeIdentifiers: true });
    const output = formatMmsiReviewReport(report, "json");

    expect(output).toContain("244123456");
    expect(output).toContain("9837420");
    expect(output).toContain("Example Cruise");
    expect(output).toContain("registryHasLinkedMmsi");
    expect(output).not.toContain("rawPayload");
    expect(output).not.toContain("APIKey");
    expect(output).not.toContain("postgres://");
  });

  it("requires explicit notes for approval and dismissal commands", () => {
    expect(() => parseMmsiReviewArgs(["--approve", "queue-1"])).toThrow(/--note/);
    expect(() => parseMmsiReviewArgs(["--dismiss"])).toThrow(/queue id/);
    expect(() => parseMmsiReviewArgs(["--dismiss", "queue-1", "--note", "not enough evidence"])).not.toThrow();
    expect(parseMmsiReviewArgs(["--apply-approved"]).action).toMatchObject({ kind: "apply-approved", dryRun: true, confirm: false });
    expect(parseMmsiReviewArgs(["--apply-approved", "--confirm"]).action).toMatchObject({ kind: "apply-approved", dryRun: false, confirm: true });
  });

  it("approves only exact accepted registry MMSI candidates without conflicts", () => {
    expect(evaluateMmsiCandidateForApproval(mmsiReviewRow())).toBeNull();
    expect(evaluateMmsiCandidateForApproval(mmsiReviewRow({ classification: "MMSI_CONFLICT_REVIEW_REQUIRED" }))).toBe("wrong classification");
    expect(evaluateMmsiCandidateForApproval(mmsiReviewRow({ reviewStatus: "REVIEWED" }))).toBe("queue record is not pending");
    expect(evaluateMmsiCandidateForApproval(mmsiReviewRow({ registryDecision: "EXCLUDE" }))).toBe("registry decision is not ACCEPT");
    expect(evaluateMmsiCandidateForApproval(mmsiReviewRow({ registryImo: "1234568" }))).toBe("registry IMO exact-match requirement is absent");
    expect(evaluateMmsiCandidateForApproval(mmsiReviewRow({ observedMmsi: "bad" }))).toBe("observed MMSI is invalid");
    expect(evaluateMmsiCandidateForApproval(mmsiReviewRow({ linkedMmsi: "111111111" }))).toBe("registry entry already has a different linked MMSI");
    expect(evaluateMmsiCandidateForApproval(mmsiReviewRow({ observedMmsiLinkedElsewhere: true }))).toBe("observed MMSI is already linked elsewhere");
    expect(evaluateMmsiCandidateForApproval(mmsiReviewRow({ hasUnresolvedConflict: true }))).toBe("unresolved MMSI conflict exists");
  });

  it("approval and dismissal notes do not imply a linked MMSI was applied", () => {
    const approvalNote = buildApprovalResolutionNote("Official source reviewed", new Date("2026-07-07T10:00:00Z"));
    const dismissalNote = buildDismissalResolutionNote("Conflicting evidence", new Date("2026-07-07T10:00:00Z"));

    expect(isApprovedReviewNote(approvalNote)).toBe(true);
    expect(isDismissedReviewNote(dismissalNote)).toBe(true);
    expect(isAppliedReviewNote(approvalNote)).toBe(false);
    expect(isAppliedReviewNote(dismissalNote)).toBe(false);
  });

  it("applies only previously approved eligible queue records", () => {
    const approvedNote = buildApprovalResolutionNote("Two public sources checked", new Date("2026-07-07T10:00:00Z"));
    expect(evaluateApprovedCandidateForApply(mmsiReviewRow({ reviewStatus: "REVIEWED", resolutionNotes: approvedNote }))).toBeNull();
    expect(getApprovedCandidateApplyPlan(mmsiReviewRow({ reviewStatus: "REVIEWED", resolutionNotes: approvedNote }))).toMatchObject({
      action: "update-existing-identity",
      shipId: "ship-1"
    });
    expect(
      getApprovedCandidateApplyPlan(mmsiReviewRow({ reviewStatus: "REVIEWED", resolutionNotes: approvedNote, targetShipCount: 0, targetShipId: null }))
    ).toMatchObject({ action: "create-registry-linked-identity" });
    expect(evaluateApprovedCandidateForApply(mmsiReviewRow({ reviewStatus: "PENDING", resolutionNotes: approvedNote }))).toBe("not approved");
    expect(evaluateApprovedCandidateForApply(mmsiReviewRow({ reviewStatus: "DISMISSED", resolutionNotes: approvedNote }))).toBe("not approved");
    expect(evaluateApprovedCandidateForApply(mmsiReviewRow({ reviewStatus: "REVIEWED", resolutionNotes: null }))).toBe("not explicitly approved");
    expect(evaluateApprovedCandidateForApply(mmsiReviewRow({ reviewStatus: "REVIEWED", resolutionNotes: buildAppliedResolutionNote(approvedNote) }))).toBe("already applied");
    expect(evaluateApprovedCandidateForApply(mmsiReviewRow({ reviewStatus: "REVIEWED", resolutionNotes: "[APPROVED_MMSI_LINK] 2026-07-07T10:00:00.000Z" }))).toBe("missing approval note");
    expect(evaluateApprovedCandidateForApply(mmsiReviewRow({ reviewStatus: "REVIEWED", resolutionNotes: approvedNote, targetShipCount: 2 }))).toBe(
      "multiple existing cruise identity records for registry IMO"
    );
    expect(evaluateApprovedCandidateForApply(mmsiReviewRow({ reviewStatus: "REVIEWED", resolutionNotes: approvedNote, targetShipMmsi: "111111111" }))).toBe(
      "target ship already has a different MMSI"
    );
    expect(evaluateApprovedCandidateForApply(mmsiReviewRow({ reviewStatus: "REVIEWED", resolutionNotes: approvedNote, observedMmsiLinkedElsewhere: true }))).toBe(
      "observed MMSI linked elsewhere"
    );
    expect(evaluateApprovedCandidateForApply(mmsiReviewRow({ reviewStatus: "REVIEWED", resolutionNotes: approvedNote, hasUnresolvedConflict: true }))).toBe("unresolved conflict");
  });

  it("requires the cruises-dev target for mutating review actions", () => {
    expect(() => assertMmsiReviewMutationTarget({ CRUISE_WORKER_ENV: "production", CRUISE_WORKER_DATABASE_TARGET: "cruises-dev" })).toThrow(/development/);
    expect(() => assertMmsiReviewMutationTarget({ CRUISE_WORKER_ENV: "development", CRUISE_WORKER_DATABASE_TARGET: "production" })).toThrow(/cruises-dev/);
    expect(assertMmsiReviewMutationTarget({ CRUISE_WORKER_ENV: "railway-development", CRUISE_WORKER_DATABASE_TARGET: "cruises-dev" })).toMatchObject({
      databaseTarget: "cruises-dev"
    });
  });

  it("keeps registry reconcile apply separate from queue review", () => {
    const source = readFileSync("scripts/reconcile-cruise-registry.ts", "utf8");
    const reviewSource = readFileSync("lib/cruises/mmsiReviewWorkflow.ts", "utf8");

    expect(source).not.toContain("cruise_static_data_review_queue");
    expect(source).not.toContain("APPROVED_MMSI_LINK");
    expect(source).not.toContain("observedMmsi");
    expect(reviewSource).toContain("prisma.$transaction");
    expect(reviewSource).toContain("pnpm cruises:registry:reconcile -- --dry-run");
    expect(reviewSource).not.toContain("pnpm cruises:registry:reconcile -- --apply");
  });

  it("guarantees future apply writes verification before marking a queue row applied", () => {
    const reviewSource = readFileSync("lib/cruises/mmsiReviewWorkflow.ts", "utf8");
    const verificationIndex = reviewSource.indexOf("ensureApprovedMmsiLinkState(tx, row, plan.shipId, queueId)");
    const markerIndex = reviewSource.indexOf("buildAppliedResolutionNote(row.resolutionNotes)");

    expect(reviewSource).toContain("tx.cruiseVesselVerification.upsert");
    expect(reviewSource).toContain("verifyAppliedMmsiLinkState(tx, row, shipId)");
    expect(verificationIndex).toBeGreaterThan(-1);
    expect(markerIndex).toBeGreaterThan(-1);
    expect(verificationIndex).toBeLessThan(markerIndex);
  });

  it("diagnoses applied queue rows whose identity exists but verification is missing", () => {
    const report = mmsiApplyDiagnosticsReport({
      rows: [
        {
          queueId: "queue-1",
          registryImo: "9837420",
          observedMmsi: "244123456",
          reviewStatus: "REVIEWED",
          queueState: "applied",
          registryHasLinkedMmsi: false,
          cruiseIdentityHasMmsi: true,
          verificationState: "missing",
          publicEligible: false,
          reason: "missing cruise vessel verification"
        }
      ]
    });

    const output = formatMmsiReviewDiagnosticsReport(report, "terminal");

    expect(output).toContain("Inconsistent applied rows: 1");
    expect(output).toContain("queue state: applied");
    expect(output).toContain("cruise identity MMSI linkage: yes");
    expect(output).toContain("verification state: missing");
    expect(output).toContain("public eligible: no");
    expect(output).toContain("missing cruise vessel verification");
    expect(output).not.toContain("rawPayload");
    expect(output).not.toContain("postgres://");
  });

  it("diagnoses applied rows as consistent when registry linkage and public eligibility agree", () => {
    const report = mmsiApplyDiagnosticsReport({
      inconsistentAppliedRows: 0,
      rows: [
        {
          queueId: "queue-2",
          registryImo: "9837420",
          observedMmsi: "244123456",
          reviewStatus: "REVIEWED",
          queueState: "applied",
          registryHasLinkedMmsi: true,
          cruiseIdentityHasMmsi: true,
          verificationState: "eligible",
          publicEligible: true,
          reason: null
        }
      ]
    });

    const output = formatMmsiReviewDiagnosticsReport(report, "json");

    expect(output).toContain('"inconsistentAppliedRows": 0');
    expect(output).toContain('"registryHasLinkedMmsi": true');
    expect(output).toContain('"publicEligible": true');
  });

  it("keeps applied MMSI repair planning dry-run only", () => {
    const plan: MmsiReviewRepairPlan = {
      mode: "dry-run",
      generatedAt: "2026-07-07T10:00:00.000Z",
      rowsConsidered: 2,
      wouldRepair: 1,
      skipped: [{ queueId: "queue-2", reason: "already public eligible" }],
      skippedByReason: { "already public eligible": 1 },
      databaseWritesAttempted: 0,
      followUp: "No confirm mode is implemented."
    };

    const output = formatMmsiReviewRepairPlan(plan, "terminal");

    expect(output).toContain("Mode: dry-run");
    expect(output).toContain("Would repair: 1");
    expect(output).toContain("Database writes attempted: 0");
    expect(output).not.toContain("--confirm");
    expect(output).not.toContain("rawPayload");
  });
});

function mmsiReviewReport(overrides: Partial<Omit<MmsiReviewListReport, "rows">> & { row?: Partial<MmsiReviewRow> } = {}): MmsiReviewListReport {
  return {
    generatedAt: "2026-07-07T10:00:00.000Z",
    status: "pending",
    totalRows: 1,
    includeIdentifiers: false,
    ...overrides,
    rows: [mmsiReviewRow(overrides.row)]
  };
}

function mmsiApplyDiagnosticsReport(overrides: Partial<MmsiReviewApplyDiagnosticsReport> = {}): MmsiReviewApplyDiagnosticsReport {
  return {
    generatedAt: "2026-07-07T10:00:00.000Z",
    status: "reviewed",
    totalRows: overrides.rows?.length ?? 0,
    inconsistentAppliedRows: overrides.rows?.filter((row) => row.queueState === "applied" && !row.publicEligible).length ?? 0,
    rows: [],
    ...overrides
  };
}

function mmsiReviewRow(overrides: Partial<MmsiReviewRow> = {}): MmsiReviewRow {
  return {
    id: "queue-1",
    registryEntryId: "registry-1",
    observedMmsi: "244123456",
    classification: "NEW_MMSI_CANDIDATE_FOR_EXISTING_REGISTRY_ENTRY",
    reviewStatus: "PENDING",
    occurrenceCount: 2,
    firstSeenAt: new Date("2026-07-07T09:00:00Z"),
    lastSeenAt: new Date("2026-07-07T10:00:00Z"),
    resolvedAt: null,
    resolutionNotes: null,
    registryName: "Example Cruise",
    registryOperator: "Example Operator",
    registryImo: "9837420",
    registryDecision: "ACCEPT",
    linkedMmsi: null,
    observedMmsiLinkedElsewhere: false,
    hasUnresolvedConflict: false,
    targetShipCount: 1,
    targetShipId: "ship-1",
    targetShipMmsi: null,
    ...overrides
  };
}

function identity(overrides: Partial<CruiseShipIdentityInput>): CruiseShipIdentityInput {
  return {
    imo: null,
    mmsi: null,
    name: "Example Cruise",
    shipType: "Passenger ship",
    destination: "TEST",
    source: "AISStream.io",
    ...overrides
  };
}

function position(overrides: Partial<ReturnType<typeof positionBase>>) {
  return { ...positionBase(), ...overrides };
}

function observedPosition(shipId: string, timestamp: string, overrides: Partial<{ latitude: number; longitude: number }> = {}) {
  return {
    shipId,
    timestamp: new Date(timestamp),
    latitude: overrides.latitude ?? 40,
    longitude: overrides.longitude ?? 4
  };
}

function positionBase() {
  return {
    shipId: "ship",
    name: "Example Cruise",
    operator: "Example Operator",
    mmsi: "244123456",
    latitude: 40,
    longitude: 4,
    speedOverGround: 14,
    destination: "TEST",
    timestamp: new Date("2026-07-01T11:00:00Z"),
    activityWeight: 1,
    estimatedCo2Tonnes: null
  };
}

function estimateRow(overrides: {
  shipId: string;
  date: Date;
  methodVersion: string;
  estimatedCo2Tonnes: number;
  estimatedFuelTonnes?: number;
  distanceNm?: number;
}) {
  return {
    estimatedFuelTonnes: 0,
    distanceNm: 0,
    ...overrides
  };
}

function auditVessel(overrides: Partial<CruiseScopeAuditVessel>): CruiseScopeAuditVessel {
  return {
    name: "TEST VESSEL",
    imo: "1234567",
    mmsi: "244123456",
    operator: null,
    shipType: "Passenger ship",
    grossTonnage: null,
    length: null,
    width: null,
    destination: null,
    hasMrvRecord: false,
    hasStaticPayload: false,
    ...overrides
  };
}

function registryCandidate(overrides: {
  id?: string;
  imo?: string | null;
  mmsi?: string | null;
  name?: string;
  shipType?: string | null;
  hasMrvRecord?: boolean;
}) {
  return {
    id: "ship-1",
    imo: "9837420",
    mmsi: "215123456",
    name: "Candidate Vessel",
    shipType: "Passenger ship",
    hasMrvRecord: false,
    ...overrides
  };
}

function viabilityRegistryEntry(overrides: Partial<{
  imo: string;
  operator: string;
  operatorGroup: string | null;
  vesselSegment: string;
  registryDecision: string;
  activeStatus: string;
}>) {
  return {
    imo: "1234567",
    operator: "Example Cruises",
    operatorGroup: "Example Group",
    vesselSegment: "OCEAN_CRUISE",
    registryDecision: "ACCEPT",
    activeStatus: "ACTIVE",
    ...overrides
  };
}

function viabilityShip(overrides: Partial<{
  shipId: string;
  imo: string | null;
  mmsi: string | null;
  operator: string;
  operatorGroup: string | null;
  vesselSegment: string;
}>) {
  return {
    shipId: "ship-1",
    imo: "1234567",
    mmsi: "244123456",
    operator: "Example Cruises",
    operatorGroup: "Example Group",
    vesselSegment: "OCEAN_CRUISE",
    ...overrides
  };
}

function coverageRegistryState(): CoverageRegistryState {
  return {
    acceptedRegistryImoSet: new Set(["9837420", "9137363"]),
    registryCoverageStateByImo: new Map([
      ["9837420", { hasLinkedMmsi: true, linkedMmsi: "244123456", publicEligible: true }],
      ["9137363", { hasLinkedMmsi: false, linkedMmsi: null, publicEligible: false }]
    ]),
    verifiedMmsiToImo: new Map([["244123456", "9837420"]]),
    acceptedRegistryVessels: 2,
    acceptedRegistryVesselsWithExistingLinkedMmsi: 1,
    acceptedRegistryVesselsWithoutLinkedMmsi: 1,
    verifiedPublicEligibleVessels: 1
  };
}

function positionAuditMessage(mmsi: string, overrides: Partial<{ latitude: number; longitude: number; speedOverGround: number; timestamp: string }> = {}) {
  const latitude = overrides.latitude ?? 52.1;
  const longitude = overrides.longitude ?? 4.3;
  const speedOverGround = overrides.speedOverGround ?? 12;
  return {
    data: JSON.stringify({
      MessageType: "PositionReport",
      MetaData: { MMSI: mmsi, latitude, longitude, time_utc: overrides.timestamp ?? "2026-07-03T12:00:00Z" },
      Message: { PositionReport: { UserID: mmsi, Latitude: latitude, Longitude: longitude, Sog: speedOverGround } }
    })
  };
}

function staticAuditMessage(input: { mmsi: string; imo: string; name?: string }) {
  return {
    data: JSON.stringify({
      MessageType: "ShipStaticData",
      MetaData: { MMSI: input.mmsi, ShipName: input.name },
      Message: {
        ShipStaticData: {
          UserID: input.mmsi,
          ImoNumber: input.imo,
          Name: input.name,
          Type: "Passenger"
        }
      }
    })
  };
}

function globalLocalFilterStatusReport(overrides: Partial<Omit<GlobalLocalFilterStatusReport, "reviewQueue">> & {
  reviewQueue?: Partial<GlobalLocalFilterStatusReport["reviewQueue"]>;
  vesselDetails?: GlobalLocalFilterStatusReport["vesselDetails"];
} = {}): GlobalLocalFilterStatusReport {
  const reviewQueue = {
    totalRecords: 0,
    pendingRecords: 0,
    reviewedRecords: 0,
    dismissedRecords: 0,
    alreadyLinkedConfirmationCount: 0,
    newMmsiCandidateCount: 0,
    mmsiConflictCount: 0,
    recordsCreatedInWindow: 0,
    recordsUpdatedInWindow: 0,
    pendingMmsiReviewCandidates: 0,
    pendingMmsiConflicts: 0,
    oldestPendingAt: null,
    newestPendingAt: null,
    ...overrides.reviewQueue
  };
  return {
    generatedAt: "2026-07-03T12:00:00.000Z",
    sinceHours: 24,
    windowStart: "2026-07-02T12:00:00.000Z",
    windowEnd: "2026-07-03T12:00:00.000Z",
    grouping: "hour",
    registry: {
      acceptedRegistryEntries: 220,
      verifiedPublicEligibleVessels: 109,
      verifiedMmsisLoaded: 109,
      verifiedVesselsWithLinkedMmsi: 109,
      verifiedVesselsObservedLast24h: 3,
      verifiedVesselsObservedLast7d: 8,
      verifiedVesselsWithStoredPositions: 12,
      verifiedVesselsWithStoredPositionsInWindow: 3,
      verifiedVesselsWithDailyEstimatesForWindowUtcDays: 2
    },
    positions: {
      totalStoredCruisePositions: 12,
      distinctVerifiedVesselsWithStoredPositions: 3,
      earliestStoredPositionAt: "2026-07-03T10:00:00.000Z",
      latestStoredPositionAt: "2026-07-03T11:00:00.000Z",
      invalidOrMissingCoordinatePositions: 0,
      grouped: [{ label: "2026-07-03T10:00:00.000Z", count: 12 }]
    },
    reviewQueue,
    emissions: {
      estimateDateWindow: {
        dailyEstimateRows: 0,
        distinctVerifiedVessels: 0,
        earliestEstimateDate: null,
        latestEstimateDate: null
      },
      utcCalendarDaysCoveredByWindow: {
        start: "2026-07-03T00:00:00.000Z",
        endExclusive: "2026-07-04T00:00:00.000Z",
        dailyEstimateRows: 2,
        distinctVerifiedVessels: 2,
        earliestEstimateDate: "2026-07-03T00:00:00.000Z",
        latestEstimateDate: "2026-07-03T00:00:00.000Z"
      },
      writeActivity: {
        available: false,
        reason: "cruise_emissions_daily_estimates has no created_at/updated_at audit columns",
        rowsCreatedOrUpdatedInWindow: null,
        distinctVerifiedVesselsCreatedOrUpdatedInWindow: null,
        earliestWriteActivityAt: null,
        latestWriteActivityAt: null
      }
    },
    safetyChecks: {
      readOnlyCommand: true,
      databaseWritesAttempted: 0,
      autoLinkingPerformed: false,
      reconcileOrImportApplied: false,
      pendingReviewCandidateExists: (reviewQueue.pendingRecords ?? 0) > 0,
      conflictExists: (reviewQueue.mmsiConflictCount ?? 0) > 0,
      identityFieldsHiddenByDefault: true
    },
    ...(overrides.vesselDetails ? { vesselDetails: overrides.vesselDetails } : {})
  };
}

function globalLocalFilterLookup(): VerifiedCruiseLookup {
  return {
    mmsiToShip: new Map([["244123456", { shipId: "ship-verified" }]]),
    acceptedRegistryByImo: new Map([
      ["9837420", { registryEntryId: "registry-linked", linkedMmsi: "244123456" }],
      ["9137363", { registryEntryId: "registry-unlinked", linkedMmsi: null }]
    ])
  };
}

function globalLocalFilterWorkerEnv(overrides: Record<string, string | undefined> = {}): Record<string, string | undefined> {
  return {
    DATABASE_URL: "postgres://user:password@example.invalid/cruises-dev",
    AISSTREAM_API_KEY: "secret-ais-key",
    CRUISE_WORKER_ENV: "development",
    CRUISE_WORKER_DATABASE_TARGET: "cruises-dev",
    ...overrides
  };
}

function fakeGlobalLocalFilterWriter(): GlobalLocalFilterWriter & { positions: GlobalLocalFilterPosition[]; queueItems: StaticQueueItem[] } {
  const positions: GlobalLocalFilterPosition[] = [];
  const queueItems: StaticQueueItem[] = [];
  return {
    positions,
    queueItems,
    async enqueuePosition(position: GlobalLocalFilterPosition) {
      positions.push(position);
    },
    async enqueueStaticQueueItem(item: StaticQueueItem) {
      queueItems.push(item);
    },
    async flush() {},
    pendingCount() {
      return positions.length;
    }
  };
}

class FakeCruiseShipRepository implements CruiseShipIdentityRepository {
  private ships = new Map<string, CruiseShipIdentityRecord & { name?: string | null; destination?: string | null }>();
  private counter = 0;

  constructor(seed: CruiseShipIdentityRecord[]) {
    for (const ship of seed) this.ships.set(ship.id, { ...ship });
  }

  get(id: string) {
    return this.ships.get(id);
  }

  async findByImo(imo: string) {
    return [...this.ships.values()].find((ship) => ship.imo === imo) ?? null;
  }

  async findByMmsi(mmsi: string) {
    return [...this.ships.values()].find((ship) => ship.mmsi === mmsi) ?? null;
  }

  async create(data: CruiseShipIdentityInput & { name: string }) {
    if (data.imo && (await this.findByImo(data.imo))) throw Object.assign(new Error("duplicate imo"), { code: "P2002" });
    if (data.mmsi && (await this.findByMmsi(data.mmsi))) throw Object.assign(new Error("duplicate mmsi"), { code: "P2002" });
    this.counter += 1;
    const id = `created-${this.counter}`;
    this.ships.set(id, {
      id,
      imo: data.imo,
      mmsi: data.mmsi,
      shipType: data.shipType ?? null,
      name: data.name,
      destination: data.destination ?? null
    });
    return { id };
  }

  async update(id: string, data: Partial<CruiseShipIdentityInput>) {
    const existing = this.ships.get(id);
    if (!existing) throw new Error(`Unknown ship ${id}`);
    const imoOwner = data.imo ? await this.findByImo(data.imo) : null;
    const mmsiOwner = data.mmsi ? await this.findByMmsi(data.mmsi) : null;
    if (imoOwner && imoOwner.id !== id) throw Object.assign(new Error("duplicate imo"), { code: "P2002" });
    if (mmsiOwner && mmsiOwner.id !== id) throw Object.assign(new Error("duplicate mmsi"), { code: "P2002" });
    this.ships.set(id, {
      ...existing,
      ...data,
      imo: data.imo === undefined ? existing.imo : data.imo,
      mmsi: data.mmsi === undefined ? existing.mmsi : data.mmsi,
      shipType: data.shipType === undefined ? existing.shipType : data.shipType
    });
    return { id };
  }
}
