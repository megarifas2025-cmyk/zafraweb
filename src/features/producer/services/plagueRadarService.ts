import * as ImagePicker from 'expo-image-picker';
import { supabase } from '@/shared/lib/supabase';
import { randomUuidV4, guardarConfirmacionPlagaLocal, guardarReportePlagaLocal, type PlagueLocalSeverity } from '@/hooks/useOfflineSync';
import { storageService } from '@/shared/services/storageService';

export type NearbyPlagueAlert = {
  id: string;
  perfil_id: string;
  titulo: string;
  descripcion: string | null;
  estado_ve: string;
  municipio: string;
  estado: 'no_verificada' | 'verificada';
  confirmaciones: number;
  creado_en: string;
  reporter_name?: string | null;
  distance_m?: number | null;
  confirmed_by_me?: boolean | null;
  is_owner?: boolean | null;
  severity?: string | null;
  fotos?: string[] | null;
};

export async function listNearbyPlagueAlerts(input: {
  lat: number;
  lng: number;
  radiusM?: number;
}): Promise<NearbyPlagueAlert[]> {
  const { data, error } = await supabase.rpc('nearby_plague_alerts', {
    p_lat: input.lat,
    p_lng: input.lng,
    p_radius_m: input.radiusM ?? 100_000,
  });
  if (error) throw error;
  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    perfil_id: String(row.perfil_id),
    titulo: String(row.titulo ?? 'Alerta de plaga'),
    descripcion: row.descripcion ? String(row.descripcion) : null,
    estado_ve: String(row.estado_ve ?? ''),
    municipio: String(row.municipio ?? ''),
    estado: row.estado === 'verificada' ? 'verificada' : 'no_verificada',
    confirmaciones: Number(row.confirmaciones ?? 0),
    creado_en: String(row.creado_en ?? ''),
    reporter_name: row.reporter_name ? String(row.reporter_name) : null,
    distance_m: typeof row.distance_m === 'number' ? row.distance_m : Number(row.distance_m ?? 0),
    confirmed_by_me: Boolean(row.confirmed_by_me),
    is_owner: Boolean(row.is_owner),
    severity:
      row.ia_sugerencia && typeof row.ia_sugerencia === 'object' && 'severity' in (row.ia_sugerencia as Record<string, unknown>)
        ? String((row.ia_sugerencia as Record<string, unknown>).severity ?? '')
        : null,
    fotos: Array.isArray(row.fotos) ? (row.fotos as string[]) : null,
  }));
}

export async function takeRadarPhoto(): Promise<string | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) {
    throw new Error('Necesitamos la cámara para documentar el reporte.');
  }
  const result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
  if (result.canceled || !result.assets[0]) return null;
  return result.assets[0].uri;
}

export async function reportPlagueAlert(input: {
  perfilId: string;
  fincaId: string;
  titulo: string;
  descripcion?: string | null;
  severidad: PlagueLocalSeverity;
  estado_ve: string;
  municipio: string;
  lat: number;
  lng: number;
  localPhotoUri?: string | null;
  offlineFallback?: boolean;
}): Promise<{ queuedOffline: boolean }> {
  const alertId = randomUuidV4();
  let photoUrl: string | null = null;
  if (input.localPhotoUri) {
    photoUrl = await storageService.subir('early-warnings', `radar-plagas/${input.perfilId}/${alertId}.jpg`, input.localPhotoUri, true);
  }

  const payload = {
    id: alertId,
    perfil_id: input.perfilId,
    tipo: 'plaga',
    titulo: input.titulo.trim(),
    descripcion: input.descripcion?.trim() || null,
    estado_ve: input.estado_ve,
    municipio: input.municipio,
    coordenadas: `POINT(${input.lng} ${input.lat})`,
    fotos: photoUrl ? [photoUrl] : [],
    ia_sugerencia: { severity: input.severidad, source: 'producer_manual_radar' },
  };

  try {
    const { error } = await supabase.from('alertas_waze').insert(payload);
    if (error) throw error;
    return { queuedOffline: false };
  } catch (error) {
    if (!input.offlineFallback) throw error;
    guardarReportePlagaLocal({
      id: alertId,
      autor_id: input.perfilId,
      finca_id: input.fincaId,
      titulo: input.titulo.trim(),
      descripcion: input.descripcion?.trim() || null,
      severidad: input.severidad,
      foto_url: photoUrl,
      estado_ve: input.estado_ve,
      municipio: input.municipio,
      lat: input.lat,
      lng: input.lng,
    });
    return { queuedOffline: true };
  }
}

export async function confirmPlagueAlert(alertId: string, perfilId: string, offlineFallback = true): Promise<{ queuedOffline: boolean }> {
  try {
    const { error } = await supabase.rpc('confirm_community_plague_alert', { p_alerta_id: alertId });
    if (error) throw error;
    return { queuedOffline: false };
  } catch (error) {
    if (!offlineFallback) throw error;
    guardarConfirmacionPlagaLocal({
      id: randomUuidV4(),
      alerta_id: alertId,
      perfil_id: perfilId,
    });
    return { queuedOffline: true };
  }
}

export async function deletePlagueAlert(alertId: string): Promise<void> {
  const { error } = await supabase.rpc('delete_community_plague_alert', {
    p_alerta_id: alertId,
  });
  if (error) throw error;
}
