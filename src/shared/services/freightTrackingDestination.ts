/**
 * Destino aproximado para el radar de seguimiento: última solicitud de flete activa del usuario
 * (asignada o con postulaciones) + geocodificación de municipio/estado vía Nominatim (OSM).
 * La BD solo guarda texto de destino/origen; las coordenadas son estimación en mapa.
 */
import { supabase } from '@/shared/lib/supabase';
import type { FreightRequest } from '@/shared/types';

const USER_AGENT = 'ZafraClic/1.0 (seguimiento-carga; +https://zafraclic.local)';

export type DestinoSeguimiento = {
  latitude: number;
  longitude: number;
  /** Texto para UI (ej. destino u origen de la solicitud). */
  label: string;
};

type ReqRow = {
  id: string;
  origen_municipio: string;
  origen_estado: string;
  destino_municipio: string | null;
  destino_estado: string | null;
};

async function geocodeMunicipioEstado(municipio: string, estado: string): Promise<{ lat: number; lon: number } | null> {
  const m = municipio?.trim();
  const e = estado?.trim();
  if (!m || !e) return null;
  const q = `${m}, ${e}, Venezuela`;
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12_000);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { lat?: string; lon?: string }[];
    const first = json?.[0];
    if (!first?.lat || !first?.lon) return null;
    const lat = Number.parseFloat(first.lat);
    const lon = Number.parseFloat(first.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return { lat, lon };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/**
 * Obtiene coordenadas para el pin de destino en el mapa de seguimiento.
 * Prioriza destino de la solicitud; si no hay destino, usa origen.
 */
export async function fetchDestinoMapaParaSeguimiento(perfilId: string): Promise<DestinoSeguimiento | null> {
  const { data, error } = await supabase
    .from('freight_requests')
    .select('id, origen_municipio, origen_estado, destino_municipio, destino_estado')
    .eq('requester_id', perfilId)
    .in('estado', ['asignada', 'con_postulaciones'])
    .order('creado_en', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  const row = data as ReqRow;

  const useDest = Boolean(row.destino_municipio?.trim() && row.destino_estado?.trim());
  const muni = useDest ? row.destino_municipio! : row.origen_municipio;
  const edo = useDest ? row.destino_estado! : row.origen_estado;
  const label = useDest
    ? `Destino: ${muni}, ${edo}`
    : `Origen (sin destino en solicitud): ${muni}, ${edo}`;

  const coords = await geocodeMunicipioEstado(muni, edo);
  if (!coords) return null;

  return {
    latitude: coords.lat,
    longitude: coords.lon,
    label,
  };
}

export async function fetchDestinoMapaParaFreight(req: Pick<FreightRequest, 'origen_municipio' | 'origen_estado' | 'destino_municipio' | 'destino_estado'>): Promise<DestinoSeguimiento | null> {
  const useDest = Boolean(req.destino_municipio?.trim() && req.destino_estado?.trim());
  const muni = useDest ? req.destino_municipio! : req.origen_municipio;
  const edo = useDest ? req.destino_estado! : req.origen_estado;
  const label = useDest
    ? `Destino: ${muni}, ${edo}`
    : `Origen (sin destino en solicitud): ${muni}, ${edo}`;
  const coords = await geocodeMunicipioEstado(muni, edo);
  if (!coords) return null;
  return {
    latitude: coords.lat,
    longitude: coords.lon,
    label,
  };
}

export async function fetchOrigenMapaParaFreight(
  req: Pick<FreightRequest, 'origen_municipio' | 'origen_estado'>,
): Promise<DestinoSeguimiento | null> {
  const muni = req.origen_municipio?.trim();
  const edo = req.origen_estado?.trim();
  if (!muni || !edo) return null;
  const coords = await geocodeMunicipioEstado(muni, edo);
  if (!coords) return null;
  return {
    latitude: coords.lat,
    longitude: coords.lon,
    label: `Origen: ${muni}, ${edo}`,
  };
}
