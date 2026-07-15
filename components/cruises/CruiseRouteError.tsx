"use client";

import Link from "next/link";

export function CruiseRouteError({ reset }: { reset: () => void }) {
  return (
    <main className="min-h-screen bg-[#050908] px-5 py-20 text-white">
      <section className="mx-auto max-w-2xl rounded-2xl border border-white/10 bg-white/[0.035] p-7 sm:p-10">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-paper">Cruise data</p>
        <h1 className="mt-4 text-3xl font-semibold">Cruise data is temporarily unavailable</h1>
        <p className="mt-4 max-w-xl text-sm leading-6 text-white/60">
          PaperStraw could not refresh this public view. No unverified vessel data is shown. Please try again shortly.
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={reset}
            className="rounded-lg bg-paper px-4 py-2 text-sm font-semibold text-black transition hover:bg-white"
          >
            Try again
          </button>
          <Link href="/" className="rounded-lg border border-white/10 px-4 py-2 text-sm font-semibold text-white/72 hover:text-white">
            Return to overview
          </Link>
        </div>
      </section>
    </main>
  );
}

