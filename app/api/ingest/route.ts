import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdminAuthorizationResponse, requireAdminRequest } from "@/lib/auth/adminAuthorization";
import { runDailyIngestion } from "@/lib/ingestion/daily";
import { runScheduledIngestion } from "@/lib/ingestion/scheduled";
import { logSecurityAuditEvent } from "@/lib/security/audit";

const ingestRequestSchema = z.object({
  provider: z.enum(["daily", "adsb_lol", "adsb_exchange", "opensky"])
}).strict();
const MAX_REQUEST_BODY_BYTES = 1024;

export async function POST(request: Request) {
  const authorization = await requireAdminRequest(request, {
    action: "private-jets.direct-ingest",
    source: "/api/ingest",
    mutation: true
  });
  if (isAdminAuthorizationResponse(authorization)) return authorization;

  let body: unknown;
  try {
    body = await readJsonBody(request);
  } catch {
    logSecurityAuditEvent({
      action: "private-jets.direct-ingest",
      result: "rejected",
      source: "/api/ingest",
      requestId: authorization.requestId,
      adminUsername: authorization.adminUsername,
      reason: "invalid-body"
    });
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const parsed = ingestRequestSchema.safeParse(body);
  if (!parsed.success) {
    logSecurityAuditEvent({
      action: "private-jets.direct-ingest",
      result: "rejected",
      source: "/api/ingest",
      requestId: authorization.requestId,
      adminUsername: authorization.adminUsername,
      reason: "invalid-body"
    });
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  try {
    const response = await ingest(parsed.data.provider);
    logSecurityAuditEvent({
      action: "private-jets.direct-ingest",
      result: "success",
      source: "/api/ingest",
      requestId: authorization.requestId,
      adminUsername: authorization.adminUsername,
      target: parsed.data.provider
    });
    return response;
  } catch {
    logSecurityAuditEvent({
      action: "private-jets.direct-ingest",
      result: "failed",
      source: "/api/ingest",
      requestId: authorization.requestId,
      adminUsername: authorization.adminUsername,
      target: parsed.data.provider,
      reason: "ingestion-failed"
    });
    return NextResponse.json({ error: "Ingestion failed" }, { status: 500 });
  }
}

export function GET() {
  return NextResponse.json(
    { error: "Method not allowed. Use POST for ingestion." },
    { status: 405, headers: { Allow: "POST" } }
  );
}

async function ingest(provider: string | null | undefined) {
  if (provider === "daily") {
    const result = await runDailyIngestion();
    return NextResponse.json(result, { status: result.errors.length ? 207 : 200 });
  }

  if (provider !== "adsb_lol" && provider !== "adsb_exchange" && provider !== "opensky") {
    return NextResponse.json({ error: "provider must be daily, adsb_lol, adsb_exchange or opensky" }, { status: 400 });
  }

  const result = await runScheduledIngestion(provider);
  return NextResponse.json(result, { status: result.errors.length ? 207 : 200 });
}

async function readJsonBody(request: Request) {
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BODY_BYTES) throw new Error("Request body too large");
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_REQUEST_BODY_BYTES) throw new Error("Request body too large");
  return JSON.parse(text) as unknown;
}
