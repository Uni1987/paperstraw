import { PublicShell } from "@/components/PublicShell";
import { AirportEmissionsMap } from "@/components/dashboard/AirportEmissionsMap";
import { DashboardVisuals } from "@/components/dashboard/DashboardVisuals";
import { StatCard } from "@/components/dashboard/StatCard";
import { dashboardGridRowClass } from "@/components/dashboard/dashboardGrid";
import { getVisualDashboardReport } from "@/lib/dashboard/report";
import type { ImportFreshness } from "@/lib/ingestion/freshness";

export async function DashboardHome() {
  const report = await getVisualDashboardReport();
  const { awareness, freshness, attributionQuality, comparisons, aggregateCounts, airportEmissionPoints } = report;

  const statCards = [
    {
      label: "Total CO2 emitted",
      value: `${formatTonnes(awareness.yearCo2Kg)} t`,
      detail: "2026 year-to-date",
      accent: "purple" as const,
      icon: "CO2"
    },
    {
      label: "Total flights",
      value: awareness.yearFlights.toLocaleString(),
      detail: "Flights analysed",
      accent: "blue" as const,
      icon: "FL"
    },
    {
      label: "Airports",
      value: aggregateCounts.airports.toLocaleString(),
      detail: "Mapped airports",
      accent: "pink" as const,
      icon: "AP"
    },
    {
      label: "Countries",
      value: aggregateCounts.countries.toLocaleString(),
      detail: "Countries represented",
      accent: "gold" as const,
      icon: "GL"
    },
    {
      label: "Airport attribution coverage",
      value: `${attributionQuality.airportAttributionRate}%`,
      detail: "Attributed airport endpoints",
      accent: "green" as const,
      icon: "OK"
    }
  ];

  return (
    <PublicShell
      sidebarFooter={<DataStatusWidget freshness={freshness} />}
    >
      <header className="grid gap-3 md:gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
        <div>
          <h1 className="max-w-4xl text-3xl font-semibold leading-tight tracking-normal text-white md:text-6xl">
            Private jets. Public impact.
          </h1>
          <p className="mt-2 text-base text-white/64 md:mt-4 md:text-xl">Real data. Real emissions. No excuses.</p>
        </div>
        <div className="hidden rounded-2xl border border-white/10 bg-white/[0.045] px-4 py-3 text-sm text-white/66 md:block">
          <span className="text-white/42">Period</span>
          <span className="ml-3 font-semibold text-white">2026 year to date</span>
        </div>
      </header>

      <section className="-mx-4 mt-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 md:hidden">
        {statCards.map((card) => (
          <div key={card.label} className="min-w-[13.5rem] snap-start">
            <StatCard {...card} compact />
          </div>
        ))}
      </section>

      <section className="mt-4 md:hidden">
        <AirportEmissionsMap airports={airportEmissionPoints} />
      </section>

      <section className="mt-6 hidden gap-4 md:grid md:grid-cols-2 xl:grid-cols-5">
        {statCards.map((card) => (
          <StatCard key={card.label} {...card} />
        ))}
      </section>

      <section className="mt-5 space-y-4 md:hidden">
        <DashboardVisuals
          monthlySeries={awareness.monthlySeries}
          topAirports={awareness.topAirports}
          topCountries={awareness.topCountries}
          comparisons={comparisons}
          totalCo2Kg={awareness.yearCo2Kg}
          airportEmissionPoints={airportEmissionPoints}
          showMap={false}
        />
      </section>

      <section className="mt-6 hidden space-y-4 md:block">
        <DashboardVisuals
          monthlySeries={awareness.monthlySeries}
          topAirports={awareness.topAirports}
          topCountries={awareness.topCountries}
          comparisons={comparisons}
          totalCo2Kg={awareness.yearCo2Kg}
          airportEmissionPoints={airportEmissionPoints}
        />
      </section>

      <section className={`mt-6 ${dashboardGridRowClass}`} id="attribution">
        <MiniDataPanel
          title="Airport attribution"
          value={`${attributionQuality.airportAttributionRate}%`}
          detail={`${attributionQuality.airportAttributedEndpoints.toLocaleString()} of ${attributionQuality.totalEndpoints.toLocaleString()} endpoints attributed`}
        />
        <MiniDataPanel
          title="Country attribution"
          value={`${attributionQuality.countryAttributionRate}%`}
          detail={`${attributionQuality.countryAttributedEndpoints.toLocaleString()} of ${attributionQuality.totalEndpoints.toLocaleString()} endpoints attributed`}
        />
      </section>
    </PublicShell>
  );
}

function DataStatusWidget({ freshness }: { freshness: ImportFreshness }) {
  const importedToday = isSameDay(freshness.latestRunEndedAt, new Date()) ? freshness.latestRecordsImported : 0;

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-emerald-300">Data status</p>
      <div className="mt-4 space-y-3">
        <SidebarStatusRow label="Source" value="ADS-B.lol archive/API" />
        <SidebarStatusRow label="Updated" value={formatDateTime(freshness.lastSuccessfulUpdateAt)} />
        <SidebarStatusRow label="Imported today" value={`${importedToday.toLocaleString()} flights`} />
        <SidebarStatusRow label="Status" value={formatFreshnessStatus(freshness.latestStatus)} />
      </div>
    </div>
  );
}

function SidebarStatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-white/10 pb-3 last:border-0 last:pb-0">
      <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-white/36">{label}</p>
      <p className="mt-1 text-sm font-semibold leading-5 text-white/78">{value}</p>
    </div>
  );
}

function MiniDataPanel({ title, value, detail }: { title: string; value: string; detail: string }) {
  return (
    <article className="rounded-2xl border border-white/10 bg-white/[0.045] p-5">
      <p className="text-sm text-white/52">{title}</p>
      <p className="mt-3 text-4xl font-semibold text-white">{value}</p>
      <p className="mt-2 text-sm text-white/50">{detail}</p>
    </article>
  );
}

function formatTonnes(valueKg: number) {
  return Math.round(valueKg / 1000).toLocaleString();
}

function formatDateTime(date: Date | null) {
  if (!date) return "No successful update yet";
  return date.toLocaleString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatFreshnessStatus(status: string | null) {
  if (status === "SUCCESS" || status === "PARTIAL") return "Healthy";
  if (status === "FAILED") return "Delayed";
  return "Pending";
}

function isSameDay(left: Date | null, right: Date) {
  if (!left) return false;
  return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth() && left.getDate() === right.getDate();
}
