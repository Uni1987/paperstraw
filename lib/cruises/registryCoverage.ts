import type { CruiseActiveStatus, CruiseRegistryDecision, CruiseVesselSegment } from "@/lib/cruises/registry";

export const REGISTRY_EXPANSION_STATUSES = ["NOT_STARTED", "RESEARCHING", "READY_FOR_REVIEW", "IMPORTED", "NEEDS_MANUAL_SCOPE_DECISION"] as const;
export const REGISTRY_EXPANSION_SCOPES = ["OCEAN_CRUISE", "EXPEDITION_CRUISE", "REVIEW_REQUIRED"] as const;

export type RegistryExpansionStatus = (typeof REGISTRY_EXPANSION_STATUSES)[number];
export type RegistryExpansionScope = (typeof REGISTRY_EXPANSION_SCOPES)[number];

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
      registryStatus: RegistryExpansionStatus;
      acceptedShips: number;
      matchedAisShips: number;
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
  candidateShips: CoverageCandidateShip[];
  publicEligibleShipIds: Iterable<string>;
  recentAisShipIds: Iterable<string>;
  dailyEstimateShipIds: Iterable<string>;
}): RegistryCoverageReport {
  const acceptEntries = input.registryEntries.filter((entry) => entry.registryDecision === "ACCEPT");
  const excludedEntries = input.registryEntries.filter((entry) => entry.registryDecision === "EXCLUDE");
  const acceptedByImo = new Map(acceptEntries.map((entry) => [entry.imo, entry]));
  const excludedByImo = new Map(excludedEntries.map((entry) => [entry.imo, entry]));
  const publicEligible = new Set(input.publicEligibleShipIds);
  const recentAis = new Set(input.recentAisShipIds);
  const dailyEstimates = new Set(input.dailyEstimateShipIds);
  const acceptedMatchedShipIds = new Set<string>();
  const acceptedMatchedOperators = new Map<string, Set<string>>();

  let candidatesMatchedToAcceptedRegistryEntries = 0;
  let candidatesMatchedToExcludedRegistryEntries = 0;
  let unmatchedCandidates = 0;

  for (const ship of input.candidateShips) {
    if (ship.imo && acceptedByImo.has(ship.imo)) {
      candidatesMatchedToAcceptedRegistryEntries += 1;
      acceptedMatchedShipIds.add(ship.id);
      const operator = acceptedByImo.get(ship.imo)?.operator ?? "Unknown";
      if (!acceptedMatchedOperators.has(operator)) acceptedMatchedOperators.set(operator, new Set());
      acceptedMatchedOperators.get(operator)?.add(ship.id);
    } else if (ship.imo && excludedByImo.has(ship.imo)) {
      candidatesMatchedToExcludedRegistryEntries += 1;
    } else {
      unmatchedCandidates += 1;
    }
  }

  const rows = input.manifestEntries.map((entry) => {
    const acceptedShips = acceptEntries.filter((registryEntry) => registryEntry.operator === entry.operator).length;
    const matchedAisShips = acceptedMatchedOperators.get(entry.operator)?.size ?? 0;
    return {
      operatorGroup: entry.operatorGroup,
      operator: entry.operator,
      registryStatus: entry.registryStatus,
      acceptedShips,
      matchedAisShips
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
      operatorsWithZeroRegistryEntries: rows.filter((row) => row.acceptedShips === 0).map((row) => row.operator),
      operatorsWithRegistryEntriesButNoAisMatchYet: rows.filter((row) => row.acceptedShips > 0 && row.matchedAisShips === 0).map((row) => row.operator)
    },
    publicDashboardReadiness: {
      verifiedVesselsCurrentlyEligible: publicEligible.size,
      verifiedVesselsWithRecentAisPositions: verifiedWithRecentAis,
      verifiedVesselsWithDailyEstimates: verifiedWithDailyEstimates,
      suitability: getReadinessLabel(publicEligible.size, verifiedWithRecentAis, verifiedWithDailyEstimates)
    }
  };
}

function getReadinessLabel(publicEligible: number, recentAis: number, dailyEstimates: number): RegistryCoverageReport["publicDashboardReadiness"]["suitability"] {
  if (publicEligible < 25 || recentAis === 0) return "internal development only";
  if (publicEligible < 200 || dailyEstimates === 0) return "limited public beta";
  return "broad public reporting";
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
