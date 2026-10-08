// Privacy offset: move a real coordinate 1–3 km in a random direction so the
// dot is placed *near* the user, never at their exact location. A fresh random
// offset is generated each session (this runs once per join), so the same user
// lands somewhere different every time.

const KM_PER_DEG_LAT = 111.32;

export function applyPrivacyOffset(
  lat: number,
  lng: number,
  minKm: number = 1,
  maxKm: number = 3,
): { lat: number; lng: number } {
  const distanceKm = minKm + Math.random() * Math.max(0.1, maxKm - minKm);
  const bearing = Math.random() * 2 * Math.PI; // random direction

  const dLat = (distanceKm * Math.cos(bearing)) / KM_PER_DEG_LAT;
  const latRad = (lat * Math.PI) / 180;
  const dLng =
    (distanceKm * Math.sin(bearing)) /
    (KM_PER_DEG_LAT * Math.cos(latRad) || KM_PER_DEG_LAT);

  return {
    lat: clamp(lat + dLat, -85, 85),
    lng: wrapLng(lng + dLng),
  };
}

export const WORLDWIDE_HUBS = [
  { name: "Tokyo", lat: 35.6762, lng: 139.6503 },
  { name: "London", lat: 51.5074, lng: -0.1278 },
  { name: "New York", lat: 40.7128, lng: -74.006 },
  { name: "Paris", lat: 48.8566, lng: 2.3522 },
  { name: "Manila", lat: 14.5995, lng: 120.9842 },
  { name: "Sydney", lat: -33.8688, lng: 151.2093 },
  { name: "Berlin", lat: 52.52, lng: 13.405 },
  { name: "Seoul", lat: 37.5665, lng: 126.978 },
  { name: "Singapore", lat: 1.3521, lng: 103.8198 },
  { name: "Toronto", lat: 43.6532, lng: -79.3832 },
  { name: "São Paulo", lat: -23.5505, lng: -46.6333 },
  { name: "Reykjavik", lat: 64.1466, lng: -21.9426 },
  { name: "Cape Town", lat: -33.9249, lng: 18.4241 },
  { name: "Bangkok", lat: 13.7563, lng: 100.5018 },
  { name: "Buenos Aires", lat: -34.6037, lng: -58.3816 },
  { name: "Dubai", lat: 25.2048, lng: 55.2708 },
  { name: "Rome", lat: 41.9028, lng: 12.4964 },
  { name: "San Francisco", lat: 37.7749, lng: -122.4194 },
  { name: "Stockholm", lat: 59.3293, lng: 18.0686 },
  { name: "Amsterdam", lat: 52.3676, lng: 4.9041 },
  { name: "Auckland", lat: -36.8485, lng: 174.7633 },
  { name: "Honolulu", lat: 21.3069, lng: -157.8583 },
  { name: "Helsinki", lat: 60.1699, lng: 24.9384 },
  { name: "Madrid", lat: 40.4168, lng: -3.7038 },
  { name: "Vienna", lat: 48.2082, lng: 16.3738 },
  { name: "Nairobi", lat: -1.2921, lng: 36.8219 },
  { name: "Mexico City", lat: 19.4326, lng: -99.1332 },
  { name: "Cairo", lat: 30.0444, lng: 31.2357 },
  { name: "Jakarta", lat: -6.2088, lng: 106.8456 },
  { name: "Oslo", lat: 59.9139, lng: 10.7522 },
  { name: "Dublin", lat: 53.3498, lng: -6.2603 },
  { name: "Prague", lat: 50.0755, lng: 14.4378 },
  { name: "Lisbon", lat: 38.7223, lng: -9.1393 },
  { name: "Copenhagen", lat: 55.6761, lng: 12.5683 },
  { name: "Taipei", lat: 25.033, lng: 121.5654 },
  { name: "Santiago", lat: -33.4489, lng: -70.6693 },
  { name: "Istanbul", lat: 41.0082, lng: 28.9784 },
  { name: "Mumbai", lat: 19.076, lng: 72.8777 },
];

export function getRandomWorldwideCoordinate(): { lat: number; lng: number } {
  const hub = WORLDWIDE_HUBS[Math.floor(Math.random() * WORLDWIDE_HUBS.length)];
  return applyPrivacyOffset(hub.lat, hub.lng, 4, 30);
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function wrapLng(lng: number): number {
  // Keep longitude in [-180, 180].
  return ((((lng + 180) % 360) + 360) % 360) - 180;
}

export function isValidLatLng(lat: unknown, lng: unknown): boolean {
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}
