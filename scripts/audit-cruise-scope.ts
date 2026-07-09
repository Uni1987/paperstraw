import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { prisma } from "@/lib/database/cruises";
import {
  CURRENT_AIS_FILTER_RULES,
  classifyCruiseScope,
  findCruiseRegionForPosition,
  type CruiseScopeAuditCategory,
  type CruiseScopeAuditVessel
} from "@/lib/cruises/scopeAudit";

type CliOptions = {
  sampleSize: number;
  output: string | null;
  days: number;
};

type AuditedVessel = CruiseScopeAuditVessel & {
  id: string;
  latestRegion: string;
  category: CruiseScopeAuditCategory;
  evidence: string[];
};

type AuditReport = {
  generatedAt: string;
  options: CliOptions;
  currentFilter: typeof CURRENT_AIS_FILTER_RULES;
  counts: {
    totalDistinctStoredShips: number;
    distinctShipsWithPositionLast6Hours: number;
    byCategory: Record<CruiseScopeAuditCategory, number>;
  };
  metadataQuality: Record<string, { count: number; percentage: number }>;
  distributions: {
    shipType: Array<{ key: string; count: number }>;
    lengthBand: Array<{ key: string; count: number }>;
    grossTonnageBand: Array<{ key: string; count: number }>;
    operator: Array<{ key: string; count: number }>;
    latestRegion: Array<{ key: string; count: number }>;
    category: Array<{ key: CruiseScopeAuditCategory; count: number }>;
  };
  samples: {
    suspectedFalsePositiveReview: AuditedVessel[];
    likelyGenuineCruiseReview: AuditedVessel[];
  };
  topOperators: Array<{ operator: string; total: number; byCategory: Record<CruiseScopeAuditCategory, number> }>;
  recommendation: {
    currentDatasetRecommendation: string;
    futureAcceptancePolicy: string[];
    futureQuarantinePolicy: string[];
    potentialFalsePositivePatterns: string[];
    dataGaps: string[];
  };
};

const CATEGORIES: CruiseScopeAuditCategory[] = [
  "LIKELY_OCEAN_CRUISE",
  "POSSIBLE_OCEAN_CRUISE",
  "LIKELY_NON_CRUISE_PASSENGER",
  "INSUFFICIENT_METADATA"
];

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const report = await buildCruiseScopeAuditReport(options);
  printReport(report);

  if (options.output) {
    const outputPath = resolve(options.output);
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    console.log(`\nJSON report written to ${outputPath}`);
  }
}

async function buildCruiseScopeAuditReport(options: CliOptions): Promise<AuditReport> {
  const now = new Date();
  const activeSince = new Date(now.getTime() - 6 * 60 * 60 * 1000);

  const [ships, activeShips] = await Promise.all([
    prisma.cruiseShip.findMany({
      include: {
        positions: {
          orderBy: { timestamp: "desc" },
          take: 1,
          select: {
            latitude: true,
            longitude: true,
            speedOverGround: true,
            navigationalStatus: true,
            destination: true,
            timestamp: true,
            rawPayload: true
          }
        },
        annualEmissions: {
          take: 1,
          orderBy: { reportingYear: "desc" },
          select: { id: true }
        }
      },
      orderBy: { updatedAt: "desc" }
    }),
    prisma.cruisePosition.groupBy({
      by: ["shipId"],
      where: { timestamp: { gte: activeSince } }
    })
  ]);

  const audited = ships.map((ship): AuditedVessel => {
    const latest = ship.positions[0] ?? null;
    const latitude = latest ? Number(latest.latitude) : null;
    const longitude = latest ? Number(latest.longitude) : null;
    const vessel: CruiseScopeAuditVessel = {
      id: ship.id,
      name: ship.name,
      imo: ship.imo,
      mmsi: ship.mmsi,
      operator: ship.operator,
      shipType: ship.shipType,
      grossTonnage: decimalToNumber(ship.grossTonnage),
      length: decimalToNumber(ship.length),
      width: decimalToNumber(ship.width),
      destination: latest?.destination ?? ship.destination,
      latestLatitude: latitude,
      latestLongitude: longitude,
      latestSpeedOverGround: latest?.speedOverGround === null || latest?.speedOverGround === undefined ? null : Number(latest.speedOverGround),
      latestNavigationalStatus: latest?.navigationalStatus ?? null,
      hasMrvRecord: ship.annualEmissions.length > 0,
      hasStaticPayload: hasStaticAisPayload(latest?.rawPayload)
    };
    const classification = classifyCruiseScope(vessel);
    return {
      ...vessel,
      id: ship.id,
      latestRegion: findCruiseRegionForPosition(latitude, longitude),
      category: classification.category,
      evidence: classification.evidence
    };
  });

  const byCategory = categoryCounts(audited);
  return {
    generatedAt: now.toISOString(),
    options,
    currentFilter: CURRENT_AIS_FILTER_RULES,
    counts: {
      totalDistinctStoredShips: ships.length,
      distinctShipsWithPositionLast6Hours: activeShips.length,
      byCategory
    },
    metadataQuality: buildMetadataQuality(audited),
    distributions: {
      shipType: distribution(audited.map((vessel) => vessel.shipType || "Unknown")),
      lengthBand: distribution(audited.map((vessel) => lengthBand(vessel.length))),
      grossTonnageBand: distribution(audited.map((vessel) => grossTonnageBand(vessel.grossTonnage))),
      operator: distribution(audited.map((vessel) => vessel.operator || "Unknown")).slice(0, 20),
      latestRegion: distribution(audited.map((vessel) => vessel.latestRegion)),
      category: CATEGORIES.map((category) => ({ key: category, count: byCategory[category] }))
    },
    samples: {
      suspectedFalsePositiveReview: sampleVessels(
        audited.filter((vessel) => vessel.category !== "LIKELY_OCEAN_CRUISE"),
        options.sampleSize
      ),
      likelyGenuineCruiseReview: sampleVessels(
        audited.filter((vessel) => vessel.category === "LIKELY_OCEAN_CRUISE"),
        options.sampleSize
      )
    },
    topOperators: topOperators(audited),
    recommendation: buildRecommendation(byCategory)
  };
}

function printReport(report: AuditReport) {
  console.log("PaperStraw Cruise AIS Scope Audit");
  console.log(`Generated: ${report.generatedAt}`);
  console.log(`Sample size per review section: ${report.options.sampleSize}`);
  console.log("");
  console.log("Overall counts");
  console.table({
    "stored cruise_ships": report.counts.totalDistinctStoredShips,
    "ships with position last 6h": report.counts.distinctShipsWithPositionLast6Hours,
    "likely ocean cruise": report.counts.byCategory.LIKELY_OCEAN_CRUISE,
    "possible ocean cruise": report.counts.byCategory.POSSIBLE_OCEAN_CRUISE,
    "likely non-cruise passenger": report.counts.byCategory.LIKELY_NON_CRUISE_PASSENGER,
    "insufficient metadata": report.counts.byCategory.INSUFFICIENT_METADATA
  });

  console.log("\nCurrent filter evidence");
  console.log(`Accepted AIS message types: ${report.currentFilter.subscribedMessageTypes.join(", ")}`);
  console.log(`Accepted AIS type codes: ${report.currentFilter.acceptedShipTypeCodes}`);
  console.log(`Accepted type text: ${report.currentFilter.acceptedShipTypeText}`);
  console.log(`Known identity rule: ${report.currentFilter.knownIdentityRule}`);
  console.log(`Conclusion: ${report.currentFilter.scopeConclusion}. AIS passenger type can include ferries, RoPax, commuter vessels, high-speed craft, and other non-target passenger vessels.`);
  console.log("Rejection rules:");
  for (const rule of report.currentFilter.rejectionRules) console.log(`- ${rule}`);

  console.log("\nMetadata quality");
  console.table(report.metadataQuality);

  console.log("\nDistribution: AIS ship type / stored ship_type");
  console.table(report.distributions.shipType.slice(0, 20));
  console.log("\nDistribution: length bands");
  console.table(report.distributions.lengthBand);
  console.log("\nDistribution: gross tonnage bands");
  console.table(report.distributions.grossTonnageBand);
  console.log("\nDistribution: latest region");
  console.table(report.distributions.latestRegion);
  console.log("\nDistribution: audit category");
  console.table(report.distributions.category);

  console.log("\nTop operators by distinct accepted ships");
  console.table(report.topOperators.slice(0, 15));

  console.log("\nSuspected false-positive / ambiguous review sample");
  printVesselSample(report.samples.suspectedFalsePositiveReview);

  console.log("\nLikely genuine ocean cruise review sample");
  printVesselSample(report.samples.likelyGenuineCruiseReview);

  console.log("\nRecommendation");
  console.log(report.recommendation.currentDatasetRecommendation);
  console.log("\nFuture candidate intake policy:");
  for (const item of report.recommendation.futureAcceptancePolicy) console.log(`- ${item}`);
  console.log("\nFuture quarantine/review policy:");
  for (const item of report.recommendation.futureQuarantinePolicy) console.log(`- ${item}`);
  console.log("\nPotential false-positive patterns:");
  for (const item of report.recommendation.potentialFalsePositivePatterns) console.log(`- ${item}`);
  console.log("\nData gaps:");
  for (const item of report.recommendation.dataGaps) console.log(`- ${item}`);
}

function printVesselSample(vessels: AuditedVessel[]) {
  if (!vessels.length) {
    console.log("No vessels in this sample.");
    return;
  }
  console.table(
    vessels.map((vessel) => ({
      name: vessel.name ?? "Unknown",
      imo: vessel.imo ?? "",
      mmsi: vessel.mmsi ?? "",
      operator: vessel.operator ?? "",
      shipType: vessel.shipType ?? "",
      dimensions: [vessel.length ? `${formatNumber(vessel.length)}m` : null, vessel.width ? `${formatNumber(vessel.width)}m` : null].filter(Boolean).join(" x "),
      region: vessel.latestRegion,
      category: vessel.category,
      evidence: vessel.evidence.slice(0, 5).join("; ")
    }))
  );
}

function buildMetadataQuality(vessels: AuditedVessel[]) {
  const total = vessels.length || 1;
  return {
    imo: metric(vessels.filter((vessel) => Boolean(vessel.imo)).length, total),
    mmsi: metric(vessels.filter((vessel) => Boolean(vessel.mmsi)).length, total),
    operator: metric(vessels.filter((vessel) => Boolean(vessel.operator)).length, total),
    dimensions: metric(vessels.filter((vessel) => vessel.length !== null && vessel.width !== null).length, total),
    grossTonnage: metric(vessels.filter((vessel) => vessel.grossTonnage !== null).length, total),
    usableStaticVesselType: metric(vessels.filter((vessel) => Boolean(vessel.shipType)).length, total),
    mrvMatch: metric(vessels.filter((vessel) => vessel.hasMrvRecord).length, total)
  };
}

function metric(count: number, total: number) {
  return {
    count,
    percentage: Number(((count / total) * 100).toFixed(1))
  };
}

function categoryCounts(vessels: AuditedVessel[]) {
  const counts = Object.fromEntries(CATEGORIES.map((category) => [category, 0])) as Record<CruiseScopeAuditCategory, number>;
  for (const vessel of vessels) counts[vessel.category] += 1;
  return counts;
}

function distribution<T extends string>(values: T[]) {
  const counts = new Map<T, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || String(a.key).localeCompare(String(b.key)));
}

function sampleVessels(vessels: AuditedVessel[], sampleSize: number) {
  return [...vessels]
    .sort((a, b) => categoryPriority(a.category) - categoryPriority(b.category) || Number(Boolean(b.hasMrvRecord)) - Number(Boolean(a.hasMrvRecord)) || (b.length ?? 0) - (a.length ?? 0))
    .slice(0, sampleSize);
}

function topOperators(vessels: AuditedVessel[]) {
  const operators = new Map<string, Record<CruiseScopeAuditCategory, number>>();
  for (const vessel of vessels) {
    const operator = vessel.operator || "Unknown";
    const row = operators.get(operator) ?? (Object.fromEntries(CATEGORIES.map((category) => [category, 0])) as Record<CruiseScopeAuditCategory, number>);
    row[vessel.category] += 1;
    operators.set(operator, row);
  }
  return [...operators.entries()]
    .map(([operator, byCategory]) => ({
      operator,
      total: CATEGORIES.reduce((sum, category) => sum + byCategory[category], 0),
      byCategory
    }))
    .sort((a, b) => b.total - a.total || a.operator.localeCompare(b.operator))
    .slice(0, 25);
}

function buildRecommendation(byCategory: Record<CruiseScopeAuditCategory, number>) {
  const ambiguous = byCategory.POSSIBLE_OCEAN_CRUISE + byCategory.LIKELY_NON_CRUISE_PASSENGER + byCategory.INSUFFICIENT_METADATA;
  return {
    currentDatasetRecommendation:
      ambiguous > 0
        ? "Recommendation: continue only on cruises-dev pending filter improvements and review/cleanup before production reporting."
        : "Recommendation: current sampled dataset appears aligned with the v1 scope, but keep the two-stage review policy before production reporting.",
    futureAcceptancePolicy: [
      "Stage 1 candidate intake may accept AIS passenger-like vessels, known MRV IMO/MMSI matches, and explicit cruise-like static metadata.",
      "Do not treat AIS passenger code 60-69 alone as an accepted leisure cruise ship.",
      "Keep candidate intake broad enough for expedition vessels and smaller overnight cruise ships with incomplete metadata.",
      "Attach evidence labels for IMO, MMSI, operator, dimensions, MRV, ship type, speed and route metadata."
    ],
    futureQuarantinePolicy: [
      "Accept ocean cruise only when multiple strong signals agree, such as MRV match plus ocean-cruise operator, explicit cruise type/name, or ocean-cruise scale.",
      "Quarantine/review passenger vessels with ferry, RoPax, river, commuter, high-speed, water taxi, excursion/day-trip, yacht, research, service or floating-hotel signals.",
      "Require manual or reference-data review for sparse metadata, especially records without IMO or operator.",
      "Keep excluded non-cruise passenger vessels out of public cruise emissions aggregates but preserve raw audit evidence until cleanup is approved."
    ],
    potentialFalsePositivePatterns: [
      "AIS passenger type code 60-69 with ferry/RoPax naming or operator text.",
      "High-speed passenger craft and catamarans with passenger AIS type.",
      "River passenger vessels and day-excursion boats in coastal boxes.",
      "Water taxis, shuttle vessels and commuter ferries near cruise ports.",
      "Accommodation/floating hotel vessels not operating leisure cruises.",
      "Superyachts or service vessels with misleading passenger-like metadata."
    ],
    dataGaps: [
      "Operator is often missing from AIS-only records.",
      "Gross tonnage is usually unavailable unless imported from MRV or another static reference.",
      "AIS ship type text/code is too broad for leisure-cruise scope.",
      "Route/destination strings are inconsistent and should be treated as supporting evidence only.",
      "Static AIS payloads are not always available in stored latest position data."
    ]
  };
}

function categoryPriority(category: CruiseScopeAuditCategory) {
  return {
    LIKELY_NON_CRUISE_PASSENGER: 0,
    INSUFFICIENT_METADATA: 1,
    POSSIBLE_OCEAN_CRUISE: 2,
    LIKELY_OCEAN_CRUISE: 3
  }[category];
}

function lengthBand(value: number | null) {
  if (value === null) return "Unknown";
  if (value < 75) return "<75 m";
  if (value < 130) return "75-129 m";
  if (value < 180) return "130-179 m";
  if (value < 250) return "180-249 m";
  return "250+ m";
}

function grossTonnageBand(value: number | null) {
  if (value === null) return "Unknown";
  if (value < 3_000) return "<3k GT";
  if (value < 10_000) return "3k-9.9k GT";
  if (value < 25_000) return "10k-24.9k GT";
  if (value < 75_000) return "25k-74.9k GT";
  return "75k+ GT";
}

function decimalToNumber(value: unknown) {
  if (value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function hasStaticAisPayload(value: unknown) {
  if (!value || typeof value !== "object") return false;
  const payload = value as { MessageType?: unknown; Message?: Record<string, unknown> };
  return payload.MessageType === "ShipStaticData" || Boolean(payload.Message?.ShipStaticData);
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    sampleSize: 25,
    output: null,
    days: 7
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--") {
      continue;
    } else if (arg === "--sample-size") {
      options.sampleSize = parsePositiveInteger(args[index + 1], "--sample-size");
      index += 1;
    } else if (arg === "--output") {
      options.output = args[index + 1];
      if (!options.output) throw new Error("--output requires a file path.");
      index += 1;
    } else if (arg === "--days") {
      options.days = parsePositiveInteger(args[index + 1], "--days");
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function parsePositiveInteger(value: string | undefined, label: string) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${label} requires a positive integer.`);
  return parsed;
}

function formatNumber(value: number) {
  return value.toLocaleString("en-US", { maximumFractionDigits: 1 });
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
