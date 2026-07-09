import { resolve } from "node:path";
import { requireCruisesDatabaseUrl } from "@/lib/database/config";
import { loadProjectEnv } from "@/lib/env/loadProjectEnv";
import { importCruiseMrvCsv } from "@/lib/cruises/mrv";
import { prisma } from "@/lib/database/cruises";

loadProjectEnv();
requireCruisesDatabaseUrl();

const filePath = readFileArgument();

if (!filePath) {
  console.error("Missing --file path/to/thetis-mrv.csv");
  process.exit(1);
}

const result = await importCruiseMrvCsv(resolve(process.cwd(), filePath));

console.log("EMSA THETIS-MRV cruise import complete");
console.log(`Rows read: ${result.rowsRead}`);
console.log(`Ships upserted: ${result.shipsUpserted}`);
console.log(`Annual records upserted: ${result.annualRecordsUpserted}`);
console.log(`Skipped rows: ${result.skippedRows}`);
if (result.errors.length) {
  console.log("Warnings:");
  for (const error of result.errors.slice(0, 25)) console.log(`- ${error}`);
  if (result.errors.length > 25) console.log(`- ${result.errors.length - 25} more warning(s) omitted`);
}

await prisma.$disconnect();

function readFileArgument() {
  const index = process.argv.findIndex((arg) => arg === "--file");
  if (index !== -1) return process.argv[index + 1];
  const inline = process.argv.find((arg) => arg.startsWith("--file="));
  return inline?.slice("--file=".length);
}

