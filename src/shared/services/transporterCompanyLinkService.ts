import { supabase } from '@/shared/lib/supabase';
import { mensajeSupabaseConPista } from '@/shared/lib/supabaseErrors';
import type {
  CompanyDirectoryEntry,
  TransporterCompanyLink,
  TransporterCompanyLinkStatus,
} from '@/shared/types';

export async function listCompanyDirectory(): Promise<CompanyDirectoryEntry[]> {
  const { data, error } = await supabase.rpc('public_company_directory');
  if (error) throw new Error(mensajeSupabaseConPista(error));
  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    razon_social: String(row.razon_social ?? 'Empresa'),
    rif: String(row.rif ?? '—'),
  }));
}

export async function requestTransporterCompanyLink(input: {
  transporterId: string;
  companyId: string;
}): Promise<TransporterCompanyLinkStatus> {
  const { data: existing, error: existingError } = await supabase
    .from('transporter_company_links')
    .select('id, status')
    .eq('transporter_id', input.transporterId)
    .eq('company_id', input.companyId)
    .order('creado_en', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existingError) throw new Error(mensajeSupabaseConPista(existingError));
  if (existing) {
    const status = String(existing.status) as TransporterCompanyLinkStatus;
    if (status === 'rejected') {
      const { error: retryError } = await supabase
        .from('transporter_company_links')
        .update({
          status: 'pending',
          actualizado_en: new Date().toISOString(),
        })
        .eq('id', existing.id);
      if (retryError) throw new Error(mensajeSupabaseConPista(retryError));
      return 'pending';
    }
    return status;
  }

  const { error } = await supabase.from('transporter_company_links').insert({
    transporter_id: input.transporterId,
    company_id: input.companyId,
    status: 'pending',
  });
  if (error) throw new Error(mensajeSupabaseConPista(error));
  return 'pending';
}

export async function listTransporterLinksForCompany(companyId: string): Promise<TransporterCompanyLink[]> {
  const { data, error } = await supabase
    .from('transporter_company_links')
    .select(`
      id,
      transporter_id,
      company_id,
      status,
      creado_en,
      actualizado_en,
      transporter:perfiles!transporter_id(id, nombre, telefono, municipio)
    `)
    .eq('company_id', companyId)
    .order('creado_en', { ascending: false });
  if (error) throw new Error(mensajeSupabaseConPista(error));
  return (data ?? []) as unknown as TransporterCompanyLink[];
}

export async function listTransporterLinksForTransporter(transporterId: string): Promise<TransporterCompanyLink[]> {
  const { data, error } = await supabase
    .from('transporter_company_links')
    .select(`
      id,
      transporter_id,
      company_id,
      status,
      creado_en,
      actualizado_en,
      company:companies!company_id(id, razon_social, rif, telefono_contacto)
    `)
    .eq('transporter_id', transporterId)
    .order('creado_en', { ascending: false });
  if (error) throw new Error(mensajeSupabaseConPista(error));
  return (data ?? []) as unknown as TransporterCompanyLink[];
}

export async function respondTransporterCompanyLink(linkId: string, accept: boolean): Promise<void> {
  const { error } = await supabase
    .from('transporter_company_links')
    .update({
      status: accept ? 'approved' : 'rejected',
      actualizado_en: new Date().toISOString(),
    })
    .eq('id', linkId);
  if (error) throw new Error(mensajeSupabaseConPista(error));
}

export async function getCurrentTransporterCompanyContext(transporterId: string): Promise<TransporterCompanyLink | null> {
  const links = await listTransporterLinksForTransporter(transporterId);
  return links.find((item) => item.status === 'approved') ?? links.find((item) => item.status === 'pending') ?? null;
}
