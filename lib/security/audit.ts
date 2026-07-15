export type SecurityAuditResult = "success" | "rejected" | "failed";

type SecurityAuditEvent = {
  action: string;
  result: SecurityAuditResult;
  source: string;
  requestId?: string;
  target?: string;
  adminUsername?: string;
  reason?: string;
};

const SAFE_LOG_VALUE = /^[A-Za-z0-9._:/-]{1,160}$/;

export function getSecurityRequestId(headers: Headers) {
  const supplied = headers.get("x-vercel-id") ?? headers.get("x-request-id");
  if (supplied && SAFE_LOG_VALUE.test(supplied)) return supplied;
  return globalThis.crypto.randomUUID();
}

export function logSecurityAuditEvent(event: SecurityAuditEvent) {
  const payload = {
    event: "paperstraw.security.audit",
    timestamp: new Date().toISOString(),
    action: safeLogValue(event.action, "unknown"),
    result: event.result,
    source: safeLogValue(event.source, "unknown"),
    requestId: safeLogValue(event.requestId, "unavailable"),
    ...(event.target ? { target: safeLogValue(event.target, "redacted") } : {}),
    ...(event.adminUsername ? { adminUsername: safeLogValue(event.adminUsername, "configured-admin") } : {}),
    ...(event.reason ? { reason: safeLogValue(event.reason, "unspecified") } : {})
  };
  const line = JSON.stringify(payload);

  if (event.result === "failed") console.error(line);
  else if (event.result === "rejected") console.warn(line);
  else console.info(line);
}

function safeLogValue(value: string | undefined, fallback: string) {
  return value && SAFE_LOG_VALUE.test(value) ? value : fallback;
}
