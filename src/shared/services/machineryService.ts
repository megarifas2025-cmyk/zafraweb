import { supabase } from '@/shared/lib/supabase';

export type MachineryTipo = 'Tractor' | 'Cosechadora' | 'Rastra' | 'Sembradora' | 'Otro';
export type MachineryEstatus = 'available' | 'rented' | 'paused';

export interface MachineryRentalRow {
  id: string;
  owner_id: string;
  tipo_maquina: MachineryTipo;
  marca_modelo: string;
  precio_referencial_hectarea: number | null;
  /** Postgres daterange text, ej. [2026-01-01,2026-07-01) */
  disponibilidad_fechas?: string | null;
  /** Legado (antes de migrate-machinery-daterange-upgrade.sql) */
  disponibilidad_inicio?: string;
  disponibilidad_fin?: string;
  estatus: MachineryEstatus;
  ubicacion_lat?: number | null;
  ubicacion_lng?: number | null;
  ubicacion_gps?: unknown;
}

/**
 * Construye daterange Postgres `[desde, hastaExclusivo)`:
 * la fecha "hasta" del formulario es inclusive; el upper bound se guarda como día siguiente.
 */
export function formatDisponibilidadFechas(isoDesde: string, isoHastaInclusive: string): string {
  const a = isoDesde.trim().slice(0, 10);
  const p = isoHastaInclusive.trim().slice(0, 10).split('-').map(Number);
  const y = p[0] ?? 0;
  const mo = p[1] ?? 1;
  const da = p[2] ?? 1;
  const endExcl = new Date(y, mo - 1, da + 1);
  const b = `${endExcl.getFullYear()}-${String(endExcl.getMonth() + 1).padStart(2, '0')}-${String(endExcl.getDate()).padStart(2, '0')}`;
  return `[${a},${b})`;
}

export function textoRangoDisponibilidad(row: MachineryRentalRow): string {
  const raw = row.disponibilidad_fechas?.trim();
  if (!raw) {
    if (row.disponibilidad_inicio && row.disponibilidad_fin) return `${row.disponibilidad_inicio} → ${row.disponibilidad_fin}`;
    return '—';
  }
  const m = raw.match(/\[(\d{4}-\d{2}-\d{2}),\s*(\d{4}-\d{2}-\d{2})[)\]]/);
  if (!m) return raw.replace(',', ' → ');
  const low = m[1];
  let high = m[2];
  if (raw.trimEnd().endsWith(')')) {
    const [yy, mm, dd] = high.split('-').map(Number);
    const d = new Date(yy ?? 0, (mm ?? 1) - 1, (dd ?? 1) - 1);
    high = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  return `${low} → ${high}`;
}

const R = 6371;

export function distanciaKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const toR = (d: number) => (d * Math.PI) / 180;
  const dLat = toR(lat2 - lat1);
  const dLng = toR(lng2 - lng1);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toR(lat1)) * Math.cos(toR(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
}

export function ordenarFiltrarPorCercania(
  rows: MachineryRentalRow[],
  origen: { lat: number; lng: number },
  maxKm: number,
): { row: MachineryRentalRow; km: number }[] {
  const withD = rows
    .map(row => {
      const lat = row.ubicacion_lat;
      const lng = row.ubicacion_lng;
      if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      const km = distanciaKm(origen.lat, origen.lng, lat, lng);
      if (km > maxKm) return null;
      return { row, km };
    })
    .filter((x): x is { row: MachineryRentalRow; km: number } => x != null);
  withD.sort((a, b) => a.km - b.km);
  return withD;
}

/** Texto legible para errores de Supabase en pantalla Maquinaria. */
export function mensajeErrorMaquinaria(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = String((error as { code?: string }).code ?? '');
    const msg = String((error as { message?: string }).message ?? '');
    if (code === '42P01' || msg.includes('does not exist') || msg.includes('no existe la relación')) {
      return 'La tabla machinery_rentals no está en tu proyecto Supabase. Ejecuta en SQL Editor el bloque de maquinaria de database/migrate-producer-master-panel.sql (o SUPABASE-TODO-EN-UNO.sql) y vuelve a intentar.';
    }
    if (code === '42501' || msg.toLowerCase().includes('permission denied') || msg.toLowerCase().includes('rls')) {
      return 'Permiso denegado (RLS). Inicia sesión como productor y verifica que tu perfil siga activo para ver el listado público.';
    }
    if (msg) return msg;
  }
  if (error instanceof Error) return error.message;
  return 'Error al operar con maquinaria.';
}

export async function listarMaquinariaDisponible(): Promise<MachineryRentalRow[]> {
  const { data, error } = await supabase
    .from('machinery_rentals')
    .select(
      'id, owner_id, tipo_maquina, marca_modelo, precio_referencial_hectarea, disponibilidad_fechas, estatus, ubicacion_lat, ubicacion_lng, creado_en',
    )
    .eq('estatus', 'available')
    .order('creado_en', { ascending: false });
  if (error) throw error;
  return (data ?? []) as MachineryRentalRow[];
}

export async function listarMiMaquinaria(ownerId: string): Promise<MachineryRentalRow[]> {
  const { data, error } = await supabase
    .from('machinery_rentals')
    .select(
      'id, owner_id, tipo_maquina, marca_modelo, precio_referencial_hectarea, disponibilidad_fechas, estatus, ubicacion_lat, ubicacion_lng, creado_en',
    )
    .eq('owner_id', ownerId)
    .order('creado_en', { ascending: false });
  if (error) throw error;
  return (data ?? []) as MachineryRentalRow[];
}

export async function publicarMaquinaria(input: {
  ownerId: string;
  tipo: MachineryTipo;
  marcaModelo: string;
  inicio: string;
  fin: string;
  lat?: number | null;
  lng?: number | null;
}): Promise<void> {
  const body: Record<string, unknown> = {
    owner_id: input.ownerId,
    tipo_maquina: input.tipo,
    marca_modelo: input.marcaModelo.trim(),
    precio_referencial_hectarea: null,
    disponibilidad_fechas: formatDisponibilidadFechas(input.inicio, input.fin),
    estatus: 'available',
  };
  /** Coordenadas en columnas numéricas (evita EWKT/PostGIS en el cliente; el trigger solo rellena desde ubicacion_gps). */
  if (input.lat != null && input.lng != null) {
    body.ubicacion_lat = input.lat;
    body.ubicacion_lng = input.lng;
  }
  const { error } = await supabase.from('machinery_rentals').insert(body);
  if (error) throw error;
}

/** El dueño marca su maquinaria como rentada desde el chat de negociación. */
export async function marcarMaquinariaRentada(listingId: string): Promise<void> {
  const { error } = await supabase.rpc('marcar_maquinaria_rentada', { p_listing_id: listingId });
  if (error) throw new Error(mensajeErrorMaquinaria(error));
}
