import type { DashboardData } from "./types";

export const demoDashboardData: DashboardData = {
  sourceNotice: "Demo seed preview shown until DATABASE_URL is configured and migrations are run.",
  leaderboard: [
    { rank: 1, label: "N742QS", secondaryLabel: "G650", flights: 14, totalDistanceKm: 51240, estimatedCo2Kg: 486780, averageCo2KgPerFlight: 34770 },
    { rank: 2, label: "PH-PSA", secondaryLabel: "GLF5", flights: 9, totalDistanceKm: 23880, estimatedCo2Kg: 222084, averageCo2KgPerFlight: 24676 },
    { rank: 3, label: "M-ESTM", secondaryLabel: "CL35", flights: 11, totalDistanceKm: 16170, estimatedCo2Kg: 110601, averageCo2KgPerFlight: 10055 }
  ],
  timeSeries: [
    { period: "Jan", estimatedCo2Kg: 82000, flights: 9 },
    { period: "Feb", estimatedCo2Kg: 113000, flights: 14 },
    { period: "Mar", estimatedCo2Kg: 97000, flights: 11 },
    { period: "Apr", estimatedCo2Kg: 151000, flights: 17 },
    { period: "May", estimatedCo2Kg: 132000, flights: 16 },
    { period: "Jun", estimatedCo2Kg: 244000, flights: 24 }
  ],
  topAircraft: [
    { rank: 1, label: "N742QS", secondaryLabel: "G650", flights: 14, totalDistanceKm: 51240, estimatedCo2Kg: 486780, averageCo2KgPerFlight: 34770 },
    { rank: 2, label: "PH-PSA", secondaryLabel: "GLF5", flights: 9, totalDistanceKm: 23880, estimatedCo2Kg: 222084, averageCo2KgPerFlight: 24676 },
    { rank: 3, label: "M-ESTM", secondaryLabel: "CL35", flights: 11, totalDistanceKm: 16170, estimatedCo2Kg: 110601, averageCo2KgPerFlight: 10055 }
  ],
  topEntities: [
    { rank: 1, label: "Verified Public Foundation", flights: 9, totalDistanceKm: 23880, estimatedCo2Kg: 222084, averageCo2KgPerFlight: 24676 },
    { rank: 2, label: "Listed Media Group", flights: 5, totalDistanceKm: 9650, estimatedCo2Kg: 65720, averageCo2KgPerFlight: 13144 }
  ]
};
