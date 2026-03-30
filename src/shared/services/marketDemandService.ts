/**
 * Demandas de compra (mercado de bienes). La logística de carga no debe usar este módulo:
 * los transportistas operan vía `freightRequestsService` / pizarra de fletes.
 */
import { supabase } from '@/shared/lib/supabase';
import type { RequerimientoCompraInsert, RequerimientoCompraRow, RequerimientoCompraUpdate } from '@/shared/types/database.types';

export type RequerimientoCompra = RequerimientoCompraRow;

/** Valores exactos en `requerimientos_compra.categoria_destino` (enrutamiento a perfil). */
export const CATEGORIA_DESTINO_REQUERIMIENTO = {
  insumosMaquinaria: 'Insumos y Maquinaria',
  cosechaGranel: 'Cosecha a Granel',
  volumenProcesadoSilos: 'Volumen Procesado / Silos',
} as const;

export type CategoriaDestinoRequerimiento =
  (typeof CATEGORIA_DESTINO_REQUERIMIENTO)[keyof typeof CATEGORIA_DESTINO_REQUERIMIENTO];

const selectBase =
  'id, comprador_id, rubro, cantidad, precio_estimado, ubicacion_estado, fecha_limite, categoria_destino, creado_en';
const REQUERIMIENTOS_LOAD_MS = 4_000;

async function withTimeout<T>(promise: PromiseLike<T>, fallback: T, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms);
  });
  try {
    return await Promise.race([Promise.resolve(promise), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function crearRequerimientoCompra(
  payload: Omit<RequerimientoCompraInsert, 'comprador_id'> & { comprador_id?: string },
): Promise<RequerimientoCompra> {
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr) throw userErr;
  const uid = userData.user?.id;
  if (!uid) throw new Error('Sesión requerida.');

  const row: RequerimientoCompraInsert = {
    comprador_id: payload.comprador_id ?? uid,
    rubro: payload.rubro,
    cantidad: payload.cantidad,
    precio_estimado: payload.precio_estimado ?? null,
    ubicacion_estado: payload.ubicacion_estado,
    fecha_limite: payload.fecha_limite,
    categoria_destino: payload.categoria_destino,
  };

  const { data, error } = await supabase.from('requerimientos_compra').insert(row).select(selectBase).single();
  if (error) throw error;
  return data as RequerimientoCompra;
}

export async function obtenerRequerimientoCompra(id: string): Promise<RequerimientoCompra | null> {
  const { data, error } = await supabase.from('requerimientos_compra').select(selectBase).eq('id', id).maybeSingle();
  if (error) throw error;
  return (data ?? null) as RequerimientoCompra | null;
}

export interface ListarRequerimientosParams {
  /** Filtra por estado (segmentación nacional). Omitir o `'Todos'` = sin filtro. */
  ubicacionEstado?: string;
  /** Filtra por `categoria_destino` (enrutamiento comercial). Omitir o `'Todos'` = sin filtro. */
  categoriaDestino?: string;
  rubro?: string;
  compradorId?: string;
  limit?: number;
}

/**
 * Lista demandas de compra visibles por RLS.
 * Las altas propias pueden venir de compradores o productores independientes.
 */
export async function listarRequerimientosCompra(params: ListarRequerimientosParams = {}): Promise<RequerimientoCompra[]> {
  let q = supabase.from('requerimientos_compra').select(selectBase).order('creado_en', { ascending: false });

  const limit = params.limit ?? 80;
  q = q.limit(limit);

  if (params.compradorId) q = q.eq('comprador_id', params.compradorId);

  const ubi = params.ubicacionEstado?.trim();
  if (ubi && ubi !== 'Todos') q = q.eq('ubicacion_estado', ubi);

  const cat = params.categoriaDestino?.trim();
  if (cat && cat !== 'Todos') q = q.eq('categoria_destino', cat);

  if (params.rubro && params.rubro !== 'Todos') q = q.eq('rubro', params.rubro);

  const { data, error } = await withTimeout(
    q.then(({ data: d, error: e }) => ({ data: d as RequerimientoCompraRow[] | null, error: e as { message?: string } | null })),
    { data: [] as RequerimientoCompraRow[], error: null as { message?: string } | null },
    REQUERIMIENTOS_LOAD_MS,
  );
  if (error) throw error;
  return (data ?? []) as RequerimientoCompra[];
}

export async function actualizarRequerimientoCompra(
  id: string,
  patch: RequerimientoCompraUpdate,
): Promise<RequerimientoCompra> {
  const { data, error } = await supabase.from('requerimientos_compra').update(patch).eq('id', id).select(selectBase).single();
  if (error) throw error;
  return data as RequerimientoCompra;
}

export async function eliminarRequerimientoCompra(id: string): Promise<void> {
  const { error } = await supabase.from('requerimientos_compra').delete().eq('id', id);
  if (error) throw error;
}
