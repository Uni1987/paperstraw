import Link from "next/link";
import { Suspense } from "react";
import { LazyCruiseVesselMap } from "@/components/cruises/LazyCruiseVesselMap";
import { DashboardCard } from "@/components/dashboard/DashboardCard";
import { DashboardMapSkeleton } from "@/components/dashboard/DashboardSkeletons";
import { StatCard } from "@/components/dashboard/StatCard";
import { PublicShell } from "@/components/PublicShell";
import { getCruiseDashboardData, type CruiseDataStatus, type CruiseRankRow } from "@/lib/cruises/queries";

export const dynamic = "force-dynamic";

export default async function CruisesPage() {
  const data = await getCruiseDashboardData();

  if (!data.enabled) {
    return (
      <PublicShell>
        <section className="mx-auto max-w-7xl pb-20 pt-10 sm:pt-16">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-paper">Cruise emissions</p>
          <h1 className="mt-4 max-w-4xl text-4xl font-semibold leading-tight tracking-normal text-white md:text-6xl">
            Cruise ships. Global impact.
          </h1>
          <p className="mt-5 max-w-3xl text-base leading-7 text-white/64 md:text-xl">
            Live AIS movement data, translated into estimated emissions.
          </p>
          <section className="mt-10 rounded-2xl border border-paper/25 bg-paper/10 p-6">
            <h2 className="text-2xl font-semibold text-white">Cruises module is prepared</h2>
            <p className="mt-3 max-w-3xl text-white/64">
              Enable it with <code className="rounded bg-black/40 px-1.5 py-0.5 text-paper">ENABLE_CRUISES=true</code>{" "}
              after running the database migration and importing MRV data. AIS ingestion remains disabled unless{" "}
              <code className="rounded bg-black/40 px-1.5 py-0.5 text-paper">ENABLE_AISSTREAM_INGESTION=true</code> is set.
            </p>
          </section>
        </section>
      </PublicShell>
    );
  }

  const hasFreshVerifiedObservations = data.sourceStatus.currentlyTracked > 0;
  const monitoringStartLabel = data.monitoringStart ? formatDate(data.monitoringStart) : null;
  const hasVerifiedVessels =
    data.sourceStatus.verifiedShipsWithStoredObservations > 0 ||
    data.kpis.hasTodayEstimates ||
    data.kpis.hasSinceMonitoringBeganEstimates ||
    data.mapPoints.length > 0;
  const statCards = [
    {
      label: "Estimated CO₂ since monitoring began",
      value: data.kpis.hasSinceMonitoringBeganEstimates
        ? `${formatTonnes(data.kpis.co2SinceMonitoringBeganTonnes)} t`
        : "Awaiting verified observations",
      detail: monitoringStartLabel ? `Observed since ${monitoringStartLabel}` : "Estimated CO₂ from observed activity",
      accent: "gold" as const,
      icon: "CO₂"
    },
    {
      label: "Estimated CO₂ today",
      value: data.kpis.hasTodayEstimates && hasFreshVerifiedObservations ? `${formatTonnes(data.kpis.co2TodayTonnes)} t` : "Awaiting fresh observations",
      detail: data.kpis.hasTodayEstimates && hasFreshVerifiedObservations ? "Estimated from verified cruise movement" : "Shown only when fresh verified observations exist",
      accent: "purple" as const,
      icon: "TD"
    },
    {
      label: "Verified ships observed",
      value: data.sourceStatus.verifiedShipsWithStoredObservations > 0
        ? data.sourceStatus.verifiedShipsWithStoredObservations.toLocaleString("en-US")
        : "Awaiting verified vessels",
      detail: data.sourceStatus.verifiedShipsObservedLast24h > 0
        ? `${data.sourceStatus.verifiedShipsObservedLast24h.toLocaleString("en-US")} observed in the last 24 hours`
        : "No verified ships observed in the last 24 hours",
      accent: "blue" as const,
      icon: "SH"
    },
    {
      label: "Latest observation freshness",
      value: data.sourceStatus.latestPositionRelative,
      detail: "Coverage varies by vessel and AIS availability",
      accent: "pink" as const,
      icon: "FR"
    },
    {
      label: "Global AIS feed",
      value: "Worldwide",
      detail: "Verified vessel filtering",
      accent: "green" as const,
      icon: "GL"
    }
  ];

  const operatorRows = data.operators.filter((row) => row.operator !== "Unknown operator");

  return (
    <PublicShell sidebarFooter={<CruiseDataStatusWidget status={data.sourceStatus} />}>
      <header>
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-paper md:text-sm">Cruise emissions</p>
        <h1 className="max-w-4xl text-3xl font-semibold leading-tight tracking-normal text-white md:text-6xl">
          Cruise ships. Global impact.
        </h1>
        <p className="mt-2 text-base text-white/64 md:mt-4 md:text-xl">
          Live AIS movement data, translated into estimated emissions.
        </p>
        {!hasVerifiedVessels ? (
          <section className="mt-6 max-w-4xl rounded-2xl border border-paper/20 bg-paper/10 p-5">
            <h2 className="text-xl font-semibold text-white">Verified cruise coverage is being prepared</h2>
            <p className="mt-3 text-sm leading-6 text-white/64">
              PaperStraw is validating vessel identities before publishing cruise emissions statistics. Live AIS candidate
              data is collected separately and is not shown publicly until a vessel is verified as an ocean-going leisure
              cruise ship.
            </p>
          </section>
        ) : null}
      </header>

      <section className="-mx-4 mt-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 md:hidden">
        {statCards.map((card) => (
          <div key={card.label} className="min-w-[13.5rem] snap-start">
            <StatCard {...card} compact />
          </div>
        ))}
      </section>

      <section className="mt-6 hidden gap-4 md:grid md:grid-cols-2 xl:grid-cols-5">
        {statCards.map((card) => (
          <StatCard key={card.label} {...card} />
        ))}
      </section>

      <section className="mt-4 md:mt-6">
        <CruiseCoveragePanel status={data.sourceStatus} />
      </section>

      <section className="mt-4">
        <Suspense fallback={<DashboardMapSkeleton />}>
          <LazyCruiseVesselMap
            points={data.mapPoints}
            mapMode={data.mapMode}
            emptyStateTitle="Verified cruise coverage is being prepared"
            emptyStateDescription="Live AIS candidate data is collected separately and is not shown publicly until a vessel is verified as an ocean-going leisure cruise ship."
          />
        </Suspense>
      </section>

      <section className="mt-5 grid gap-4 md:mt-4 xl:grid-cols-2">
        <CruiseRankingCard
          title="Estimated emissions from observed activity today"
          rows={data.topToday}
          emptyMessage="Awaiting verified ocean-cruise vessels with fresh observed estimates."
          note="Only verified ships are included. Observation coverage varies, so rankings are directional."
        />
        <CruiseRankingCard
          title="Estimated emissions from observed activity since monitoring began"
          rows={data.topSinceMonitoringBegan}
          emptyMessage="Awaiting verified ocean-cruise vessels with stored estimates."
          note="Only verified ships are included. Observation coverage varies, so rankings are directional."
        />
      </section>

      <section className="mt-4 grid gap-4 xl:grid-cols-[1fr_0.85fr]">
        {operatorRows.length ? <OperatorCard rows={operatorRows} /> : null}
        <DashboardCard title="About these numbers" className={operatorRows.length ? "" : "xl:col-span-2"}>
          <div className="space-y-4 p-5 text-sm leading-6 text-white/60">
            <p>
              Public cruise statistics only include vessels verified through an exact curated registry IMO match. AIS
              passenger-vessel candidates are collected separately and are not shown publicly until verified.
            </p>
            <p className="rounded-xl border border-paper/20 bg-paper/10 px-4 py-3 text-paper/90">
              Estimated CO₂ emissions from verified ocean cruise ships observed by PaperStraw since monitoring began.
              {monitoringStartLabel ? ` Observed since ${monitoringStartLabel}.` : ""}
            </p>
            {data.monitoringStart ? (
              <p className="rounded-xl border border-paper/20 bg-paper/10 px-4 py-3 text-paper/90">
                Coverage varies by vessel and AIS availability. Positions may be delayed, and totals reflect only verified
                ships observed by PaperStraw.
              </p>
            ) : null}
            <p>
              Sources: curated ocean-cruise registry entries, AISStream vessel movement feed and EMSA THETIS-MRV public
              ship emissions disclosures where an IMO match exists.
            </p>
            <Link href="/methodology" className="inline-flex text-sm font-semibold text-paper hover:text-white">
              Read the methodology
            </Link>
          </div>
        </DashboardCard>
      </section>
    </PublicShell>
  );
}

function CruiseCoveragePanel({ status }: { status: CruiseDataStatus }) {
  return (
    <DashboardCard title="Cruise coverage and freshness">
      <div className="grid gap-4 p-5 text-sm leading-6 text-white/60 md:grid-cols-2 xl:grid-cols-4">
        <CoverageItem
          label="Verified ships observed in the last 24 hours"
          value={status.verifiedShipsObservedLast24h > 0 ? `${status.verifiedShipsObservedLast24h.toLocaleString("en-US")} ships` : "No recent observations"}
          detail="Based on valid stored positions from verified cruise ships."
        />
        <CoverageItem
          label="Verified ships with stored observations"
          value={`${status.verifiedShipsWithStoredObservations.toLocaleString("en-US")} ships`}
          detail="Candidate AIS vessels are not shown publicly."
        />
        <CoverageItem label="Observation source" value="Worldwide AIS observations" detail="Positions are collected from worldwide AIS observations." />
        <CoverageItem label="Coverage note" value="Varies by vessel" detail="Coverage varies by vessel and AIS availability." />
      </div>
      <div className="border-t border-white/10 px-5 py-4">
        <Link href="/methodology" className="text-sm font-semibold text-paper hover:text-white">
          Read the methodology
        </Link>
      </div>
    </DashboardCard>
  );
}

function CoverageItem({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div>
      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-white/40">{label}</p>
      <p className="mt-2 text-lg font-semibold text-white">{value}</p>
      <p className="mt-1 text-xs leading-5 text-white/44">{detail}</p>
    </div>
  );
}

function CruiseDataStatusWidget({ status }: { status: CruiseDataStatus }) {
  const statusTone =
    status.status === "Healthy" ? "text-emerald-300" : status.status === "Stale" ? "text-paper" : "text-white/58";

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
      <p className={`text-[0.68rem] font-semibold uppercase tracking-[0.16em] ${statusTone}`}>Cruise data status</p>
      <div className="mt-4 space-y-3">
        <SidebarStatusRow label="Source" value={status.source} />
        <SidebarStatusRow label="Public coverage" value={status.publicCoverage} />
        <SidebarStatusRow label="Last verified AIS position" value={status.latestPositionRelative} detail={status.latestPositionExact ?? undefined} />
        <SidebarStatusRow label="Observed last 24h" value={`${status.verifiedShipsObservedLast24h.toLocaleString("en-US")} verified ships`} />
        <SidebarStatusRow label="Feed" value="Worldwide AIS observations" />
        <SidebarStatusRow label="Status" value={status.status} />
      </div>
    </div>
  );
}

function SidebarStatusRow({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="border-b border-white/10 pb-3 last:border-0 last:pb-0">
      <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-white/36">{label}</p>
      <p className="mt-1 text-sm font-semibold leading-5 text-white/78">{value}</p>
      {detail ? <p className="mt-1 text-xs leading-4 text-white/40">{detail}</p> : null}
    </div>
  );
}

function CruiseRankingCard({ title, rows, emptyMessage, note }: { title: string; rows: CruiseRankRow[]; emptyMessage: string; note: string }) {
  return (
    <DashboardCard title={title}>
      <p className="border-b border-white/10 px-5 py-3 text-xs leading-5 text-white/44">{note}</p>
      <div className="max-h-[34rem] overflow-auto">
        {rows.length ? (
          <div className="divide-y divide-white/10">
            {rows.map((row, index) => (
              <Link
                href={`/cruises/${row.shipId}`}
                key={row.shipId}
                className="grid grid-cols-[2.25rem_1fr_auto] items-center gap-4 px-5 py-4 transition hover:bg-white/[0.035]"
              >
                <span className="text-sm tabular-nums text-white/36">{index + 1}</span>
                <span className="min-w-0">
                  <span className="block truncate font-semibold text-white">{row.shipName}</span>
                  <span className="mt-1 block truncate text-xs text-white/42">{row.operator}</span>
                </span>
                <span className="text-right font-semibold tabular-nums text-white">{formatTonnes(row.co2Tonnes)} t</span>
              </Link>
            ))}
          </div>
        ) : (
          <p className="px-5 py-10 text-center text-sm text-white/48">{emptyMessage}</p>
        )}
      </div>
    </DashboardCard>
  );
}

function OperatorCard({ rows }: { rows: Array<{ operator: string; co2Tonnes: number; ships: number }> }) {
  return (
    <DashboardCard title="Operators by estimated CO₂ from observed activity">
      <div className="divide-y divide-white/10">
        {rows.map((row) => (
          <div key={row.operator} className="grid grid-cols-[1fr_auto] gap-4 px-5 py-4">
            <div className="min-w-0">
              <p className="truncate font-semibold text-white">{row.operator}</p>
              <p className="mt-1 text-xs text-white/42">{row.ships.toLocaleString("en-US")} ship(s) with estimates</p>
            </div>
            <p className="font-semibold tabular-nums text-white">{formatTonnes(row.co2Tonnes)} t</p>
          </div>
        ))}
      </div>
    </DashboardCard>
  );
}

function formatTonnes(value: number) {
  return Math.round(value).toLocaleString("en-US");
}

function formatDate(value: Date) {
  return value.toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric"
  });
}
