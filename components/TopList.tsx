import type { LeaderboardRow } from "@/lib/leaderboard/types";
import { formatCo2 } from "@/lib/format";

export function TopList({ title, rows }: { title: string; rows: LeaderboardRow[] }) {
  return (
    <section className="rounded-lg border border-ink/10 bg-white p-5 shadow-soft">
      <h2 className="text-base font-semibold text-ink">{title}</h2>
      <div className="mt-4 space-y-3">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-4 border-b border-ink/10 pb-3 last:border-0 last:pb-0">
            <div>
              <div className="font-medium text-ink">{row.label}</div>
              <div className="text-xs text-ink/55">{row.flights} flights</div>
            </div>
            <div className="text-right text-sm font-semibold tabular-nums text-ink">{formatCo2(row.estimatedCo2Kg)}</div>
          </div>
        ))}
        {rows.length === 0 ? <p className="text-sm text-ink/60">No verified rows yet.</p> : null}
      </div>
    </section>
  );
}
