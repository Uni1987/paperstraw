import { readFileSync } from "node:fs";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { CRUISE_MRV_SOURCE, parseOptionalNumber } from "@/lib/cruises/config";

type CsvRow = Record<string, string>;

export type CruiseMrvImportResult = {
  rowsRead: number;
  shipsUpserted: number;
  annualRecordsUpserted: number;
  skippedRows: number;
  errors: string[];
};

export function parseMrvCsv(content: string) {
  const rows = parseCsv(content);
  return rows.map(normalizeMrvRow);
}

export async function importCruiseMrvCsv(filePath: string): Promise<CruiseMrvImportResult> {
  // MRV is emissions baseline evidence only. Passenger/MRV classification must not verify leisure
  // ocean-cruise scope without an exact curated registry IMO match.
  const content = readFileSync(filePath, "utf8");
  const rows = parseMrvCsv(content);
  const result: CruiseMrvImportResult = {
    rowsRead: rows.length,
    shipsUpserted: 0,
    annualRecordsUpserted: 0,
    skippedRows: 0,
    errors: []
  };

  for (const [index, row] of rows.entries()) {
    if (!row.imo || !row.reportingYear || !row.annualCo2Tonnes) {
      result.skippedRows += 1;
      result.errors.push(`Row ${index + 2}: missing IMO, reporting year, or annual CO2.`);
      continue;
    }

    const ship = await prisma.cruiseShip.upsert({
      where: { imo: row.imo },
      create: {
        imo: row.imo,
        mmsi: row.mmsi,
        name: row.name || `IMO ${row.imo}`,
        operator: row.operator,
        shipType: row.shipType,
        grossTonnage: row.grossTonnage,
        length: row.length,
        width: row.width,
        source: CRUISE_MRV_SOURCE
      },
      update: {
        mmsi: row.mmsi,
        name: row.name || undefined,
        operator: row.operator,
        shipType: row.shipType,
        grossTonnage: row.grossTonnage,
        length: row.length,
        width: row.width,
        source: CRUISE_MRV_SOURCE
      }
    });

    result.shipsUpserted += 1;

    await prisma.cruiseEmissionsAnnual.upsert({
      where: {
        shipId_reportingYear: {
          shipId: ship.id,
          reportingYear: row.reportingYear
        }
      },
      create: {
        shipId: ship.id,
        imo: row.imo,
        reportingYear: row.reportingYear,
        annualCo2Tonnes: row.annualCo2Tonnes,
        annualFuelTonnes: row.annualFuelTonnes,
        distanceNm: row.distanceNm,
        timeAtSeaHours: row.timeAtSeaHours,
        source: CRUISE_MRV_SOURCE,
        rawPayload: row.rawPayload
      },
      update: {
        imo: row.imo,
        annualCo2Tonnes: row.annualCo2Tonnes,
        annualFuelTonnes: row.annualFuelTonnes,
        distanceNm: row.distanceNm,
        timeAtSeaHours: row.timeAtSeaHours,
        source: CRUISE_MRV_SOURCE,
        rawPayload: row.rawPayload
      }
    });

    result.annualRecordsUpserted += 1;
  }

  return result;
}

function normalizeMrvRow(row: CsvRow) {
  const get = (...names: string[]) => {
    for (const name of names) {
      const key = Object.keys(row).find((candidate) => normalizeHeader(candidate) === normalizeHeader(name));
      if (key && row[key]?.trim()) return row[key].trim();
    }
    return "";
  };

  const reportingYear = parseOptionalNumber(get("reporting year", "year"));
  const rawPayload: Prisma.JsonObject = {};
  for (const [key, value] of Object.entries(row)) rawPayload[key] = value;

  return {
    imo: normalizeIdentifier(get("imo", "imo number")),
    mmsi: normalizeIdentifier(get("mmsi")),
    name: get("ship name", "vessel name", "name"),
    operator: get("company", "operator", "technical manager"),
    shipType: get("ship type", "vessel type"),
    grossTonnage: parseOptionalNumber(get("gross tonnage", "gt")),
    length: parseOptionalNumber(get("length", "loa")),
    width: parseOptionalNumber(get("width", "beam")),
    reportingYear: reportingYear ? Math.trunc(reportingYear) : null,
    annualCo2Tonnes: parseOptionalNumber(get("annual co2 tonnes", "total co2 emissions", "co2 emissions", "annual co2")),
    annualFuelTonnes: parseOptionalNumber(get("annual fuel tonnes", "total fuel consumption", "fuel consumption")),
    distanceNm: parseOptionalNumber(get("distance nm", "distance travelled", "distance")),
    timeAtSeaHours: parseOptionalNumber(get("time at sea hours", "hours underway", "time at sea")),
    rawPayload
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

function normalizeIdentifier(value: string) {
  return value.replace(/[^\d]/g, "") || null;
}

function normalizeHeader(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

