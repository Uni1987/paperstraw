import type { StyleSpecification } from "maplibre-gl";

export const PAPERSTRAW_MAP_BACKGROUND = "#030807";
export const PAPERSTRAW_MAP_PANEL = "#07100f";
export const PAPERSTRAW_CARTO_VECTOR_SOURCE_ID = "carto-vector";

export const PAPERSTRAW_HEATMAP_COLORS = {
  low: "#5B21B6",
  midLow: "#DB2777",
  medium: "#F97316",
  high: "#FACC15",
  peak: "#FFF7C2",
  glow: "#D9A441"
} as const;

export const PAPERSTRAW_LEGEND_GRADIENT_CLASS =
  "bg-gradient-to-r from-violet-700 via-orange-500 to-yellow-100 shadow-[0_0_22px_rgba(217,164,65,0.42)]";

export function paperStrawScoreColorExpression(propertyName: string) {
  return [
    "interpolate",
    ["linear"],
    ["get", propertyName],
    0,
    PAPERSTRAW_HEATMAP_COLORS.low,
    0.28,
    PAPERSTRAW_HEATMAP_COLORS.midLow,
    0.52,
    PAPERSTRAW_HEATMAP_COLORS.medium,
    0.78,
    PAPERSTRAW_HEATMAP_COLORS.high,
    1,
    PAPERSTRAW_HEATMAP_COLORS.peak
  ];
}

export function paperStrawValueColorExpression(propertyName: string, maxValue: number) {
  return [
    "interpolate",
    ["linear"],
    ["get", propertyName],
    0,
    PAPERSTRAW_HEATMAP_COLORS.low,
    maxValue * 0.08,
    PAPERSTRAW_HEATMAP_COLORS.midLow,
    maxValue * 0.22,
    PAPERSTRAW_HEATMAP_COLORS.medium,
    maxValue * 0.48,
    PAPERSTRAW_HEATMAP_COLORS.high,
    maxValue,
    PAPERSTRAW_HEATMAP_COLORS.peak
  ];
}

export function paperStrawActivityDensityHeatmapColorExpression() {
  return [
    "interpolate",
    ["linear"],
    ["heatmap-density"],
    0,
    "rgba(91,33,182,0)",
    0.2,
    "rgba(91,33,182,0.18)",
    0.42,
    "rgba(219,39,119,0.3)",
    0.68,
    "rgba(249,115,22,0.44)",
    0.9,
    "rgba(250,204,21,0.58)",
    1,
    "rgba(255,247,194,0.66)"
  ];
}

export function paperStrawDarkRasterStyle(isMobile: boolean, vectorSourceId = PAPERSTRAW_CARTO_VECTOR_SOURCE_ID): StyleSpecification {
  return {
    version: 8 as const,
    sources: {
      "carto-dark": {
        type: "raster",
        tiles: [
          "https://a.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}.png",
          "https://b.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}.png",
          "https://c.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}.png"
        ],
        tileSize: 256,
        attribution: "Basemap by CARTO"
      },
      [vectorSourceId]: {
        type: "vector",
        tiles: ["https://basemaps.cartocdn.com/vector/carto.streets/v1/{z}/{x}/{y}.mvt"],
        maxzoom: 14,
        attribution: "Basemap by CARTO"
      }
    },
    layers: [
      {
        id: "background",
        type: "background",
        paint: {
          "background-color": PAPERSTRAW_MAP_BACKGROUND
        }
      },
      {
        id: "carto-dark",
        type: "raster",
        source: "carto-dark",
        paint: {
          "raster-opacity": isMobile ? 0.72 : 0.64,
          "raster-contrast": isMobile ? -0.04 : -0.1,
          "raster-saturation": isMobile ? -0.75 : -0.82,
          "raster-brightness-min": 0,
          "raster-brightness-max": isMobile ? 0.78 : 0.69
        }
      },
      {
        id: "water-contrast",
        type: "fill",
        source: vectorSourceId,
        "source-layer": "water",
        paint: {
          "fill-color": "#020706",
          "fill-opacity": isMobile ? 0.3 : 0.18,
          "fill-outline-color": isMobile ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.1)"
        }
      },
      {
        id: "geography-boundaries",
        type: "line",
        source: vectorSourceId,
        "source-layer": "boundary",
        paint: {
          "line-color": "rgba(220,238,232,0.72)",
          "line-opacity": isMobile ? 0.34 : 0.22,
          "line-width": ["interpolate", ["linear"], ["zoom"], 0, isMobile ? 0.34 : 0.26, 4, isMobile ? 0.64 : 0.46, 7, isMobile ? 0.9 : 0.68]
        }
      }
    ]
  };
}
