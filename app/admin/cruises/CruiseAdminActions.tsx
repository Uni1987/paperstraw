"use client";

import { useState, useTransition } from "react";
import type { CruiseAdminPendingCandidate } from "@/lib/cruises/adminOps";

type ActionResult = {
  title: string;
  body: string;
  ok: boolean;
};

export function CruiseAdminActions({ candidates }: { candidates: CruiseAdminPendingCandidate[] }) {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);

  function runApprove(candidate: CruiseAdminPendingCandidate) {
    startTransition(async () => {
      const response = await fetch(`/api/admin/cruises/mmsi-candidates/${candidate.id}/approve`, { method: "POST" });
      const payload = await response.json().catch(() => null);
      setResult({
        title: response.ok ? "Candidate approved" : "Approval failed",
        body: payload?.result?.message ?? JSON.stringify(payload ?? {}),
        ok: response.ok
      });
    });
  }

  function runApply(confirm: boolean) {
    if (confirm && !window.confirm("Apply approved MMSI links now? This writes only explicitly approved, still-valid candidates.")) {
      return;
    }

    startTransition(async () => {
      const response = await fetch("/api/admin/cruises/mmsi-candidates/apply-approved", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm })
      });
      const payload = await response.json().catch(() => null);
      const body = payload?.error
        ? payload.error
        : payload
        ? `Rows considered: ${payload.rowsConsidered ?? 0}; would apply: ${payload.wouldApply ?? 0}; applied: ${payload.applied ?? 0}; skipped: ${payload.skipped?.length ?? 0}.`
        : "No response body returned.";
      setResult({
        title: confirm ? "Apply approved result" : "Apply approved dry-run",
        body,
        ok: response.ok
      });
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={isPending}
          onClick={() => runApply(false)}
          className="rounded-md border border-ink/15 bg-white px-4 py-2 text-sm font-semibold text-ink hover:bg-mint disabled:cursor-wait disabled:opacity-60"
        >
          Apply approved dry-run
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={() => runApply(true)}
          className="rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-moss disabled:cursor-wait disabled:opacity-60"
        >
          Apply approved confirm
        </button>
      </div>

      {result ? (
        <div className={`rounded-md border p-3 text-sm ${result.ok ? "border-moss/25 bg-mint/40 text-ink" : "border-red-200 bg-red-50 text-red-900"}`}>
          <p className="font-semibold">{result.title}</p>
          <p className="mt-1 text-ink/70">{result.body}</p>
        </div>
      ) : null}

      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="text-xs uppercase text-ink/45">
            <tr>
              <th className="py-2 pr-4">Vessel</th>
              <th className="py-2 pr-4">IMO</th>
              <th className="py-2 pr-4">Observed MMSI</th>
              <th className="py-2 pr-4">Seen</th>
              <th className="py-2 pr-4">Safety</th>
              <th className="py-2 pr-0 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/10">
            {candidates.length ? (
              candidates.map((candidate) => (
                <tr key={candidate.id}>
                  <td className="py-3 pr-4">
                    <p className="font-semibold text-ink">{candidate.vesselName}</p>
                    <p className="text-xs text-ink/50">{candidate.operator}</p>
                  </td>
                  <td className="py-3 pr-4 font-mono text-xs text-ink/70">{candidate.registryImo}</td>
                  <td className="py-3 pr-4 font-mono text-xs text-ink/70">{candidate.observedMmsi}</td>
                  <td className="py-3 pr-4 text-xs text-ink/60">
                    <p>{formatShortDate(candidate.lastSeenAt)}</p>
                    <p>{candidate.occurrences.toLocaleString()} occurrence(s)</p>
                  </td>
                  <td className="py-3 pr-4 text-xs">
                    <p className={candidate.safeToApprove ? "font-semibold text-moss" : "font-semibold text-clay"}>
                      {candidate.safeToApprove ? "Safe" : "Blocked"}
                    </p>
                    <p className="text-ink/50">{candidate.unsafeReason ?? candidate.conflictReason ?? "No conflict detected"}</p>
                  </td>
                  <td className="py-3 pr-0 text-right">
                    <button
                      type="button"
                      disabled={isPending || !candidate.safeToApprove}
                      onClick={() => runApprove(candidate)}
                      className="rounded-md border border-ink/15 bg-white px-3 py-2 text-xs font-semibold text-ink hover:bg-mint disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      Approve safe candidate
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td className="py-4 text-sm text-ink/60" colSpan={6}>
                  No pending safe MMSI candidates are waiting for review.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function formatShortDate(value: string | null) {
  if (!value) return "n/a";
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}
