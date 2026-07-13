import { loadProjectEnv } from "@/lib/env/loadProjectEnv";

loadProjectEnv();

export type ModuleDatabase = "private-jets" | "cruises";

export type DatabaseEnv = {
  [key: string]: string | undefined;
  DATABASE_URL?: string;
  PRIVATE_JETS_DATABASE_URL?: string;
  CRUISES_DATABASE_URL?: string;
  CRUISE_DATABASE_URL?: string;
  CRUISE_WORKER_ENV?: string;
  CRUISE_WORKER_DATABASE_TARGET?: string;
};

export const PRIVATE_JETS_DATABASE_URL_ENV = "PRIVATE_JETS_DATABASE_URL";
export const CRUISES_DATABASE_URL_ENV = "CRUISES_DATABASE_URL";
export const LEGACY_CRUISE_DATABASE_URL_ENV = "CRUISE_DATABASE_URL";
export const LEGACY_DATABASE_URL_ENV = "DATABASE_URL";

export function getPrivateJetsDatabaseUrl(env: DatabaseEnv = process.env) {
  const url = firstDefined(env.PRIVATE_JETS_DATABASE_URL, env.DATABASE_URL);
  if (!url) {
    throw new Error(
      "Missing private jets database URL. Set PRIVATE_JETS_DATABASE_URL, or DATABASE_URL for legacy private-jets deployments."
    );
  }
  if (looksLikeCruiseDatabaseUrl(url)) {
    throw new Error(
      "Refusing to use a cruise-looking database URL for private jets. Set PRIVATE_JETS_DATABASE_URL to the private-jets database."
    );
  }
  return url;
}

export function requirePrivateJetsDatabaseUrl(env: DatabaseEnv = process.env) {
  return getPrivateJetsDatabaseUrl(env);
}

export function requireExplicitPrivateJetsDatabaseUrl(env: DatabaseEnv = process.env) {
  if (!env.PRIVATE_JETS_DATABASE_URL?.trim()) {
    throw new Error("Missing PRIVATE_JETS_DATABASE_URL. Historical Private Jets ingestion does not use the legacy DATABASE_URL fallback.");
  }
  return getPrivateJetsDatabaseUrl({ ...env, DATABASE_URL: undefined });
}

export function getCruisesDatabaseUrl(
  env: DatabaseEnv = process.env,
  options: { allowLegacyDatabaseUrlWithCruiseTarget?: boolean } = {}
) {
  const url = firstDefined(env.CRUISES_DATABASE_URL, env.CRUISE_DATABASE_URL);
  if (url) return url;

  if (options.allowLegacyDatabaseUrlWithCruiseTarget && isExplicitCruiseDatabaseTarget(env)) {
    const legacyUrl = firstDefined(env.DATABASE_URL);
    if (!legacyUrl) {
      throw new Error(
        "Missing cruise database URL. Set CRUISES_DATABASE_URL for cruise code, or DATABASE_URL only in an explicit cruises-dev worker context."
      );
    }
    if (!looksLikeCruiseDatabaseUrl(legacyUrl)) {
      throw new Error(
        "Refusing to use DATABASE_URL for cruise code because it does not look like a cruise database. Set CRUISES_DATABASE_URL."
      );
    }
    return legacyUrl;
  }

  throw new Error(
    "Missing cruise database URL. Set CRUISES_DATABASE_URL, or CRUISE_DATABASE_URL for legacy cruise tooling."
  );
}

export function requireCruisesDatabaseUrl(
  env: DatabaseEnv = process.env,
  options: { allowLegacyDatabaseUrlWithCruiseTarget?: boolean } = {}
) {
  return getCruisesDatabaseUrl(env, options);
}

export function getModuleDatabaseUrl(module: ModuleDatabase, env: DatabaseEnv = process.env) {
  return module === "private-jets" ? getPrivateJetsDatabaseUrl(env) : getCruisesDatabaseUrl(env);
}

export function looksLikeCruiseDatabaseUrl(url: string) {
  const normalized = url.toLowerCase();
  return /\bcruises?\b|cruises-dev|cruise-dev/.test(normalized.replace(/[^a-z0-9-]+/g, " "));
}

function isExplicitCruiseDatabaseTarget(env: DatabaseEnv) {
  return env.CRUISE_WORKER_DATABASE_TARGET?.trim() === "cruises-dev";
}

function firstDefined(...values: Array<string | undefined>) {
  const value = values.find((candidate) => candidate?.trim());
  return value?.trim() ?? null;
}
