import { loadProjectEnv } from "@/lib/env/loadProjectEnv";
import { prisma } from "@/lib/database/cruises";
import {
  buildCruiseLaunchReadinessReport,
  formatCruiseLaunchReadinessTerminal,
  writeCruiseLaunchReadinessReport
} from "@/lib/cruises/launchReadiness";

loadProjectEnv();

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const report = await buildCruiseLaunchReadinessReport();
  writeCruiseLaunchReadinessReport(options.output, report);
  process.stdout.write(formatCruiseLaunchReadinessTerminal(report));
  console.log(`Markdown report: ${options.output}`);
}

function parseArgs(args: string[]) {
  const options = { output: "reports/cruises/launch-readiness-audit.md" };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--") continue;
    if (arg === "--output") {
      options.output = args[++index] ?? "";
      if (!options.output) throw new Error("--output requires a path.");
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

