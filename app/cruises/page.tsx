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

  const statCards = [
    {
      label: "Estimated CO2 today",
      value: data.kpis.hasTodayEstimates ? `${formatTonnes(data.kpis.co2TodayTonnes)} t` : "Awaiting data",
      detail: data.kpis.hasTodayEstimates ? "Estimated from stored AIS movement" : "No daily estimate has been written yet",
      accent: "gold" as const,
      icon: "CO2"
    },
    {
      label: "Estimated CO2 YTD",
      value: data.kpis.hasYtdEstimates ? `${formatTonnes(data.kpis.co2YtdTonnes)} t` : "Awaiting data",
      detail: "Based on locally collected data",
      accent: "purple" as const,
      icon: "YT"
    },
    {
      label: "Ships currently tracked",
      value: data.kpis.trackedShips.toLocaleString("en-US"),
      detail: `Latest position within ${data.sourceStatus.freshnessWindowHours} hours`,
      accent: "blue" as const,
      icon: "SH"
    },
    {
      label: "Fuel burned today",
      value: data.kpis.hasTodayEstimates ? `${formatTonnes(data.kpis.fuelTodayTonnes)} t` : "Awaiting data",
      detail: "From the same daily estimates",
      accent: "pink" as const,
      icon: "FL"
    },
    {
      label: "Active AIS regions",
      value: data.kpis.activeRegionCount.toLocaleString("en-US"),
      detail: `${data.kpis.activeRegionCount.toLocaleString("en-US")} monitored cruise regions`,
      accent: "green" as const,
      icon: "RG"
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
        <p className="mt-4 max-w-3xl text-sm leading-6 text-white/48">
          AISStream provides vessel movement data. EMSA THETIS-MRV annual disclosures provide an emissions baseline where
          available. Daily values are estimates, not official real-time emissions.
        </p>
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
        <Suspense fallback={<DashboardMapSkeleton />}>
          <LazyCruiseVesselMap
            points={data.mapPoints}
            mapWeighting={data.mapWeighting}
            latestPositionLabel={data.sourceStatus.latestPositionRelative}
            freshnessWindowHours={data.sourceStatus.freshnessWindowHours}
            monitoredRegionCount={data.sourceStatus.activeRegionCount}
          />
        </Suspense>
      </section>

      <section className="mt-5 grid gap-4 md:mt-4 xl:grid-cols-2">
        <CruiseRankingCard title="Top cruise emitters today" rows={data.topToday} emptyMessage="No daily cruise estimates yet." />
        <CruiseRankingCard title="Top cruise emitters YTD" rows={data.topYtd} emptyMessage="No YTD cruise estimates yet." />
      </section>

      <section className="mt-4 grid gap-4 xl:grid-cols-[1fr_0.85fr]">
        {operatorRows.length ? <OperatorCard rows={operatorRows} /> : null}
        <DashboardCard title="About these numbers" className={operatorRows.length ? "" : "xl:col-span-2"}>
          <div className="space-y-4 p-5 text-sm leading-6 text-white/60">
            <p>
              Cruise positions are live AIS-derived movement observations. Emissions are stored daily estimates and are
              separated from raw AIS position frequency to avoid inflating totals.
            </p>
            {data.ytdCollectionStart ? (
              <p className="rounded-xl border border-paper/20 bg-paper/10 px-4 py-3 text-paper/90">
                YTD currently reflects locally collected cruise data since {formatDate(data.ytdCollectionStart)}.
              </p>
            ) : null}
            <p>
              Sources: AISStream vessel movement feed and EMSA THETIS-MRV public annual ship emissions data where an IMO
              match exists.
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

function CruiseDataStatusWidget({ status }: { status: CruiseDataStatus }) {
  const statusTone =
    status.status === "Healthy" ? "text-emerald-300" : status.status === "Stale" ? "text-paper" : "text-white/58";

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
      <p className={`text-[0.68rem] font-semibold uppercase tracking-[0.16em] ${statusTone}`}>Cruise data status</p>
      <div className="mt-4 space-y-3">
        <SidebarStatusRow label="Source" value={status.source} />
        <SidebarStatusRow label="Last AIS position" value={status.latestPositionRelative} detail={status.latestPositionExact ?? undefined} />
        <SidebarStatusRow label="Currently tracked" value={`${status.currentlyTracked.toLocaleString("en-US")} ships`} />
        <SidebarStatusRow label="Coverage" value={`${status.activeRegionCount.toLocaleString("en-US")} monitored regions`} />
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

function CruiseRankingCard({ title, rows, emptyMessage }: { title: string; rows: CruiseRankRow[]; emptyMessage: string }) {
  return (
    <DashboardCard title={title}>
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
    <DashboardCard title="Top operators by estimated CO2">
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
