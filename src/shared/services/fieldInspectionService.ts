import { supabase } from '@/shared/lib/supabase';
import type {
  FieldInspection,
  FieldInspectionEstatus,
  InspectionActaEstado,
  InspectionPhotoEvidence,
  InspectionSignatureRecord,
  InspectionTipo,
  InsumoRecomendado,
} from '@/shared/types';
import { mensajeSupabaseConPista } from '@/shared/lib/supabaseErrors';
import {
  embedOne,
  parseGeoJson,
  parseJsonArray,
  parseJsonObject,
} from '@/shared/services/fieldInspectionHelpers';

function toEwktPoint(lat: number, lng: number): string {
  return `SRID=4326;POINT(${lng} ${lat})`;
}

function parseInsumos(v: unknown): InsumoRecomendado[] {
  if (Array.isArray(v)) return v as InsumoRecomendado[];
  if (typeof v !== 'string') return [];
  try {
    const parsed = JSON.parse(v) as unknown;
    return Array.isArray(parsed) ? (parsed as InsumoRecomendado[]) : [];
  } catch {
    return [];
  }
}

function mapRow(r: Record<string, unknown>): FieldInspection {
  const insumos = parseInsumos(r.insumos_recomendados);
  const fotos = r.fotos_urls;
  const fotosUrls = Array.isArray(fotos) ? (fotos as string[]) : null;
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
    insumos_recomendados: insumos,
    estatus: r.estatus as FieldInspectionEstatus,
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
    fotos_urls: fotosUrls,
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

/** Descarga órdenes abiertas para trabajar en campo (offline-first). */
export async function fetchFieldInspectionsForPerito(peritoId: string): Promise<FieldInspection[]> {
  const { data, error } = await supabase
    .from('field_inspections')
    .select(`
      *,
      finca:fincas!field_inspections_finca_id_fkey(id, nombre, municipio, estado_ve, coordenadas, hectareas),
      productor:perfiles!field_inspections_productor_id_fkey(id, nombre, telefono, municipio, estado_ve)
    `)
    .eq('perito_id', peritoId)
    .in('estatus', ['pending', 'in_progress', 'synced', 'approved'])
    .order('fecha_programada', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => mapRow(row as Record<string, unknown>));
}

export async function updateFieldInspectionRemote(
  id: string,
  patch: {
    observaciones_tecnicas: string | null;
    insumos_recomendados: InsumoRecomendado[];
    estatus: FieldInspectionEstatus;
    lat?: number | null;
    lng?: number | null;
  },
): Promise<void> {
  const body: Record<string, unknown> = {
    observaciones_tecnicas: patch.observaciones_tecnicas,
    insumos_recomendados: patch.insumos_recomendados,
    estatus: patch.estatus,
  };
  if (patch.lat != null && patch.lng != null) {
    body.coordenadas_gps = toEwktPoint(patch.lat, patch.lng);
  }
  const { error } = await supabase.from('field_inspections').update(body).eq('id', id);
  if (error) throw error;
}

export async function updateFieldInspectionRemoteExtended(
  id: string,
  patch: {
    observaciones_tecnicas?: string | null;
    insumos_recomendados?: InsumoRecomendado[];
    estatus?: FieldInspectionEstatus;
    lat?: number | null;
    lng?: number | null;
    fase_fenologica?: string | null;
    malezas_reportadas?: string | null;
    plagas_reportadas?: string | null;
    recomendacion_insumos?: string | null;
    fotos_urls?: string[] | null;
    tipo_inspeccion?: InspectionTipo | null;
    estado_acta?: InspectionActaEstado | null;
    resumen_dictamen?: string | null;
    porcentaje_dano?: number | null;
    estimacion_rendimiento_ton?: number | null;
    area_verificada_ha?: number | null;
    precision_gps_m?: number | null;
    fuera_de_lote?: boolean | null;
    evidencias_fotos?: InspectionPhotoEvidence[] | null;
    firma_perito?: InspectionSignatureRecord | null;
    firma_productor?: InspectionSignatureRecord | null;
    firmado_en?: string | null;
  },
): Promise<void> {
  const body: Record<string, unknown> = {};
  if (patch.observaciones_tecnicas !== undefined) body.observaciones_tecnicas = patch.observaciones_tecnicas;
  if (patch.insumos_recomendados !== undefined) body.insumos_recomendados = patch.insumos_recomendados;
  if (patch.estatus !== undefined) body.estatus = patch.estatus;
  if (patch.lat != null && patch.lng != null) {
    body.coordenadas_gps = toEwktPoint(patch.lat, patch.lng);
  }
  if (patch.fase_fenologica !== undefined) body.fase_fenologica = patch.fase_fenologica;
  if (patch.malezas_reportadas !== undefined) body.malezas_reportadas = patch.malezas_reportadas;
  if (patch.plagas_reportadas !== undefined) body.plagas_reportadas = patch.plagas_reportadas;
  if (patch.recomendacion_insumos !== undefined) body.recomendacion_insumos = patch.recomendacion_insumos;
  if (patch.fotos_urls !== undefined) body.fotos_urls = patch.fotos_urls;
  if (patch.tipo_inspeccion !== undefined) body.tipo_inspeccion = patch.tipo_inspeccion;
  if (patch.estado_acta !== undefined) body.estado_acta = patch.estado_acta;
  if (patch.resumen_dictamen !== undefined) body.resumen_dictamen = patch.resumen_dictamen;
  if (patch.porcentaje_dano !== undefined) body.porcentaje_dano = patch.porcentaje_dano;
  if (patch.estimacion_rendimiento_ton !== undefined) body.estimacion_rendimiento_ton = patch.estimacion_rendimiento_ton;
  if (patch.area_verificada_ha !== undefined) body.area_verificada_ha = patch.area_verificada_ha;
  if (patch.precision_gps_m !== undefined) body.precision_gps_m = patch.precision_gps_m;
  if (patch.fuera_de_lote !== undefined) body.fuera_de_lote = patch.fuera_de_lote;
  if (patch.evidencias_fotos !== undefined) body.evidencias_fotos = patch.evidencias_fotos;
  if (patch.firma_perito !== undefined) body.firma_perito = patch.firma_perito;
  if (patch.firma_productor !== undefined) body.firma_productor = patch.firma_productor;
  if (patch.firmado_en !== undefined) body.firmado_en = patch.firmado_en;
  const { error } = await supabase.from('field_inspections').update(body).eq('id', id);
  if (error) throw error;
}

export async function fetchFieldInspectionForPdf(id: string): Promise<FieldInspection | null> {
  const { data, error } = await supabase
    .from('field_inspections')
    .select(
      `
      *,
      finca:fincas!field_inspections_finca_id_fkey(id, nombre, municipio, estado_ve, coordenadas, hectareas),
      perito:perfiles!field_inspections_perito_id_fkey(id, nombre, telefono),
      productor:perfiles!field_inspections_productor_id_fkey(id, nombre, telefono, municipio, estado_ve),
      companies (
        razon_social,
        rif,
        logo_url,
        direccion,
        direccion_fiscal,
        telefono_contacto,
        correo_contacto
      )
    `,
    )
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as Record<string, unknown>;
  const fi = mapRow(row);
  const co = row.companies;
  if (co && typeof co === 'object') {
    fi.companies = co as FieldInspection['companies'];
  }
  return fi;
}

export async function createFieldInspectionForCompany(input: {
  empresa_id: string;
  perito_id: string;
  productor_id: string;
  finca_id?: string | null;
  fecha_programada: string;
  tipo_inspeccion?: InspectionTipo | null;
  observaciones_tecnicas?: string | null;
}): Promise<{ id: string; numero_control: string; reused: boolean }> {
  const { data: existing, error: existingError } = await supabase
    .from('field_inspections')
    .select('id, numero_control')
    .eq('empresa_id', input.empresa_id)
    .eq('perito_id', input.perito_id)
    .eq('productor_id', input.productor_id)
    .eq('finca_id', input.finca_id ?? null)
    .in('estatus', ['pending', 'in_progress'])
    .order('creado_en', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingError) {
    throw new Error(mensajeSupabaseConPista(existingError));
  }
  if (existing) {
    return {
      id: String(existing.id),
      numero_control: String(existing.numero_control),
      reused: true,
    };
  }

  const { data, error } = await supabase
    .from('field_inspections')
    .insert({
      empresa_id: input.empresa_id,
      perito_id: input.perito_id,
      productor_id: input.productor_id,
      finca_id: input.finca_id ?? null,
      fecha_programada: input.fecha_programada,
      tipo_inspeccion: input.tipo_inspeccion ?? 'estimacion_precosecha',
      estado_acta: 'borrador_local',
      observaciones_tecnicas: input.observaciones_tecnicas ?? null,
      estatus: 'pending',
      insumos_recomendados: [],
    })
    .select('id, numero_control')
    .single();

  if (error) {
    throw new Error(mensajeSupabaseConPista(error));
  }

  return {
    id: String(data.id),
    numero_control: String(data.numero_control),
    reused: false,
  };
}
