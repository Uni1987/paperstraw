"use client";

import dynamic from "next/dynamic";
import { CruiseInsightsSkeleton } from "@/components/cruises/CruiseDashboardSkeletons";
import type { ComparisonCardData } from "@/lib/comparisons";
import type { CruiseBreakdownPoint, CruiseDailyEmissionPoint, CruiseRankRow } from "@/lib/cruises/queries";

const DynamicCruiseDashboardCharts = dynamic(
  () => import("@/components/cruises/CruiseDashboardCharts").then((module) => module.CruiseDashboardCharts),
  {
    ssr: false,
    loading: () => <CruiseInsightsSkeleton />
  }
);

export function LazyCruiseDashboardCharts(props: {
  dailyEmissions: CruiseDailyEmissionPoint[];
  topShips: CruiseRankRow[];
  operatorBreakdown: CruiseBreakdownPoint[];
  segmentBreakdown: CruiseBreakdownPoint[];
  comparisons: ComparisonCardData[];
  totalCo2Tonnes: number;
}) {
  return <DynamicCruiseDashboardCharts {...props} />;
}
