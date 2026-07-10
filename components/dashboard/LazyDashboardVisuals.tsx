"use client";

import dynamic from "next/dynamic";
import { DashboardMapSkeleton, DashboardVisualsSkeleton } from "@/components/dashboard/DashboardSkeletons";
import type { AwarenessRankPoint, AwarenessSeriesPoint } from "@/lib/awareness/types";
import type { ComparisonCardData } from "@/lib/comparisons";
import type { AirportEmissionPoint, AirportMapPeriodPayload } from "@/lib/dashboard/mapPeriods";

const DynamicAirportEmissionsMap = dynamic(
  () => import("@/components/dashboard/AirportEmissionsMap").then((mod) => mod.AirportEmissionsMap),
  {
    ssr: false,
    loading: () => <DashboardMapSkeleton />
  }
);

const DynamicDashboardVisuals = dynamic(
  () => import("@/components/dashboard/DashboardVisuals").then((mod) => mod.DashboardVisuals),
  {
    ssr: false,
    loading: () => <DashboardVisualsSkeleton />
  }
);

export function LazyAirportEmissionsMap({ airports, periods }: { airports?: AirportEmissionPoint[]; periods?: AirportMapPeriodPayload[] }) {
  return <DynamicAirportEmissionsMap airports={airports} periods={periods} />;
}

export function LazyDashboardVisuals(props: {
  monthlySeries: AwarenessSeriesPoint[];
  topAirports: AwarenessRankPoint[];
  topCountries: AwarenessRankPoint[];
  aircraftTypes: AwarenessRankPoint[];
  comparisons: ComparisonCardData[];
  totalCo2Kg: number;
}) {
  return <DynamicDashboardVisuals {...props} />;
}
