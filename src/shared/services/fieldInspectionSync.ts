import { DeviceEventEmitter } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { silentToast } from '@/shared/lib/silentToast';
import { fetchFieldInspectionsForPerito, updateFieldInspectionRemoteExtended } from '@/shared/services/fieldInspectionService';
import { processInspectionSyncQueue } from '@/shared/services/inspectionQueueSync';
import { logError, logInfo, logWarn, serializeError } from '@/shared/runtime/appLogger';
import {
  localListDirty,
  localMarkClean,
  localUpsertFromServer,
} from '@/shared/lib/fieldInspectionLocalDb';
import type { InsumoRecomendado } from '@/shared/types';

export const FIELD_INSPECTION_SYNC_EVENT = 'field_inspection_sync_done';

function parseInsumos(json: string): InsumoRecomendado[] {
  try {
    const v = JSON.parse(json) as unknown;
    return Array.isArray(v) ? (v as InsumoRecomendado[]) : [];
  } catch {
    return [];
  }
}

const UPSERT_CHUNK_SIZE = 6;

/** Descarga desde Supabase y persiste en SQLite en paralelo (chunks de ${UPSERT_CHUNK_SIZE}). */
export async function pullFieldInspections(peritoId: string): Promise<void> {
  const rows = await fetchFieldInspectionsForPerito(peritoId);
  // Procesar en chunks paralelos para no saturar SQLite ni la memoria
  for (let i = 0; i < rows.length; i += UPSERT_CHUNK_SIZE) {
    const chunk = rows.slice(i, i + UPSERT_CHUNK_SIZE);
    await Promise.all(
      chunk.map((r) =>
        localUpsertFromServer({
          serverId: r.id,
          empresa_id: r.empresa_id,
          perito_id: r.perito_id,
          productor_id: r.productor_id,
          finca_id: r.finca_id ?? null,
          fecha_programada: r.fecha_programada,
          lat: r.coordenadas_gps?.lat ?? null,
          lng: r.coordenadas_gps?.lng ?? null,
          precision_gps_m: r.precision_gps_m ?? null,
          observaciones_tecnicas: r.observaciones_tecnicas,
          resumen_dictamen: r.resumen_dictamen ?? null,
          insumos: r.insumos_recomendados ?? [],
          tipo_inspeccion: r.tipo_inspeccion ?? null,
          estado_acta: r.estado_acta ?? null,
          porcentaje_dano: r.porcentaje_dano ?? null,
          estimacion_rendimiento_ton: r.estimacion_rendimiento_ton ?? null,
          area_verificada_ha: r.area_verificada_ha ?? null,
          fuera_de_lote: r.fuera_de_lote ?? null,
          fase_fenologica: r.fase_fenologica ?? null,
          malezas_reportadas: r.malezas_reportadas ?? null,
          plagas_reportadas: r.plagas_reportadas ?? null,
          recomendacion_insumos: r.recomendacion_insumos ?? null,
          evidencias_fotos_json: JSON.stringify(r.evidencias_fotos ?? []),
          firma_perito_json: r.firma_perito ? JSON.stringify(r.firma_perito) : null,
          firma_productor_json: r.firma_productor ? JSON.stringify(r.firma_productor) : null,
          firmado_en: r.firmado_en ?? null,
          productor_nombre: r.productor?.nombre ?? null,
          productor_telefono: r.productor?.telefono ?? null,
          finca_nombre: r.finca?.nombre ?? null,
          estatus: r.estatus,
          numero_control: r.numero_control,
        }),
      ),
    );
  }
}

/** Sube filas marcadas dirty y marca estatus synced en servidor y local. */
export async function pushDirtyFieldInspections(peritoId: string): Promise<{ ok: number; errors: string[] }> {
  const dirty = await localListDirty(peritoId);
  const errors: string[] = [];
  let ok = 0;
  for (const row of dirty) {
    const sid = row.server_id ?? row.id;
    try {
      await updateFieldInspectionRemoteExtended(sid, {
        observaciones_tecnicas: row.observaciones_tecnicas,
        insumos_recomendados: parseInsumos(row.insumos_json),
        estatus: 'synced',
        lat: row.lat,
        lng: row.lng,
        precision_gps_m: row.precision_gps_m,
        tipo_inspeccion: row.tipo_inspeccion as Parameters<typeof updateFieldInspectionRemoteExtended>[1]['tipo_inspeccion'],
        estado_acta: row.estado_acta as Parameters<typeof updateFieldInspectionRemoteExtended>[1]['estado_acta'],
        resumen_dictamen: row.resumen_dictamen,
        porcentaje_dano: row.porcentaje_dano,
        estimacion_rendimiento_ton: row.estimacion_rendimiento_ton,
        area_verificada_ha: row.area_verificada_ha,
        fuera_de_lote: row.fuera_de_lote == null ? null : row.fuera_de_lote === 1,
        fase_fenologica: row.fase_fenologica,
        malezas_reportadas: row.malezas_reportadas,
        plagas_reportadas: row.plagas_reportadas,
        recomendacion_insumos: row.recomendacion_insumos,
        evidencias_fotos: row.evidencias_fotos_json ? (JSON.parse(row.evidencias_fotos_json) as Parameters<typeof updateFieldInspectionRemoteExtended>[1]['evidencias_fotos']) : undefined,
        firma_perito: row.firma_perito_json ? JSON.parse(row.firma_perito_json) : null,
        firma_productor: row.firma_productor_json ? JSON.parse(row.firma_productor_json) : null,
        firmado_en: row.firmado_en,
      });
      await localMarkClean(row.id, 'synced');
      ok += 1;
    } catch (e: unknown) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }
  return { ok, errors };
}

export async function syncFieldInspectionsIfOnline(peritoId: string): Promise<{ queueSent: number }> {
  const net = await NetInfo.fetch();
  if (!net.isConnected) {
    logInfo('field_inspection.sync', 'Sync omitido por falta de conectividad.', {
      peritoId,
    });
    return { queueSent: 0 };
  }
  const queueSent = await processInspectionSyncQueue(peritoId);
  if (queueSent > 0) silentToast('Reportes enviados al servidor');
  const dirtyResult = await pushDirtyFieldInspections(peritoId);
  if (dirtyResult.errors.length > 0) {
    logWarn('field_inspection.sync', 'Sync finalizó con errores en filas dirty.', {
      peritoId,
      errorCount: dirtyResult.errors.length,
      errors: dirtyResult.errors.slice(0, 5),
    });
  }
  await pullFieldInspections(peritoId);
  logInfo('field_inspection.sync', 'Sync de inspecciones completado.', {
    peritoId,
    queueSent,
    dirtyOk: dirtyResult.ok,
    dirtyErrors: dirtyResult.errors.length,
  });
  DeviceEventEmitter.emit(FIELD_INSPECTION_SYNC_EVENT, { peritoId });
  return { queueSent };
}

/** Registro global en App: al recuperar red, cola + dirty + pull. */
export function attachGlobalFieldInspectionNetInfo(peritoId: string): () => void {
  syncFieldInspectionsIfOnline(peritoId).catch((error: unknown) => {
    logError('field_inspection.sync_initial', 'Falló el sync inicial de inspecciones.', {
      peritoId,
      error: serializeError(error),
    });
  });
  const sub = NetInfo.addEventListener((state) => {
    if (state.isConnected) {
      syncFieldInspectionsIfOnline(peritoId).catch((error: unknown) => {
        logError('field_inspection.sync_global', 'Falló el sync global de inspecciones.', {
          peritoId,
          error: serializeError(error),
        });
      });
    }
  });
  return () => sub();
}

/** API unificada para pull/push (módulo Búnker). */
export const FieldInspectionSyncManager = {
  pull: pullFieldInspections,
  push: pushDirtyFieldInspections,
  syncIfOnline: syncFieldInspectionsIfOnline,
};
