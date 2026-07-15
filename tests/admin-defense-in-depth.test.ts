import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  buildCruiseOpsStatus: vi.fn(),
  approveMmsiReviewCandidate: vi.fn(),
  listMmsiReviewCandidates: vi.fn(),
  applyApprovedMmsiReviewCandidates: vi.fn(),
  runDailyIngestion: vi.fn(),
  runScheduledIngestion: vi.fn(),
  dispatchHistoricalImportWorkflow: vi.fn(),
  importFlights: vi.fn(),
  headers: vi.fn(),
  redirect: vi.fn(),
  revalidatePath: vi.fn()
}));

vi.mock("@/lib/cruises/adminOps", () => ({ buildCruiseOpsStatus: mocks.buildCruiseOpsStatus }));
vi.mock("@/lib/cruises/mmsiReviewWorkflow", () => ({
  approveMmsiReviewCandidate: mocks.approveMmsiReviewCandidate,
  listMmsiReviewCandidates: mocks.listMmsiReviewCandidates,
  applyApprovedMmsiReviewCandidates: mocks.applyApprovedMmsiReviewCandidates
}));
vi.mock("@/lib/ingestion/daily", () => ({ runDailyIngestion: mocks.runDailyIngestion }));
vi.mock("@/lib/ingestion/scheduled", () => ({ runScheduledIngestion: mocks.runScheduledIngestion }));
vi.mock("@/lib/ingestion/githubHistoricalWorkflow", () => ({
  dispatchHistoricalImportWorkflow: mocks.dispatchHistoricalImportWorkflow
}));
vi.mock("@/lib/ingestion/importer", () => ({ importFlights: mocks.importFlights }));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("next/navigation", () => ({
  redirect: mocks.redirect.mockImplementation((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  })
}));
vi.mock("next/cache", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/cache")>()),
  revalidatePath: mocks.revalidatePath
}));

import { GET as getCruiseAdminStatus } from "@/app/api/admin/cruises/status/route";
import { POST as approveCandidate } from "@/app/api/admin/cruises/mmsi-candidates/[id]/approve/route";
import { POST as applyApproved } from "@/app/api/admin/cruises/mmsi-candidates/apply-approved/route";
import { GET as getDirectIngest, POST as postDirectIngest } from "@/app/api/ingest/route";
import { startHistoricalImportAction } from "@/app/admin/actions";
import { AdminAuthorizationError, validateAdminMutationOrigin } from "@/lib/auth/adminAuthorization";
import { encodeBasicCredentials } from "@/lib/auth/adminAuth";

const adminOrigin = "https://paperstraw.test";

describe("admin defense-in-depth authorization", () => {
  beforeEach(() => {
    process.env.ADMIN_USERNAME = "admin";
    process.env.ADMIN_PASSWORD = "secret";
    delete process.env.ADMIN_ALLOWED_ORIGINS;
    vi.clearAllMocks();
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.redirect.mockImplementation((url: string) => {
      throw new Error(`REDIRECT:${url}`);
    });
    mocks.buildCruiseOpsStatus.mockResolvedValue({ status: "healthy" });
    mocks.approveMmsiReviewCandidate.mockResolvedValue({ status: "approved", message: "Approved" });
    mocks.listMmsiReviewCandidates.mockResolvedValue({ rows: [] });
    mocks.applyApprovedMmsiReviewCandidates.mockResolvedValue({ rowsConsidered: 0, wouldApply: 0, applied: 0, skipped: [] });
    mocks.runDailyIngestion.mockResolvedValue({ errors: [] });
    mocks.runScheduledIngestion.mockResolvedValue({ errors: [] });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.ADMIN_USERNAME;
    delete process.env.ADMIN_PASSWORD;
    delete process.env.ADMIN_ALLOWED_ORIGINS;
  });

  it.each([
    ["missing", undefined],
    ["malformed", "Bearer secret"],
    ["incorrect username", encodeBasicCredentials("other", "secret")],
    ["incorrect password", encodeBasicCredentials("admin", "wrong")]
  ])("rejects %s Basic credentials inside a read handler", async (_label, authorization) => {
    const request = new Request(`${adminOrigin}/api/admin/cruises/status`, {
      headers: authorization ? { authorization } : undefined
    });
    const response = await getCruiseAdminStatus(request);

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain("Basic");
    expect(mocks.buildCruiseOpsStatus).not.toHaveBeenCalled();
  });

  it("fails closed when admin credential configuration is missing", async () => {
    delete process.env.ADMIN_PASSWORD;
    const response = await getCruiseAdminStatus(new Request(`${adminOrigin}/api/admin/cruises/status`, {
      headers: { authorization: encodeBasicCredentials("admin", "secret") }
    }));

    expect(response.status).toBe(401);
    expect(mocks.buildCruiseOpsStatus).not.toHaveBeenCalled();
  });

  it("accepts correct credentials directly in the handler without middleware", async () => {
    const response = await getCruiseAdminStatus(new Request(`${adminOrigin}/api/admin/cruises/status`, {
      headers: basicHeaders()
    }));

    expect(response.status).toBe(200);
    expect(mocks.buildCruiseOpsStatus).toHaveBeenCalledTimes(1);
  });

  it("rejects a cross-origin mutation before database workflow calls", async () => {
    const request = adminMutationRequest("/api/admin/cruises/mmsi-candidates/queue-1/approve", undefined, "https://evil.test");
    const response = await approveCandidate(request, { params: Promise.resolve({ id: "queue-1" }) });

    expect(response.status).toBe(403);
    expect(mocks.approveMmsiReviewCandidate).not.toHaveBeenCalled();
    expect(mocks.listMmsiReviewCandidates).not.toHaveBeenCalled();
  });

  it("rejects a browser mutation with no Origin before database workflow calls", async () => {
    const request = new NextRequest(`${adminOrigin}/api/admin/cruises/mmsi-candidates/queue-1/approve`, {
      method: "POST",
      headers: basicHeaders()
    });
    const response = await approveCandidate(request, { params: Promise.resolve({ id: "queue-1" }) });

    expect(response.status).toBe(403);
    expect(mocks.approveMmsiReviewCandidate).not.toHaveBeenCalled();
  });

  it("accepts a same-origin mutation and validates the route id", async () => {
    const request = adminMutationRequest("/api/admin/cruises/mmsi-candidates/queue-1/approve");
    const response = await approveCandidate(request, { params: Promise.resolve({ id: "queue-1" }) });

    expect(response.status).toBe(200);
    expect(mocks.approveMmsiReviewCandidate).toHaveBeenCalledWith("queue-1", expect.any(String));
  });

  it("rejects unknown apply fields before the apply workflow", async () => {
    const request = adminMutationRequest(
      "/api/admin/cruises/mmsi-candidates/apply-approved",
      JSON.stringify({ confirm: false, force: true })
    );
    const response = await applyApproved(request);

    expect(response.status).toBe(400);
    expect(mocks.applyApprovedMmsiReviewCandidates).not.toHaveBeenCalled();
  });

  it("requires auth and same-origin before direct ingestion", async () => {
    const unauthorized = new NextRequest(`${adminOrigin}/api/ingest`, {
      method: "POST",
      body: JSON.stringify({ provider: "daily" }),
      headers: { "content-type": "application/json", origin: adminOrigin }
    });
    const rejected = await postDirectIngest(unauthorized);

    expect(rejected.status).toBe(401);
    expect(mocks.runDailyIngestion).not.toHaveBeenCalled();

    const authorized = adminMutationRequest("/api/ingest", JSON.stringify({ provider: "daily" }));
    const accepted = await postDirectIngest(authorized);
    expect(accepted.status).toBe(200);
    expect(mocks.runDailyIngestion).toHaveBeenCalledTimes(1);
  });

  it("server actions reject direct unauthorized invocation before external dispatch", async () => {
    mocks.headers.mockResolvedValue(new Headers({ host: "paperstraw.test", origin: adminOrigin }));
    const formData = new FormData();
    formData.set("from", "2026-07-01");
    formData.set("to", "2026-07-01");

    await expect(startHistoricalImportAction(formData)).rejects.toBeInstanceOf(AdminAuthorizationError);
    expect(mocks.dispatchHistoricalImportWorkflow).not.toHaveBeenCalled();
  });

  it("server actions accept matching Basic credentials from the same origin", async () => {
    mocks.headers.mockResolvedValue(new Headers({
      ...basicHeaders(),
      host: "paperstraw.test",
      origin: adminOrigin,
      "sec-fetch-site": "same-origin",
      "x-forwarded-proto": "https"
    }));
    mocks.dispatchHistoricalImportWorkflow.mockResolvedValue({
      status: "queued",
      jobId: "job-1",
      skippedDateKeys: []
    });
    const formData = new FormData();
    formData.set("from", "2026-07-01");
    formData.set("to", "2026-07-01");

    await expect(startHistoricalImportAction(formData)).rejects.toThrow("REDIRECT:/admin/private-jets?success=");
    expect(mocks.dispatchHistoricalImportWorkflow).toHaveBeenCalledTimes(1);
  });

  it("uses Origin as the primary same-origin check and Sec-Fetch-Site as an additional signal", () => {
    expect(validateAdminMutationOrigin({
      origin: adminOrigin,
      requestOrigin: adminOrigin,
      secFetchSite: "same-origin"
    })).toEqual({ ok: true });
    expect(validateAdminMutationOrigin({
      origin: null,
      requestOrigin: adminOrigin,
      secFetchSite: null
    })).toMatchObject({ ok: false, reason: "missing-origin" });
    expect(validateAdminMutationOrigin({
      origin: "https://evil.test",
      requestOrigin: adminOrigin,
      secFetchSite: "cross-site"
    })).toMatchObject({ ok: false });
  });

  it("keeps state-changing GET ingestion disabled", async () => {
    const response = getDirectIngest();
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST");
    expect(mocks.runDailyIngestion).not.toHaveBeenCalled();
    expect(mocks.runScheduledIngestion).not.toHaveBeenCalled();
  });

  it("never writes supplied credentials into audit logs", async () => {
    const suppliedAuthorization = encodeBasicCredentials("attacker", "do-not-log-this");
    await getCruiseAdminStatus(new Request(`${adminOrigin}/api/admin/cruises/status`, {
      headers: { authorization: suppliedAuthorization }
    }));

    const logOutput = vi.mocked(console.warn).mock.calls.flat().join(" ");
    expect(logOutput).not.toContain(suppliedAuthorization);
    expect(logOutput).not.toContain("attacker");
    expect(logOutput).not.toContain("do-not-log-this");
  });
});

function basicHeaders() {
  return { authorization: encodeBasicCredentials("admin", "secret") };
}

function adminMutationRequest(pathname: string, body?: string, origin = adminOrigin) {
  return new NextRequest(`${adminOrigin}${pathname}`, {
    method: "POST",
    headers: {
      ...basicHeaders(),
      origin,
      "content-type": "application/json",
      "sec-fetch-site": origin === adminOrigin ? "same-origin" : "cross-site"
    },
    ...(body === undefined ? {} : { body })
  });
}
