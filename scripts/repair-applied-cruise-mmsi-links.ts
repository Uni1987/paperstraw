import { loadProjectEnv } from "@/lib/env/loadProjectEnv";
import { formatMmsiReviewRepairPlan, repairAppliedMmsiLinks, type MmsiReviewFormat } from "@/lib/cruises/mmsiReviewWorkflow";
import { prisma } from "@/lib/prisma";

loadProjectEnv();

type RepairArgs = {
  confirm: boolean;
  format: MmsiReviewFormat;
};

async function main() {
  const options = parseRepairArgs(process.argv.slice(2));
  const plan = await repairAppliedMmsiLinks({ confirm: options.confirm });
  process.stdout.write(formatMmsiReviewRepairPlan(plan, options.format));
}

function parseRepairArgs(args: string[]): RepairArgs {
  const options: RepairArgs = { confirm: false, format: "terminal" };
  let dryRunExplicit = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--") continue;
    if (arg === "--dry-run") {
      if (options.confirm) throw new Error("--dry-run cannot be combined with --confirm.");
      dryRunExplicit = true;
      continue;
    }
    if (arg === "--confirm") {
      if (dryRunExplicit) throw new Error("--dry-run cannot be combined with --confirm.");
      options.confirm = true;
      continue;
    }
    if (arg === "--format") {
      const format = args[index + 1];
      if (format !== "terminal" && format !== "json" && format !== "markdown") throw new Error("--format must be terminal, json, or markdown.");
      options.format = format;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
