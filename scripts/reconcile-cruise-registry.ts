import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { loadProjectEnv } from "@/lib/env/loadProjectEnv";
import { reconcileCruiseCandidate, type RegistryEntryForReconciliation } from "@/lib/cruises/registry";
import { prisma } from "@/lib/database/cruises";

loadProjectEnv();

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const db = prisma as unknown as {
    cruiseShip: { findMany: (args: unknown) => Promise<Array<Record<string, unknown>>> };
    cruiseVesselRegistryEntry: { findMany: (args: unknown) => Promise<RegistryEntryForReconciliation[]> };
    cruiseVesselVerification: { upsert: (args: unknown) => Promise<unknown> };
  };

  try {
    if (!(await verificationTablesAvailable())) {
      console.log("Cruise registry reconciliation");
      console.log("Verification registry tables are not available yet. Run the cruise verification migration on cruises-dev before applying reconciliation.");
      return;
    }

    const [registryEntries, candidates] = await Promise.all([
      db.cruiseVesselRegistryEntry.findMany({
        select: { id: true, imo: true, registryDecision: true, sourceName: true }
      }),
      db.cruiseShip.findMany({
        take: options.limit ?? undefined,
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          imo: true,
          mmsi: true,
          name: true,
          shipType: true,
          grossTonnage: true,
          length: true,
          width: true,
          annualEmissions: { take: 1, select: { id: true } }
        }
      })
    ]);

    const registryByImo = new Map(registryEntries.map((entry) => [entry.imo, entry]));
    const decisions = candidates.map((candidate) => {
      const annualEmissions = Array.isArray(candidate.annualEmissions) ? candidate.annualEmissions : [];
      const decision = reconcileCruiseCandidate(
        {
          id: String(candidate.id),
          imo: typeof candidate.imo === "string" ? candidate.imo : null,
          mmsi: typeof candidate.mmsi === "string" ? candidate.mmsi : null,
          name: String(candidate.name ?? "Unknown"),
          shipType: typeof candidate.shipType === "string" ? candidate.shipType : null,
          grossTonnage: candidate.grossTonnage,
          length: candidate.length,
          width: candidate.width,
          hasMrvRecord: annualEmissions.length > 0
        },
        typeof candidate.imo === "string" ? registryByImo.get(candidate.imo) ?? null : null
      );
      return { shipId: String(candidate.id), name: String(candidate.name ?? "Unknown"), imo: candidate.imo, decision };
    });

    if (options.apply) {
      for (const row of decisions) {
        await db.cruiseVesselVerification.upsert({
          where: { shipId: row.shipId },
          create: {
            shipId: row.shipId,
            registryEntryId: row.decision.registryEntryId,
            verificationStatus: row.decision.verificationStatus,
            confidence: row.decision.confidence,
            decisionSource: row.decision.decisionSource,
            evidence: row.decision.evidence,
            assessedAt: new Date()
          },
          update: {
            registryEntryId: row.decision.registryEntryId,
            verificationStatus: row.decision.verificationStatus,
            confidence: row.decision.confidence,
            decisionSource: row.decision.decisionSource,
            evidence: row.decision.evidence,
            assessedAt: new Date()
          }
        });
      }
    }

    const summary = {
      mode: options.apply ? "apply" : "dry-run",
      candidates: decisions.length,
      verified: decisions.filter((row) => row.decision.verificationStatus === "VERIFIED_OCEAN_CRUISE").length,
      excluded: decisions.filter((row) => row.decision.verificationStatus === "EXCLUDED_NON_CRUISE").length,
      reviewRequired: decisions.filter((row) => row.decision.verificationStatus === "REVIEW_REQUIRED").length,
      unassessed: decisions.filter((row) => row.decision.verificationStatus === "UNASSESSED").length
    };

    console.log("Cruise registry reconciliation");
    console.table(summary);
    if (options.output) await writeJson(options.output, { summary, decisions });
  } catch (error) {
    if (isMissingVerificationTableError(error)) {
      console.log("Cruise registry reconciliation");
      console.log("Verification registry tables are not available yet. Run the cruise verification migration on cruises-dev before applying reconciliation.");
      return;
    }
    throw error;
  }
}

function parseArgs(args: string[]) {
  const options: { apply: boolean; limit: number | null; output: string | null } = { apply: false, limit: null, output: null };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--") continue;
    if (arg === "--dry-run") options.apply = false;
    else if (arg === "--apply") options.apply = true;
    else if (arg === "--limit") {
      options.limit = Number(args[index + 1]);
      if (!Number.isInteger(options.limit) || options.limit <= 0) throw new Error("--limit requires a positive integer.");
      index += 1;
    } else if (arg === "--output") {
      options.output = args[index + 1];
      if (!options.output) throw new Error("--output requires a file path.");
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

async function writeJson(path: string, value: unknown) {
  const outputPath = resolve(path);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  console.log(`JSON report written to ${outputPath}`);
}

function isMissingVerificationTableError(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "P2021";
}

async function verificationTablesAvailable() {
  const rows = await prisma.$queryRaw<Array<{ registry_exists: boolean; verification_exists: boolean }>>`
    SELECT
      to_regclass('public.cruise_vessel_registry_entries') IS NOT NULL AS registry_exists,
      to_regclass('public.cruise_vessel_verifications') IS NOT NULL AS verification_exists
  `;
  return Boolean(rows[0]?.registry_exists && rows[0]?.verification_exists);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
