import Link from "next/link";
import { ComparisonCardGrid } from "@/components/comparisons/ComparisonCardGrid";
import { ModuleInfoNav } from "@/components/ModuleInfoNav";
import { PublicShell } from "@/components/PublicShell";
import { buildComparisonCards } from "@/lib/comparisons";
import { getCruiseDashboardData } from "@/lib/cruises/queries";

export const dynamic = "force-dynamic";

export default async function CruiseComparisonsPage() {
  const data = await getCruiseDashboardData();

  if (!data.enabled) {
    return (
      <PublicShell>
        <section className="mx-auto max-w-7xl py-14 lg:py-20">
          <ModuleNavigation />
          <h1 className="max-w-4xl text-5xl font-semibold leading-tight tracking-normal text-white sm:text-7xl">
            Cruise comparisons are unavailable
          </h1>
          <p className="mt-6 max-w-3xl text-lg leading-8 text-white/62">
            The Cruise module must be enabled before verified observed estimates can be translated into comparisons.
          </p>
        </section>
      </PublicShell>
    );
  }

  const hasComparisons = data.kpis.hasSinceMonitoringBeganEstimates;
  const comparisons = hasComparisons ? buildComparisonCards(data.kpis.co2SinceMonitoringBeganTonnes) : [];

  return (
    <PublicShell>
      <section className="mx-auto max-w-7xl py-14 lg:py-20">
        <ModuleNavigation />

        <header className="max-w-4xl">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-paper">Cruise comparisons</p>
          <h1 className="mt-4 text-5xl font-semibold leading-tight tracking-normal text-white sm:text-7xl">
            More ways to understand cruise emissions
          </h1>
          <p className="mt-6 max-w-3xl text-lg leading-8 text-white/64">
            Estimated CO₂ from verified tracked cruise vessels since monitoring began, translated into everyday comparisons.
          </p>
          <p className="mt-5 max-w-3xl rounded-lg border border-paper/20 bg-paper/[0.07] px-4 py-3 text-sm leading-6 text-white/58">
            Cruise comparisons are based on verified AIS-tracked vessels in the current curated registry, not all cruise ships worldwide.
          </p>
        </header>

        {hasComparisons ? (
          <ComparisonCardGrid comparisons={comparisons} />
        ) : (
          <section className="mt-14 rounded-lg border border-white/10 bg-white/[0.035] p-8">
            <h2 className="text-2xl font-semibold text-white">Awaiting verified cruise estimates</h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-white/58">
              Comparison cards will appear after PaperStraw has stored estimated CO₂ from observed activity for verified tracked cruise vessels.
            </p>
          </section>
        )}

        <section className="mt-20 border-y border-white/10 py-10" aria-labelledby="cruise-comparison-methodology-title">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <div className="max-w-4xl">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-paper">Assumptions</p>
              <h2 id="cruise-comparison-methodology-title" className="mt-3 text-3xl font-semibold tracking-normal text-white">
                How to read these cruise comparisons
              </h2>
              <p className="mt-5 text-base leading-7 text-white/60">
                These comparisons are illustrative. They use average emissions factors and should be read as scale indicators,
                not exact one-to-one offsets. Cruise figures are based on estimated CO₂ from verified tracked cruise vessels
                since monitoring began, using observed AIS activity and the current curated registry. Tree comparisons estimate
                newly planted trees absorbing CO₂ over an assumed 45-year lifetime. Actual values vary by vessel operation,
                fuel use, routing, weather, data coverage, country, technology, and environmental conditions.
              </p>
            </div>
            <Link
              href="/methodology/cruises"
              className="inline-flex w-fit items-center gap-2 text-sm font-semibold text-paper transition hover:text-white"
            >
              Read cruise methodology <span aria-hidden="true">→</span>
            </Link>
          </div>
        </section>
      </section>
    </PublicShell>
  );
}

function ModuleNavigation() {
  return (
    <ModuleInfoNav
      hubHref="/comparisons"
      hubLabel="Back to Comparisons hub"
      currentModule="Cruises"
      siblingHref="/comparisons/private-jets"
      siblingLabel="View Private Jet Comparisons"
    />
  );
}
