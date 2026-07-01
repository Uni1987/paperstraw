import { describe, expect, it } from "vitest";
import { isSameCalendarDay, normalizeDate } from "@/lib/dates";

describe("date helpers", () => {
  it("normalizes cached ISO date strings back to Date instances", () => {
    const date = normalizeDate("2026-06-24T09:44:00.000Z");

    expect(date).toBeInstanceOf(Date);
    expect(date?.getUTCFullYear()).toBe(2026);
  });

  it("compares Date and serialized string values by calendar day", () => {
    expect(isSameCalendarDay("2026-06-24T09:44:00.000Z", new Date("2026-06-24T18:00:00.000Z"))).toBe(true);
    expect(isSameCalendarDay("2026-06-24T09:44:00.000Z", new Date("2026-06-25T00:01:00.000Z"))).toBe(false);
  });

  it("guards null and invalid values", () => {
    expect(normalizeDate("not-a-date")).toBeNull();
    expect(isSameCalendarDay(null, new Date("2026-06-24T09:44:00.000Z"))).toBe(false);
  });
});
