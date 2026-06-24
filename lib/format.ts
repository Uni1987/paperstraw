export function formatCo2(value: number) {
  if (value >= 1000) return `${Math.round(value / 1000).toLocaleString()} t est.`;
  return `${Math.round(value).toLocaleString()} kg est.`;
}

export function formatTonnesCo2(valueKg: number) {
  return `${Math.round(valueKg / 1000).toLocaleString()} tonnes CO₂`;
}

export function formatKm(value: number) {
  return `${Math.round(value).toLocaleString()} km`;
}

export function formatCompactNumber(value: number) {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: value >= 1000000 ? 1 : 0
  }).format(value);
}
