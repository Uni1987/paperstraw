"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Map as MapLibreMap, MapGeoJSONFeature } from "maplibre-gl";
import type { CruiseMapMode, CruiseMapPoint } from "@/lib/cruises/queries";
import {
  PAPERSTRAW_CARTO_VECTOR_SOURCE_ID,
  PAPERSTRAW_HEATMAP_COLORS,
  PAPERSTRAW_LEGEND_GRADIENT_CLASS,
  paperStrawActivityDensityHeatmapColorExpression,
  paperStrawDarkRasterStyle
} from "@/lib/maps/paperStrawMapTheme";

type TooltipState = {
  x: number;
  y: number;
  name: string;
  operator: string;
  mmsi: string;
  speedOverGround: number | null;
  destination: string | null;
  timestamp: string;
  shipId: string;
  estimatedCo2Tonnes: number | null;
} | null;

const sourceId = "cruise-vessels";
const heatmapLayerId = "cruise-vessels-density-heatmap";
const pointGlowLayerId = "cruise-vessels-point-glow";
const pointCoreLayerId = "cruise-vessels-point-core";
const interactiveLayerIds = [pointCoreLayerId];
const cartoVectorSourceId = PAPERSTRAW_CARTO_VECTOR_SOURCE_ID;

function getClientCruiseMapCopy(mode: CruiseMapMode) {
  if (mode === "emissions") {
    return {
      subtitle: "Estimated cruise emissions from verified cruise ships observed by PaperStraw.",
      legendTitle: "Estimated cruise emissions"
    };
  }

  return {
    subtitle: "Latest observed positions from verified cruise ships.",
    legendTitle: "Live cruise vessel activity"
  };
}

export function CruiseVesselMap({
  points,
  mapMode,
  emptyStateTitle = "Awaiting recent AIS positions",
  emptyStateDescription = "The cruise worker is connected, but no recent vessel positions are available yet."
}: {
  points: CruiseMapPoint[];
  mapMode: CruiseMapMode;
  emptyStateTitle?: string;
  emptyStateDescription?: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [tooltip, setTooltip] = useState<TooltipState>(null);
  const [mapReady, setMapReady] = useState(false);
  const [dataVisible, setDataVisible] = useState(true);
  const geojson = useMemo(() => buildVesselGeoJson(points), [points]);
  const copy = getClientCruiseMapCopy(mapMode);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let disposed = false;

    async function createMap() {
      const maplibregl = (await import("maplibre-gl")).default;
      if (disposed || !containerRef.current) return;

      const map = new maplibregl.Map({
        container: containerRef.current,
        style: paperStrawDarkRasterStyle(isMobileViewport(), cartoVectorSourceId),
        center: [8, 24],
        zoom: isMobileViewport() ? 0.15 : 1.25,
        minZoom: isMobileViewport() ? -0.6 : 0.6,
        maxZoom: 8,
        attributionControl: false
      });

      map.dragRotate.disable();
      map.touchZoomRotate.disableRotation();
      mapRef.current = map;

      map.on("load", () => {
        if (disposed) return;
        map.addSource(sourceId, {
          type: "geojson",
          data: geojson
        } as never);
        addVesselLayers(map);
        fitWorld(map, 0);
        setMapReady(true);
      });

      map.on("mousemove", interactiveLayerIds, (event) => {
        const feature = event.features?.[0];
        if (!feature) return;
        map.getCanvas().style.cursor = "pointer";
        setTooltip(featureToTooltip(feature, event.point.x, event.point.y));
      });

      map.on("mouseleave", interactiveLayerIds, () => {
        map.getCanvas().style.cursor = "";
        setTooltip(null);
      });

      map.on("click", interactiveLayerIds, async (event) => {
        const feature = event.features?.[0];
        if (!feature) return;

        const shipId = String(feature.properties?.shipId ?? "");
        if (shipId) window.location.href = `/cruises/${encodeURIComponent(shipId)}`;
      });
    }

    createMap();

    return () => {
      disposed = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [geojson]);

  useEffect(() => {
    const source = mapRef.current?.getSource(sourceId) as { setData?: (data: ReturnType<typeof buildVesselGeoJson>) => void } | undefined;
    source?.setData?.(geojson);
  }, [geojson]);

  function setLayerVisibility(visible: boolean) {
    const map = mapRef.current;
    if (!map) return;
    const visibility = visible ? "visible" : "none";
    [heatmapLayerId, pointGlowLayerId, pointCoreLayerId].forEach((layerId) => {
      if (map.getLayer(layerId)) map.setLayoutProperty(layerId, "visibility", visibility);
    });
    setDataVisible(visible);
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#030807] shadow-2xl shadow-black/35">
      <div className="absolute left-4 top-4 z-10 max-w-[16rem] md:left-5 md:top-5 md:max-w-md">
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-white">World cruise activity</p>
        <p className="mt-2 hidden text-sm leading-5 text-white/58 sm:block">{copy.subtitle}</p>
        <p className="mt-1 hidden text-xs leading-5 text-white/42 md:block">Positions may be delayed and coverage varies by vessel and AIS availability.</p>
      </div>

      <div ref={containerRef} className="h-[24rem] w-full md:h-[36rem]" />

      {!mapReady ? (
        <div className="absolute inset-0 flex items-center justify-center bg-[#030807] text-sm text-white/58">
          Loading AIS map...
        </div>
      ) : null}

      {mapReady && points.length === 0 ? (
        <div className="absolute inset-0 flex items-center justify-center bg-[#030807]/72 p-6 text-center backdrop-blur-[1px]">
          <div className="max-w-sm rounded-2xl border border-white/10 bg-[#07100f]/92 p-6 shadow-2xl">
            <p className="text-lg font-semibold text-white">{emptyStateTitle}</p>
            <p className="mt-3 text-sm leading-6 text-white/58">{emptyStateDescription}</p>
          </div>
        </div>
      ) : null}

      <div className="absolute bottom-3 left-3 z-10 rounded-xl border border-white/15 bg-[#07100f]/94 p-2.5 shadow-2xl backdrop-blur md:bottom-5 md:left-5 md:p-4">
        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-white/74">{copy.legendTitle}</p>
        <div className={`mt-2.5 h-2.5 w-28 rounded-full ${PAPERSTRAW_LEGEND_GRADIENT_CLASS} md:mt-3 md:h-3 md:w-44`} />
        <div className="mt-2 flex justify-between text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-white/62">
          <span>Low</span>
          <span>High</span>
        </div>
      </div>

      <div className="absolute right-3 top-1/2 z-10 flex -translate-y-1/2 flex-col overflow-hidden rounded-xl border border-white/10 bg-[#07100f]/88 shadow-2xl backdrop-blur md:right-5">
        <button type="button" className="h-9 w-9 text-lg text-white transition hover:bg-white/10 md:h-11 md:w-11 md:text-xl" onClick={() => mapRef.current?.zoomIn()}>
          +
        </button>
        <button type="button" className="h-9 w-9 border-t border-white/10 text-lg text-white transition hover:bg-white/10 md:h-11 md:w-11 md:text-xl" onClick={() => mapRef.current?.zoomOut()}>
          -
        </button>
        <button
          type="button"
          className="h-9 w-9 border-t border-white/10 text-[0.56rem] font-semibold uppercase tracking-[0.08em] text-white transition hover:bg-white/10 md:h-11 md:w-11 md:text-[0.62rem]"
          title="Reset map view"
          onClick={() => mapRef.current && fitWorld(mapRef.current, 650)}
        >
          Fit
        </button>
        <button
          type="button"
          className="h-9 w-9 border-t border-white/10 text-xs text-white transition hover:bg-white/10 md:h-11 md:w-11 md:text-sm"
          aria-pressed={dataVisible}
          title="Toggle vessel layer"
          onClick={() => setLayerVisibility(!dataVisible)}
        >
          L
        </button>
      </div>

      {tooltip ? (
        <div
          className="pointer-events-none absolute z-20 w-64 rounded-xl border border-white/10 bg-[#07100f]/94 p-4 shadow-2xl backdrop-blur"
          style={{
            left: Math.min(tooltip.x + 18, 980),
            top: Math.max(tooltip.y - 28, 74)
          }}
        >
          <p className="font-semibold text-white">{tooltip.name}</p>
          <p className="mt-1 text-sm text-white/58">{tooltip.operator}</p>
          <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-white/10 pt-4 text-sm">
            <div>
              <dt className="text-white/42">MMSI</dt>
              <dd className="mt-1 font-semibold tabular-nums text-white">{tooltip.mmsi}</dd>
            </div>
            <div>
              <dt className="text-white/42">Speed</dt>
              <dd className="mt-1 font-semibold tabular-nums text-paper">
                {tooltip.speedOverGround === null ? "n/a" : `${tooltip.speedOverGround.toFixed(1)} kn`}
              </dd>
            </div>
          </dl>
          <p className="mt-3 text-xs leading-5 text-white/42">
            Destination: {tooltip.destination ?? "Unknown"}
            <br />
            Updated: {tooltip.timestamp}
            {tooltip.estimatedCo2Tonnes !== null ? (
              <>
                <br />
                Estimated CO₂ today: {tooltip.estimatedCo2Tonnes.toLocaleString("en-US", { maximumFractionDigits: 1 })} t
              </>
            ) : null}
          </p>
        </div>
      ) : null}
    </div>
  );
}

function addVesselLayers(map: MapLibreMap) {
  map.addLayer({
    id: heatmapLayerId,
    type: "heatmap",
    source: sourceId,
    paint: {
      "heatmap-weight": ["get", "activityWeight"],
      "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 0, 0.2, 2, 0.32, 3.5, 0.26, 5.2, 0.14],
      "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 0, 3.6, 2, 6.4, 4.2, 10.5, 6, 13],
      "heatmap-opacity": ["interpolate", ["linear"], ["zoom"], 0, 0.44, 2.8, 0.4, 4.8, 0.18, 5.9, 0],
      "heatmap-color": paperStrawActivityDensityHeatmapColorExpression()
    }
  } as never);

  map.addLayer({
    id: pointGlowLayerId,
    type: "circle",
    source: sourceId,
    paint: {
      "circle-color": PAPERSTRAW_HEATMAP_COLORS.glow,
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 0, 0.85, 2.5, 1.25, 4.5, 2.9, 6.5, 5.2],
      "circle-blur": 1.15,
      "circle-opacity": ["interpolate", ["linear"], ["zoom"], 0, 0.11, 2.5, 0.17, 4.5, 0.28, 6.2, 0.4]
    }
  } as never);

  map.addLayer({
    id: pointCoreLayerId,
    type: "circle",
    source: sourceId,
    paint: {
      "circle-color": PAPERSTRAW_HEATMAP_COLORS.peak,
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 0, 0.32, 2.5, 0.55, 4, 0.95, 6.5, 2.1],
      "circle-opacity": ["interpolate", ["linear"], ["zoom"], 0, 0.16, 2.5, 0.28, 4, 0.58, 6.5, 0.9],
      "circle-stroke-color": "rgba(255,255,255,0.28)",
      "circle-stroke-width": 0.5
    }
  } as never);
}

function buildVesselGeoJson(points: CruiseMapPoint[]) {
  return {
    type: "FeatureCollection" as const,
    features: points.map((point) => ({
      type: "Feature" as const,
      geometry: {
        type: "Point" as const,
        coordinates: [point.longitude, point.latitude]
      },
      properties: {
        shipId: point.shipId,
        name: point.name,
        operator: point.operator,
        mmsi: point.mmsi,
        speedOverGround: point.speedOverGround,
        destination: point.destination,
        timestamp: point.timestamp.toISOString(),
        activityWeight: point.activityWeight,
        estimatedCo2Tonnes: point.estimatedCo2Tonnes
      }
    }))
  };
}

function featureToTooltip(feature: MapGeoJSONFeature, x: number, y: number): TooltipState {
  const properties = feature.properties ?? {};

  return {
    x,
    y,
    name: String(properties.name ?? "Unknown vessel"),
    operator: String(properties.operator ?? "Unknown operator"),
    mmsi: String(properties.mmsi ?? "n/a"),
    speedOverGround: properties.speedOverGround === null ? null : Number(properties.speedOverGround),
    destination: properties.destination ? String(properties.destination) : null,
    timestamp: formatDateTime(new Date(String(properties.timestamp))),
    shipId: String(properties.shipId ?? ""),
    estimatedCo2Tonnes: properties.estimatedCo2Tonnes === null || properties.estimatedCo2Tonnes === undefined ? null : Number(properties.estimatedCo2Tonnes)
  };
}

function fitWorld(map: MapLibreMap, duration: number) {
  map.fitBounds(
    [
      [-179.9, -58],
      [179.9, 78]
    ],
    {
      duration,
      padding: { top: 28, right: 8, bottom: 28, left: 8 }
    }
  );
}

function isMobileViewport() {
  return typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches;
}

function formatDateTime(value: Date) {
  if (Number.isNaN(value.getTime())) return "Unknown";
  return value.toLocaleString("en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}
