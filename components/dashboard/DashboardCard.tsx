import type { ReactNode } from "react";

export function DashboardCard({
  title,
  eyebrow,
  children,
  className = ""
}: {
  title?: string;
  eyebrow?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`flex h-full flex-col rounded-2xl border border-white/10 bg-white/[0.045] shadow-2xl shadow-black/25 ${className}`}>
      {(title || eyebrow) && (
        <div className="border-b border-white/10 px-5 py-4">
          {eyebrow ? <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-emerald-300">{eyebrow}</p> : null}
          {title ? <h2 className="mt-1 text-sm font-semibold uppercase tracking-[0.08em] text-white">{title}</h2> : null}
        </div>
      )}
      {children}
    </section>
  );
}
