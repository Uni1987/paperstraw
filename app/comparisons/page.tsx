import Link from "next/link";
import { PublicShell } from "@/components/PublicShell";

const modules = [
  {
    title: "Private Jets",
    href: "/comparisons/private-jets",
    status: "Established module",
    description: "Private jet CO₂ translated into relatable everyday scale comparisons using the existing PaperStraw factors."
  },
  {
    title: "Cruises",
    href: "/comparisons/cruises",
    status: "Verified tracked vessels",
    description: "Estimated CO₂ from verified tracked cruise vessels since monitoring began, translated into everyday comparisons."
  }
];

export default function ComparisonsHubPage() {
  return (
    <PublicShell>
      <section className="mx-auto max-w-7xl pb-16 pt-16 sm:pt-24">
        <p className="text-sm font-semibold uppercase tracking-normal text-paper">Comparisons hub</p>
        <h1 className="mt-4 max-w-4xl text-5xl font-semibold tracking-normal text-white sm:text-6xl lg:text-7xl">
          Understand emissions by module
        </h1>
        <p className="mt-6 max-w-3xl text-lg leading-8 text-white/64">
          Comparisons turn large CO₂ numbers into everyday reference points. Choose a module to keep the context clear.
        </p>
      </section>

      <section className="mx-auto grid max-w-7xl gap-5 pb-24 md:grid-cols-2">
        {modules.map((module) => (
          <Link
            key={module.href}
            href={module.href}
            className="rounded-2xl border border-white/10 bg-white/[0.035] p-6 transition hover:-translate-y-0.5 hover:border-paper/35 hover:bg-white/[0.055]"
          >
            <p className="text-sm font-semibold uppercase text-paper">{module.status}</p>
            <h2 className="mt-4 text-3xl font-semibold text-white">{module.title}</h2>
            <p className="mt-4 text-sm leading-6 text-white/62">{module.description}</p>
            <span className="mt-6 inline-flex text-sm font-semibold text-paper">Open comparisons</span>
          </Link>
        ))}
      </section>
    </PublicShell>
  );
}
