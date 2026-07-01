import { describe, expect, it } from "vitest";
import {
  getPositionQualityIssue,
  messageDataToString,
  resolveCruiseShipIdentity,
  type CruiseShipIdentityInput,
  type CruiseShipIdentityRecord,
  type CruiseShipIdentityRepository
} from "@/lib/cruises/aisstream";
import { estimateCruiseDailyEmissions, haversineNm } from "@/lib/cruises/estimation";
import { parseMrvCsv } from "@/lib/cruises/mrv";

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
