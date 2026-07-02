import type { CruiseActiveStatus, CruiseRegistryDecision, CruiseVesselSegment } from "@/lib/cruises/registry";

export const REGISTRY_EXPANSION_STATUSES = ["NOT_STARTED", "RESEARCHING", "READY_FOR_REVIEW", "IMPORTED", "NEEDS_MANUAL_SCOPE_DECISION"] as const;
export const REGISTRY_EXPANSION_SCOPES = ["OCEAN_CRUISE", "EXPEDITION_CRUISE", "REVIEW_REQUIRED"] as const;
export const AISSTREAM_MMSI_FILTER_LIMIT = 50;

export type RegistryExpansionStatus = (typeof REGISTRY_EXPANSION_STATUSES)[number];
export type RegistryExpansionScope = (typeof REGISTRY_EXPANSION_SCOPES)[number];
export type EffectiveRegistryStatus = RegistryExpansionStatus | "PROPOSED";
export type RegistryCoverageConfidence = "COMPLETE" | "PARTIAL" | "UNKNOWN";

export type RegistryExpansionManifestEntry = {
  operatorGroup: string;
  operator: string;
  priority: number;
  expectedScope: RegistryExpansionScope;
  registryStatus: RegistryExpansionStatus;
  officialFleetSource: string | null;
  imoIdentitySource: string | null;
  notes: string | null;
};

export type CoverageRegistryEntry = {
  imo: string;
  operator: string;
  operatorGroup: string | null;
  registryDecision: CruiseRegistryDecision;
  activeStatus: CruiseActiveStatus;
  vesselSegment: CruiseVesselSegment;
};

export type CoverageCandidateShip = {
  id: string;
  imo: string | null;
  mmsi?: string | null;
  name?: string | null;
  operator?: string | null;
};

export type CoveragePublicEligibleShip = {
  id: string;
  imo: string | null;
  mmsi: string | null;
};

export type RegistryCoverageReport = {
  registryCoverage: {
    totalAcceptEntries: number;
    acceptEntriesByOperatorGroup: Record<string, number>;
    acceptEntriesByOperator: Record<string, number>;
    activeEntries: number;
    retiredEntries: number;
    oceanCruiseEntries: number;
    expeditionCruiseEntries: number;
  };
  aisCandidateCoverage: {
    totalCandidateVesselsSeen: number;
    candidatesWithImo: number;
    candidatesMatchedToAcceptedRegistryEntries: number;
    candidatesMatchedToExcludedRegistryEntries: number;
    unmatchedCandidates: number;
    publicEligibleCandidatePercentage: number;
  };
  operatorCoverage: {
    operatorsInManifest: number;
    rows: Array<{
      operatorGroup: string;
      operator: string;
      manifestStatus: RegistryExpansionStatus;
      effectiveRegistryStatus: EffectiveRegistryStatus;
      importedAcceptedShips: number;
      proposedAcceptedShips: number;
      matchedAisShips: number;
      verifiedPublicShips: number;
    }>;
    operatorsWithZeroRegistryEntries: string[];
    operatorsWithRegistryEntriesButNoAisMatchYet: string[];
  };
  publicDashboardReadiness: {
    verifiedVesselsCurrentlyEligible: number;
    verifiedVesselsWithRecentAisPositions: number;
    verifiedVesselsWithDailyEstimates: number;
    suitability: "internal development only" | "limited public beta" | "broad public reporting";
  };
};

export type RegistryCompletenessReport = {
  rows: Array<{
    operatorGroup: string;
    operator: string;
    manifestStatus: RegistryExpansionStatus;
    effectiveRegistryStatus: EffectiveRegistryStatus;
    importedAcceptedShips: number;
    proposedNotImportedShips: number;
    aisCandidateMatches: number;
    verifiedPublicEligibleShips: number;
    activeRegistryShipsNotYetSeenInAis: number;
    candidateNameOrOperatorReviewSignals: number;
    expectedFleetCount: number | null;
    registryCoverageConfidence: RegistryCoverageConfidence;
    confidenceReason: string;
  }>;
};

export type VerifiedAisAllowlistReport = {
  totalVerifiedRegistryAcceptEntries: number;
  linkedRegistryEntries: number;
  linkedEntriesWithMmsi: number;
  linkedEntriesMissingMmsi: number;
  distinctMmsisReadyForTracking: number;
  providerMmsiFilterLimit: number;
  providerSubscriptionBatchesRequired: number;
  duplicateOrConflictingMmsis: Array<{ mmsi: string; imos: string[] }>;
  mappings: Array<{ mmsi: string; imo: string; shipId: string }>;
  shipsMissingMmsi: Array<{ imo: string; shipId: string }>;
};

type CsvRow = Record<string, string>;

export function parseRegistryExpansionManifest(content: string) {
  const rows = parseCsv(content);
  const entries: RegistryExpansionManifestEntry[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();

  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    const entry = normalizeManifestRow(row);
    const key = `${entry.operatorGroup.toLowerCase()}::${entry.operator.toLowerCase()}`;
    if (!entry.operatorGroup) errors.push(`Row ${rowNumber}: operator_group is required.`);
    if (!entry.operator) errors.push(`Row ${rowNumber}: operator is required.`);
    if (!Number.isInteger(entry.priority) || entry.priority <= 0) errors.push(`Row ${rowNumber}: priority must be a positive integer.`);
    if (!REGISTRY_EXPANSION_SCOPES.includes(entry.expectedScope)) errors.push(`Row ${rowNumber}: expected_scope must be OCEAN_CRUISE, EXPEDITION_CRUISE, or REVIEW_REQUIRED.`);
    if (!REGISTRY_EXPANSION_STATUSES.includes(entry.registryStatus)) errors.push(`Row ${rowNumber}: registry_status is invalid.`);
    if (seen.has(key)) errors.push(`Row ${rowNumber}: duplicate manifest operator ${entry.operator}.`);
    seen.add(key);
    entries.push(entry);
  });

  return { rowsRead: rows.length, entries, errors };
}

export function buildRegistryCoverageReport(input: {
  manifestEntries: RegistryExpansionManifestEntry[];
  registryEntries: CoverageRegistryEntry[];
  proposedRegistryEntries?: CoverageRegistryEntry[];
  candidateShips: CoverageCandidateShip[];
  publicEligibleShips?: CoveragePublicEligibleShip[];
  publicEligibleShipIds?: Iterable<string>;
  recentAisShipIds: Iterable<string>;
  dailyEstimateShipIds: Iterable<string>;
}): RegistryCoverageReport {
  const acceptEntries = input.registryEntries.filter((entry) => entry.registryDecision === "ACCEPT");
  const excludedEntries = input.registryEntries.filter((entry) => entry.registryDecision === "EXCLUDE");
  const proposedAcceptEntries = (input.proposedRegistryEntries ?? []).filter((entry) => entry.registryDecision === "ACCEPT");
  const acceptedByImo = new Map(acceptEntries.map((entry) => [entry.imo, entry]));
  const excludedByImo = new Map(excludedEntries.map((entry) => [entry.imo, entry]));
  const publicEligibleShips = input.publicEligibleShips ?? [...(input.publicEligibleShipIds ?? [])].map((id) => ({ id, imo: null, mmsi: null }));
  const publicEligible = new Set(publicEligibleShips.map((ship) => ship.id));
  const recentAis = new Set(input.recentAisShipIds);
  const dailyEstimates = new Set(input.dailyEstimateShipIds);
  const acceptedMatchedOperators = new Map<string, Set<string>>();
  const verifiedPublicByOperator = new Map<string, Set<string>>();

  let candidatesMatchedToAcceptedRegistryEntries = 0;
  let candidatesMatchedToExcludedRegistryEntries = 0;
  let unmatchedCandidates = 0;

  for (const ship of input.candidateShips) {
    if (ship.imo && acceptedByImo.has(ship.imo)) {
      candidatesMatchedToAcceptedRegistryEntries += 1;
      const operator = acceptedByImo.get(ship.imo)?.operator ?? "Unknown";
      if (!acceptedMatchedOperators.has(operator)) acceptedMatchedOperators.set(operator, new Set());
      acceptedMatchedOperators.get(operator)?.add(ship.id);
    } else if (ship.imo && excludedByImo.has(ship.imo)) {
      candidatesMatchedToExcludedRegistryEntries += 1;
    } else {
      unmatchedCandidates += 1;
    }
  }

  for (const ship of publicEligibleShips) {
    const operator = ship.imo ? acceptedByImo.get(ship.imo)?.operator : null;
    if (!operator) continue;
    if (!verifiedPublicByOperator.has(operator)) verifiedPublicByOperator.set(operator, new Set());
    verifiedPublicByOperator.get(operator)?.add(ship.id);
  }

  const rows = input.manifestEntries.map((entry) => {
    const importedAcceptedShips = acceptEntries.filter((registryEntry) => registryEntry.operator === entry.operator).length;
    const importedImos = new Set(acceptEntries.map((registryEntry) => registryEntry.imo));
    const proposedAcceptedShips = proposedAcceptEntries.filter((registryEntry) => registryEntry.operator === entry.operator && !importedImos.has(registryEntry.imo)).length;
    const matchedAisShips = acceptedMatchedOperators.get(entry.operator)?.size ?? 0;
    const verifiedPublicShips = verifiedPublicByOperator.get(entry.operator)?.size ?? 0;
    return {
      operatorGroup: entry.operatorGroup,
      operator: entry.operator,
      manifestStatus: entry.registryStatus,
      effectiveRegistryStatus: getEffectiveRegistryStatus(entry.registryStatus, importedAcceptedShips, proposedAcceptedShips),
      importedAcceptedShips,
      proposedAcceptedShips,
      matchedAisShips,
      verifiedPublicShips
    };
  });
  const verifiedWithRecentAis = [...publicEligible].filter((shipId) => recentAis.has(shipId)).length;
  const verifiedWithDailyEstimates = [...publicEligible].filter((shipId) => dailyEstimates.has(shipId)).length;

  return {
    registryCoverage: {
      totalAcceptEntries: acceptEntries.length,
      acceptEntriesByOperatorGroup: countBy(acceptEntries, (entry) => entry.operatorGroup ?? "Unknown"),
      acceptEntriesByOperator: countBy(acceptEntries, (entry) => entry.operator),
      activeEntries: acceptEntries.filter((entry) => entry.activeStatus === "ACTIVE").length,
      retiredEntries: acceptEntries.filter((entry) => entry.activeStatus === "RETIRED").length,
      oceanCruiseEntries: acceptEntries.filter((entry) => entry.vesselSegment === "OCEAN_CRUISE").length,
      expeditionCruiseEntries: acceptEntries.filter((entry) => entry.vesselSegment === "EXPEDITION_CRUISE").length
    },
    aisCandidateCoverage: {
      totalCandidateVesselsSeen: input.candidateShips.length,
      candidatesWithImo: input.candidateShips.filter((ship) => Boolean(ship.imo)).length,
      candidatesMatchedToAcceptedRegistryEntries,
      candidatesMatchedToExcludedRegistryEntries,
      unmatchedCandidates,
      publicEligibleCandidatePercentage: input.candidateShips.length ? roundPercentage((publicEligible.size / input.candidateShips.length) * 100) : 0
    },
    operatorCoverage: {
      operatorsInManifest: input.manifestEntries.length,
      rows,
      operatorsWithZeroRegistryEntries: rows.filter((row) => row.importedAcceptedShips === 0 && row.proposedAcceptedShips === 0).map((row) => row.operator),
      operatorsWithRegistryEntriesButNoAisMatchYet: rows.filter((row) => row.importedAcceptedShips > 0 && row.matchedAisShips === 0).map((row) => row.operator)
    },
    publicDashboardReadiness: {
      verifiedVesselsCurrentlyEligible: publicEligible.size,
      verifiedVesselsWithRecentAisPositions: verifiedWithRecentAis,
      verifiedVesselsWithDailyEstimates: verifiedWithDailyEstimates,
      suitability: getReadinessLabel(publicEligible.size, verifiedWithRecentAis, verifiedWithDailyEstimates)
    }
  };
}

export function buildRegistryCompletenessReport(input: {
  manifestEntries: RegistryExpansionManifestEntry[];
  registryEntries: CoverageRegistryEntry[];
  proposedRegistryEntries: CoverageRegistryEntry[];
  candidateShips: CoverageCandidateShip[];
  publicEligibleShips: CoveragePublicEligibleShip[];
}): RegistryCompletenessReport {
  const importedAcceptEntries = input.registryEntries.filter((entry) => entry.registryDecision === "ACCEPT");
  const importedAcceptedByImo = new Map(importedAcceptEntries.map((entry) => [entry.imo, entry]));
  const proposedAcceptEntries = input.proposedRegistryEntries.filter((entry) => entry.registryDecision === "ACCEPT");
  const proposedAcceptedByOperator = groupBy(proposedAcceptEntries.filter((entry) => !importedAcceptedByImo.has(entry.imo)), (entry) => entry.operator);
  const importedAcceptedByOperator = groupBy(importedAcceptEntries, (entry) => entry.operator);
  const candidateByImo = new Map(input.candidateShips.filter((ship) => ship.imo).map((ship) => [ship.imo as string, ship]));
  const publicEligibleByImo = new Map(input.publicEligibleShips.filter((ship) => ship.imo).map((ship) => [ship.imo as string, ship]));

  return {
    rows: input.manifestEntries.map((entry) => {
      const imported = importedAcceptedByOperator.get(entry.operator) ?? [];
      const proposed = proposedAcceptedByOperator.get(entry.operator) ?? [];
      const allKnownActive = [...imported, ...proposed].filter((registryEntry) => registryEntry.activeStatus === "ACTIVE");
      const aisMatches = allKnownActive.filter((registryEntry) => candidateByImo.has(registryEntry.imo)).length;
      const verifiedPublicEligibleShips = imported.filter((registryEntry) => publicEligibleByImo.has(registryEntry.imo)).length;
      const reviewSignals = countNameOrOperatorReviewSignals(input.candidateShips, entry.operator, importedAcceptedByImo);
      const confidence = getCompletenessConfidence(entry, imported.length, proposed.length);
      return {
        operatorGroup: entry.operatorGroup,
        operator: entry.operator,
        manifestStatus: entry.registryStatus,
        effectiveRegistryStatus: getEffectiveRegistryStatus(entry.registryStatus, imported.length, proposed.length),
        importedAcceptedShips: imported.length,
        proposedNotImportedShips: proposed.length,
        aisCandidateMatches: aisMatches,
        verifiedPublicEligibleShips,
        activeRegistryShipsNotYetSeenInAis: allKnownActive.length - aisMatches,
        candidateNameOrOperatorReviewSignals: reviewSignals,
        expectedFleetCount: extractExpectedFleetCount(entry.notes),
        registryCoverageConfidence: confidence.confidence,
        confidenceReason: confidence.reason
      };
    })
  };
}

export function buildVerifiedAisAllowlistReport(input: {
  registryEntries: CoverageRegistryEntry[];
  publicEligibleShips: CoveragePublicEligibleShip[];
  mmsiFilterLimit?: number;
}): VerifiedAisAllowlistReport {
  const acceptEntries = input.registryEntries.filter((entry) => entry.registryDecision === "ACCEPT");
  const publicEligibleByImo = new Map(input.publicEligibleShips.filter((ship) => ship.imo).map((ship) => [ship.imo as string, ship]));
  const linked = acceptEntries
    .map((entry) => ({ entry, ship: publicEligibleByImo.get(entry.imo) ?? null }))
    .filter((row) => row.ship);
  const mappings = linked
    .filter((row): row is { entry: CoverageRegistryEntry; ship: CoveragePublicEligibleShip } => Boolean(row.ship?.mmsi))
    .map((row) => ({ imo: row.entry.imo, mmsi: row.ship.mmsi as string, shipId: row.ship.id }));
  const shipsMissingMmsi = linked
    .filter((row): row is { entry: CoverageRegistryEntry; ship: CoveragePublicEligibleShip } => Boolean(row.ship && !row.ship.mmsi))
    .map((row) => ({ imo: row.entry.imo, shipId: row.ship.id }));
  const byMmsi = groupBy(mappings, (row) => row.mmsi);
  const duplicateOrConflictingMmsis = [...byMmsi.entries()]
    .map(([mmsi, rows]) => ({ mmsi, imos: [...new Set(rows.map((row) => row.imo))] }))
    .filter((row) => row.imos.length > 1);
  const distinctMmsisReadyForTracking = new Set(mappings.map((row) => row.mmsi)).size;
  const providerMmsiFilterLimit = input.mmsiFilterLimit ?? AISSTREAM_MMSI_FILTER_LIMIT;

  return {
    totalVerifiedRegistryAcceptEntries: acceptEntries.length,
    linkedRegistryEntries: linked.length,
    linkedEntriesWithMmsi: mappings.length,
    linkedEntriesMissingMmsi: shipsMissingMmsi.length,
    distinctMmsisReadyForTracking,
    providerMmsiFilterLimit,
    providerSubscriptionBatchesRequired: distinctMmsisReadyForTracking ? Math.ceil(distinctMmsisReadyForTracking / providerMmsiFilterLimit) : 0,
    duplicateOrConflictingMmsis,
    mappings,
    shipsMissingMmsi
  };
}

export function getVerifiedAisSubscriptionMmsis(report: VerifiedAisAllowlistReport): string[] {
  const conflicting = new Set(report.duplicateOrConflictingMmsis.map((row) => row.mmsi));
  return [
    ...new Set(
      report.mappings
        .map((row) => row.mmsi)
        .filter((mmsi) => isValidMmsi(mmsi) && !conflicting.has(mmsi))
    )
  ].sort();
}

export function splitMmsiBatches(mmsis: string[], limit = AISSTREAM_MMSI_FILTER_LIMIT): string[][] {
  if (!Number.isInteger(limit) || limit <= 0) throw new Error("MMSI batch limit must be a positive integer.");
  const batches: string[][] = [];
  for (let index = 0; index < mmsis.length; index += limit) {
    batches.push(mmsis.slice(index, index + limit));
  }
  return batches;
}

export function getEffectiveRegistryStatus(
  manifestStatus: RegistryExpansionStatus,
  importedAcceptedShips: number,
  proposedAcceptedShips: number
): EffectiveRegistryStatus {
  if (manifestStatus === "NEEDS_MANUAL_SCOPE_DECISION") return "NEEDS_MANUAL_SCOPE_DECISION";
  if (importedAcceptedShips > 0) return "IMPORTED";
  if (proposedAcceptedShips > 0) return "PROPOSED";
  return manifestStatus;
}

function getReadinessLabel(publicEligible: number, recentAis: number, dailyEstimates: number): RegistryCoverageReport["publicDashboardReadiness"]["suitability"] {
  if (publicEligible < 25 || recentAis === 0) return "internal development only";
  if (publicEligible < 200 || dailyEstimates === 0) return "limited public beta";
  return "broad public reporting";
}

function getCompletenessConfidence(
  entry: RegistryExpansionManifestEntry,
  importedAcceptedShips: number,
  proposedAcceptedShips: number
): { confidence: RegistryCoverageConfidence; reason: string } {
  const expectedFleetCount = extractExpectedFleetCount(entry.notes);
  const knownShips = importedAcceptedShips + proposedAcceptedShips;
  if (expectedFleetCount === null) {
    return {
      confidence: "UNKNOWN",
      reason: "No explicit expected fleet count is recorded in the manifest; completeness cannot be claimed."
    };
  }
  if (knownShips >= expectedFleetCount) {
    return {
      confidence: "COMPLETE",
      reason: `Known registry ships (${knownShips}) meet or exceed manifest expected fleet count (${expectedFleetCount}).`
    };
  }
  return {
    confidence: "PARTIAL",
    reason: `Known registry ships (${knownShips}) are below manifest expected fleet count (${expectedFleetCount}).`
  };
}

function extractExpectedFleetCount(notes: string | null) {
  const match = notes?.match(/expected(?: fleet)? count\s*[:=]\s*(\d+)/i);
  return match ? Number(match[1]) : null;
}

function countNameOrOperatorReviewSignals(
  candidateShips: CoverageCandidateShip[],
  operator: string,
  importedAcceptedByImo: Map<string, CoverageRegistryEntry>
) {
  const terms = operator
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((term) => term.length >= 4 && !["cruise", "cruises", "line"].includes(term));
  if (!terms.length) return 0;
  return candidateShips.filter((ship) => {
    if (ship.imo && importedAcceptedByImo.has(ship.imo)) return false;
    const text = `${ship.name ?? ""} ${ship.operator ?? ""}`.toLowerCase();
    return terms.some((term) => text.includes(term));
  }).length;
}

function groupBy<T>(items: T[], getKey: (item: T) => string) {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = getKey(item);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return groups;
}

function countBy<T>(items: T[], getKey: (item: T) => string) {
  return items.reduce<Record<string, number>>((counts, item) => {
    const key = getKey(item);
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}

function roundPercentage(value: number) {
  return Math.round(value * 10) / 10;
}

function isValidMmsi(value: string | null | undefined): value is string {
  return typeof value === "string" && /^\d{9}$/.test(value) && value !== "000000000";
}

function normalizeManifestRow(row: CsvRow): RegistryExpansionManifestEntry {
  const get = (...names: string[]) => {
    for (const name of names) {
      const key = Object.keys(row).find((candidate) => normalizeHeader(candidate) === normalizeHeader(name));
      if (key) return row[key].trim();
    }
    return "";
  };
  return {
    operatorGroup: get("operator_group"),
    operator: get("operator"),
    priority: Number(get("priority")),
    expectedScope: get("expected_scope") as RegistryExpansionScope,
    registryStatus: get("registry_status") as RegistryExpansionStatus,
    officialFleetSource: get("official_fleet_source") || null,
    imoIdentitySource: get("imo_identity_source") || null,
    notes: get("notes") || null
  };
}

function parseCsv(content: string): CsvRow[] {
  const lines = content.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) return [];
  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    const row: CsvRow = {};
    headers.forEach((header, index) => {
      row[header] = values[index] ?? "";
    });
    return row;
  });
}

function parseCsvLine(line: string) {
  const values: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      values.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  values.push(current);
  return values.map((value) => value.trim());
}

function normalizeHeader(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}
