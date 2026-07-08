import Link from "next/link";
import { CruiseAdminActions } from "./CruiseAdminActions";
import { buildCruiseOpsStatus, type CruiseOpsStatus } from "@/lib/cruises/adminOps";
import type { ReactNode } from "react";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function CruiseAdminPage() {
  const status = await buildCruiseOpsStatus();

  return (
    <main className="min-h-screen bg-[#f7faf8] px-4 py-10 text-ink sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-normal text-clay">Cruise operations</p>
            <h1 className="mt-3 text-4xl font-bold tracking-normal text-ink">Cruise admin dashboard</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-ink/65">
              Railway worker health, verified cruise coverage, MMSI review queue safety, and read-only repair checks for
              the global-local-filter workflow.
            </p>
          </div>
          <Link href="/admin" className="rounded-md border border-ink/15 bg-white px-4 py-2 text-sm font-semibold text-ink hover:bg-mint">
            Back to admin
          </Link>
        </div>

        <section className="mt-8 rounded-lg border border-ink/10 bg-white p-6 shadow-soft">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-ink">Worker / ingest health</h2>
              <p className="mt-2 text-sm text-ink/60">Status generated at {formatDateTime(status.generatedAt)}.</p>
            </div>
            <StatusBadge status={status.status} />
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <MetricCard label="Latest verified position" value={formatDateTime(status.worker.latestVerifiedPositionTimestamp)} />
            <MetricCard label="Age" value={status.worker.latestPositionAgeMinutes === null ? "n/a" : `${status.worker.latestPositionAgeMinutes} min`} />
            <MetricCard label="Positions last 24h" value={formatNumber(status.worker.storedVerifiedPositionsLast24h)} />
            <MetricCard label="Vessels observed 24h" value={formatNumber(status.worker.distinctVerifiedVesselsObservedLast24h)} />
            <MetricCard label="Invalid coordinates" value={formatNumber(status.worker.invalidOrMissingCoordinatesLast24h)} />
          </div>
        </section>

        <section className="mt-8 grid gap-6 lg:grid-cols-2">
          <Panel title="Registry / verification coverage">
            <div className="grid gap-3 sm:grid-cols-2">
              <MetricCard label="Accepted registry entries" value={formatNumber(status.registry.acceptedRegistryEntries)} compact />
              <MetricCard label="Public eligible vessels" value={formatNumber(status.registry.verifiedPublicEligibleVessels)} compact />
              <MetricCard label="Verified MMSIs loaded" value={formatNumber(status.registry.verifiedMmsisLoaded)} compact />
              <MetricCard label="Linked MMSI vessels" value={formatNumber(status.registry.verifiedVesselsWithLinkedMmsi)} compact />
              <MetricCard label="Public-eligible ratio" value={formatPercent(status.registry.publicEligibleRatio)} compact />
              <MetricCard label="Linked ratio" value={formatPercent(status.registry.linkedRatio)} compact />
            </div>
          </Panel>

          <Panel title="Observation coverage">
            <div className="grid gap-3 sm:grid-cols-3">
              <MetricCard label="Observed 24h" value={formatNumber(status.observationCoverage.vesselsObservedLast24h)} detail={formatPercent(status.observationCoverage.observed24hRatio)} compact />
              <MetricCard label="Observed 7d" value={formatNumber(status.observationCoverage.vesselsObservedLast7d)} detail={formatPercent(status.observationCoverage.observed7dRatio)} compact />
              <MetricCard label="Observed 30d" value={formatNumber(status.observationCoverage.vesselsObservedLast30d)} detail={formatPercent(status.observationCoverage.observed30dRatio)} compact />
            </div>
          </Panel>
        </section>

        <section className="mt-8 rounded-lg border border-ink/10 bg-white p-6 shadow-soft">
          <h2 className="text-lg font-semibold text-ink">Review queue</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
            <MetricCard label="Total records" value={formatNumber(status.reviewQueue.totalRecords)} compact />
            <MetricCard label="Pending candidates" value={formatNumber(status.reviewQueue.pendingCandidates)} compact />
            <MetricCard label="Reviewed" value={formatNumber(status.reviewQueue.reviewedCandidates)} compact />
            <MetricCard label="Dismissed" value={formatNumber(status.reviewQueue.dismissedCandidates)} compact />
            <MetricCard label="Pending conflicts" value={formatNumber(status.reviewQueue.pendingConflicts)} compact />
            <MetricCard label="Conflicts total" value={formatNumber(status.reviewQueue.conflictsTotal)} compact />
          </div>
          <div className="mt-6">
            <CruiseAdminActions candidates={status.reviewQueue.pendingCandidateList} />
          </div>
        </section>

        <section className="mt-8 grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
          <Panel title="Safety / data quality checks">
            <StatusRow label="Pending review candidate exists" value={status.safety.pendingReviewCandidateExists ? "Yes" : "No"} />
            <StatusRow label="Conflict exists" value={status.safety.conflictExists ? "Yes" : "No"} />
            <StatusRow label="Repair-needed count" value={formatNumber(status.safety.repairNeededCount)} />
            <StatusRow label="Reconcile equivalent" value={`${formatNumber(status.safety.reconcileSummary.missingPublicEligibilityCount)} not public eligible`} detail={status.safety.reconcileSummary.note} />
          </Panel>

          <Panel title="Alerts">
            {status.alerts.length ? (
              <div className="space-y-3">
                {status.alerts.map((alert) => (
                  <div key={alert.code} className={`rounded-md border p-3 text-sm ${alert.level === "error" ? "border-red-200 bg-red-50 text-red-900" : "border-amber-200 bg-amber-50 text-amber-950"}`}>
                    <p className="font-semibold">{alert.level.toUpperCase()} · {alert.code}</p>
                    <p className="mt-1">{alert.message}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-ink/60">No cruise operations alerts are currently active.</p>
            )}
          </Panel>
        </section>
      </div>
    </main>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-ink/10 bg-white p-6 shadow-soft">
      <h2 className="text-lg font-semibold text-ink">{title}</h2>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function MetricCard({ label, value, detail, compact = false }: { label: string; value: string; detail?: string; compact?: boolean }) {
  return (
    <div className={`rounded-md border border-ink/10 bg-[#f8fbf9] ${compact ? "p-4" : "p-5"}`}>
      <p className="text-xs font-semibold uppercase text-ink/45">{label}</p>
      <p className="mt-2 text-2xl font-bold text-ink">{value}</p>
      {detail ? <p className="mt-1 text-xs text-ink/55">{detail}</p> : null}
    </div>
  );
}

function StatusRow({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="border-b border-ink/10 py-3 last:border-b-0">
      <div className="flex items-start justify-between gap-4">
        <p className="text-sm font-semibold text-ink">{label}</p>
        <p className="text-sm font-semibold text-clay">{value}</p>
      </div>
      {detail ? <p className="mt-1 text-xs leading-5 text-ink/55">{detail}</p> : null}
    </div>
  );
}

function StatusBadge({ status }: { status: CruiseOpsStatus["status"] }) {
  const label = status.toUpperCase();
  const className = {
    healthy: "border-moss/20 bg-mint text-moss",
    stale: "border-amber-200 bg-amber-50 text-amber-900",
    warning: "border-amber-200 bg-amber-50 text-amber-900",
    error: "border-red-200 bg-red-50 text-red-900"
  }[status];
  return <span className={`rounded-full border px-3 py-1 text-xs font-bold ${className}`}>{label}</span>;
}

function formatNumber(value: number) {
  return value.toLocaleString("en");
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function formatDateTime(value: string | null) {
  if (!value) return "n/a";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
