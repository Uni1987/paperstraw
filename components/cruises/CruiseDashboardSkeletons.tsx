import { DashboardCard } from "@/components/dashboard/DashboardCard";

export function CruiseKpiSkeleton() {
  return (
    <>
      <section className="-mx-4 mt-4 flex gap-3 overflow-hidden px-4 pb-2 md:hidden" aria-label="Loading cruise statistics">
        {Array.from({ length: 2 }, (_, index) => (
          <SkeletonBlock key={index} className="h-32 min-w-[13.5rem]" />
        ))}
      </section>
      <section className="mt-6 hidden gap-4 md:grid md:grid-cols-2 xl:grid-cols-5" aria-label="Loading cruise statistics">
        {Array.from({ length: 5 }, (_, index) => (
          <SkeletonBlock key={index} className="h-36" />
        ))}
      </section>
    </>
  );
}

export function CruiseInsightsSkeleton() {
  return (
    <>
      <section className="mt-5 grid gap-4 xl:grid-cols-2" aria-label="Loading cruise charts">
        <ChartSkeleton title="Estimated CO2 emissions over time" />
        <ChartSkeleton title="Top cruise ships by estimated CO2" />
      </section>
      <section className="mt-4">
        <ChartSkeleton title="CO2 emissions breakdown" />
      </section>
    </>
  );
}

export function CruiseDataStatusSkeleton() {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4" aria-label="Loading cruise data status">
      <div className="h-3 w-28 animate-pulse rounded bg-white/10" />
      <div className="mt-4 space-y-3">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="border-b border-white/10 pb-3 last:border-0 last:pb-0">
            <div className="h-2 w-16 animate-pulse rounded bg-white/[0.08]" />
            <div className="mt-2 h-4 w-32 animate-pulse rounded bg-white/10" />
          </div>
        ))}
      </div>
    </div>
  );
}

function ChartSkeleton({ title }: { title: string }) {
  return (
    <DashboardCard title={title}>
      <div className="h-80 animate-pulse p-5">
        <div className="h-full rounded-xl border border-white/10 bg-white/[0.035]" />
      </div>
    </DashboardCard>
  );
}

function SkeletonBlock({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-2xl border border-white/10 bg-white/[0.035] ${className}`} />;
}
