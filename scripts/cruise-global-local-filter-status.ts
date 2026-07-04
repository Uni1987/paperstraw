import { loadProjectEnv } from "@/lib/env/loadProjectEnv";
import { prisma } from "@/lib/prisma";
import {
  buildGlobalLocalFilterStatusReport,
  formatGlobalLocalFilterStatusReport,
  parseGlobalLocalFilterStatusArgs,
  writeStatusOutput
} from "@/lib/cruises/globalLocalFilterStatus";

loadProjectEnv();

async function main() {
  const options = parseGlobalLocalFilterStatusArgs(process.argv.slice(2));
  const report = await buildGlobalLocalFilterStatusReport(options);
  const output = formatGlobalLocalFilterStatusReport(report, options.format);

  if (options.output) {
    writeStatusOutput(options.output, output, options.force);
    console.log(`Wrote cruise global-local-filter status report to ${options.output}`);
    return;
  }

  process.stdout.write(output);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
