import { loadProjectEnv } from "@/lib/env/loadProjectEnv";
import { diagnoseMmsiReviewApplyConsistency, formatMmsiReviewDiagnosticsReport, parseMmsiReviewArgs } from "@/lib/cruises/mmsiReviewWorkflow";
import { prisma } from "@/lib/prisma";

loadProjectEnv();

async function main() {
  const options = parseMmsiReviewArgs(process.argv.slice(2));
  const report = await diagnoseMmsiReviewApplyConsistency({ status: options.status, limit: options.limit });
  process.stdout.write(formatMmsiReviewDiagnosticsReport(report, options.format));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
