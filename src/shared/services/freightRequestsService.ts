/**
 * Pizarra y salas de logística (fletes). Separado de `marketDemandService` (demandas de bienes);
 * los transportistas solo consumen este flujo, no el mercado de requerimientos_compra.
 */
import { supabase } from '@/shared/lib/supabase';
import { mensajeSupabaseConPista } from '@/shared/lib/supabaseErrors';
import type { FreightRequest, FreightTrackingStatus, LogisticsMensaje, LogisticsSala, RolUsuario } from '@/shared/types';

const GENERADORES: RolUsuario[] = ['independent_producer', 'buyer', 'company', 'agrotienda'];

export function puedeCrearSolicitudTransporte(rol: RolUsuario | undefined): boolean {
  return rol != null && GENERADORES.includes(rol);
}

export async function crearFreightRequest(payload: {
  requester_id: string;
  requester_role: RolUsuario;
  tipo_servicio: string;
  origen_estado: string;
  origen_municipio: string;
  destino_estado?: string | null;
  destino_municipio?: string | null;
  fecha_necesaria: string;
  descripcion?: string | null;
  peso_estimado_kg?: number | null;
}): Promise<void> {
  const { error } = await supabase.from('freight_requests').insert({
    requester_id: payload.requester_id,
    requester_role: payload.requester_role,
    tipo_servicio: payload.tipo_servicio,
    origen_estado: payload.origen_estado,
    origen_municipio: payload.origen_municipio,
    destino_estado: payload.destino_estado ?? null,
    destino_municipio: payload.destino_municipio ?? null,
    fecha_necesaria: payload.fecha_necesaria,
    descripcion: payload.descripcion ?? null,
    peso_estimado_kg: payload.peso_estimado_kg ?? null,
    estado: 'abierta',
    // tracking_status se deja NULL — no hay asignación aún
  });
  if (error) throw new Error(mensajeSupabaseConPista(error));
}

const ESTADOS_ACTIVOS_FLEET = ['abierta', 'con_postulaciones', 'asignada'] as const;

/** Viaje interno con unidad de flota; el trigger marca la unidad en_ruta. */
export async function crearFreightRequestFlotaInterna(payload: {
  requester_id: string;
  requester_role: RolUsuario;
  tipo_servicio: string;
  origen_estado: string;
  origen_municipio: string;
  destino_estado?: string | null;
  destino_municipio?: string | null;
  fecha_necesaria: string;
  descripcion?: string | null;
  peso_estimado_kg?: number | null;
  fleet_unit_id: string;
}): Promise<void> {
  const { count, error: cErr } = await supabase
    .from('freight_requests')
    .select('id', { count: 'exact', head: true })
    .eq('fleet_unit_id', payload.fleet_unit_id)
    .in('estado', [...ESTADOS_ACTIVOS_FLEET]);
  if (cErr) throw cErr;
  if ((count ?? 0) > 0) {
    throw new Error('Esa unidad ya tiene un viaje activo. Ciérralo antes de asignar otro.');
  }

  const { error } = await supabase.from('freight_requests').insert({
    requester_id: payload.requester_id,
    requester_role: payload.requester_role,
    tipo_servicio: payload.tipo_servicio,
    origen_estado: payload.origen_estado,
    origen_municipio: payload.origen_municipio,
    destino_estado: payload.destino_estado ?? null,
    destino_municipio: payload.destino_municipio ?? null,
    fecha_necesaria: payload.fecha_necesaria,
    descripcion: payload.descripcion ?? null,
    peso_estimado_kg: payload.peso_estimado_kg ?? null,
    estado: 'asignada',
    tracking_status: 'assigned_pending_prep',
    fleet_unit_id: payload.fleet_unit_id,
    assigned_transportista_id: null,
  });
  if (error) throw new Error(mensajeSupabaseConPista(error));
}

export async function marcarFreightCompletado(requesterId: string, freightId: string): Promise<void> {
  const { data: row, error } = await supabase
    .from('freight_requests')
    .select('id, requester_id')
    .eq('id', freightId)
    .maybeSingle();
  if (error) throw new Error(mensajeSupabaseConPista(error));
  if (!row || row.requester_id !== requesterId) throw new Error('No autorizado o solicitud no encontrada.');

  const { error: e2 } = await supabase
    .from('freight_requests')
    .update({
      estado: 'completada',
      tracking_status: 'received',
      actualizado_en: new Date().toISOString(),
    })
    .eq('id', freightId);
  if (e2) throw new Error(mensajeSupabaseConPista(e2));
}

export function freightTrackingStatusLabel(status: FreightTrackingStatus | null | undefined): string {
  switch (status) {
    case 'assigned_pending_prep':
      return 'Pendiente de preparación';
    case 'prepared':
      return 'Preparado';
    case 'departed_origin':
      return 'Salida reportada';
    case 'in_transit':
      return 'En tránsito';
    case 'signal_lost':
      return 'Sin señal';
    case 'arrived_destination':
      return 'Llegada reportada';
    case 'received':
      return 'Recibido';
    default:
      return 'Sin estado';
  }
}

function esEstadoTerminal(estado: string): boolean {
  return estado === 'completada' || estado === 'cancelada';
}

/** Primer flete no terminal ligado a esta unidad (más reciente). */
export async function obtenerFreightActivoPorUnidad(fleetUnitId: string): Promise<{ id: string } | null> {
  const { data, error } = await supabase
    .from('freight_requests')
    .select('id, estado')
    .eq('fleet_unit_id', fleetUnitId)
    .order('creado_en', { ascending: false });
  if (error) throw new Error(mensajeSupabaseConPista(error));
  const rows = (data ?? []) as { id: string; estado: string }[];
  const active = rows.find((r) => !esEstadoTerminal(r.estado));
  return active ? { id: active.id } : null;
}

/** Pizarra: solicitudes abiertas (RLS: transportista verificado). Incluye nombre del solicitante si RLS lo permite.
 *  También retorna solicitudes 'asignada' de las últimas 3 horas con bandera `ocupada` para que otros
 *  transportistas sepan que ya fue tomada sin que desaparezca de golpe.
 */
export async function listarPizarraFreight(): Promise<FreightRequest[]> {
  const hace3h = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();

  const q = await supabase
    .from('freight_requests')
    .select('*, perfiles(nombre)')
    .or(`estado.in.(abierta,con_postulaciones),and(estado.eq.asignada,actualizado_en.gte.${hace3h})`)
    .order('fecha_necesaria', { ascending: true })
    .order('creado_en', { ascending: false });

  if (q.error) {
    // Fallback sin join de perfiles
    const { data, error } = await supabase
      .from('freight_requests')
      .select('*')
      .or(`estado.in.(abierta,con_postulaciones),and(estado.eq.asignada,actualizado_en.gte.${hace3h})`)
      .order('fecha_necesaria', { ascending: true })
      .order('creado_en', { ascending: false });
    if (error) throw new Error(mensajeSupabaseConPista(error));
    return (data ?? []) as FreightRequest[];
  }
  return (q.data ?? []) as FreightRequest[];
}

export async function postularseAFreight(freightRequestId: string, mensaje?: string): Promise<void> {
  const { data: user, error: authErr } = await supabase.auth.getUser();
  if (authErr) throw new Error(`Sesión inválida: ${authErr.message}`);
  const uid = user.user?.id;
  if (!uid) throw new Error('Sesión requerida.');
  const { error } = await supabase.from('freight_request_applications').insert({
    freight_request_id: freightRequestId,
    transportista_id: uid,
    mensaje: mensaje?.trim() || null,
  });
  if (error) throw new Error(mensajeSupabaseConPista(error));
  // El trigger fn_freight_mark_con_postulaciones actualiza estado → 'con_postulaciones' en BD automáticamente.
}

export async function listarMisSolicitudesFreight(requesterId: string): Promise<FreightRequest[]> {
  const { data, error } = await supabase
    .from('freight_requests')
    .select(`
      *,
      freight_request_applications (
        id, freight_request_id, transportista_id, mensaje, estado, creado_en,
        perfiles ( nombre, reputacion, telefono )
      )
    `)
    .eq('requester_id', requesterId)
    .order('creado_en', { ascending: false });
  if (error) throw new Error(mensajeSupabaseConPista(error));
  return (data ?? []) as unknown as FreightRequest[];
}

export async function aceptarPostulacion(applicationId: string, requesterId: string): Promise<{ salaId: string }> {
  const { data: app, error: e1 } = await supabase
    .from('freight_request_applications')
    .select('id, freight_request_id, transportista_id')
    .eq('id', applicationId)
    .single();
  if (e1 || !app) throw new Error('Postulación no encontrada.');

  const { data: req, error: e2 } = await supabase
    .from('freight_requests')
    .select('id, requester_id, estado')
    .eq('id', app.freight_request_id)
    .single();
  if (e2 || !req || req.requester_id !== requesterId) throw new Error('No puedes gestionar esta solicitud.');

  const rid = app.freight_request_id;
  const tid = app.transportista_id;

  const { error: rejectOthersError } = await supabase
    .from('freight_request_applications')
    .update({ estado: 'rechazada' })
    .eq('freight_request_id', rid)
    .neq('id', applicationId);
  if (rejectOthersError) throw rejectOthersError;
  const { error: e3 } = await supabase.from('freight_request_applications').update({ estado: 'aceptada' }).eq('id', applicationId);
  if (e3) throw e3;

  const { data: salaRow, error: e4 } = await supabase
    .from('logistics_salas')
    .insert({
      freight_request_id: rid,
      requester_id: requesterId,
      transportista_id: tid,
    })
    .select('id')
    .single();
  if (e4) throw e4;
  if (!salaRow?.id) throw new Error('No se pudo crear la sala logística.');

  const { error: e5 } = await supabase
    .from('freight_requests')
    .update({
      estado: 'asignada',
      assigned_transportista_id: tid,
      actualizado_en: new Date().toISOString(),
    })
    .eq('id', rid);
  if (e5) throw e5;

  return { salaId: salaRow.id };
}

export async function obtenerSalaPorFreightRequest(freightRequestId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('logistics_salas')
    .select('id')
    .eq('freight_request_id', freightRequestId)
    .maybeSingle();
  if (error) throw new Error(mensajeSupabaseConPista(error));
  return data?.id ?? null;
}

/** Salas donde el usuario es generador o transportista asignado. */
export async function listarMisSalasLogistica(userId: string): Promise<LogisticsSala[]> {
  const { data, error } = await supabase
    .from('logistics_salas')
    .select(
      `
      id,
      freight_request_id,
      requester_id,
      transportista_id,
      trato_cerrado,
      cerrado_en,
      creado_en,
      freight_requests ( tipo_servicio, origen_municipio, origen_estado, fecha_necesaria, estado )
    `,
    )
    .or(`requester_id.eq.${userId},transportista_id.eq.${userId}`)
    .order('creado_en', { ascending: false });
  if (error) throw new Error(mensajeSupabaseConPista(error));
  return (data ?? []) as unknown as LogisticsSala[];
}

/**
 * Salas de negociación abiertas para una solicitud de transporte específica.
 * Solo el solicitante (requester) puede ver todas las salas de su solicitud.
 */
export async function listarSalasPorFreightRequest(freightRequestId: string): Promise<LogisticsSala[]> {
  const { data, error } = await supabase
    .from('logistics_salas')
    .select(
      `
      id,
      freight_request_id,
      requester_id,
      transportista_id,
      trato_cerrado,
      cerrado_en,
      creado_en,
      perfiles!logistics_salas_transportista_id_fkey ( nombre )
    `,
    )
    .eq('freight_request_id', freightRequestId)
    .order('creado_en', { ascending: false });
  if (error) {
    // Fallback sin join de perfiles si la FK no tiene ese nombre
    const { data: d2, error: e2 } = await supabase
      .from('logistics_salas')
      .select('id, freight_request_id, requester_id, transportista_id, trato_cerrado, cerrado_en, creado_en')
      .eq('freight_request_id', freightRequestId)
      .order('creado_en', { ascending: false });
    if (e2) throw new Error(mensajeSupabaseConPista(e2));
    return (d2 ?? []) as unknown as LogisticsSala[];
  }
  return (data ?? []) as unknown as LogisticsSala[];
}

/**
 * Transportista abre una sala de negociación previa con el solicitante.
 * El chat existe ANTES de que se cierre el acuerdo.
 * Si ya existe una sala para este par, devuelve el ID existente.
 */
export async function iniciarChatTransporte(freightRequestId: string): Promise<string> {
  const { data, error } = await supabase.rpc('iniciar_chat_transporte', {
    p_freight_request_id: freightRequestId,
  });
  if (error) throw new Error(mensajeSupabaseConPista(error));
  return String(data);
}

/**
 * Solicitante confirma el transportista elegido después de conversar.
 * Marca la sala como cerrada y la solicitud como 'asignada'.
 */
export async function confirmarTransportistaFlete(salaId: string): Promise<void> {
  const { error } = await supabase.rpc('confirmar_transportista_flete', {
    p_sala_id: salaId,
  });
  if (error) throw new Error(mensajeSupabaseConPista(error));
}

/**
 * Metadatos de una sala: trato_cerrado, requester_id, y estado del flete.
 * Usado por LogisticsChatModal para decidir si mostrar el botón de confirmar.
 */
export async function obtenerMetadatosSala(salaId: string): Promise<{
  requester_id: string;
  transportista_id: string;
  trato_cerrado: boolean;
  freight_estado: string | null;
} | null> {
  const { data, error } = await supabase
    .from('logistics_salas')
    .select('requester_id, transportista_id, trato_cerrado, freight_requests(estado)')
    .eq('id', salaId)
    .maybeSingle();
  if (error) throw new Error(mensajeSupabaseConPista(error));
  if (!data) return null;
  const frRaw = data.freight_requests as { estado?: string } | { estado?: string }[] | null;
  const fr = Array.isArray(frRaw) ? frRaw[0] : frRaw;
  return {
    requester_id: data.requester_id as string,
    transportista_id: data.transportista_id as string,
    trato_cerrado: data.trato_cerrado as boolean,
    freight_estado: fr?.estado ?? null,
  };
}

export async function listarMensajesLogistica(salaId: string): Promise<LogisticsMensaje[]> {
  const { data, error } = await supabase
    .from('logistics_mensajes')
    .select('id, sala_id, autor_id, contenido, tipo, media_url, creado_en')
    .eq('sala_id', salaId)
    .order('creado_en', { ascending: true });
  if (error) throw new Error(mensajeSupabaseConPista(error));
  return (data ?? []) as LogisticsMensaje[];
}

export async function enviarMensajeLogistica(salaId: string, autorId: string, contenido: string): Promise<string | null> {
  const text = contenido.trim();
  if (!text) return null;
  const { data, error } = await supabase.rpc('send_logistics_chat_message', {
    p_sala_id: salaId,
    p_contenido: text,
    p_tipo: 'texto',
    p_media_url: null,
  });
  if (error) throw new Error(mensajeSupabaseConPista(error));
  return data != null ? String(data) : null;
}

export async function enviarImagenLogistica(salaId: string, mediaUrl: string, caption = ''): Promise<void> {
  const { error } = await supabase.rpc('send_logistics_chat_message', {
    p_sala_id: salaId,
    p_contenido: caption.trim(),
    p_tipo: 'imagen',
    p_media_url: mediaUrl,
  });
  if (error) throw new Error(mensajeSupabaseConPista(error));
}

/** Fletes asignados al transportista (postulación aceptada), sin modelo legacy `fletes`. */
export async function listarFreightAsignadosAlTransportista(transportistaId: string): Promise<FreightRequest[]> {
  const { data, error } = await supabase
    .from('freight_requests')
    .select('*')
    .eq('assigned_transportista_id', transportistaId)
    .in('estado', ['asignada', 'completada'])
    .order('actualizado_en', { ascending: false })
    .limit(40);
  if (error) throw new Error(mensajeSupabaseConPista(error));
  return (data ?? []) as FreightRequest[];
}

export async function asignarOperacionFreight(payload: {
  freightId: string;
  vehiculoId: string | null;
  driverName: string;
  driverPhone?: string | null;
  driverDocument?: string | null;
  driverHasApp: boolean;
  driverHasGps: boolean;
  driverNotes?: string | null;
}): Promise<void> {
  const { error } = await supabase.rpc('assign_freight_execution', {
    p_freight_id: payload.freightId,
    p_vehiculo_id: payload.vehiculoId,
    p_driver_name: payload.driverName,
    p_driver_phone: payload.driverPhone ?? null,
    p_driver_document: payload.driverDocument ?? null,
    p_driver_has_app: payload.driverHasApp,
    p_driver_has_gps: payload.driverHasGps,
    p_driver_notes: payload.driverNotes ?? null,
  });
  if (error) throw new Error(mensajeSupabaseConPista(error));
}

export function trackingModeLabel(freight: Pick<FreightRequest, 'driver_has_app' | 'driver_has_gps'>): string {
  return freight.driver_has_app && freight.driver_has_gps ? 'Tracking en vivo' : 'Seguimiento manual';
}

export async function listarNotificacionesFreight(userId: string) {
  const { data, error } = await supabase
    .from('freight_request_notifications')
    .select('*')
    .eq('user_id', userId)
    .order('creado_en', { ascending: false })
    .limit(30);
  if (error) throw new Error(mensajeSupabaseConPista(error));
  return data ?? [];
}

export async function contarNotificacionesFreightNoLeidas(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('freight_request_notifications')
    .select('id', { head: true, count: 'exact' })
    .eq('user_id', userId)
    .eq('leida', false);
  if (error) throw new Error(mensajeSupabaseConPista(error));
  return count ?? 0;
}

export async function marcarNotificacionesFreightLeidas(userId: string): Promise<void> {
  const { error } = await supabase
    .from('freight_request_notifications')
    .update({ leida: true })
    .eq('user_id', userId)
    .eq('leida', false);
  if (error) throw new Error(mensajeSupabaseConPista(error));
}
