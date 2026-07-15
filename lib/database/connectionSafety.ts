const CRUISE_WEB_DATABASE_DEFAULTS = {
  connection_limit: "3",
  connect_timeout: "5",
  pool_timeout: "5",
  socket_timeout: "10",
  application_name: "paperstraw-cruises-web"
} as const;

export function applyCruiseWebDatabaseSafety(
  databaseUrl: string,
  env: Record<string, string | undefined> = process.env
) {
  if (env.VERCEL !== "1") return databaseUrl;

  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new Error("Cruise database configuration is invalid.");
  }

  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
    throw new Error("Cruise database configuration must use PostgreSQL.");
  }

  for (const [key, value] of Object.entries(CRUISE_WEB_DATABASE_DEFAULTS)) {
    if (!url.searchParams.has(key)) url.searchParams.set(key, value);
  }
  return url.toString();
}
