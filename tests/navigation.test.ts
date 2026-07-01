import { describe, expect, it } from "vitest";
import { getPublicMobileNavigation, getPublicSidebarNavigation, isActivePublicRoute, isPublicNavGroup } from "@/lib/navigation";

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
});
