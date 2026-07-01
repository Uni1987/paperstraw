import Link from "next/link";
import { Anchor, Fuel, Ship, Waves } from "lucide-react";
import { PublicShell } from "@/components/PublicShell";
import { getCruiseDashboardData, type CruiseMapPoint, type CruiseRankRow } from "@/lib/cruises/queries";

export const dynamic = "force-dynamic";

export default async function CruisesPage() {
  const data = await getCruiseDashboardData();

  return (
    <PublicShell>
      <section className="mx-auto max-w-7xl pb-20 pt-10 sm:pt-16">
        <div className="max-w-4xl">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-paper">Cruise emissions</p>
          <h1 className="mt-4 text-5xl font-semibold tracking-normal text-white sm:text-7xl">Cruise ship emissions</h1>
          <p className="mt-6 text-lg leading-8 text-white/68 sm:text-xl">
            Live AIS ship tracking translated into estimated CO2 emissions.
          </p>
          <p className="mt-4 max-w-3xl text-sm leading-6 text-white/48">
            AISStream.io provides movement data. EMSA THETIS-MRV annual disclosures provide the emissions baseline where
            available. Daily cruise values are estimates, not official real-time emissions.
          </p>
        </div>

        {!data.enabled ? (
          <section className="mt-12 rounded-2xl border border-paper/25 bg-paper/10 p-6">
            <h2 className="text-2xl font-semibold text-white">Cruises module is prepared</h2>
            <p className="mt-3 max-w-3xl text-white/64">
              Enable it with <code className="rounded bg-black/40 px-1.5 py-0.5 text-paper">ENABLE_CRUISES=true</code>{" "}
              after running the database migration and importing MRV data. AIS ingestion remains disabled unless{" "}
              <code className="rounded bg-black/40 px-1.5 py-0.5 text-paper">ENABLE_AISSTREAM_INGESTION=true</code> is set.
            </p>
          </section>
        ) : (
          <>
            <div className="mt-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <KpiCard title="Cruise CO2 today" value={formatTonnes(data.kpis.co2TodayTonnes)} icon={<Waves size={22} />} />
              <KpiCard title="Cruise CO2 YTD" value={formatTonnes(data.kpis.co2YtdTonnes)} icon={<Ship size={22} />} />
              <KpiCard title="Ships currently tracked" value={formatInteger(data.kpis.trackedShips)} icon={<Anchor size={22} />} />
              <KpiCard title="Fuel burned today" value={formatTonnes(data.kpis.fuelTodayTonnes)} icon={<Fuel size={22} />} />
            </div>

            <section className="mt-6 overflow-hidden rounded-2xl border border-white/10 bg-[#08100f] shadow-2xl shadow-black/35">
              <div className="border-b border-white/10 px-5 py-4">
                <p className="text-sm font-semibold uppercase tracking-normal text-white">Live cruise positions</p>
                <p className="mt-1 text-sm text-white/46">Latest relevant AIS positions in the configured cruise regions.</p>
              </div>
              <CruisePositionMap points={data.mapPoints} />
            </section>

            <div className="mt-6 grid gap-6 xl:grid-cols-2">
              <CruiseRankingTable title="Top 100 cruise emitters today" rows={data.topToday} />
              <CruiseRankingTable title="Top cruise emitters YTD" rows={data.topYtd} />
            </div>

            <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_0.8fr]">
              <OperatorTable rows={data.operators} />
              <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-6">
                <p className="text-sm font-semibold uppercase tracking-normal text-paper">Sources and confidence</p>
                <h2 className="mt-3 text-2xl font-semibold text-white">Directional emissions awareness</h2>
                <div className="mt-5 space-y-4 text-sm leading-6 text-white/60">
                  <p>
                    AIS provides vessel position, speed, heading, destination and voyage metadata when available. MRV
                    records provide annual CO2 and fuel baselines for qualifying ships matched by IMO.
                  </p>
                  <p>
                    Daily estimates use observed underway time and distance. When MRV data is unavailable, PaperStraw uses a
                    lower-confidence heuristic based on ship size and movement.
                  </p>
                  <p>
                    Sources: AISStream.io and EMSA THETIS-MRV public annual ship emissions data.
                  </p>
                </div>
              </section>
            </div>
          </>
        )}
      </section>
    </PublicShell>
  );
}

function KpiCard({ title, value, icon }: { title: string; value: string; icon: React.ReactNode }) {
  return (
    <article className="rounded-2xl border border-white/10 bg-white/[0.035] p-5">
      <div className="flex items-center justify-between gap-4">
        <p className="text-xs font-semibold uppercase tracking-normal text-white/55">{title}</p>
        <span className="rounded-xl border border-paper/25 bg-paper/10 p-2 text-paper">{icon}</span>
      </div>
      <p className="mt-5 text-3xl font-semibold tracking-normal text-white">{value}</p>
      <p className="mt-2 text-sm text-white/44">Estimated from stored cruise data</p>
    </article>
  );
}

function CruisePositionMap({ points }: { points: CruiseMapPoint[] }) {
  return (
    <div className="relative h-[460px] overflow-hidden bg-[#050908] sm:h-[520px]">
      <div className="absolute inset-0 opacity-80 [background:radial-gradient(circle_at_20%_35%,rgba(217,164,65,0.08),transparent_18%),radial-gradient(circle_at_62%_36%,rgba(148,71,255,0.08),transparent_22%),linear-gradient(180deg,#07100f,#030706)]" />
      <div className="absolute inset-0 opacity-35 [background-image:linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] [background-size:8.333%_16.666%]" />
      <div className="absolute left-[12%] top-[22%] h-[28%] w-[22%] rounded-[60%_40%_48%_52%] border border-white/10 bg-white/[0.035]" />
      <div className="absolute left-[42%] top-[17%] h-[33%] w-[17%] rounded-[45%_55%_60%_40%] border border-white/10 bg-white/[0.035]" />
      <div className="absolute left-[56%] top-[28%] h-[30%] w-[24%] rounded-[55%_45%_50%_50%] border border-white/10 bg-white/[0.035]" />
      {points.map((point) => (
        <Link
          key={`${point.shipId}-${point.timestamp.toISOString()}`}
          href={`/cruises/${point.shipId}`}
          className="group absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-paper shadow-[0_0_18px_rgba(217,164,65,0.9)]"
          style={{
            left: `${((point.longitude + 180) / 360) * 100}%`,
            top: `${((90 - point.latitude) / 180) * 100}%`
          }}
          aria-label={`Open ${point.name}`}
        >
          <span className="pointer-events-none absolute bottom-4 left-1/2 hidden w-56 -translate-x-1/2 rounded-lg border border-white/10 bg-black/85 p-3 text-left text-xs text-white shadow-xl group-hover:block">
            <span className="block font-semibold">{point.name}</span>
            <span className="mt-1 block text-white/58">{point.operator}</span>
            <span className="mt-2 block text-white/72">MMSI {point.mmsi}</span>
            {point.speedOverGround !== null ? <span className="block text-white/58">{point.speedOverGround.toFixed(1)} kn</span> : null}
          </span>
        </Link>
      ))}
      <div className="absolute bottom-4 left-4 rounded-lg border border-white/10 bg-black/45 px-3 py-2 text-xs text-white/60">
        {points.length ? `${points.length.toLocaleString("en-US")} latest positions` : "No recent AIS positions yet"}
      </div>
    </div>
  );
}

function CruiseRankingTable({ title, rows }: { title: string; rows: CruiseRankRow[] }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.035]">
      <div className="border-b border-white/10 px-5 py-4">
        <h2 className="text-sm font-semibold uppercase tracking-normal text-white">{title}</h2>
      </div>
      <div className="max-h-[560px] overflow-auto">
        <table className="min-w-full text-sm">
          <tbody className="divide-y divide-white/10">
            {rows.length ? (
              rows.map((row, index) => (
                <tr key={row.shipId}>
                  <td className="px-5 py-4 text-white/38">{index + 1}</td>
                  <td className="px-5 py-4">
                    <Link href={`/cruises/${row.shipId}`} className="font-semibold text-white hover:text-paper">
                      {row.shipName}
                    </Link>
                    <p className="mt-1 text-xs text-white/42">{row.operator}</p>
                  </td>
                  <td className="px-5 py-4 text-right font-semibold tabular-nums text-white">{formatTonnes(row.co2Tonnes)}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td className="px-5 py-8 text-center text-white/48">No cruise estimates yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function OperatorTable({ rows }: { rows: Array<{ operator: string; co2Tonnes: number; ships: number }> }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.035]">
      <div className="border-b border-white/10 px-5 py-4">
        <h2 className="text-sm font-semibold uppercase tracking-normal text-white">Biggest operators by estimated CO2</h2>
      </div>
      <div className="divide-y divide-white/10">
        {rows.length ? (
          rows.map((row) => (
            <div key={row.operator} className="grid grid-cols-[1fr_auto] gap-4 px-5 py-4">
              <div>
                <p className="font-semibold text-white">{row.operator}</p>
                <p className="mt-1 text-xs text-white/42">{row.ships.toLocaleString("en-US")} tracked ship(s)</p>
              </div>
              <p className="font-semibold tabular-nums text-white">{formatTonnes(row.co2Tonnes)}</p>
            </div>
          ))
        ) : (
          <p className="px-5 py-8 text-center text-white/48">No operator estimates yet.</p>
        )}
      </div>
    </section>
  );
}

function formatTonnes(value: number) {
  return `${Math.round(value).toLocaleString("en-US")} t`;
}

function formatInteger(value: number) {
  return value.toLocaleString("en-US");
}

