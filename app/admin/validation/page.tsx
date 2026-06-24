import Link from "next/link";
import type { ReactNode } from "react";
import { getEmissionsValidationReport } from "@/lib/validation/emissions";
import { formatCo2, formatKm } from "@/lib/format";

export default async function ValidationPage() {
  const report = await getEmissionsValidationReport(20);

  return (
    <main className="min-h-screen bg-[#f7faf8] px-4 py-10 text-ink sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-normal text-clay">Data quality</p>
            <h1 className="mt-3 text-4xl font-bold tracking-normal text-ink">Emissions validation</h1>
            <p className="mt-4 max-w-3xl text-sm leading-6 text-ink/65">
              This admin-only report checks the top aircraft types by estimated CO2 for unusual averages. It is intended for
              data quality verification, not public ranking or attribution.
            </p>
          </div>
          <Link href="/admin" className="rounded-md border border-ink/15 bg-white px-4 py-2 text-sm font-semibold text-ink hover:bg-mint">
            Back to admin
          </Link>
        </div>

        <section className="mt-8 grid gap-4 md:grid-cols-3">
          <SummaryMetric label="Fleet median CO2 per km" value={`${report.fleetMedianCo2PerKm.toFixed(2)} kg/km`} />
          <SummaryMetric label="CO2/km outlier rule" value="> 5x median" />
          <SummaryMetric label="Distance outlier rule" value="> 10,000 km avg." />
        </section>

        <section className="mt-8 overflow-hidden rounded-lg border border-ink/10 bg-white shadow-soft">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-ink/10 text-sm">
              <thead className="bg-ink text-left text-xs uppercase tracking-normal text-white">
                <tr>
                  <th className="px-4 py-3">Aircraft type</th>
                  <th className="px-4 py-3 text-right">Flights</th>
                  <th className="px-4 py-3 text-right">Total distance</th>
                  <th className="px-4 py-3 text-right">Total CO2</th>
                  <th className="px-4 py-3 text-right">Avg. distance</th>
                  <th className="px-4 py-3 text-right">Avg. CO2</th>
                  <th className="px-4 py-3 text-right">Avg. CO2/km</th>
                  <th className="px-4 py-3">Validation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/10">
                {report.rows.map((row) => {
                  const hasOutlier = row.isCo2PerKmOutlier || row.isDistanceOutlier;
                  return (
                    <tr key={row.aircraftType} className={hasOutlier ? "bg-amber/20" : undefined}>
                      <td className="px-4 py-4 font-semibold text-ink">{row.aircraftType}</td>
                      <td className="px-4 py-4 text-right tabular-nums">{row.totalFlights.toLocaleString()}</td>
                      <td className="px-4 py-4 text-right tabular-nums">{formatKm(row.totalDistanceKm)}</td>
                      <td className="px-4 py-4 text-right tabular-nums font-semibold">{formatCo2(row.totalCo2Kg)}</td>
                      <td className="px-4 py-4 text-right tabular-nums">{formatKm(row.averageDistanceKm)}</td>
                      <td className="px-4 py-4 text-right tabular-nums">{formatCo2(row.averageCo2Kg)}</td>
                      <td className="px-4 py-4 text-right tabular-nums">{row.averageCo2PerKm.toFixed(2)} kg/km</td>
                      <td className="px-4 py-4">
                        <div className="flex flex-wrap gap-2">
                          {row.isCo2PerKmOutlier ? <Badge tone="warning">CO2/km outlier</Badge> : null}
                          {row.isDistanceOutlier ? <Badge tone="warning">Distance outlier</Badge> : null}
                          {!hasOutlier ? <Badge tone="ok">Within rules</Badge> : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {report.rows.length === 0 ? (
                  <tr>
                    <td className="px-4 py-8 text-center text-ink/60" colSpan={8}>
                      No imported flight records are available for validation.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}

function SummaryMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-ink/10 bg-white p-5 shadow-soft">
      <div className="text-sm text-ink/60">{label}</div>
      <div className="mt-3 text-2xl font-bold tracking-normal text-ink">{value}</div>
    </div>
  );
}

function Badge({ children, tone }: { children: ReactNode; tone: "ok" | "warning" }) {
  const classes = tone === "warning" ? "border-clay/35 bg-amber/35 text-ink" : "border-moss/25 bg-mint text-ink";
  return <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${classes}`}>{children}</span>;
}
