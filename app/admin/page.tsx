import { runDailyImportAction, uploadCsvAction } from "./actions";
import { RefreshSubmitButton } from "./RefreshSubmitButton";
import { getCronOperationalStatus } from "@/lib/config/cron";
import { getAttributionQualityReport } from "@/lib/data/attributionQuality";
import { getImportFreshness } from "@/lib/ingestion/freshness";
import { getImportStatusSummary } from "@/lib/ingestion/state";
import Link from "next/link";
import type { ReactNode } from "react";

type AdminProps = {
  searchParams?: {
    success?: string;
    error?: string;
    warning?: string;
  };
};

export default async function AdminPage({ searchParams }: AdminProps) {
  const [status, attributionQuality, freshness] = await Promise.all([
    getImportStatusSummary(),
    getAttributionQualityReport(),
    getImportFreshness()
  ]);
  const cronStatus = getCronOperationalStatus();

  return (
    <main className="min-h-screen bg-[#f7faf8] px-4 py-10 text-ink sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
      <p className="text-sm font-semibold uppercase tracking-normal text-clay">Imports</p>
      <h1 className="mt-3 text-4xl font-bold tracking-normal text-ink">Admin data imports</h1>

      <StatusMessage type="success" message={searchParams?.success} />
      <StatusMessage type="warning" message={searchParams?.warning} />
      <StatusMessage type="error" message={searchParams?.error} />
      {!cronStatus.cronSecretConfigured ? (
        <StatusMessage type="warning" message="CRON_SECRET is not configured. /api/cron/ingest will reject scheduled refresh requests." />
      ) : null}
      {cronStatus.cronSecretIsDefault ? (
        <StatusMessage type="warning" message="CRON_SECRET is still set to change-me. Replace it before production deployment." />
      ) : null}
      {!cronStatus.scheduleMatchesRefresh ? (
        <StatusMessage
          type="warning"
          message={`Vercel cron schedule is ${cronStatus.scheduleLabel}, but DATA_REFRESH_INTERVAL_MINUTES is ${cronStatus.refreshIntervalMinutes} minutes.`}
        />
      ) : null}

      <section className="mt-8 rounded-lg border border-ink/10 bg-white p-6 shadow-soft">
        <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr] lg:items-end">
          <div>
            <h2 className="text-lg font-semibold text-ink">Latest real-data import</h2>
            <p className="mt-3 text-sm leading-6 text-ink/65">
              Runs the same recent-data refresh manually, outside the automatic cron schedule. It filters to
              private/business jet aircraft types, writes aggregate rollups, and refreshes the public pages. Leave the URL
              blank to use ADSB.lol public aircraft-type snapshots.
            </p>
          </div>
          <form action={runDailyImportAction} className="grid gap-3">
            <label className="text-sm font-semibold text-ink" htmlFor="adsbLolUrl">
              ADSB.lol source URL
            </label>
            <input
              id="adsbLolUrl"
              name="adsbLolUrl"
              type="url"
              placeholder="Optional: historical/export URL. Blank uses public type snapshots."
              className="w-full rounded-md border border-ink/15 bg-white px-3 py-2 text-sm"
            />
            <RefreshSubmitButton />
          </form>
        </div>
      </section>

      <section className="mt-8 rounded-lg border border-ink/10 bg-white p-6 shadow-soft">
        <h2 className="text-lg font-semibold text-ink">Cron refresh status</h2>
        <p className="mt-2 text-sm leading-6 text-ink/65">
          Vercel Cron should call the protected endpoint on the schedule below. The endpoint runs the same recent-data
          logic as <code>pnpm ingest:daily</code>, while administrators can trigger additional manual refreshes when needed.
        </p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <QualityCard label="Cron endpoint" value={cronStatus.endpointPath} />
          <QualityCard label="Cron schedule" value={cronStatus.vercelSchedule} />
          <QualityCard label="Automatic refresh" value={cronStatus.scheduleLabel} />
          <QualityCard label="Secret configured" value={cronStatus.cronSecretConfigured ? "Yes" : "No"} />
        </div>
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <StatusPanel title="Latest scheduled refresh">
            <StatusRow label="Last successful refresh" value={formatDateTime(freshness.lastSuccessfulUpdateAt)} detail="Most recent successful or partial scheduled ingestion run." />
            <StatusRow label="Latest refresh status" value={freshness.latestStatus ?? "n/a"} detail={`Latest run ended: ${formatDateTime(freshness.latestRunEndedAt)}`} />
            <StatusRow label="Records fetched" value={freshness.latestRecordsFetched.toLocaleString()} detail="Provider records returned before cursor filtering." />
            <StatusRow label="Records imported" value={freshness.latestRecordsImported.toLocaleString()} detail="New records written during the latest run." />
          </StatusPanel>
          <StatusPanel title="Configuration checks">
            <StatusRow
              label="Schedule matches interval"
              value={cronStatus.scheduleMatchesRefresh ? "Yes" : "No"}
              detail={`vercel.json is ${cronStatus.scheduleLabel}; DATA_REFRESH_INTERVAL_MINUTES is ${cronStatus.refreshIntervalMinutes} minutes.`}
            />
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
              Recent operation uses the ADSB.lol API cursor. Historical bootstrap dates are recorded so multi-GB archives are
              not scanned again after a successful import.
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

        <StatusPanel className="mt-4" title="Recent import logs">
          {status.recentImportLogs.length ? (
            status.recentImportLogs.map((log) => (
              <StatusRow
                key={log.id}
                label={`${log.provider} / ${log.status}`}
                value={`${log.recordsImported.toLocaleString()} records`}
                detail={`${formatDateTime(log.timestamp)} | Fetched: ${log.recordsFetched.toLocaleString()} | Considered: ${log.recordsConsidered.toLocaleString()}${log.errors ? ` | ${log.errors.slice(0, 140)}` : ""}`}
              />
            ))
          ) : (
            <p className="text-sm text-ink/60">No import logs yet.</p>
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

function StatusMessage({ type, message }: { type: "success" | "warning" | "error"; message?: string }) {
  if (!message) return null;
  const classes = {
    success: "border-moss/30 bg-mint text-ink",
    warning: "border-amber/70 bg-amber/20 text-ink",
    error: "border-clay/40 bg-clay/10 text-ink"
  };

  return <div className={`mt-4 rounded-md border px-3 py-2 text-sm ${classes[type]}`}>{message}</div>;
}
