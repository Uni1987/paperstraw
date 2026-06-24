import Link from "next/link";
import { DEFAULT_PAYPAL_URL, getDonationOptions } from "@/lib/support/donations";

export const dynamic = "force-dynamic";

const fundingItems = [
  "Hosting",
  "Flight data collection",
  "Data storage",
  "Future transparency projects",
  "Future AI and industry transparency initiatives"
];

const fundingStatus = ["Independently operated", "No advertising", "No corporate sponsorships", "Community supported"];

const supportHelpsFund = [
  "Data imports",
  "Hosting infrastructure",
  "Database storage",
  "Development time",
  "Future transparency datasets"
];

export default function SupportPage() {
  const donationOptions = getDonationOptions();
  const paypalOption = donationOptions.find((option) => option.id === "paypal");
  const paypalUrl = paypalOption?.href ?? DEFAULT_PAYPAL_URL;

  return (
    <main className="min-h-screen bg-charcoal text-white">
      <section className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:px-8 lg:py-24">
        <div>
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

        <section className="rounded-lg border border-white/10 bg-white/[0.035] p-6">
          <h2 className="text-2xl font-semibold tracking-normal text-white">Contributions help fund</h2>
          <ul className="mt-6 space-y-3 text-base leading-7 text-white/68">
            {fundingItems.map((item) => (
              <li key={item} className="border-b border-white/10 pb-3 last:border-0">
                {item}
              </li>
            ))}
          </ul>
        </section>
      </section>

      <section className="border-y border-white/10 bg-white/[0.025]">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:px-8">
          <section>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-paper">Funding status</p>
            <div className="mt-6 grid gap-3">
              {fundingStatus.map((item) => (
                <div key={item} className="rounded-lg border border-white/10 bg-white/[0.035] px-4 py-3 text-white/72">
                  <span className="mr-3 text-paper" aria-hidden="true">
                    ✓
                  </span>
                  {item}
                </div>
              ))}
            </div>
          </section>

          <section>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-paper">What support helps fund</p>
            <div className="mt-6 grid gap-3">
              {supportHelpsFund.map((item) => (
                <div key={item} className="rounded-lg border border-white/10 bg-white/[0.035] px-4 py-3 text-white/72">
                  {item}
                </div>
              ))}
            </div>
          </section>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:px-8">
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
    </main>
  );
}
