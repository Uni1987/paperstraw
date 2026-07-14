import Link from "next/link";
import { ComparisonCardGrid } from "@/components/comparisons/ComparisonCardGrid";
import { PublicShell } from "@/components/PublicShell";
import { ModuleInfoNav } from "@/components/ModuleInfoNav";
import { buildComparisonCards } from "@/lib/comparisons";
import { getAwarenessDashboardData } from "@/lib/awareness/aggregates";

export const dynamic = "force-dynamic";

export default async function PrivateJetsComparisonsPage() {
  const data = await getAwarenessDashboardData();
  const co2Tons = data.yearCo2Kg / 1000;
  const comparisons = buildComparisonCards(co2Tons);

  return (
    <PublicShell>
      <section className="mx-auto max-w-7xl py-14 lg:py-20">
        <ModuleInfoNav
          hubHref="/comparisons"
          hubLabel="Back to Comparisons hub"
          currentModule="Private Jets"
          siblingHref="/comparisons/cruises"
          siblingLabel="View Cruise Comparisons"
        />

        <header className="max-w-4xl">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-paper">Comparisons</p>
          <h1 className="mt-4 text-5xl font-semibold leading-tight tracking-normal text-white sm:text-7xl">
            More ways to understand this number
          </h1>
          <p className="mt-6 max-w-3xl text-lg leading-8 text-white/64">
            Private jet CO₂ emissions translated into relatable everyday scale comparisons.
          </p>
        </header>

        <ComparisonCardGrid comparisons={comparisons} />

        <section className="mt-20 border-y border-white/10 py-10" aria-labelledby="comparison-methodology-title">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <div className="max-w-4xl">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-paper">Assumptions</p>
              <h2 id="comparison-methodology-title" className="mt-3 text-3xl font-semibold tracking-normal text-white">
                How to read these comparisons
              </h2>
              <p className="mt-5 text-base leading-7 text-white/60">
                These comparisons are illustrative. They use average emissions factors and should be read as scale indicators,
                not exact one-to-one offsets. Tree comparisons estimate how many newly planted trees would be required to
                absorb the same amount of CO₂ over an assumed 45-year lifetime. Actual values vary by country, technology,
                fuel mix, species, climate, survival rate, soil conditions, and individual circumstances.
              </p>
            </div>
            <Link
              href="/methodology/private-jets"
              className="inline-flex w-fit items-center gap-2 text-sm font-semibold text-paper transition hover:text-white"
            >
              Read full methodology <span aria-hidden="true">→</span>
            </Link>
          </div>
        </section>
      </section>
    </PublicShell>
  );
}
