import { timingSafeEqual } from "@/lib/auth/timingSafe";

export function getCronSecret() {
  return process.env.CRON_SECRET || "";
}

export async function isAuthorizedCronRequest(request: Request, secret = getCronSecret()) {
  const expected = secret.trim();
  if (!expected) return false;

  const authorization = request.headers.get("authorization") ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  const bearerToken = match?.[1].trim() ?? "";

  return bearerToken ? timingSafeEqual(bearerToken, expected) : false;
}
