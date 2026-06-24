import { prisma } from "@/lib/prisma";

export const DEFAULT_KG_CO2_PER_KM = 8.9;

export async function getKgCo2PerKmForAircraftType(aircraftType: string) {
  const factor = await prisma.emissionFactor.findUnique({
    where: { aircraftType: aircraftType.trim().toUpperCase() }
  });

  return Number(factor?.kgCo2PerKm ?? DEFAULT_KG_CO2_PER_KM);
}
