import { loadProjectEnv, requireEnv } from "@/lib/env/loadProjectEnv";
import { runAisStreamWorker } from "@/lib/cruises/aisstream";

async function main() {
  loadProjectEnv();
  requireEnv("DATABASE_URL");
  await runAisStreamWorker();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
