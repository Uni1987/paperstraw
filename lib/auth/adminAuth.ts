export const protectedAdminPathPrefixes = ["/admin", "/api/admin", "/api/cron", "/api/ingest"] as const;

export function isProtectedAdminPath(pathname: string) {
  return protectedAdminPathPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function isValidAdminBasicAuth({
  authorization,
  expectedUsername,
  expectedPassword
}: {
  authorization: string | null | undefined;
  expectedUsername: string | undefined;
  expectedPassword: string | undefined;
}) {
  if (!expectedUsername || !expectedPassword) return false;
  if (!authorization?.toLowerCase().startsWith("basic ")) return false;

  const credentials = decodeBasicCredentials(authorization.slice(6).trim());
  if (!credentials) return false;

  return credentials.username === expectedUsername && credentials.password === expectedPassword;
}

export function isValidCronSecretAuth({
  pathname,
  authorization,
  xCronSecret,
  querySecret,
  expectedSecret
}: {
  pathname: string;
  authorization: string | null | undefined;
  xCronSecret?: string | null;
  querySecret?: string | null;
  expectedSecret: string | undefined;
}) {
  const cronSecret = expectedSecret?.trim();
  if (!pathname.startsWith("/api/cron") || !cronSecret) return false;

  const bearerToken = authorization?.toLowerCase().startsWith("bearer ") ? authorization.slice(7).trim() : "";
  const headerToken = xCronSecret?.trim() ?? "";
  const urlToken = querySecret?.trim() ?? "";

  return [bearerToken, headerToken, urlToken].some((token) => token === cronSecret);
}

export function encodeBasicCredentials(username: string, password: string) {
  return `Basic ${btoa(`${username}:${password}`)}`;
}

function decodeBasicCredentials(encodedCredentials: string) {
  try {
    const decoded = atob(encodedCredentials);
    const separatorIndex = decoded.indexOf(":");
    if (separatorIndex === -1) return null;

    return {
      username: decoded.slice(0, separatorIndex),
      password: decoded.slice(separatorIndex + 1)
    };
  } catch {
    return null;
  }
}
