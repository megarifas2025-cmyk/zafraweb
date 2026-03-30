import { supabase } from '@/shared/lib/supabase';
import { mensajeSupabaseConPista } from '@/shared/lib/supabaseErrors';
import type { LoteFinanciadoRow } from '@/shared/types/database.types';
import type { Company, Finca } from '@/shared/types';

export type LoteFinanciado = LoteFinanciadoRow;

/** Vista empresa: lote + finca + productor (perfil). */
export interface LoteFinanciadoEmpresa extends LoteFinanciado {
  finca?: Pick<Finca, 'id' | 'nombre' | 'estado_ve' | 'municipio' | 'hectareas' | 'rubro'> | null;
  productor?: { id: string; nombre: string; telefono: string | null; avatar_url: string | null } | null;
}

/** Vista productor: lote + empresa + finca. */
export interface LoteFinanciadoProductor extends LoteFinanciado {
  company?: Pick<Company, 'id' | 'razon_social' | 'rif' | 'logo_url' | 'telefono_contacto'> | null;
  finca?: Pick<Finca, 'id' | 'nombre' | 'estado_ve' | 'municipio' | 'hectareas' | 'rubro'> | null;
}

export type ResumenTramoFinanciado = {
  id: string;
  companyName: string;
  companyPhone: string | null;
  subLotName: string | null;
  hectareas: number | null;
};

export type ResumenFincaFinanciada = {
  fincaId: string;
  fincaNombre: string;
  productorId: string;
  productorNombre: string;
  municipio: string | null;
  estado: string | null;
  rubro: string | null;
  hectareasTotales: number | null;
  hectareasFinanciadas: number;
  hectareasPropias: number | null;
  tramos: ResumenTramoFinanciado[];
};

const selectEmpresa =
  'id, company_id, productor_id, finca_id, sub_lote_nombre, hectareas_asignadas, creado_en, finca:fincas!finca_id(id, nombre, estado_ve, municipio, hectareas, rubro), productor:perfiles!productor_id(id, nombre, telefono, avatar_url)';

const selectProductor =
  'id, company_id, productor_id, finca_id, sub_lote_nombre, hectareas_asignadas, creado_en, company:companies!company_id(id, razon_social, rif, logo_url, telefono_contacto), finca:fincas!finca_id(id, nombre, estado_ve, municipio, hectareas, rubro)';

function toNumber(value: number | string | null | undefined): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function resumirFinanciamientosProductor(rows: LoteFinanciadoProductor[]): ResumenFincaFinanciada[] {
  const grouped = new Map<string, ResumenFincaFinanciada>();

  for (const row of rows) {
    const fincaId = row.finca?.id ?? row.finca_id;
    const producerName =
      'productor' in row && row.productor && typeof row.productor === 'object' && 'nombre' in row.productor
        ? String(row.productor.nombre ?? 'Productor')
        : 'Productor';
    const current =
      grouped.get(fincaId) ??
      {
        fincaId,
        fincaNombre: row.finca?.nombre ?? 'Finca vinculada',
        productorId: row.productor_id,
        productorNombre: producerName,
        municipio: row.finca?.municipio ?? null,
        estado: row.finca?.estado_ve ?? null,
        rubro: row.finca?.rubro ?? null,
        hectareasTotales: toNumber(row.finca?.hectareas),
        hectareasFinanciadas: 0,
        hectareasPropias: null,
        tramos: [],
      };

    const hectareas = toNumber(row.hectareas_asignadas);
    current.tramos.push({
      id: row.id,
      companyName: row.company?.razon_social ?? 'Empresa',
      companyPhone: row.company?.telefono_contacto ?? null,
      subLotName: row.sub_lote_nombre ?? null,
      hectareas,
    });
    if (hectareas != null) current.hectareasFinanciadas += hectareas;
    grouped.set(fincaId, current);
  }

  return Array.from(grouped.values())
    .map((item) => {
      const allAssigned = item.tramos.every((segment) => segment.hectareas != null);
      if (item.hectareasTotales != null && allAssigned) {
        item.hectareasPropias = Math.max(0, Number((item.hectareasTotales - item.hectareasFinanciadas).toFixed(2)));
      }
      return item;
    })
    .sort((a, b) => a.fincaNombre.localeCompare(b.fincaNombre, 'es'));
}

/**
 * Resuelve el `company_id` del perfil empresa autenticado (`companies.perfil_id`).
 */
export async function obtenerCompanyIdDelUsuario(): Promise<string | null> {
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr) throw userErr;
  const uid = userData.user?.id;
  if (!uid) return null;

  const { data, error } = await supabase.from('companies').select('id').eq('perfil_id', uid).maybeSingle();
  if (error) throw error;
  return data?.id ?? null;
}

/**
 * Empresa: lotes financiados que puede gestionar (RLS: filas de su `company_id`).
 */
export async function listarLotesFinanciadosPorEmpresa(companyId?: string): Promise<LoteFinanciadoEmpresa[]> {
  const cid = companyId ?? (await obtenerCompanyIdDelUsuario());
  if (!cid) return [];

  const { data, error } = await supabase
    .from('lotes_financiados')
    .select(selectEmpresa)
    .eq('company_id', cid)
    .order('creado_en', { ascending: false });

  if (error) throw new Error(mensajeSupabaseConPista(error));
  return (data ?? []) as unknown as LoteFinanciadoEmpresa[];
}

/**
 * Productor: quién monitorea cada finca vinculada (RLS: filas donde `productor_id` = usuario).
 */
export async function listarFinanciamientosComoProductor(productorId?: string): Promise<LoteFinanciadoProductor[]> {
  let pid = productorId;
  if (!pid) {
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr) throw userErr;
    pid = userData.user?.id;
  }
  if (!pid) return [];

  const { data, error } = await supabase
    .from('lotes_financiados')
    .select(selectProductor)
    .eq('productor_id', pid)
    .order('creado_en', { ascending: false });

  if (error) throw new Error(mensajeSupabaseConPista(error));
  return (data ?? []) as unknown as LoteFinanciadoProductor[];
}

export type FincaFinancingCandidate = Pick<
  Finca,
  'id' | 'nombre' | 'estado_ve' | 'municipio' | 'hectareas' | 'rubro'
> & { propietario_id: string };

export async function listarFincasActivasDeProductor(productorId: string): Promise<FincaFinancingCandidate[]> {
  const { data, error } = await supabase
    .from('fincas')
    .select('id, nombre, estado_ve, municipio, hectareas, rubro, propietario_id')
    .eq('propietario_id', productorId)
    .eq('activa', true)
    .order('nombre');

  if (error) throw new Error(mensajeSupabaseConPista(error));
  return (data ?? []) as FincaFinancingCandidate[];
}

export type CrearLoteFinanciadoInput = {
  companyId: string;
  productorId: string;
  fincaId: string;
  subLoteNombre?: string | null;
  hectareasAsignadas: number;
};

export async function crearLoteFinanciado(input: CrearLoteFinanciadoInput): Promise<void> {
  const { error } = await supabase.from('lotes_financiados').insert({
    company_id: input.companyId,
    productor_id: input.productorId,
    finca_id: input.fincaId,
    sub_lote_nombre: input.subLoteNombre?.trim() || null,
    hectareas_asignadas: input.hectareasAsignadas,
  });

  if (error) throw new Error(mensajeSupabaseConPista(error));
}

export async function eliminarLoteFinanciado(loteId: string): Promise<void> {
  const { error } = await supabase.from('lotes_financiados').delete().eq('id', loteId);
  if (error) throw new Error(mensajeSupabaseConPista(error));
}
