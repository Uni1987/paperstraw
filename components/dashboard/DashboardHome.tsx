import Image from "next/image";
import Link from "next/link";
import { DashboardVisuals } from "@/components/dashboard/DashboardVisuals";
import { StatCard } from "@/components/dashboard/StatCard";
import { getVisualDashboardReport } from "@/lib/dashboard/report";

const dashboardNav = [
  { href: "/", label: "Overview" },
  { href: "/comparisons", label: "Comparisons" },
  { href: "/data", label: "Data" },
  { href: "/methodology", label: "Methodology" }
];

export async function DashboardHome() {
  const report = await getVisualDashboardReport();
  const { awareness, freshness, attributionQuality, comparisons, aggregateCounts, airportEmissionPoints } = report;

  const statCards = [
    {
      label: "Total CO2 emitted",
      value: `${formatTonnes(awareness.yearCo2Kg)} t`,
      detail: "Year-to-date estimate",
      accent: "purple" as const,
      icon: "CO2"
    },
    {
      label: "Total flights",
      value: awareness.yearFlights.toLocaleString(),
      detail: "Aggregate flight records",
      accent: "blue" as const,
      icon: "FL"
    },
    {
      label: "Airports",
      value: aggregateCounts.airports.toLocaleString(),
      detail: "Attributed airport groups",
      accent: "pink" as const,
      icon: "AP"
    },
    {
      label: "Countries",
      value: aggregateCounts.countries.toLocaleString(),
      detail: "Attributed country groups",
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
    <main className="min-h-screen bg-[#050908] text-white">
      <div className="mx-auto flex max-w-[1800px]">
        <aside className="sticky top-[73px] hidden h-[calc(100svh-73px)] w-64 shrink-0 border-r border-white/10 bg-[#08100f] p-6 xl:block">
          <Link href="/" className="flex items-center gap-3">
            <Image
              src="/logo/paperstraw-mark-small.png"
              alt=""
              width={34}
              height={36}
              className="h-9 w-auto"
            />
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.12em] text-white">PaperStraw</p>
              <p className="mt-1 text-xs text-white/45">Aggregate emissions</p>
            </div>
          </Link>

          <nav className="mt-14 space-y-2" aria-label="Dashboard navigation">
            {dashboardNav.map((item, index) => (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center justify-between rounded-xl px-4 py-3 text-sm transition ${
                  index === 0 ? "bg-emerald-400/10 text-white ring-1 ring-emerald-300/15" : "text-white/62 hover:bg-white/[0.08] hover:text-white"
                }`}
              >
                <span>{item.label}</span>
                {index === 0 ? <span className="h-2 w-2 rounded-full bg-emerald-300" /> : null}
              </Link>
            ))}
          </nav>

          <div className="absolute bottom-6 left-6 right-6 rounded-2xl border border-white/10 bg-white/[0.035] p-4">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-emerald-300">Data updated</p>
            <p className="mt-2 text-sm text-white/76">{formatDateTime(freshness.lastSuccessfulUpdateAt)}</p>
            <p className="mt-4 text-xs leading-5 text-white/45">ADSB.lol archive/API data with stored aggregate rollups.</p>
          </div>
        </aside>

        <section className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8 xl:px-10">
          <nav className="mb-6 flex gap-2 overflow-x-auto pb-2 xl:hidden" aria-label="Dashboard mobile navigation">
            {dashboardNav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="shrink-0 rounded-full border border-white/10 bg-white/[0.045] px-4 py-2 text-sm text-white/70"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <header className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
            <div>
              <h1 className="max-w-4xl text-4xl font-semibold leading-tight tracking-normal text-white sm:text-6xl">
                Private jets. Public impact.
              </h1>
              <p className="mt-4 text-lg text-white/64 sm:text-xl">Real data. Real emissions. No excuses.</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.045] px-4 py-3 text-sm text-white/66">
              <span className="text-white/42">Period</span>
              <span className="ml-3 font-semibold text-white">2026 year to date</span>
            </div>
          </header>

          <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            {statCards.map((card) => (
              <StatCard key={card.label} {...card} />
            ))}
          </section>

          <section className="mt-6 space-y-4">
            <DashboardVisuals
              monthlySeries={awareness.monthlySeries}
              topAirports={awareness.topAirports}
              topCountries={awareness.topCountries}
              comparisons={comparisons}
              freshness={freshness}
              totalCo2Kg={awareness.yearCo2Kg}
              airportEmissionPoints={airportEmissionPoints}
            />
          </section>

          <section className="mt-6 grid gap-4 md:grid-cols-2" id="attribution">
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
        </section>
      </div>
    </main>
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
