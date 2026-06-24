import { z } from "zod";
import { DataSourceProviders } from "./providerConstants";
import type { NormalizedFlightRecord } from "./types";

const requiredHeaders = [
  "aircraft registration",
  "icao hex",
  "aircraft type",
  "origin",
  "destination",
  "departure date/time",
  "arrival date/time",
  "distance_km",
  "optional verified public entity"
];

const rowSchema = z.object({
  "aircraft registration": z.string().optional(),
  "icao hex": z.string().min(1, "ICAO hex is required"),
  "aircraft type": z.string().min(1, "aircraft type is required"),
  origin: z.string().min(1, "origin is required"),
  destination: z.string().min(1, "destination is required"),
  "departure date/time": z.string().min(1, "departure date/time is required"),
  "arrival date/time": z.string().optional(),
  distance_km: z.string().min(1, "distance_km is required"),
  "optional verified public entity": z.string().optional()
});

export type CsvParseResult = {
  records: NormalizedFlightRecord[];
  errors: string[];
};

export function parseFlightCsv(csv: string): CsvParseResult {
  const rows = parseCsvRows(csv).filter((row) => row.some((cell) => cell.trim()));
  const errors: string[] = [];

  if (rows.length < 2) {
    return { records: [], errors: ["CSV must include a header row and at least one data row"] };
  }

  const headers = rows[0].map(normalizeHeader);
  const missing = requiredHeaders.filter((header) => !headers.includes(header));
  if (missing.length) {
    return { records: [], errors: [`Missing required column(s): ${missing.join(", ")}`] };
  }

  const records: NormalizedFlightRecord[] = [];
  rows.slice(1).forEach((cells, index) => {
    const row: Record<string, string> = {};
    headers.forEach((header, cellIndex) => {
      row[header] = cells[cellIndex]?.trim() ?? "";
    });

    const parsed = rowSchema.safeParse(row);
    if (!parsed.success) {
      errors.push(`Row ${index + 2}: ${parsed.error.issues.map((issue) => issue.message).join("; ")}`);
      return;
    }

    const departureAt = new Date(parsed.data["departure date/time"]);
    const arrivalValue = parsed.data["arrival date/time"]?.trim();
    const arrivalAt = arrivalValue ? new Date(arrivalValue) : null;
    const distanceKm = Number(parsed.data.distance_km);

    if (Number.isNaN(departureAt.getTime())) {
      errors.push(`Row ${index + 2}: departure date/time is invalid`);
      return;
    }
    if (arrivalAt && Number.isNaN(arrivalAt.getTime())) {
      errors.push(`Row ${index + 2}: arrival date/time is invalid`);
      return;
    }
    if (!Number.isFinite(distanceKm) || distanceKm <= 0) {
      errors.push(`Row ${index + 2}: distance_km must be a positive number`);
      return;
    }

    records.push({
      icaoHex: parsed.data["icao hex"],
      registration: parsed.data["aircraft registration"] || null,
      aircraftType: parsed.data["aircraft type"],
      verifiedPublicEntity: parsed.data["optional verified public entity"] || null,
      originAirport: parsed.data.origin,
      destinationAirport: parsed.data.destination,
      departureAt,
      arrivalAt,
      distanceKm,
      dataSource: DataSourceProviders.CSV_UPLOAD,
      sourceAttribution: "Manual CSV upload"
    });
  });

  return { records, errors };
}

function normalizeHeader(header: string) {
  return header.trim().toLowerCase();
}

function parseCsvRows(csv: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < csv.length; i += 1) {
    const char = csv[i];
    const next = csv[i + 1];

    if (char === '"' && inQuotes && next === '"') {
      cell += '"';
      i += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  row.push(cell);
  rows.push(row);
  return rows;
}
