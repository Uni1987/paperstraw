import Link from "next/link";
import { buildComparisonCards, COMPARISON_CATEGORIES, type ComparisonCardData } from "@/lib/comparisons";
import { getAwarenessDashboardData } from "@/lib/awareness/aggregates";

export const dynamic = "force-dynamic";

export default async function ComparisonsPage() {
  const data = await getAwarenessDashboardData();
  const co2Tons = data.yearCo2Kg / 1000;
  const comparisons = buildComparisonCards(co2Tons);

  return (
    <main className="min-h-screen bg-charcoal text-white">
      <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
        <Link href="/" className="text-sm font-semibold text-paper hover:text-white">
          Back to PaperStraw
        </Link>

        <div className="mt-10 max-w-4xl">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-paper">Comparisons</p>
          <h1 className="mt-4 text-5xl font-semibold leading-tight tracking-normal text-white sm:text-7xl">
            More ways to understand this number
          </h1>
          <p className="mt-6 max-w-3xl text-lg leading-8 text-white/62">
            Private jet CO2 emissions translated into everyday comparisons.
          </p>
        </div>

        <div className="mt-14 space-y-20">
          {COMPARISON_CATEGORIES.map((category) => {
            const cards = comparisons.filter((comparison) => comparison.category === category);
            return (
              <section key={category}>
                <div className="mb-7 flex flex-wrap items-end justify-between gap-4 border-b border-white/10 pb-5">
                  <div>
                    <h2 className="text-3xl font-semibold tracking-normal text-white">{category}</h2>
                    <p className="mt-2 text-sm text-white/50">{cards.length} comparison{cards.length === 1 ? "" : "s"}</p>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  {cards.map((comparison) => (
                    <ComparisonCard key={comparison.id} comparison={comparison} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>

        <footer className="mt-20 rounded-lg border border-white/10 bg-white/[0.035] p-6 text-sm leading-6 text-white/58">
          All comparisons are estimates based on widely used average emissions factors. Actual emissions vary by country,
          technology, fuel mix, manufacturing process and individual circumstances.
        </footer>
      </section>
    </main>
  );
}

function ComparisonCard({ comparison }: { comparison: ComparisonCardData }) {
  return (
    <article className="flex min-h-[24rem] flex-col rounded-lg border border-white/10 bg-white/[0.045] p-6 shadow-2xl shadow-black/20">
      <div className="text-4xl" aria-hidden="true">
        {comparison.icon}
      </div>
      <h3 className="mt-7 text-xl font-semibold text-white">{comparison.title}</h3>
      <p className="mt-5 text-5xl font-semibold tracking-normal text-paper">{comparison.value}</p>
      <p className="mt-2 text-sm font-semibold uppercase tracking-[0.14em] text-white/44">{comparison.unit}</p>
      <p className="mt-5 text-sm leading-6 text-white/60">{formatComparisonDescription(comparison)}</p>

      {comparison.extraMetrics?.length ? (
        <div className="mt-5 grid gap-2 rounded-md border border-white/10 bg-charcoal/45 p-3">
          {comparison.extraMetrics.map((metric) => (
            <div key={metric.label} className="flex items-center justify-between gap-3 text-xs">
              <span className="text-white/46">{metric.label}</span>
              <span className="font-semibold text-white/82">{metric.value}</span>
            </div>
          ))}
        </div>
      ) : null}

      <div className="mt-auto pt-6">
        <p className="text-xs text-white/38">Based on average emissions factors</p>
        <details className="mt-4 rounded-md border border-white/10 bg-charcoal/55 p-3 text-sm">
          <summary className="cursor-pointer font-semibold text-paper">Methodology</summary>
          <div className="mt-3 space-y-2 text-xs leading-5 text-white/58">
            <p>
              <span className="font-semibold text-white/78">Factor used:</span> {comparison.factorLabel}
            </p>
            <p>
              <span className="font-semibold text-white/78">Formula:</span> {comparison.formulaLabel}
            </p>
            <p>
              <span className="font-semibold text-white/78">Assumptions:</span> {comparison.sourceAssumption}
            </p>
          </div>
        </details>
      </div>
    </article>
  );
}

function formatComparisonDescription(comparison: ComparisonCardData) {
  return comparison.description
    .replace("X million ", `${comparison.value} `)
    .replace("X billion ", `${comparison.value} `)
    .replace("X ", `${comparison.value} `)
    .replace("X", comparison.value);
}
