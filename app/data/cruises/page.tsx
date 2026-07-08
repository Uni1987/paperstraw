import Link from "next/link";
import { ModuleInfoNav } from "@/components/ModuleInfoNav";
import { PublicShell } from "@/components/PublicShell";
import { buildGlobalLocalFilterStatusReport } from "@/lib/cruises/globalLocalFilterStatus";
import type { ReactNode } from "react";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function CruiseDataPage() {
  const [status24h, status30d] = await Promise.all([
    buildGlobalLocalFilterStatusReport({ sinceHours: 24, format: "json", force: false, includeReviewDetails: false, includeVesselDetails: false }),
    buildGlobalLocalFilterStatusReport({ sinceHours: 24 * 30, format: "json", force: false, includeReviewDetails: false, includeVesselDetails: false })
  ]);

  return (
    <PublicShell>
      <section className="mx-auto max-w-7xl pb-14 pt-16 sm:pt-24">
        <ModuleInfoNav
          hubHref="/data"
          hubLabel="Back to Data hub"
          currentModule="Cruises"
          siblingHref="/data/private-jets"
          siblingLabel="View Private Jet Data"
        />
        <div className="max-w-4xl">
          <p className="text-sm font-semibold uppercase tracking-normal text-paper">Cruise data</p>
          <h1 className="mt-4 text-5xl font-semibold tracking-normal text-white sm:text-6xl lg:text-7xl">
            Verified tracked cruise vessels
          </h1>
          <p className="mt-6 text-lg leading-8 text-white/68 sm:text-xl">
            PaperStraw cruise data is based on verified ocean cruise registry entries, MMSI-linked vessels, and observed AIS
            positions collected since monitoring began.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-7xl pb-20">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label="Accepted registry entries" value={formatNumber(status24h.registry.acceptedRegistryEntries)} />
          <MetricCard label="MMSI-linked public vessels" value={formatNumber(status24h.registry.verifiedPublicEligibleVessels)} />
          <MetricCard label="Observed last 24h" value={formatNumber(status24h.registry.verifiedVesselsObservedLast24h)} />
          <MetricCard label="Observed last 30d" value={formatNumber(status30d.registry.verifiedVesselsWithStoredPositionsInWindow)} />
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-8 pb-20 lg:grid-cols-2">
        <InfoPanel title="What is included publicly">
          <p>
            Public cruise statistics only include vessels that match an accepted curated ocean-cruise registry entry and have
            a reviewed MMSI link. Candidate passenger vessels, ferries, yachts, river vessels and unresolved AIS identities
            are not included.
          </p>
          <p>
            The distinction matters: accepted registry entries describe the verified fleet scope; MMSI-linked vessels are
            the subset PaperStraw can track in AIS; observed vessels are the subset actually seen in the selected period.
          </p>
        </InfoPanel>

        <InfoPanel title="Coverage is improving">
          <p>
            The cruise module does not claim complete global cruise coverage yet. Registry and MMSI coverage improve as
            exact IMO static-data matches are reviewed, approved and linked.
          </p>
          <p>
            Public totals are therefore best read as emissions estimates from verified tracked cruise vessels observed by
            PaperStraw since monitoring began.
          </p>
        </InfoPanel>
      </section>

      <section className="border-t border-white/10 bg-white/[0.025]">
        <div className="mx-auto max-w-7xl py-16">
          <h2 className="text-3xl font-semibold text-white">Read the cruise methodology</h2>
          <p className="mt-4 max-w-3xl text-sm leading-6 text-white/62">
            The methodology explains AIS-based observations, the verified registry, MMSI review, public eligibility, and
            uncertainty around observed movement estimates.
          </p>
          <Link href="/methodology/cruises" className="mt-6 inline-flex text-sm font-semibold text-paper hover:text-white">
            Open cruise methodology
          </Link>
        </div>
      </section>
    </PublicShell>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-lg border border-white/10 bg-white/[0.035] p-5">
      <p className="text-sm text-white/56">{label}</p>
      <p className="mt-3 text-2xl font-semibold text-white">{value}</p>
    </article>
  );
}

function InfoPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-6">
      <h2 className="text-2xl font-semibold text-white">{title}</h2>
      <div className="mt-5 space-y-4 text-sm leading-6 text-white/62">{children}</div>
    </section>
  );
}

function formatNumber(value: number) {
  return value.toLocaleString("en-US");
}
