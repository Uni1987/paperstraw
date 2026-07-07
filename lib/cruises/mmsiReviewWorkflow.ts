import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isValidImoWithChecksum } from "@/lib/cruises/registry";

export const MMSI_REVIEW_APPROVAL_MARKER = "[APPROVED_MMSI_LINK]";
export const MMSI_REVIEW_APPLIED_MARKER = "[APPLIED_MMSI_LINK]";
export const MMSI_REVIEW_DISMISSAL_MARKER = "[DISMISSED_MMSI_LINK]";
export const MMSI_REVIEW_REQUIRED_DATABASE_TARGET = "cruises-dev";
export const MMSI_REVIEW_ALLOWED_WORKER_ENVS = ["development", "railway-development"] as const;

export type MmsiReviewStatusFilter = "pending" | "reviewed" | "dismissed" | "all";
export type MmsiReviewFormat = "terminal" | "json" | "markdown";
export type MmsiReviewAction =
  | { kind: "list" }
  | { kind: "approve"; queueId: string; note: string }
  | { kind: "dismiss"; queueId: string; note: string }
  | { kind: "apply-approved"; dryRun: boolean; confirm: boolean };

export type MmsiReviewOptions = {
  action: MmsiReviewAction;
  status: MmsiReviewStatusFilter;
  limit: number;
  format: MmsiReviewFormat;
  output: string | null;
  force: boolean;
  includeIdentifiers: boolean;
};

export type MmsiReviewRow = {
  id: string;
  registryEntryId: string;
  observedMmsi: string;
  classification: string;
  reviewStatus: string;
  occurrenceCount: number;
  firstSeenAt: Date;
  lastSeenAt: Date;
  resolvedAt: Date | null;
  resolutionNotes: string | null;
  registryName: string | null;
  registryOperator: string | null;
  registryImo: string | null;
  registryDecision: string | null;
  linkedMmsi: string | null;
  observedMmsiLinkedElsewhere: boolean;
  hasUnresolvedConflict: boolean;
  targetShipCount: number;
  targetShipId: string | null;
  targetShipMmsi: string | null;
};

export type MmsiReviewListReport = {
  generatedAt: string;
  status: MmsiReviewStatusFilter;
  totalRows: number;
  includeIdentifiers: boolean;
  rows: MmsiReviewRow[];
};

export type MmsiReviewActionResult = {
  action: string;
  queueId?: string;
  status: "approved" | "dismissed" | "skipped" | "failed";
  message: string;
  databaseTarget?: string;
};

export type MmsiApplyApprovedResult = {
  mode: "dry-run" | "confirm";
  databaseTarget?: string;
  rowsConsidered: number;
  applied: number;
  wouldApply: number;
  skipped: Array<{ queueId: string; reason: string }>;
  skippedByReason: Record<string, number>;
  followUpCommand: string;
};

export type MmsiApplyPlan =
  | { action: "update-existing-identity"; shipId: string }
  | { action: "create-registry-linked-identity" };

export type MmsiReviewApplyDiagnosticRow = {
  queueId: string;
  registryImo: string | null;
  observedMmsi: string;
  reviewStatus: string;
  queueState: string;
  registryHasLinkedMmsi: boolean;
  cruiseIdentityHasMmsi: boolean;
  verificationState: "eligible" | "missing" | "not-high-confidence" | "wrong-registry" | "wrong-status";
  publicEligible: boolean;
  reason: string | null;
};

export type MmsiReviewApplyDiagnosticsReport = {
  generatedAt: string;
  status: MmsiReviewStatusFilter;
  totalRows: number;
  inconsistentAppliedRows: number;
  rows: MmsiReviewApplyDiagnosticRow[];
};

export type MmsiReviewRepairPlan = {
  mode: "dry-run";
  generatedAt: string;
  rowsConsidered: number;
  wouldRepair: number;
  skipped: Array<{ queueId: string; reason: string }>;
  skippedByReason: Record<string, number>;
  databaseWritesAttempted: 0;
  followUp: string;
};

type MmsiReviewSqlRow = {
  id: string;
  registryEntryId: string;
  observedMmsi: string;
  classification: string;
  reviewStatus: string;
  occurrenceCount: number | bigint;
  firstSeenAt: Date;
  lastSeenAt: Date;
  resolvedAt: Date | null;
  resolutionNotes: string | null;
  registryName: string | null;
  registryOperator: string | null;
  registryImo: string | null;
  registryDecision: string | null;
  linkedMmsi: string | null;
  observedMmsiLinkedElsewhere: boolean;
  hasUnresolvedConflict: boolean;
  targetShipCount: number | bigint;
  targetShipId: string | null;
  targetShipMmsi: string | null;
};

type MmsiReviewDbClient = typeof prisma | Prisma.TransactionClient;

type MmsiReviewDiagnosticSqlRow = {
  queue_id: string;
  registry_imo: string | null;
  observed_mmsi: string;
  review_status: string;
  queue_state: string;
  registry_has_linked_mmsi: boolean;
  cruise_identity_has_mmsi: boolean;
  verification_status: string | null;
  confidence: string | null;
  verification_registry_entry_id: string | null;
  public_eligible: boolean;
};

export function parseMmsiReviewArgs(args: string[]): MmsiReviewOptions {
  const options: MmsiReviewOptions = {
    action: { kind: "list" },
    status: "pending",
    limit: 50,
    format: "terminal",
    output: null,
    force: false,
    includeIdentifiers: false
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--") continue;
    if (arg === "--status") {
      options.status = parseStatus(args[index + 1]);
      index += 1;
      continue;
    }
    if (arg === "--limit") {
      const value = Number(args[index + 1]);
      if (!Number.isInteger(value) || value <= 0) throw new Error("--limit requires a positive integer.");
      options.limit = value;
      index += 1;
      continue;
    }
    if (arg === "--format") {
      options.format = parseFormat(args[index + 1]);
      index += 1;
      continue;
    }
    if (arg === "--output") {
      const output = args[index + 1];
      if (!output) throw new Error("--output requires a path.");
      options.output = output;
      index += 1;
      continue;
    }
    if (arg === "--force") {
      options.force = true;
      continue;
    }
    if (arg === "--include-identifiers") {
      options.includeIdentifiers = true;
      continue;
    }
    if (arg === "--approve") {
      const queueId = args[index + 1];
      if (!queueId) throw new Error("--approve requires a queue id.");
      const noteResult = readRequiredNote(args, index + 2);
      options.action = { kind: "approve", queueId, note: noteResult.note };
      index = noteResult.nextIndex;
      continue;
    }
    if (arg === "--dismiss") {
      const queueId = args[index + 1];
      if (!queueId) throw new Error("--dismiss requires a queue id.");
      const noteResult = readRequiredNote(args, index + 2);
      options.action = { kind: "dismiss", queueId, note: noteResult.note };
      index = noteResult.nextIndex;
      continue;
    }
    if (arg === "--apply-approved") {
      options.action = { kind: "apply-approved", dryRun: true, confirm: false };
      continue;
    }
    if (arg === "--dry-run") {
      if (options.action.kind === "apply-approved") options.action = { ...options.action, dryRun: true, confirm: false };
      continue;
    }
    if (arg === "--confirm") {
      if (options.action.kind === "apply-approved") options.action = { ...options.action, dryRun: false, confirm: true };
      continue;
    }
    if (arg === "--note") throw new Error("--note must be used with --approve or --dismiss.");
    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

export function assertMmsiReviewMutationTarget(env: Record<string, string | undefined> = process.env) {
  const workerEnv = env.CRUISE_WORKER_ENV?.trim();
  const target = env.CRUISE_WORKER_DATABASE_TARGET?.trim();
  if (!workerEnv) throw new Error("Missing CRUISE_WORKER_ENV. Refusing to mutate MMSI review records.");
  if (!(MMSI_REVIEW_ALLOWED_WORKER_ENVS as readonly string[]).includes(workerEnv)) {
    throw new Error("MMSI review mutations are only allowed with CRUISE_WORKER_ENV=development or railway-development.");
  }
  if (target !== MMSI_REVIEW_REQUIRED_DATABASE_TARGET) {
    throw new Error("MMSI review mutations require CRUISE_WORKER_DATABASE_TARGET=cruises-dev.");
  }
  return { workerEnv, databaseTarget: target };
}

export function evaluateMmsiCandidateForApproval(row: MmsiReviewRow) {
  if (row.classification !== "NEW_MMSI_CANDIDATE_FOR_EXISTING_REGISTRY_ENTRY") return "wrong classification";
  if (row.reviewStatus !== "PENDING") return "queue record is not pending";
  if (row.registryDecision !== "ACCEPT") return "registry decision is not ACCEPT";
  if (!row.registryImo || !isValidImoWithChecksum(row.registryImo)) return "registry IMO exact-match requirement is absent";
  if (!isValidMmsi(row.observedMmsi)) return "observed MMSI is invalid";
  if (row.linkedMmsi && row.linkedMmsi !== row.observedMmsi) return "registry entry already has a different linked MMSI";
  if (row.observedMmsiLinkedElsewhere) return "observed MMSI is already linked elsewhere";
  if (row.hasUnresolvedConflict) return "unresolved MMSI conflict exists";
  return null;
}

export function getApprovedCandidateApplyPlan(row: MmsiReviewRow): MmsiApplyPlan | string {
  if (row.classification !== "NEW_MMSI_CANDIDATE_FOR_EXISTING_REGISTRY_ENTRY") return "wrong classification";
  if (row.reviewStatus !== "REVIEWED") return "not approved";
  if (isAppliedReviewNote(row.resolutionNotes)) return "already applied";
  if (!isApprovedReviewNote(row.resolutionNotes)) return "not explicitly approved";
  if (!hasApprovalNoteText(row.resolutionNotes)) return "missing approval note";
  if (row.registryDecision !== "ACCEPT") return "registry decision is not ACCEPT";
  if (!row.registryImo || !isValidImoWithChecksum(row.registryImo)) return "identity validation failed";
  if (!isValidMmsi(row.observedMmsi)) return "identity validation failed";
  if (row.linkedMmsi === row.observedMmsi) return "registry entry already linked to observed MMSI";
  if (row.linkedMmsi && row.linkedMmsi !== row.observedMmsi) return "registry entry already linked";
  if (row.observedMmsiLinkedElsewhere) return "observed MMSI linked elsewhere";
  if (row.hasUnresolvedConflict) return "unresolved conflict";
  if (row.targetShipCount > 1) return "multiple existing cruise identity records for registry IMO";
  if (row.targetShipMmsi && row.targetShipMmsi !== row.observedMmsi) return "target ship already has a different MMSI";
  if (row.targetShipCount === 1 && row.targetShipId) return { action: "update-existing-identity", shipId: row.targetShipId };
  if (row.targetShipCount === 0) return { action: "create-registry-linked-identity" };
  return "expected an existing identity row or registry-backed identity creation";
}

export function evaluateApprovedCandidateForApply(row: MmsiReviewRow) {
  const plan = getApprovedCandidateApplyPlan(row);
  if (typeof plan === "string") return plan;
  return null;
}

export function isApprovedReviewNote(value: string | null | undefined) {
  return Boolean(value?.includes(MMSI_REVIEW_APPROVAL_MARKER));
}

export function isAppliedReviewNote(value: string | null | undefined) {
  return Boolean(value?.includes(MMSI_REVIEW_APPLIED_MARKER));
}

export function isDismissedReviewNote(value: string | null | undefined) {
  return Boolean(value?.includes(MMSI_REVIEW_DISMISSAL_MARKER));
}

export function buildApprovalResolutionNote(note: string, now = new Date()) {
  return `${MMSI_REVIEW_APPROVAL_MARKER} ${now.toISOString()} ${sanitizeNote(note)}`;
}

export function buildDismissalResolutionNote(note: string, now = new Date()) {
  return `${MMSI_REVIEW_DISMISSAL_MARKER} ${now.toISOString()} ${sanitizeNote(note)}`;
}

export function buildAppliedResolutionNote(existing: string | null, now = new Date()) {
  const base = existing?.trim() ?? "";
  const applied = `${MMSI_REVIEW_APPLIED_MARKER} ${now.toISOString()} MMSI link applied to existing cruise identity record.`;
  return base ? `${base}\n${applied}` : applied;
}

export function formatMmsiReviewReport(report: MmsiReviewListReport, format: MmsiReviewFormat) {
  if (format === "json") return JSON.stringify(toSerializableReviewReport(report), null, 2) + "\n";
  if (format === "markdown") return formatMmsiReviewMarkdown(report);
  return formatMmsiReviewTerminal(report);
}

export function formatMmsiReviewActionResult(result: MmsiReviewActionResult | MmsiApplyApprovedResult, format: MmsiReviewFormat) {
  if (format === "json") return JSON.stringify(result, null, 2) + "\n";
  if ("followUpCommand" in result) {
    const lines = [
      "# MMSI Review Apply",
      "",
      `- Mode: ${result.mode}`,
      ...(result.databaseTarget ? [`- Database target: ${result.databaseTarget}`] : []),
      `- Rows considered: ${result.rowsConsidered}`,
      `- Applied: ${result.applied}`,
      `- Would apply: ${result.wouldApply}`,
      `- Skipped: ${result.skipped.length}`,
      "",
      "Skip reasons:",
      ...formatSkipReasons(result.skippedByReason),
      "",
      "Skipped rows:",
      ...formatSkippedRows(result.skipped),
      "",
      "Follow-up:",
      "",
      `\`${result.followUpCommand}\``
    ];
    return lines.join("\n") + "\n";
  }
  return [
    `Action: ${result.action}`,
    `Status: ${result.status}`,
    ...(result.databaseTarget ? [`Database target: ${result.databaseTarget}`] : []),
    `Message: ${result.message}`
  ].join("\n") + "\n";
}

export function formatMmsiReviewDiagnosticsReport(report: MmsiReviewApplyDiagnosticsReport, format: MmsiReviewFormat) {
  if (format === "json") return JSON.stringify(report, null, 2) + "\n";
  if (format === "markdown") {
    return [
      "# Cruise MMSI Review Apply Diagnostics",
      "",
      `- Generated: ${report.generatedAt}`,
      `- Status filter: ${report.status}`,
      `- Rows: ${report.totalRows}`,
      `- Inconsistent applied rows: ${report.inconsistentAppliedRows}`,
      "",
      toMarkdownTable(
        ["Queue ID", "Registry IMO", "Observed MMSI", "State", "Registry link", "Identity link", "Verification", "Public eligible", "Reason"],
        report.rows.map((row) => [
          row.queueId,
          row.registryImo ?? "Unknown",
          row.observedMmsi,
          row.queueState,
          row.registryHasLinkedMmsi ? "yes" : "no",
          row.cruiseIdentityHasMmsi ? "yes" : "no",
          row.verificationState,
          row.publicEligible ? "yes" : "no",
          row.reason ?? "none"
        ])
      ),
      ""
    ].join("\n");
  }
  return [
    "Cruise MMSI review apply diagnostics",
    `Generated: ${report.generatedAt}`,
    `Status filter: ${report.status}`,
    `Rows: ${report.totalRows}`,
    `Inconsistent applied rows: ${report.inconsistentAppliedRows}`,
    "",
    ...report.rows.flatMap((row, index) => [
      `${index + 1}. ${row.queueId}`,
      `   registry IMO: ${row.registryImo ?? "Unknown"}`,
      `   observed MMSI: ${row.observedMmsi}`,
      `   review status: ${row.reviewStatus}`,
      `   queue state: ${row.queueState}`,
      `   registry-level MMSI linkage: ${row.registryHasLinkedMmsi ? "yes" : "no"}`,
      `   cruise identity MMSI linkage: ${row.cruiseIdentityHasMmsi ? "yes" : "no"}`,
      `   verification state: ${row.verificationState}`,
      `   public eligible: ${row.publicEligible ? "yes" : "no"}`,
      `   reason: ${row.reason ?? "none"}`,
      ""
    ])
  ].join("\n");
}

export function formatMmsiReviewRepairPlan(plan: MmsiReviewRepairPlan, format: MmsiReviewFormat) {
  if (format === "json") return JSON.stringify(plan, null, 2) + "\n";
  const lines = [
    "Cruise MMSI applied-link repair plan",
    `Generated: ${plan.generatedAt}`,
    `Mode: ${plan.mode}`,
    `Rows considered: ${plan.rowsConsidered}`,
    `Would repair: ${plan.wouldRepair}`,
    `Skipped: ${plan.skipped.length}`,
    `Database writes attempted: ${plan.databaseWritesAttempted}`,
    "",
    "Skip reasons:",
    ...formatSkipReasons(plan.skippedByReason),
    "",
    "Skipped rows:",
    ...formatSkippedRows(plan.skipped),
    "",
    plan.followUp
  ];
  if (format === "markdown") {
    return [
      "# Cruise MMSI Applied-Link Repair Plan",
      "",
      `- Generated: ${plan.generatedAt}`,
      `- Mode: ${plan.mode}`,
      `- Rows considered: ${plan.rowsConsidered}`,
      `- Would repair: ${plan.wouldRepair}`,
      `- Database writes attempted: ${plan.databaseWritesAttempted}`,
      "",
      "Skip reasons:",
      ...formatSkipReasons(plan.skippedByReason),
      "",
      "Skipped rows:",
      ...formatSkippedRows(plan.skipped),
      "",
      plan.followUp,
      ""
    ].join("\n");
  }
  return `${lines.join("\n")}\n`;
}

export async function writeMmsiReviewOutput(path: string, content: string, force = false) {
  const outputPath = resolve(path);
  if (!force && existsSync(outputPath)) throw new Error(`Output file already exists: ${outputPath}. Use --force to overwrite.`);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, content, "utf8");
}

export async function listMmsiReviewCandidates(options: Pick<MmsiReviewOptions, "status" | "limit">): Promise<MmsiReviewListReport> {
  const rows = await fetchReviewRows(options.status, options.limit);
  return {
    generatedAt: new Date().toISOString(),
    status: options.status,
    totalRows: rows.length,
    includeIdentifiers: false,
    rows
  };
}

export async function approveMmsiReviewCandidate(queueId: string, note: string, env: Record<string, string | undefined> = process.env): Promise<MmsiReviewActionResult> {
  const target = assertMmsiReviewMutationTarget(env);
  const row = await fetchReviewRowById(queueId);
  if (!row) return { action: "approve", queueId, status: "failed", message: "Queue record not found.", databaseTarget: target.databaseTarget };
  const issue = evaluateMmsiCandidateForApproval(row);
  if (issue) return { action: "approve", queueId, status: "failed", message: `Approval refused: ${issue}.`, databaseTarget: target.databaseTarget };
  await prisma.cruiseStaticDataReviewQueue.update({
    where: { id: queueId },
    data: {
      reviewStatus: "REVIEWED",
      resolvedAt: new Date(),
      resolutionNotes: buildApprovalResolutionNote(note)
    }
  });
  return { action: "approve", queueId, status: "approved", message: "Candidate approved for later explicit apply. MMSI was not linked.", databaseTarget: target.databaseTarget };
}

export async function dismissMmsiReviewCandidate(queueId: string, note: string, env: Record<string, string | undefined> = process.env): Promise<MmsiReviewActionResult> {
  const target = assertMmsiReviewMutationTarget(env);
  const row = await fetchReviewRowById(queueId);
  if (!row) return { action: "dismiss", queueId, status: "failed", message: "Queue record not found.", databaseTarget: target.databaseTarget };
  if (row.reviewStatus !== "PENDING") return { action: "dismiss", queueId, status: "failed", message: "Dismissal refused: queue record is not pending.", databaseTarget: target.databaseTarget };
  await prisma.cruiseStaticDataReviewQueue.update({
    where: { id: queueId },
    data: {
      reviewStatus: "DISMISSED",
      resolvedAt: new Date(),
      resolutionNotes: buildDismissalResolutionNote(note)
    }
  });
  return { action: "dismiss", queueId, status: "dismissed", message: "Candidate dismissed. No registry or cruise identity data changed.", databaseTarget: target.databaseTarget };
}

export async function applyApprovedMmsiReviewCandidates(options: { confirm: boolean; env?: Record<string, string | undefined> }): Promise<MmsiApplyApprovedResult> {
  const target = options.confirm ? assertMmsiReviewMutationTarget(options.env ?? process.env) : null;
  const rows = await fetchReviewRows("reviewed", 10000);
  const result: MmsiApplyApprovedResult = {
    mode: options.confirm ? "confirm" : "dry-run",
    databaseTarget: target?.databaseTarget,
    rowsConsidered: rows.length,
    applied: 0,
    wouldApply: 0,
    skipped: [],
    skippedByReason: {},
    followUpCommand: "pnpm cruises:registry:reconcile -- --dry-run"
  };

  for (const row of rows) {
    const plan = getApprovedCandidateApplyPlan(row);
    if (typeof plan === "string") {
      addApplySkip(result, row.id, plan);
      continue;
    }
    if (!options.confirm) {
      result.wouldApply += 1;
      continue;
    }
    const applied = await applySingleApprovedMmsi(row.id);
    if (applied.applied) result.applied += 1;
    else addApplySkip(result, row.id, applied.reason);
  }

  return result;
}

export async function diagnoseMmsiReviewApplyConsistency(options: { status: MmsiReviewStatusFilter; limit: number }): Promise<MmsiReviewApplyDiagnosticsReport> {
  const rows = await fetchReviewDiagnosticsRows(options.status, options.limit);
  return {
    generatedAt: new Date().toISOString(),
    status: options.status,
    totalRows: rows.length,
    inconsistentAppliedRows: rows.filter((row) => row.queueState === "applied" && !row.publicEligible).length,
    rows
  };
}

export async function planAppliedMmsiLinkRepair(): Promise<MmsiReviewRepairPlan> {
  const report = await diagnoseMmsiReviewApplyConsistency({ status: "reviewed", limit: 10000 });
  const plan: MmsiReviewRepairPlan = {
    mode: "dry-run",
    generatedAt: new Date().toISOString(),
    rowsConsidered: report.rows.length,
    wouldRepair: 0,
    skipped: [],
    skippedByReason: {},
    databaseWritesAttempted: 0,
    followUp: "No confirm mode is implemented. Review this plan before designing a separately tested repair apply command."
  };

  for (const row of report.rows) {
    if (row.queueState !== "applied") {
      addRepairSkip(plan, row.queueId, "not applied");
      continue;
    }
    if (row.publicEligible) {
      addRepairSkip(plan, row.queueId, "already public eligible");
      continue;
    }
    if (!row.cruiseIdentityHasMmsi) {
      addRepairSkip(plan, row.queueId, "missing cruise identity MMSI link");
      continue;
    }
    if (!isVerificationRepairCandidate(row.verificationState)) {
      addRepairSkip(plan, row.queueId, row.reason ?? "not safely repairable by verification creation");
      continue;
    }
    plan.wouldRepair += 1;
  }

  return plan;
}

async function applySingleApprovedMmsi(queueId: string) {
  try {
    return await prisma.$transaction(async (tx) => {
      const row = await fetchReviewRowById(queueId, tx);
      if (!row) return { applied: false, reason: "queue record no longer exists" };
      const plan = getApprovedCandidateApplyPlan(row);
      if (typeof plan === "string") return { applied: false, reason: plan };
      if (plan.action === "update-existing-identity") {
        const updated = await tx.cruiseShip.updateMany({
          where: { id: plan.shipId, OR: [{ mmsi: null }, { mmsi: row.observedMmsi }] },
          data: { mmsi: row.observedMmsi }
        });
        if (updated.count !== 1) return { applied: false, reason: "target ship MMSI changed before apply" };
        await ensureApprovedMmsiLinkState(tx, row, plan.shipId, queueId);
      } else {
        const ship = await tx.cruiseShip.create({
          data: {
            imo: row.registryImo as string,
            mmsi: row.observedMmsi,
            name: row.registryName ?? `Verified cruise ${row.registryImo as string}`,
            operator: row.registryOperator,
            shipType: "Ocean cruise ship",
            source: "CRUISE_STATIC_DATA_REVIEW_QUEUE"
          },
          select: { id: true }
        });
        await tx.cruiseVesselVerification.create({
          data: {
            shipId: ship.id,
            registryEntryId: row.registryEntryId,
            verificationStatus: "VERIFIED_OCEAN_CRUISE",
            confidence: "HIGH",
            decisionSource: "STATIC_DATA_REVIEW_QUEUE_APPROVED_MMSI",
            evidence: {
              queueRecordId: queueId,
              source: "GLOBAL_LOCAL_FILTER",
              method: "exact accepted registry IMO with explicit MMSI review approval"
            },
            assessedAt: new Date()
          }
        });
        await verifyAppliedMmsiLinkState(tx, row, ship.id);
      }
      await tx.cruiseStaticDataReviewQueue.update({
        where: { id: queueId },
        data: {
          resolvedAt: new Date(),
          resolutionNotes: buildAppliedResolutionNote(row.resolutionNotes)
        }
      });
      return { applied: true, reason: "applied" };
    });
  } catch {
    return { applied: false, reason: "database constraint prevented MMSI link" };
  }
}

async function ensureApprovedMmsiLinkState(tx: Prisma.TransactionClient, row: MmsiReviewRow, shipId: string, queueId: string) {
  await tx.cruiseVesselVerification.upsert({
    where: { shipId },
    create: {
      shipId,
      registryEntryId: row.registryEntryId,
      verificationStatus: "VERIFIED_OCEAN_CRUISE",
      confidence: "HIGH",
      decisionSource: "STATIC_DATA_REVIEW_QUEUE_APPROVED_MMSI",
      evidence: {
        queueRecordId: queueId,
        source: "GLOBAL_LOCAL_FILTER",
        method: "exact accepted registry IMO with explicit MMSI review approval"
      },
      assessedAt: new Date()
    },
    update: {
      registryEntryId: row.registryEntryId,
      verificationStatus: "VERIFIED_OCEAN_CRUISE",
      confidence: "HIGH",
      decisionSource: "STATIC_DATA_REVIEW_QUEUE_APPROVED_MMSI",
      evidence: {
        queueRecordId: queueId,
        source: "GLOBAL_LOCAL_FILTER",
        method: "exact accepted registry IMO with explicit MMSI review approval"
      },
      assessedAt: new Date()
    }
  });
  await verifyAppliedMmsiLinkState(tx, row, shipId);
}

async function verifyAppliedMmsiLinkState(tx: Prisma.TransactionClient, row: MmsiReviewRow, shipId: string) {
  const linkedRows = await tx.$queryRaw<Array<{ ok: boolean }>>`
    SELECT EXISTS (
      SELECT 1
      FROM cruise_ships s
      INNER JOIN cruise_vessel_verifications v ON v.ship_id = s.id
      INNER JOIN cruise_vessel_registry_entries r ON r.id = v.registry_entry_id
      WHERE s.id = ${shipId}
        AND s.imo = ${row.registryImo}
        AND s.mmsi = ${row.observedMmsi}
        AND v.registry_entry_id = ${row.registryEntryId}
        AND v.verification_status = 'VERIFIED_OCEAN_CRUISE'
        AND v.confidence = 'HIGH'
        AND r.registry_decision = 'ACCEPT'
        AND r.imo = s.imo
    ) AS ok
  `;
  if (!linkedRows[0]?.ok) throw new Error("MMSI apply did not produce a public-eligible registry linkage.");
}

function addApplySkip(result: MmsiApplyApprovedResult, queueId: string, reason: string) {
  result.skipped.push({ queueId, reason });
  result.skippedByReason[reason] = (result.skippedByReason[reason] ?? 0) + 1;
}

function addRepairSkip(result: MmsiReviewRepairPlan, queueId: string, reason: string) {
  result.skipped.push({ queueId, reason });
  result.skippedByReason[reason] = (result.skippedByReason[reason] ?? 0) + 1;
}

async function fetchReviewRowById(queueId: string, tx: MmsiReviewDbClient = prisma) {
  const rows = await fetchReviewRows("all", 1, queueId, tx);
  return rows[0] ?? null;
}

async function fetchReviewRows(status: MmsiReviewStatusFilter, limit: number, queueId?: string, tx: MmsiReviewDbClient = prisma): Promise<MmsiReviewRow[]> {
  const statusSql = status === "all" ? null : status.toUpperCase();
  const rows = await tx.$queryRaw<MmsiReviewSqlRow[]>`
    SELECT
      q.id,
      q.registry_entry_id AS "registryEntryId",
      q.observed_mmsi AS "observedMmsi",
      q.classification::text AS "classification",
      q.review_status::text AS "reviewStatus",
      q.occurrence_count AS "occurrenceCount",
      q.first_seen_at AS "firstSeenAt",
      q.last_seen_at AS "lastSeenAt",
      q.resolved_at AS "resolvedAt",
      q.resolution_notes AS "resolutionNotes",
      r.canonical_name AS "registryName",
      r.operator AS "registryOperator",
      r.imo AS "registryImo",
      r.registry_decision::text AS "registryDecision",
      (
        SELECT s.mmsi
        FROM cruise_ships s
        INNER JOIN cruise_vessel_verifications v ON v.ship_id = s.id
        WHERE v.registry_entry_id = q.registry_entry_id
          AND s.mmsi IS NOT NULL
        LIMIT 1
      ) AS "linkedMmsi",
      EXISTS (
        SELECT 1
        FROM cruise_ships s
        INNER JOIN cruise_vessel_verifications v ON v.ship_id = s.id
        INNER JOIN cruise_vessel_registry_entries other_r ON other_r.id = v.registry_entry_id
        WHERE s.mmsi = q.observed_mmsi
          AND other_r.registry_decision = 'ACCEPT'
          AND other_r.id <> q.registry_entry_id
      ) AS "observedMmsiLinkedElsewhere",
      EXISTS (
        SELECT 1
        FROM cruise_static_data_review_queue conflict_q
        WHERE conflict_q.classification = 'MMSI_CONFLICT_REVIEW_REQUIRED'
          AND conflict_q.review_status <> 'DISMISSED'
          AND conflict_q.id <> q.id
          AND (
            conflict_q.registry_entry_id = q.registry_entry_id
            OR conflict_q.observed_mmsi = q.observed_mmsi
          )
      ) AS "hasUnresolvedConflict",
      (
        SELECT COUNT(*)::int
        FROM cruise_ships target_s
        WHERE target_s.imo = r.imo
      ) AS "targetShipCount",
      (
        SELECT target_s.id
        FROM cruise_ships target_s
        WHERE target_s.imo = r.imo
        ORDER BY target_s.updated_at DESC
        LIMIT 1
      ) AS "targetShipId",
      (
        SELECT target_s.mmsi
        FROM cruise_ships target_s
        WHERE target_s.imo = r.imo
        ORDER BY target_s.updated_at DESC
        LIMIT 1
      ) AS "targetShipMmsi"
    FROM cruise_static_data_review_queue q
    INNER JOIN cruise_vessel_registry_entries r ON r.id = q.registry_entry_id
    WHERE (${statusSql}::text IS NULL OR q.review_status::text = ${statusSql})
      AND (${queueId ?? null}::text IS NULL OR q.id = ${queueId ?? null})
    ORDER BY q.last_seen_at DESC
    LIMIT ${limit}
  `;
  return rows.map(normalizeReviewRow);
}

async function fetchReviewDiagnosticsRows(status: MmsiReviewStatusFilter, limit: number): Promise<MmsiReviewApplyDiagnosticRow[]> {
  const statusSql = status === "all" ? null : status.toUpperCase();
  const rows = await prisma.$queryRaw<MmsiReviewDiagnosticSqlRow[]>`
    SELECT
      q.id AS queue_id,
      r.imo AS registry_imo,
      q.observed_mmsi,
      q.review_status::text,
      CASE
        WHEN q.resolution_notes LIKE ${`%${MMSI_REVIEW_APPLIED_MARKER}%`} THEN 'applied'
        WHEN q.resolution_notes LIKE ${`%${MMSI_REVIEW_APPROVAL_MARKER}%`} THEN 'approved-not-applied'
        WHEN q.resolution_notes LIKE ${`%${MMSI_REVIEW_DISMISSAL_MARKER}%`} THEN 'dismissed'
        ELSE lower(q.review_status::text)
      END AS queue_state,
      EXISTS (
        SELECT 1
        FROM cruise_ships s
        INNER JOIN cruise_vessel_verifications v ON v.ship_id = s.id
        WHERE v.registry_entry_id = q.registry_entry_id
          AND s.mmsi = q.observed_mmsi
          AND s.imo = r.imo
      ) AS registry_has_linked_mmsi,
      EXISTS (
        SELECT 1
        FROM cruise_ships s
        WHERE s.imo = r.imo
          AND s.mmsi = q.observed_mmsi
      ) AS cruise_identity_has_mmsi,
      v.verification_status::text,
      v.confidence::text,
      v.registry_entry_id AS verification_registry_entry_id,
      EXISTS (
        SELECT 1
        FROM cruise_ships s
        INNER JOIN cruise_vessel_verifications public_v ON public_v.ship_id = s.id
        INNER JOIN cruise_vessel_registry_entries public_r ON public_r.id = public_v.registry_entry_id
        WHERE public_v.registry_entry_id = q.registry_entry_id
          AND s.imo = r.imo
          AND s.mmsi = q.observed_mmsi
          AND public_v.verification_status = 'VERIFIED_OCEAN_CRUISE'
          AND public_v.confidence = 'HIGH'
          AND public_r.registry_decision = 'ACCEPT'
          AND public_r.imo = s.imo
      ) AS public_eligible
    FROM cruise_static_data_review_queue q
    INNER JOIN cruise_vessel_registry_entries r ON r.id = q.registry_entry_id
    LEFT JOIN cruise_ships s ON s.imo = r.imo AND s.mmsi = q.observed_mmsi
    LEFT JOIN cruise_vessel_verifications v ON v.ship_id = s.id
    WHERE (${statusSql}::text IS NULL OR q.review_status::text = ${statusSql})
    ORDER BY q.last_seen_at DESC
    LIMIT ${limit}
  `;
  return rows.map(normalizeDiagnosticRow);
}

function normalizeDiagnosticRow(row: MmsiReviewDiagnosticSqlRow): MmsiReviewApplyDiagnosticRow {
  const verificationState = getVerificationState(row);
  const reason = getApplyDiagnosticReason(row, verificationState);
  return {
    queueId: row.queue_id,
    registryImo: row.registry_imo,
    observedMmsi: row.observed_mmsi,
    reviewStatus: row.review_status,
    queueState: row.queue_state,
    registryHasLinkedMmsi: row.registry_has_linked_mmsi,
    cruiseIdentityHasMmsi: row.cruise_identity_has_mmsi,
    verificationState,
    publicEligible: row.public_eligible,
    reason
  };
}

function getVerificationState(row: MmsiReviewDiagnosticSqlRow): MmsiReviewApplyDiagnosticRow["verificationState"] {
  if (!row.verification_status) return "missing";
  if (row.verification_registry_entry_id !== null && row.verification_registry_entry_id !== undefined && row.verification_registry_entry_id !== "") {
    if (row.verification_status === "VERIFIED_OCEAN_CRUISE" && row.confidence === "HIGH") return row.public_eligible ? "eligible" : "wrong-registry";
  }
  if (row.verification_status !== "VERIFIED_OCEAN_CRUISE") return "wrong-status";
  if (row.confidence !== "HIGH") return "not-high-confidence";
  return row.public_eligible ? "eligible" : "wrong-registry";
}

function isVerificationRepairCandidate(state: MmsiReviewApplyDiagnosticRow["verificationState"]) {
  return state === "missing" || state === "wrong-status" || state === "not-high-confidence" || state === "wrong-registry";
}

function getApplyDiagnosticReason(row: MmsiReviewDiagnosticSqlRow, verificationState: MmsiReviewApplyDiagnosticRow["verificationState"]) {
  if (row.public_eligible) return null;
  if (!row.cruise_identity_has_mmsi) return "missing cruise identity MMSI link";
  if (verificationState === "missing") return "missing cruise vessel verification";
  if (verificationState === "wrong-registry") return "verification is not linked to this registry entry";
  if (verificationState === "wrong-status") return "verification status is not VERIFIED_OCEAN_CRUISE";
  if (verificationState === "not-high-confidence") return "verification confidence is not HIGH";
  return "not public eligible";
}

function normalizeReviewRow(row: MmsiReviewSqlRow): MmsiReviewRow {
  return {
    ...row,
    occurrenceCount: Number(row.occurrenceCount),
    targetShipCount: Number(row.targetShipCount)
  };
}

function formatMmsiReviewTerminal(report: MmsiReviewListReport) {
  const lines = [
    "Cruise MMSI candidate review queue",
    `Generated: ${report.generatedAt}`,
    `Status filter: ${report.status}`,
    `Rows: ${report.totalRows}`,
    `Identifiers: ${report.includeIdentifiers ? "included" : "hidden"}`
  ];
  report.rows.forEach((row, index) => {
    lines.push("");
    lines.push(`${index + 1}. ${row.id}`);
    lines.push(`   classification: ${row.classification}`);
    lines.push(`   review status: ${row.reviewStatus}`);
    lines.push(`   occurrences: ${row.occurrenceCount}`);
    lines.push(`   first seen: ${row.firstSeenAt.toISOString()}`);
    lines.push(`   last seen: ${row.lastSeenAt.toISOString()}`);
    lines.push(`   state: ${getReviewStateLabel(row)}`);
    if (report.includeIdentifiers) {
      lines.push(`   registry vessel: ${row.registryName ?? "Unknown"}`);
      lines.push(`   registry operator: ${row.registryOperator ?? "Unknown"}`);
      lines.push(`   registry IMO: ${row.registryImo ?? "Unknown"}`);
      lines.push(`   observed MMSI: ${row.observedMmsi}`);
      lines.push(`   registry has linked MMSI: ${row.linkedMmsi ? "yes" : "no"}`);
      lines.push(`   observed MMSI linked elsewhere: ${row.observedMmsiLinkedElsewhere ? "yes" : "no"}`);
      lines.push(`   conflict reason: ${getConflictReason(row) ?? "none"}`);
    }
  });
  return lines.join("\n") + "\n";
}

function formatSkipReasons(skippedByReason: Record<string, number>) {
  const entries = Object.entries(skippedByReason).sort(([a], [b]) => a.localeCompare(b));
  if (entries.length === 0) return ["- none"];
  return entries.map(([reason, count]) => `- ${reason}: ${count}`);
}

function formatSkippedRows(skipped: Array<{ queueId: string; reason: string }>) {
  if (skipped.length === 0) return ["- none"];
  return skipped.map((row) => `- ${row.queueId}: ${row.reason}`);
}

function formatMmsiReviewMarkdown(report: MmsiReviewListReport) {
  const headers = report.includeIdentifiers
    ? ["#", "Queue ID", "Vessel", "Operator", "Registry IMO", "Observed MMSI", "Classification", "Status", "Occurrences", "Conflict"]
    : ["#", "Queue ID", "Classification", "Status", "Occurrences", "First Seen", "Last Seen", "State"];
  const rows = report.rows.map((row, index) =>
    report.includeIdentifiers
      ? [
          String(index + 1),
          row.id,
          row.registryName ?? "Unknown",
          row.registryOperator ?? "Unknown",
          row.registryImo ?? "Unknown",
          row.observedMmsi,
          row.classification,
          row.reviewStatus,
          String(row.occurrenceCount),
          getConflictReason(row) ?? "none"
        ]
      : [String(index + 1), row.id, row.classification, row.reviewStatus, String(row.occurrenceCount), row.firstSeenAt.toISOString(), row.lastSeenAt.toISOString(), getReviewStateLabel(row)]
  );
  return [`# Cruise MMSI Candidate Review Queue`, "", toMarkdownTable(headers, rows), ""].join("\n");
}

function toSerializableReviewReport(report: MmsiReviewListReport) {
  return {
    ...report,
    rows: report.rows.map((row) => {
      const base = {
        id: row.id,
        classification: row.classification,
        reviewStatus: row.reviewStatus,
        occurrenceCount: row.occurrenceCount,
        firstSeenAt: row.firstSeenAt.toISOString(),
        lastSeenAt: row.lastSeenAt.toISOString(),
        resolvedAt: row.resolvedAt?.toISOString() ?? null,
        state: getReviewStateLabel(row)
      };
      if (!report.includeIdentifiers) return base;
      return {
        ...base,
        registryName: row.registryName,
        registryOperator: row.registryOperator,
        registryImo: row.registryImo,
        observedMmsi: row.observedMmsi,
        registryHasLinkedMmsi: Boolean(row.linkedMmsi),
        observedMmsiLinkedElsewhere: row.observedMmsiLinkedElsewhere,
        conflictReason: getConflictReason(row)
      };
    })
  };
}

function getReviewStateLabel(row: MmsiReviewRow) {
  if (isAppliedReviewNote(row.resolutionNotes)) return "applied";
  if (isApprovedReviewNote(row.resolutionNotes)) return "approved-not-applied";
  if (isDismissedReviewNote(row.resolutionNotes)) return "dismissed";
  return row.reviewStatus.toLowerCase();
}

function getConflictReason(row: MmsiReviewRow) {
  if (row.observedMmsiLinkedElsewhere) return "observed MMSI is already linked elsewhere";
  if (row.hasUnresolvedConflict) return "unresolved conflict queue item exists";
  if (row.linkedMmsi && row.linkedMmsi !== row.observedMmsi) return "registry entry already has a different linked MMSI";
  return null;
}

function toMarkdownTable(headers: string[], rows: string[][]) {
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map((value) => value.replace(/\|/g, "\\|")).join(" | ")} |`)
  ].join("\n");
}

function parseStatus(value: string | undefined): MmsiReviewStatusFilter {
  if (value === "pending" || value === "reviewed" || value === "dismissed" || value === "all") return value;
  throw new Error("--status must be pending, reviewed, dismissed, or all.");
}

function parseFormat(value: string | undefined): MmsiReviewFormat {
  if (value === "terminal" || value === "json" || value === "markdown") return value;
  throw new Error("--format must be terminal, json, or markdown.");
}

function readRequiredNote(args: string[], startIndex: number) {
  if (args[startIndex] !== "--note") throw new Error("Approval and dismissal require --note \"<reason>\".");
  const note = args[startIndex + 1]?.trim();
  if (!note) throw new Error("--note requires a non-empty reason.");
  return { note, nextIndex: startIndex + 1 };
}

function sanitizeNote(value: string) {
  return value.replace(/[\r\n]+/g, " ").trim();
}

function hasApprovalNoteText(value: string | null | undefined) {
  if (!value) return false;
  const note = value.replace(MMSI_REVIEW_APPROVAL_MARKER, "").replace(/\d{4}-\d{2}-\d{2}T[^\s]+/g, "").trim();
  return note.length > 0;
}

function isValidMmsi(value: string | null | undefined): value is string {
  return typeof value === "string" && /^\d{9}$/.test(value) && value !== "000000000";
}
