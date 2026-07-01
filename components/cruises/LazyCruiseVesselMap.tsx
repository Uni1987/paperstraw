"use client";

import dynamic from "next/dynamic";
import { DashboardMapSkeleton } from "@/components/dashboard/DashboardSkeletons";
import type { CruiseMapPoint, CruiseMapWeighting } from "@/lib/cruises/queries";

const DynamicCruiseVesselMap = dynamic(
  () => import("@/components/cruises/CruiseVesselMap").then((mod) => mod.CruiseVesselMap),
  {
    ssr: false,
    loading: () => <DashboardMapSkeleton />
  }
);

export function LazyCruiseVesselMap({
  points,
  mapWeighting,
  latestPositionLabel,
  freshnessWindowHours,
  monitoredRegionCount
}: {
  points: CruiseMapPoint[];
  mapWeighting: CruiseMapWeighting;
  latestPositionLabel: string;
  freshnessWindowHours: number;
  monitoredRegionCount: number;
}) {
  return (
    <DynamicCruiseVesselMap
      points={points}
      mapWeighting={mapWeighting}
      latestPositionLabel={latestPositionLabel}
      freshnessWindowHours={freshnessWindowHours}
      monitoredRegionCount={monitoredRegionCount}
    />
  );
}
