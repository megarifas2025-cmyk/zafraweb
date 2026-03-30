import { supabase } from '@/shared/lib/supabase';
import type { Mensaje, SalaChat } from '@/shared/types';

const PLAIN_NONCE = '__plain__';

function textoMostrable(m: Mensaje): string {
  if (!m.nonce || m.nonce === PLAIN_NONCE) return m.contenido;
  return 'Mensaje cifrado de una versión anterior';
}

/** Para UI: mismo mapeo que `obtenerMensajes` (suscripciones / append optimista). */
export function mensajeConTexto(m: Mensaje): Mensaje & { texto: string } {
  return { ...m, texto: textoMostrable(m) };
}

export const chatService = {
  async crearSala(compradorId: string, agricultorId: string, cosechaId?: string): Promise<SalaChat> {
    if (cosechaId) {
      const { data: existente, error } = await supabase
        .from('salas_chat')
        .select('*')
        .eq('cosecha_id', cosechaId)
        .eq('comprador_id', compradorId)
        .maybeSingle();
      if (error) throw error;
      if (existente) return existente as SalaChat;
    }
    const { data, error } = await supabase.from('salas_chat').insert({ comprador_id: compradorId, agricultor_id: agricultorId, cosecha_id: cosechaId ?? null }).select().single();
    if (error) throw error;
    return data as SalaChat;
  },
  /** Devuelve el id del mensaje insertado (RPC `send_market_chat_message` retorna uuid). */
  async enviarMensaje(salaId: string, autorId: string, texto: string): Promise<string | null> {
    const text = texto.trim();
    if (!text) return null;
    const { data, error } = await supabase.rpc('send_market_chat_message', {
      p_sala_id: salaId,
      p_contenido: text,
      p_tipo: 'texto',
      p_media_url: null,
    });
    if (error) throw error;
    return data != null ? String(data) : null;
  },
  async enviarImagen(salaId: string, mediaUrl: string, caption = ''): Promise<string | null> {
    const { data, error } = await supabase.rpc('send_market_chat_message', {
      p_sala_id: salaId,
      p_contenido: caption.trim(),
      p_tipo: 'imagen',
      p_media_url: mediaUrl,
    });
    if (error) throw error;
    return data != null ? String(data) : null;
  },
  async obtenerMensajes(salaId: string): Promise<Array<Mensaje & { texto: string }>> {
    const { data, error } = await supabase
      .from('mensajes')
      .select('id, sala_id, autor_id, contenido, nonce, tipo, media_url, leido, creado_en')
      .eq('sala_id', salaId)
      .order('creado_en', { ascending: true });
    if (error) throw error;
    return (data as Mensaje[]).map(mensajeConTexto);
  },
  async obtenerSalas(perfilId: string): Promise<SalaChat[]> {
    const { data, error } = await supabase
      .from('salas_chat')
      .select('*, cosecha:cosechas(rubro,cantidad_kg,estado_ve), comprador:perfiles!comprador_id(nombre,avatar_url), agricultor:perfiles!agricultor_id(nombre,avatar_url)')
      .or(`comprador_id.eq.${perfilId},agricultor_id.eq.${perfilId}`)
      .eq('cerrada', false)
      .order('creado_en', { ascending: false });
    if (error) throw error;
    return (data ?? []) as SalaChat[];
  },
  /** Devuelve el canal para poder hacer `supabase.removeChannel(channel)` al desmontar. */
  suscribir(salaId: string, onMensaje: (m: Mensaje) => void) {
    const channel = supabase
      .channel(`chat-${salaId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mensajes', filter: `sala_id=eq.${salaId}` }, (p) =>
        onMensaje(p.new as Mensaje),
      );
    channel.subscribe();
    return channel;
  },
  async marcarLeidos(salaId: string, perfilId: string) {
    const { error } = await supabase
      .from('mensajes')
      .update({ leido: true })
      .eq('sala_id', salaId)
      .neq('autor_id', perfilId);
    if (error) throw error;
  },
  async cerrarTrato(salaId: string, precio: number, moneda = 'USD') {
    const { data, error } = await supabase.rpc('cerrar_trato', { p_sala: salaId, p_precio: precio, p_moneda: moneda });
    if (error) throw error;
    return data as Array<{ transportista_id: string; nombre: string; distancia_km: number }>;
  },
};

/** Mensajes de otros en salas donde participo, aún no leídos (RLS limita a mis salas). */
export async function contarMensajesMercadoNoLeidos(perfilId: string): Promise<number> {
  const { count, error } = await supabase
    .from('mensajes')
    .select('*', { count: 'exact', head: true })
    .eq('leido', false)
    .neq('autor_id', perfilId);
  if (error) {
    console.warn('[chatService] contarMensajesMercadoNoLeidos:', error.message);
    return 0;
  }
  return count ?? 0;
}

export type ChatMercadoNotificacion = {
  id: string;
  sala_id: string;
  titulo: string;
  cuerpo: string;
  creado_en: string;
  leida: boolean;
};

/** Resumen para el centro de notificaciones (sin join pesado). */
export async function listarNotificacionesChatMercado(perfilId: string, limit = 8): Promise<ChatMercadoNotificacion[]> {
  const { data, error } = await supabase
    .from('mensajes')
    .select('id, sala_id, contenido, creado_en')
    .eq('leido', false)
    .neq('autor_id', perfilId)
    .order('creado_en', { ascending: false })
    .limit(limit);
  if (error || !data?.length) return [];
  return data.map((m) => ({
    id: m.id as string,
    sala_id: m.sala_id as string,
    titulo: 'Nuevo mensaje en negociación',
    cuerpo: String(m.contenido ?? '').trim().slice(0, 200) || '(sin texto)',
    creado_en: String(m.creado_en ?? ''),
    leida: false,
  }));
}

/** Marca como leídos todos los mensajes recibidos (no propios) en salas del usuario. */
export async function marcarTodosMensajesMercadoLeidos(perfilId: string): Promise<void> {
  const { error } = await supabase
    .from('mensajes')
    .update({ leido: true })
    .eq('leido', false)
    .neq('autor_id', perfilId);
  if (error) throw error;
}

/** Conteo por sala para badge en lista de chats. */
export async function contarMensajesNoLeidosPorSala(perfilId: string): Promise<Record<string, number>> {
  const { data, error } = await supabase
    .from('mensajes')
    .select('sala_id')
    .eq('leido', false)
    .neq('autor_id', perfilId)
    .limit(300);
  if (error || !data) return {};
  const counts: Record<string, number> = {};
  for (const r of data) {
    const sid = (r as { sala_id: string }).sala_id;
    counts[sid] = (counts[sid] ?? 0) + 1;
  }
  return counts;
}
