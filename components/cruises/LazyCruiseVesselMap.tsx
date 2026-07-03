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
  emptyStateTitle,
  emptyStateDescription
}: {
  points: CruiseMapPoint[];
  mapMode: CruiseMapMode;
  emptyStateTitle?: string;
  emptyStateDescription?: string;
}) {
  return (
    <DynamicCruiseVesselMap
      points={points}
      mapMode={mapMode}
      emptyStateTitle={emptyStateTitle}
      emptyStateDescription={emptyStateDescription}
    />
  );
}
