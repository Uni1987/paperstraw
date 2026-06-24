import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { AnimatedValue } from "@/components/AnimatedValue";
import { EditorialChart } from "@/components/EditorialChart";
import { Reveal } from "@/components/Reveal";
import { getAwarenessDashboardData } from "@/lib/awareness/aggregates";
import { getImportFreshness } from "@/lib/ingestion/freshness";
import { getDonationOptions } from "@/lib/support/donations";
import { formatCompactNumber, formatKm } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [data, freshness] = await Promise.all([getAwarenessDashboardData(), getImportFreshness()]);
  const trendSeries = data.monthlySeries.length > 1 ? data.monthlySeries : data.dailySeries;
  const donationOptions = getDonationOptions();

  const impactMetrics = [
    { label: "Flights today", value: data.todayFlights.toLocaleString() },
    { label: "Distance today", value: formatKm(data.todayDistanceKm) },
    { label: "CO2 today", value: `${Math.round(data.todayCo2Kg / 1000).toLocaleString()} tonnes` },
    { label: "CO2 this year", value: `${Math.round(data.yearCo2Kg / 1000).toLocaleString()} tonnes` }
  ];

  const equivalents = [
    {
      icon: "🥤",
      value: formatCompactNumber(data.equivalents.paperStraws),
      label: "paper straws",
      detail: "estimated production emissions"
    },
    {
      icon: "🚗",
      value: formatCompactNumber(data.equivalents.cars),
      label: "cars for a year",
      detail: "annual passenger-car emissions"
    },
    {
      icon: "🏠",
      value: formatCompactNumber(data.equivalents.households),
      label: "homes for a year",
      detail: "household energy emissions"
    },
    {
      icon: "🌳",
      value: formatCompactNumber(data.equivalents.trees),
      label: "trees to offset it",
      detail: "annual tree absorption"
    }
  ];

  return (
    <main className="bg-charcoal text-white">
      <section className="mx-auto grid min-h-[calc(100svh-4.5rem)] max-w-7xl items-center gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[minmax(0,1fr)_220px] lg:gap-14 lg:px-8">
        <div>
          <Reveal>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-paper">Aggregated private jet emissions</p>
          </Reveal>

          <div className="mt-10 max-w-6xl">
            <Reveal delay={0.05}>
              <h1 className="text-6xl font-semibold tracking-normal text-white sm:text-8xl lg:text-9xl">PaperStraw</h1>
            </Reveal>
            <Reveal delay={0.12}>
              <p className="mt-8 max-w-4xl text-4xl font-semibold leading-[1.05] tracking-normal text-white sm:text-6xl lg:text-7xl">
                While you&apos;re using a paper straw...
              </p>
            </Reveal>
          </div>

          <Reveal className="mt-12" delay={0.2}>
            <p className="text-xl text-white/62 sm:text-2xl">Private jets emitted</p>
            <div className="mt-4 max-w-6xl text-[4.6rem] font-semibold leading-[0.92] tracking-normal text-paper sm:text-[8rem] lg:text-[10rem] xl:text-[11rem]">
              <AnimatedValue value={data.yearCo2Kg} format="tonnes" />
            </div>
            <p className="mt-6 text-xl text-white/62 sm:text-2xl">this year.</p>
          </Reveal>

          <Reveal className="mt-10 flex flex-wrap items-center gap-3" delay={0.28}>
            <span className="rounded-full border border-white/12 bg-white/[0.04] px-4 py-2 text-sm text-white/72">
              {data.isDemo ? "Demo data" : "Based on the latest imported flight data."}
            </span>
            <span className="rounded-full border border-white/12 bg-white/[0.04] px-4 py-2 text-sm text-white/72">
              Updated throughout the day using scheduled data imports.
            </span>
            <span className="rounded-full border border-white/12 bg-white/[0.04] px-4 py-2 text-sm text-white/72">
              {freshness.publicMessage}
            </span>
            <Link
              href="/methodology"
              className="rounded-full border border-paper/45 px-4 py-2 text-sm font-semibold text-paper transition hover:border-paper hover:bg-paper hover:text-charcoal"
            >
              How it works
            </Link>
          </Reveal>
        </div>

        <Reveal className="hidden justify-self-center opacity-85 md:block lg:mb-auto lg:mr-0 lg:mt-8" delay={0.16}>
          <Image
            src="/logo/paperstraw-mark.png"
            alt="PaperStraw logo mark"
            width={220}
            height={229}
            sizes="(min-width: 1024px) 220px, 160px"
            className="h-auto w-40 lg:w-[220px]"
            priority
          />
        </Reveal>
      </section>

      <section className="border-y border-white/10 bg-graphite">
        <div className="mx-auto grid max-w-7xl gap-px px-4 py-6 sm:grid-cols-2 sm:px-6 lg:grid-cols-4 lg:px-8">
          {impactMetrics.map((metric) => (
            <div key={metric.label} className="py-6 sm:px-5">
              <p className="text-sm text-white/50">{metric.label}</p>
              <p className="mt-3 text-3xl font-semibold tracking-normal text-white sm:text-4xl">{metric.value}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
        <Reveal className="max-w-4xl">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-paper">The paper-straw comparison</p>
          <h2 className="mt-5 text-4xl font-semibold leading-tight tracking-normal text-white sm:text-6xl">
            Private jets emitted enough CO2 this year to:
          </h2>
        </Reveal>

        <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {equivalents.map((item, index) => (
            <Reveal key={item.label} delay={index * 0.04}>
              <article className="min-h-72 rounded-lg border border-white/10 bg-white/[0.045] p-6 shadow-2xl shadow-black/20">
                <div className="text-4xl" aria-hidden="true">
                  {item.icon}
                </div>
                <p className="mt-10 text-5xl font-semibold tracking-normal text-paper sm:text-6xl">{item.value}</p>
                <h3 className="mt-4 text-2xl font-semibold text-white">{item.label}</h3>
                <p className="mt-3 text-sm leading-6 text-white/54">{item.detail}. Estimated.</p>
              </article>
            </Reveal>
          ))}
        </div>
        <Reveal className="mt-8" delay={0.18}>
          <Link
            href="/comparisons"
            className="inline-flex rounded-full border border-paper/45 px-5 py-3 text-sm font-semibold text-paper transition hover:border-paper hover:bg-paper hover:text-charcoal"
          >
            More comparisons
          </Link>
        </Reveal>
      </section>

      <StorySection
        eyebrow="Emissions over time"
        title="The point is the trend, not the live dot."
        description="PaperStraw is built around scheduled batch imports and stored aggregates, so the public view stays focused on climate impact over time."
      >
        <EditorialChart kind="time" data={trendSeries} />
      </StorySection>

      <StorySection
        eyebrow="Top countries"
        title="Where the estimated impact concentrates."
        description="Country totals are derived from airport metadata and conservative ICAO prefix mapping where available. Unattributed endpoints are excluded from rankings until better source data is imported."
      >
        <EditorialChart kind="rank" data={data.topCountries} />
      </StorySection>

      <StorySection
        eyebrow="Top airports"
        title="Airports tell the story without naming people."
        description="PaperStraw avoids owner claims and individual leaderboards. The public experience is aggregate-first by design."
      >
        <EditorialChart kind="rank" data={data.topAirports} />
      </StorySection>

      <section className="border-t border-white/10 bg-bone py-20 text-ink sm:py-24">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8">
          <Reveal>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-clay">How we estimate emissions</p>
            <h2 className="mt-5 text-4xl font-semibold leading-tight tracking-normal sm:text-5xl">Transparent by default.</h2>
          </Reveal>
          <div className="grid gap-6 text-base leading-7 text-ink/72 sm:grid-cols-2">
            <MethodPoint title="Data sources" text="ADSB.lol is the primary scheduled source, with OpenSky and CSV imports available for fallback and backfills." />
            <MethodPoint title="Aircraft filtering" text="Imports are filtered to configured private and business jet aircraft type codes before aggregation." />
            <MethodPoint title="Emission estimates" text="Flight distance is multiplied by configurable aircraft-type emission factors. Every CO2 value is an estimate." />
            <MethodPoint title="Limitations" text="Coverage can be incomplete, delayed, or missing route context, so rankings should be read as awareness signals." />
          </div>
        </div>
      </section>

      <section id="support" className="bg-charcoal px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
        <Reveal className="mx-auto max-w-4xl text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-paper">Support the mission</p>
          <h2 className="mt-5 text-4xl font-semibold leading-tight tracking-normal text-white sm:text-6xl">
            Support the mission
          </h2>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-white/62">
            PaperStraw is an independent transparency project that turns private jet emissions into understandable public
            data.
          </p>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-white/54">
            Support helps keep the project running, improve data quality, cover hosting and ingestion costs, and
            potentially expand into other transparency branches such as AI and industry emissions.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            {donationOptions.length ? (
              donationOptions.map((option) => (
                <a
                  key={option.id}
                  href={option.href ?? `/support#${option.id}`}
                  className="rounded-full border border-paper/45 px-5 py-3 text-sm font-semibold text-paper transition hover:border-paper hover:bg-paper hover:text-charcoal"
                  rel="noreferrer"
                  target={option.kind === "link" ? "_blank" : undefined}
                >
                  {option.label}
                </a>
              ))
            ) : (
              <Link
                href="/support"
                className="rounded-full border border-paper/45 px-5 py-3 text-sm font-semibold text-paper transition hover:border-paper hover:bg-paper hover:text-charcoal"
              >
                Support options
              </Link>
            )}
          </div>
        </Reveal>
      </section>
    </main>
  );
}

function StorySection({
  eyebrow,
  title,
  description,
  children
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
      <Reveal className="max-w-3xl">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-paper">{eyebrow}</p>
        <h2 className="mt-5 text-4xl font-semibold leading-tight tracking-normal text-white sm:text-6xl">{title}</h2>
        <p className="mt-5 text-lg leading-8 text-white/60">{description}</p>
      </Reveal>
      <div className="mt-10">{children}</div>
    </section>
  );
}

function MethodPoint({ title, text }: { title: string; text: string }) {
  return (
    <div>
      <h3 className="font-semibold text-ink">{title}</h3>
      <p className="mt-2">{text}</p>
    </div>
  );
}
