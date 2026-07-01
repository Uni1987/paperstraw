import { DashboardCard } from "@/components/dashboard/DashboardCard";
import { dashboardGridRowClass } from "@/components/dashboard/dashboardGrid";

export function DashboardMapSkeleton() {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#030807] shadow-2xl shadow-black/35">
      <div className="absolute left-4 top-4 z-10 max-w-[15rem] md:left-5 md:top-5 md:max-w-md">
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-white">World airport emissions heatmap</p>
        <p className="mt-2 hidden text-sm leading-5 text-white/58 sm:block">Aggregate CO2 emissions from private jet activity at airports.</p>
      </div>
      <div className="h-[23rem] w-full animate-pulse bg-[radial-gradient(circle_at_25%_45%,rgba(139,92,246,0.16),transparent_28%),radial-gradient(circle_at_58%_38%,rgba(249,115,22,0.14),transparent_26%),linear-gradient(135deg,rgba(255,255,255,0.045),rgba(255,255,255,0.015))] md:h-[36rem]" />
      <div className="absolute bottom-3 left-3 z-10 rounded-xl border border-white/15 bg-[#07100f]/94 p-2.5 shadow-2xl backdrop-blur md:bottom-5 md:left-5 md:bg-[#07100f]/90 md:p-4">
        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-white/74">CO2 emissions tonnes</p>
        <div className="mt-2.5 h-2.5 w-28 rounded-full bg-gradient-to-r from-violet-700 via-orange-500 to-yellow-100 opacity-70 md:mt-3 md:h-3 md:w-44" />
      </div>
    </div>
  );
}

export function DashboardVisualsSkeleton() {
  return (
    <>
      <div className={dashboardGridRowClass}>
        <ChartCardSkeleton title="CO2 emissions over time" />
        <ChartCardSkeleton title="Top airports by CO2 emissions" />
      </div>
      <div className={dashboardGridRowClass}>
        <ChartCardSkeleton title="CO2 emissions breakdown" />
        <ChartCardSkeleton title="CO2 comparisons" />
      </div>
    </>
  );
}

export function DataReportChartsSkeleton() {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <ReportChartSkeleton title="Flights per day" />
      <ReportChartSkeleton title="Imports per day" />
    </div>
  );
}

function ChartCardSkeleton({ title }: { title: string }) {
  return (
    <DashboardCard title={title}>
      <div className="h-80 animate-pulse p-5">
        <div className="h-full rounded-xl border border-white/10 bg-white/[0.035]" />
      </div>
    </DashboardCard>
  );
}

function ReportChartSkeleton({ title }: { title: string }) {
  return (
    <section className="rounded-lg border border-white/10 bg-white/[0.035] p-5">
      <div className="mb-5">
        <h3 className="text-xl font-semibold text-white">{title}</h3>
        <div className="mt-3 h-4 w-2/3 rounded-full bg-white/10" />
      </div>
      <div className="h-72 animate-pulse rounded-xl border border-white/10 bg-white/[0.035]" />
    </section>
  );
}
