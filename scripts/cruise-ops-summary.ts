import { loadProjectEnv } from "@/lib/env/loadProjectEnv";
import { buildCruiseOpsStatus, formatCruiseOpsSummary } from "@/lib/cruises/adminOps";
import { prisma } from "@/lib/database/cruises";

loadProjectEnv();

async function main() {
  const status = await buildCruiseOpsStatus();
  process.stdout.write(formatCruiseOpsSummary(status));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
