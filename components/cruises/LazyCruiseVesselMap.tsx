"use client";

import dynamic from "next/dynamic";
import { DashboardMapSkeleton } from "@/components/dashboard/DashboardSkeletons";
import type { CruiseMapPoint } from "@/lib/cruises/queries";

const DynamicCruiseVesselMap = dynamic(
  () => import("@/components/cruises/CruiseVesselMap").then((mod) => mod.CruiseVesselMap),
  {
    ssr: false,
    loading: () => <DashboardMapSkeleton />
  }
);

export function LazyCruiseVesselMap({
  points,
  latestPositionLabel,
  freshnessWindowHours
}: {
  points: CruiseMapPoint[];
  latestPositionLabel: string;
  freshnessWindowHours: number;
}) {
  return (
    <DynamicCruiseVesselMap
      points={points}
      latestPositionLabel={latestPositionLabel}
      freshnessWindowHours={freshnessWindowHours}
    />
  );
}

