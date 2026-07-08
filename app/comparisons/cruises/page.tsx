import Link from "next/link";
import { ModuleInfoNav } from "@/components/ModuleInfoNav";
import { PublicShell } from "@/components/PublicShell";

export default function CruiseComparisonsPage() {
  return (
    <PublicShell>
      <section className="mx-auto max-w-5xl py-14 lg:py-20">
        <ModuleInfoNav
          hubHref="/comparisons"
          hubLabel="Back to Comparisons hub"
          currentModule="Cruises"
          siblingHref="/comparisons/private-jets"
          siblingLabel="View Private Jet Comparisons"
        />

        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-paper">Cruise comparisons</p>
        <h1 className="mt-4 text-5xl font-semibold leading-tight tracking-normal text-white sm:text-7xl">
          Cruise comparisons are being prepared
        </h1>
        <p className="mt-6 max-w-3xl text-lg leading-8 text-white/62">
          The cruise module is currently focused on verified AIS tracking, registry coverage, MMSI review and emissions
          estimates from observed activity. Public comparison cards will be added only when the underlying cruise aggregate
          context is stable enough to avoid overclaiming.
        </p>

        <section className="mt-12 rounded-2xl border border-white/10 bg-white/[0.035] p-6">
          <h2 className="text-2xl font-semibold text-white">What future cruise comparisons should represent</h2>
          <ul className="mt-5 space-y-3 text-sm leading-6 text-white/62">
            <li>CO2 emissions from verified tracked cruise vessels.</li>
            <li>Since-monitoring-began totals, not complete global cruise emissions.</li>
            <li>Clear uncertainty around AIS availability, MMSI coverage and observed movement.</li>
          </ul>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/cruises" className="rounded-full border border-paper/30 px-4 py-2 text-sm font-semibold text-paper hover:bg-paper hover:text-charcoal">
              Open cruise overview
            </Link>
            <Link href="/data/cruises" className="rounded-full border border-white/12 px-4 py-2 text-sm font-semibold text-white/70 hover:border-paper/35 hover:text-paper">
              Cruise data
            </Link>
            <Link href="/methodology/cruises" className="rounded-full border border-white/12 px-4 py-2 text-sm font-semibold text-white/70 hover:border-paper/35 hover:text-paper">
              Cruise methodology
            </Link>
          </div>
        </section>
      </section>
    </PublicShell>
  );
}
