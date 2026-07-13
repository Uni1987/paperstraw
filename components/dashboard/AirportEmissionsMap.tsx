"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { Map as MapLibreMap, MapGeoJSONFeature } from "maplibre-gl";
import {
  DEFAULT_AIRPORT_MAP_PERIOD,
  filterAirportMapPeriodPayloads,
  normalizeAirportMapPeriod,
  type AirportEmissionPoint,
  type AirportMapPeriodId,
  type AirportMapPeriodPayload
} from "@/lib/dashboard/mapPeriods";
import {
  PAPERSTRAW_CARTO_VECTOR_SOURCE_ID,
  PAPERSTRAW_LEGEND_GRADIENT_CLASS,
  paperStrawDarkRasterStyle,
  paperStrawScoreColorExpression,
  paperStrawValueColorExpression
} from "@/lib/maps/paperStrawMapTheme";

type TooltipState = {
  x: number;
  y: number;
  title: string;
  detail: string;
  totalCo2Kg: number;
  airportIdent: string | null;
  iataCode: string | null;
  location: string | null;
  isCluster: boolean;
} | null;

type AirportFeatureProperties = {
  airportIdent?: string;
  airportName?: string;
  iataCode?: string | null;
  municipality?: string | null;
  countryCode?: string;
  countryName?: string;
  totalCo2Kg: number;
  totalCo2Tons: number;
  emissionScore: number;
};

type MapInitialView = {
  center: [number, number];
  zoom: number;
  minZoom: number;
  bounds?: [[number, number], [number, number]];
};

const sourceId = "airport-emissions";
const rawSourceId = "airport-emissions-raw";
const rawGlowLayerId = "airport-emissions-raw-glow";
const rawCoreLayerId = "airport-emissions-raw-core";
const clusterGlowLayerId = "airport-emissions-cluster-glow";
const clusterCoreLayerId = "airport-emissions-cluster-core";
const pointGlowLayerId = "airport-emissions-point-glow";
const pointCoreLayerId = "airport-emissions-point-core";
const interactiveLayerIds = [clusterCoreLayerId, pointCoreLayerId];
const cartoVectorSourceId = PAPERSTRAW_CARTO_VECTOR_SOURCE_ID;

export function AirportEmissionsMap({
  airports = [],
  periods
}: {
  airports?: AirportEmissionPoint[];
  periods?: AirportMapPeriodPayload[];
}) {
  const searchParams = useSearchParams();
  const requestedPeriod = searchParams.get("period");
  const [selectedPeriodId, setSelectedPeriodId] = useState(() => normalizeAirportMapPeriod(requestedPeriod));
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [tooltip, setTooltip] = useState<TooltipState>(null);
  const [mapReady, setMapReady] = useState(false);
  const [dataVisible, setDataVisible] = useState(true);
  const supportedPeriods = useMemo(() => filterAirportMapPeriodPayloads(periods), [periods]);
  const selectedPeriod = useMemo(() => {
    if (!supportedPeriods.length) return null;
    return supportedPeriods.find((period) => period.id === selectedPeriodId) ?? supportedPeriods.find((period) => period.id === DEFAULT_AIRPORT_MAP_PERIOD) ?? supportedPeriods[0];
  }, [supportedPeriods, selectedPeriodId]);
  const displayAirports = selectedPeriod?.points ?? airports;
  const maxCo2Kg = useMemo(() => Math.max(...displayAirports.map((airport) => airport.totalCo2Kg), 1), [displayAirports]);
  const geojson = useMemo(() => buildAirportGeoJson(displayAirports, maxCo2Kg), [displayAirports, maxCo2Kg]);
  const initialGeojsonRef = useRef(geojson);
  const initialMaxCo2KgRef = useRef(maxCo2Kg);
  const subtitle = selectedPeriod?.subtitle ?? "Aggregate CO2 emissions from private jet activity at airports year to date.";

  useEffect(() => {
    if (!requestedPeriod) return;
    const normalizedPeriod = normalizeAirportMapPeriod(requestedPeriod);
    setSelectedPeriodId(normalizedPeriod);

    if (typeof window === "undefined" || requestedPeriod === normalizedPeriod) return;

    const params = new URLSearchParams(window.location.search);
    if (normalizedPeriod === DEFAULT_AIRPORT_MAP_PERIOD) {
      params.delete("period");
    } else {
      params.set("period", normalizedPeriod);
    }
    const query = params.toString();
    window.history.replaceState(null, "", query ? `${window.location.pathname}?${query}` : window.location.pathname);
  }, [requestedPeriod]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let disposed = false;

    async function createMap() {
      const maplibregl = (await import("maplibre-gl")).default;
      if (disposed || !containerRef.current) return;
      const initialView = getMapInitialView();
      const isMobile = isMobileViewport();

      const map = new maplibregl.Map({
        container: containerRef.current,
        style: paperStrawDarkRasterStyle(isMobile, cartoVectorSourceId),
        center: initialView.center,
        zoom: initialView.zoom,
        minZoom: initialView.minZoom,
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
          data: initialGeojsonRef.current,
          cluster: true,
          clusterMaxZoom: 4,
          clusterRadius: 34,
          clusterProperties: {
            totalCo2Kg: ["+", ["get", "totalCo2Kg"]]
          }
        } as never);
        map.addSource(rawSourceId, {
          type: "geojson",
          data: initialGeojsonRef.current
        } as never);

        addEmissionLayers(map, initialMaxCo2KgRef.current, isMobile);
        applyInitialView(map, initialView, 0);
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

        if (!feature.properties?.cluster) setTooltip(featureToTooltip(feature, event.point.x, event.point.y));
      });
    }

    createMap();

    return () => {
      disposed = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const source = map?.getSource(sourceId) as { setData?: (data: ReturnType<typeof buildAirportGeoJson>) => void } | undefined;
    const rawSource = map?.getSource(rawSourceId) as { setData?: (data: ReturnType<typeof buildAirportGeoJson>) => void } | undefined;
    source?.setData?.(geojson);
    rawSource?.setData?.(geojson);
    if (map) updateEmissionLayerScales(map, maxCo2Kg, isMobileViewport());
  }, [geojson, maxCo2Kg]);

  function setLayerVisibility(visible: boolean) {
    const map = mapRef.current;
    if (!map) return;
    const visibility = visible ? "visible" : "none";
    [rawGlowLayerId, rawCoreLayerId, clusterGlowLayerId, clusterCoreLayerId, pointGlowLayerId, pointCoreLayerId].forEach((layerId) => {
      if (map.getLayer(layerId)) map.setLayoutProperty(layerId, "visibility", visibility);
    });
    setDataVisible(visible);
  }

  function resetMapView() {
    const initialView = getMapInitialView();
    const map = mapRef.current;
    if (!map) return;
    applyInitialView(map, initialView, 650);
  }

  function selectPeriod(periodId: AirportMapPeriodId) {
    setSelectedPeriodId(periodId);
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    params.set("period", periodId);
    const query = params.toString();
    window.history.replaceState(null, "", query ? `${window.location.pathname}?${query}` : window.location.pathname);
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#030807] shadow-2xl shadow-black/35">
      <div className="absolute left-4 right-4 top-4 z-10 flex flex-col gap-3 md:left-5 md:right-5 md:top-5 md:flex-row md:items-start md:justify-between">
        <div className="max-w-[15rem] md:max-w-md">
          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-white">World airport emissions heatmap</p>
          <p className="mt-2 hidden text-sm leading-5 text-white/58 sm:block">{subtitle}</p>
        </div>
        {supportedPeriods.length ? (
          <div className="flex w-fit max-w-full overflow-hidden rounded-full border border-white/10 bg-[#07100f]/88 p-1 shadow-2xl backdrop-blur">
            {supportedPeriods.map((period) => {
              const active = selectedPeriod?.id === period.id;
              return (
                <button
                  key={period.id}
                  type="button"
                  aria-pressed={active}
                  className={`whitespace-nowrap rounded-full px-3 py-1.5 text-[0.68rem] font-semibold transition focus:outline-none focus:ring-2 focus:ring-paper/70 focus:ring-offset-2 focus:ring-offset-[#07100f] md:px-3.5 ${
                    active ? "bg-paper text-black shadow-lg shadow-paper/10" : "text-white/58 hover:bg-white/10 hover:text-white"
                  }`}
                  onClick={() => selectPeriod(period.id)}
                >
                  {period.label}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      <div ref={containerRef} className="h-[23rem] w-full md:h-[36rem]" />

      {!mapReady ? (
        <div className="absolute inset-0 flex items-center justify-center bg-[#030807] text-sm text-white/58">
          Loading emissions map...
        </div>
      ) : null}

      {mapReady && displayAirports.length === 0 ? (
        <div className="absolute inset-0 flex items-center justify-center bg-[#030807]/72 p-6 text-center backdrop-blur-[1px]">
          <div className="max-w-sm rounded-2xl border border-white/10 bg-[#07100f]/92 p-6 shadow-2xl">
            <p className="text-lg font-semibold text-white">No private jet airport emissions for this period yet.</p>
            <p className="mt-3 text-sm leading-6 text-white/58">The selected period remains active; no fallback data is shown.</p>
          </div>
        </div>
      ) : null}

      <div className="absolute bottom-3 left-3 z-10 rounded-xl border border-white/15 bg-[#07100f]/94 p-2.5 shadow-2xl backdrop-blur md:bottom-5 md:left-5 md:bg-[#07100f]/90 md:p-4">
        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-white/74">CO2 emissions tonnes</p>
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
          onClick={resetMapView}
        >
          Fit
        </button>
        <button
          type="button"
          className="h-9 w-9 border-t border-white/10 text-xs text-white transition hover:bg-white/10 md:h-11 md:w-11 md:text-sm"
          aria-pressed={dataVisible}
          title="Toggle emissions layer"
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
          <p className="font-semibold text-white">{tooltip.title}</p>
          <p className="mt-1 text-sm text-white/58">{tooltip.detail}</p>
          <dl className="mt-4 border-t border-white/10 pt-4 text-sm">
            <div>
              <dt className="text-white/42">Estimated CO2</dt>
              <dd className="mt-1 font-semibold tabular-nums text-paper">{formatTonnes(tooltip.totalCo2Kg)} t</dd>
            </div>
            {!tooltip.isCluster ? (
              <div className="mt-3">
                <dt className="text-white/42">Airport</dt>
                <dd className="mt-1 font-semibold tabular-nums text-white">
                  {tooltip.airportIdent ?? "n/a"}
                  {tooltip.iataCode ? ` / ${tooltip.iataCode}` : ""}
                </dd>
              </div>
            ) : null}
          </dl>
        </div>
      ) : null}
    </div>
  );
}

function addEmissionLayers(map: MapLibreMap, maxCo2Kg: number, isMobile: boolean) {
  const glowScale = isMobile ? 0.88 : 1;
  const glowOpacityScale = isMobile ? 0.86 : 1;
  const colorExpression = paperStrawScoreColorExpression("emissionScore");

  map.addLayer({
    id: rawGlowLayerId,
    type: "circle",
    source: rawSourceId,
    paint: {
      "circle-color": colorExpression,
      "circle-radius": ["interpolate", ["linear"], ["get", "emissionScore"], 0, 2.4 * glowScale, 0.5, 5.5 * glowScale, 1, 13 * glowScale],
      "circle-blur": 1.4,
      "circle-opacity": ["interpolate", ["linear"], ["get", "emissionScore"], 0, 0.18 * glowOpacityScale, 0.45, 0.38 * glowOpacityScale, 1, 0.68 * glowOpacityScale]
    }
  } as never);

  map.addLayer({
    id: rawCoreLayerId,
    type: "circle",
    source: rawSourceId,
    paint: {
      "circle-color": colorExpression,
      "circle-radius": ["interpolate", ["linear"], ["get", "emissionScore"], 0, 0.75, 0.5, 1.4, 1, 3.8],
      "circle-opacity": ["interpolate", ["linear"], ["get", "emissionScore"], 0, 0.28, 0.55, 0.72, 1, 0.95]
    }
  } as never);

  map.addLayer({
    id: clusterGlowLayerId,
    type: "circle",
    source: sourceId,
    filter: ["has", "point_count"],
    paint: {
      "circle-color": paperStrawValueColorExpression("totalCo2Kg", maxCo2Kg),
      "circle-radius": ["interpolate", ["linear"], ["get", "totalCo2Kg"], 0, 10, maxCo2Kg, 34],
      "circle-blur": 1,
      "circle-opacity": 0.32 * glowOpacityScale
    }
  } as never);

  map.addLayer({
    id: clusterCoreLayerId,
    type: "circle",
    source: sourceId,
    filter: ["has", "point_count"],
    paint: {
      "circle-color": "rgba(255,247,194,0.48)",
      "circle-radius": ["interpolate", ["linear"], ["get", "totalCo2Kg"], 0, 2.5, maxCo2Kg, 9],
      "circle-opacity": 0.38,
      "circle-stroke-color": "rgba(255,255,255,0.25)",
      "circle-stroke-width": 0.6
    }
  } as never);

  map.addLayer({
    id: pointGlowLayerId,
    type: "circle",
    source: sourceId,
    filter: ["!", ["has", "point_count"]],
    paint: {
      "circle-color": colorExpression,
      "circle-radius": ["interpolate", ["linear"], ["get", "emissionScore"], 0, 2.8 * glowScale, 0.55, 7 * glowScale, 1, 16 * glowScale],
      "circle-blur": 1.25,
      "circle-opacity": 0.5 * glowOpacityScale
    }
  } as never);

  map.addLayer({
    id: pointCoreLayerId,
    type: "circle",
    source: sourceId,
    filter: ["!", ["has", "point_count"]],
    paint: {
      "circle-color": colorExpression,
      "circle-radius": ["interpolate", ["linear"], ["get", "emissionScore"], 0, 1, 0.55, 2.2, 1, 5],
      "circle-opacity": 0.88
    }
  } as never);
}

function updateEmissionLayerScales(map: MapLibreMap, maxCo2Kg: number, isMobile: boolean) {
  const glowScale = isMobile ? 0.88 : 1;
  const glowOpacityScale = isMobile ? 0.86 : 1;
  const colorExpression = paperStrawScoreColorExpression("emissionScore");

  if (map.getLayer(rawGlowLayerId)) {
    map.setPaintProperty(rawGlowLayerId, "circle-color", colorExpression);
    map.setPaintProperty(rawGlowLayerId, "circle-radius", ["interpolate", ["linear"], ["get", "emissionScore"], 0, 2.4 * glowScale, 0.5, 5.5 * glowScale, 1, 13 * glowScale]);
    map.setPaintProperty(rawGlowLayerId, "circle-opacity", ["interpolate", ["linear"], ["get", "emissionScore"], 0, 0.18 * glowOpacityScale, 0.45, 0.38 * glowOpacityScale, 1, 0.68 * glowOpacityScale]);
  }
  if (map.getLayer(rawCoreLayerId)) {
    map.setPaintProperty(rawCoreLayerId, "circle-color", colorExpression);
  }
  if (map.getLayer(clusterGlowLayerId)) {
    map.setPaintProperty(clusterGlowLayerId, "circle-color", paperStrawValueColorExpression("totalCo2Kg", maxCo2Kg));
    map.setPaintProperty(clusterGlowLayerId, "circle-radius", ["interpolate", ["linear"], ["get", "totalCo2Kg"], 0, 10, maxCo2Kg, 34]);
    map.setPaintProperty(clusterGlowLayerId, "circle-opacity", 0.32 * glowOpacityScale);
  }
  if (map.getLayer(clusterCoreLayerId)) {
    map.setPaintProperty(clusterCoreLayerId, "circle-radius", ["interpolate", ["linear"], ["get", "totalCo2Kg"], 0, 2.5, maxCo2Kg, 9]);
  }
  if (map.getLayer(pointGlowLayerId)) {
    map.setPaintProperty(pointGlowLayerId, "circle-color", colorExpression);
    map.setPaintProperty(pointGlowLayerId, "circle-radius", ["interpolate", ["linear"], ["get", "emissionScore"], 0, 2.8 * glowScale, 0.55, 7 * glowScale, 1, 16 * glowScale]);
    map.setPaintProperty(pointGlowLayerId, "circle-opacity", 0.5 * glowOpacityScale);
  }
  if (map.getLayer(pointCoreLayerId)) {
    map.setPaintProperty(pointCoreLayerId, "circle-color", colorExpression);
  }
}

function buildAirportGeoJson(airports: AirportEmissionPoint[], maxCo2Kg: number) {
  return {
    type: "FeatureCollection" as const,
    features: airports.map((airport) => ({
      type: "Feature" as const,
      geometry: {
        type: "Point" as const,
        coordinates: [airport.longitude, airport.latitude]
      },
      properties: {
        airportIdent: airport.airportIdent,
        airportName: airport.airportName,
        iataCode: airport.iataCode,
        municipality: airport.municipality,
        countryCode: airport.countryCode,
        countryName: airport.countryName,
        totalCo2Kg: airport.totalCo2Kg,
        totalCo2Tons: Math.round(airport.totalCo2Kg / 1000),
        emissionScore: Math.log1p(airport.totalCo2Kg) / Math.log1p(maxCo2Kg)
      } satisfies AirportFeatureProperties
    }))
  };
}

function getMapInitialView(): MapInitialView {
  if (isMobileViewport()) {
    return {
      center: [0, 8],
      zoom: -0.55,
      minZoom: -0.75,
      bounds: [
        [-179.9, -58],
        [179.9, 78]
      ]
    };
  }

  return {
    center: [8, 28],
    zoom: 1.35,
    minZoom: 1
  };
}

function isMobileViewport() {
  return typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches;
}

function applyInitialView(map: MapLibreMap, initialView: MapInitialView, duration: number) {
  if (initialView.bounds) {
    map.fitBounds(initialView.bounds, {
      duration,
      padding: { top: 24, right: 8, bottom: 24, left: 8 }
    });
    return;
  }

  map.easeTo({
    center: initialView.center,
    zoom: initialView.zoom,
    duration
  });
}

function featureToTooltip(feature: MapGeoJSONFeature, x: number, y: number): TooltipState {
  const properties = feature.properties ?? {};

  if (properties.cluster) {
    return {
      x,
      y,
      title: `${Number(properties.point_count ?? 0).toLocaleString()} emission cells`,
      detail: "Zoom in for a more detailed hotspot view",
      totalCo2Kg: Number(properties.totalCo2Kg ?? 0),
      airportIdent: null,
      iataCode: null,
      location: null,
      isCluster: true
    };
  }

  const municipality = nullableFeatureString(properties.municipality);
  const countryName = nullableFeatureString(properties.countryName);
  const countryCode = nullableFeatureString(properties.countryCode);
  const location = [municipality, countryName ?? countryCode].filter(Boolean).join(", ");
  const airportIdent = nullableFeatureString(properties.airportIdent);
  const iataCode = nullableFeatureString(properties.iataCode);

  return {
    x,
    y,
    title: nullableFeatureString(properties.airportName) ?? airportIdent ?? iataCode ?? "Private jet airport",
    detail: location || [airportIdent, iataCode].filter(Boolean).join(" / ") || "Airport-level private jet activity",
    totalCo2Kg: Number(properties.totalCo2Kg ?? 0),
    airportIdent,
    iataCode,
    location: location || null,
    isCluster: false
  };
}

function nullableFeatureString(value: unknown) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text.length ? text : null;
}

function formatTonnes(valueKg: number) {
  return Math.round(valueKg / 1000).toLocaleString();
}
