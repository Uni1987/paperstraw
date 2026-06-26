import type { ReactNode } from "react";

export function StatCard({
  label,
  value,
  detail,
  accent = "green",
  icon,
  compact = false
}: {
  label: string;
  value: string;
  detail: string;
  accent?: "green" | "gold" | "blue" | "purple" | "pink";
  icon: ReactNode;
  compact?: boolean;
}) {
  const accentClass = {
    green: "from-emerald-400/30 text-emerald-300 ring-emerald-300/20",
    gold: "from-paper/30 text-paper ring-paper/20",
    blue: "from-blue-400/30 text-blue-300 ring-blue-300/20",
    purple: "from-violet-400/30 text-violet-300 ring-violet-300/20",
    pink: "from-pink-400/30 text-pink-300 ring-pink-300/20"
  }[accent];

  return (
    <article
      className={`rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.075] to-white/[0.025] shadow-2xl shadow-black/25 ${
        compact ? "min-h-40 p-4" : "p-5"
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div
          className={`flex items-center justify-center rounded-xl bg-gradient-to-br to-transparent ring-1 ${accentClass} ${
            compact ? "h-8 w-8 text-sm" : "h-10 w-10 text-lg"
          }`}
          aria-hidden="true"
        >
          {icon}
        </div>
        <p className={`text-right font-semibold uppercase tracking-[0.14em] text-white/54 ${compact ? "text-[0.62rem]" : "text-[0.68rem]"}`}>
          {label}
        </p>
      </div>
      <p className={`font-semibold tracking-normal text-white ${compact ? "mt-4 text-2xl" : "mt-5 text-3xl md:text-4xl"}`}>{value}</p>
      <p className={`mt-2 text-white/52 ${compact ? "text-xs leading-5" : "text-sm"}`}>{detail}</p>
    </article>
  );
}
