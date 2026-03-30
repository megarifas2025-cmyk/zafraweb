/**
 * KYC manual: sin OCR/IA.
 * Cliente: sube y guarda. Bloqueo comercial hasta kyc_estado = 'verified'
 */
import { isKycDisabledGlobally } from '@/shared/config/kycBypass';
import { supabase } from '@/shared/lib/supabase';
import { storageService } from './storageService';

export interface DatosDoc {
  tipo: 'cedula' | 'rif' | 'acta_constitutiva';
  numero: string;
  nombre: string;
  valido: boolean;
  confianza: number;
  observaciones?: string;
}

export const kycService = {
  async extraerDatos(_uri: string, tipo: 'cedula' | 'rif' | 'acta_constitutiva'): Promise<DatosDoc> {
    return {
      tipo,
      numero: '',
      nombre: '',
      valido: false,
      confianza: 0,
      observaciones: 'Documento recibido sin análisis automático. Pendiente por revisión manual.',
    };
  },

  async enviarDocumento(userId: string, uri: string, tipo: 'cedula' | 'rif' | 'acta_constitutiva') {
    const docData = await this.extraerDatos(uri, tipo);
    const url = await storageService.subirKyc(userId, tipo, uri);
    const { data: doc, error } = await supabase.from('kyc_docs').insert({
      perfil_id: userId, tipo, numero: docData.numero, archivo_url: url,
      ia_resultado: docData as unknown as Record<string, unknown>, ia_confianza: docData.confianza,
    }).select().single();
    if (error) throw error;
    if (!isKycDisabledGlobally()) {
      const { error: kycErr } = await supabase
        .from('perfiles')
        .update({ kyc_estado: 'en_revision' })
        .eq('id', userId);
      if (kycErr) throw new Error(`No se pudo actualizar el estado KYC: ${kycErr.message}`);
    }
    return { docData, docId: doc.id };
  },
};
