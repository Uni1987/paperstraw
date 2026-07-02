import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildOperatorRegistryValidationReport, buildRegistryValidationReport } from "@/lib/cruises/registry";
import { parseRegistryExpansionManifest } from "@/lib/cruises/registryCoverage";

function main() {
  const options = parseArgs(process.argv.slice(2));
  const filePath = resolve(process.cwd(), options.file);
  const content = readFileSync(filePath, "utf8");

  if (options.operator) {
    printOperatorReport(content, filePath, options.operator);
    return;
  }

  const report = buildRegistryValidationReport(content);

  console.log("Cruise verified registry validation");
  console.log(`File: ${filePath}`);
  console.log(`Rows read: ${report.rowsRead}`);
  console.log(`Valid rows: ${report.validRowCount}`);
  console.log(`ACCEPT rows: ${report.totalAcceptRows}`);
  console.log(`EXCLUDE rows: ${report.totalExcludeRows}`);
  console.log(`Duplicate IMO conflicts: ${report.duplicateImoConflicts}`);
  console.log(`Missing source URLs: ${report.missingSourceUrls}`);
  console.log(`Missing source checked dates: ${report.missingSourceCheckedDates}`);
  console.log(`Invalid IMO format/checksum rows: ${report.invalidImoRows}`);
  console.log(`Missing canonical names: ${report.missingCanonicalNameRows}`);
  console.log(`Missing operators: ${report.missingOperatorRows}`);
  console.log(`Missing/invalid vessel segments: ${report.missingOrInvalidVesselSegmentRows}`);
  console.log(`Active vessels: ${report.activeStatusCounts.ACTIVE}`);
  console.log(`Retired vessels: ${report.activeStatusCounts.RETIRED}`);
  console.log(`Unknown active status vessels: ${report.activeStatusCounts.UNKNOWN}`);
  console.log(`Invalid active status rows: ${report.invalidActiveStatusRows}`);

  if (report.errors.length) {
    console.log("Errors:");
    for (const error of report.errors) console.log(`- ${error}`);
    process.exitCode = 1;
  } else {
    console.log("Status: registry CSV passed validation checks.");
  }
}

function parseArgs(args: string[]) {
  const options: { file: string; operator: string | null } = { file: "data/cruises/verified-ocean-cruise-registry.csv", operator: null };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--") continue;
    if (arg === "--file") {
      options.file = args[index + 1];
      if (!options.file) throw new Error("--file requires a path.");
      index += 1;
    } else if (arg === "--operator") {
      options.operator = args[index + 1];
      if (!options.operator) throw new Error("--operator requires an operator name.");
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

function printOperatorReport(content: string, filePath: string, operator: string) {
  const manifest = parseRegistryExpansionManifest(readFileSync(resolve(process.cwd(), "data/cruises/registry-expansion-manifest.csv"), "utf8"));
  const manifestEntry = manifest.entries.find((entry) => entry.operator === operator);
  const report = buildOperatorRegistryValidationReport(content, { operator, operatorGroup: manifestEntry?.operatorGroup ?? null });

  console.log("Cruise operator registry batch validation");
  console.log(`File: ${filePath}`);
  console.log(`Operator: ${operator}`);
  console.log(`Operator group: ${manifestEntry?.operatorGroup ?? "not found in manifest"}`);
  console.log(`Total rows for operator: ${report.totalRows}`);
  console.log(`Valid rows: ${report.validRows}`);
  console.log(`Invalid rows: ${report.invalidRows}`);
  console.log(`Duplicate IMO conflicts: ${report.duplicateImoConflicts}`);
  console.log(`Missing official source evidence: ${report.missingOfficialSourceRows}`);
  console.log(`Missing IMO identity evidence in notes: ${report.missingImoIdentityEvidenceRows}`);
  console.log(`Generic source URL warnings: ${report.genericSourceUrlWarnings.length}`);
  console.log(`Missing checked dates: ${report.missingCheckedDates}`);
  console.log(`Missing active status: ${report.missingActiveStatusRows}`);
  console.log(`Invalid vessel segment: ${report.invalidVesselSegmentRows}`);
  console.log(`Operator/operator group mismatches: ${report.operatorOrGroupMismatchRows}`);
  if (report.genericSourceUrlWarnings.length) {
    console.log("Warnings:");
    for (const warning of report.genericSourceUrlWarnings) console.log(`- ${warning}`);
  }
  if (report.errors.length) {
    console.log("Errors:");
    for (const error of report.errors) console.log(`- ${error}`);
    process.exitCode = 1;
  } else {
    console.log("Status: selected operator batch passed blocking validation checks.");
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
