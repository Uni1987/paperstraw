"use client";

import dynamic from "next/dynamic";
import { DataReportChartsSkeleton } from "@/components/dashboard/DashboardSkeletons";
import type { DataReportChartsProps } from "@/components/DataReportCharts";

const DynamicDataReportCharts = dynamic(
  () => import("@/components/DataReportCharts").then((mod) => mod.DataReportCharts),
  {
    ssr: false,
    loading: () => <DataReportChartsSkeleton />
  }
);

export function LazyDataReportCharts(props: DataReportChartsProps) {
  return <DynamicDataReportCharts {...props} />;
}
