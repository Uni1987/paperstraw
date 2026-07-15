import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { isValidAdminBasicAuth } from "@/lib/auth/adminAuth";
import { getSecurityRequestId, logSecurityAuditEvent } from "@/lib/security/audit";

export type AdminAuthorizationContext = {
  adminUsername: string;
  requestId: string;
};

type AdminAuthorizationOptions = {
  action: string;
  source: string;
  mutation?: boolean;
  env?: NodeJS.ProcessEnv;
};

export class AdminAuthorizationError extends Error {
  constructor() {
    super("Unauthorized");
    this.name = "AdminAuthorizationError";
  }
}

export async function requireAdminRequest(request: Request, options: AdminAuthorizationOptions) {
  const requestId = getSecurityRequestId(request.headers);
  const env = options.env ?? process.env;
  const authorized = await isValidAdminBasicAuth({
    authorization: request.headers.get("authorization"),
    expectedUsername: env.ADMIN_USERNAME,
    expectedPassword: env.ADMIN_PASSWORD
  });

  if (!authorized) {
    logSecurityAuditEvent({
      action: options.action,
      result: "rejected",
      source: options.source,
      requestId,
      reason: "authentication"
    });
    return unauthorizedAdminResponse();
  }

  if (options.mutation) {
    const originResult = validateAdminMutationOrigin({
      origin: request.headers.get("origin"),
      requestOrigin: new URL(request.url).origin,
      secFetchSite: request.headers.get("sec-fetch-site"),
      configuredOrigins: env.ADMIN_ALLOWED_ORIGINS
    });
    if (!originResult.ok) {
      logSecurityAuditEvent({
        action: options.action,
        result: "rejected",
        source: options.source,
        requestId,
        adminUsername: env.ADMIN_USERNAME,
        reason: originResult.reason
      });
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  return {
    adminUsername: env.ADMIN_USERNAME as string,
    requestId
  } satisfies AdminAuthorizationContext;
}

export async function requireAdminAction(options: Omit<AdminAuthorizationOptions, "mutation">) {
  const requestHeaders = await headers();
  const requestId = getSecurityRequestId(requestHeaders);
  const env = options.env ?? process.env;
  const authorized = await isValidAdminBasicAuth({
    authorization: requestHeaders.get("authorization"),
    expectedUsername: env.ADMIN_USERNAME,
    expectedPassword: env.ADMIN_PASSWORD
  });
  const requestOrigin = getForwardedRequestOrigin(requestHeaders);
  const originResult = validateAdminMutationOrigin({
    origin: requestHeaders.get("origin"),
    requestOrigin,
    secFetchSite: requestHeaders.get("sec-fetch-site"),
    configuredOrigins: env.ADMIN_ALLOWED_ORIGINS
  });

  if (!authorized || !originResult.ok) {
    const reason = !authorized ? "authentication" : originResult.ok ? "authorization" : originResult.reason;
    logSecurityAuditEvent({
      action: options.action,
      result: "rejected",
      source: options.source,
      requestId,
      ...(authorized ? { adminUsername: env.ADMIN_USERNAME } : {}),
      reason
    });
    throw new AdminAuthorizationError();
  }

  return {
    adminUsername: env.ADMIN_USERNAME as string,
    requestId
  } satisfies AdminAuthorizationContext;
}

export async function requireAdminPage(options: Omit<AdminAuthorizationOptions, "mutation">) {
  const requestHeaders = await headers();
  const requestId = getSecurityRequestId(requestHeaders);
  const env = options.env ?? process.env;
  const authorized = await isValidAdminBasicAuth({
    authorization: requestHeaders.get("authorization"),
    expectedUsername: env.ADMIN_USERNAME,
    expectedPassword: env.ADMIN_PASSWORD
  });

  if (!authorized) {
    logSecurityAuditEvent({
      action: options.action,
      result: "rejected",
      source: options.source,
      requestId,
      reason: "authentication"
    });
    throw new AdminAuthorizationError();
  }

  return {
    adminUsername: env.ADMIN_USERNAME as string,
    requestId
  } satisfies AdminAuthorizationContext;
}

export function isAdminAuthorizationResponse(value: AdminAuthorizationContext | NextResponse): value is NextResponse {
  return value instanceof Response;
}

export function validateAdminMutationOrigin({
  origin,
  requestOrigin,
  secFetchSite,
  configuredOrigins
}: {
  origin: string | null;
  requestOrigin: string | null;
  secFetchSite: string | null;
  configuredOrigins?: string;
}): { ok: true } | { ok: false; reason: string } {
  if (!origin || !requestOrigin) return { ok: false, reason: "missing-origin" };
  if (secFetchSite?.toLowerCase() === "cross-site") return { ok: false, reason: "cross-site" };

  const allowedOrigins = new Set<string>();
  const normalizedRequestOrigin = normalizeOrigin(requestOrigin);
  if (!normalizedRequestOrigin) return { ok: false, reason: "invalid-request-origin" };
  allowedOrigins.add(normalizedRequestOrigin);

  for (const configuredOrigin of (configuredOrigins ?? "").split(",")) {
    const value = configuredOrigin.trim();
    if (!value) continue;
    const normalized = normalizeOrigin(value);
    if (!normalized) return { ok: false, reason: "invalid-origin-configuration" };
    allowedOrigins.add(normalized);
  }

  const normalizedOrigin = normalizeOrigin(origin);
  if (!normalizedOrigin || !allowedOrigins.has(normalizedOrigin)) {
    return { ok: false, reason: "origin-mismatch" };
  }

  return { ok: true };
}

function unauthorizedAdminResponse() {
  return NextResponse.json(
    { error: "Unauthorized" },
    {
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="PaperStraw Admin", charset="UTF-8"' }
    }
  );
}

function normalizeOrigin(value: string) {
  try {
    const url = new URL(value);
    return url.origin === value.replace(/\/$/, "") ? url.origin : null;
  } catch {
    return null;
  }
}

function getForwardedRequestOrigin(requestHeaders: Headers) {
  const host = firstForwardedValue(requestHeaders.get("x-forwarded-host")) ?? firstForwardedValue(requestHeaders.get("host"));
  if (!host) return null;
  const forwardedProtocol = firstForwardedValue(requestHeaders.get("x-forwarded-proto"));
  const protocol = forwardedProtocol ?? (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
  return normalizeOrigin(`${protocol}://${host}`);
}

function firstForwardedValue(value: string | null) {
  return value?.split(",")[0]?.trim() || null;
}
