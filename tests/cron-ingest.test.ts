import { beforeEach, describe, expect, it } from "vitest";
import { handleCronIngest } from "@/lib/api/cronIngest";

function successfulResult(imported = 1) {
  return {
    provider: "adsb_lol",
    imported,
    skipped: 0,
    fetched: imported,
    considered: imported,
    lastImportedAt: new Date("2026-06-23T10:00:00Z"),
    errors: [],
    rollups: 4
  };
}

describe("cron ingest handler", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = "cron-secret";
  });

  it("returns 401 for unauthenticated cron requests", async () => {
    let called = false;
    const response = await handleCronIngest(new Request("https://paperstraw.test/api/cron/ingest"), {
      runRecentIngestion: async () => {
        called = true;
        return successfulResult();
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
        runRecentIngestion: async () => {
          called = true;
          return successfulResult();
        }
      }
    );

    expect(response.status).toBe(401);
    expect(called).toBe(false);
  });

  it("runs recent ingestion for valid bearer tokens", async () => {
    let calls = 0;
    const response = await handleCronIngest(
      new Request("https://paperstraw.test/api/cron/ingest", {
        headers: { authorization: "Bearer cron-secret" }
      }),
      {
        runRecentIngestion: async () => {
          calls += 1;
          return successfulResult(3);
        }
      }
    );

    const body = await response.json();
    expect(response.status).toBe(200);
    expect(calls).toBe(1);
    expect(body).toMatchObject({ status: "success", imported: 3, fetched: 3, rollups: 4 });
  });

  it("does not call historical ingestion and repeated runs can report duplicate skips", async () => {
    let calls = 0;
    const runRecentIngestion = async () => {
      calls += 1;
      return calls === 1 ? successfulResult(1) : { ...successfulResult(0), skipped: 1, fetched: 1, considered: 0 };
    };

    const request = () =>
      new Request("https://paperstraw.test/api/cron/ingest", {
        headers: { authorization: "Bearer cron-secret" }
      });

    const first = await handleCronIngest(request(), { runRecentIngestion });
    const second = await handleCronIngest(request(), { runRecentIngestion });
    const secondBody = await second.json();

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(calls).toBe(2);
    expect(secondBody).toMatchObject({ imported: 0, skipped: 1 });
  });
});
