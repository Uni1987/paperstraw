import { loadProjectEnv } from "@/lib/env/loadProjectEnv";
import { prisma } from "@/lib/database/cruises";
import {
  buildScopeResearchPlan,
  ensureScopeResearchTemplates,
  formatScopeResearchPlanTerminal,
  writeScopeResearchPlan
} from "@/lib/cruises/scopeResearchPlan";

loadProjectEnv();

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const plan = await buildScopeResearchPlan();
  const templates = ensureScopeResearchTemplates({
    evidenceTemplatePath: options.evidenceTemplate,
    proposalTemplatePath: options.proposalTemplate
  });
  writeScopeResearchPlan(options.output, plan);
  process.stdout.write(formatScopeResearchPlanTerminal(plan, options.output, templates));
}

function parseArgs(args: string[]) {
  const options = {
    output: "reports/cruises/scope-decision-research-plan.md",
    evidenceTemplate: "data/cruises/research/scope-decision-evidence-template.csv",
    proposalTemplate: "data/cruises/proposals/manual-scope-decision-expansion-template.csv"
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--") continue;
    if (arg === "--output") {
      options.output = args[++index] ?? "";
      if (!options.output) throw new Error("--output requires a path.");
      continue;
    }
    if (arg === "--evidence-template") {
      options.evidenceTemplate = args[++index] ?? "";
      if (!options.evidenceTemplate) throw new Error("--evidence-template requires a path.");
      continue;
    }
    if (arg === "--proposal-template") {
      options.proposalTemplate = args[++index] ?? "";
      if (!options.proposalTemplate) throw new Error("--proposal-template requires a path.");
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

