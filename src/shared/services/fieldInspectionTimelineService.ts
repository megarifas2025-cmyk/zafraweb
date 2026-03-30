import { supabase } from '@/shared/lib/supabase';
import type {
  FieldInspection,
  InspectionActaEstado,
  InspectionPhotoEvidence,
  InspectionSignatureRecord,
  InspectionTipo,
} from '@/shared/types';
import {
  embedOne,
  parseGeoJson,
  parseJsonArray,
  parseJsonObject,
} from '@/shared/services/fieldInspectionHelpers';

function mapRow(r: Record<string, unknown>): FieldInspection {
  return {
    id: String(r.id),
    numero_control: String(r.numero_control),
    empresa_id: String(r.empresa_id),
    perito_id: String(r.perito_id),
    productor_id: String(r.productor_id),
    finca_id: r.finca_id ? String(r.finca_id) : null,
    fecha_programada: String(r.fecha_programada).slice(0, 10),
    coordenadas_gps: parseGeoJson(r.coordenadas_gps),
    tipo_inspeccion: (r.tipo_inspeccion as InspectionTipo | null | undefined) ?? null,
    estado_acta: (r.estado_acta as InspectionActaEstado | null | undefined) ?? null,
    observaciones_tecnicas: r.observaciones_tecnicas != null ? String(r.observaciones_tecnicas) : null,
    resumen_dictamen: r.resumen_dictamen != null ? String(r.resumen_dictamen) : null,
    insumos_recomendados: parseJsonArray(r.insumos_recomendados) ?? [],
    estatus: String(r.estatus) as FieldInspection['estatus'],
    porcentaje_dano: typeof r.porcentaje_dano === 'number' ? r.porcentaje_dano : r.porcentaje_dano != null ? Number(r.porcentaje_dano) : null,
    estimacion_rendimiento_ton:
      typeof r.estimacion_rendimiento_ton === 'number'
        ? r.estimacion_rendimiento_ton
        : r.estimacion_rendimiento_ton != null
          ? Number(r.estimacion_rendimiento_ton)
          : null,
    area_verificada_ha: typeof r.area_verificada_ha === 'number' ? r.area_verificada_ha : r.area_verificada_ha != null ? Number(r.area_verificada_ha) : null,
    precision_gps_m: typeof r.precision_gps_m === 'number' ? r.precision_gps_m : r.precision_gps_m != null ? Number(r.precision_gps_m) : null,
    fuera_de_lote: typeof r.fuera_de_lote === 'boolean' ? r.fuera_de_lote : null,
    fotos_urls: parseJsonArray<string>(r.fotos_urls),
    evidencias_fotos: parseJsonArray<InspectionPhotoEvidence>(r.evidencias_fotos),
    firma_perito: parseJsonObject<InspectionSignatureRecord>(r.firma_perito),
    firma_productor: parseJsonObject<InspectionSignatureRecord>(r.firma_productor),
    firmado_en: r.firmado_en != null ? String(r.firmado_en) : null,
    fase_fenologica: r.fase_fenologica != null ? String(r.fase_fenologica) : null,
    malezas_reportadas: r.malezas_reportadas != null ? String(r.malezas_reportadas) : null,
    plagas_reportadas: r.plagas_reportadas != null ? String(r.plagas_reportadas) : null,
    recomendacion_insumos: r.recomendacion_insumos != null ? String(r.recomendacion_insumos) : null,
    creado_en: r.creado_en != null ? String(r.creado_en) : undefined,
    actualizado_en: r.actualizado_en != null ? String(r.actualizado_en) : undefined,
    finca: embedOne<FieldInspection['finca']>(r.finca),
    perito: embedOne<FieldInspection['perito']>(r.perito),
    productor: embedOne<FieldInspection['productor']>(r.productor),
    companies: embedOne<FieldInspection['companies']>(r.companies),
  };
}

const TIMELINE_SELECT = `
  *,
  finca:fincas!field_inspections_finca_id_fkey(id, nombre, municipio, estado_ve, coordenadas, hectareas),
  perito:perfiles!field_inspections_perito_id_fkey(id, nombre, telefono),
  productor:perfiles!field_inspections_productor_id_fkey(id, nombre, telefono, municipio, estado_ve),
  companies(razon_social, rif, logo_url, direccion, direccion_fiscal, telefono_contacto, correo_contacto)
`;

export async function listFieldInspectionTimelineByProducer(productorId: string, limit = 6): Promise<FieldInspection[]> {
  const { data, error } = await supabase
    .from('field_inspections')
    .select(TIMELINE_SELECT)
    .eq('productor_id', productorId)
    .order('fecha_programada', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((row) => mapRow(row as Record<string, unknown>));
}

export async function listFieldInspectionTimelineByCompany(companyId: string, limit = 8): Promise<FieldInspection[]> {
  const { data, error } = await supabase
    .from('field_inspections')
    .select(TIMELINE_SELECT)
    .eq('empresa_id', companyId)
    .order('fecha_programada', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((row) => mapRow(row as Record<string, unknown>));
}

export async function listFieldInspectionHistory(params: {
  fincaId?: string | null;
  productorId?: string | null;
  excludeId?: string | null;
  limit?: number;
}): Promise<FieldInspection[]> {
  let query = supabase
    .from('field_inspections')
    .select(TIMELINE_SELECT)
    .order('fecha_programada', { ascending: false })
    .limit(params.limit ?? 6);
  if (params.fincaId) {
    query = query.eq('finca_id', params.fincaId);
  } else if (params.productorId) {
    query = query.eq('productor_id', params.productorId);
  }
  if (params.excludeId) query = query.neq('id', params.excludeId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((row) => mapRow(row as Record<string, unknown>));
}
