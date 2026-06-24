import type { LeaderboardRow } from "@/lib/leaderboard/types";
import { formatCo2, formatKm } from "@/lib/format";

export function LeaderboardTable({ rows, view }: { rows: LeaderboardRow[]; view: "aircraft" | "entity" }) {
  return (
    <div className="overflow-hidden rounded-lg border border-ink/10 bg-white shadow-soft">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-ink/10 text-sm">
          <thead className="bg-ink text-left text-xs uppercase tracking-normal text-white">
            <tr>
              <th className="w-16 px-4 py-3">Rank</th>
              <th className="px-4 py-3">{view === "entity" ? "Verified public entity" : "Aircraft"}</th>
              <th className="px-4 py-3 text-right">Flights</th>
              <th className="px-4 py-3 text-right">Distance</th>
              <th className="px-4 py-3 text-right">Estimated CO₂</th>
              <th className="px-4 py-3 text-right">Avg / flight</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/10">
            {rows.map((row) => (
              <tr key={row.label} className="bg-white">
                <td className="px-4 py-4 font-semibold text-ink">{row.rank}</td>
                <td className="px-4 py-4">
                  <div className="font-semibold text-ink">{row.label}</div>
                  {row.secondaryLabel ? <div className="text-xs text-ink/55">{row.secondaryLabel}</div> : null}
                </td>
                <td className="px-4 py-4 text-right tabular-nums">{row.flights}</td>
                <td className="px-4 py-4 text-right tabular-nums">{formatKm(row.totalDistanceKm)}</td>
                <td className="px-4 py-4 text-right tabular-nums font-semibold">{formatCo2(row.estimatedCo2Kg)}</td>
                <td className="px-4 py-4 text-right tabular-nums">{formatCo2(row.averageCo2KgPerFlight)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 ? (
        <div className="px-4 py-10 text-center text-sm text-ink/60">No verified records found for this view.</div>
      ) : null}
    </div>
  );
}
