import { PublicShell } from "@/components/PublicShell";
import { ModuleInfoNav } from "@/components/ModuleInfoNav";
import type { ReactNode } from "react";

export default function CruiseMethodologyPage() {
  return (
    <PublicShell>
      <section className="mx-auto max-w-4xl py-16 lg:py-24">
        <ModuleInfoNav
          hubHref="/methodology"
          hubLabel="Back to Methodology hub"
          currentModule="Cruises"
          siblingHref="/methodology/private-jets"
          siblingLabel="View Private Jet Methodology"
        />
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-paper">Cruise methodology</p>
        <h1 className="mt-4 text-5xl font-semibold tracking-normal text-white sm:text-7xl">Verified tracked cruise vessels</h1>
        <p className="mt-6 max-w-3xl text-lg leading-8 text-white/62">
          PaperStraw estimates cruise emissions from observed AIS movement for verified ocean cruise vessels. Coverage is
          improving over time and should not be read as complete global cruise coverage.
        </p>

        <div className="mt-12 space-y-10 text-base leading-7 text-white/68">
          <MethodSection title="AIS-based observations">
            AIS provides vessel position, speed, heading and static/voyage messages when they are broadcast and received.
            PaperStraw uses a global AIS feed with local filtering, then stores positions only for vessels that are already
            public-eligible under the verified registry and MMSI-link rules.
          </MethodSection>

          <MethodSection title="Verified cruise registry">
            A vessel starts as an accepted registry entry only after manual evidence review. The registry records ocean-cruise
            identity by exact IMO and excludes non-cruise vessels such as ferries, RoPax vessels, river vessels, yachts,
            excursion craft and other out-of-scope passenger vessels.
          </MethodSection>

          <MethodSection title="MMSI review workflow">
            AIS static data can reveal an MMSI for an accepted registry IMO. Those discoveries enter a review queue. A human
            reviewer must approve a safe exact-IMO match before the MMSI becomes linked. No fuzzy name, operator, type,
            destination or dimension matching is used for public eligibility.
          </MethodSection>

          <MethodSection title="Public-eligible vessels">
            Public cruise statistics include only vessels with a verified ocean-cruise registry match and a high-confidence
            MMSI-linked verification record. Accepted registry entries, MMSI-linked vessels and observed vessels are related
            but different counts.
          </MethodSection>

          <MethodSection title="Emissions estimates">
            Cruise CO2 estimates are derived from observed vessel positions and available movement data. Where annual
            references such as EMSA THETIS-MRV disclosures are available, they can inform baseline context; daily public
            values remain estimates from observed activity, not official real-time emissions measurements.
          </MethodSection>

          <MethodSection title="Coverage limitations">
            Cruise totals are tracked since PaperStraw monitoring began. They are not necessarily year-to-date global cruise
            totals and do not claim all cruises worldwide. AIS reception, vessel broadcast behavior, MMSI coverage, registry
            completeness and observation windows can all affect the numbers shown.
          </MethodSection>

          <MethodSection title="Why unverified vessels are excluded">
            AIS passenger traffic can include ferries, regional passenger vessels, river ships, excursion vessels and other
            craft that fall outside the PaperStraw cruise scope. Excluding unverified candidates protects the public dataset from
            inflated or misleading cruise emissions totals.
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
