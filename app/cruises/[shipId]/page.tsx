import Link from "next/link";
import { notFound } from "next/navigation";
import { PublicShell } from "@/components/PublicShell";
import { calculateCo2Equivalents } from "@/lib/awareness/equivalents";
import { buildComparisonCards } from "@/lib/comparisons";
import { getCruiseShipDetail } from "@/lib/cruises/queries";

export const dynamic = "force-dynamic";

export default async function CruiseShipPage({ params }: { params: { shipId: string } }) {
  const data = await getCruiseShipDetail(params.shipId);

  if (!data.enabled) {
    return (
      <PublicShell>
        <section className="mx-auto max-w-4xl py-20">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-paper">Cruise emissions</p>
          <h1 className="mt-4 text-5xl font-semibold text-white">Cruises module is disabled</h1>
          <p className="mt-5 text-white/62">Set ENABLE_CRUISES=true after running the migration and importing cruise data.</p>
        </section>
      </PublicShell>
    );
  }

  if (!data.ship) notFound();

  const todayCo2 = data.today ? Number(data.today.estimatedCo2Tonnes) : 0;
  const comparisons = buildComparisonCards(data.ytd.co2Tonnes).slice(0, 3);
  const equivalents = calculateCo2Equivalents(data.ytd.co2Tonnes * 1000);

  return (
    <PublicShell>
      <section className="mx-auto max-w-6xl pb-20 pt-10 sm:pt-16">
        <Link href="/cruises" className="text-sm font-semibold text-paper hover:text-white">
          Back to cruise emissions
        </Link>
        <div className="mt-6 grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-paper">Cruise ship detail</p>
            <h1 className="mt-4 text-5xl font-semibold tracking-normal text-white sm:text-7xl">{data.ship.name}</h1>
            <p className="mt-5 text-xl text-white/62">{data.ship.operator ?? "Unknown operator"}</p>
            <div className="mt-6 flex flex-wrap gap-2 text-sm text-white/58">
              {data.ship.imo ? <span className="rounded-full border border-white/10 bg-white/[0.035] px-3 py-1">IMO {data.ship.imo}</span> : null}
              {data.ship.mmsi ? <span className="rounded-full border border-white/10 bg-white/[0.035] px-3 py-1">MMSI {data.ship.mmsi}</span> : null}
              {data.ship.shipType ? <span className="rounded-full border border-white/10 bg-white/[0.035] px-3 py-1">{data.ship.shipType}</span> : null}
            </div>
          </div>
          <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-6">
            <h2 className="text-sm font-semibold uppercase tracking-normal text-white">Current position</h2>
            {data.latestPosition ? (
              <dl className="mt-5 grid gap-4 text-sm">
                <DetailRow label="Latitude" value={Number(data.latestPosition.latitude).toFixed(4)} />
                <DetailRow label="Longitude" value={Number(data.latestPosition.longitude).toFixed(4)} />
                <DetailRow label="Speed" value={data.latestPosition.speedOverGround ? `${Number(data.latestPosition.speedOverGround).toFixed(1)} kn` : "Unknown"} />
                <DetailRow label="Destination" value={data.latestPosition.destination ?? "Unknown"} />
                <DetailRow label="Updated" value={formatDate(data.latestPosition.timestamp)} />
              </dl>
            ) : (
              <p className="mt-5 text-white/52">No AIS position has been stored for this ship yet.</p>
            )}
          </section>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Metric title="CO2 today" value={formatTonnes(todayCo2)} />
          <Metric title="CO2 YTD" value={formatTonnes(data.ytd.co2Tonnes)} />
          <Metric title="Annual MRV CO2" value={data.annual ? formatTonnes(Number(data.annual.annualCo2Tonnes)) : "No MRV match"} />
          <Metric title="Fuel estimate YTD" value={formatTonnes(data.ytd.fuelTonnes)} />
          <Metric title="NOx estimate YTD" value={`${Math.round(data.ytd.noxKg).toLocaleString("en-US")} kg`} />
          <Metric title="SOx estimate YTD" value={`${Math.round(data.ytd.soxKg).toLocaleString("en-US")} kg`} />
          <Metric title="Distance observed YTD" value={`${Math.round(data.ytd.distanceNm).toLocaleString("en-US")} nm`} />
          <Metric title="Paper straws equivalent" value={formatCompact(equivalents.paperStraws)} />
        </div>

        <section className="mt-8 rounded-2xl border border-white/10 bg-white/[0.035] p-6">
          <h2 className="text-sm font-semibold uppercase tracking-normal text-white">Comparisons</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {comparisons.map((comparison) => (
              <article key={comparison.id} className="rounded-xl border border-white/10 bg-black/20 p-5">
                <p className="text-sm text-white/52">{comparison.title}</p>
                <p className="mt-3 text-3xl font-semibold text-white">{comparison.value}</p>
                <p className="mt-2 text-sm leading-6 text-white/48">{comparison.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-8 rounded-2xl border border-white/10 bg-white/[0.035] p-6">
          <h2 className="text-sm font-semibold uppercase tracking-normal text-paper">Methodology</h2>
          <p className="mt-4 max-w-4xl text-sm leading-7 text-white/62">
            AIS provides location, speed and voyage data. THETIS-MRV provides verified annual emissions for qualifying
            ships. Daily emissions are estimated from movement and annual baseline where available. Results are
            directional and are not official real-time emissions.
          </p>
        </section>
      </section>
    </PublicShell>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-3 last:border-0">
      <dt className="text-white/48">{label}</dt>
      <dd className="text-right font-medium text-white">{value}</dd>
    </div>
  );
}

function Metric({ title, value }: { title: string; value: string }) {
  return (
    <article className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
      <p className="text-xs font-semibold uppercase tracking-normal text-white/50">{title}</p>
      <p className="mt-4 text-2xl font-semibold text-white">{value}</p>
      <p className="mt-2 text-sm text-white/42">Estimated where applicable</p>
    </article>
  );
}

function formatTonnes(value: number) {
  return `${Math.round(value).toLocaleString("en-US")} t`;
}

function formatDate(value: Date) {
  return value.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatCompact(value: number) {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

