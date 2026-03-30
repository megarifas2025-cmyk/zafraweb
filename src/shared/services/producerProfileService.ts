import { supabase } from '@/shared/lib/supabase';
import { listAffiliationsForProducer, type CompanyAffiliation } from '@/shared/services/companyAffiliationsService';
import { listarFinanciamientosComoProductor, type LoteFinanciadoProductor } from '@/shared/services/financingService';
import type { Perfil } from '@/shared/types';

export type ProducerProfileSnapshot = {
  producer: Pick<
    Perfil,
    | 'id'
    | 'rol'
    | 'nombre'
    | 'telefono'
    | 'estado_ve'
    | 'municipio'
    | 'kyc_estado'
    | 'avatar_url'
    | 'reputacion'
    | 'total_tratos'
    | 'trust_score'
    | 'zafras_completadas'
    | 'bloqueado'
  >;
  affiliations: CompanyAffiliation[];
  financedLots: LoteFinanciadoProductor[];
};

const PRODUCER_PROFILE_SELECT =
  'id, rol, nombre, telefono, estado_ve, municipio, kyc_estado, avatar_url, reputacion, total_tratos, trust_score, zafras_completadas, bloqueado';

export async function getProducerProfileSnapshot(producerId: string): Promise<ProducerProfileSnapshot> {
  const { data, error } = await supabase
    .from('perfiles')
    .select(PRODUCER_PROFILE_SELECT)
    .eq('id', producerId)
    .eq('rol', 'independent_producer')
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error('No se encontró el perfil del productor solicitado.');
  }

  const [affiliations, financedLots] = await Promise.all([
    listAffiliationsForProducer(producerId).catch(() => []),
    listarFinanciamientosComoProductor(producerId).catch(() => []),
  ]);

  return {
    producer: data as ProducerProfileSnapshot['producer'],
    affiliations: affiliations.filter((row) => row.status === 'active'),
    financedLots,
  };
}
