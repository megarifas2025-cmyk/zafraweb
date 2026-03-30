import { supabase } from '@/shared/lib/supabase';
import type { RatingEntry } from '@/shared/types';

export async function calificarCompradorDesdeSala(input: {
  salaId: string;
  puntaje: number;
  comentario?: string | null;
}): Promise<void> {
  const { error } = await supabase.rpc('rate_buyer_from_chat', {
    p_sala: input.salaId,
    p_puntaje: input.puntaje,
    p_comentario: input.comentario?.trim() || null,
  });
  if (error) throw error;
}

/** Calificar al transportista tras un flete completado */
export async function calificarTransportistaDesdeFreight(input: {
  freightId: string;
  puntaje: number;
  comentario?: string | null;
}): Promise<void> {
  const { error } = await supabase.rpc('rate_transporter_from_freight', {
    p_freight_id: input.freightId,
    p_puntaje: input.puntaje,
    p_comentario: input.comentario?.trim() || null,
  });
  if (error) throw error;
}

/** Promedio y total de calificaciones recibidas por un usuario */
export async function obtenerPromedioCalificaciones(
  userId: string,
): Promise<{ promedio: number; total: number }> {
  const { data, error } = await supabase.rpc('obtener_promedio_calificaciones', {
    p_user_id: userId,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return {
    promedio: row ? Number((row as Record<string, unknown>).promedio ?? 0) : 0,
    total: row ? Number((row as Record<string, unknown>).total ?? 0) : 0,
  };
}

export async function listarCalificacionesRecibidas(userId: string, limit = 10): Promise<RatingEntry[]> {
  const { data, error } = await supabase
    .from('calificaciones')
    .select('id, evaluador_id, evaluado_id, cosecha_id, puntaje, comentario, creado_en, evaluador:perfiles!evaluador_id(nombre, avatar_url)')
    .eq('evaluado_id', userId)
    .order('creado_en', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => {
    const evaluadorRaw = Array.isArray(row.evaluador) ? row.evaluador[0] : row.evaluador;
    return {
      id: String(row.id),
      evaluador_id: String(row.evaluador_id),
      evaluado_id: String(row.evaluado_id),
      cosecha_id: row.cosecha_id ? String(row.cosecha_id) : null,
      puntaje: Number(row.puntaje ?? 0),
      comentario: row.comentario ? String(row.comentario) : null,
      creado_en: String(row.creado_en),
      evaluador:
        evaluadorRaw && typeof evaluadorRaw === 'object'
          ? {
              nombre: String((evaluadorRaw as Record<string, unknown>).nombre ?? 'Vendedor'),
              avatar_url: (evaluadorRaw as Record<string, unknown>).avatar_url
                ? String((evaluadorRaw as Record<string, unknown>).avatar_url)
                : null,
            }
          : null,
    } satisfies RatingEntry;
  });
}
