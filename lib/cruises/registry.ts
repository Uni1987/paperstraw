import { readFileSync } from "node:fs";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

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

type CsvRow = Record<string, string>;

export function parseRegistryCsv(content: string) {
  const rows = parseCsv(content);
  const errors: string[] = [];
  const parsed: RegistryCsvRow[] = [];
  const byImo = new Map<string, RegistryCsvRow>();

  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    const normalized = normalizeRegistryRow(row);
    const rowErrors = validateRegistryRow(normalized, rowNumber);
    if (rowErrors.length) {
      errors.push(...rowErrors);
      return;
    }

    const parsedRow = normalized as RegistryCsvRow;
    const existing = byImo.get(parsedRow.imo);
    if (existing && existing.registryDecision !== parsedRow.registryDecision) {
      errors.push(`Row ${rowNumber}: duplicate IMO ${parsedRow.imo} has conflicting decisions ${existing.registryDecision} and ${parsedRow.registryDecision}.`);
      return;
    }
    if (!existing) {
      byImo.set(parsedRow.imo, parsedRow);
      parsed.push(parsedRow);
    }
  });

  return { rowsRead: rows.length, rows: parsed, errors };
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

function stringifyDecimal(value: unknown) {
  if (value === null || value === undefined) return null;
  return String(value);
}
