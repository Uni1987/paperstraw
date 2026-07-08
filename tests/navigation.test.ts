import { describe, expect, it } from "vitest";
import {
  getActivePublicModuleSegment,
  getPublicMobileNavigation,
  getPublicSidebarNavigation,
  isActivePublicRoute,
  isPublicNavGroup,
  resolveModuleAwarePublicHref
} from "@/lib/navigation";

describe("public navigation hierarchy", () => {
  it("groups Private Jets and Cruises under Overview when cruises are enabled", () => {
    const navigation = getPublicSidebarNavigation({ cruisesEnabled: true });
    const overview = navigation[0];

    expect(isPublicNavGroup(overview)).toBe(true);
    if (!isPublicNavGroup(overview)) throw new Error("Expected Overview to be a navigation group");

    expect(overview.label).toBe("Overview");
    expect(overview.children).toEqual([
      { href: "/", label: "Private Jets" },
      { href: "/cruises", label: "Cruises" }
    ]);
    expect(navigation.slice(1).map((item) => ("href" in item ? item.label : item.label))).toEqual(["Comparisons", "Data", "Methodology", "Support"]);
  });

  it("hides Cruises when the cruise feature flag is disabled", () => {
    const overview = getPublicSidebarNavigation({ cruisesEnabled: false })[0];

    expect(isPublicNavGroup(overview)).toBe(true);
    if (!isPublicNavGroup(overview)) throw new Error("Expected Overview to be a navigation group");

    expect(overview.children).toEqual([{ href: "/", label: "Private Jets" }]);
  });

  it("uses the same hierarchy for mobile navigation", () => {
    expect(getPublicMobileNavigation({ cruisesEnabled: true })).toEqual(getPublicSidebarNavigation({ cruisesEnabled: true }));
  });

  it("matches Private Jets and Cruises as separate active routes", () => {
    expect(isActivePublicRoute("/", "/")).toBe(true);
    expect(isActivePublicRoute("/", "/cruises")).toBe(false);
    expect(isActivePublicRoute("/cruises", "/")).toBe(false);
    expect(isActivePublicRoute("/cruises", "/cruises")).toBe(true);
    expect(isActivePublicRoute("/cruises/ship-1", "/cruises")).toBe(true);
    expect(isActivePublicRoute("/cruises/ship-1", "/")).toBe(false);
  });

  it("resolves Data and Methodology links to the active module", () => {
    expect(getActivePublicModuleSegment("/")).toBe("private-jets");
    expect(getActivePublicModuleSegment("/cruises")).toBe("cruises");
    expect(getActivePublicModuleSegment("/comparisons/private-jets")).toBe("private-jets");
    expect(getActivePublicModuleSegment("/comparisons/cruises")).toBe("cruises");
    expect(resolveModuleAwarePublicHref("/", "/comparisons")).toBe("/comparisons/private-jets");
    expect(resolveModuleAwarePublicHref("/cruises", "/comparisons")).toBe("/comparisons/cruises");
    expect(resolveModuleAwarePublicHref("/", "/data")).toBe("/data/private-jets");
    expect(resolveModuleAwarePublicHref("/cruises", "/data")).toBe("/data/cruises");
    expect(resolveModuleAwarePublicHref("/cruises/ship-1", "/methodology")).toBe("/methodology/cruises");
    expect(resolveModuleAwarePublicHref("/comparisons/private-jets", "/methodology")).toBe("/methodology/private-jets");
    expect(resolveModuleAwarePublicHref("/support", "/data")).toBe("/data");
  });
});
