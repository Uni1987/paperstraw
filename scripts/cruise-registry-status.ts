import { loadProjectEnv } from "@/lib/env/loadProjectEnv";
import { buildRegistryStatusSummary } from "@/lib/cruises/registry";
import { prisma } from "@/lib/database/cruises";

loadProjectEnv();

type CountRow = { count: number };
type TableStatusRow = {
  cruise_ships_exists: boolean;
  registry_exists: boolean;
  verification_exists: boolean;
};

async function main() {
  const tables = await getTableStatus();
  const hasCruiseShips = Boolean(tables.cruise_ships_exists);
  const hasVerificationRegistry = Boolean(tables.registry_exists && tables.verification_exists);

  const candidateShips = hasCruiseShips ? await countSql`SELECT COUNT(*)::int AS count FROM cruise_ships` : 0;
  const registryEntries = hasVerificationRegistry ? await countSql`SELECT COUNT(*)::int AS count FROM cruise_vessel_registry_entries` : 0;
  const verifiedCandidateMatches = hasVerificationRegistry
    ? await countSql`
        SELECT COUNT(DISTINCT s.id)::int AS count
        FROM cruise_ships s
        INNER JOIN cruise_vessel_verifications v ON v.ship_id = s.id
        INNER JOIN cruise_vessel_registry_entries r ON r.id = v.registry_entry_id
        WHERE v.verification_status = 'VERIFIED_OCEAN_CRUISE'
          AND v.confidence = 'HIGH'
          AND r.registry_decision = 'ACCEPT'
          AND r.imo = s.imo
      `
    : 0;
  const acceptedRegistryEntriesNotSeenInAis = hasVerificationRegistry
    ? await countSql`
        SELECT COUNT(*)::int AS count
        FROM cruise_vessel_registry_entries r
        LEFT JOIN cruise_ships s ON s.imo = r.imo
        WHERE r.registry_decision = 'ACCEPT'
          AND s.id IS NULL
      `
    : 0;
  const candidateShipsAwaitingReview = hasVerificationRegistry
    ? await countSql`
        SELECT COUNT(*)::int AS count
        FROM cruise_ships s
        LEFT JOIN cruise_vessel_verifications v ON v.ship_id = s.id
        WHERE v.ship_id IS NULL
          OR v.verification_status IN ('UNASSESSED', 'REVIEW_REQUIRED')
      `
    : candidateShips;

  const summary = buildRegistryStatusSummary({
    registryEntries,
    verifiedCandidateMatches,
    acceptedRegistryEntriesNotSeenInAis,
    currentPublicEligibleVessels: verifiedCandidateMatches,
    candidateShipsAwaitingReview
  });

  console.log("Cruise registry status");
  if (!hasVerificationRegistry) {
    console.log("Verification registry tables are not available yet. Run the cruise verification migration on cruises-dev before importing or reconciling registry entries.");
  }
  console.table({
    "registry entries": summary.registryEntries,
    "verified candidate matches": summary.verifiedCandidateMatches,
    "accepted registry entries not yet seen in AIS": summary.acceptedRegistryEntriesNotSeenInAis,
    "current public-eligible vessels": summary.currentPublicEligibleVessels,
    "candidate ships still awaiting review": summary.candidateShipsAwaitingReview
  });
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

async function countSql(strings: TemplateStringsArray, ...values: unknown[]) {
  const rows = await prisma.$queryRaw<CountRow[]>(strings, ...values);
  return Number(rows[0]?.count ?? 0);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
