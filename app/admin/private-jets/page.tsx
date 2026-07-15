import { startHistoricalImportAction, uploadCsvAction } from "../actions";
import { HistoricalImportForm } from "../HistoricalImportForm";
import { getCronOperationalStatus } from "@/lib/config/cron";
import { getAttributionQualityReport } from "@/lib/data/attributionQuality";
import { getRecentHistoricalJobs, type HistoricalJobMetadata } from "@/lib/ingestion/historicalDispatch";
import { getGitHubHistoricalWorkflowOperationalStatus } from "@/lib/ingestion/githubHistoricalWorkflow";
import { formatUtcDateKey, getYesterdayUtc } from "@/lib/ingestion/historicalRequest";
import { getImportStatusSummary } from "@/lib/ingestion/state";
import Link from "next/link";
import type { ReactNode } from "react";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type AdminProps = {
  searchParams?: Promise<{
    success?: string;
    error?: string;
    warning?: string;
  }>;
};

export default async function PrivateJetsAdminPage({ searchParams }: AdminProps) {
  const resolvedSearchParams = await searchParams;
  const [status, attributionQuality, historicalJobs] = await Promise.all([
    getImportStatusSummary(),
    getAttributionQualityReport(),
    getRecentHistoricalJobs()
  ]);
  const cronStatus = getCronOperationalStatus();
  const workflowStatus = getGitHubHistoricalWorkflowOperationalStatus();
  const latestScheduledJob = historicalJobs.find((job) => job.metadata?.source === "scheduled") ?? null;
  const yesterdayKey = formatUtcDateKey(getYesterdayUtc());

  return (
    <main className="min-h-screen bg-[#f7faf8] px-4 py-10 text-ink sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
      <p className="text-sm font-semibold uppercase tracking-normal text-clay">Imports</p>
      <h1 className="mt-3 text-4xl font-bold tracking-normal text-ink">Admin data imports</h1>

      <StatusMessage type="success" message={resolvedSearchParams?.success} />
      <StatusMessage type="warning" message={resolvedSearchParams?.warning} />
      <StatusMessage type="error" message={resolvedSearchParams?.error} />
      {!cronStatus.cronSecretConfigured ? (
        <StatusMessage type="warning" message="CRON_SECRET is not configured. /api/cron/ingest will reject scheduled refresh requests." />
      ) : null}
      {cronStatus.cronSecretIsDefault ? (
        <StatusMessage type="warning" message="CRON_SECRET is still set to change-me. Replace it before production deployment." />
      ) : null}
      {!workflowStatus.configured ? (
        <StatusMessage type="warning" message={`Historical workflow dispatch is missing: ${workflowStatus.missing.join(", ")}.`} />
      ) : null}

      <section className="mt-8 rounded-lg border border-ink/10 bg-white p-6 shadow-soft">
        <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
          <div>
            <h2 className="text-lg font-semibold text-ink">Historical data import</h2>
            <p className="mt-3 text-sm leading-6 text-ink/65">
              Import complete historical Private Jets data for a selected inclusive date range. The protected action
              validates and dispatches a GitHub Actions job; the browser does not wait for archive processing to finish.
            </p>
          </div>
          <HistoricalImportForm action={startHistoricalImportAction} defaultDate={yesterdayKey} maximumDate={yesterdayKey} />
        </div>
      </section>

      <section className="mt-8 rounded-lg border border-ink/10 bg-white p-6 shadow-soft">
        <h2 className="text-lg font-semibold text-ink">Scheduled historical import</h2>
        <p className="mt-2 text-sm leading-6 text-ink/65">
          Vercel Cron calls the protected dispatcher once daily. It queues the previous completed UTC day in GitHub Actions;
          no archive is scanned inside the Vercel request.
        </p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <QualityCard label="Cron endpoint" value={cronStatus.endpointPath} />
          <QualityCard label="Cron schedule" value={cronStatus.vercelSchedule} />
          <QualityCard label="Schedule timezone" value={cronStatus.timezone} />
          <QualityCard label="Automatic date" value="Previous UTC day" />
          <QualityCard label="Secret configured" value={cronStatus.cronSecretConfigured ? "Yes" : "No"} />
        </div>
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <StatusPanel title="Latest scheduled historical run">
            <StatusRow label="Requested range" value={formatJobRange(latestScheduledJob?.metadata)} detail="Scheduled runs always request exactly yesterday in UTC." />
            <StatusRow label="Status" value={latestScheduledJob?.status ?? "n/a"} detail={`Started: ${formatDateTime(latestScheduledJob?.runStartedAt)} | Completed: ${formatDateTime(latestScheduledJob?.runEndedAt)}`} />
            <StatusRow label="Dates imported / skipped / failed" value={formatJobDateCounts(latestScheduledJob?.metadata)} detail="Partial dates remain retryable and are not treated as complete." />
            <StatusRow label="Records fetched / imported" value={`${(latestScheduledJob?.recordsFetched ?? 0).toLocaleString()} / ${(latestScheduledJob?.recordsImported ?? 0).toLocaleString()}`} detail="Fetched archive records and newly written flight rows." />
            {latestScheduledJob?.metadata?.workflowUrl ? (
              <a
                href={latestScheduledJob.metadata.workflowUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex text-sm font-semibold text-clay hover:text-ink"
              >
                View GitHub Actions workflow runs
              </a>
            ) : null}
          </StatusPanel>
          <StatusPanel title="Configuration checks">
            <StatusRow
              label="Execution architecture"
              value="GitHub Actions"
              detail="Vercel only validates and dispatches; archive scanning runs on a background workflow runner."
            />
            <StatusRow label="Workflow dispatch" value={workflowStatus.configured ? "Configured" : "Missing configuration"} detail={`Workflow: ${workflowStatus.workflow}`} />
            <StatusRow
              label="CRON_SECRET safety"
              value={!cronStatus.cronSecretConfigured ? "Missing" : cronStatus.cronSecretIsDefault ? "Unsafe default" : "Configured"}
              detail="Use a long random value in production. Do not leave it as change-me."
            />
          </StatusPanel>
        </div>
      </section>

      <section className="mt-8 rounded-lg border border-ink/10 bg-white p-6 shadow-soft">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-ink">Import status</h2>
            <p className="mt-2 text-sm leading-6 text-ink/65">
              Historical archive dates are processed deterministically and recorded so large archives are not scanned again
              after a successful import. CLI, scheduled, and manual runs share the same importer.
            </p>
          </div>
          <Link
            href="/admin/validation"
            className="rounded-md border border-ink/15 bg-white px-4 py-2 text-sm font-semibold text-ink hover:bg-mint"
          >
            View emissions validation
          </Link>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <StatusPanel title="Import cursors">
            {status.cursors.length ? (
              status.cursors.map((cursor: any) => (
                <StatusRow
                  key={`${cursor.provider}-${cursor.mode}`}
                  label={`${cursor.provider} / ${cursor.mode}`}
                  value={cursor.lastStatus ?? "Unknown"}
                  detail={`Last imported: ${formatDateTime(cursor.lastImportedAt)} | Last success: ${formatDateTime(cursor.lastSuccessfulImportAt)} | Records: ${cursor.recordsImported}`}
                />
              ))
            ) : (
              <p className="text-sm text-ink/60">No import cursors have been created yet.</p>
            )}
          </StatusPanel>

          <StatusPanel title="Historical archive dates">
            {status.processedArchiveDates.length ? (
              status.processedArchiveDates.map((date: any) => (
                <StatusRow
                  key={`${date.provider}-${date.dateKey}`}
                  label={`${date.dateKey} / ${date.status}`}
                  value={`${date.recordsImported.toLocaleString()} records`}
                  detail={`Files: ${date.filesMatched.toLocaleString()} matched / ${date.filesScanned.toLocaleString()} scanned | Release: ${date.releaseTag ?? "n/a"}`}
                />
              ))
            ) : (
              <p className="text-sm text-ink/60">No historical archive dates have been processed yet.</p>
            )}
          </StatusPanel>
        </div>

        <StatusPanel className="mt-4" title="Recent historical import jobs">
          {historicalJobs.length ? (
            historicalJobs.map((job) => (
              <StatusRow
                key={job.id}
                label={`${job.metadata?.source ?? "unknown"} / ${formatJobRange(job.metadata)}`}
                value={job.status}
                detail={`Imported: ${job.recordsImported.toLocaleString()} | Fetched: ${job.recordsFetched.toLocaleString()} | Started: ${formatDateTime(job.runStartedAt)} | Completed: ${formatDateTime(job.runEndedAt)}${job.error ? ` | ${job.error.slice(0, 140)}` : ""}`}
              />
            ))
          ) : (
            <p className="text-sm text-ink/60">No historical import jobs yet.</p>
          )}
        </StatusPanel>
      </section>

      <section className="mt-8 rounded-lg border border-ink/10 bg-white p-6 shadow-soft">
        <h2 className="text-lg font-semibold text-ink">Attribution quality</h2>
        <p className="mt-2 text-sm leading-6 text-ink/65">
          Unknown country and airport endpoints are measured separately from public aggregate rankings. They are not
          reassigned unless the airport can be mapped without guessing.
        </p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <QualityCard label="Country attribution rate" value={`${attributionQuality.countryAttributionRate}%`} />
          <QualityCard label="Airport attribution rate" value={`${attributionQuality.airportAttributionRate}%`} />
          <QualityCard label="Unknown country" value={`${attributionQuality.unknownCountryPercent}%`} />
          <QualityCard label="Unknown airport" value={`${attributionQuality.unknownAirportPercent}%`} />
        </div>
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <StatusPanel title="Before / after public Unknown bucket">
            <StatusRow
              label="Country Unknown"
              value={`${attributionQuality.legacyUnknownCountryEndpoints.toLocaleString()} -> ${attributionQuality.publicUnknownCountryBucketAfter.toLocaleString()}`}
              detail="Before grouped endpoints into Unknown; after excludes unattributed endpoints from public country rankings."
            />
            <StatusRow
              label="Airport Unknown"
              value={`${attributionQuality.legacyUnknownAirportEndpoints.toLocaleString()} -> ${attributionQuality.publicUnknownAirportBucketAfter.toLocaleString()}`}
              detail="Before grouped endpoints into Unknown; after excludes unattributed endpoints from public airport rankings."
            />
          </StatusPanel>
          <StatusPanel title="Top unattributed endpoint values">
            {attributionQuality.topUnattributedEndpointValues.length ? (
              attributionQuality.topUnattributedEndpointValues.map((item) => (
                <StatusRow key={item.value} label={item.value} value={item.count.toLocaleString()} detail="Stored endpoint value without reliable airport/country attribution." />
              ))
            ) : (
              <p className="text-sm text-ink/60">No unattributed endpoint values.</p>
            )}
          </StatusPanel>
        </div>
      </section>

      <div className="mt-8 grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
        <form action={uploadCsvAction} className="rounded-lg border border-ink/10 bg-white p-6 shadow-soft">
          <h2 className="text-lg font-semibold text-ink">Backup CSV import</h2>
          <label className="block text-sm font-semibold text-ink" htmlFor="file">
            Flight CSV
          </label>
          <input
            id="file"
            name="file"
            type="file"
            accept=".csv,text/csv"
            className="mt-3 block w-full rounded-md border border-ink/15 bg-white px-3 py-2 text-sm file:mr-4 file:rounded-md file:border-0 file:bg-ink file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white"
            required
          />
          <button
            type="submit"
            className="mt-5 w-full rounded-md bg-ink px-4 py-3 text-sm font-semibold text-white hover:bg-moss"
          >
            Import CSV
          </button>
        </form>

        <section className="rounded-lg border border-ink/10 bg-white p-6 shadow-soft">
          <h2 className="text-lg font-semibold text-ink">Required columns</h2>
          <pre className="mt-4 overflow-x-auto rounded-md bg-ink p-4 text-xs leading-6 text-white">
{`aircraft registration,icao hex,aircraft type,origin,destination,departure date/time,arrival date/time,distance_km,optional verified public entity
N742QS,A1B2C3,G650,KTEB,KLAX,2026-06-01T09:30:00Z,2026-06-01T14:40:00Z,3974,`}
          </pre>
          <p className="mt-4 text-sm leading-6 text-ink/65">
            Entity names should only be included when public-source verification is explicit. Leave the final column blank
            when verification is missing.
          </p>
        </section>
      </div>
      </div>
    </main>
  );
}

function StatusPanel({ title, children, className = "" }: { title: string; children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-md border border-ink/10 bg-[#f7faf8] p-4 ${className}`}>
      <h3 className="text-sm font-semibold uppercase tracking-normal text-ink/70">{title}</h3>
      <div className="mt-3 space-y-3">{children}</div>
    </div>
  );
}

function StatusRow({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="border-b border-ink/10 pb-3 last:border-0 last:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-semibold text-ink">{label}</div>
        <div className="text-sm font-semibold text-clay">{value}</div>
      </div>
      <p className="mt-1 text-xs leading-5 text-ink/60">{detail}</p>
    </div>
  );
}

function QualityCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-ink/10 bg-[#f7faf8] p-4">
      <p className="text-sm text-ink/60">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-ink">{value}</p>
    </div>
  );
}

function formatDateTime(value: Date | string | null | undefined) {
  if (!value) return "n/a";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "n/a";
  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatJobRange(metadata: HistoricalJobMetadata | null | undefined) {
  if (!metadata) return "n/a";
  return metadata.from === metadata.to ? metadata.from : `${metadata.from} to ${metadata.to}`;
}

function formatJobDateCounts(metadata: HistoricalJobMetadata | null | undefined) {
  if (!metadata) return "0 / 0 / 0";
  return `${metadata.datesImported} / ${metadata.datesSkipped} / ${metadata.datesFailed}`;
}

function StatusMessage({ type, message }: { type: "success" | "warning" | "error"; message?: string }) {
  if (!message) return null;
  const classes = {
    success: "border-moss/30 bg-mint text-ink",
    warning: "border-amber/70 bg-amber/20 text-ink",
    error: "border-clay/40 bg-clay/10 text-ink"
  };

  return <div className={`mt-4 rounded-md border px-3 py-2 text-sm ${classes[type]}`}>{message}</div>;
}
