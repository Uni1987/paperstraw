import { describe, expect, it } from "vitest";
import {
  calculateCoffeeCups,
  calculateDrivingDistance,
  calculateFlights,
  calculateForestArea,
  calculateForestFields,
  calculateGasolineLiters,
  calculateHamburgers,
  calculateHotShowers,
  calculateHouseholdElectricity,
  calculateHouseholds,
  calculateLifetimeTrees,
  calculateSmartphones,
  calculateTrainJourneys,
  calculateTshirts,
  buildComparisonCards,
  getDashboardComparisonCopy
} from "@/lib/comparisons";
import { TREE_ABSORPTION_LIFETIME_YEARS } from "@/lib/emissionsFactors";

describe("comparison calculations", () => {
  it("calculates transport comparisons from tonnes of CO2", () => {
    expect(calculateDrivingDistance(1)).toBeCloseTo(5208.33, 2);
    expect(calculateFlights(1.6)).toBe(1);
    expect(calculateTrainJourneys(1)).toBeCloseTo(0.61, 2);
    expect(calculateGasolineLiters(2.31)).toBe(1000);
  });

  it("calculates household comparisons from tonnes of CO2", () => {
    expect(calculateHouseholdElectricity(3)).toBe(2);
    expect(calculateHotShowers(1.5)).toBe(1000);
    expect(calculateHouseholds(4.6)).toBe(1);
  });

  it("calculates nature comparisons from tonnes of CO2", () => {
    const area = calculateForestArea(1000);

    expect(calculateForestFields(1000)).toBeCloseTo(140.06, 2);
    expect(area.hectares).toBe(100);
    expect(area.squareKilometers).toBe(1);
    expect(calculateLifetimeTrees(1000)).toBe(1000);
    expect(TREE_ABSORPTION_LIFETIME_YEARS).toBe(45);
  });

  it("describes dashboard comparisons without overstating equivalence", () => {
    const cards = buildComparisonCards(1000);
    const tree = cards.find((card) => card.id === "lifetime-trees")!;
    const driving = cards.find((card) => card.id === "driving-distance")!;
    const household = cards.find((card) => card.id === "household-electricity")!;

    expect(getDashboardComparisonCopy(tree)).toEqual({
      title: "Trees over lifetime",
      description: "Estimated newly planted trees required to absorb this CO₂ over an assumed 45-year lifetime."
    });
    expect(getDashboardComparisonCopy(driving).description).toBe(
      "Equivalent kilometres driven by an average gasoline-powered car."
    );
    expect(getDashboardComparisonCopy(household).description).toBe(
      "Equivalent annual electricity consumption of average households."
    );
    expect(tree.value).toBe("1K");
    expect(tree.factorLabel).toContain("over 45 years");
  });

  it("calculates everyday product comparisons from tonnes of CO2", () => {
    expect(calculateHamburgers(3)).toBe(1000);
    expect(calculateCoffeeCups(1)).toBe(20000);
    expect(calculateSmartphones(70)).toBe(1000);
    expect(calculateTshirts(4)).toBe(1000);
  });
});
