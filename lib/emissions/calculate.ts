export type EmissionCalculationInput = {
  distanceKm: number;
  kgCo2PerKm: number;
};

export type EmissionCalculationResult = {
  estimatedCo2Kg: number;
  basis: "kg_co2_per_km";
  label: "estimate";
};

export function calculateEstimatedCo2(input: EmissionCalculationInput): EmissionCalculationResult {
  assertFiniteNonNegative(input.distanceKm, "distanceKm");
  assertFiniteNonNegative(input.kgCo2PerKm, "kgCo2PerKm");

  return {
    estimatedCo2Kg: roundToTwo(input.distanceKm * input.kgCo2PerKm),
    basis: "kg_co2_per_km",
    label: "estimate"
  };
}

export function roundToTwo(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function assertFiniteNonNegative(value: number, field: string) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${field} must be a finite non-negative number`);
  }
}
