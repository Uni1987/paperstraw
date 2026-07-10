import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { prisma } from "@/lib/database/cruises";
import { enrichInventoryWithLiveCounts, parseLaunchInventory, type InventoryReviewRow } from "@/lib/cruises/launchReadiness";

export const SCOPE_RESEARCH_OPERATORS = [
  "Aqua Expeditions",
  "Adventure Canada",
  "Poseidon Expeditions",
  "Four Seasons Yachts"
] as const;

export const PARTIAL_RESEARCH_OPERATORS = [
  "Disney Cruise Line",
  "Viking Ocean",
  "HX / Hurtigruten Expeditions",
  "Swan Hellenic",
  "Aurora Expeditions",
  "Atlas Ocean Voyages",
  "Scenic Luxury Cruises & Tours",
  "Emerald Cruises",
  "Crystal",
  "SeaDream Yacht Club",
  "The Ritz-Carlton Yacht Collection",
  "Paul Gauguin Cruises",
  "Coral Expeditions",
  "Heritage Expeditions",
  "Albatros Expeditions",
  "Quark Expeditions",
  "Lindblad Expeditions / National Geographic"
] as const;

export const EVIDENCE_TEMPLATE_COLUMNS = [
  "operator",
  "vessel_name",
  "imo",
  "mmsi_if_known",
  "decision",
  "decision_reason",
  "evidence_source_1",
  "evidence_source_2",
  "active_status",
  "vessel_type",
  "commercial_cruise_product",
  "ocean_or_expedition",
  "river_or_coastal_transport",
  "future_ship",
  "notes",
  "reviewer",
  "reviewed_at"
] as const;

export const REGISTRY_PROPOSAL_TEMPLATE_COLUMNS = [
  "imo",
  "canonical_name",
  "operator",
  "operator_group",
  "vessel_segment",
  "registry_decision",
  "active_status",
  "source_name",
  "source_url",
  "source_checked_at",
  "notes"
] as const;

export type ScopeClassification = "INCLUDE" | "EXCLUDE" | "PARTIAL_INCLUDE" | "DEFER";
export type ScopeRisk = "low" | "medium" | "high";

export type ScopeResearchOperatorRow = {
  operator: string;
  currentStatus: string;
  acceptedRegistryCount: number;
  publicEligibleCount: number;
  whyAmbiguousOrPartial: string;
  likelyScopeClassification: ScopeClassification;
  researchQuestions: string[];
  requiredEvidence: string[];
  recommendedSources: string[];
  expectedDecisionImpact: string;
  estimatedPossibleVesselsToAdd: number;
  riskLevel: ScopeRisk;
};

export type ScopeResearchPlan = {
  generatedAt: string;
  registrySnapshot: {
    acceptedRegistryEntries: number;
    publicEligibleVessels: number;
    operatorsWithAcceptedEntries: number;
    operatorsWithPublicEligibleVessels: number;
  };
  operators: ScopeResearchOperatorRow[];
  directIncludeCandidates: ScopeResearchOperatorRow[];
  scopeDecisionCandidates: ScopeResearchOperatorRow[];
  futureOrDeferredCandidates: ScopeResearchOperatorRow[];
  outOfScopeCandidates: ScopeResearchOperatorRow[];
  duplicateOrCharterRiskCandidates: ScopeResearchOperatorRow[];
  safetyChecks: {
    readOnlyDatabase: true;
    databaseWritesAttempted: 0;
    registryImportsApplied: false;
    mmsiCandidatesApproved: false;
    automaticScopeDecisions: false;
  };
};

export type OperatorDbCount = {
  operator: string;
  acceptedRegistryCount: number;
  publicEligibleCount: number;
};

type OperatorGuidance = {
  classification: ScopeClassification;
  risk: ScopeRisk;
  why: string;
  questions: string[];
  evidence: string[];
  sources: string[];
  impact: string;
};

type RawDb = {
  $queryRaw: <T = unknown>(strings: TemplateStringsArray, ...values: unknown[]) => Promise<T>;
};

export async function buildScopeResearchPlan(
  options: { inventoryPath?: string; now?: Date } = {},
  db: RawDb = prisma
): Promise<ScopeResearchPlan> {
  const now = options.now ?? new Date();
  const dbCounts = await getScopeResearchOperatorCounts(db);
  const liveCounts = new Map(dbCounts.map((row) => [row.operator, row.acceptedRegistryCount]));
  const inventory = enrichInventoryWithLiveCounts(
    parseLaunchInventory(options.inventoryPath ?? "data/cruises/global-operator-coverage-inventory.csv"),
    liveCounts
  );
  const inventoryByOperator = new Map(inventory.map((row) => [row.operator, row]));
  const countByOperator = new Map(dbCounts.map((row) => [row.operator, row]));
  const operators = [...new Set([...SCOPE_RESEARCH_OPERATORS, ...PARTIAL_RESEARCH_OPERATORS])]
    .map((operator) => buildScopeResearchOperatorRow(operator, inventoryByOperator.get(operator), countByOperator.get(operator)))
    .sort((a, b) => categorySort(a) - categorySort(b) || a.operator.localeCompare(b.operator));

  return {
    generatedAt: now.toISOString(),
    registrySnapshot: {
      acceptedRegistryEntries: dbCounts.reduce((sum, row) => sum + row.acceptedRegistryCount, 0),
      publicEligibleVessels: dbCounts.reduce((sum, row) => sum + row.publicEligibleCount, 0),
      operatorsWithAcceptedEntries: dbCounts.filter((row) => row.acceptedRegistryCount > 0).length,
      operatorsWithPublicEligibleVessels: dbCounts.filter((row) => row.publicEligibleCount > 0).length
    },
    operators,
    directIncludeCandidates: operators.filter((row) => row.likelyScopeClassification === "INCLUDE"),
    scopeDecisionCandidates: operators.filter((row) => row.likelyScopeClassification === "PARTIAL_INCLUDE"),
    futureOrDeferredCandidates: operators.filter((row) => row.likelyScopeClassification === "DEFER"),
    outOfScopeCandidates: operators.filter((row) => row.likelyScopeClassification === "EXCLUDE"),
    duplicateOrCharterRiskCandidates: operators.filter((row) => /charter|double-count|identity|duplicate/i.test(row.whyAmbiguousOrPartial)),
    safetyChecks: {
      readOnlyDatabase: true,
      databaseWritesAttempted: 0,
      registryImportsApplied: false,
      mmsiCandidatesApproved: false,
      automaticScopeDecisions: false
    }
  };
}

export function buildScopeResearchOperatorRow(
  operator: string,
  inventory: InventoryReviewRow | undefined,
  dbCounts: OperatorDbCount | undefined
): ScopeResearchOperatorRow {
  const guidance = getOperatorGuidance(operator);
  const acceptedRegistryCount = dbCounts?.acceptedRegistryCount ?? inventory?.currentRegistryCount ?? 0;
  const publicEligibleCount = dbCounts?.publicEligibleCount ?? inventory?.approvedMmsiLinkedCount ?? 0;
  const estimatedPossibleVesselsToAdd = estimatePossibleAdditions(operator, inventory, acceptedRegistryCount);
  return {
    operator,
    currentStatus: inventory?.status ?? "NOT_IN_INVENTORY",
    acceptedRegistryCount,
    publicEligibleCount,
    whyAmbiguousOrPartial: guidance.why,
    likelyScopeClassification: guidance.classification,
    researchQuestions: guidance.questions,
    requiredEvidence: guidance.evidence,
    recommendedSources: guidance.sources,
    expectedDecisionImpact: guidance.impact,
    estimatedPossibleVesselsToAdd,
    riskLevel: guidance.risk
  };
}

export function isImportReadyScopeClassification(classification: ScopeClassification) {
  return classification === "INCLUDE";
}

export function ensureScopeResearchTemplates(options: {
  evidenceTemplatePath?: string;
  proposalTemplatePath?: string;
} = {}) {
  const evidenceTemplatePath = options.evidenceTemplatePath ?? "data/cruises/research/scope-decision-evidence-template.csv";
  const proposalTemplatePath = options.proposalTemplatePath ?? "data/cruises/proposals/manual-scope-decision-expansion-template.csv";
  writeTemplateIfMissing(evidenceTemplatePath, EVIDENCE_TEMPLATE_COLUMNS);
  writeTemplateIfMissing(proposalTemplatePath, REGISTRY_PROPOSAL_TEMPLATE_COLUMNS);
  return { evidenceTemplatePath, proposalTemplatePath };
}

export function formatScopeResearchPlanMarkdown(plan: ScopeResearchPlan) {
  const lines = [
    "# Cruise Scope Decision Research Plan",
    "",
    `Generated: \`${plan.generatedAt}\``,
    "",
    "## Scope Policy",
    "",
    "Target scope includes commercial ocean cruise vessels, commercial expedition cruise vessels, and scheduled luxury/yacht-style cruise products when they operate as public commercial cruise products with identifiable vessels and IMO numbers.",
    "",
    "Exclude by default: river cruise vessels, ferries, transport-first coastal ships, private yachts, cargo/passenger hybrids unless clearly sold as commercial cruise products, future ships not yet active, inactive/scrapped/laid-up/sold vessels, and vessels without reliable IMO identification.",
    "",
    "## Current Registry Snapshot",
    "",
    markdownRows(
      ["Metric", "Value"],
      [
        ["Accepted registry entries", plan.registrySnapshot.acceptedRegistryEntries],
        ["Public eligible / MMSI-linked vessels", plan.registrySnapshot.publicEligibleVessels],
        ["Operators with accepted entries", plan.registrySnapshot.operatorsWithAcceptedEntries],
        ["Operators with public eligible vessels", plan.registrySnapshot.operatorsWithPublicEligibleVessels]
      ]
    ),
    "",
    "## No-Overclaiming Methodology Wording",
    "",
    "- Use: current curated registry.",
    "- Use: verified tracked cruise vessels.",
    "- Use: coverage is improved through ongoing registry review.",
    "- Never claim: all cruise ships worldwide, unless independently proven.",
    "",
    "## Decision Buckets",
    "",
    `- Direct include candidates: ${plan.directIncludeCandidates.length}`,
    `- Scope-decision / partial-include candidates: ${plan.scopeDecisionCandidates.length}`,
    `- Future/deferred candidates: ${plan.futureOrDeferredCandidates.length}`,
    `- Out-of-scope candidates: ${plan.outOfScopeCandidates.length}`,
    `- Duplicate/charter-risk candidates: ${plan.duplicateOrCharterRiskCandidates.length}`,
    "",
    "### Direct Include Candidates",
    "",
    bucketRows(plan.directIncludeCandidates),
    "",
    "### Scope-Decision Candidates",
    "",
    bucketRows(plan.scopeDecisionCandidates),
    "",
    "### Future / Deferred Candidates",
    "",
    bucketRows(plan.futureOrDeferredCandidates),
    "",
    "### Out-of-Scope Candidates",
    "",
    bucketRows(plan.outOfScopeCandidates),
    "",
    "### Duplicate / Charter Risk",
    "",
    bucketRows(plan.duplicateOrCharterRiskCandidates),
    "",
    "## Scope-Decision Matrix",
    "",
    markdownRows(
      [
        "Operator",
        "Inventory status",
        "Registry",
        "Public eligible",
        "Likely classification",
        "Risk",
        "Possible adds",
        "Why ambiguous or partial",
        "Expected impact"
      ],
      plan.operators.map((row) => [
        row.operator,
        row.currentStatus,
        row.acceptedRegistryCount,
        row.publicEligibleCount,
        row.likelyScopeClassification,
        row.riskLevel,
        row.estimatedPossibleVesselsToAdd,
        row.whyAmbiguousOrPartial,
        row.expectedDecisionImpact
      ])
    ),
    "",
    "## Operator Research Detail",
    "",
    ...plan.operators.flatMap(formatOperatorDetail),
    "",
    "## Safety",
    "",
    markdownRows(
      ["Check", "Value"],
      [
        ["Read-only database usage", "yes"],
        ["Database writes attempted", 0],
        ["Registry imports applied", "no"],
        ["MMSI candidates approved", "no"],
        ["Automatic scope decisions", "no"]
      ]
    )
  ];
  return `${lines.join("\n")}\n`;
}

export function writeScopeResearchPlan(path: string, plan: ScopeResearchPlan) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, formatScopeResearchPlanMarkdown(plan), "utf8");
}

export function formatScopeResearchPlanTerminal(plan: ScopeResearchPlan, reportPath: string, templates: { evidenceTemplatePath: string; proposalTemplatePath: string }) {
  return [
    "Cruise scope-decision research plan",
    `Generated: ${plan.generatedAt}`,
    `Accepted registry entries: ${plan.registrySnapshot.acceptedRegistryEntries}`,
    `Public eligible / MMSI-linked vessels: ${plan.registrySnapshot.publicEligibleVessels}`,
    `Operators in matrix: ${plan.operators.length}`,
    `Direct include candidates: ${plan.directIncludeCandidates.length}`,
    `Scope-decision / partial-include candidates: ${plan.scopeDecisionCandidates.length}`,
    `Future/deferred candidates: ${plan.futureOrDeferredCandidates.length}`,
    `Out-of-scope candidates: ${plan.outOfScopeCandidates.length}`,
    `Duplicate/charter-risk candidates: ${plan.duplicateOrCharterRiskCandidates.length}`,
    `Database writes attempted: 0`,
    `Report: ${reportPath}`,
    `Evidence template: ${templates.evidenceTemplatePath}`,
    `Proposal template: ${templates.proposalTemplatePath}`
  ].join("\n") + "\n";
}

async function getScopeResearchOperatorCounts(db: RawDb) {
  const rows = await db.$queryRaw<Array<{ operator: string; accepted_count: number | bigint | string; public_eligible_count: number | bigint | string }>>`
    WITH accepted AS (
      SELECT id, imo, operator
      FROM cruise_vessel_registry_entries
      WHERE registry_decision = 'ACCEPT'
    ),
    public_eligible AS (
      SELECT DISTINCT r.operator, s.id AS ship_id
      FROM accepted r
      INNER JOIN cruise_vessel_verifications v ON v.registry_entry_id = r.id
      INNER JOIN cruise_ships s ON s.id = v.ship_id
      WHERE v.verification_status = 'VERIFIED_OCEAN_CRUISE'
        AND v.confidence = 'HIGH'
        AND r.imo = s.imo
        AND s.mmsi IS NOT NULL
    )
    SELECT
      a.operator,
      COUNT(DISTINCT a.id) AS accepted_count,
      COUNT(DISTINCT pe.ship_id) AS public_eligible_count
    FROM accepted a
    LEFT JOIN public_eligible pe ON pe.operator = a.operator
    GROUP BY a.operator
  `;
  return rows.map((row) => ({
    operator: row.operator,
    acceptedRegistryCount: Number(row.accepted_count ?? 0),
    publicEligibleCount: Number(row.public_eligible_count ?? 0)
  }));
}

function getOperatorGuidance(operator: string): OperatorGuidance {
  const commonEvidence = [
    "Official operator/fleet source proving active public cruise product membership.",
    "Independent exact IMO identity source for each vessel.",
    "Evidence that the vessel is active, not future, inactive, sold, laid-up or scrapped."
  ];
  const commonSources = [
    "Official operator fleet or ship pages.",
    "Official itinerary/product pages.",
    "Independent vessel identity sources such as Equasis, GISIS, MarineTraffic, VesselFinder or classification/fleet-register pages.",
    "Operator press releases or annual reports for active-service timing."
  ];
  const guidance: Record<string, OperatorGuidance> = {
    "Aqua Expeditions": {
      classification: "PARTIAL_INCLUDE",
      risk: "high",
      why: "Mixed/ambiguous portfolio; some products may be river or yacht-style expedition rather than commercial ocean cruise.",
      questions: ["Which vessels operate ocean or expedition itineraries?", "Are any vessels river-only or coastal transport-first?", "Can exact IMO identity be verified vessel by vessel?"],
      evidence: commonEvidence,
      sources: commonSources,
      impact: "Could add vessel-level inclusions only after each vessel passes ocean/expedition and IMO evidence checks."
    },
    "Adventure Canada": {
      classification: "PARTIAL_INCLUDE",
      risk: "high",
      why: "Likely charter/operator model; vessels may already be represented under another registry operator.",
      questions: ["Which vessels are currently chartered for public expedition cruise products?", "Are those vessels already included under their owner/operator?", "Would adding Adventure Canada double-count the same vessel?"],
      evidence: [...commonEvidence, "Charter/operator evidence that avoids duplicate registry ownership."],
      sources: commonSources,
      impact: "May add zero or a small number of vessels; high duplicate/charter risk."
    },
    "Poseidon Expeditions": {
      classification: "PARTIAL_INCLUDE",
      risk: "high",
      why: "Requires vessel-level review; chartered vessels may already appear under another expedition operator.",
      questions: ["Which vessels are active in current Poseidon products?", "Are vessels owned or chartered?", "Are exact IMO sources available and not already represented?"],
      evidence: [...commonEvidence, "Duplicate-check evidence against existing accepted registry entries."],
      sources: commonSources,
      impact: "Likely small vessel count; do not import without duplicate-risk review."
    },
    "Four Seasons Yachts": {
      classification: "DEFER",
      risk: "medium",
      why: "Luxury yacht-style cruise product with future/activation timing risk.",
      questions: ["Is the vessel active in public passenger service?", "Is exact IMO identity reliable?", "Is the product sold as scheduled commercial cruise service?"],
      evidence: [...commonEvidence, "Active-service evidence after launch, not just construction or future marketing."],
      sources: commonSources,
      impact: "Defer until active service is proven."
    },
    "HX / Hurtigruten Expeditions": {
      classification: "PARTIAL_INCLUDE",
      risk: "medium",
      why: "Expedition vessels are in scope; Norwegian coastal express transport-first ships are out of scope unless explicitly decided otherwise.",
      questions: ["Which vessels are HX expedition products?", "Which are coastal transport-first products?", "Are any records duplicated under Hurtigruten Coastal Express?"],
      evidence: commonEvidence,
      sources: commonSources,
      impact: "Add only expedition vessels; keep coastal express excluded."
    },
    "Lindblad Expeditions / National Geographic": {
      classification: "PARTIAL_INCLUDE",
      risk: "high",
      why: "Expedition fleet contains smaller, regional, Galapagos or charter-ambiguous vessels that need vessel-level ocean/expedition review.",
      questions: ["Which vessels are ocean/expedition and public commercial products?", "Which are non-ocean, river, regional or charter ambiguous?", "Can exact IMO be verified?"],
      evidence: commonEvidence,
      sources: commonSources,
      impact: "Could improve expedition coverage but should avoid non-ocean or duplicate inclusions."
    },
    "The Ritz-Carlton Yacht Collection": yachtStyleGuidance("Luxury yacht-style cruise vessels can be in scope if active and sold as public commercial ocean cruise products."),
    "SeaDream Yacht Club": yachtStyleGuidance("Yacht-style cruise vessels may be in scope, but the policy decision should be explicit."),
    "Scenic Luxury Cruises & Tours": yachtStyleGuidance("Scenic ocean/expedition yachts can be in scope; river cruise products must remain excluded."),
    "Emerald Cruises": yachtStyleGuidance("Emerald yacht/ocean products can be in scope; river cruise products must remain excluded.")
  };
  return (
    guidance[operator] ?? {
      classification: "PARTIAL_INCLUDE",
      risk: "medium",
      why: "Inventory marks this operator as partial or unresolved; vessel-level evidence is needed before any registry expansion.",
      questions: ["Which active vessels remain missing?", "Are they public commercial ocean or expedition cruise products?", "Can exact IMO identity be verified?"],
      evidence: commonEvidence,
      sources: commonSources,
      impact: "Could close registry completeness gaps after manual verification."
    }
  );
}

function yachtStyleGuidance(why: string): OperatorGuidance {
  return {
    classification: "PARTIAL_INCLUDE" as const,
    risk: "medium" as const,
    why,
    questions: ["Is the product scheduled and publicly bookable?", "Is the vessel active?", "Is the exact IMO independently verifiable?", "Is it distinct from private yacht use?"],
    evidence: [
      "Official operator ship/product page proving public commercial cruise service.",
      "Independent exact IMO identity source.",
      "Active-service evidence and non-private-use evidence."
    ],
    sources: [
      "Official operator ship pages.",
      "Official itinerary pages.",
      "Independent vessel identity sources such as Equasis, GISIS, MarineTraffic or VesselFinder."
    ],
    impact: "May add yacht-style public cruise vessels, but only after explicit vessel-level verification."
  };
}

function estimatePossibleAdditions(operator: string, inventory: InventoryReviewRow | undefined, acceptedRegistryCount: number) {
  if (!inventory) return SCOPE_RESEARCH_OPERATORS.includes(operator as (typeof SCOPE_RESEARCH_OPERATORS)[number]) ? 1 : 0;
  const fleetGap = inventory.officialFleetCount === null ? 0 : Math.max(0, inventory.officialFleetCount - acceptedRegistryCount - inventory.excludedCount);
  return Math.max(0, inventory.unresolvedCount, inventory.thirdWaveReadyCount, fleetGap);
}

function categorySort(row: ScopeResearchOperatorRow) {
  if (row.likelyScopeClassification === "INCLUDE") return 0;
  if (row.likelyScopeClassification === "PARTIAL_INCLUDE") return 1;
  if (row.likelyScopeClassification === "DEFER") return 2;
  return 3;
}

function writeTemplateIfMissing(path: string, columns: readonly string[]) {
  if (existsSync(path)) return;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${columns.join(",")}\n`, "utf8");
}

function formatOperatorDetail(row: ScopeResearchOperatorRow) {
  return [
    `### ${row.operator}`,
    "",
    `- Current inventory status: ${row.currentStatus}`,
    `- Current registry / public eligible: ${row.acceptedRegistryCount} / ${row.publicEligibleCount}`,
    `- Likely scope classification: ${row.likelyScopeClassification}`,
    `- Risk level: ${row.riskLevel}`,
    `- Estimated possible vessels to add: ${row.estimatedPossibleVesselsToAdd}`,
    `- Why ambiguous or partial: ${row.whyAmbiguousOrPartial}`,
    `- Expected decision impact: ${row.expectedDecisionImpact}`,
    "- Research questions:",
    ...row.researchQuestions.map((question) => `  - ${question}`),
    "- Required evidence:",
    ...row.requiredEvidence.map((evidence) => `  - ${evidence}`),
    "- Recommended manual sources:",
    ...row.recommendedSources.map((source) => `  - ${source}`),
    ""
  ];
}

function bucketRows(rows: ScopeResearchOperatorRow[]) {
  return markdownRows(
    ["Operator", "Classification", "Risk", "Possible adds", "Reason"],
    rows.map((row) => [
      row.operator,
      row.likelyScopeClassification,
      row.riskLevel,
      row.estimatedPossibleVesselsToAdd,
      row.whyAmbiguousOrPartial
    ])
  );
}

function markdownRows(headers: string[], rows: Array<Array<string | number>>) {
  if (!rows.length) return "_None._";
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map((value) => escapeMarkdownCell(String(value))).join(" | ")} |`)
  ].join("\n");
}

function escapeMarkdownCell(value: string) {
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}
