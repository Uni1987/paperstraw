import { afterEach, describe, expect, it } from "vitest";
import {
  buildSubscriptionPayload,
  buildVerifiedGlobalConnectionConfigs,
  getEmptyAllowlistStartupDecision,
  getPositionQualityIssue,
  messageDataToString,
  resolveCruiseShipIdentity,
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
  CRUISE_POSITION_FRESHNESS_WINDOW_MS,
  buildCruiseActivityMapPoints,
  dedupeCruiseEstimateRows,
  estimateCruiseMapPayloadBytes,
  getCruiseDataStatus,
  getCruiseMapCopy,
  filterPublicCruiseRowsByVerifiedShipIds,
  isPublicVerifiedOceanCruise,
  selectLatestCruisePositionPerShip,
  summarizeCruiseEstimateRows
} from "@/lib/cruises/queries";

afterEach(() => {
  delete process.env.AISSTREAM_BOUNDING_BOXES;
  delete process.env.CRUISE_AIS_INGEST_MODE;
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
      mmsis: ["215123456"]
    });

    expect(discovery).toMatchObject({ APIKey: "key", BoundingBoxes: [CRUISE_REGIONS[0].boundingBox] });
    expect(discovery).not.toHaveProperty("FiltersShipMMSI");
    expect(verified).toMatchObject({ APIKey: "key", FiltersShipMMSI: ["215123456"] });
    expect(verified).not.toHaveProperty("BoundingBoxes");
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
    expect(copy.subtitle).toContain("Latest AIS vessel positions");
    expect(`${copy.legendTitle} ${copy.subtitle}`).not.toMatch(/emissions intensity|mixed|CO2 weighting/i);
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
