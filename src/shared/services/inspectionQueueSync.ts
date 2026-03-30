import { supabase } from '@/shared/lib/supabase';
import {
  localDeleteQueueItem,
  localListPendingQueue,
  localMarkQueueFailed,
  localMarkClean,
} from '@/shared/lib/fieldInspectionLocalDb';
import { updateFieldInspectionRemoteExtended } from '@/shared/services/fieldInspectionService';
import type {
  FieldInspectionEstatus,
  InspectionPhotoEvidence,
  InspectionSignatureRecord,
  InsumoRecomendado,
} from '@/shared/types';

export type InspectionQueuePayload = {
  op: 'update_inspection';
  server_id: string;
  local_task_id: string;
  observaciones_tecnicas: string | null;
  insumos_recomendados: InsumoRecomendado[];
  estatus: FieldInspectionEstatus;
  lat: number | null;
  lng: number | null;
  precision_gps_m?: number | null;
  tipo_inspeccion?: string | null;
  estado_acta?: string | null;
  resumen_dictamen?: string | null;
  porcentaje_dano?: number | null;
  estimacion_rendimiento_ton?: number | null;
  area_verificada_ha?: number | null;
  fuera_de_lote?: boolean | null;
  fase_fenologica: string | null;
  malezas_reportadas: string | null;
  plagas_reportadas: string | null;
  recomendacion_insumos: string | null;
  evidencias_fotos?: InspectionPhotoEvidence[] | null;
  firma_perito?: InspectionSignatureRecord | null;
  firma_productor?: InspectionSignatureRecord | null;
  firmado_en?: string | null;
};

export async function processInspectionSyncQueue(peritoId: string): Promise<number> {
  const pending = await localListPendingQueue();
  let sent = 0;
  for (const row of pending) {
    try {
      const payload = JSON.parse(row.payload_json) as InspectionQueuePayload;
      if (payload.op !== 'update_inspection') throw new Error('Operación no soportada');
      const uris: string[] = JSON.parse(row.photo_uris_json || '[]');
      const uploaded: string[] = [];
      const uploadedEvidence: InspectionPhotoEvidence[] = [];
      let i = 0;
      for (const u of uris) {
        const path = `${peritoId}/${row.id}/${i}.jpg`;
        const res = await fetch(u);
        if (!res.ok) throw new Error(`No se pudo leer foto local (${res.status}): ${u}`);
        const buf = await res.arrayBuffer();
        const { error: upErr } = await supabase.storage.from('field-inspection-photos').upload(path, buf, {
          contentType: 'image/jpeg',
          upsert: true,
        });
        if (upErr) throw upErr;
        uploaded.push(path);
        const sourceMeta = payload.evidencias_fotos?.[i];
        uploadedEvidence.push({
          path,
          captured_at: sourceMeta?.captured_at ?? new Date().toISOString(),
          lat: sourceMeta?.lat ?? payload.lat ?? null,
          lng: sourceMeta?.lng ?? payload.lng ?? null,
          accuracy_m: sourceMeta?.accuracy_m ?? payload.precision_gps_m ?? null,
          kind: sourceMeta?.kind ?? 'campo',
        });
        i += 1;
      }
      await updateFieldInspectionRemoteExtended(payload.server_id, {
        observaciones_tecnicas: payload.observaciones_tecnicas,
        insumos_recomendados: payload.insumos_recomendados,
        estatus: payload.estatus,
        lat: payload.lat,
        lng: payload.lng,
        precision_gps_m: payload.precision_gps_m,
        tipo_inspeccion: payload.tipo_inspeccion as Parameters<typeof updateFieldInspectionRemoteExtended>[1]['tipo_inspeccion'],
        estado_acta: payload.estado_acta as Parameters<typeof updateFieldInspectionRemoteExtended>[1]['estado_acta'],
        resumen_dictamen: payload.resumen_dictamen,
        porcentaje_dano: payload.porcentaje_dano,
        estimacion_rendimiento_ton: payload.estimacion_rendimiento_ton,
        area_verificada_ha: payload.area_verificada_ha,
        fuera_de_lote: payload.fuera_de_lote,
        fase_fenologica: payload.fase_fenologica,
        malezas_reportadas: payload.malezas_reportadas,
        plagas_reportadas: payload.plagas_reportadas,
        recomendacion_insumos: payload.recomendacion_insumos,
        fotos_urls: uploaded.length ? uploaded : undefined,
        evidencias_fotos: uploadedEvidence.length ? uploadedEvidence : payload.evidencias_fotos ?? undefined,
        firma_perito: payload.firma_perito,
        firma_productor: payload.firma_productor,
        firmado_en: payload.firmado_en,
      });
      await localMarkClean(payload.local_task_id, payload.estatus);
      await localDeleteQueueItem(row.id);
      sent += 1;
    } catch (e: unknown) {
      await localMarkQueueFailed(row.id, e instanceof Error ? e.message : String(e));
    }
  }
  return sent;
}
