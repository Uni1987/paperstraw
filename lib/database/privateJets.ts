import { PrismaClient } from "@prisma/client";
import { getPrivateJetsDatabaseUrl } from "@/lib/database/config";
import { loadProjectEnv } from "@/lib/env/loadProjectEnv";

loadProjectEnv();

const globalForPrivateJetsPrisma = globalThis as unknown as {
  privateJetsPrisma?: PrismaClient;
};

let privateJetsPrismaClient: PrismaClient | undefined;

function createPrivateJetsPrismaClient() {
  return new PrismaClient({
    datasources: {
      db: {
        url: getPrivateJetsDatabaseUrl()
      }
    },
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"]
  });
}

export function getPrivateJetsPrisma() {
  if (privateJetsPrismaClient) return privateJetsPrismaClient;

  if (process.env.NODE_ENV !== "production" && globalForPrivateJetsPrisma.privateJetsPrisma) {
    privateJetsPrismaClient = globalForPrivateJetsPrisma.privateJetsPrisma;
    return privateJetsPrismaClient;
  }

  privateJetsPrismaClient = createPrivateJetsPrismaClient();
  if (process.env.NODE_ENV !== "production") {
    globalForPrivateJetsPrisma.privateJetsPrisma = privateJetsPrismaClient;
  }
  return privateJetsPrismaClient;
}

export const privateJetsPrisma = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const client = getPrivateJetsPrisma();
    const value = Reflect.get(client, property);
    return typeof value === "function" ? value.bind(client) : value;
  }
});

export const prisma = privateJetsPrisma;
