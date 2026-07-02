import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { loadProjectEnv } from "@/lib/env/loadProjectEnv";
import { needsCruiseReviewQueue } from "@/lib/cruises/registry";
import { findCruiseRegionForPosition } from "@/lib/cruises/scopeAudit";
import { prisma } from "@/lib/prisma";

loadProjectEnv();

async function main() {
  const output = readOutput(process.argv.slice(2));
  const db = prisma as unknown as {
    cruiseShip: { findMany: (args: unknown) => Promise<Array<Record<string, unknown>>> };
  };

  const ships = await db.cruiseShip.findMany({
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      imo: true,
      mmsi: true,
      shipType: true,
      operator: true,
      grossTonnage: true,
      length: true,
      width: true,
      annualEmissions: { take: 1, select: { id: true } },
      positions: {
        orderBy: { timestamp: "desc" },
        take: 1,
        select: { timestamp: true, latitude: true, longitude: true }
      },
      verification: {
        select: { verificationStatus: true, evidence: true }
      }
    }
  });

  const rows = ships
    .filter((ship) => {
      const status = readVerificationStatus(ship);
      return needsCruiseReviewQueue(status);
    })
    .map((ship) => {
      const latest = readArray(ship.positions)[0] as Record<string, unknown> | undefined;
      const latitude = numberOrNull(latest?.latitude);
      const longitude = numberOrNull(latest?.longitude);
      const hasMrv = readArray(ship.annualEmissions).length > 0;
      const status = readVerificationStatus(ship) ?? "UNASSESSED";
      return {
        ship_id: String(ship.id),
        name: String(ship.name ?? ""),
        imo: String(ship.imo ?? ""),
        mmsi: String(ship.mmsi ?? ""),
        ship_type: String(ship.shipType ?? ""),
        operator: String(ship.operator ?? ""),
        gross_tonnage: String(ship.grossTonnage ?? ""),
        length: String(ship.length ?? ""),
        width: String(ship.width ?? ""),
        latest_position_at: latest?.timestamp instanceof Date ? latest.timestamp.toISOString() : "",
        latest_region: findCruiseRegionForPosition(latitude, longitude),
        mrv_match_present: hasMrv ? "true" : "false",
        verification_status: status,
        suggested_review_reason: status === "UNASSESSED" ? "No curated registry decision has been applied." : "Manual review required before public eligibility.",
        evidence_summary: "AIS/MRV metadata is supporting evidence only; exact curated IMO registry match is required for verification."
      };
    });

  const outputPath = resolve(output);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, toCsv(rows), "utf8");
  console.log(`Review queue exported: ${rows.length} candidate vessel(s) -> ${outputPath}`);
}

function readOutput(args: string[]) {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--") continue;
    if (arg === "--output") {
      const output = args[index + 1];
      if (!output) throw new Error("--output requires a path.");
      return output;
    }
  }
  throw new Error("Missing --output data/cruises/review-queue.csv");
}

function readVerificationStatus(ship: Record<string, unknown>) {
  const verification = ship.verification as { verificationStatus?: unknown } | null | undefined;
  return typeof verification?.verificationStatus === "string" ? verification.verificationStatus : null;
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function numberOrNull(value: unknown) {
  if (value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function toCsv(rows: Array<Record<string, string>>) {
  const headers = [
    "ship_id",
    "name",
    "imo",
    "mmsi",
    "ship_type",
    "operator",
    "gross_tonnage",
    "length",
    "width",
    "latest_position_at",
    "latest_region",
    "mrv_match_present",
    "verification_status",
    "suggested_review_reason",
    "evidence_summary"
  ];
  return [headers.join(","), ...rows.map((row) => headers.map((header) => csvEscape(row[header] ?? "")).join(","))].join("\n") + "\n";
}

function csvEscape(value: string) {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
