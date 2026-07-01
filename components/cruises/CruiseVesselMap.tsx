"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Map as MapLibreMap, MapGeoJSONFeature, StyleSpecification } from "maplibre-gl";
import type { CruiseMapPoint } from "@/lib/cruises/queries";

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
} | null;

const sourceId = "cruise-vessels";
const clusterGlowLayerId = "cruise-vessels-cluster-glow";
const clusterCoreLayerId = "cruise-vessels-cluster-core";
const pointGlowLayerId = "cruise-vessels-point-glow";
const pointCoreLayerId = "cruise-vessels-point-core";
const interactiveLayerIds = [clusterCoreLayerId, pointCoreLayerId];
const cartoVectorSourceId = "carto-vector";

export function CruiseVesselMap({
  points,
  latestPositionLabel,
  freshnessWindowHours
}: {
  points: CruiseMapPoint[];
  latestPositionLabel: string;
  freshnessWindowHours: number;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [tooltip, setTooltip] = useState<TooltipState>(null);
  const [mapReady, setMapReady] = useState(false);
  const [dataVisible, setDataVisible] = useState(true);
  const geojson = useMemo(() => buildVesselGeoJson(points), [points]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let disposed = false;

    async function createMap() {
      const maplibregl = (await import("maplibre-gl")).default;
      if (disposed || !containerRef.current) return;

      const map = new maplibregl.Map({
        container: containerRef.current,
        style: darkRasterStyle(isMobileViewport()),
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
          data: geojson,
          cluster: true,
          clusterMaxZoom: 4,
          clusterRadius: 30
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

        if (feature.properties?.cluster) {
          const source = map.getSource(sourceId) as unknown as {
            getClusterExpansionZoom: (clusterId: number) => Promise<number>;
          };
          const clusterId = Number(feature.properties.cluster_id);
          const coordinates = (feature.geometry as { coordinates?: [number, number] }).coordinates;
          if (!coordinates) return;
          const zoom = await source.getClusterExpansionZoom(clusterId);
          map.easeTo({ center: coordinates, zoom: Math.min(zoom + 0.4, 8), duration: 650 });
          return;
        }

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
    [clusterGlowLayerId, clusterCoreLayerId, pointGlowLayerId, pointCoreLayerId].forEach((layerId) => {
      if (map.getLayer(layerId)) map.setLayoutProperty(layerId, "visibility", visibility);
    });
    setDataVisible(visible);
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#030807] shadow-2xl shadow-black/35">
      <div className="absolute left-4 top-4 z-10 max-w-[16rem] md:left-5 md:top-5 md:max-w-md">
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-white">World cruise AIS positions</p>
        <p className="mt-2 hidden text-sm leading-5 text-white/58 sm:block">
          Latest vessel position per ship from monitored cruise regions.
        </p>
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
            <p className="text-lg font-semibold text-white">Awaiting recent AIS positions</p>
            <p className="mt-3 text-sm leading-6 text-white/58">
              The cruise worker is connected, but no recent vessel positions are available yet.
            </p>
          </div>
        </div>
      ) : null}

      <div className="absolute bottom-3 left-3 z-10 rounded-xl border border-white/15 bg-[#07100f]/94 p-2.5 shadow-2xl backdrop-blur md:bottom-5 md:left-5 md:p-4">
        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-white/74">Cruise vessel positions</p>
        <div className="mt-2.5 flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-paper shadow-[0_0_14px_rgba(217,164,65,0.8)]" />
          <span className="text-xs text-white/62">{points.length.toLocaleString("en-US")} latest vessel positions</span>
        </div>
        <p className="mt-2 text-[0.68rem] leading-4 text-white/46">
          Last AIS position: {latestPositionLabel}
          <br />
          Freshness window: {freshnessWindowHours} hours
        </p>
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
          </p>
        </div>
      ) : null}
    </div>
  );
}

function addVesselLayers(map: MapLibreMap) {
  map.addLayer({
    id: clusterGlowLayerId,
    type: "circle",
    source: sourceId,
    filter: ["has", "point_count"],
    paint: {
      "circle-color": "#D9A441",
      "circle-radius": ["interpolate", ["linear"], ["get", "point_count"], 1, 10, 20, 24, 100, 38],
      "circle-blur": 1,
      "circle-opacity": 0.34
    }
  } as never);

  map.addLayer({
    id: clusterCoreLayerId,
    type: "circle",
    source: sourceId,
    filter: ["has", "point_count"],
    paint: {
      "circle-color": "rgba(217,164,65,0.58)",
      "circle-radius": ["interpolate", ["linear"], ["get", "point_count"], 1, 4, 20, 9, 100, 14],
      "circle-opacity": 0.8,
      "circle-stroke-color": "rgba(255,255,255,0.25)",
      "circle-stroke-width": 0.7
    }
  } as never);

  map.addLayer({
    id: pointGlowLayerId,
    type: "circle",
    source: sourceId,
    filter: ["!", ["has", "point_count"]],
    paint: {
      "circle-color": "#D9A441",
      "circle-radius": 10,
      "circle-blur": 1.2,
      "circle-opacity": 0.42
    }
  } as never);

  map.addLayer({
    id: pointCoreLayerId,
    type: "circle",
    source: sourceId,
    filter: ["!", ["has", "point_count"]],
    paint: {
      "circle-color": "#F7D77A",
      "circle-radius": 3.6,
      "circle-opacity": 0.94,
      "circle-stroke-color": "rgba(255,255,255,0.34)",
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
        timestamp: point.timestamp.toISOString()
      }
    }))
  };
}

function featureToTooltip(feature: MapGeoJSONFeature, x: number, y: number): TooltipState {
  const properties = feature.properties ?? {};
  if (properties.cluster) {
    return {
      x,
      y,
      name: `${Number(properties.point_count ?? 0).toLocaleString("en-US")} vessel cluster`,
      operator: "Zoom in for individual cruise ships",
      mmsi: "Cluster",
      speedOverGround: null,
      destination: null,
      timestamp: "",
      shipId: ""
    };
  }

  return {
    x,
    y,
    name: String(properties.name ?? "Unknown vessel"),
    operator: String(properties.operator ?? "Unknown operator"),
    mmsi: String(properties.mmsi ?? "n/a"),
    speedOverGround: properties.speedOverGround === null ? null : Number(properties.speedOverGround),
    destination: properties.destination ? String(properties.destination) : null,
    timestamp: formatDateTime(new Date(String(properties.timestamp))),
    shipId: String(properties.shipId ?? "")
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

function darkRasterStyle(isMobile: boolean): StyleSpecification {
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
      [cartoVectorSourceId]: {
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
        paint: { "background-color": "#030807" }
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
        source: cartoVectorSourceId,
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
        source: cartoVectorSourceId,
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

function formatDateTime(value: Date) {
  if (Number.isNaN(value.getTime())) return "Unknown";
  return value.toLocaleString("en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

