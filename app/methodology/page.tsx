import { PublicShell } from "@/components/PublicShell";
import { PAPER_STRAW_CO2_KG } from "@/lib/awareness/equivalents";
import type { ReactNode } from "react";

export default function MethodologyPage() {
  return (
    <PublicShell>
      <section className="mx-auto max-w-4xl py-16 lg:py-24">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-paper">Transparency</p>
        <h1 className="mt-4 text-5xl font-semibold tracking-normal text-white sm:text-7xl">Methodology</h1>
        <p className="mt-6 max-w-3xl text-lg leading-8 text-white/62">
          PaperStraw is an aggregate climate-awareness project. It estimates private jet CO2 from imported flight records,
          aircraft-type filters, and configurable emission factors.
        </p>

        <div className="mt-12 space-y-10 text-base leading-7 text-white/68">
          <MethodSection title="How emissions are estimated">
            PaperStraw multiplies each flight distance by a configurable aircraft-type emission factor. The default basis is
            kilograms of CO2 per kilometer, stored in the EmissionFactor table. Every value shown is labeled as an estimate
            because actual fuel burn depends on aircraft configuration, weather, routing, load, taxi time, and operations.
          </MethodSection>

          <MethodSection title="Equivalent calculations">
            Cars, households, trees, and paper straws are plain-language comparisons derived from configurable constants in
            code. The paper-straw comparison assumes {PAPER_STRAW_CO2_KG} kg CO2 per straw for a simple production-emissions
            estimate. These equivalents are awareness aids, not precise lifecycle analyses.
          </MethodSection>

          <MethodSection title="Scheduled batch updates">
            The app is designed around regular automated updates throughout the day. The homepage reads stored
            aggregate rollups from the latest import rather than live aircraft positions. This keeps the project lower cost,
            reliable, and focused on trends rather than real-time tracking.
          </MethodSection>

          <MethodSection title="Data sources and aircraft filtering">
            ADSB.lol is treated as the primary recent-data source. OpenSky is available as a fallback and research source, and CSV
            upload remains available for audited backfills. Imported records are filtered to configured private and business
            jet aircraft type codes before aggregation.
          </MethodSection>

          <MethodSection title="Privacy and limitations">
            PaperStraw avoids personal naming, private ownership claims, and individual leaderboards. Coverage can be
            incomplete, delayed, rate-limited, or missing route context. Rankings, trends, and equivalents should be read as
            estimates for awareness and research, not definitive attribution.
          </MethodSection>
        </div>
      </section>
    </PublicShell>
  );
}

function MethodSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-white/10 pt-8">
      <h2 className="text-2xl font-semibold tracking-normal text-white">{title}</h2>
      <p className="mt-4">{children}</p>
    </section>
  );
}
