import { loadProjectEnv, requireEnv } from "@/lib/env/loadProjectEnv";
import { runAisStreamWorker } from "@/lib/cruises/aisstream";

loadProjectEnv();
requireEnv("DATABASE_URL");

await runAisStreamWorker();

