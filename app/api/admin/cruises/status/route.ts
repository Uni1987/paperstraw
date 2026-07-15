import { NextResponse } from "next/server";
import { isAdminAuthorizationResponse, requireAdminRequest } from "@/lib/auth/adminAuthorization";
import { buildCruiseOpsStatus } from "@/lib/cruises/adminOps";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  const authorization = await requireAdminRequest(request, {
    action: "cruises.admin-status.read",
    source: "/api/admin/cruises/status"
  });
  if (isAdminAuthorizationResponse(authorization)) return authorization;

  const status = await buildCruiseOpsStatus();
  return NextResponse.json(status);
}
