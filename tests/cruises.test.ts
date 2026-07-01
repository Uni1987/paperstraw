import { afterEach, describe, expect, it } from "vitest";
import {
  getPositionQualityIssue,
  messageDataToString,
  resolveCruiseShipIdentity,
  type CruiseShipIdentityInput,
  type CruiseShipIdentityRecord,
  type CruiseShipIdentityRepository
} from "@/lib/cruises/aisstream";
import { CRUISE_REGIONS, getCruiseRegionConfig, getCruiseRegions, validateCruiseRegions } from "@/lib/cruises/config";
import { estimateCruiseDailyEmissions, haversineNm } from "@/lib/cruises/estimation";
import { parseMrvCsv } from "@/lib/cruises/mrv";
import {
  PAPERSTRAW_HEATMAP_COLORS,
  paperStrawActivityDensityHeatmapColorExpression,
  paperStrawScoreColorExpression
} from "@/lib/maps/paperStrawMapTheme";
import {
  CRUISE_POSITION_FRESHNESS_WINDOW_MS,
  buildCruiseActivityMapPoints,
  dedupeCruiseEstimateRows,
  estimateCruiseMapPayloadBytes,
  getCruiseDataStatus,
  getCruiseMapCopy,
  selectLatestCruisePositionPerShip,
  summarizeCruiseEstimateRows
} from "@/lib/cruises/queries";

afterEach(() => {
  delete process.env.AISSTREAM_BOUNDING_BOXES;
});

describe("cruise emissions estimation", () => {
  it("uses annual MRV CO2 as a baseline when available", () => {
    const estimate = estimateCruiseDailyEmissions({
      annualCo2Tonnes: 365000,
      annualFuelTonnes: 100000,
      positions: [
        { latitude: 40, longitude: 1, speedOverGround: 14, timestamp: new Date("2026-07-01T00:00:00Z") },
        { latitude: 40.5, longitude: 2, speedOverGround: 15, timestamp: new Date("2026-07-01T06:00:00Z") },
        { latitude: 41, longitude: 3, speedOverGround: 15, timestamp: new Date("2026-07-01T12:00:00Z") }
      ]
    });

    expect(estimate.estimatedCo2Tonnes).toBe(1000);
    expect(estimate.estimatedFuelTonnes).toBeCloseTo(273.973, 3);
    expect(estimate.confidenceScore).toBeGreaterThan(0.8);
    expect(estimate.distanceNm).toBeGreaterThan(100);
  });

  it("falls back to a lower-confidence movement heuristic without MRV data", () => {
    const estimate = estimateCruiseDailyEmissions({
      grossTonnage: 120000,
      positions: [
        { latitude: 25, longitude: -80, speedOverGround: 12, timestamp: new Date("2026-07-01T00:00:00Z") },
        { latitude: 26, longitude: -78, speedOverGround: 13, timestamp: new Date("2026-07-01T06:00:00Z") }
      ]
    });

    expect(estimate.estimatedCo2Tonnes).toBeGreaterThan(0);
    expect(estimate.estimatedFuelTonnes).toBeGreaterThan(0);
    expect(estimate.confidenceScore).toBeLessThan(0.5);
  });

  it("calculates nautical-mile distance between AIS points", () => {
    expect(haversineNm({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 })).toBeCloseTo(60.04, 1);
  });
});

describe("AIS position cleanup", () => {
  it("rejects invalid coordinates and excessive speeds", () => {
    expect(
      getPositionQualityIssue({
        latitude: 95,
        longitude: 4,
        speedOverGround: 12,
        timestamp: new Date("2026-07-01T00:00:00Z")
      })
    ).toBe("invalid-coordinate");

    expect(
      getPositionQualityIssue({
        latitude: 0,
        longitude: 0,
        speedOverGround: 12,
        timestamp: new Date("2026-07-01T00:00:00Z")
      })
    ).toBe("zero-island-coordinate");

    expect(
      getPositionQualityIssue({
        latitude: 40,
        longitude: 4,
        speedOverGround: 46,
        timestamp: new Date("2026-07-01T00:00:00Z")
      })
    ).toBe("speed-over-45-knots");
  });

  it("accepts plausible cruise ship positions", () => {
    expect(
      getPositionQualityIssue({
        latitude: 40,
        longitude: 4,
        speedOverGround: 18,
        timestamp: new Date("2026-07-01T00:00:00Z")
      })
    ).toBeNull();
  });
});

describe("AISStream cruise region configuration", () => {
  it("uses all default regions when AISSTREAM_BOUNDING_BOXES is missing", () => {
    delete process.env.AISSTREAM_BOUNDING_BOXES;

    const config = getCruiseRegionConfig();

    expect(config.source).toBe("default");
    expect(config.regions).toHaveLength(CRUISE_REGIONS.length);
    expect(getCruiseRegions()).toHaveLength(CRUISE_REGIONS.length);
  });

  it("uses all default regions when AISSTREAM_BOUNDING_BOXES is blank", () => {
    process.env.AISSTREAM_BOUNDING_BOXES = "   ";

    const config = getCruiseRegionConfig();

    expect(config.source).toBe("default");
    expect(config.regions).toHaveLength(CRUISE_REGIONS.length);
  });

  it("uses a valid explicit override instead of merging with defaults", () => {
    process.env.AISSTREAM_BOUNDING_BOXES = JSON.stringify([
      {
        id: "test-region",
        name: "Test Region",
        boundingBox: [
          [10, 20],
          [12, 22]
        ]
      }
    ]);

    const config = getCruiseRegionConfig();

    expect(config.source).toBe("override");
    expect(config.regions).toEqual([
      {
        id: "test-region",
        name: "Test Region",
        boundingBox: [
          [10, 20],
          [12, 22]
        ]
      }
    ]);
  });

  it("throws a clear error for invalid explicit configuration", () => {
    process.env.AISSTREAM_BOUNDING_BOXES = JSON.stringify([{ id: "Bad Id", name: "Bad", boundingBox: [[0, 0]] }]);

    expect(() => getCruiseRegionConfig()).toThrow(/Invalid AISSTREAM_BOUNDING_BOXES/);
  });

  it("keeps default region ids unique", () => {
    const ids = CRUISE_REGIONS.map((region) => region.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it("defines valid default bounding boxes", () => {
    expect(() => validateCruiseRegions(CRUISE_REGIONS)).not.toThrow();
  });
});

describe("AIS websocket payload parsing", () => {
  it("normalizes string, Buffer, ArrayBuffer, Blob-like, and data-wrapped payloads", async () => {
    const json = '{"MessageType":"PositionReport"}';
    const buffer = Buffer.from(json, "utf8");
    const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    const blobLike = { text: async () => json };

    await expect(messageDataToString(json)).resolves.toBe(json);
    await expect(messageDataToString(buffer)).resolves.toBe(json);
    await expect(messageDataToString(arrayBuffer)).resolves.toBe(json);
    await expect(messageDataToString(blobLike)).resolves.toBe(json);
    await expect(messageDataToString({ data: blobLike })).resolves.toBe(json);
  });
});

describe("cruise dashboard query helpers", () => {
  const now = new Date("2026-07-01T12:00:00Z");

  it("selects one latest marker per ship when many AIS positions exist", () => {
    const points = selectLatestCruisePositionPerShip(
      [
        position({ shipId: "ship-1", latitude: 40, longitude: 4, timestamp: new Date("2026-07-01T10:00:00Z") }),
        position({ shipId: "ship-1", latitude: 41, longitude: 5, timestamp: new Date("2026-07-01T11:00:00Z") }),
        position({ shipId: "ship-2", latitude: 25, longitude: -78, timestamp: new Date("2026-07-01T11:30:00Z") })
      ],
      now,
      CRUISE_POSITION_FRESHNESS_WINDOW_MS
    );

    expect(points).toHaveLength(2);
    expect(new Set(points.map((point) => point.shipId)).size).toBe(points.length);
    expect(points.find((point) => point.shipId === "ship-1")?.latitude).toBe(41);
  });

  it("excludes stale positions from currently tracked vessels", () => {
    const points = selectLatestCruisePositionPerShip(
      [
        position({ shipId: "fresh", timestamp: new Date("2026-07-01T11:00:00Z") }),
        position({ shipId: "stale", timestamp: new Date("2026-07-01T02:00:00Z") })
      ],
      now,
      CRUISE_POSITION_FRESHNESS_WINDOW_MS
    );

    expect(points.map((point) => point.shipId)).toEqual(["fresh"]);
    expect(getCruiseDataStatus(new Date("2026-07-01T11:00:00Z"), now)).toBe("Healthy");
    expect(getCruiseDataStatus(new Date("2026-07-01T02:00:00Z"), now)).toBe("Stale");
    expect(getCruiseDataStatus(null, now)).toBe("Awaiting data");
  });

  it("filters invalid coordinates before map rendering", () => {
    const points = selectLatestCruisePositionPerShip(
      [
        position({ shipId: "valid", latitude: 58, longitude: 6 }),
        position({ shipId: "zero", latitude: 0, longitude: 0 }),
        position({ shipId: "swapped", latitude: 120, longitude: 4 })
      ],
      now,
      CRUISE_POSITION_FRESHNESS_WINDOW_MS
    );

    expect(points.map((point) => point.shipId)).toEqual(["valid"]);
  });

  it("deduplicates ship/date/method estimates before totals", () => {
    const date = new Date("2026-07-01T00:00:00Z");
    const rows = [
      estimateRow({ shipId: "ship-1", date, methodVersion: "v1", estimatedCo2Tonnes: 100 }),
      estimateRow({ shipId: "ship-1", date, methodVersion: "v1", estimatedCo2Tonnes: 100 }),
      estimateRow({ shipId: "ship-1", date, methodVersion: "v2", estimatedCo2Tonnes: 125 }),
      estimateRow({ shipId: "ship-2", date, methodVersion: "v1", estimatedCo2Tonnes: 50 })
    ];

    expect(dedupeCruiseEstimateRows(rows)).toHaveLength(3);
    expect(summarizeCruiseEstimateRows(rows).co2Tonnes).toBe(275);
  });

  it("uses vessel activity density as the default map mode when no trusted daily CO2 estimate exists", () => {
    const points = buildCruiseActivityMapPoints([position({ shipId: "ship-1" })], []);

    expect(points[0]).toMatchObject({ activityWeight: 1, estimatedCo2Tonnes: null });
  });

  it("keeps equivalent density weights even when real CO2 estimates exist", () => {
    const date = new Date("2026-07-01T00:00:00Z");
    const points = buildCruiseActivityMapPoints(
      [position({ shipId: "ship-1" }), position({ shipId: "ship-2" })],
      [estimateRow({ shipId: "ship-1", date, methodVersion: "v1", estimatedCo2Tonnes: 42.5 })]
    );

    expect(points.map((point) => point.activityWeight)).toEqual([1, 1]);
    expect(points.find((point) => point.shipId === "ship-1")).toMatchObject({ estimatedCo2Tonnes: 42.5 });
    expect(points.find((point) => point.shipId === "ship-2")).toMatchObject({ estimatedCo2Tonnes: null });
  });

  it("does not let high CO2 values create disproportionate default map weights", () => {
    const date = new Date("2026-07-01T00:00:00Z");
    const points = buildCruiseActivityMapPoints(
      [position({ shipId: "ship-1" }), position({ shipId: "ship-2" })],
      [estimateRow({ shipId: "ship-1", date, methodVersion: "v1", estimatedCo2Tonnes: 5000 })]
    );

    expect(points.find((point) => point.shipId === "ship-1")?.activityWeight).toBe(points.find((point) => point.shipId === "ship-2")?.activityWeight);
  });

  it("uses activity-density wording for the default cruise map copy", () => {
    const copy = getCruiseMapCopy("activity");

    expect(copy.legendTitle).toBe("Live cruise vessel activity");
    expect(copy.subtitle).toContain("Latest AIS vessel positions");
    expect(`${copy.legendTitle} ${copy.subtitle}`).not.toMatch(/emissions intensity|mixed|CO2 weighting/i);
  });

  it("uses the shared PaperStraw heatmap palette for cruise activity maps", () => {
    const cruiseGradient = paperStrawActivityDensityHeatmapColorExpression().join(" ");
    const airportScoreGradient = paperStrawScoreColorExpression("emissionScore").join(" ");

    expect(airportScoreGradient).toContain(PAPERSTRAW_HEATMAP_COLORS.low);
    expect(airportScoreGradient).toContain(PAPERSTRAW_HEATMAP_COLORS.midLow);
    expect(airportScoreGradient).toContain(PAPERSTRAW_HEATMAP_COLORS.medium);
    expect(airportScoreGradient).toContain(PAPERSTRAW_HEATMAP_COLORS.high);
    expect(airportScoreGradient).toContain(PAPERSTRAW_HEATMAP_COLORS.peak);
    expect(cruiseGradient).toContain("rgba(91,33,182");
    expect(cruiseGradient).toContain("rgba(219,39,119");
    expect(cruiseGradient).toContain("rgba(249,115,22");
    expect(cruiseGradient).toContain("rgba(250,204,21");
    expect(cruiseGradient).toContain("rgba(255,247,194");
  });

  it("keeps the cruise map payload compact for several thousand vessels", () => {
    const points = Array.from({ length: 3000 }, (_, index) =>
      position({
        shipId: `ship-${index}`,
        latitude: -55 + ((index * 0.13) % 120),
        longitude: -170 + ((index * 0.29) % 340),
        activityWeight: 1,
        estimatedCo2Tonnes: null
      })
    );

    expect(estimateCruiseMapPayloadBytes(points)).toBeLessThan(1_500_000);
  });
});

describe("AIS cruise ship identity resolution", () => {
  it("updates the IMO record when the same IMO arrives with a new safe MMSI", async () => {
    const repo = new FakeCruiseShipRepository([{ id: "ship-1", imo: "1234567", mmsi: null, shipType: "Passenger ship" }]);

    const result = await resolveCruiseShipIdentity(repo, identity({ imo: "1234567", mmsi: "244123456" }));

    expect(result.ship.id).toBe("ship-1");
    expect(result.conflicts).toEqual([]);
    expect(repo.get("ship-1")?.mmsi).toBe("244123456");
  });

  it("updates the MMSI record when a new safe IMO arrives", async () => {
    const repo = new FakeCruiseShipRepository([{ id: "ship-1", imo: null, mmsi: "244123456", shipType: "Passenger ship" }]);

    const result = await resolveCruiseShipIdentity(repo, identity({ imo: "1234567", mmsi: "244123456" }));

    expect(result.ship.id).toBe("ship-1");
    expect(result.conflicts).toEqual([]);
    expect(repo.get("ship-1")?.imo).toBe("1234567");
  });

  it("keeps processing when an incoming IMO belongs to another ship", async () => {
    const repo = new FakeCruiseShipRepository([
      { id: "imo-owner", imo: "1234567", mmsi: "111111111", shipType: "Passenger ship" },
      { id: "mmsi-owner", imo: null, mmsi: "244123456", shipType: "Passenger ship" }
    ]);

    const result = await resolveCruiseShipIdentity(repo, identity({ imo: "7654321", mmsi: "244123456" }));

    expect(result.ship.id).toBe("mmsi-owner");
    expect(result.conflicts).toEqual([]);
    expect(repo.get("mmsi-owner")?.imo).toBe("7654321");

    const conflicting = await resolveCruiseShipIdentity(repo, identity({ imo: "1234567", mmsi: "244123456" }));
    expect(conflicting.ship.id).toBe("imo-owner");
    expect(conflicting.conflicts[0]).toContain("MMSI 244123456 already belongs to ship mmsi-owner");
    expect(repo.get("imo-owner")?.mmsi).toBe("111111111");
  });

  it("uses MMSI when IMO is missing", async () => {
    const repo = new FakeCruiseShipRepository([{ id: "ship-1", imo: null, mmsi: "244123456", shipType: "Passenger ship" }]);

    const result = await resolveCruiseShipIdentity(repo, identity({ imo: null, mmsi: "244123456" }));

    expect(result.ship.id).toBe("ship-1");
    expect(result.action).toBe("updated");
  });

  it("creates by valid IMO when MMSI is missing", async () => {
    const repo = new FakeCruiseShipRepository([]);

    const result = await resolveCruiseShipIdentity(repo, identity({ imo: "1234567", mmsi: null }));

    expect(result.action).toBe("created");
    expect(repo.get(result.ship.id)?.imo).toBe("1234567");
    expect(repo.get(result.ship.id)?.mmsi).toBeNull();
  });
});

describe("EMSA THETIS-MRV parser", () => {
  it("normalizes common MRV CSV headers", () => {
    const rows = parseMrvCsv(
      [
        "IMO,Ship name,Ship type,Company,Reporting year,Annual CO2 tonnes,Annual fuel tonnes,Distance nm,Time at sea hours",
        "1234567,Example Cruise,Passenger ship,Example Operator,2025,120000,38000,42000,2800"
      ].join("\n")
    );

    expect(rows[0]).toMatchObject({
      imo: "1234567",
      name: "Example Cruise",
      operator: "Example Operator",
      reportingYear: 2025,
      annualCo2Tonnes: 120000
    });
  });
});

function identity(overrides: Partial<CruiseShipIdentityInput>): CruiseShipIdentityInput {
  return {
    imo: null,
    mmsi: null,
    name: "Example Cruise",
    shipType: "Passenger ship",
    destination: "TEST",
    source: "AISStream.io",
    ...overrides
  };
}

function position(overrides: Partial<ReturnType<typeof positionBase>>) {
  return { ...positionBase(), ...overrides };
}

function positionBase() {
  return {
    shipId: "ship",
    name: "Example Cruise",
    operator: "Example Operator",
    mmsi: "244123456",
    latitude: 40,
    longitude: 4,
    speedOverGround: 14,
    destination: "TEST",
    timestamp: new Date("2026-07-01T11:00:00Z"),
    activityWeight: 1,
    estimatedCo2Tonnes: null
  };
}

function estimateRow(overrides: {
  shipId: string;
  date: Date;
  methodVersion: string;
  estimatedCo2Tonnes: number;
  estimatedFuelTonnes?: number;
  distanceNm?: number;
}) {
  return {
    estimatedFuelTonnes: 0,
    distanceNm: 0,
    ...overrides
  };
}

class FakeCruiseShipRepository implements CruiseShipIdentityRepository {
  private ships = new Map<string, CruiseShipIdentityRecord & { name?: string | null; destination?: string | null }>();
  private counter = 0;

  constructor(seed: CruiseShipIdentityRecord[]) {
    for (const ship of seed) this.ships.set(ship.id, { ...ship });
  }

  get(id: string) {
    return this.ships.get(id);
  }

  async findByImo(imo: string) {
    return [...this.ships.values()].find((ship) => ship.imo === imo) ?? null;
  }

  async findByMmsi(mmsi: string) {
    return [...this.ships.values()].find((ship) => ship.mmsi === mmsi) ?? null;
  }

  async create(data: CruiseShipIdentityInput & { name: string }) {
    if (data.imo && (await this.findByImo(data.imo))) throw Object.assign(new Error("duplicate imo"), { code: "P2002" });
    if (data.mmsi && (await this.findByMmsi(data.mmsi))) throw Object.assign(new Error("duplicate mmsi"), { code: "P2002" });
    this.counter += 1;
    const id = `created-${this.counter}`;
    this.ships.set(id, {
      id,
      imo: data.imo,
      mmsi: data.mmsi,
      shipType: data.shipType ?? null,
      name: data.name,
      destination: data.destination ?? null
    });
    return { id };
  }

  async update(id: string, data: Partial<CruiseShipIdentityInput>) {
    const existing = this.ships.get(id);
    if (!existing) throw new Error(`Unknown ship ${id}`);
    const imoOwner = data.imo ? await this.findByImo(data.imo) : null;
    const mmsiOwner = data.mmsi ? await this.findByMmsi(data.mmsi) : null;
    if (imoOwner && imoOwner.id !== id) throw Object.assign(new Error("duplicate imo"), { code: "P2002" });
    if (mmsiOwner && mmsiOwner.id !== id) throw Object.assign(new Error("duplicate mmsi"), { code: "P2002" });
    this.ships.set(id, {
      ...existing,
      ...data,
      imo: data.imo === undefined ? existing.imo : data.imo,
      mmsi: data.mmsi === undefined ? existing.mmsi : data.mmsi,
      shipType: data.shipType === undefined ? existing.shipType : data.shipType
    });
    return { id };
  }
}
