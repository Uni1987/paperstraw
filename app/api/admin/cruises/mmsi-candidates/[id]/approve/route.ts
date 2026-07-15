import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { isAdminAuthorizationResponse, requireAdminRequest } from "@/lib/auth/adminAuthorization";
import { approveMmsiReviewCandidate, listMmsiReviewCandidates } from "@/lib/cruises/mmsiReviewWorkflow";
import { logSecurityAuditEvent } from "@/lib/security/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const DEFAULT_APPROVAL_NOTE = "Exact IMO static-data match; no existing MMSI link or conflict.";
const queueIdSchema = z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authorization = await requireAdminRequest(request, {
    action: "cruises.mmsi-candidate.approve",
    source: "/api/admin/cruises/mmsi-candidates/:id/approve",
    mutation: true
  });
  if (isAdminAuthorizationResponse(authorization)) return authorization;

  try {
    const parsedId = queueIdSchema.safeParse((await params).id);
    if (!parsedId.success) {
      logSecurityAuditEvent({
        action: "cruises.mmsi-candidate.approve",
        result: "rejected",
        source: "/api/admin/cruises/mmsi-candidates/:id/approve",
        requestId: authorization.requestId,
        adminUsername: authorization.adminUsername,
        reason: "invalid-route-id"
      });
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    const id = parsedId.data;
    const result = await approveMmsiReviewCandidate(id, DEFAULT_APPROVAL_NOTE);
    const refreshed = await listMmsiReviewCandidates({ status: "all", limit: 100 });
    const candidate = refreshed.rows.find((row) => row.id === id) ?? null;
    const status = result.status === "approved" ? 200 : 400;

    logSecurityAuditEvent({
      action: "cruises.mmsi-candidate.approve",
      result: result.status === "approved" ? "success" : "rejected",
      source: "/api/admin/cruises/mmsi-candidates/:id/approve",
      requestId: authorization.requestId,
      adminUsername: authorization.adminUsername,
      target: id,
      ...(result.status === "approved" ? {} : { reason: "workflow-refused" })
    });

    return NextResponse.json({ result, candidate }, { status });
  } catch {
    logSecurityAuditEvent({
      action: "cruises.mmsi-candidate.approve",
      result: "failed",
      source: "/api/admin/cruises/mmsi-candidates/:id/approve",
      requestId: authorization.requestId,
      adminUsername: authorization.adminUsername,
      reason: "operation-failed"
    });
    return NextResponse.json({ result: { status: "failed", message: "Approval failed." } }, { status: 500 });
  }
}
