const airportCoordinates: Record<string, { lat: number; lon: number }> = {
  EHAM: { lat: 52.3105, lon: 4.7683 },
  EGLF: { lat: 51.2758, lon: -0.7763 },
  EGLFARNBOROUGH: { lat: 51.2758, lon: -0.7763 },
  KTEB: { lat: 40.8501, lon: -74.0608 },
  KLAX: { lat: 33.9416, lon: -118.4085 },
  KLAS: { lat: 36.084, lon: -115.1537 },
  KJFK: { lat: 40.6413, lon: -73.7781 },
  LFMN: { lat: 43.6653, lon: 7.215 },
  LFMD: { lat: 43.542, lon: 6.9535 },
  LSZH: { lat: 47.4581, lon: 8.5555 },
  OMDB: { lat: 25.2532, lon: 55.3657 }
};

export function estimateAirportDistanceKm(origin: string, destination: string) {
  const from = airportCoordinates[origin.trim().toUpperCase()];
  const to = airportCoordinates[destination.trim().toUpperCase()];
  if (!from || !to) return null;

  const earthRadiusKm = 6371;
  const dLat = toRadians(to.lat - from.lat);
  const dLon = toRadians(to.lon - from.lon);
  const lat1 = toRadians(from.lat);
  const lat2 = toRadians(to.lat);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(earthRadiusKm * c);
}

export function estimateCoordinateDistanceKm(from: { lat: number; lon: number }, to: { lat: number; lon: number }) {
  const earthRadiusKm = 6371;
  const dLat = toRadians(to.lat - from.lat);
  const dLon = toRadians(to.lon - from.lon);
  const lat1 = toRadians(from.lat);
  const lat2 = toRadians(to.lat);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(earthRadiusKm * c);
}

export function findNearestKnownAirport(lat: number, lon: number) {
  let nearest: { code: string; distanceKm: number } | null = null;

  for (const [code, coordinates] of Object.entries(airportCoordinates)) {
    const distanceKm = estimateCoordinateDistanceKm({ lat, lon }, coordinates);
    if (!nearest || distanceKm < nearest.distanceKm) {
      nearest = { code, distanceKm };
    }
  }

  return nearest;
}

function toRadians(degrees: number) {
  return (degrees * Math.PI) / 180;
}
