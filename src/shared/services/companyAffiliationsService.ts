import { supabase } from '@/shared/lib/supabase';
import { mensajeSupabaseConPista } from '@/shared/lib/supabaseErrors';

export type CompanyAffiliationStatus = 'pending' | 'active';

export type CompanyAffiliationCompany = {
  id: string;
  razon_social: string;
  logo_url: string | null;
  telefono_contacto: string | null;
  rif: string | null;
};

export type CompanyAffiliationProducer = {
  id: string;
  nombre: string;
  telefono: string | null;
  municipio: string | null;
  avatar_url?: string | null;
};

export type CompanyAffiliation = {
  id: string;
  company_id: string;
  producer_id: string;
  activo: boolean;
  creado_en: string;
  status: CompanyAffiliationStatus;
  company?: CompanyAffiliationCompany | null;
  producer?: CompanyAffiliationProducer | null;
};

export async function searchProducerByDocument(doc: string): Promise<CompanyAffiliationProducer | null> {
  const clean = doc.replace(/\D/g, '').trim();
  if (!clean) return null;

  const { data, error } = await supabase.rpc('company_find_producer_by_doc', { p_doc: clean });
  if (error) throw new Error(mensajeSupabaseConPista(error));

  const row = Array.isArray(data) ? data[0] : null;
  if (!row) return null;

  return {
    id: String(row.perfil_id),
    nombre: String(row.nombre ?? 'Productor'),
    telefono: row.telefono ? String(row.telefono) : null,
    municipio: row.municipio ? String(row.municipio) : null,
  };
}

export async function listAffiliationsForCompany(companyId: string): Promise<CompanyAffiliation[]> {
  const { data, error } = await supabase
    .from('company_affiliations')
    .select('id, company_id, producer_id, activo, creado_en, producer:perfiles!producer_id(id, nombre, telefono, municipio, avatar_url)')
    .eq('company_id', companyId)
    .order('creado_en', { ascending: false });

  if (error) throw new Error(mensajeSupabaseConPista(error));

  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    company_id: String(row.company_id),
    producer_id: String(row.producer_id),
    activo: Boolean(row.activo),
    creado_en: String(row.creado_en ?? ''),
    status: row.activo ? 'active' : 'pending',
    producer: (row.producer as CompanyAffiliationProducer | null | undefined) ?? null,
  }));
}

export async function listAffiliationsForProducer(producerId: string): Promise<CompanyAffiliation[]> {
  const { data, error } = await supabase
    .from('company_affiliations')
    .select('id, company_id, producer_id, activo, creado_en, company:companies!company_id(id, razon_social, logo_url, telefono_contacto, rif)')
    .eq('producer_id', producerId)
    .order('creado_en', { ascending: false });

  if (error) throw new Error(mensajeSupabaseConPista(error));

  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    company_id: String(row.company_id),
    producer_id: String(row.producer_id),
    activo: Boolean(row.activo),
    creado_en: String(row.creado_en ?? ''),
    status: row.activo ? 'active' : 'pending',
    company: (row.company as CompanyAffiliationCompany | null | undefined) ?? null,
  }));
}

export async function inviteProducerToCompany(companyId: string, producerId: string): Promise<CompanyAffiliationStatus> {
  const { data: existing, error: existingError } = await supabase
    .from('company_affiliations')
    .select('id, activo')
    .eq('company_id', companyId)
    .eq('producer_id', producerId)
    .maybeSingle();

  if (existingError) throw new Error(mensajeSupabaseConPista(existingError));
  if (existing) return existing.activo ? 'active' : 'pending';

  const { error } = await supabase.from('company_affiliations').insert({
    company_id: companyId,
    producer_id: producerId,
    activo: false,
  });

  if (error) throw new Error(mensajeSupabaseConPista(error));
  return 'pending';
}

export async function respondToAffiliation(affiliationId: string, accept: boolean): Promise<void> {
  const query = accept
    ? supabase.from('company_affiliations').update({ activo: true }).eq('id', affiliationId)
    : supabase.from('company_affiliations').delete().eq('id', affiliationId);
  const { error } = await query;

  if (error) throw new Error(mensajeSupabaseConPista(error));
}
