import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { loadProjectEnv } from "@/lib/env/loadProjectEnv";
import { buildRegistryCoverageReport, parseRegistryExpansionManifest, type CoverageCandidateShip, type CoverageRegistryEntry } from "@/lib/cruises/registryCoverage";
import { parseRegistryCsv } from "@/lib/cruises/registry";
import { prisma } from "@/lib/prisma";

loadProjectEnv();

type TableStatusRow = {
  cruise_ships_exists: boolean;
  registry_exists: boolean;
  verification_exists: boolean;
  positions_exists: boolean;
  estimates_exists: boolean;
};

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const manifest = parseRegistryExpansionManifest(readFileSync(resolve(process.cwd(), "data/cruises/registry-expansion-manifest.csv"), "utf8"));
  if (manifest.errors.length) {
    console.log("Cruise registry coverage");
    console.log("Manifest errors:");
    for (const error of manifest.errors) console.log(`- ${error}`);
    process.exitCode = 1;
    return;
  }

  const tables = await getTableStatus();
  const registryEntries = tables.registry_exists ? await getRegistryEntries() : [];
  const proposedRegistryEntries = getProposedRegistryEntries();
  const candidateShips = tables.cruise_ships_exists ? await getCandidateShips() : [];
  const publicEligibleShips = tables.cruise_ships_exists && tables.registry_exists && tables.verification_exists ? await getPublicEligibleShips() : [];
  const recentAisShipIds = tables.positions_exists && tables.registry_exists && tables.verification_exists ? await getRecentPublicEligibleAisShipIds() : [];
  const dailyEstimateShipIds = tables.estimates_exists && tables.registry_exists && tables.verification_exists ? await getPublicEligibleDailyEstimateShipIds() : [];

  const report = buildRegistryCoverageReport({
    manifestEntries: manifest.entries,
    registryEntries,
    proposedRegistryEntries,
    candidateShips,
    publicEligibleShips,
    recentAisShipIds,
    dailyEstimateShipIds
  });

  printReport(report);
  if (options.output) await writeJson(options.output, report);
}

function parseArgs(args: string[]) {
  const options: { output: string | null } = { output: null };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--") continue;
    if (arg === "--output") {
      options.output = args[index + 1];
      if (!options.output) throw new Error("--output requires a path.");
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

function printReport(report: ReturnType<typeof buildRegistryCoverageReport>) {
  console.log("Cruise registry coverage");
  console.log("Registry coverage");
  console.table({
    "total ACCEPT registry entries": report.registryCoverage.totalAcceptEntries,
    "active entries": report.registryCoverage.activeEntries,
    "retired entries": report.registryCoverage.retiredEntries,
    "ocean cruise entries": report.registryCoverage.oceanCruiseEntries,
    "expedition cruise entries": report.registryCoverage.expeditionCruiseEntries
  });
  console.log("ACCEPT entries by operator group");
  console.table(report.registryCoverage.acceptEntriesByOperatorGroup);
  console.log("ACCEPT entries by operator");
  console.table(report.registryCoverage.acceptEntriesByOperator);
  console.log("AIS candidate coverage");
  console.table(report.aisCandidateCoverage);
  console.log("Operator coverage");
  console.table(report.operatorCoverage.rows);
  console.log("Operators with zero registry entries");
  console.log(report.operatorCoverage.operatorsWithZeroRegistryEntries.join(", ") || "None");
  console.log("Operators with registry entries but no AIS match yet");
  console.log(report.operatorCoverage.operatorsWithRegistryEntriesButNoAisMatchYet.join(", ") || "None");
  console.log("Public dashboard readiness");
  console.table(report.publicDashboardReadiness);
}

async function getRegistryEntries(): Promise<CoverageRegistryEntry[]> {
  const rows = await prisma.$queryRaw<Array<{
    imo: string;
    operator: string;
    operator_group: string | null;
    registry_decision: CoverageRegistryEntry["registryDecision"];
    active_status: CoverageRegistryEntry["activeStatus"];
    vessel_segment: CoverageRegistryEntry["vesselSegment"];
  }>>`
    SELECT imo, operator, operator_group, registry_decision, active_status, vessel_segment
    FROM cruise_vessel_registry_entries
  `;
  return rows.map((row) => ({
    imo: row.imo,
    operator: row.operator,
    operatorGroup: row.operator_group,
    registryDecision: row.registry_decision,
    activeStatus: row.active_status,
    vesselSegment: row.vessel_segment
  }));
}

async function getCandidateShips(): Promise<CoverageCandidateShip[]> {
  const rows = await prisma.$queryRaw<Array<{ id: string; imo: string | null; mmsi: string | null; name: string | null; operator: string | null }>>`
    SELECT id, imo, mmsi, name, operator
    FROM cruise_ships
  `;
  return rows;
}

async function getPublicEligibleShips() {
  const rows = await prisma.$queryRaw<Array<{ id: string; imo: string | null; mmsi: string | null }>>`
    SELECT DISTINCT s.id, s.imo, s.mmsi
    FROM cruise_ships s
    INNER JOIN cruise_vessel_verifications v ON v.ship_id = s.id
    INNER JOIN cruise_vessel_registry_entries r ON r.id = v.registry_entry_id
    WHERE v.verification_status = 'VERIFIED_OCEAN_CRUISE'
      AND v.confidence = 'HIGH'
      AND r.registry_decision = 'ACCEPT'
      AND r.imo = s.imo
  `;
  return rows;
}

function getProposedRegistryEntries(): CoverageRegistryEntry[] {
  const parsed = parseRegistryCsv(readFileSync(resolve(process.cwd(), "data/cruises/verified-ocean-cruise-registry.csv"), "utf8"));
  return parsed.rows.map((row) => ({
    imo: row.imo,
    operator: row.operator,
    operatorGroup: row.operatorGroup,
    registryDecision: row.registryDecision,
    activeStatus: row.activeStatus,
    vesselSegment: row.vesselSegment
  }));
}

async function getRecentPublicEligibleAisShipIds() {
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT DISTINCT s.id
    FROM cruise_ships s
    INNER JOIN cruise_positions p ON p.ship_id = s.id
    INNER JOIN cruise_vessel_verifications v ON v.ship_id = s.id
    INNER JOIN cruise_vessel_registry_entries r ON r.id = v.registry_entry_id
    WHERE p.timestamp >= NOW() - INTERVAL '6 hours'
      AND v.verification_status = 'VERIFIED_OCEAN_CRUISE'
      AND v.confidence = 'HIGH'
      AND r.registry_decision = 'ACCEPT'
      AND r.imo = s.imo
  `;
  return rows.map((row) => row.id);
}

async function getPublicEligibleDailyEstimateShipIds() {
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT DISTINCT s.id
    FROM cruise_ships s
    INNER JOIN cruise_emissions_daily_estimates e ON e.ship_id = s.id
    INNER JOIN cruise_vessel_verifications v ON v.ship_id = s.id
    INNER JOIN cruise_vessel_registry_entries r ON r.id = v.registry_entry_id
    WHERE v.verification_status = 'VERIFIED_OCEAN_CRUISE'
      AND v.confidence = 'HIGH'
      AND r.registry_decision = 'ACCEPT'
      AND r.imo = s.imo
  `;
  return rows.map((row) => row.id);
}

async function getTableStatus() {
  const rows = await prisma.$queryRaw<TableStatusRow[]>`
    SELECT
      to_regclass('public.cruise_ships') IS NOT NULL AS cruise_ships_exists,
      to_regclass('public.cruise_vessel_registry_entries') IS NOT NULL AS registry_exists,
      to_regclass('public.cruise_vessel_verifications') IS NOT NULL AS verification_exists,
      to_regclass('public.cruise_positions') IS NOT NULL AS positions_exists,
      to_regclass('public.cruise_emissions_daily_estimates') IS NOT NULL AS estimates_exists
  `;
  return rows[0] ?? {
    cruise_ships_exists: false,
    registry_exists: false,
    verification_exists: false,
    positions_exists: false,
    estimates_exists: false
  };
}

async function writeJson(path: string, value: unknown) {
  const outputPath = resolve(path);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  console.log(`Coverage JSON written to ${outputPath}`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
