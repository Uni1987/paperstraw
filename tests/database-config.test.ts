import { describe, expect, it } from "vitest";
import {
  getCruisesDatabaseUrl,
  getPrivateJetsDatabaseUrl,
  looksLikeCruiseDatabaseUrl
} from "@/lib/database/config";

describe("module database URL resolution", () => {
  it("uses PRIVATE_JETS_DATABASE_URL before legacy DATABASE_URL for private jets", () => {
    expect(
      getPrivateJetsDatabaseUrl({
        PRIVATE_JETS_DATABASE_URL: "postgres://example.invalid/private-jets",
        DATABASE_URL: "postgres://example.invalid/legacy-private"
      })
    ).toBe("postgres://example.invalid/private-jets");
  });

  it("keeps DATABASE_URL as the private jets backwards-compatible fallback", () => {
    expect(getPrivateJetsDatabaseUrl({ DATABASE_URL: "postgres://example.invalid/private-jets" })).toBe(
      "postgres://example.invalid/private-jets"
    );
  });

  it("refuses a cruise-looking URL for private jets when detectable", () => {
    expect(() => getPrivateJetsDatabaseUrl({ DATABASE_URL: "postgres://example.invalid/cruises-dev" })).toThrow(
      /cruise-looking/
    );
  });

  it("uses CRUISES_DATABASE_URL before legacy CRUISE_DATABASE_URL for cruises", () => {
    expect(
      getCruisesDatabaseUrl({
        CRUISES_DATABASE_URL: "postgres://example.invalid/cruises-dev",
        CRUISE_DATABASE_URL: "postgres://example.invalid/legacy-cruise"
      })
    ).toBe("postgres://example.invalid/cruises-dev");
  });

  it("supports the singular CRUISE_DATABASE_URL as a cruise tooling fallback", () => {
    expect(getCruisesDatabaseUrl({ CRUISE_DATABASE_URL: "postgres://example.invalid/cruises-dev" })).toBe(
      "postgres://example.invalid/cruises-dev"
    );
  });

  it("does not let cruise code silently fall back to a private jets DATABASE_URL", () => {
    expect(() => getCruisesDatabaseUrl({ DATABASE_URL: "postgres://example.invalid/private-jets" })).toThrow(
      /CRUISES_DATABASE_URL/
    );
  });

  it("allows legacy DATABASE_URL only in an explicit cruises-dev worker context and only when detectable as cruise", () => {
    expect(
      getCruisesDatabaseUrl(
        {
          DATABASE_URL: "postgres://example.invalid/cruises-dev",
          CRUISE_WORKER_DATABASE_TARGET: "cruises-dev"
        },
        { allowLegacyDatabaseUrlWithCruiseTarget: true }
      )
    ).toBe("postgres://example.invalid/cruises-dev");

    expect(() =>
      getCruisesDatabaseUrl(
        {
          DATABASE_URL: "postgres://example.invalid/private-jets",
          CRUISE_WORKER_DATABASE_TARGET: "cruises-dev"
        },
        { allowLegacyDatabaseUrlWithCruiseTarget: true }
      )
    ).toThrow(/does not look like a cruise database/);
  });

  it("detects obvious cruise database names without exposing or parsing secrets", () => {
    expect(looksLikeCruiseDatabaseUrl("postgres://host.example/cruises-dev")).toBe(true);
    expect(looksLikeCruiseDatabaseUrl("postgres://host.example/private-jets")).toBe(false);
  });
});

