import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { isAdminAuthorizationResponse, requireAdminRequest } from "@/lib/auth/adminAuthorization";
import { applyApprovedMmsiReviewCandidates } from "@/lib/cruises/mmsiReviewWorkflow";
import { logSecurityAuditEvent } from "@/lib/security/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const applyApprovedSchema = z.object({ confirm: z.boolean().optional() }).strict();
const MAX_REQUEST_BODY_BYTES = 1024;

export async function POST(request: NextRequest) {
  const authorization = await requireAdminRequest(request, {
    action: "cruises.mmsi-candidates.apply-approved",
    source: "/api/admin/cruises/mmsi-candidates/apply-approved",
    mutation: true
  });
  if (isAdminAuthorizationResponse(authorization)) return authorization;

  try {
    const body = await readJsonBody(request);
    const parsed = applyApprovedSchema.safeParse(body);
    if (!parsed.success) {
      logSecurityAuditEvent({
        action: "cruises.mmsi-candidates.apply-approved",
        result: "rejected",
        source: "/api/admin/cruises/mmsi-candidates/apply-approved",
        requestId: authorization.requestId,
        adminUsername: authorization.adminUsername,
        reason: "invalid-body"
      });
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    const confirm = parsed.data.confirm === true;
    const result = await applyApprovedMmsiReviewCandidates({ confirm });

    logSecurityAuditEvent({
      action: confirm ? "cruises.mmsi-candidates.apply-approved.confirm" : "cruises.mmsi-candidates.apply-approved.dry-run",
      result: "success",
      source: "/api/admin/cruises/mmsi-candidates/apply-approved",
      requestId: authorization.requestId,
      adminUsername: authorization.adminUsername
    });

    return NextResponse.json(result);
  } catch {
    logSecurityAuditEvent({
      action: "cruises.mmsi-candidates.apply-approved",
      result: "failed",
      source: "/api/admin/cruises/mmsi-candidates/apply-approved",
      requestId: authorization.requestId,
      adminUsername: authorization.adminUsername,
      reason: "operation-failed"
    });
    return NextResponse.json({ error: "Apply approved failed." }, { status: 500 });
  }
}

async function readJsonBody(request: NextRequest) {
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BODY_BYTES) throw new Error("Request body too large");
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_REQUEST_BODY_BYTES) throw new Error("Request body too large");
  if (!text.trim()) return {};
  return JSON.parse(text) as unknown;
}
