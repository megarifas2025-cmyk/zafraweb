import { supabase } from '@/shared/lib/supabase';
import type { InsumoRecomendado } from '@/shared/types';

export interface InsumoAgregado {
  nombre: string;
  veces: number;
  detalle_dosis: string[];
}

const INSUMOS_LOAD_MS = 4_000;

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

/** Insumos validados en field_inspections del productor (synced/approved). */
export async function listarInsumosAprobadosAgregados(productorId: string): Promise<InsumoAgregado[]> {
  const { data, error } = await withTimeout(
    supabase
      .from('field_inspections')
      .select('id, insumos_recomendados, fecha_programada, numero_control')
      .eq('productor_id', productorId)
      .in('estatus', ['synced', 'approved'])
      .then(({ data: d, error: e }) => ({ data: d, error: e as { message?: string } | null })),
    { data: [], error: null as { message?: string } | null },
    INSUMOS_LOAD_MS,
  );
  if (error) throw error;

  const map = new Map<string, { veces: number; dosis: Set<string> }>();
  for (const row of data ?? []) {
    const raw = row.insumos_recomendados;
    const arr: InsumoRecomendado[] = Array.isArray(raw) ? raw : [];
    for (const it of arr) {
      const n = (it.nombre ?? 'Sin nombre').trim() || 'Sin nombre';
      const cur = map.get(n) ?? { veces: 0, dosis: new Set<string>() };
      cur.veces += 1;
      if (it.dosis?.trim()) cur.dosis.add(it.dosis.trim());
      map.set(n, cur);
    }
  }

  return [...map.entries()]
    .map(([nombre, v]) => ({
      nombre,
      veces: v.veces,
      detalle_dosis: [...v.dosis],
    }))
    .sort((a, b) => b.veces - a.veces || a.nombre.localeCompare(b.nombre, 'es'));
}
