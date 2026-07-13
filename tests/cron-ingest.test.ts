import { beforeEach, describe, expect, it } from "vitest";
import { handleCronIngest } from "@/lib/api/cronIngest";
import type { HistoricalImportRequest } from "@/lib/ingestion/historicalRequest";

function queuedResult(request: HistoricalImportRequest) {
  const dateKey = request.from.toISOString().slice(0, 10);
  return {
    jobId: "job-1",
    status: "queued" as const,
    claimedDateKeys: [dateKey],
    skippedDateKeys: [],
    workflowUrl: "https://github.com/example/paperstraw/actions/workflows/private-jets-historical-ingest.yml"
  };
}

describe("cron historical ingest dispatcher", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = "cron-secret";
  });

  it("returns 401 for unauthenticated cron requests", async () => {
    let called = false;
    const response = await handleCronIngest(new Request("https://paperstraw.test/api/cron/ingest"), {
      dispatch: async (request) => {
        called = true;
        return queuedResult(request);
      }
    });

    expect(response.status).toBe(401);
    expect(called).toBe(false);
  });

  it("returns 401 for invalid bearer tokens", async () => {
    let called = false;
    const response = await handleCronIngest(
      new Request("https://paperstraw.test/api/cron/ingest", {
        headers: { authorization: "Bearer wrong-secret" }
      }),
      {
        dispatch: async (request) => {
          called = true;
          return queuedResult(request);
        }
      }
    );

    expect(response.status).toBe(401);
    expect(called).toBe(false);
  });

  it("dispatches exactly the previous completed UTC day", async () => {
    const requests: HistoricalImportRequest[] = [];
    const response = await handleCronIngest(
      new Request("https://paperstraw.test/api/cron/ingest", {
        headers: { authorization: "Bearer cron-secret" }
      }),
      {
        now: () => new Date("2026-07-13T00:05:00-07:00"),
        dispatch: async (request) => {
          requests.push(request);
          return queuedResult(request);
        }
      }
    );

    const body = await response.json();
    expect(response.status).toBe(202);
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ force: false, source: "scheduled" });
    expect(requests[0].from.toISOString()).toBe("2026-07-12T00:00:00.000Z");
    expect(requests[0].to.toISOString()).toBe("2026-07-12T00:00:00.000Z");
    expect(body).toMatchObject({ status: "queued", from: "2026-07-12", to: "2026-07-12", timezone: "UTC" });
  });

  it("handles month and leap-year boundaries in UTC", async () => {
    const dates: string[] = [];
    const dispatch = async (request: HistoricalImportRequest) => {
      dates.push(request.from.toISOString().slice(0, 10));
      return queuedResult(request);
    };
    const authorized = { headers: { authorization: "Bearer cron-secret" } };

    await handleCronIngest(new Request("https://paperstraw.test/api/cron/ingest", authorized), {
      now: () => new Date("2028-03-01T00:30:00Z"),
      dispatch
    });
    await handleCronIngest(new Request("https://paperstraw.test/api/cron/ingest", authorized), {
      now: () => new Date("2027-03-01T00:30:00Z"),
      dispatch
    });

    expect(dates).toEqual(["2028-02-29", "2027-02-28"]);
  });

  it("does not start a duplicate when the date is already complete", async () => {
    let calls = 0;
    const dispatch = async (request: HistoricalImportRequest) => {
      calls += 1;
      if (calls === 1) return queuedResult(request);
      return {
        ...queuedResult(request),
        jobId: "job-2",
        status: "skipped" as const,
        claimedDateKeys: [],
        skippedDateKeys: [request.from.toISOString().slice(0, 10)],
        workflowUrl: null
      };
    };
    const request = () => new Request("https://paperstraw.test/api/cron/ingest", {
      headers: { authorization: "Bearer cron-secret" }
    });
    const now = () => new Date("2026-07-13T07:00:00Z");

    const first = await handleCronIngest(request(), { now, dispatch });
    const second = await handleCronIngest(request(), { now, dispatch });
    const body = await second.json();

    expect(first.status).toBe(202);
    expect(second.status).toBe(200);
    expect(body).toMatchObject({ status: "skipped", execution: "not-dispatched" });
  });
});
