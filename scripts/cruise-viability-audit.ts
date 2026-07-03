import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { loadProjectEnv } from "@/lib/env/loadProjectEnv";
import { buildCruiseViabilityAuditFromDatabase, DEFAULT_VIABILITY_RECENT_DAYS, formatCruiseViabilityAudit } from "@/lib/cruises/viabilityAudit";
import { prisma } from "@/lib/prisma";

type AuditFormat = "terminal" | "json" | "markdown";

loadProjectEnv();

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const manifestPath = resolve(process.cwd(), "data/cruises/operator-coverage-manifest.csv");
  const report = await buildCruiseViabilityAuditFromDatabase({
    recentDays: options.recentDays,
    manifestPath
  });
  const output = formatCruiseViabilityAudit(report, options.format);

  if (options.output) {
    const outputPath = resolve(options.output);
    if (existsSync(outputPath) && !options.force) {
      throw new Error(`Refusing to overwrite ${outputPath}. Re-run with --force to replace it.`);
    }
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, output, "utf8");
    console.log(`Cruise viability audit written to ${outputPath}`);
  } else {
    process.stdout.write(output);
  }
}

function parseArgs(args: string[]) {
  const options: { recentDays: number; format: AuditFormat; output: string | null; force: boolean } = {
    recentDays: DEFAULT_VIABILITY_RECENT_DAYS,
    format: "terminal",
    output: null,
    force: false
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--") continue;
    if (arg === "--recent-days") {
      const value = Number(args[index + 1]);
      if (!Number.isInteger(value) || value <= 0) throw new Error("--recent-days requires a positive integer.");
      options.recentDays = value;
      index += 1;
      continue;
    }
    if (arg === "--format") {
      const value = args[index + 1] as AuditFormat | undefined;
      if (!value || !["terminal", "json", "markdown"].includes(value)) throw new Error("--format requires terminal, json, or markdown.");
      options.format = value;
      index += 1;
      continue;
    }
    if (arg === "--output") {
      options.output = args[index + 1] ?? null;
      if (!options.output) throw new Error("--output requires a path.");
      index += 1;
      continue;
    }
    if (arg === "--force") {
      options.force = true;
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
