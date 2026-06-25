import { DashboardHome } from "@/components/dashboard/DashboardHome";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function Home() {
  return <DashboardHome />;
}
