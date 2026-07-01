import Link from "next/link";
import type { ReactNode } from "react";
import { LazyDataReportCharts } from "@/components/LazyDataReportCharts";
import { PublicShell } from "@/components/PublicShell";
import { getDataReport } from "@/lib/data/report";
import { normalizeDate } from "@/lib/dates";
import { formatCo2, formatKm } from "@/lib/format";
import type { AwarenessRankPoint } from "@/lib/awareness/types";

export const dynamic = "force-dynamic";

export default async function DataPage() {
  const report = await getDataReport();

  return (
    <PublicShell>
      <section className="mx-auto max-w-7xl pb-14 pt-16 sm:pt-24">
        <div className="max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-normal text-paper">Transparency report</p>
          <h1 className="mt-4 text-5xl font-semibold tracking-normal text-white sm:text-6xl lg:text-7xl">
            The PaperStraw dataset
          </h1>
          <p className="mt-6 text-lg leading-8 text-white/68 sm:text-xl">
            Aggregate statistics, import health, and data quality context for the private jet emissions estimates shown
            across PaperStraw.
          </p>
          <p className="mt-5 inline-flex rounded-full border border-paper/30 bg-paper/10 px-4 py-2 text-sm font-medium text-paper">
            {report.isDemo ? "Demo data shown until real imports exist" : "Based on latest imported flight data"}
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-7xl pb-20">
        <SectionIntro
          eyebrow="Dataset overview"
          title="What is currently in the local dataset"
          description="These figures describe the imported aggregate flight records stored in the configured PostgreSQL database."
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {report.summary.map((metric) => (
            <article key={metric.label} className="rounded-lg border border-white/10 bg-white/[0.035] p-5">
              <p className="text-sm font-medium text-white/58">{metric.label}</p>
              <p className="mt-4 text-2xl font-semibold tracking-normal text-white">{metric.value}</p>
              {metric.detail ? <p className="mt-3 text-sm leading-6 text-white/48">{metric.detail}</p> : null}
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl pb-20">
        <SectionIntro
          eyebrow="Freshness"
          title="Scheduled data refreshes"
          description="Updates occur through scheduled and manual refreshes. Aggregate data is updated without displaying live positions or tracking individual aircraft."
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <HealthCard label="Last successful update" value={formatDateTime(report.freshness.lastSuccessfulUpdateAt)} />
          <HealthCard label="Next scheduled update" value={formatDateTime(report.freshness.nextExpectedUpdateAt)} />
          <HealthCard label="Latest import status" value={report.freshness.latestStatus?.toLowerCase() ?? "n/a"} />
          <HealthCard label="Latest records imported" value={report.freshness.latestRecordsImported.toLocaleString()} />
        </div>
        <p className="mt-4 rounded-lg border border-white/10 bg-white/[0.035] px-4 py-3 text-sm leading-6 text-white/64">
          Updates occur through scheduled and manual refreshes. {report.freshness.publicMessage} Latest run fetched{" "}
          {report.freshness.latestRecordsFetched.toLocaleString()} record(s) and considered{" "}
          {report.freshness.latestRecordsConsidered.toLocaleString()} newer record(s).
        </p>
      </section>

      <section className="mx-auto max-w-7xl pb-20">
        <SectionIntro
          eyebrow="Attribution quality"
          title="Country and airport mapping confidence"
          description="Unknown endpoints are tracked as data quality gaps and excluded from public country and airport rankings until they can be attributed without guessing."
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <HealthCard label="Country attribution rate" value={`${report.attributionQuality.countryAttributionRate}%`} />
          <HealthCard label="Airport attribution rate" value={`${report.attributionQuality.airportAttributionRate}%`} />
          <HealthCard label="Unknown country endpoints" value={`${report.attributionQuality.unknownCountryPercent}%`} />
          <HealthCard label="Unknown airport endpoints" value={`${report.attributionQuality.unknownAirportPercent}%`} />
        </div>
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <section className="rounded-lg border border-white/10 bg-white/[0.035] p-5">
            <h3 className="text-xl font-semibold text-white">Before / after public Unknown bucket</h3>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <MetricPair
                label="Country Unknown"
                before={report.attributionQuality.legacyUnknownCountryEndpoints}
                after={report.attributionQuality.publicUnknownCountryBucketAfter}
              />
              <MetricPair
                label="Airport Unknown"
                before={report.attributionQuality.legacyUnknownAirportEndpoints}
                after={report.attributionQuality.publicUnknownAirportBucketAfter}
              />
            </div>
            <p className="mt-5 text-sm leading-6 text-white/56">
              After values are the Unknown buckets emitted into public aggregate rankings. Unattributed endpoints remain
              counted in the quality rates above and are not reassigned.
            </p>
          </section>
          <section className="rounded-lg border border-white/10 bg-white/[0.035] p-5">
            <h3 className="text-xl font-semibold text-white">Most common unattributed endpoint values</h3>
            <div className="mt-4 space-y-3">
              {report.attributionQuality.topUnattributedEndpointValues.length ? (
                report.attributionQuality.topUnattributedEndpointValues.map((item) => (
                  <div key={item.value} className="flex items-center justify-between border-b border-white/10 pb-3 text-sm last:border-0">
                    <span className="font-medium text-white">{item.value}</span>
                    <span className="tabular-nums text-white/62">{item.count.toLocaleString()}</span>
                  </div>
                ))
              ) : (
                <p className="text-sm text-white/56">No unattributed endpoint values.</p>
              )}
            </div>
          </section>
        </div>
        <section className="mt-5 rounded-lg border border-white/10 bg-white/[0.035] p-5">
          <h3 className="text-xl font-semibold text-white">Source field analysis</h3>
          <ul className="mt-4 space-y-3 text-sm leading-6 text-white/62">
            {report.attributionQuality.sourceFieldNotes.map((note) => (
              <li key={note} className="border-b border-white/10 pb-3 last:border-0">
                {note}
              </li>
            ))}
          </ul>
        </section>
      </section>

      <section className="mx-auto max-w-7xl pb-20">
        <SectionIntro
          eyebrow="Import activity"
          title="Ingestion health and historical coverage"
          description="PaperStraw is built around scheduled batch imports, not live tracking. This section shows recent import outcomes and archive processing status."
        />
        <div className="grid gap-4 md:grid-cols-4">
          <HealthCard label="Total imports" value={report.importHealth.totalImports.toLocaleString()} />
          <HealthCard label="Successful imports" value={report.importHealth.successfulImports.toLocaleString()} />
          <HealthCard label="Failed imports" value={report.importHealth.failedImports.toLocaleString()} />
          <HealthCard label="Latest success" value={formatDateTime(report.importHealth.latestSuccessfulImportAt)} />
        </div>
        <div className="mt-6">
          <LazyDataReportCharts flightsPerDay={report.flightsPerDay} importsPerDay={report.importsPerDay} />
        </div>
        <div className="mt-6 grid gap-5 lg:grid-cols-2">
          <RecentImportLogs logs={report.importHealth.recentImportLogs} />
          <HistoricalArchiveStatus dates={report.importHealth.historicalArchiveDates} />
        </div>
      </section>

      <section className="mx-auto max-w-7xl pb-20">
        <SectionIntro
          eyebrow="Aggregate views"
          title="Grouped emissions, without individual aircraft exposure"
          description="These views preserve the existing aggregate aircraft type table and add country and airport summaries. No registrations, owners, tail numbers, personal names, or individual flight histories are shown."
        />
        <div className="space-y-8">
          <AggregateTable title="Aircraft type emissions" rows={report.aircraftTypes} firstColumnLabel="Aircraft type" />
          <AggregateTable title="Top countries" rows={report.topCountries} firstColumnLabel="Country" />
          <AggregateTable title="Top airports" rows={report.topAirports} firstColumnLabel="Airport" />
        </div>
      </section>

      <section className="border-t border-white/10 bg-white/[0.025]">
        <div className="mx-auto grid max-w-7xl gap-10 py-20 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <p className="text-sm font-semibold uppercase tracking-normal text-paper">Dataset notes</p>
            <h2 className="mt-4 text-4xl font-semibold tracking-normal text-white">How this report should be read</h2>
          </div>
          <div className="space-y-5 text-base leading-8 text-white/66">
            <p>
              Imports use ADSB.lol as the primary source where available, with OpenSky retained as a fallback and manual
              CSV import available for local recovery or research datasets.
            </p>
            <p>
              Historical ingestion processes ADSB.lol archive dates and records import status so large archives do not
              need to be rescanned repeatedly. Recent operation uses scheduled data refreshes for latest imported flight data.
            </p>
            <p>
              Aircraft are included by aircraft type allowlist for likely private or business jets. CO2 values are
              estimates based on configurable aircraft-type emission factors and route distance.
            </p>
            <Link href="/methodology" className="inline-flex text-sm font-semibold text-paper hover:text-white">
              Read the full methodology
            </Link>
          </div>
        </div>
      </section>
    </PublicShell>
  );
}

function SectionIntro({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return (
    <div className="mb-8 max-w-3xl">
      <p className="text-sm font-semibold uppercase tracking-normal text-paper">{eyebrow}</p>
      <h2 className="mt-3 text-3xl font-semibold tracking-normal text-white sm:text-4xl">{title}</h2>
      <p className="mt-4 text-base leading-7 text-white/62">{description}</p>
    </div>
  );
}

function HealthCard({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-lg border border-white/10 bg-white/[0.035] p-5">
      <p className="text-sm text-white/56">{label}</p>
      <p className="mt-3 text-xl font-semibold text-white">{value}</p>
    </article>
  );
}

function MetricPair({ label, before, after }: { label: string; before: number; after: number }) {
  return (
    <div className="rounded-lg border border-white/10 bg-charcoal/40 p-4">
      <p className="text-sm text-white/56">{label}</p>
      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-white/42">Before</p>
          <p className="mt-1 text-lg font-semibold tabular-nums text-white">{before.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-white/42">After</p>
          <p className="mt-1 text-lg font-semibold tabular-nums text-paper">{after.toLocaleString()}</p>
        </div>
      </div>
    </div>
  );
}

function RecentImportLogs({
  logs
}: {
  logs: Array<{ id: string; provider: string; timestamp: Date; status: string; recordsImported: number; errors: string | null }>;
}) {
  return (
    <ReportTable title="Recent import logs">
      <thead className="text-left text-xs uppercase tracking-normal text-white/48">
        <tr>
          <th className="px-4 py-3">Provider</th>
          <th className="px-4 py-3">Time</th>
          <th className="px-4 py-3 text-right">Records</th>
          <th className="px-4 py-3">Status</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-white/10">
        {logs.length ? (
          logs.map((log) => (
            <tr key={log.id}>
              <td className="px-4 py-4 font-medium text-white">{log.provider}</td>
              <td className="px-4 py-4 text-white/62">{formatDateTime(log.timestamp)}</td>
              <td className="px-4 py-4 text-right tabular-nums text-white/80">{log.recordsImported.toLocaleString()}</td>
              <td className="px-4 py-4">
                <StatusPill status={log.status} />
              </td>
            </tr>
          ))
        ) : (
          <EmptyRow columns={4} message="No import logs yet." />
        )}
      </tbody>
    </ReportTable>
  );
}

function HistoricalArchiveStatus({
  dates
}: {
  dates: Array<{ dateKey: string; status: string; recordsImported: number; filesScanned: number; filesMatched: number; releaseTag: string | null }>;
}) {
  return (
    <ReportTable title="Historical archive date status">
      <thead className="text-left text-xs uppercase tracking-normal text-white/48">
        <tr>
          <th className="px-4 py-3">Date</th>
          <th className="px-4 py-3 text-right">Imported</th>
          <th className="px-4 py-3 text-right">Files</th>
          <th className="px-4 py-3">Status</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-white/10">
        {dates.length ? (
          dates.map((date) => (
            <tr key={date.dateKey}>
              <td className="px-4 py-4">
                <div className="font-medium text-white">{date.dateKey}</div>
                {date.releaseTag ? <div className="mt-1 text-xs text-white/42">{date.releaseTag}</div> : null}
              </td>
              <td className="px-4 py-4 text-right tabular-nums text-white/80">{date.recordsImported.toLocaleString()}</td>
              <td className="px-4 py-4 text-right tabular-nums text-white/62">
                {date.filesMatched.toLocaleString()} / {date.filesScanned.toLocaleString()}
              </td>
              <td className="px-4 py-4">
                <StatusPill status={date.status} />
              </td>
            </tr>
          ))
        ) : (
          <EmptyRow columns={4} message="No processed historical archive dates yet." />
        )}
      </tbody>
    </ReportTable>
  );
}

function AggregateTable({
  title,
  rows,
  firstColumnLabel
}: {
  title: string;
  rows: AwarenessRankPoint[];
  firstColumnLabel: string;
}) {
  return (
    <ReportTable title={title}>
      <thead className="text-left text-xs uppercase tracking-normal text-white/48">
        <tr>
          <th className="px-4 py-3">{firstColumnLabel}</th>
          <th className="px-4 py-3 text-right">Flight records</th>
          <th className="px-4 py-3 text-right">Distance</th>
          <th className="px-4 py-3 text-right">Estimated CO2</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-white/10">
        {rows.length ? (
          rows.map((row) => (
            <tr key={row.label}>
              <td className="px-4 py-4 font-semibold text-white">{row.label}</td>
              <td className="px-4 py-4 text-right tabular-nums text-white/78">{row.flights.toLocaleString()}</td>
              <td className="px-4 py-4 text-right tabular-nums text-white/78">{formatKm(row.distanceKm)}</td>
              <td className="px-4 py-4 text-right tabular-nums font-semibold text-white">{formatCo2(row.estimatedCo2Kg)}</td>
            </tr>
          ))
        ) : (
          <EmptyRow columns={4} message="No aggregate records yet." />
        )}
      </tbody>
    </ReportTable>
  );
}

function ReportTable({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-lg border border-white/10 bg-white/[0.035]">
      <div className="border-b border-white/10 px-4 py-4">
        <h3 className="text-xl font-semibold text-white">{title}</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-white/10 text-sm">{children}</table>
      </div>
    </section>
  );
}

function StatusPill({ status }: { status: string }) {
  const tone = status === "SUCCESS" ? "border-paper/40 bg-paper/10 text-paper" : status === "FAILED" ? "border-red-300/40 bg-red-400/10 text-red-200" : "border-white/20 bg-white/10 text-white/70";

  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold uppercase tracking-normal ${tone}`}>
      {status.toLowerCase()}
    </span>
  );
}

function EmptyRow({ columns, message }: { columns: number; message: string }) {
  return (
    <tr>
      <td colSpan={columns} className="px-4 py-6 text-center text-white/50">
        {message}
      </td>
    </tr>
  );
}

function formatDateTime(value: Date | string | number | null | undefined) {
  const date = normalizeDate(value);
  if (!date) return "No successful import";
  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}
