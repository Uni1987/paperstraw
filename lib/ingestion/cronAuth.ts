export function getCronSecret() {
  return process.env.CRON_SECRET || "";
}

export function isAuthorizedCronRequest(request: Request, secret = getCronSecret()) {
  const expected = secret.trim();
  if (!expected) return false;

  const url = new URL(request.url);
  const authorization = request.headers.get("authorization") ?? "";
  const bearerToken = authorization.toLowerCase().startsWith("bearer ") ? authorization.slice(7).trim() : "";
  const headerToken = request.headers.get("x-cron-secret")?.trim() ?? "";
  const queryToken = url.searchParams.get("secret")?.trim() ?? "";

  return [bearerToken, headerToken, queryToken].some((token) => token === expected);
}
