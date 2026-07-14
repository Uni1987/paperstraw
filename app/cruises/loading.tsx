import {
  CruiseDataStatusSkeleton,
  CruiseInsightsSkeleton,
  CruiseKpiSkeleton
} from "@/components/cruises/CruiseDashboardSkeletons";
import { DashboardMapSkeleton } from "@/components/dashboard/DashboardSkeletons";
import { PublicShell } from "@/components/PublicShell";

export default function CruisesLoading() {
  return (
    <PublicShell sidebarFooter={<CruiseDataStatusSkeleton />}>
      <header>
        <h1 className="max-w-4xl text-3xl font-semibold leading-tight tracking-normal text-white md:text-6xl">
          Cruise ships. Global impact.
        </h1>
        <p className="mt-2 text-base text-white/64 md:mt-4 md:text-xl">
          Live AIS movement data, translated into estimated emissions.
        </p>
      </header>

      <CruiseKpiSkeleton />

      <section className="mt-4 md:mt-6">
        <DashboardMapSkeleton
          title="World cruise activity"
          subtitle="Latest observed verified cruise positions."
          legendTitle="Live cruise vessel activity"
        />
      </section>

      <CruiseInsightsSkeleton />
    </PublicShell>
  );
}
