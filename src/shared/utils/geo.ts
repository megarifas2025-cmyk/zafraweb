/** Distancia en metros entre dos puntos WGS84 (Haversine). */
export function distanceMeters(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const R = 6371000;
  const φ1 = (a.latitude * Math.PI) / 180;
  const φ2 = (b.latitude * Math.PI) / 180;
  const Δφ = ((b.latitude - a.latitude) * Math.PI) / 180;
  const Δλ = ((b.longitude - a.longitude) * Math.PI) / 180;
  const x =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

/** Distancia en km entre puntos `{ lat, lng }` (comprador / finca). */
export function distanceKmKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  return distanceMeters(
    { latitude: a.lat, longitude: a.lng },
    { latitude: b.lat, longitude: b.lng },
  ) / 1000;
}

/**
 * Geography/GeoJSON de PostgREST (fincas.coordenadas) → { lat, lng }.
 * Si ya viene como { lat, lng } de la app, se devuelve igual.
 */
export function normalizeFincaCoordenadas(raw: unknown): { lat: number; lng: number } | null {
  if (raw == null) return null;
  if (typeof raw === 'string') {
    const match = raw.match(/POINT\s*\(\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s*\)/i);
    if (match) {
      const lng = Number(match[1]);
      const lat = Number(match[2]);
      if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
    }
  }
  if (typeof raw === 'object' && raw !== null && 'lat' in raw && 'lng' in raw) {
    const lat = Number((raw as { lat: unknown }).lat);
    const lng = Number((raw as { lng: unknown }).lng);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  }
  if (typeof raw === 'object' && raw !== null && 'type' in raw && 'coordinates' in raw) {
    const t = (raw as { type?: string }).type;
    const c = (raw as { coordinates?: unknown }).coordinates;
    if (t === 'Point' && Array.isArray(c) && c.length >= 2) {
      const lng = Number(c[0]);
      const lat = Number(c[1]);
      if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
    }
  }
  return null;
}

/** Texto corto de toneladas a partir de kg. */
export function tonsFromKg(kg: number): string {
  if (!Number.isFinite(kg) || kg <= 0) return '0 t';
  const t = kg / 1000;
  return t >= 1 ? `${t.toFixed(1)} t` : `${Math.round(kg)} kg`;
}
