import { describe, expect, it } from "vitest";
import {
  encodeBasicCredentials,
  isProtectedAdminPath,
  isValidAdminBasicAuth,
  isValidCronSecretAuth
} from "@/lib/auth/adminAuth";

describe("admin route protection", () => {
  it("protects admin and ingestion paths but leaves public pages public", () => {
    expect(isProtectedAdminPath("/admin")).toBe(true);
    expect(isProtectedAdminPath("/admin/validation")).toBe(true);
    expect(isProtectedAdminPath("/api/admin/import")).toBe(true);
    expect(isProtectedAdminPath("/api/cron/ingest")).toBe(true);
    expect(isProtectedAdminPath("/api/ingest")).toBe(true);

    expect(isProtectedAdminPath("/")).toBe(false);
    expect(isProtectedAdminPath("/data")).toBe(false);
    expect(isProtectedAdminPath("/methodology")).toBe(false);
    expect(isProtectedAdminPath("/support")).toBe(false);
  });

  it("accepts only matching HTTP Basic credentials for admin routes", () => {
    const authorization = encodeBasicCredentials("admin", "secret");

    expect(
      isValidAdminBasicAuth({
        authorization,
        expectedUsername: "admin",
        expectedPassword: "secret"
      })
    ).toBe(true);
    expect(
      isValidAdminBasicAuth({
        authorization,
        expectedUsername: "admin",
        expectedPassword: "wrong"
      })
    ).toBe(false);
    expect(
      isValidAdminBasicAuth({
        authorization: null,
        expectedUsername: "admin",
        expectedPassword: "secret"
      })
    ).toBe(false);
  });

  it("allows cron secret auth only for cron paths", () => {
    expect(
      isValidCronSecretAuth({
        pathname: "/api/cron/ingest",
        authorization: "Bearer cron-secret",
        expectedSecret: "cron-secret"
      })
    ).toBe(true);
    expect(
      isValidCronSecretAuth({
        pathname: "/api/ingest",
        authorization: "Bearer cron-secret",
        expectedSecret: "cron-secret"
      })
    ).toBe(false);
  });
});
