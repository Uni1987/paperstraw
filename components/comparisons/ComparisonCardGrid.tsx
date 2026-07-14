import {
  COMPARISON_CATEGORIES,
  type ComparisonCardData,
  type ComparisonCategory
} from "@/lib/comparisons";

const categoryPresentation: Record<ComparisonCategory, { title: string; description: string }> = {
  "Everyday Life": {
    title: "Everyday life",
    description: "Travel, fuel, and familiar routines translated into a human scale."
  },
  Households: {
    title: "Homes & energy",
    description: "Household electricity, daily routines, and annual footprint reference points."
  },
  Nature: {
    title: "Nature & land",
    description: "Illustrative tree and annual forest-absorption comparisons."
  },
  "Everyday Products": {
    title: "Products",
    description: "Indicative production footprints for familiar consumer goods."
  }
};

export function ComparisonCardGrid({ comparisons }: { comparisons: ComparisonCardData[] }) {
  return (
    <div className="mt-14 space-y-16">
      {COMPARISON_CATEGORIES.map((category) => {
        const presentation = categoryPresentation[category];
        const cards = comparisons.filter((comparison) => comparison.category === category);
        const sectionId = `comparison-category-${category.replaceAll(" ", "-").toLowerCase()}`;

        if (!cards.length) return null;

        return (
          <section key={category} aria-labelledby={sectionId}>
            <div className="mb-6 flex flex-col gap-2 border-b border-white/10 pb-5 sm:flex-row sm:items-end sm:justify-between">
              <h2 id={sectionId} className="text-3xl font-semibold tracking-normal text-white">
                {presentation.title}
              </h2>
              <p className="max-w-xl text-sm leading-6 text-white/46 sm:text-right">{presentation.description}</p>
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
  );
}

function ComparisonCard({ comparison }: { comparison: ComparisonCardData }) {
  return (
    <article className="flex min-h-[21rem] flex-col rounded-lg border border-white/10 bg-white/[0.04] p-6 shadow-2xl shadow-black/20 transition-colors hover:border-white/15 hover:bg-white/[0.055]">
      <div
        className="flex h-12 w-12 items-center justify-center rounded-lg border border-white/10 bg-white/[0.045] text-3xl"
        aria-hidden="true"
      >
        {comparison.icon}
      </div>

      <div className="mt-8 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <p className="text-5xl font-semibold tracking-normal text-paper">{comparison.value}</p>
        <p className="text-xs font-semibold uppercase tracking-[0.13em] text-white/42">{comparison.unit}</p>
      </div>

      <h3 className="mt-6 text-xl font-semibold text-white">{comparison.title}</h3>
      <p className="mt-3 text-sm leading-6 text-white/56">{formatComparisonDescription(comparison)}</p>

      {comparison.extraMetrics?.length ? (
        <div className="mt-5 grid gap-2 border-t border-white/[0.08] pt-4">
          {comparison.extraMetrics.map((metric) => (
            <div key={metric.label} className="flex items-center justify-between gap-3 text-xs">
              <span className="text-white/42">{metric.label}</span>
              <span className="font-semibold tabular-nums text-white/72">{metric.value}</span>
            </div>
          ))}
        </div>
      ) : null}
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
