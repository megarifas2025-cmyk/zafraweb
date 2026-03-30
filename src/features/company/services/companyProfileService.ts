import { supabase } from '@/shared/lib/supabase';
import { mensajeSupabaseConPista } from '@/shared/lib/supabaseErrors';
import type { CompanyRow } from '@/features/company/hooks/useCompany';

export type CompanyProfileInput = {
  razon_social: string;
  rif: string;
  direccion_fiscal: string;
  direccion?: string | null;
  telefono_contacto: string;
  correo_contacto: string;
  logo_url?: string | null;
};

function normalizeRif(value: string): string {
  return value.toUpperCase().replace(/\s+/g, '').replace(/[^A-Z0-9-]/g, '');
}

function isRifValid(value: string): boolean {
  return /^[JGVEP]-\d{8}-\d$/i.test(value);
}

function isEmailValid(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim().toLowerCase());
}

function digitsOnly(value: string): string {
  return value.replace(/\D/g, '');
}

export function validateCompanyProfileInput(input: CompanyProfileInput): string | null {
  if (!input.razon_social.trim()) return 'Ingresa la razón social de la empresa.';
  const rif = normalizeRif(input.rif);
  if (!isRifValid(rif)) return 'Ingresa un RIF válido con formato J-12345678-9.';
  if (!input.direccion_fiscal.trim()) return 'Ingresa la dirección fiscal.';
  if (digitsOnly(input.telefono_contacto).length < 10) return 'Ingresa un teléfono de contacto válido.';
  if (!isEmailValid(input.correo_contacto)) return 'Ingresa un correo corporativo válido.';
  if (input.logo_url?.trim() && !/^https?:\/\//i.test(input.logo_url.trim())) {
    return 'La URL del logo debe comenzar por http:// o https://';
  }
  return null;
}

export async function upsertCompanyProfile(perfilId: string, input: CompanyProfileInput): Promise<CompanyRow> {
  const payload = {
    perfil_id: perfilId,
    razon_social: input.razon_social.trim(),
    rif: normalizeRif(input.rif),
    direccion_fiscal: input.direccion_fiscal.trim(),
    direccion: input.direccion?.trim() ? input.direccion.trim() : null,
    telefono_contacto: input.telefono_contacto.trim(),
    correo_contacto: input.correo_contacto.trim().toLowerCase(),
    logo_url: input.logo_url?.trim() || '',
  };

  const { data, error } = await supabase
    .from('companies')
    .upsert(payload, { onConflict: 'perfil_id' })
    .select('*')
    .single();

  if (error) throw new Error(mensajeSupabaseConPista(error));
  return data as CompanyRow;
}
