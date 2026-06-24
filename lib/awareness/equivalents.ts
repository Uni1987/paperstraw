export const PAPER_STRAW_CO2_KG = 0.0015;
export const CAR_CO2_KG = 4600;
export const HOUSEHOLD_CO2_KG = 7100;
export const TREE_OFFSET_CO2_KG = 21.8;

export const CO2_EQUIVALENT_CONSTANTS = {
  paperStrawCo2Kg: PAPER_STRAW_CO2_KG,
  kgCo2PerCarYear: CAR_CO2_KG,
  kgCo2PerHouseholdYear: HOUSEHOLD_CO2_KG,
  kgCo2PerTreeYear: TREE_OFFSET_CO2_KG
};

export type Co2Equivalents = {
  paperStraws: number;
  cars: number;
  households: number;
  trees: number;
};

export function calculateCo2Equivalents(totalCo2Kg: number): Co2Equivalents {
  assertNonNegative(totalCo2Kg);

  return {
    paperStraws: Math.round(totalCo2Kg / PAPER_STRAW_CO2_KG),
    cars: Math.round(totalCo2Kg / CAR_CO2_KG),
    households: Math.round(totalCo2Kg / HOUSEHOLD_CO2_KG),
    trees: Math.round(totalCo2Kg / TREE_OFFSET_CO2_KG)
  };
}

function assertNonNegative(value: number) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error("CO2 value must be a finite non-negative number");
  }
}
