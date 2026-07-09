import { readFileSync } from "node:fs";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/database/cruises";

export const CRUISE_REGISTRY_DECISIONS = ["ACCEPT", "EXCLUDE"] as const;
export const CRUISE_VESSEL_SEGMENTS = ["OCEAN_CRUISE", "EXPEDITION_CRUISE"] as const;
export const CRUISE_ACTIVE_STATUSES = ["ACTIVE", "RETIRED", "UNKNOWN"] as const;

export type CruiseRegistryDecision = (typeof CRUISE_REGISTRY_DECISIONS)[number];
export type CruiseVesselSegment = (typeof CRUISE_VESSEL_SEGMENTS)[number];
export type CruiseActiveStatus = (typeof CRUISE_ACTIVE_STATUSES)[number];

export type RegistryCsvRow = {
  imo: string;
  canonicalName: string;
  operator: string;
  operatorGroup: string | null;
  vesselSegment: CruiseVesselSegment;
  registryDecision: CruiseRegistryDecision;
  activeStatus: CruiseActiveStatus;
  sourceName: string;
  sourceUrl: string;
  sourceCheckedAt: Date;
  notes: string | null;
  evidence: Prisma.JsonObject;
};

export type RegistryImportResult = {
  rowsRead: number;
  validRows: number;
  upserted: number;
  dryRun: boolean;
  errors: string[];
};

export type RegistryValidationReport = {
  rowsRead: number;
  validRowCount: number;
  totalAcceptRows: number;
  totalExcludeRows: number;
  duplicateImoConflicts: number;
  missingSourceUrls: number;
  missingSourceCheckedDates: number;
  invalidImoRows: number;
  missingCanonicalNameRows: number;
  missingOperatorRows: number;
  missingOrInvalidVesselSegmentRows: number;
  activeStatusCounts: Record<CruiseActiveStatus, number>;
  invalidActiveStatusRows: number;
  validRows: RegistryCsvRow[];
  errors: string[];
};

export type OperatorRegistryValidationReport = {
  operator: string;
  operatorGroup: string | null;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  duplicateImoConflicts: number;
  missingOfficialSourceRows: number;
  missingImoIdentityEvidenceRows: number;
  genericSourceUrlWarnings: string[];
  missingCheckedDates: number;
  missingActiveStatusRows: number;
  invalidVesselSegmentRows: number;
  operatorOrGroupMismatchRows: number;
  errors: string[];
};

export type RegistryEntryForReconciliation = {
  id: string;
  imo: string;
  registryDecision: CruiseRegistryDecision;
  sourceName: string;
};

export type CandidateForReconciliation = {
  id: string;
  imo: string | null;
  mmsi: string | null;
  name: string;
  shipType: string | null;
  grossTonnage?: unknown;
  length?: unknown;
  width?: unknown;
  hasMrvRecord?: boolean;
};

export type ReconciliationDecision = {
  verificationStatus: "VERIFIED_OCEAN_CRUISE" | "REVIEW_REQUIRED" | "EXCLUDED_NON_CRUISE" | "UNASSESSED";
  confidence: "HIGH" | "MEDIUM" | "LOW";
  registryEntryId: string | null;
  decisionSource: string;
  evidence: Prisma.JsonObject;
};

export type CruiseRegistryStatusSummary = {
  registryEntries: number;
  verifiedCandidateMatches: number;
  acceptedRegistryEntriesNotSeenInAis: number;
  currentPublicEligibleVessels: number;
  candidateShipsAwaitingReview: number;
};

type CsvRow = Record<string, string>;

export function parseRegistryCsv(content: string) {
  const report = buildRegistryValidationReport(content);
  return { rowsRead: report.rowsRead, rows: report.validRows, errors: report.errors };
}

export function buildRegistryValidationReport(content: string): RegistryValidationReport {
  const rows = parseCsv(content);
  const report: RegistryValidationReport = {
    rowsRead: rows.length,
    validRowCount: 0,
    totalAcceptRows: 0,
    totalExcludeRows: 0,
    duplicateImoConflicts: 0,
    missingSourceUrls: 0,
    missingSourceCheckedDates: 0,
    invalidImoRows: 0,
    missingCanonicalNameRows: 0,
    missingOperatorRows: 0,
    missingOrInvalidVesselSegmentRows: 0,
    activeStatusCounts: { ACTIVE: 0, RETIRED: 0, UNKNOWN: 0 },
    invalidActiveStatusRows: 0,
    validRows: [],
    errors: []
  };
  const byImo = new Map<string, RegistryCsvRow>();

  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    const normalized = normalizeRegistryRow(row);
    if (normalized.registryDecision === "ACCEPT") report.totalAcceptRows += 1;
    if (normalized.registryDecision === "EXCLUDE") report.totalExcludeRows += 1;
    if (!normalized.sourceUrl) report.missingSourceUrls += 1;
    if (!normalized.sourceCheckedAt || Number.isNaN(normalized.sourceCheckedAt.getTime())) report.missingSourceCheckedDates += 1;
    if (!normalized.imo || !isValidImoWithChecksum(normalized.imo)) report.invalidImoRows += 1;
    if (!normalized.canonicalName) report.missingCanonicalNameRows += 1;
    if (!normalized.operator) report.missingOperatorRows += 1;
    if (!CRUISE_VESSEL_SEGMENTS.includes(normalized.vesselSegment as CruiseVesselSegment)) report.missingOrInvalidVesselSegmentRows += 1;
    if (CRUISE_ACTIVE_STATUSES.includes(normalized.activeStatus as CruiseActiveStatus)) {
      report.activeStatusCounts[normalized.activeStatus as CruiseActiveStatus] += 1;
    } else {
      report.invalidActiveStatusRows += 1;
    }

    const rowErrors = validateRegistryRow(normalized, rowNumber);
    if (rowErrors.length) {
      report.errors.push(...rowErrors);
      return;
    }

    const parsedRow = normalized as RegistryCsvRow;
    const existing = byImo.get(parsedRow.imo);
    if (existing && existing.registryDecision !== parsedRow.registryDecision) {
      report.duplicateImoConflicts += 1;
      report.errors.push(`Row ${rowNumber}: duplicate IMO ${parsedRow.imo} has conflicting decisions ${existing.registryDecision} and ${parsedRow.registryDecision}.`);
      return;
    }
    if (!existing) {
      byImo.set(parsedRow.imo, parsedRow);
      report.validRows.push(parsedRow);
    }
  });

  report.validRowCount = report.validRows.length;
  return report;
}

export function buildOperatorRegistryValidationReport(content: string, options: { operator: string; operatorGroup?: string | null }): OperatorRegistryValidationReport {
  const rows = parseCsv(content);
  const report: OperatorRegistryValidationReport = {
    operator: options.operator,
    operatorGroup: options.operatorGroup ?? null,
    totalRows: 0,
    validRows: 0,
    invalidRows: 0,
    duplicateImoConflicts: 0,
    missingOfficialSourceRows: 0,
    missingImoIdentityEvidenceRows: 0,
    genericSourceUrlWarnings: [],
    missingCheckedDates: 0,
    missingActiveStatusRows: 0,
    invalidVesselSegmentRows: 0,
    operatorOrGroupMismatchRows: 0,
    errors: []
  };
  const selectedRows = rows
    .map((row, index) => ({ row, rowNumber: index + 2, normalized: normalizeRegistryRow(row) }))
    .filter(({ normalized }) => normalized.operator === options.operator);
  const byImo = new Map<string, RegistryCsvRow>();

  for (const { rowNumber, normalized } of selectedRows) {
    report.totalRows += 1;
    if (normalized.operator !== options.operator || (options.operatorGroup && normalized.operatorGroup !== options.operatorGroup)) {
      report.operatorOrGroupMismatchRows += 1;
    }
    if (!normalized.sourceName || !normalized.sourceUrl || !containsEvidence(normalized.notes, "official")) report.missingOfficialSourceRows += 1;
    if (!containsImoIdentityEvidence(normalized.notes)) report.missingImoIdentityEvidenceRows += 1;
    if (looksGenericSourceUrl(normalized.sourceUrl ?? "")) report.genericSourceUrlWarnings.push(`Row ${rowNumber}: source_url may be too generic for operator batch evidence: ${normalized.sourceUrl}`);
    if (!normalized.sourceCheckedAt || Number.isNaN(normalized.sourceCheckedAt.getTime())) report.missingCheckedDates += 1;
    if (!normalized.activeStatus) report.missingActiveStatusRows += 1;
    if (!CRUISE_VESSEL_SEGMENTS.includes(normalized.vesselSegment as CruiseVesselSegment)) report.invalidVesselSegmentRows += 1;

    const rowErrors = validateRegistryRow(normalized, rowNumber);
    if (rowErrors.length) {
      report.invalidRows += 1;
      report.errors.push(...rowErrors);
      continue;
    }

    const parsedRow = normalized as RegistryCsvRow;
    const existing = byImo.get(parsedRow.imo);
    if (existing && existing.registryDecision !== parsedRow.registryDecision) {
      report.duplicateImoConflicts += 1;
      report.invalidRows += 1;
      report.errors.push(`Row ${rowNumber}: duplicate IMO ${parsedRow.imo} has conflicting decisions ${existing.registryDecision} and ${parsedRow.registryDecision}.`);
      continue;
    }
    if (!existing) {
      byImo.set(parsedRow.imo, parsedRow);
      report.validRows += 1;
    }
  }

  return report;
}

export function buildRegistryStatusSummary(input: CruiseRegistryStatusSummary): CruiseRegistryStatusSummary {
  return {
    registryEntries: input.registryEntries,
    verifiedCandidateMatches: input.verifiedCandidateMatches,
    acceptedRegistryEntriesNotSeenInAis: input.acceptedRegistryEntriesNotSeenInAis,
    currentPublicEligibleVessels: input.currentPublicEligibleVessels,
    candidateShipsAwaitingReview: input.candidateShipsAwaitingReview
  };
}

export async function importRegistryCsv(filePath: string, { apply }: { apply: boolean }): Promise<RegistryImportResult> {
  const parsed = parseRegistryCsv(readFileSync(filePath, "utf8"));
  const result: RegistryImportResult = {
    rowsRead: parsed.rowsRead,
    validRows: parsed.rows.length,
    upserted: 0,
    dryRun: !apply,
    errors: [...parsed.errors]
  };
  if (result.errors.length || !apply) return result;

  const db = prisma as unknown as {
    cruiseVesselRegistryEntry: {
      upsert: (args: unknown) => Promise<unknown>;
    };
  };

  for (const row of parsed.rows) {
    await db.cruiseVesselRegistryEntry.upsert({
      where: { imo: row.imo },
      create: registryRowToPrismaData(row),
      update: registryRowToPrismaData(row)
    });
    result.upserted += 1;
  }

  return result;
}

export function reconcileCruiseCandidate(candidate: CandidateForReconciliation, registryEntry: RegistryEntryForReconciliation | null): ReconciliationDecision {
  const evidence: Prisma.JsonObject = {
    imo: candidate.imo,
    mmsi: candidate.mmsi,
    name: candidate.name,
    aisShipType: candidate.shipType,
    hasMrvRecord: Boolean(candidate.hasMrvRecord),
    dimensions: {
      grossTonnage: stringifyDecimal(candidate.grossTonnage),
      length: stringifyDecimal(candidate.length),
      width: stringifyDecimal(candidate.width)
    }
  };

  if (candidate.imo && registryEntry?.imo === candidate.imo && registryEntry.registryDecision === "ACCEPT") {
    return {
      verificationStatus: "VERIFIED_OCEAN_CRUISE",
      confidence: "HIGH",
      registryEntryId: registryEntry.id,
      decisionSource: "curated_registry_exact_imo_accept",
      evidence: {
        ...evidence,
        exactImoMatch: true,
        registryDecision: registryEntry.registryDecision,
        registrySourceName: registryEntry.sourceName
      }
    };
  }

  if (candidate.imo && registryEntry?.imo === candidate.imo && registryEntry.registryDecision === "EXCLUDE") {
    return {
      verificationStatus: "EXCLUDED_NON_CRUISE",
      confidence: "HIGH",
      registryEntryId: registryEntry.id,
      decisionSource: "curated_registry_exact_imo_exclude",
      evidence: {
        ...evidence,
        exactImoMatch: true,
        registryDecision: registryEntry.registryDecision,
        registrySourceName: registryEntry.sourceName
      }
    };
  }

  return {
    verificationStatus: "REVIEW_REQUIRED",
    confidence: candidate.imo ? "MEDIUM" : "LOW",
    registryEntryId: null,
    decisionSource: candidate.imo ? "no_curated_registry_imo_match" : "missing_imo_requires_manual_review",
    evidence: {
      ...evidence,
      exactImoMatch: false,
      reason: candidate.imo
        ? "Candidate has IMO but no exact curated registry decision."
        : "Missing IMO; name, AIS passenger type, MRV and dimensions cannot verify cruise scope."
    }
  };
}

export function isValidImoWithChecksum(value: string) {
  if (!/^\d{7}$/.test(value) || value === "0000000") return false;
  const digits = value.split("").map(Number);
  const checksum = digits.slice(0, 6).reduce((sum, digit, index) => sum + digit * (7 - index), 0) % 10;
  return checksum === digits[6];
}

export function needsCruiseReviewQueue(verificationStatus: string | null | undefined) {
  return !verificationStatus || verificationStatus === "REVIEW_REQUIRED" || verificationStatus === "UNASSESSED";
}

function registryRowToPrismaData(row: RegistryCsvRow) {
  return {
    imo: row.imo,
    canonicalName: row.canonicalName,
    operator: row.operator,
    operatorGroup: row.operatorGroup,
    vesselSegment: row.vesselSegment,
    registryDecision: row.registryDecision,
    activeStatus: row.activeStatus,
    sourceName: row.sourceName,
    sourceUrl: row.sourceUrl,
    sourceCheckedAt: row.sourceCheckedAt,
    notes: row.notes,
    evidence: row.evidence
  };
}

function normalizeRegistryRow(row: CsvRow): Partial<RegistryCsvRow> {
  const get = (...names: string[]) => {
    for (const name of names) {
      const key = Object.keys(row).find((candidate) => normalizeHeader(candidate) === normalizeHeader(name));
      if (key) return row[key].trim();
    }
    return "";
  };
  const sourceCheckedAt = get("source_checked_at");
  const imo = get("imo").replace(/[^\d]/g, "");
  return {
    imo,
    canonicalName: get("canonical_name"),
    operator: get("operator"),
    operatorGroup: get("operator_group") || null,
    vesselSegment: get("vessel_segment") as CruiseVesselSegment,
    registryDecision: get("registry_decision") as CruiseRegistryDecision,
    activeStatus: get("active_status") as CruiseActiveStatus,
    sourceName: get("source_name"),
    sourceUrl: get("source_url"),
    sourceCheckedAt: sourceCheckedAt ? new Date(`${sourceCheckedAt}T00:00:00.000Z`) : new Date("invalid"),
    notes: get("notes") || null,
    evidence: {
      sourceName: get("source_name"),
      sourceUrl: get("source_url"),
      sourceCheckedAt,
      notes: get("notes") || null
    }
  };
}

function validateRegistryRow(row: Partial<RegistryCsvRow>, rowNumber: number) {
  const errors: string[] = [];
  if (!row.imo || !isValidImoWithChecksum(row.imo)) errors.push(`Row ${rowNumber}: IMO must be seven digits with a valid checksum.`);
  if (!row.canonicalName) errors.push(`Row ${rowNumber}: canonical_name is required.`);
  if (!row.operator) errors.push(`Row ${rowNumber}: operator is required.`);
  if (!row.sourceName) errors.push(`Row ${rowNumber}: source_name is required.`);
  if (!row.sourceUrl) errors.push(`Row ${rowNumber}: source_url is required.`);
  if (!row.sourceCheckedAt || Number.isNaN(row.sourceCheckedAt.getTime())) errors.push(`Row ${rowNumber}: source_checked_at must be YYYY-MM-DD.`);
  if (!CRUISE_VESSEL_SEGMENTS.includes(row.vesselSegment as CruiseVesselSegment)) errors.push(`Row ${rowNumber}: vessel_segment must be OCEAN_CRUISE or EXPEDITION_CRUISE.`);
  if (!CRUISE_REGISTRY_DECISIONS.includes(row.registryDecision as CruiseRegistryDecision)) errors.push(`Row ${rowNumber}: registry_decision must be ACCEPT or EXCLUDE.`);
  if (!CRUISE_ACTIVE_STATUSES.includes(row.activeStatus as CruiseActiveStatus)) errors.push(`Row ${rowNumber}: active_status must be ACTIVE, RETIRED, or UNKNOWN.`);
  return errors;
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

function containsEvidence(value: string | null | undefined, needle: string) {
  return Boolean(value?.toLowerCase().includes(needle));
}

function containsImoIdentityEvidence(value: string | null | undefined) {
  const text = value?.toLowerCase() ?? "";
  return text.includes("imo identity source") || text.includes("imo source") || text.includes("vesselfinder") || text.includes("equasis") || text.includes("marinetraffic");
}

function looksGenericSourceUrl(value: string) {
  if (!value) return false;
  try {
    const url = new URL(value);
    const path = url.pathname.replace(/\/+$/, "");
    return path === "" || path === "/cruise-ships" || path === "/ships" || path === "/fleet";
  } catch {
    return false;
  }
}

function stringifyDecimal(value: unknown) {
  if (value === null || value === undefined) return null;
  return String(value);
}
