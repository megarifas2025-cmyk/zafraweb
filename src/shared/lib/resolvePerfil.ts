import type { Session } from '@supabase/supabase-js';
import type { Perfil, RolUsuario } from '@/shared/types';
import { shouldBypassKyc } from '@/shared/config/kycBypass';

const ROLES: RolUsuario[] = [
  'zafra_ceo',
  'company',
  'perito',
  'independent_producer',
  'buyer',
  'transporter',
  'agrotienda',
];

const SELF_SERVICE_BYPASS_ROLES: RolUsuario[] = [
  'company',
  'independent_producer',
  'buyer',
  'transporter',
  'agrotienda',
];

/** Perfil mínimo desde metadata de Auth (cuando no hay fila en `perfiles`). */
function perfilDesdeSesion(session: Session, rol: RolUsuario): Perfil {
  const m = session.user.user_metadata as Record<string, unknown>;
  const nombre = typeof m?.nombre === 'string' ? m.nombre : 'Usuario';
  const estadoVe = typeof m?.estado_ve === 'string' && m.estado_ve.trim() ? m.estado_ve : 'Venezuela';
  const municipio = typeof m?.municipio === 'string' ? m.municipio : null;
  const docPref = m?.doc_prefijo;
  const docNum = typeof m?.doc_numero === 'string' ? m.doc_numero : null;
  const fechaNac = typeof m?.fecha_nacimiento === 'string' ? m.fecha_nacimiento : null;
  const now = new Date().toISOString();
  return {
    id:         session.user.id,
    rol,
    nombre,
    telefono:   null,
    estado_ve:  estadoVe,
    municipio,
    kyc_estado: 'verified',
    kyc_fecha:  now,
    avatar_url: null,
    reputacion: 5,
    total_tratos: 0,
    trust_score: 50,
    zafras_completadas: 0,
    activo:     true,
    bloqueado:  false,
    creado_en:  now,
    doc_prefijo: docPref === 'V' || docPref === 'E' || docPref === 'J' || docPref === 'G' ? docPref : null,
    doc_numero: docNum,
    fecha_nacimiento: fechaNac,
    disponibilidad_flete: false,
  };
}

/**
 * Lista bypass o KYC global desactivado: no bloqueamos por KYC en la UI.
 * - Con fila en BD: se fuerza kyc_verified (se respeta `bloqueado` salvo que no haya fila).
 * - Sin fila: perfil mínimo desde user_metadata.
 */
export function resolvePerfilForSession(
  session: Session | null,
  perfilDb: Perfil | null,
  allowSyntheticFallback = true,
): Perfil | null {
  if (!session?.user) return null;
  const metaRol = (session.user.user_metadata as Record<string, unknown> | undefined)?.rol as RolUsuario | undefined;
  if (!shouldBypassKyc(session.user.email)) return perfilDb;
  if (perfilDb) {
    return {
      ...perfilDb,
      kyc_estado: 'verified',
    };
  }
  if (!allowSyntheticFallback) return null;
  if (!metaRol || !ROLES.includes(metaRol) || !SELF_SERVICE_BYPASS_ROLES.includes(metaRol)) {
    return null;
  }
  return perfilDesdeSesion(session, metaRol);
}
