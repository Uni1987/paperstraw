import type { AwarenessRankPoint } from "@/lib/awareness/types";

export type DonutBreakdownPoint = {
  label: string;
  estimatedCo2Kg: number;
  percent: number;
};

const aircraftCategoryMap: Record<string, string> = {
  C25A: "Light Jet",
  C25B: "Light Jet",
  C25C: "Light Jet",
  LJ45: "Light Jet",
  C56X: "Midsize Jet",
  CL30: "Super Midsize",
  CL35: "Super Midsize",
  GLF4: "Heavy Jet",
  F2TH: "Heavy Jet",
  F900: "Heavy Jet",
  F2LX: "Heavy Jet",
  GLEX: "Ultra Long Range",
  GLF5: "Ultra Long Range",
  GLF6: "Ultra Long Range",
  GLF7: "Ultra Long Range",
  G550: "Ultra Long Range",
  G650: "Ultra Long Range",
  G700: "Ultra Long Range",
  B737: "Business Airliner",
  BBJ1: "Business Airliner",
  BBJ2: "Business Airliner",
  A319: "Business Airliner",
  A320: "Business Airliner",
  ACJ: "Business Airliner",
  PC12: "Turboprop",
  TBM7: "Turboprop",
  TBM8: "Turboprop",
  TBM9: "Turboprop"
};

export function buildCountryBreakdown(data: AwarenessRankPoint[], totalCo2Kg: number, visibleCountryCount = 6) {
  const ranked = [...data]
    .filter((country) => country.estimatedCo2Kg > 0)
    .sort((left, right) => right.estimatedCo2Kg - left.estimatedCo2Kg);
  return buildBreakdownWithOther(ranked.slice(0, visibleCountryCount), totalCo2Kg);
}

export function buildAircraftCategoryBreakdown(data: AwarenessRankPoint[], totalCo2Kg: number) {
  const groups = new Map<string, number>();

  for (const point of data) {
    if (point.estimatedCo2Kg <= 0) continue;
    const category = categorizeAircraftType(point.label);
    groups.set(category, (groups.get(category) ?? 0) + point.estimatedCo2Kg);
  }

  const ranked = [...groups.entries()]
    .map(([label, estimatedCo2Kg]) => ({ label, estimatedCo2Kg, flights: 0, distanceKm: 0 }))
    .sort((left, right) => right.estimatedCo2Kg - left.estimatedCo2Kg);

  return buildBreakdownWithOther(ranked, totalCo2Kg);
}

export function categorizeAircraftType(aircraftType: string | null | undefined) {
  const normalized = (aircraftType ?? "").trim().toUpperCase();
  if (!normalized || normalized === "UNKNOWN") return "Other";
  return aircraftCategoryMap[normalized] ?? "Other";
}

function buildBreakdownWithOther(data: AwarenessRankPoint[], totalCo2Kg: number): DonutBreakdownPoint[] {
  const visibleTotal = data.reduce((total, point) => total + point.estimatedCo2Kg, 0);
  const denominator = Math.max(totalCo2Kg, visibleTotal);
  if (denominator <= 0) return [];

  const remainder = Math.max(denominator - visibleTotal, 0);
  const points = data.map((point) => ({ ...point }));
  if (remainder > 0) {
    const other = points.find((point) => point.label === "Other");
    if (other) {
      other.estimatedCo2Kg += remainder;
    } else {
      points.push({ label: "Other", estimatedCo2Kg: remainder, flights: 0, distanceKm: 0 });
    }
  }
  const percentages = apportionOneDecimalPercentages(points.map((point) => (point.estimatedCo2Kg / denominator) * 100));

  return points.map((point, index) => ({
    label: point.label,
    estimatedCo2Kg: point.estimatedCo2Kg,
    percent: percentages[index] ?? 0
  }));
}

function apportionOneDecimalPercentages(rawPercentages: number[]) {
  const rawTenths = rawPercentages.map((value) => value * 10);
  const tenths = rawTenths.map(Math.floor);
  let remainder = 1000 - tenths.reduce((total, value) => total + value, 0);
  const order = rawTenths
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((left, right) => right.fraction - left.fraction);

  for (const item of order) {
    if (remainder <= 0) break;
    tenths[item.index] += 1;
    remainder -= 1;
  }

  if (remainder < 0) {
    for (const item of [...order].reverse()) {
      if (remainder >= 0) break;
      if (tenths[item.index] <= 0) continue;
      tenths[item.index] -= 1;
      remainder += 1;
    }
  }

  return tenths.map((value) => value / 10);
}
