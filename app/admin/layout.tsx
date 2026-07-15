import type { ReactNode } from "react";
import { requireAdminPage } from "@/lib/auth/adminAuthorization";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireAdminPage({ action: "admin.page.read", source: "/admin" });
  return children;
}
