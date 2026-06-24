import type { AggregateFlight } from "./types";

export const demoNow = new Date("2026-06-22T12:00:00Z");
const yearTotalTargetKg = 12847193000;
const baseFlights: AggregateFlight[] = [
  { departureAt: new Date("2026-01-14T09:00:00Z"), originAirport: "KTEB", destinationAirport: "KLAX", distanceKm: 3974, estimatedCo2Kg: 1330000000, aircraftType: "G650" },
  { departureAt: new Date("2026-02-08T12:00:00Z"), originAirport: "EHAM", destinationAirport: "LFMN", distanceKm: 978, estimatedCo2Kg: 1450000000, aircraftType: "GLF5" },
  { departureAt: new Date("2026-03-18T15:30:00Z"), originAirport: "EGLF", destinationAirport: "LSZH", distanceKm: 779, estimatedCo2Kg: 1690000000, aircraftType: "CL35" },
  { departureAt: new Date("2026-04-21T08:45:00Z"), originAirport: "KJFK", destinationAirport: "KLAS", distanceKm: 3614, estimatedCo2Kg: 1960000000, aircraftType: "G650" },
  { departureAt: new Date("2026-05-17T11:10:00Z"), originAirport: "LSZH", destinationAirport: "OMDB", distanceKm: 4775, estimatedCo2Kg: 2200000000, aircraftType: "GLF5" },
  { departureAt: new Date("2026-06-10T13:00:00Z"), originAirport: "LFMN", destinationAirport: "EHAM", distanceKm: 978, estimatedCo2Kg: 1190000000, aircraftType: "CL35" },
  { departureAt: new Date("2026-06-18T17:20:00Z"), originAirport: "KLAX", destinationAirport: "KTEB", distanceKm: 3974, estimatedCo2Kg: 1820000000, aircraftType: "G650" },
  { departureAt: new Date("2026-06-22T08:00:00Z"), originAirport: "EGLF", destinationAirport: "LFMN", distanceKm: 1011, estimatedCo2Kg: 603596500, aircraftType: "CL35" },
  { departureAt: new Date("2026-06-22T10:30:00Z"), originAirport: "KTEB", destinationAirport: "KJFK", distanceKm: 34, estimatedCo2Kg: 603596500, aircraftType: "G650" }
];

const currentTotal = baseFlights.reduce((total, flight) => total + flight.estimatedCo2Kg, 0);
export const demoFlights =
  currentTotal === yearTotalTargetKg
    ? baseFlights
    : baseFlights.map((flight, index) =>
        index === 0 ? { ...flight, estimatedCo2Kg: flight.estimatedCo2Kg + yearTotalTargetKg - currentTotal } : flight
      );
