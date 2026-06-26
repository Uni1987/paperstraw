import Link from "next/link";
import { PublicShell } from "@/components/PublicShell";
import { DEFAULT_PAYPAL_URL, getDonationOptions } from "@/lib/support/donations";

export const dynamic = "force-dynamic";

const fundingStatus = ["Independently operated", "No advertising", "No corporate sponsorships", "Community supported"];

const supportHelpsFund = [
  "Flight data collection",
  "Historical data imports",
  "Hosting infrastructure",
  "Database storage",
  "New transparency visualizations"
];

export default function SupportPage() {
  const donationOptions = getDonationOptions();
  const paypalOption = donationOptions.find((option) => option.id === "paypal");
  const paypalUrl = paypalOption?.href ?? DEFAULT_PAYPAL_URL;

  return (
    <PublicShell>
      <section className="mx-auto max-w-6xl py-16 lg:py-24">
        <div className="max-w-4xl">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-paper">Optional support</p>
          <h1 className="mt-4 text-5xl font-semibold tracking-normal text-white sm:text-7xl">Support the mission</h1>
          <p className="mt-6 max-w-3xl text-xl leading-8 text-white/70">
            PaperStraw is an independent transparency project.
          </p>
          <p className="mt-5 max-w-3xl text-base leading-7 text-white/58">
            Contributions help keep private jet emissions data understandable, maintainable, and publicly accessible
            without naming individuals or exposing personal ownership claims.
          </p>
          <div className="mt-8">
            <a
              href={paypalUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex rounded-full border border-paper bg-paper px-6 py-3 text-sm font-semibold text-charcoal transition hover:bg-transparent hover:text-paper"
            >
              Support via PayPal
            </a>
          </div>
        </div>
      </section>

      <section className="border-y border-white/10 bg-white/[0.025]">
        <div className="mx-auto grid max-w-6xl gap-8 py-16 lg:grid-cols-2">
          <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-6">
            <h2 className="text-2xl font-semibold tracking-normal text-white">Why support matters</h2>
            <div className="mt-6 grid gap-3">
              {fundingStatus.map((item) => (
                <div key={item} className="flex items-center gap-3 rounded-lg border border-white/10 bg-charcoal/35 px-4 py-3 text-white/72">
                  <span className="h-2 w-2 rounded-full bg-paper" aria-hidden="true" />
                  {item}
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-6">
            <h2 className="text-2xl font-semibold tracking-normal text-white">Your support funds</h2>
            <div className="mt-6 grid gap-3">
              {supportHelpsFund.map((item) => (
                <div key={item} className="rounded-lg border border-white/10 bg-charcoal/35 px-4 py-3 text-white/72">
                  {item}
                </div>
              ))}
            </div>
          </section>
        </div>
      </section>

      <section className="mx-auto max-w-6xl py-14">
        <div className="rounded-lg border border-white/10 bg-white/[0.035] p-6">
          <p className="text-base leading-7 text-white/64">
            PaperStraw is not affiliated with any government, political organization, airline, aircraft manufacturer, or
            aviation company.
          </p>
          <p className="mt-4 text-sm leading-6 text-white/50">
            Support is optional and separate from the data itself. Funding does not change methodology, rankings, imports,
            or privacy rules.
          </p>
          <Link href="/methodology" className="mt-6 inline-flex text-sm font-semibold text-paper hover:text-white">
            Read the methodology
          </Link>
        </div>
      </section>
    </PublicShell>
  );
}
