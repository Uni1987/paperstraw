"use client";

import dynamic from "next/dynamic";
import { DashboardMapSkeleton } from "@/components/dashboard/DashboardSkeletons";
import type { CruiseMapMode, CruiseMapPoint } from "@/lib/cruises/queries";

const DynamicCruiseVesselMap = dynamic(
  () => import("@/components/cruises/CruiseVesselMap").then((mod) => mod.CruiseVesselMap),
  {
    ssr: false,
    loading: () => <DashboardMapSkeleton />
  }
);

export function LazyCruiseVesselMap({
  points,
  mapMode,
  latestPositionLabel,
  freshnessWindowHours,
  monitoredRegionCount
}: {
  points: CruiseMapPoint[];
  mapMode: CruiseMapMode;
  latestPositionLabel: string;
  freshnessWindowHours: number;
  monitoredRegionCount: number;
}) {
  return (
    <DynamicCruiseVesselMap
      points={points}
      mapMode={mapMode}
      latestPositionLabel={latestPositionLabel}
      freshnessWindowHours={freshnessWindowHours}
      monitoredRegionCount={monitoredRegionCount}
    />
  );
}
