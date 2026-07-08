import Link from "next/link";
import { PublicShell } from "@/components/PublicShell";

const modules = [
  {
    title: "Private Jets",
    href: "/data/private-jets",
    eyebrow: "Aggregated flight emissions",
    description: "Import health, aircraft-type aggregates, country and airport rollups, attribution quality, and dataset notes for private jet estimates."
  },
  {
    title: "Cruises",
    href: "/data/cruises",
    eyebrow: "Verified tracked cruise vessels",
    description: "Registry coverage, MMSI-linked vessel concepts, observed AIS position coverage, and limitations for the cruise emissions module."
  }
];

export default function DataHubPage() {
  return (
    <PublicShell>
      <section className="mx-auto max-w-7xl pb-16 pt-16 sm:pt-24">
        <p className="text-sm font-semibold uppercase tracking-normal text-paper">Data hub</p>
        <h1 className="mt-4 max-w-4xl text-5xl font-semibold tracking-normal text-white sm:text-6xl lg:text-7xl">
          PaperStraw datasets
        </h1>
        <p className="mt-6 max-w-3xl text-lg leading-8 text-white/64">
          Choose a transparency module to inspect its public dataset, coverage, quality signals, and limitations.
        </p>
      </section>

      <section className="mx-auto grid max-w-7xl gap-5 pb-24 md:grid-cols-2">
        {modules.map((module) => (
          <Link
            key={module.href}
            href={module.href}
            className="rounded-2xl border border-white/10 bg-white/[0.035] p-6 transition hover:-translate-y-0.5 hover:border-paper/35 hover:bg-white/[0.055]"
          >
            <p className="text-sm font-semibold uppercase text-paper">{module.eyebrow}</p>
            <h2 className="mt-4 text-3xl font-semibold text-white">{module.title}</h2>
            <p className="mt-4 text-sm leading-6 text-white/62">{module.description}</p>
            <span className="mt-6 inline-flex text-sm font-semibold text-paper">Open dataset report</span>
          </Link>
        ))}
      </section>
    </PublicShell>
  );
}
