import type { Perfil } from '@/shared/types';

type AccountStatusProfile = Pick<Perfil, 'bloqueado' | 'kyc_estado'> | null | undefined;

export function isAccountVerified(perfil: AccountStatusProfile): boolean {
  return !!perfil && !perfil.bloqueado && perfil.kyc_estado === 'verified';
}

export function getAccountStatusLabel(perfil: AccountStatusProfile): string {
  if (!perfil) return 'Sin perfil';
  if (perfil.bloqueado || perfil.kyc_estado === 'bloqueado') return 'Cuenta bloqueada';
  if (perfil.kyc_estado === 'verified') return 'Cuenta operativa';
  if (perfil.kyc_estado === 'rechazado') return 'KYC rechazado';
  if (perfil.kyc_estado === 'en_revision') return 'KYC en revisión';
  return 'KYC pendiente';
}

export function getCommercialStatusLabel(perfil: AccountStatusProfile): string {
  if (!perfil) return 'En revisión';
  if (perfil.bloqueado || perfil.kyc_estado === 'bloqueado') return 'Bloqueada';
  if (perfil.kyc_estado === 'verified') return 'Operativa';
  if (perfil.kyc_estado === 'rechazado') return 'Requiere corrección';
  if (perfil.kyc_estado === 'en_revision') return 'En revisión';
  return 'Pendiente KYC';
}

export function getRestrictedActionMessage(perfil: AccountStatusProfile): string | null {
  if (!perfil) return 'Tu cuenta aún no está lista. Inicia sesión nuevamente e intenta de nuevo.';
  if (perfil.bloqueado || perfil.kyc_estado === 'bloqueado') {
    return 'Tu cuenta fue bloqueada temporalmente por el equipo administrativo. Contacta soporte para revisar el caso.';
  }
  if (perfil.kyc_estado === 'rechazado') {
    return 'Tu KYC fue rechazado. Corrige tus datos y vuelve a enviar los documentos antes de continuar.';
  }
  if (perfil.kyc_estado === 'en_revision' || perfil.kyc_estado === 'pendiente') {
    return 'Tu cuenta todavía no está habilitada para esta acción. Completa o espera la revisión KYC desde tu perfil.';
  }
  return null;
}
