import { loadProjectEnv } from "@/lib/env/loadProjectEnv";
import {
  applyApprovedMmsiReviewCandidates,
  approveMmsiReviewCandidate,
  dismissMmsiReviewCandidate,
  formatMmsiReviewActionResult,
  formatMmsiReviewReport,
  listMmsiReviewCandidates,
  parseMmsiReviewArgs,
  writeMmsiReviewOutput
} from "@/lib/cruises/mmsiReviewWorkflow";
import { prisma } from "@/lib/database/cruises";

loadProjectEnv();

async function main() {
  const options = parseMmsiReviewArgs(process.argv.slice(2));
  let output: string;

  if (options.action.kind === "list") {
    const report = await listMmsiReviewCandidates(options);
    report.includeIdentifiers = options.includeIdentifiers;
    output = formatMmsiReviewReport(report, options.format);
  } else if (options.action.kind === "approve") {
    const result = await approveMmsiReviewCandidate(options.action.queueId, options.action.note);
    output = formatMmsiReviewActionResult(result, options.format);
  } else if (options.action.kind === "dismiss") {
    const result = await dismissMmsiReviewCandidate(options.action.queueId, options.action.note);
    output = formatMmsiReviewActionResult(result, options.format);
  } else {
    const result = await applyApprovedMmsiReviewCandidates({ confirm: options.action.confirm });
    output = formatMmsiReviewActionResult(result, options.format);
  }

  if (options.output) {
    await writeMmsiReviewOutput(options.output, output, options.force);
    console.log(`MMSI review output written to ${options.output}`);
  } else {
    process.stdout.write(output);
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
