/**
 * Helpers compartidos entre fieldInspectionService y fieldInspectionTimelineService.
 * Centraliza la lógica de parsing para evitar divergencia de implementaciones.
 */

export function parseGeoJson(v: unknown): { lat: number; lng: number } | null {
  if (v == null) return null;
  if (typeof v === 'string') {
    try {
      return parseGeoJson(JSON.parse(v));
    } catch {
      return null;
    }
  }
  if (
    typeof v === 'object' &&
    v !== null &&
    'type' in v &&
    (v as { type: string }).type === 'Point' &&
    'coordinates' in v
  ) {
    const c = (v as { coordinates: [number, number] }).coordinates;
    if (Array.isArray(c) && c.length >= 2) return { lng: c[0]!, lat: c[1]! };
  }
  return null;
}

export function parseJsonArray<T>(value: unknown): T[] | null {
  if (Array.isArray(value)) return value as T[];
  if (typeof value !== 'string') return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? (parsed as T[]) : null;
  } catch {
    return null;
  }
}

export function parseJsonObject<T>(value: unknown): T | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as T;
  if (typeof value !== 'string') return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as T) : null;
  } catch {
    return null;
  }
}

export function embedOne<T>(raw: unknown): T | null {
  if (Array.isArray(raw)) return (raw[0] as T | undefined) ?? null;
  if (raw && typeof raw === 'object') return raw as T;
  return null;
}
