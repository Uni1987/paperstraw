"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Map as MapLibreMap, MapGeoJSONFeature, StyleSpecification } from "maplibre-gl";
import type { AirportEmissionPoint } from "@/lib/dashboard/report";

type TooltipState = {
  x: number;
  y: number;
  airportName: string;
  icao: string;
  country: string;
  flights: number;
  totalCo2Kg: number;
} | null;

type AirportFeatureProperties = {
  airportName: string;
  icao: string;
  country: string;
  countryCode: string;
  flights: number;
  totalCo2Kg: number;
  totalCo2Tons: number;
  emissionScore: number;
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

export function AirportEmissionsMap({ airports }: { airports: AirportEmissionPoint[] }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [tooltip, setTooltip] = useState<TooltipState>(null);
  const [mapReady, setMapReady] = useState(false);
  const [dataVisible, setDataVisible] = useState(true);
  const maxCo2Kg = useMemo(() => Math.max(...airports.map((airport) => airport.totalCo2Kg), 1), [airports]);
  const geojson = useMemo(() => buildAirportGeoJson(airports, maxCo2Kg), [airports, maxCo2Kg]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let disposed = false;

    async function createMap() {
      const maplibregl = (await import("maplibre-gl")).default;
      if (disposed || !containerRef.current) return;

      const map = new maplibregl.Map({
        container: containerRef.current,
        style: darkRasterStyle(),
        center: [8, 28],
        zoom: 1.35,
        minZoom: 1,
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
          clusterRadius: 34,
          clusterProperties: {
            totalCo2Kg: ["+", ["get", "totalCo2Kg"]],
            flights: ["+", ["get", "flights"]]
          }
        } as never);
        map.addSource(rawSourceId, {
          type: "geojson",
          data: geojson
        } as never);

        addEmissionLayers(map, maxCo2Kg);
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

        const icao = String(feature.properties?.icao ?? "");
        if (icao) window.location.href = `/data?airport=${encodeURIComponent(icao)}`;
      });
    }

    createMap();

    return () => {
      disposed = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [geojson, maxCo2Kg]);

  useEffect(() => {
    const map = mapRef.current;
    const source = map?.getSource(sourceId) as { setData?: (data: ReturnType<typeof buildAirportGeoJson>) => void } | undefined;
    const rawSource = map?.getSource(rawSourceId) as { setData?: (data: ReturnType<typeof buildAirportGeoJson>) => void } | undefined;
    source?.setData?.(geojson);
    rawSource?.setData?.(geojson);
  }, [geojson]);

  function setLayerVisibility(visible: boolean) {
    const map = mapRef.current;
    if (!map) return;
    const visibility = visible ? "visible" : "none";
    [rawGlowLayerId, rawCoreLayerId, clusterGlowLayerId, clusterCoreLayerId, pointGlowLayerId, pointCoreLayerId].forEach((layerId) => {
      if (map.getLayer(layerId)) map.setLayoutProperty(layerId, "visibility", visibility);
    });
    setDataVisible(visible);
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#030807] shadow-2xl shadow-black/35">
      <div className="absolute left-5 top-5 z-10 max-w-md">
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-white">World airport emissions heatmap</p>
        <p className="mt-2 text-sm leading-5 text-white/58">Aggregate CO2 emissions from private jet activity at airports.</p>
      </div>

      <div ref={containerRef} className="h-[34rem] w-full md:h-[36rem]" />

      {!mapReady ? (
        <div className="absolute inset-0 flex items-center justify-center bg-[#030807] text-sm text-white/58">
          Loading emissions map...
        </div>
      ) : null}

      <div className="absolute bottom-5 left-5 z-10 rounded-xl border border-white/10 bg-[#07100f]/88 p-4 shadow-2xl backdrop-blur">
        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-white/74">CO2 emissions tonnes</p>
        <div className="mt-3 h-3 w-44 rounded-full bg-gradient-to-r from-violet-700 via-orange-500 to-yellow-100 shadow-[0_0_22px_rgba(217,164,65,0.42)]" />
        <div className="mt-2 flex justify-between text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-white/62">
          <span>Low</span>
          <span>High</span>
        </div>
      </div>

      <div className="absolute right-5 top-1/2 z-10 flex -translate-y-1/2 flex-col overflow-hidden rounded-xl border border-white/10 bg-[#07100f]/88 shadow-2xl backdrop-blur">
        <button type="button" className="h-11 w-11 text-xl text-white transition hover:bg-white/10" onClick={() => mapRef.current?.zoomIn()}>
          +
        </button>
        <button type="button" className="h-11 w-11 border-t border-white/10 text-xl text-white transition hover:bg-white/10" onClick={() => mapRef.current?.zoomOut()}>
          -
        </button>
        <button
          type="button"
          className="h-11 w-11 border-t border-white/10 text-sm text-white transition hover:bg-white/10"
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
          <p className="font-semibold text-white">{tooltip.airportName}</p>
          <p className="mt-1 text-sm text-white/58">
            {tooltip.icao} · {tooltip.country}
          </p>
          <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-white/10 pt-4 text-sm">
            <div>
              <dt className="text-white/42">Flights</dt>
              <dd className="mt-1 font-semibold tabular-nums text-white">{tooltip.flights.toLocaleString()}</dd>
            </div>
            <div>
              <dt className="text-white/42">Total CO2</dt>
              <dd className="mt-1 font-semibold tabular-nums text-paper">{formatTonnes(tooltip.totalCo2Kg)} t</dd>
            </div>
          </dl>
          <p className="mt-4 text-xs text-white/42">Click to view in the data report</p>
        </div>
      ) : null}
    </div>
  );
}

function addEmissionLayers(map: MapLibreMap, maxCo2Kg: number) {
  const colorExpression = [
    "interpolate",
    ["linear"],
    ["get", "emissionScore"],
    0,
    "#5B21B6",
    0.28,
    "#DB2777",
    0.52,
    "#F97316",
    0.78,
    "#FACC15",
    1,
    "#FFF7C2"
  ];

  map.addLayer({
    id: rawGlowLayerId,
    type: "circle",
    source: rawSourceId,
    paint: {
      "circle-color": colorExpression,
      "circle-radius": ["interpolate", ["linear"], ["get", "emissionScore"], 0, 2.4, 0.5, 5.5, 1, 13],
      "circle-blur": 1.4,
      "circle-opacity": ["interpolate", ["linear"], ["get", "emissionScore"], 0, 0.18, 0.45, 0.38, 1, 0.68]
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
      "circle-color": [
        "interpolate",
        ["linear"],
        ["get", "totalCo2Kg"],
        0,
        "#5B21B6",
        maxCo2Kg * 0.08,
        "#DB2777",
        maxCo2Kg * 0.22,
        "#F97316",
        maxCo2Kg * 0.48,
        "#FACC15",
        maxCo2Kg,
        "#FFF7C2"
      ],
      "circle-radius": ["interpolate", ["linear"], ["get", "totalCo2Kg"], 0, 10, maxCo2Kg, 34],
      "circle-blur": 1,
      "circle-opacity": 0.32
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
      "circle-radius": ["interpolate", ["linear"], ["get", "emissionScore"], 0, 2.8, 0.55, 7, 1, 16],
      "circle-blur": 1.25,
      "circle-opacity": 0.5
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
        airportName: airport.airportName,
        icao: airport.icao,
        country: airport.country,
        countryCode: airport.countryCode,
        flights: airport.flights,
        totalCo2Kg: airport.totalCo2Kg,
        totalCo2Tons: Math.round(airport.totalCo2Kg / 1000),
        emissionScore: Math.log1p(airport.totalCo2Kg) / Math.log1p(maxCo2Kg)
      } satisfies AirportFeatureProperties
    }))
  };
}

function featureToTooltip(feature: MapGeoJSONFeature, x: number, y: number): TooltipState {
  const properties = feature.properties ?? {};

  if (properties.cluster) {
    return {
      x,
      y,
      airportName: `${Number(properties.point_count ?? 0).toLocaleString()} airport cluster`,
      icao: "Cluster",
      country: "Zoom in for individual airports",
      flights: Number(properties.flights ?? 0),
      totalCo2Kg: Number(properties.totalCo2Kg ?? 0)
    };
  }

  return {
    x,
    y,
    airportName: String(properties.airportName ?? "Unknown airport"),
    icao: String(properties.icao ?? "n/a"),
    country: String(properties.country ?? "Unknown"),
    flights: Number(properties.flights ?? 0),
    totalCo2Kg: Number(properties.totalCo2Kg ?? 0)
  };
}

function darkRasterStyle(): StyleSpecification {
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
      }
    },
    layers: [
      {
        id: "background",
        type: "background",
        paint: {
          "background-color": "#030807"
        }
      },
      {
        id: "carto-dark",
        type: "raster",
        source: "carto-dark",
        paint: {
          "raster-opacity": 0.56,
          "raster-contrast": -0.18,
          "raster-saturation": -0.85,
          "raster-brightness-min": 0,
          "raster-brightness-max": 0.62
        }
      }
    ]
  };
}

function formatTonnes(valueKg: number) {
  return Math.round(valueKg / 1000).toLocaleString();
}
