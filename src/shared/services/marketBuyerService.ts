import { supabase } from '@/shared/lib/supabase';
import type { BuyerNearbySupplier, Cosecha } from '@/shared/types';

export interface AdCampaignRow {
  id: string;
  company_id: string;
  image_url: string;
  link: string | null;
  estatus: boolean;
}

export type EcosystemPinKind = 'cosecha' | 'company' | 'agrotienda';

export interface MapPin {
  kind: EcosystemPinKind;
  id: string;
  lat: number;
  lng: number;
  title: string;
  subtitle?: string;
  /** Solo en pins de cosecha: `cosechas.agricultor_id` (dueño / productor). Viene del RPC `market_ecosystem_nearby`. */
  agricultorId?: string;
  /** Opcional si el backend lo envía (mejora el título en SharedProducerProfile). */
  producerName?: string;
}

export async function listarAdCampaignsActivos(): Promise<AdCampaignRow[]> {
  const { data, error } = await supabase
    .from('ad_campaigns')
    .select('id, company_id, image_url, link, estatus')
    .eq('estatus', true)
    .order('creado_en', { ascending: false })
    .limit(12);
  if (error) {
    console.warn('ad_campaigns', error.message);
    return [];
  }
  return (data ?? []) as AdCampaignRow[];
}

export async function rpcMarketEcosystemNearby(lat: number, lng: number, radiusM: number) {
  const { data, error } = await supabase.rpc('market_ecosystem_nearby', {
    p_lat: lat,
    p_lng: lng,
    p_radius_m: radiusM,
  });
  if (error) {
    throw error;
  }
  const j = (data ?? { cosechas: [], companies: [], agrotiendas: [] }) as {
    cosechas: unknown[];
    companies: unknown[];
    agrotiendas: unknown[];
  };
  return j;
}

export async function listarProveedoresCercanosBuyer(
  lat: number,
  lng: number,
  radiusM: number,
  limit = 12,
): Promise<BuyerNearbySupplier[]> {
  const { data, error } = await supabase.rpc('buyer_nearby_suppliers', {
    p_lat: lat,
    p_lng: lng,
    p_radius_m: radiusM,
    p_limit: limit,
  });
  if (error) throw error;
  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    kind: row.kind === 'company' ? 'company' : 'agrotienda',
    display_name: String(row.display_name ?? 'Proveedor'),
    subtitle: row.subtitle ? String(row.subtitle) : null,
    distance_m: Number(row.distance_m ?? 0),
    available_items: Number(row.available_items ?? 0),
    phone: row.phone ? String(row.phone) : null,
    logo_url: row.logo_url ? String(row.logo_url) : null,
    lat: Number(row.lat ?? 0),
    lng: Number(row.lng ?? 0),
  }));
}

export function ecosystemJsonToPins(payload: Awaited<ReturnType<typeof rpcMarketEcosystemNearby>>): MapPin[] {
  const pins: MapPin[] = [];
  for (const c of payload.cosechas as Array<Record<string, unknown>>) {
    const lat = Number(c.lat);
    const lng = Number(c.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const rawAid = c.agricultor_id;
    const agricultorId =
      rawAid != null && String(rawAid).trim() !== '' ? String(rawAid) : undefined;
    const municipio = c.municipio != null ? String(c.municipio).trim() : '';
    const estadoVe = c.estado_ve != null ? String(c.estado_ve).trim() : '';
    const subtitle = [municipio, estadoVe].filter(Boolean).join(', ') || undefined;
    pins.push({
      kind: 'cosecha',
      id: String(c.id),
      lat,
      lng,
      title: String(c.rubro ?? 'Cosecha'),
      subtitle,
      agricultorId,
    });
  }
  for (const co of payload.companies as Array<Record<string, unknown>>) {
    const lat = Number(co.lat);
    const lng = Number(co.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    pins.push({
      kind: 'company',
      id: String(co.id),
      lat,
      lng,
      title: String(co.razon_social ?? 'Empresa'),
    });
  }
  for (const p of payload.agrotiendas as Array<Record<string, unknown>>) {
    const lat = Number(p.lat);
    const lng = Number(p.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    pins.push({
      kind: 'agrotienda',
      id: String(p.id),
      lat,
      lng,
      title: String(p.nombre ?? 'Agrotienda'),
    });
  }
  return pins;
}

/**
 * Filtro nacional por estado: prioriza `ubicacion_estado`; si la fila aún no lo tiene, cae a `estado_ve`.
 * Valores con comillas escapadas para PostgREST.
 */
function filtroOrUbicacionNacional(valorEstado: string): string {
  const v = valorEstado.replace(/"/g, '""');
  return `ubicacion_estado.eq."${v}",and(ubicacion_estado.is.null,estado_ve.eq."${v}")`;
}

/** Cosechas mercado con finca (coords) y perfil (trust). */
export async function listarCosechasMercado(params: {
  /** Filtro principal (segmentación nacional). */
  ubicacionEstado?: string;
  /** @deprecated Preferir `ubicacionEstado`; se combina con el mismo criterio OR si solo pasas este. */
  estadoVe?: string;
  rubro?: string;
  busqueda?: string;
  topTrustOnly?: boolean;
}): Promise<Cosecha[]> {
  let q = supabase
    .from('cosechas')
    .select(
      '*, perfil:perfiles!agricultor_id(nombre, reputacion, avatar_url, trust_score), finca:fincas!finca_id(coordenadas, nombre)',
    )
    .eq('estado', 'publicada')
    .order('publicado_en', { ascending: false })
    .limit(60);

  const segmento = (params.ubicacionEstado ?? params.estadoVe)?.trim();
  if (segmento && segmento !== 'Todos') {
    q = q.or(filtroOrUbicacionNacional(segmento));
  }

  if (params.rubro && params.rubro !== 'Todos') q = q.eq('rubro', params.rubro);
  if (params.busqueda?.trim()) q = q.ilike('rubro', `%${params.busqueda.trim()}%`);

  const { data, error } = await q;
  if (error) throw error;
  let rows = (data ?? []) as Cosecha[];
  if (params.topTrustOnly) {
    rows = rows.filter((r) => {
      const ts = (r.perfil as { trust_score?: number } | undefined)?.trust_score;
      return typeof ts === 'number' && ts >= 70;
    });
  }
  return rows;
}

/**
 * Alternar favorito de un insumo para el comprador.
 * Retorna true si fue añadido, false si fue eliminado.
 */
export async function toggleInsumeFavorito(insumoId: string, buyerId: string): Promise<boolean> {
  // Ver si ya existe
  const { data: existing } = await supabase
    .from('buyer_insumos_favoritos')
    .select('id')
    .eq('buyer_id', buyerId)
    .eq('insumo_id', insumoId)
    .maybeSingle();

  if (existing) {
    await supabase
      .from('buyer_insumos_favoritos')
      .delete()
      .eq('buyer_id', buyerId)
      .eq('insumo_id', insumoId);
    return false;
  }

  await supabase
    .from('buyer_insumos_favoritos')
    .insert({ buyer_id: buyerId, insumo_id: insumoId });
  return true;
}

/** Lista los insumos marcados como favorito por el comprador */
export async function listarInsumosFavoritos(buyerId: string) {
  const { data, error } = await supabase
    .from('buyer_insumos_favoritos')
    .select('insumo_id, creado_en, agricultural_inputs!buyer_insumos_favoritos_insumo_id_fkey(*)')
    .eq('buyer_id', buyerId)
    .order('creado_en', { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => {
    const insumo = Array.isArray(r.agricultural_inputs) ? r.agricultural_inputs[0] : r.agricultural_inputs;
    return insumo as import('@/shared/types').AgriculturalInput;
  }).filter(Boolean);
}

/** Verifica si una lista de insumo IDs están en favoritos del comprador */
export async function obtenerFavoritosIds(buyerId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('buyer_insumos_favoritos')
    .select('insumo_id')
    .eq('buyer_id', buyerId)
    .limit(500);
  if (error) return new Set();
  return new Set((data ?? []).map((r) => String(r.insumo_id)));
}
