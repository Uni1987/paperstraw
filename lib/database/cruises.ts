import { PrismaClient } from "@prisma/client";
import { applyCruiseWebDatabaseSafety } from "@/lib/database/connectionSafety";
import { getCruisesDatabaseUrl } from "@/lib/database/config";
import { loadProjectEnv } from "@/lib/env/loadProjectEnv";

loadProjectEnv();

const globalForCruisesPrisma = globalThis as unknown as {
  cruisesPrisma?: PrismaClient;
};

let cruisesPrismaClient: PrismaClient | undefined;

function createCruisesPrismaClient() {
  return new PrismaClient({
    datasources: {
      db: {
        url: applyCruiseWebDatabaseSafety(
          getCruisesDatabaseUrl(process.env, { allowLegacyDatabaseUrlWithCruiseTarget: true })
        )
      }
    },
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"]
  });
}

export function getCruisesPrisma() {
  if (cruisesPrismaClient) return cruisesPrismaClient;

  if (process.env.NODE_ENV !== "production" && globalForCruisesPrisma.cruisesPrisma) {
    cruisesPrismaClient = globalForCruisesPrisma.cruisesPrisma;
    return cruisesPrismaClient;
  }

  cruisesPrismaClient = createCruisesPrismaClient();
  if (process.env.NODE_ENV !== "production") {
    globalForCruisesPrisma.cruisesPrisma = cruisesPrismaClient;
  }
  return cruisesPrismaClient;
}

export const cruisePrisma = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const client = getCruisesPrisma();
    const value = Reflect.get(client, property);
    return typeof value === "function" ? value.bind(client) : value;
  }
});

export const prisma = cruisePrisma;
