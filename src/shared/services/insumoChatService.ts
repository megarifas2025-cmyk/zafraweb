import { supabase } from '@/shared/lib/supabase';
import type { SalaInsumosChat, MensajeInsumosChat } from '@/shared/types';

function serializeErr(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message);
  return 'Error desconocido';
}

/**
 * Comprador inicia (o retoma) una sala de consulta sobre un insumo.
 * Si ya existe una sala para este par buyer+insumo, devuelve el id existente.
 */
export async function iniciarChatInsumo(insumoId: string): Promise<string> {
  const { data, error } = await supabase.rpc('iniciar_chat_insumo', {
    p_insumo_id: insumoId,
  });
  if (error) throw new Error(serializeErr(error));
  return String(data);
}

/**
 * Vendedor propone cerrar el trato (primer paso del acuerdo mutuo).
 * El comprador deberá aceptar con confirmarVentaInsumo.
 */
export async function vendedorProponerCierreInsumo(salaId: string): Promise<void> {
  const { error } = await supabase.rpc('vendedor_proponer_cierre_insumo', {
    p_sala_id: salaId,
  });
  if (error) throw new Error(serializeErr(error));
}

/**
 * Comprador confirma la compra (segundo paso del acuerdo mutuo).
 * Requiere que vendedor_propuso sea TRUE.
 */
export async function confirmarVentaInsumo(salaId: string): Promise<void> {
  const { error } = await supabase.rpc('confirmar_venta_insumo', {
    p_sala_id: salaId,
  });
  if (error) throw new Error(serializeErr(error));
}

/**
 * Cuenta mensajes de insumos recibidos (no propios) en salas donde el usuario participa.
 * Usado para el badge de notificaciones no leídas.
 */
export async function contarMensajesInsumoNoLeidos(perfilId: string): Promise<number> {
  const { count, error } = await supabase
    .from('mensajes_insumos_chat')
    .select('*', { count: 'exact', head: true })
    .neq('autor_id', perfilId)
    .gte('creado_en', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());
  if (error) return 0;
  return count ?? 0;
}

/**
 * Mensajes de una sala de insumo, ordenados cronológicamente.
 */
export async function listarMensajesInsumo(salaId: string): Promise<MensajeInsumosChat[]> {
  const { data, error } = await supabase
    .from('mensajes_insumos_chat')
    .select('id, sala_id, autor_id, contenido, tipo, media_url, creado_en')
    .eq('sala_id', salaId)
    .order('creado_en', { ascending: true })
    .limit(300);
  if (error) throw new Error(serializeErr(error));
  return (data ?? []) as MensajeInsumosChat[];
}

/**
 * Enviar mensaje de texto en una sala de insumo.
 * Retorna el id del mensaje creado o null si hubo error silencioso.
 */
export async function enviarMensajeInsumo(
  salaId: string,
  autorId: string,
  contenido: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('mensajes_insumos_chat')
    .insert({ sala_id: salaId, autor_id: autorId, contenido: contenido.trim(), tipo: 'texto' })
    .select('id')
    .single();
  if (error) throw new Error(serializeErr(error));
  return data?.id ?? null;
}

/**
 * Enviar imagen en una sala de insumo.
 */
export async function enviarImagenInsumo(
  salaId: string,
  autorId: string,
  mediaUrl: string,
  caption?: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('mensajes_insumos_chat')
    .insert({
      sala_id:   salaId,
      autor_id:  autorId,
      contenido: caption?.trim() || null,
      tipo:      'imagen',
      media_url: mediaUrl,
    })
    .select('id')
    .single();
  if (error) throw new Error(serializeErr(error));
  return data?.id ?? null;
}

/**
 * Salas del comprador (para ver sus conversaciones con agrotiendas).
 */
export async function listarSalasComprador(buyerId: string): Promise<SalaInsumosChat[]> {
  const { data, error } = await supabase
    .from('salas_insumos_chat')
    .select(
      `id, insumo_id, buyer_id, vendedor_id, venta_confirmada, confirmada_en, creado_en,
       insumo:agricultural_inputs!salas_insumos_chat_insumo_id_fkey(id, nombre_producto, categoria, linea_catalogo)`,
    )
    .eq('buyer_id', buyerId)
    .order('creado_en', { ascending: false })
    .limit(100);
  if (error) {
    // Fallback sin join si la FK no tiene ese nombre
    const { data: d2, error: e2 } = await supabase
      .from('salas_insumos_chat')
      .select('id, insumo_id, buyer_id, vendedor_id, venta_confirmada, confirmada_en, creado_en')
      .eq('buyer_id', buyerId)
      .order('creado_en', { ascending: false })
      .limit(100);
    if (e2) throw new Error(serializeErr(e2));
    return (d2 ?? []) as SalaInsumosChat[];
  }
  return (data ?? []) as unknown as SalaInsumosChat[];
}

/**
 * Salas del vendedor con info del comprador y último mensaje (usa RPC).
 */
export async function listarSalasVendedor(vendedorId: string): Promise<SalaInsumosChat[]> {
  const { data, error } = await supabase.rpc('listar_salas_insumos_vendedor', {
    p_vendedor_id: vendedorId,
  });
  if (error) {
    // Fallback directo si la RPC no existe aún
    const { data: d2, error: e2 } = await supabase
      .from('salas_insumos_chat')
      .select('id, insumo_id, buyer_id, vendedor_id, venta_confirmada, confirmada_en, creado_en')
      .eq('vendedor_id', vendedorId)
      .order('creado_en', { ascending: false })
      .limit(100);
    if (e2) throw new Error(serializeErr(e2));
    return (d2 ?? []) as SalaInsumosChat[];
  }
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    id:               String(r.sala_id),
    insumo_id:        String(r.insumo_id),
    buyer_id:         String(r.buyer_id),
    vendedor_id:      vendedorId,
    venta_confirmada: Boolean(r.venta_confirmada),
    confirmada_en:    r.confirmada_en ? String(r.confirmada_en) : null,
    creado_en:        String(r.creado_en),
    buyer_nombre:     r.buyer_nombre ? String(r.buyer_nombre) : null,
    insumo:           { id: String(r.insumo_id), nombre_producto: String(r.nombre_producto ?? ''), categoria: 'semillas' as import('@/shared/types').CategoriaInsumo, linea_catalogo: null },
    ultimo_mensaje:   r.ultimo_mensaje ? String(r.ultimo_mensaje) : null,
    ultimo_mensaje_en: r.ultimo_mensaje_en ? String(r.ultimo_mensaje_en) : null,
  })) as SalaInsumosChat[];
}

/**
 * Metadatos de una sala: para saber si la venta está confirmada y quiénes participan.
 */
export async function obtenerMetadatasSalaInsumo(salaId: string): Promise<{
  buyer_id: string;
  vendedor_id: string;
  venta_confirmada: boolean;
  vendedor_propuso: boolean;
  nombre_producto: string | null;
} | null> {
  const { data, error } = await supabase
    .from('salas_insumos_chat')
    .select(
      `buyer_id, vendedor_id, venta_confirmada, vendedor_propuso,
       insumo:agricultural_inputs!salas_insumos_chat_insumo_id_fkey(nombre_producto)`,
    )
    .eq('id', salaId)
    .maybeSingle();
  if (error) throw new Error(serializeErr(error));
  if (!data) return null;
  const insumoRaw = data.insumo as { nombre_producto?: string } | { nombre_producto?: string }[] | null;
  const insumo = Array.isArray(insumoRaw) ? insumoRaw[0] : insumoRaw;
  return {
    buyer_id:         String(data.buyer_id),
    vendedor_id:      String(data.vendedor_id),
    venta_confirmada: Boolean(data.venta_confirmada),
    vendedor_propuso: Boolean((data as unknown as { vendedor_propuso?: boolean }).vendedor_propuso),
    nombre_producto:  insumo?.nombre_producto ?? null,
  };
}
