import { describe, expect, it } from "vitest";
import { formatCronScheduleLabel, getCronOperationalStatus, getCronScheduleIntervalMinutes } from "@/lib/config/cron";
import { formatRefreshInterval, parseDataRefreshIntervalMinutes } from "@/lib/config/refresh";
import { buildImportFreshness } from "@/lib/ingestion/freshness";
import { isAuthorizedCronRequest } from "@/lib/ingestion/cronAuth";
import { getRecordsNewerThanCursor } from "@/lib/ingestion/daily";
import { ImportStatuses } from "@/lib/ingestion/importStatus";
import type { NormalizedFlightRecord } from "@/lib/ingestion/types";

function record(sourceRecordId: string, departureAt: Date): NormalizedFlightRecord {
  return {
    icaoHex: sourceRecordId,
    aircraftType: "GLF6",
    originAirport: "KTEB",
    destinationAirport: "KLAX",
    departureAt,
    distanceKm: 4000,
    dataSource: "ADSB_LOL",
    sourceRecordId,
    sourceAttribution: "test"
  };
}

describe("refresh interval configuration", () => {
  it("defaults and formats supported refresh intervals", () => {
    expect(parseDataRefreshIntervalMinutes(undefined)).toBe(1440);
    expect(parseDataRefreshIntervalMinutes("30")).toBe(30);
    expect(formatRefreshInterval(1440)).toBe("Updated throughout the day using scheduled and manual data imports.");
    expect(formatRefreshInterval(30)).toBe("Updated throughout the day using scheduled and manual data imports.");
  });

  it("recognizes Vercel cron schedules and matches the default refresh interval", () => {
    expect(getCronScheduleIntervalMinutes("0 1 * * *")).toBe(1440);
    expect(formatCronScheduleLabel("0 1 * * *")).toBe("Daily");
    expect(
      getCronOperationalStatus({
        DATA_REFRESH_INTERVAL_MINUTES: "1440",
        CRON_SECRET: "not-default"
      } as unknown as NodeJS.ProcessEnv)
    ).toMatchObject({
      endpointPath: "/api/cron/ingest",
      scheduleIntervalMinutes: 1440,
      scheduleLabel: "Daily",
      scheduleMatchesRefresh: true,
      cronSecretConfigured: true,
      cronSecretIsDefault: false
    });
  });
});

describe("daily cursor filtering", () => {
  it("keeps only records newer than the import cursor", () => {
    const cursor = new Date("2026-06-23T10:00:00Z");
    const records = [
      record("old", new Date("2026-06-23T09:59:00Z")),
      record("same", new Date("2026-06-23T10:00:00Z")),
      record("new", new Date("2026-06-23T10:30:00Z"))
    ];

    expect(getRecordsNewerThanCursor(records, cursor).map((item) => item.sourceRecordId)).toEqual(["new"]);
  });
});

describe("freshness display logic", () => {
  it("reports latest successful update for healthy imports", () => {
    const successAt = new Date("2026-06-23T10:00:00Z");
    const freshness = buildImportFreshness(
      [
        {
          id: "1",
          provider: "ADSB_LOL",
          mode: "DAILY_API",
          timestamp: successAt,
          runStartedAt: new Date("2026-06-23T09:59:00Z"),
          runEndedAt: successAt,
          status: ImportStatuses.SUCCESS,
          recordsFetched: 10,
          recordsConsidered: 4,
          recordsImported: 3,
          errors: null
        }
      ],
      1440
    );

    expect(freshness.latestUpdateFailed).toBe(false);
    expect(freshness.latestRecordsImported).toBe(3);
    expect(freshness.nextExpectedUpdateAt?.toISOString()).toBe("2026-06-24T10:00:00.000Z");
    expect(freshness.publicMessage).toContain("Last successful update:");
  });

  it("falls back to last successful data after a failed latest import", () => {
    const freshness = buildImportFreshness(
      [
        {
          id: "failed",
          provider: "ADSB_LOL",
          mode: "DAILY_API",
          timestamp: new Date("2026-06-23T11:00:00Z"),
          runStartedAt: new Date("2026-06-23T10:59:00Z"),
          runEndedAt: new Date("2026-06-23T11:00:00Z"),
          status: ImportStatuses.FAILED,
          recordsFetched: 0,
          recordsConsidered: 0,
          recordsImported: 0,
          errors: "provider unavailable"
        },
        {
          id: "success",
          provider: "ADSB_LOL",
          mode: "DAILY_API",
          timestamp: new Date("2026-06-23T10:00:00Z"),
          runStartedAt: new Date("2026-06-23T09:59:00Z"),
          runEndedAt: new Date("2026-06-23T10:00:00Z"),
          status: ImportStatuses.SUCCESS,
          recordsFetched: 10,
          recordsConsidered: 10,
          recordsImported: 10,
          errors: null
        }
      ],
      1440
    );

    expect(freshness.latestUpdateFailed).toBe(true);
    expect(freshness.publicMessage).toContain("Latest update failed. Showing last successful data from");
  });
});

describe("cron authorization", () => {
  it("rejects missing cron secrets and accepts bearer tokens", () => {
    const missing = new Request("https://paperstraw.test/api/cron/ingest");
    const authorized = new Request("https://paperstraw.test/api/cron/ingest", {
      headers: { authorization: "Bearer test-secret" }
    });

    expect(isAuthorizedCronRequest(missing, "test-secret")).toBe(false);
    expect(isAuthorizedCronRequest(authorized, "test-secret")).toBe(true);
  });
});
