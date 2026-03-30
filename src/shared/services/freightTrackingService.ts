import { supabase } from '@/shared/lib/supabase';
import { mensajeSupabaseConPista } from '@/shared/lib/supabaseErrors';
import type { FreightRequest, FreightTrackingEventType, FreightTrackingUpdate, RolUsuario } from '@/shared/types';

export type TrackingPoint = {
  latitude: number;
  longitude: number;
  accuracyM?: number | null;
};

export const TRACKING_SIGNAL_LOST_MS = 3 * 60_000;
export const TRACKING_MAX_ACCURACY_M = 120;
export const TRACKING_DEPARTURE_RADIUS_M = 450;
export const TRACKING_ARRIVAL_RADIUS_M = 250;

function distanceMeters(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const x = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon;
  return 2 * R * Math.asin(Math.sqrt(x));
}

export async function getActiveFreightForTransporter(transportistaId: string): Promise<FreightRequest | null> {
  const rows = await listActiveFreightsForTransporter(transportistaId);
  return rows[0] ?? null;
}

export async function listActiveFreightsForTransporter(transportistaId: string): Promise<FreightRequest[]> {
  const { data, error } = await supabase
    .from('freight_requests')
    .select('*')
    .eq('assigned_transportista_id', transportistaId)
    .eq('estado', 'asignada')
    .order('actualizado_en', { ascending: false })
    .limit(25);
  if (error) throw new Error(mensajeSupabaseConPista(error));
  return (data ?? []) as FreightRequest[];
}

export async function getActiveFreightForRequester(requesterId: string): Promise<FreightRequest | null> {
  const rows = await listActiveFreightsForRequester(requesterId);
  return rows[0] ?? null;
}

export async function listActiveFreightsForRequester(requesterId: string): Promise<FreightRequest[]> {
  const { data, error } = await supabase
    .from('freight_requests')
    .select('*')
    .eq('requester_id', requesterId)
    .eq('estado', 'asignada')
    .not('assigned_transportista_id', 'is', null)
    .order('actualizado_en', { ascending: false })
    .limit(25);
  if (error) throw new Error(mensajeSupabaseConPista(error));
  return (data ?? []) as FreightRequest[];
}

export async function listFreightTrackingUpdates(freightRequestId: string, limit = 40): Promise<FreightTrackingUpdate[]> {
  const { data, error } = await supabase
    .from('freight_tracking_updates')
    .select('*')
    .eq('freight_request_id', freightRequestId)
    .order('creado_en', { ascending: false })
    .limit(limit);
  if (error) throw new Error(mensajeSupabaseConPista(error));
  return (data ?? []) as FreightTrackingUpdate[];
}

export async function getLatestFreightTrackingUpdate(freightRequestId: string): Promise<FreightTrackingUpdate | null> {
  const rows = await listFreightTrackingUpdates(freightRequestId, 1);
  return rows[0] ?? null;
}

export async function reportFreightTrackingEvent(input: {
  freightRequestId: string;
  actorId: string;
  actorRole: RolUsuario;
  eventType: FreightTrackingEventType;
  point: TrackingPoint;
  label?: string | null;
}): Promise<void> {
  const { error } = await supabase.from('freight_tracking_updates').insert({
    freight_request_id: input.freightRequestId,
    actor_id: input.actorId,
    actor_role: input.actorRole,
    event_type: input.eventType,
    lat: input.point.latitude,
    lng: input.point.longitude,
    accuracy_m: input.point.accuracyM ?? null,
    label: input.label ?? null,
  });
  if (error) throw new Error(mensajeSupabaseConPista(error));
}

export async function syncFreightSignalStatus(freightRequestId: string): Promise<void> {
  const { error } = await supabase.rpc('sync_freight_signal_status', {
    p_freight_id: freightRequestId,
    p_stale_minutes: Math.floor(TRACKING_SIGNAL_LOST_MS / 60000),
  });
  if (error) throw new Error(mensajeSupabaseConPista(error));
}

export function isTrackingSignalStale(event: FreightTrackingUpdate | null): boolean {
  if (!event?.creado_en) return false;
  if (event.event_type === 'arrived_destination') return false;
  return Date.now() - new Date(event.creado_en).getTime() > TRACKING_SIGNAL_LOST_MS;
}

export function trackingPhaseLabel(event: FreightTrackingUpdate | null): string {
  if (!event) return 'Pendiente de salida';
  if (event.event_type === 'arrived_destination') return 'Llegó al destino';
  if (isTrackingSignalStale(event)) return 'Sin señal del chofer';
  if (event.event_type === 'departed_origin') return 'Saliendo del punto de carga';
  return 'En ruta';
}

export function trackingUpdatedLabel(event: FreightTrackingUpdate | null): string {
  if (!event?.creado_en) return 'Sin actualización reciente';
  const diff = Date.now() - new Date(event.creado_en).getTime();
  if (diff < 60_000) return 'Actualizado hace unos segundos';
  const mins = Math.floor(diff / 60_000);
  if (isTrackingSignalStale(event)) return `Sin señal hace ${Math.max(1, mins)} min`;
  if (mins < 60) return `Actualizado hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  return `Actualizado hace ${hrs} h`;
}

export function trackingEventTitle(eventType: FreightTrackingEventType): string {
  if (eventType === 'departed_origin') return 'Saliendo';
  if (eventType === 'arrived_destination') return 'Llegó';
  return 'Ping de ruta';
}

export function trackingEventTone(eventType: FreightTrackingEventType): string {
  if (eventType === 'departed_origin') return '#2563eb';
  if (eventType === 'arrived_destination') return '#059669';
  return '#64748b';
}

export function evaluateDepartureRule(input: {
  point: TrackingPoint | null;
  origin: { latitude: number; longitude: number } | null;
  hasDeparture: boolean;
  hasArrival: boolean;
}): { allowed: boolean; reason?: string; distanceM?: number | null } {
  if (input.hasArrival) return { allowed: false, reason: 'Este viaje ya fue marcado como llegado.' };
  if (input.hasDeparture) return { allowed: false, reason: 'La salida ya fue reportada para este servicio.' };
  if (!input.point) return { allowed: false, reason: 'Espera la señal GPS para marcar la salida.' };
  if ((input.point.accuracyM ?? 0) > TRACKING_MAX_ACCURACY_M) {
    return { allowed: false, reason: 'La precisión GPS todavía es baja. Espera unos segundos más.' };
  }
  if (!input.origin) return { allowed: true };
  const distanceM = distanceMeters(input.point, input.origin);
  if (distanceM > TRACKING_DEPARTURE_RADIUS_M) {
    return {
      allowed: false,
      reason: `Debes estar cerca del origen para marcar salida. Distancia actual: ${Math.round(distanceM)} m.`,
      distanceM,
    };
  }
  return { allowed: true, distanceM };
}

export function evaluateArrivalRule(input: {
  point: TrackingPoint | null;
  destination: { latitude: number; longitude: number } | null;
  hasDeparture: boolean;
  hasArrival: boolean;
}): { allowed: boolean; reason?: string; distanceM?: number | null } {
  if (input.hasArrival) return { allowed: false, reason: 'La llegada ya fue reportada para este servicio.' };
  if (!input.hasDeparture) return { allowed: false, reason: 'Primero debes marcar la salida desde el origen.' };
  if (!input.point) return { allowed: false, reason: 'Espera la señal GPS para marcar la llegada.' };
  if ((input.point.accuracyM ?? 0) > TRACKING_MAX_ACCURACY_M) {
    return { allowed: false, reason: 'La precisión GPS todavía es baja. Espera mejor señal.' };
  }
  if (!input.destination) return { allowed: true };
  const distanceM = distanceMeters(input.point, input.destination);
  if (distanceM > TRACKING_ARRIVAL_RADIUS_M) {
    return {
      allowed: false,
      reason: `Debes estar dentro del radio del destino para marcar llegada. Distancia actual: ${Math.round(distanceM)} m.`,
      distanceM,
    };
  }
  return { allowed: true, distanceM };
}

export function subscribeToFreightTracking(
  freightRequestId: string,
  onInsert: (row: FreightTrackingUpdate) => void,
) {
  const channel = supabase
    .channel(`freight-tracking-${freightRequestId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'freight_tracking_updates', filter: `freight_request_id=eq.${freightRequestId}` },
      (payload) => onInsert(payload.new as FreightTrackingUpdate),
    );
  channel.subscribe();
  return channel;
}
