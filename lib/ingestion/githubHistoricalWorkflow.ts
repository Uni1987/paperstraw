import {
  failQueuedHistoricalJob,
  prepareHistoricalImportJob,
  setHistoricalJobWorkflowUrl,
  type PreparedHistoricalJob
} from "./historicalDispatch";
import type { HistoricalImportRequest } from "./historicalRequest";

export type GitHubHistoricalWorkflowConfig = {
  token: string;
  repository: string;
  workflow: string;
  ref: string;
};

export function getGitHubHistoricalWorkflowConfig(env: NodeJS.ProcessEnv = process.env): GitHubHistoricalWorkflowConfig {
  const token = env.GITHUB_ACTIONS_TOKEN?.trim();
  const repository = env.GITHUB_ACTIONS_REPOSITORY?.trim();
  const workflow = env.GITHUB_ACTIONS_WORKFLOW?.trim() || "private-jets-historical-ingest.yml";
  const ref = env.GITHUB_ACTIONS_REF?.trim();

  const missing = [
    !token ? "GITHUB_ACTIONS_TOKEN" : null,
    !repository ? "GITHUB_ACTIONS_REPOSITORY" : null,
    !ref ? "GITHUB_ACTIONS_REF" : null
  ].filter(Boolean);
  if (missing.length) {
    throw new Error(`Historical workflow dispatch is not configured. Missing ${missing.join(", ")}.`);
  }
  if (!/^[^/\s]+\/[^/\s]+$/.test(repository!)) {
    throw new Error("GITHUB_ACTIONS_REPOSITORY must use the owner/repository format.");
  }

  return { token: token!, repository: repository!, workflow, ref: ref! };
}

export function getGitHubHistoricalWorkflowOperationalStatus(env: NodeJS.ProcessEnv = process.env) {
  const required = ["GITHUB_ACTIONS_TOKEN", "GITHUB_ACTIONS_REPOSITORY", "GITHUB_ACTIONS_REF"] as const;
  const missing = required.filter((name) => !env[name]?.trim());
  return {
    configured: missing.length === 0,
    missing,
    workflow: env.GITHUB_ACTIONS_WORKFLOW?.trim() || "private-jets-historical-ingest.yml"
  };
}

export async function dispatchHistoricalImportWorkflow(
  request: HistoricalImportRequest,
  options: {
    env?: NodeJS.ProcessEnv;
    fetchImpl?: typeof fetch;
    prepare?: (request: HistoricalImportRequest) => Promise<PreparedHistoricalJob>;
    markDispatched?: (job: PreparedHistoricalJob, workflowUrl: string) => Promise<void>;
    failPrepared?: (job: PreparedHistoricalJob, message: string) => Promise<void>;
  } = {}
) {
  const config = getGitHubHistoricalWorkflowConfig(options.env);
  const prepare = options.prepare ?? prepareHistoricalImportJob;
  const job = await prepare(request);
  if (job.status === "skipped") {
    return { ...job, workflowUrl: null };
  }

  const workflowUrl = `https://github.com/${config.repository}/actions/workflows/${encodeURIComponent(config.workflow)}`;
  try {
    await (options.markDispatched ?? setHistoricalJobWorkflowUrl)(job, workflowUrl);
    const response = await (options.fetchImpl ?? fetch)(
      `https://api.github.com/repos/${config.repository}/actions/workflows/${encodeURIComponent(config.workflow)}/dispatches`,
      {
        method: "POST",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${config.token}`,
          "Content-Type": "application/json",
          "User-Agent": "PaperStraw historical ingestion dispatcher",
          "X-GitHub-Api-Version": "2022-11-28"
        },
        body: JSON.stringify({
          ref: config.ref,
          inputs: {
            from: job.request.from.toISOString().slice(0, 10),
            to: job.request.to.toISOString().slice(0, 10),
            force: String(job.request.force),
            source: job.request.source,
            job_id: job.jobId
          }
        }),
        cache: "no-store"
      }
    );
    if (!response.ok) {
      throw new Error(`GitHub Actions workflow dispatch failed with HTTP ${response.status}.`);
    }
    return { ...job, workflowUrl };
  } catch (error) {
    const message = error instanceof Error ? error.message : "GitHub Actions workflow dispatch failed.";
    await (options.failPrepared ?? failQueuedHistoricalJob)(job, message);
    throw new Error(message);
  }
}
