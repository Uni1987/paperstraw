import Link from "next/link";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const adminModules = [
  {
    title: "Private Jets",
    href: "/admin/private-jets",
    description: "Flight imports, cron refresh status, attribution quality, historical archive status, and emissions validation."
  },
  {
    title: "Cruises",
    href: "/admin/cruises",
    description: "Railway worker health, verified cruise coverage, MMSI review queue actions, and operations alerts."
  }
];

export default function AdminHubPage() {
  return (
    <main className="min-h-screen bg-[#f7faf8] px-4 py-10 text-ink sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <p className="text-sm font-semibold uppercase tracking-normal text-clay">Admin</p>
        <h1 className="mt-3 text-4xl font-bold tracking-normal text-ink">PaperStraw admin hub</h1>
        <p className="mt-4 max-w-3xl text-sm leading-6 text-ink/65">
          Choose the module you want to operate. Each admin area keeps its own data checks and guarded actions so future
          transparency modules can be added without making one dataset the default.
        </p>

        <section className="mt-8 grid gap-5 md:grid-cols-2">
          {adminModules.map((module) => (
            <Link
              key={module.href}
              href={module.href}
              className="rounded-lg border border-ink/10 bg-white p-6 shadow-soft transition hover:-translate-y-0.5 hover:border-clay/30 hover:shadow-lg"
            >
              <p className="text-sm font-semibold uppercase text-clay">{module.title}</p>
              <h2 className="mt-3 text-2xl font-bold text-ink">{module.title} admin</h2>
              <p className="mt-3 text-sm leading-6 text-ink/65">{module.description}</p>
              <span className="mt-6 inline-flex rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white">Open</span>
            </Link>
          ))}
        </section>

        <section className="mt-8 rounded-lg border border-dashed border-ink/15 bg-white/70 p-6">
          <p className="text-sm font-semibold text-ink">Future modules</p>
          <p className="mt-2 text-sm leading-6 text-ink/60">
            Superyachts, datacenters, bitcoin, shipping and other transparency branches can be added here when they have
            verified data models and admin workflows.
          </p>
        </section>
      </div>
    </main>
  );
}
