import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { ImportStatusValue } from "./importStatus";
import type { DataSourceProviderValue } from "./providerConstants";
import type { IngestionModeValue } from "./state";

export type DailyImportLogInput = {
  provider: DataSourceProviderValue;
  mode: IngestionModeValue;
  runStartedAt: Date;
  runEndedAt: Date;
  status: ImportStatusValue;
  recordsFetched: number;
  recordsConsidered: number;
  recordsImported: number;
  errors?: string | null;
};

export async function createDailyImportLog(input: DailyImportLogInput) {
  await prisma.$executeRaw`
    INSERT INTO "ImportLog" (
      "id",
      "provider",
      "mode",
      "timestamp",
      "runStartedAt",
      "runEndedAt",
      "status",
      "recordsFetched",
      "recordsConsidered",
      "recordsImported",
      "errors"
    )
    VALUES (
      ${randomUUID()},
      ${input.provider},
      ${input.mode},
      ${input.runEndedAt},
      ${input.runStartedAt},
      ${input.runEndedAt},
      ${input.status},
      ${input.recordsFetched},
      ${input.recordsConsidered},
      ${input.recordsImported},
      ${input.errors ?? null}
    )
  `;
}
