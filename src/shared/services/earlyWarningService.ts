import { supabase } from '@/shared/lib/supabase';

export type EarlyWarningEstatus = 'open' | 'reviewed' | 'resolved';

export async function crearEarlyWarning(input: {
  productorId: string;
  fincaId: string;
  fotoUrl: string | null;
  diagnosticoIa: string | null;
  descripcionUsuario: string | null;
}): Promise<void> {
  const { error } = await supabase.from('early_warnings').insert({
    productor_id: input.productorId,
    finca_id: input.fincaId,
    foto_url: input.fotoUrl,
    diagnostico_ia: input.diagnosticoIa,
    descripcion_usuario: input.descripcionUsuario,
    estatus: 'open',
  });
  if (error) throw error;
}
