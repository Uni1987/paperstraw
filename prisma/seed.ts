import { PrismaClient } from "@prisma/client";
import { calculateEstimatedCo2 } from "../lib/emissions/calculate";
import { ImportStatuses } from "../lib/ingestion/importStatus";
import { DataSourceProviders } from "../lib/ingestion/providerConstants";

const prisma = new PrismaClient();

const factors = [
  { aircraftType: "G650", kgCo2PerKm: 9.5, notes: "Demo private jet factor for local development." },
  { aircraftType: "GLF5", kgCo2PerKm: 9.3, notes: "Demo private jet factor for local development." },
  { aircraftType: "CL35", kgCo2PerKm: 6.84, notes: "Demo private jet factor for local development." },
  { aircraftType: "UNKNOWN", kgCo2PerKm: 8.9, notes: "Fallback factor for incomplete research data." }
];

const aircraft = [
  { icaoHex: "A1B2C3", registration: "N742QS", aircraftType: "G650", verifiedPublicEntity: null },
  { icaoHex: "484ABC", registration: "PH-PSA", aircraftType: "GLF5", verifiedPublicEntity: "Verified Public Foundation" },
  { icaoHex: "43C0DE", registration: "M-ESTM", aircraftType: "CL35", verifiedPublicEntity: "Listed Media Group" }
];

const flights = [
  { icaoHex: "A1B2C3", originAirport: "KTEB", destinationAirport: "KLAX", departureAt: "2026-06-01T09:30:00Z", arrivalAt: "2026-06-01T14:40:00Z", distanceKm: 3974 },
  { icaoHex: "A1B2C3", originAirport: "KLAX", destinationAirport: "KLAS", departureAt: "2026-06-04T18:10:00Z", arrivalAt: "2026-06-04T19:00:00Z", distanceKm: 380 },
  { icaoHex: "A1B2C3", originAirport: "KLAS", destinationAirport: "KTEB", departureAt: "2026-06-09T17:15:00Z", arrivalAt: "2026-06-09T22:35:00Z", distanceKm: 3581 },
  { icaoHex: "484ABC", originAirport: "EHAM", destinationAirport: "LFMN", departureAt: "2026-06-03T07:45:00Z", arrivalAt: "2026-06-03T09:40:00Z", distanceKm: 978 },
  { icaoHex: "484ABC", originAirport: "LFMN", destinationAirport: "LSZH", departureAt: "2026-06-06T12:20:00Z", arrivalAt: "2026-06-06T13:10:00Z", distanceKm: 434 },
  { icaoHex: "484ABC", originAirport: "LSZH", destinationAirport: "EHAM", departureAt: "2026-06-14T16:25:00Z", arrivalAt: "2026-06-14T17:55:00Z", distanceKm: 603 },
  { icaoHex: "43C0DE", originAirport: "EGLF", destinationAirport: "LFMN", departureAt: "2026-06-07T08:00:00Z", arrivalAt: "2026-06-07T09:50:00Z", distanceKm: 1011 },
  { icaoHex: "43C0DE", originAirport: "LFMD", destinationAirport: "EHAM", departureAt: "2026-05-28T10:00:00Z", arrivalAt: "2026-05-28T12:00:00Z", distanceKm: 984 }
];

async function main() {
  await prisma.flight.deleteMany();
  await prisma.aircraft.deleteMany();
  await prisma.emissionFactor.deleteMany();
  await prisma.importLog.deleteMany();

  for (const factor of factors) {
    await prisma.emissionFactor.create({ data: factor });
  }

  for (const item of aircraft) {
    await prisma.aircraft.create({ data: item });
  }

  for (const flight of flights) {
    const plane = await prisma.aircraft.findUniqueOrThrow({ where: { icaoHex: flight.icaoHex } });
    const factor = factors.find((item) => item.aircraftType === plane.aircraftType) ?? factors[factors.length - 1];
    const { estimatedCo2Kg } = calculateEstimatedCo2({
      distanceKm: flight.distanceKm,
      kgCo2PerKm: factor.kgCo2PerKm
    });

    await prisma.flight.create({
      data: {
        aircraftId: plane.id,
        originAirport: flight.originAirport,
        destinationAirport: flight.destinationAirport,
        departureAt: new Date(flight.departureAt),
        arrivalAt: new Date(flight.arrivalAt),
        distanceKm: flight.distanceKm,
        estimatedCo2Kg,
        dataSource: DataSourceProviders.CSV_UPLOAD,
        sourceAttribution: "Local seed data"
      }
    });
  }

  await prisma.importLog.create({
    data: {
      provider: DataSourceProviders.CSV_UPLOAD,
      status: ImportStatuses.SUCCESS,
      recordsImported: flights.length
    }
  });
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  });
