import { PrismaClient } from "@prisma/client";
import { getCruisesDatabaseUrl } from "@/lib/database/config";
import { loadProjectEnv } from "@/lib/env/loadProjectEnv";

loadProjectEnv();

const globalForCruisesPrisma = globalThis as unknown as {
  cruisesPrisma?: PrismaClient;
};

function createCruisesPrismaClient() {
  return new PrismaClient({
    datasources: {
      db: {
        url: getCruisesDatabaseUrl(process.env, { allowLegacyDatabaseUrlWithCruiseTarget: true })
      }
    },
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"]
  });
}

export function getCruisesPrisma() {
  const existing = globalForCruisesPrisma.cruisesPrisma;
  if (existing) return existing;
  const client = createCruisesPrismaClient();
  if (process.env.NODE_ENV !== "production") {
    globalForCruisesPrisma.cruisesPrisma = client;
  }
  return client;
}

export const cruisePrisma = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const client = getCruisesPrisma();
    const value = Reflect.get(client, property);
    return typeof value === "function" ? value.bind(client) : value;
  }
});

export const prisma = cruisePrisma;
