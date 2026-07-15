import { timingSafeEqual } from "@/lib/auth/timingSafe";

export const protectedAdminPathPrefixes = ["/admin", "/api/admin", "/api/cron", "/api/ingest"] as const;
const MAX_AUTHORIZATION_HEADER_LENGTH = 8192;

export function isProtectedAdminPath(pathname: string) {
  return protectedAdminPathPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export async function isValidAdminBasicAuth({
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
  if (authorization.length > MAX_AUTHORIZATION_HEADER_LENGTH) return false;

  const credentials = decodeBasicCredentials(authorization.slice(6).trim());
  if (!credentials) return false;

  const [usernameMatches, passwordMatches] = await Promise.all([
    timingSafeEqual(credentials.username, expectedUsername),
    timingSafeEqual(credentials.password, expectedPassword)
  ]);

  return usernameMatches && passwordMatches;
}

export async function isValidCronSecretAuth({
  pathname,
  authorization,
  expectedSecret
}: {
  pathname: string;
  authorization: string | null | undefined;
  expectedSecret: string | undefined;
}) {
  const cronSecret = expectedSecret?.trim();
  const isCronPath = pathname === "/api/cron" || pathname.startsWith("/api/cron/");
  if (!isCronPath || !cronSecret) return false;

  const bearerToken = parseBearerToken(authorization);
  return bearerToken ? timingSafeEqual(bearerToken, cronSecret) : false;
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

function parseBearerToken(authorization: string | null | undefined) {
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  return match?.[1].trim() ?? "";
}
