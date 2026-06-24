import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { loadProjectEnv, requireEnv } from "../lib/env/loadProjectEnv";

loadProjectEnv();

type TableName =
  | "Aircraft"
  | "EmissionFactor"
  | "Flight"
  | "ImportLog"
  | "IngestionCursor"
  | "ProcessedArchiveDate"
  | "AggregateRollup";

type JsonRow = Record<string, unknown>;

type MigrationOptions = {
  dryRun: boolean;
  batchSize: number;
  sqlitePath: string;
};

const TABLES: TableName[] = [
  "Aircraft",
  "EmissionFactor",
  "Flight",
  "ImportLog",
  "IngestionCursor",
  "ProcessedArchiveDate",
  "AggregateRollup"
];

const DEFAULT_BATCH_SIZE = 5000;
const DATE_FIELDS: Record<TableName, string[]> = {
  Aircraft: ["createdAt", "updatedAt"],
  EmissionFactor: ["createdAt", "updatedAt"],
  Flight: ["departureAt", "arrivalAt", "createdAt", "updatedAt"],
  ImportLog: ["timestamp", "runStartedAt", "runEndedAt"],
  IngestionCursor: ["lastImportedAt", "lastSuccessfulImportAt", "lastRunAt", "createdAt", "updatedAt"],
  ProcessedArchiveDate: ["processedAt", "updatedAt"],
  AggregateRollup: ["periodStart", "updatedAt"]
};

const DECIMAL_FIELDS: Record<TableName, string[]> = {
  Aircraft: [],
  EmissionFactor: ["kgCo2PerKm"],
  Flight: ["distanceKm", "estimatedCo2Kg"],
  ImportLog: [],
  IngestionCursor: [],
  ProcessedArchiveDate: [],
  AggregateRollup: ["distanceKm", "estimatedCo2Kg"]
};

const PYTHON_SQL = String.raw`
import json
import sqlite3
import sys

db_path, sql = sys.argv[1], sys.argv[2]
conn = sqlite3.connect(db_path)
conn.row_factory = sqlite3.Row
rows = conn.execute(sql).fetchall()
print(json.dumps([dict(row) for row in rows], default=str))
conn.close()
`;

const prisma = new PrismaClient();

async function main() {
  requireEnv("DATABASE_URL");
  const options = parseOptions(process.argv.slice(2));
  if (!existsSync(options.sqlitePath)) {
    throw new Error(`SQLite source database not found at ${options.sqlitePath}`);
  }

  console.log(`PaperStraw SQLite -> PostgreSQL migration`);
  console.log(`Source: ${options.sqlitePath}`);
  console.log(`Target: DATABASE_URL`);
  console.log(`Mode: ${options.dryRun ? "dry-run" : "write"}`);
  console.log(`Batch size: ${options.batchSize.toLocaleString()}`);

  const sourceCounts = await getSourceCounts(options.sqlitePath);
  console.log("\nSource row counts");
  printCounts(sourceCounts);

  const beforeCounts = await getTargetCounts();
  console.log("\nTarget row counts before migration");
  printCounts(beforeCounts);

  if (options.dryRun) {
    console.log("\nStarting verification scan");
    await printVerification(options.sqlitePath, sourceCounts, beforeCounts);
    console.log("\nDry-run complete. No rows were written.");
    return;
  }

  const aircraftIdMap = await migrateAircraft(options, sourceCounts.Aircraft);
  await migrateGeneric("EmissionFactor", options, sourceCounts.EmissionFactor);
  await migrateFlights(options, sourceCounts.Flight, aircraftIdMap);
  await migrateGeneric("ImportLog", options, sourceCounts.ImportLog);
  await migrateGeneric("IngestionCursor", options, sourceCounts.IngestionCursor);
  await migrateGeneric("ProcessedArchiveDate", options, sourceCounts.ProcessedArchiveDate);
  await migrateGeneric("AggregateRollup", options, sourceCounts.AggregateRollup);

  const afterCounts = await getTargetCounts();
  console.log("\nTarget row counts after migration");
  printCounts(afterCounts);
  await printVerification(options.sqlitePath, sourceCounts, afterCounts);
}

function parseOptions(args: string[]): MigrationOptions {
  return {
    dryRun: args.includes("--dry-run"),
    batchSize: parsePositiveInt(getFlagValue(args, "--batch-size"), DEFAULT_BATCH_SIZE),
    sqlitePath: resolve(getFlagValue(args, "--sqlite") ?? "prisma/dev.db")
  };
}

function getFlagValue(args: string[], flag: string) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

function parsePositiveInt(value: string | undefined, fallback: number) {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Expected a positive integer batch size, received ${value}`);
  }
  return parsed;
}

async function migrateAircraft(options: MigrationOptions, total: number) {
  console.log("\nMigrating Aircraft");
  const sourceToTargetId = new Map<string, string>();
  let processed = 0;

  for await (const batch of streamSqliteBatches(options.sqlitePath, "Aircraft", options.batchSize)) {
    const rows = normalizeRows("Aircraft", batch);
    const icaoHexes = rows.map((row) => String(row.icaoHex));
    const existing = await prisma.aircraft.findMany({
      where: {
        icaoHex: {
          in: icaoHexes
        }
      },
      select: {
        id: true,
        icaoHex: true
      }
    });
    const existingByHex = new Map(existing.map((aircraft) => [aircraft.icaoHex, aircraft.id]));
    const rowsToCreate = rows.filter((row) => !existingByHex.has(String(row.icaoHex)));

    if (rowsToCreate.length) {
      await prisma.aircraft.createMany({
        data: rowsToCreate as any[],
        skipDuplicates: true
      });
    }

    const resolved = await prisma.aircraft.findMany({
      where: {
        icaoHex: {
          in: icaoHexes
        }
      },
      select: {
        id: true,
        icaoHex: true
      }
    });
    const targetByHex = new Map(resolved.map((aircraft) => [aircraft.icaoHex, aircraft.id]));
    for (const row of rows) {
      const targetId = targetByHex.get(String(row.icaoHex));
      if (targetId) sourceToTargetId.set(String(row.id), targetId);
    }

    processed += rows.length;
    logProgress("Aircraft", processed, total);
  }

  return sourceToTargetId;
}

async function migrateFlights(options: MigrationOptions, total: number, aircraftIdMap: Map<string, string>) {
  console.log("\nMigrating Flight");
  let processed = 0;

  for await (const batch of streamSqliteBatches(options.sqlitePath, "Flight", options.batchSize)) {
    const rows = normalizeRows("Flight", batch).map((row) => ({
      ...row,
      aircraftId: aircraftIdMap.get(String(row.aircraftId)) ?? row.aircraftId
    }));

    await prisma.flight.createMany({
      data: rows as any[],
      skipDuplicates: true
    });

    processed += rows.length;
    logProgress("Flight", processed, total);
  }
}

async function migrateGeneric(table: Exclude<TableName, "Aircraft" | "Flight">, options: MigrationOptions, total: number) {
  console.log(`\nMigrating ${table}`);
  let processed = 0;

  for await (const batch of streamSqliteBatches(options.sqlitePath, table, options.batchSize)) {
    const rows = normalizeRows(table, batch);
    if (rows.length) {
      await getDelegate(table).createMany({
        data: rows as any[],
        skipDuplicates: true
      });
    }

    processed += rows.length;
    logProgress(table, processed, total);
  }
}

function getDelegate(table: Exclude<TableName, "Aircraft" | "Flight">) {
  const delegates = {
    EmissionFactor: prisma.emissionFactor,
    ImportLog: prisma.importLog,
    IngestionCursor: prisma.ingestionCursor,
    ProcessedArchiveDate: prisma.processedArchiveDate,
    AggregateRollup: prisma.aggregateRollup
  };
  return delegates[table] as any;
}

function normalizeRows(table: TableName, rows: JsonRow[]) {
  return rows.map((row) => {
    const normalized: JsonRow = { ...row };
    for (const field of DATE_FIELDS[table]) {
      normalized[field] = normalizeDateValue(normalized[field]);
    }
    for (const field of DECIMAL_FIELDS[table]) {
      if (normalized[field] !== null && normalized[field] !== undefined) {
        normalized[field] = String(normalized[field]);
      }
    }
    return normalized;
  });
}

function normalizeDateValue(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return new Date(value);
  if (typeof value === "string") {
    if (/^\d+$/.test(value)) return new Date(Number(value));
    const parsed = new Date(value.includes("T") ? value : `${value.replace(" ", "T")}Z`);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return value as Date;
}

async function* streamSqliteBatches(sqlitePath: string, table: TableName, batchSize: number): AsyncGenerator<JsonRow[]> {
  let lastRowId = 0;
  while (true) {
    const rows = await querySqlite(
      sqlitePath,
      `SELECT rowid AS __rowid, * FROM "${table}" WHERE rowid > ${lastRowId} ORDER BY rowid LIMIT ${batchSize}`
    );
    if (!rows.length) break;

    const batch = rows.map((row: JsonRow) => {
      lastRowId = Number(row.__rowid);
      const { __rowid: _rowId, ...rest } = row;
      return rest;
    });
    yield batch;
  }
}

async function getSourceCounts(sqlitePath: string) {
  const rows = await querySqlite(sqlitePath, `
    SELECT 'Aircraft' AS tableName, COUNT(*) AS count FROM "Aircraft"
    UNION ALL SELECT 'EmissionFactor', COUNT(*) FROM "EmissionFactor"
    UNION ALL SELECT 'Flight', COUNT(*) FROM "Flight"
    UNION ALL SELECT 'ImportLog', COUNT(*) FROM "ImportLog"
    UNION ALL SELECT 'IngestionCursor', COUNT(*) FROM "IngestionCursor"
    UNION ALL SELECT 'ProcessedArchiveDate', COUNT(*) FROM "ProcessedArchiveDate"
    UNION ALL SELECT 'AggregateRollup', COUNT(*) FROM "AggregateRollup"
  `);
  return countsFromRows(rows);
}

async function getTargetCounts() {
  return {
    Aircraft: await prisma.aircraft.count(),
    EmissionFactor: await prisma.emissionFactor.count(),
    Flight: await prisma.flight.count(),
    ImportLog: await prisma.importLog.count(),
    IngestionCursor: await prisma.ingestionCursor.count(),
    ProcessedArchiveDate: await prisma.processedArchiveDate.count(),
    AggregateRollup: await prisma.aggregateRollup.count()
  };
}

function countsFromRows(rows: Array<{ tableName: string; count: number }>) {
  const counts = Object.fromEntries(TABLES.map((table) => [table, 0])) as Record<TableName, number>;
  for (const row of rows) {
    counts[row.tableName as TableName] = Number(row.count);
  }
  return counts;
}

async function querySqlite(sqlitePath: string, sql: string) {
  const python = spawn("python", ["-c", PYTHON_SQL, sqlitePath, sql], {
    stdio: ["ignore", "pipe", "pipe"]
  });
  let stdout = "";
  let stderr = "";
  let spawnErrorMessage: string | null = null;
  python.on("error", (error) => {
    spawnErrorMessage = error.message;
  });
  python.stdout.on("data", (chunk) => {
    stdout += String(chunk);
  });
  python.stderr.on("data", (chunk) => {
    stderr += String(chunk);
  });
  const exitCode = await new Promise<number | null>((resolve) => python.on("close", resolve));
  if (spawnErrorMessage) {
    throw new Error(`Could not start Python for SQLite reads: ${spawnErrorMessage}`);
  }
  if (exitCode !== 0) {
    throw new Error(`SQLite query failed: ${stderr.trim() || `exit ${exitCode}`}`);
  }
  return JSON.parse(stdout || "[]");
}

async function printVerification(sqlitePath: string, sourceCounts: Record<TableName, number>, targetCounts: Record<TableName, number>) {
  console.log("Checking duplicate groups and missing logical records...");
  const sourceDuplicates = await getSourceDuplicateCounts(sqlitePath);
  console.log("Source duplicate groups checked.");
  const targetDuplicates = await getTargetDuplicateCounts();
  console.log("Target duplicate groups checked.");
  const missingRows = await getMissingRows(sqlitePath);
  console.log("Missing logical records checked.");

  console.log("\nVerification");
  console.log("Table                  Source        Target        Missing       Source duplicate groups   Target duplicate groups");
  for (const table of TABLES) {
    console.log(
      `${table.padEnd(22)}${String(sourceCounts[table]).padStart(10)}  ${String(targetCounts[table]).padStart(12)}  ${String(missingRows[table]).padStart(12)}  ${String(sourceDuplicates[table]).padStart(23)}  ${String(targetDuplicates[table]).padStart(23)}`
    );
  }
}

async function getMissingRows(sqlitePath: string) {
  const missing = Object.fromEntries(TABLES.map((table) => [table, 0])) as Record<TableName, number>;
  console.log("Checking missing Aircraft rows...");
  missing.Aircraft = await countMissingKeys(sqlitePath, "Aircraft", ["icaoHex"], async (batch) => {
    const existing = await prisma.aircraft.findMany({
      where: { icaoHex: { in: batch.map((row) => String(row.icaoHex)) } },
      select: { icaoHex: true }
    });
    return new Set(existing.map((row) => row.icaoHex));
  });
  console.log("Checking missing EmissionFactor rows...");
  missing.EmissionFactor = await countMissingKeys(sqlitePath, "EmissionFactor", ["aircraftType"], async (batch) => {
    const existing = await prisma.emissionFactor.findMany({
      where: { aircraftType: { in: batch.map((row) => String(row.aircraftType)) } },
      select: { aircraftType: true }
    });
    return new Set(existing.map((row) => row.aircraftType));
  });
  console.log("Checking missing Flight rows...");
  missing.Flight = await countMissingFlights(sqlitePath);
  console.log("Checking missing ImportLog rows...");
  missing.ImportLog = await countMissingKeys(sqlitePath, "ImportLog", ["id"], async (batch) => {
    const existing = await prisma.importLog.findMany({
      where: { id: { in: batch.map((row) => String(row.id)) } },
      select: { id: true }
    });
    return new Set(existing.map((row) => row.id));
  });
  console.log("Checking missing IngestionCursor rows...");
  missing.IngestionCursor = await countMissingKeys(sqlitePath, "IngestionCursor", ["provider", "mode"], async (batch) => {
    const conditions = batch.map((row) => ({ provider: String(row.provider), mode: String(row.mode) }));
    const existing = await prisma.ingestionCursor.findMany({
      where: { OR: conditions },
      select: { provider: true, mode: true }
    });
    return new Set(existing.map((row) => `${row.provider}\u0000${row.mode}`));
  });
  console.log("Checking missing ProcessedArchiveDate rows...");
  missing.ProcessedArchiveDate = await countMissingKeys(sqlitePath, "ProcessedArchiveDate", ["provider", "dateKey"], async (batch) => {
    const conditions = batch.map((row) => ({ provider: String(row.provider), dateKey: String(row.dateKey) }));
    const existing = await prisma.processedArchiveDate.findMany({
      where: { OR: conditions },
      select: { provider: true, dateKey: true }
    });
    return new Set(existing.map((row) => `${row.provider}\u0000${row.dateKey}`));
  });
  console.log("Checking missing AggregateRollup rows...");
  missing.AggregateRollup = await countMissingKeys(sqlitePath, "AggregateRollup", ["period", "group", "key", "periodStart"], async (batch) => {
    const conditions = batch.map((row) => ({
      period: String(row.period),
      group: String(row.group),
      key: String(row.key),
      periodStart: normalizeDateValue(row.periodStart) as Date
    }));
    const existing = await prisma.aggregateRollup.findMany({
      where: { OR: conditions },
      select: { period: true, group: true, key: true, periodStart: true }
    });
    return new Set(existing.map((row) => `${row.period}\u0000${row.group}\u0000${row.key}\u0000${row.periodStart.getTime()}`));
  });
  return missing;
}

async function countMissingFlights(sqlitePath: string) {
  let missing = 0;
  for await (const batch of streamSqliteBatches(sqlitePath, "Flight", 1000)) {
    const normalized = normalizeRows("Flight", batch);
    const rowsWithSourceIds = normalized.filter((row) => row.sourceRecordId);
    const rowsWithoutSourceIds = normalized.filter((row) => !row.sourceRecordId);
    const existingKeys = new Set<string>();

    if (rowsWithSourceIds.length) {
      const existing = await prisma.flight.findMany({
        where: {
          OR: rowsWithSourceIds.map((row) => ({
            dataSource: String(row.dataSource),
            sourceRecordId: String(row.sourceRecordId)
          }))
        },
        select: {
          dataSource: true,
          sourceRecordId: true
        }
      });
      for (const row of existing) {
        existingKeys.add(`${row.dataSource}\u0000${row.sourceRecordId}`);
      }
    }

    if (rowsWithoutSourceIds.length) {
      const existing = await prisma.flight.findMany({
        where: {
          id: {
            in: rowsWithoutSourceIds.map((row) => String(row.id))
          }
        },
        select: {
          id: true
        }
      });
      for (const row of existing) {
        existingKeys.add(`id\u0000${row.id}`);
      }
    }

    for (const row of normalized) {
      const key = row.sourceRecordId
        ? `${row.dataSource}\u0000${row.sourceRecordId}`
        : `id\u0000${row.id}`;
      if (!existingKeys.has(key)) missing += 1;
    }
  }
  return missing;
}

async function countMissingKeys(
  sqlitePath: string,
  table: TableName,
  keyFields: string[],
  getExistingKeys: (batch: JsonRow[]) => Promise<Set<string>>
) {
  let missing = 0;
  for await (const batch of streamSqliteBatches(sqlitePath, table, 1000)) {
    const normalized = normalizeRows(table, batch);
    const existing = await getExistingKeys(normalized);
    for (const row of normalized) {
      const key = keyFields
        .map((field) => {
          const value = row[field];
          return value instanceof Date ? String(value.getTime()) : String(value);
        })
        .join("\u0000");
      if (!existing.has(key)) missing += 1;
    }
  }
  return missing;
}

async function getSourceDuplicateCounts(sqlitePath: string) {
  const rows = await querySqlite(sqlitePath, `
    SELECT 'Aircraft' AS tableName, COUNT(*) AS count FROM (SELECT 1 FROM "Aircraft" GROUP BY "icaoHex" HAVING COUNT(*) > 1)
    UNION ALL SELECT 'EmissionFactor', COUNT(*) FROM (SELECT 1 FROM "EmissionFactor" GROUP BY "aircraftType" HAVING COUNT(*) > 1)
    UNION ALL SELECT 'Flight', COUNT(*) FROM (SELECT 1 FROM "Flight" WHERE "sourceRecordId" IS NOT NULL GROUP BY "dataSource", "sourceRecordId" HAVING COUNT(*) > 1)
    UNION ALL SELECT 'ImportLog', COUNT(*) FROM (SELECT 1 FROM "ImportLog" GROUP BY "id" HAVING COUNT(*) > 1)
    UNION ALL SELECT 'IngestionCursor', COUNT(*) FROM (SELECT 1 FROM "IngestionCursor" GROUP BY "provider", "mode" HAVING COUNT(*) > 1)
    UNION ALL SELECT 'ProcessedArchiveDate', COUNT(*) FROM (SELECT 1 FROM "ProcessedArchiveDate" GROUP BY "provider", "dateKey" HAVING COUNT(*) > 1)
    UNION ALL SELECT 'AggregateRollup', COUNT(*) FROM (SELECT 1 FROM "AggregateRollup" GROUP BY "period", "group", "key", "periodStart" HAVING COUNT(*) > 1)
  `);
  return countsFromRows(rows);
}

async function getTargetDuplicateCounts() {
  const rows = await prisma.$queryRawUnsafe<Array<{ tableName: string; count: bigint }>>(`
    SELECT 'Aircraft' AS "tableName", COUNT(*) AS count FROM (SELECT 1 FROM "Aircraft" GROUP BY "icaoHex" HAVING COUNT(*) > 1) duplicates
    UNION ALL SELECT 'EmissionFactor', COUNT(*) FROM (SELECT 1 FROM "EmissionFactor" GROUP BY "aircraftType" HAVING COUNT(*) > 1) duplicates
    UNION ALL SELECT 'Flight', COUNT(*) FROM (SELECT 1 FROM "Flight" WHERE "sourceRecordId" IS NOT NULL GROUP BY "dataSource", "sourceRecordId" HAVING COUNT(*) > 1) duplicates
    UNION ALL SELECT 'ImportLog', COUNT(*) FROM (SELECT 1 FROM "ImportLog" GROUP BY "id" HAVING COUNT(*) > 1) duplicates
    UNION ALL SELECT 'IngestionCursor', COUNT(*) FROM (SELECT 1 FROM "IngestionCursor" GROUP BY "provider", "mode" HAVING COUNT(*) > 1) duplicates
    UNION ALL SELECT 'ProcessedArchiveDate', COUNT(*) FROM (SELECT 1 FROM "ProcessedArchiveDate" GROUP BY "provider", "dateKey" HAVING COUNT(*) > 1) duplicates
    UNION ALL SELECT 'AggregateRollup', COUNT(*) FROM (SELECT 1 FROM "AggregateRollup" GROUP BY "period", "group", "key", "periodStart" HAVING COUNT(*) > 1) duplicates
  `);
  return countsFromRows(rows.map((row) => ({ tableName: row.tableName, count: Number(row.count) })));
}

function printCounts(counts: Record<TableName, number>) {
  for (const table of TABLES) {
    console.log(`${table}: ${counts[table].toLocaleString()}`);
  }
}

function logProgress(table: TableName, processed: number, total: number) {
  console.log(`${table}: ${Math.min(processed, total).toLocaleString()}/${total.toLocaleString()}`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
