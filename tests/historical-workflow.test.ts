import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { dispatchHistoricalImportWorkflow } from "@/lib/ingestion/githubHistoricalWorkflow";
import { getHistoricalResultStatus, isSystemicHistoricalError, shouldSkipHistoricalDate } from "@/lib/ingestion/historical";
import { ImportStatuses } from "@/lib/ingestion/importStatus";
import {
  MAX_MANUAL_HISTORICAL_RANGE_DAYS,
  enumerateUtcDateRange,
  parseManualHistoricalImportForm,
  parseUtcDateKey,
  validateHistoricalImportRequest
} from "@/lib/ingestion/historicalRequest";

const NOW = new Date("2026-07-13T12:00:00Z");

describe("historical import request validation", () => {
  it("enumerates from and to inclusively", () => {
    expect(enumerateUtcDateRange(parseUtcDateKey("2026-07-05"), parseUtcDateKey("2026-07-07")).map((date) => date.toISOString().slice(0, 10)))
      .toEqual(["2026-07-05", "2026-07-06", "2026-07-07"]);
  });

  it("rejects invalid, reversed, current, future, and oversized manual ranges", () => {
    expect(() => parseUtcDateKey("2026-02-30")).toThrow("valid calendar date");
    expect(() => validateHistoricalImportRequest({
      from: parseUtcDateKey("2026-07-11"), to: parseUtcDateKey("2026-07-10"), force: false, source: "manual"
    }, { now: NOW })).toThrow("before or equal");
    expect(() => validateHistoricalImportRequest({
      from: parseUtcDateKey("2026-07-13"), to: parseUtcDateKey("2026-07-13"), force: false, source: "manual"
    }, { now: NOW })).toThrow("completed UTC calendar days");
    expect(() => validateHistoricalImportRequest({
      from: parseUtcDateKey("2026-07-14"), to: parseUtcDateKey("2026-07-14"), force: false, source: "manual"
    }, { now: NOW })).toThrow("completed UTC calendar days");
    expect(() => validateHistoricalImportRequest({
      from: parseUtcDateKey("2026-06-01"), to: parseUtcDateKey("2026-07-02"), force: false, source: "manual"
    }, { now: NOW })).toThrow(`${MAX_MANUAL_HISTORICAL_RANGE_DAYS} inclusive days`);
  });

  it("parses the protected admin form values without local-time conversion", () => {
    const form = new FormData();
    form.set("from", "2026-07-05");
    form.set("to", "2026-07-11");
    form.set("force", "on");
    const request = parseManualHistoricalImportForm(form, NOW);

    expect(request).toMatchObject({ force: true, source: "manual", dayCount: 7 });
    expect(request.from.toISOString()).toBe("2026-07-05T00:00:00.000Z");
    expect(request.to.toISOString()).toBe("2026-07-11T00:00:00.000Z");
  });
});

describe("historical job semantics", () => {
  it("skips successful dates unless force is explicit", () => {
    expect(shouldSkipHistoricalDate({ force: false, processedStatus: ImportStatuses.SUCCESS, existingHistoricalRecords: 0 })).toBe(true);
    expect(shouldSkipHistoricalDate({ force: true, processedStatus: ImportStatuses.SUCCESS, existingHistoricalRecords: 10 })).toBe(false);
  });

  it("reports a mixed date range as partial", () => {
    const base = { recordsFetched: 0, recordsConsidered: 0, recordsImported: 0, attributionUpdated: 0, error: null };
    expect(getHistoricalResultStatus([
      { ...base, dateKey: "2026-07-01", status: "imported" },
      { ...base, dateKey: "2026-07-02", status: "failed", error: "source unavailable" }
    ], ["source unavailable"])).toBe(ImportStatuses.PARTIAL);
  });

  it("stops on systemic database or upstream authorization failures", () => {
    expect(isSystemicHistoricalError(new Error("Prisma P1001 database unavailable"))).toBe(true);
    expect(isSystemicHistoricalError(new Error("GitHub release lookup failed with 403"))).toBe(true);
    expect(isSystemicHistoricalError(new Error("Invalid JSON in one archive entry"))).toBe(false);
  });

  it("dispatches a sanitized GitHub workflow payload and does not execute ingestion in the request", async () => {
    const bodies: unknown[] = [];
    let marked = false;
    const request = {
      from: parseUtcDateKey("2026-07-11"),
      to: parseUtcDateKey("2026-07-11"),
      force: false,
      source: "manual" as const
    };
    const result = await dispatchHistoricalImportWorkflow(request, {
      env: {
        GITHUB_ACTIONS_TOKEN: "secret-token",
        GITHUB_ACTIONS_REPOSITORY: "paperstraw/app",
        GITHUB_ACTIONS_REF: "feature/private-jets-historical-ingest"
      } as unknown as NodeJS.ProcessEnv,
      prepare: async () => ({
        jobId: "job-123",
        request,
        status: "queued",
        claimedDateKeys: ["2026-07-11"],
        skippedDateKeys: []
      }),
      fetchImpl: async (_url, init) => {
        bodies.push(JSON.parse(String(init?.body)));
        return new Response(null, { status: 204 });
      },
      markDispatched: async () => { marked = true; }
    });

    expect(result.status).toBe("queued");
    expect(marked).toBe(true);
    expect(bodies).toEqual([{
      ref: "feature/private-jets-historical-ingest",
      inputs: { from: "2026-07-11", to: "2026-07-11", force: "false", source: "manual", job_id: "job-123" }
    }]);
    expect(JSON.stringify(bodies)).not.toContain("secret-token");
  });

  it("keeps the CLI command and removes the old recent-data admin controls", () => {
    const packageJson = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8"));
    const page = readFileSync(join(process.cwd(), "app/admin/private-jets/page.tsx"), "utf8");
    expect(packageJson.scripts["ingest:historical"]).toBe("tsx scripts/ingest-flights.ts historical");
    expect(page).toContain("Historical data import");
    expect(page).not.toContain("Latest real-data import");
    expect(page).not.toContain("ADSB.lol source URL");
  });
});
