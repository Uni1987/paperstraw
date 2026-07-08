import Link from "next/link";
import { PublicShell } from "@/components/PublicShell";

const modules = [
  {
    title: "Private Jets",
    href: "/methodology/private-jets",
    description: "How PaperStraw estimates private jet CO2 from imported flight records, aircraft-type filters, rollups, and equivalents."
  },
  {
    title: "Cruises",
    href: "/methodology/cruises",
    description: "How PaperStraw uses AIS observations, a curated cruise registry, MMSI review, and verified-public eligibility for cruise estimates."
  }
];

export default function MethodologyHubPage() {
  return (
    <PublicShell>
      <section className="mx-auto max-w-7xl pb-16 pt-16 sm:pt-24">
        <p className="text-sm font-semibold uppercase tracking-normal text-paper">Methodology hub</p>
        <h1 className="mt-4 max-w-4xl text-5xl font-semibold tracking-normal text-white sm:text-6xl lg:text-7xl">
          How PaperStraw estimates emissions
        </h1>
        <p className="mt-6 max-w-3xl text-lg leading-8 text-white/64">
          Each module has its own data sources, inclusion rules, uncertainty and limitations. Choose a methodology to
          inspect the assumptions behind the public numbers.
        </p>
      </section>

      <section className="mx-auto grid max-w-7xl gap-5 pb-24 md:grid-cols-2">
        {modules.map((module) => (
          <Link
            key={module.href}
            href={module.href}
            className="rounded-2xl border border-white/10 bg-white/[0.035] p-6 transition hover:-translate-y-0.5 hover:border-paper/35 hover:bg-white/[0.055]"
          >
            <h2 className="text-3xl font-semibold text-white">{module.title}</h2>
            <p className="mt-4 text-sm leading-6 text-white/62">{module.description}</p>
            <span className="mt-6 inline-flex text-sm font-semibold text-paper">Open methodology</span>
          </Link>
        ))}
      </section>
    </PublicShell>
  );
}
