import { loadProjectEnv } from "@/lib/env/loadProjectEnv";
import { formatMmsiReviewRepairPlan, parseMmsiReviewArgs, planAppliedMmsiLinkRepair } from "@/lib/cruises/mmsiReviewWorkflow";
import { prisma } from "@/lib/prisma";

loadProjectEnv();

async function main() {
  const options = parseMmsiReviewArgs(process.argv.slice(2));
  if (options.action.kind !== "list") throw new Error("This repair planner is dry-run only and does not accept review mutation actions.");
  const plan = await planAppliedMmsiLinkRepair();
  process.stdout.write(formatMmsiReviewRepairPlan(plan, options.format));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
