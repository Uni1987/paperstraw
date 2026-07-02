import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { loadProjectEnv } from "@/lib/env/loadProjectEnv";
import { parseRegistryCsv } from "@/lib/cruises/registry";
import {
  buildRegistryCompletenessReport,
  parseRegistryExpansionManifest,
  type CoverageCandidateShip,
  type CoveragePublicEligibleShip,
  type CoverageRegistryEntry
} from "@/lib/cruises/registryCoverage";
import { prisma } from "@/lib/prisma";

loadProjectEnv();

type TableStatusRow = {
  cruise_ships_exists: boolean;
  registry_exists: boolean;
  verification_exists: boolean;
};

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const manifest = parseRegistryExpansionManifest(readFileSync(resolve(process.cwd(), "data/cruises/registry-expansion-manifest.csv"), "utf8"));
  if (manifest.errors.length) {
    console.log("Cruise registry completeness");
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
  const manifestEntries = options.operator ? manifest.entries.filter((entry) => entry.operator === options.operator) : manifest.entries;

  const report = buildRegistryCompletenessReport({
    manifestEntries,
    registryEntries,
    proposedRegistryEntries,
    candidateShips,
    publicEligibleShips
  });

  console.log("Cruise registry completeness");
  console.table(report.rows);
  if (options.output) await writeJson(options.output, report);
}

function parseArgs(args: string[]) {
  const options: { output: string | null; operator: string | null } = { output: null, operator: null };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--") continue;
    if (arg === "--output") {
      options.output = args[index + 1];
      if (!options.output) throw new Error("--output requires a path.");
      index += 1;
    } else if (arg === "--operator") {
      options.operator = args[index + 1];
      if (!options.operator) throw new Error("--operator requires an operator name.");
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
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
  return prisma.$queryRaw<CoverageCandidateShip[]>`
    SELECT id, imo, mmsi, name, operator
    FROM cruise_ships
  `;
}

async function getPublicEligibleShips(): Promise<CoveragePublicEligibleShip[]> {
  return prisma.$queryRaw<CoveragePublicEligibleShip[]>`
    SELECT DISTINCT s.id, s.imo, s.mmsi
    FROM cruise_ships s
    INNER JOIN cruise_vessel_verifications v ON v.ship_id = s.id
    INNER JOIN cruise_vessel_registry_entries r ON r.id = v.registry_entry_id
    WHERE v.verification_status = 'VERIFIED_OCEAN_CRUISE'
      AND v.confidence = 'HIGH'
      AND r.registry_decision = 'ACCEPT'
      AND r.imo = s.imo
  `;
}

async function getTableStatus() {
  const rows = await prisma.$queryRaw<TableStatusRow[]>`
    SELECT
      to_regclass('public.cruise_ships') IS NOT NULL AS cruise_ships_exists,
      to_regclass('public.cruise_vessel_registry_entries') IS NOT NULL AS registry_exists,
      to_regclass('public.cruise_vessel_verifications') IS NOT NULL AS verification_exists
  `;
  return rows[0] ?? { cruise_ships_exists: false, registry_exists: false, verification_exists: false };
}

async function writeJson(path: string, value: unknown) {
  const outputPath = resolve(path);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  console.log(`Completeness JSON written to ${outputPath}`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
