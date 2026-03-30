import { supabase } from '@/shared/lib/supabase';
import { mensajeSupabaseConPista } from '@/shared/lib/supabaseErrors';
import type { AgriculturalInput, CategoriaInsumo, LineaCatalogoAgrotienda } from '@/shared/types';

const selectCatalogo =
  'id, perfil_id, nombre_producto, linea_catalogo, categoria, subcategoria, descripcion, imagen_url, disponibilidad, stock_actual, creado_en, actualizado_en';
const INSUMOS_CATALOGO_LOAD_MS = 4_000;

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

export type ListarInsumosOptions = {
  /** Si se indica, lista el catálogo de esa tienda (todas las filas, incl. no disponibles). Si no, solo insumos disponibles en mercado. */
  perfilPropietarioId?: string;
  lineaCatalogo?: LineaCatalogoAgrotienda | 'todos';
  search?: string;
};

/**
 * Catálogo: sin `perfilPropietarioId`, insumos con `disponibilidad = true` (mercado).
 * Con `perfilPropietarioId`, todo el inventario de esa agrotienda (gestión).
 */
export async function listarInsumosDisponibles(limit = 40, options?: ListarInsumosOptions): Promise<AgriculturalInput[]> {
  let q = supabase
    .from('agricultural_inputs')
    .select(selectCatalogo)
    .order('actualizado_en', { ascending: false })
    .limit(limit);

  if (options?.perfilPropietarioId) {
    q = q.eq('perfil_id', options.perfilPropietarioId);
  } else {
    q = q.eq('disponibilidad', true);
  }

  if (options?.lineaCatalogo && options.lineaCatalogo !== 'todos') {
    q = q.eq('linea_catalogo', options.lineaCatalogo);
  }

  const term = options?.search?.trim();
  if (term) {
    q = q.or(`nombre_producto.ilike.%${term}%,subcategoria.ilike.%${term}%,descripcion.ilike.%${term}%`);
  }

  const { data, error } = await withTimeout(
    q.then(({ data: d, error: e }) => ({ data: d as AgriculturalInput[] | null, error: e as { message?: string } | null })),
    { data: [] as AgriculturalInput[], error: null as { message?: string } | null },
    INSUMOS_CATALOGO_LOAD_MS,
  );
  if (error) throw new Error(error.message ?? 'Error al cargar insumos');
  return (data ?? []) as AgriculturalInput[];
}

export interface InsertarInsumoPayload {
  perfil_id: string;
  nombre_producto: string;
  linea_catalogo: LineaCatalogoAgrotienda;
  categoria: CategoriaInsumo;
  subcategoria?: string | null;
  descripcion: string | null;
  precio: number | null;
  disponibilidad: boolean;
  /** Unidades iniciales en inventario. NULL = sin control de stock. */
  stock_actual?: number | null;
}

export async function insertarInsumoAgrotienda(payload: InsertarInsumoPayload): Promise<AgriculturalInput> {
  const { data, error } = await supabase
    .from('agricultural_inputs')
    .insert({
      perfil_id: payload.perfil_id,
      nombre_producto: payload.nombre_producto.trim(),
      linea_catalogo: payload.linea_catalogo,
      categoria: payload.categoria,
      subcategoria: payload.subcategoria?.trim() || null,
      descripcion: payload.descripcion?.trim() || null,
      precio: payload.precio,
      disponibilidad: payload.disponibilidad,
      stock_actual: payload.stock_actual ?? null,
    })
    .select(selectCatalogo)
    .single();
  if (error) throw error;
  return data as AgriculturalInput;
}

export async function buscarInsumosPorCategoria(categoria: CategoriaInsumo, limit = 30): Promise<AgriculturalInput[]> {
  const { data, error } = await supabase
    .from('agricultural_inputs')
    .select(selectCatalogo)
    .eq('disponibilidad', true)
    .eq('categoria', categoria)
    .order('nombre_producto', { ascending: true })
    .limit(limit);
  if (error) throw new Error(mensajeSupabaseConPista(error));
  return (data ?? []) as AgriculturalInput[];
}

export async function buscarInsumosPorLinea(lineaCatalogo: LineaCatalogoAgrotienda, limit = 40): Promise<AgriculturalInput[]> {
  const { data, error } = await supabase
    .from('agricultural_inputs')
    .select(selectCatalogo)
    .eq('disponibilidad', true)
    .eq('linea_catalogo', lineaCatalogo)
    .order('nombre_producto', { ascending: true })
    .limit(limit);
  if (error) throw new Error(mensajeSupabaseConPista(error));
  return (data ?? []) as AgriculturalInput[];
}

/**
 * Coincidencias por nombre (búsqueda texto). Misma política RLS que el listado nacional.
 */
export async function buscarInsumosPorNombreTexto(term: string): Promise<AgriculturalInput[]> {
  const q = term.trim();
  if (q.length < 2) return [];
  const { data, error } = await supabase
    .from('agricultural_inputs')
    .select(selectCatalogo)
    .eq('disponibilidad', true)
    .ilike('nombre_producto', `%${q}%`)
    .limit(25);
  if (error) throw new Error(mensajeSupabaseConPista(error));
  return (data ?? []) as AgriculturalInput[];
}

/**
 * Actualiza el stock de un insumo. Solo puede hacerlo el dueño.
 * Si el nuevo valor es 0, el trigger de BD lo marcará como no disponible.
 */
export async function actualizarStockInsumo(insumoId: string, nuevoStock: number | null): Promise<void> {
  const { error } = await supabase
    .from('agricultural_inputs')
    .update({ stock_actual: nuevoStock, actualizado_en: new Date().toISOString() })
    .eq('id', insumoId);
  if (error) throw new Error(mensajeSupabaseConPista(error));
}

/**
 * Descuenta unidades del inventario usando la RPC segura del lado del servidor.
 * Lanza error si no hay stock suficiente o el usuario no es el dueño.
 */
export async function decrementarStockInsumo(
  insumoId: string,
  cantidad = 1,
): Promise<{ stock_restante: number; disponible: boolean }> {
  const { data, error } = await supabase.rpc('decrementar_stock_insumo', {
    p_insumo_id: insumoId,
    p_cantidad: cantidad,
  });
  if (error) throw new Error(mensajeSupabaseConPista(error));
  const row = Array.isArray(data) ? data[0] : data;
  return { stock_restante: row?.stock_restante ?? 0, disponible: row?.disponible ?? false };
}
