import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { requireCruisesDatabaseUrl } from "@/lib/database/config";
import { loadProjectEnv } from "@/lib/env/loadProjectEnv";
import { parseRegistryCsv } from "@/lib/cruises/registry";
import { prisma } from "@/lib/database/cruises";

loadProjectEnv();

type RegistryIdentity = {
  imo: string;
  canonical_name: string;
  operator: string;
};

type DuplicateRow = {
  imo: string;
  proposalName: string;
  source: string;
  existingName: string;
  existingOperator: string;
};

async function main() {
  const options = parseArgs(process.argv.slice(2));
  assertReadOnlyCruisesDevTarget(process.env);

  const proposalPath = resolve(options.file);
  const proposal = parseRegistryCsv(readFileSync(proposalPath, "utf8"));
  if (proposal.errors.length) {
    console.log("Cruise registry proposal duplicate check");
    console.log("Proposal CSV parse errors:");
    for (const error of proposal.errors) console.log(`- ${error}`);
    process.exitCode = 1;
    return;
  }

  const proposalRows = proposal.rows.filter((row) => row.registryDecision === "ACCEPT");
  const liveRows = readRegistryCsvIfPresent("data/cruises/verified-ocean-cruise-registry.csv");
  const firstWaveRows = readRegistryCsvIfPresent("data/cruises/proposals/first-wave-operator-expansion.csv");
  const databaseRows = await getDatabaseAcceptedRegistryRows();

  const liveDuplicates = findDuplicates(proposalRows, liveRows, "live registry CSV");
  const firstWaveDuplicates = findDuplicates(proposalRows, firstWaveRows, "first-wave proposal CSV");
  const databaseDuplicates = findDuplicates(
    proposalRows,
    databaseRows.map((row) => ({
      imo: row.imo,
      canonicalName: row.canonical_name,
      operator: row.operator,
      registryDecision: "ACCEPT" as const
    })),
    "cruises-dev registry database"
  );

  console.log("Cruise registry proposal duplicate check");
  console.table({
    "database target": "cruises-dev",
    "proposal file": options.file,
    "proposal ACCEPT rows": proposalRows.length,
    "live registry CSV ACCEPT rows": liveRows.length,
    "first-wave proposal ACCEPT rows": firstWaveRows.length,
    "cruises-dev database ACCEPT rows": databaseRows.length,
    "duplicates in live CSV": liveDuplicates.length,
    "duplicates in first-wave proposal": firstWaveDuplicates.length,
    "duplicates in cruises-dev database": databaseDuplicates.length,
    "database writes attempted": 0
  });

  const duplicates = [...liveDuplicates, ...firstWaveDuplicates, ...databaseDuplicates];
  if (duplicates.length) {
    console.log("Duplicate rows");
    console.table(duplicates);
    process.exitCode = 1;
  } else {
    console.log("Status: no proposal IMOs were found in the live CSV, first-wave proposal, or cruises-dev registry database.");
  }
}

function parseArgs(args: string[]) {
  const options: { file: string | null } = { file: null };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--") continue;
    if (arg === "--file") {
      options.file = args[index + 1];
      if (!options.file) throw new Error("--file requires a path.");
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!options.file) throw new Error("--file is required.");
  return { file: options.file };
}

function assertReadOnlyCruisesDevTarget(env: NodeJS.ProcessEnv) {
  requireCruisesDatabaseUrl(env, { allowLegacyDatabaseUrlWithCruiseTarget: true });
  if (env.CRUISE_WORKER_DATABASE_TARGET?.trim() !== "cruises-dev") {
    throw new Error("Set CRUISE_WORKER_DATABASE_TARGET=cruises-dev before running the read-only proposal duplicate check.");
  }
}

function readRegistryCsvIfPresent(path: string) {
  const resolved = resolve(path);
  if (!existsSync(resolved)) return [];
  const parsed = parseRegistryCsv(readFileSync(resolved, "utf8"));
  if (parsed.errors.length) throw new Error(`${path} has registry CSV parse errors: ${parsed.errors.join("; ")}`);
  return parsed.rows.filter((row) => row.registryDecision === "ACCEPT");
}

function findDuplicates(
  proposalRows: Array<{ imo: string; canonicalName: string }>,
  existingRows: Array<{ imo: string; canonicalName: string; operator: string }>,
  source: string
): DuplicateRow[] {
  const existingByImo = new Map(existingRows.map((row) => [row.imo, row]));
  return proposalRows.flatMap((proposalRow) => {
    const existing = existingByImo.get(proposalRow.imo);
    if (!existing) return [];
    return [
      {
        imo: proposalRow.imo,
        proposalName: proposalRow.canonicalName,
        source,
        existingName: existing.canonicalName,
        existingOperator: existing.operator
      }
    ];
  });
}

async function getDatabaseAcceptedRegistryRows() {
  return prisma.$queryRaw<RegistryIdentity[]>`
    SELECT imo, canonical_name, operator
    FROM cruise_vessel_registry_entries
    WHERE registry_decision = 'ACCEPT'
  `;
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
