import type { PostgrestError } from '@supabase/supabase-js';

/** Añade pista breve según código PostgREST / Postgres. */
export function mensajeSupabaseConPista(err: PostgrestError): string {
  const base = err.message || 'Error de base de datos';
  if (err.code === '42P17') {
    return `${base}\n\n(RLS recursión en perfiles: aplica migraciones supabase/migrations/*perfiles* o ejecuta supabase db push en el proyecto enlazado.)`;
  }
  if (err.code === '42501') {
    return `${base}\n\n(Revisa políticas RLS o permisos en Supabase.)`;
  }
  if (err.code === 'PGRST204' || base.includes('schema cache')) {
    return `${base}\n\n(¿Falta la columna o tabla? Aplica el delta SQL correspondiente.)`;
  }
  return base;
}
