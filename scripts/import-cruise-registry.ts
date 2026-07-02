import { resolve } from "node:path";
import { loadProjectEnv } from "@/lib/env/loadProjectEnv";
import { importRegistryCsv } from "@/lib/cruises/registry";
import { prisma } from "@/lib/prisma";

loadProjectEnv();

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = await importRegistryCsv(resolve(process.cwd(), options.file), { apply: options.apply });

  console.log("Cruise verified registry import");
  console.log(`Mode: ${result.dryRun ? "dry-run" : "apply"}`);
  console.log(`Rows read: ${result.rowsRead}`);
  console.log(`Valid rows: ${result.validRows}`);
  console.log(`Upserted: ${result.upserted}`);
  if (result.errors.length) {
    console.log("Errors:");
    for (const error of result.errors) console.log(`- ${error}`);
    process.exitCode = 1;
  }
}

function parseArgs(args: string[]) {
  const options = {
    file: "data/cruises/verified-ocean-cruise-registry.csv",
    apply: false
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--") continue;
    if (arg === "--file") {
      options.file = args[index + 1];
      if (!options.file) throw new Error("--file requires a path.");
      index += 1;
    } else if (arg === "--dry-run") {
      options.apply = false;
    } else if (arg === "--apply") {
      options.apply = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
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
