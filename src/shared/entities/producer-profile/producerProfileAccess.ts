import type { RolUsuario } from '@/shared/types';

export type ProducerProfileAccessContext =
  | 'owner'
  | 'company_view'
  | 'buyer_view'
  | 'zafra_ceo_view'
  | 'read_only';

export type ProducerProfileAccess = {
  context: ProducerProfileAccessContext;
  canEditProfile: boolean;
  canViewAffiliations: boolean;
  canViewFinancedLots: boolean;
  canSeeContactPhone: boolean;
  canInitiateOffer: boolean;
  heroLabel: string;
  helperText: string;
};

type ResolveProducerProfileAccessInput = {
  viewerRole: RolUsuario | null | undefined;
  producerId: string | null | undefined;
  viewerId?: string | null | undefined;
  requestedContext?: ProducerProfileAccessContext | null | undefined;
};

export function resolveProducerProfileAccess({
  viewerRole,
  producerId,
  viewerId,
  requestedContext,
}: ResolveProducerProfileAccessInput): ProducerProfileAccess {
  const isOwner = !!viewerId && !!producerId && viewerId === producerId && viewerRole === 'independent_producer';

  if (isOwner || requestedContext === 'owner') {
    return {
      context: 'owner',
      canEditProfile: true,
      canViewAffiliations: true,
      canViewFinancedLots: true,
      canSeeContactPhone: true,
      canInitiateOffer: false,
      heroLabel: 'Productor · Campo y cosechas',
      helperText: 'Gestiona tus datos operativos, empresas vinculadas y lotes financiados desde un solo perfil.',
    };
  }

  if (viewerRole === 'company' || requestedContext === 'company_view') {
    return {
      context: 'company_view',
      canEditProfile: false,
      canViewAffiliations: true,
      canViewFinancedLots: true,
      canSeeContactPhone: true,
      canInitiateOffer: false,
      heroLabel: 'Vista empresa · Productor vinculado',
      helperText: 'Consulta la ficha operativa del productor sin exponer acciones de edición del propietario.',
    };
  }

  if (viewerRole === 'buyer' || requestedContext === 'buyer_view') {
    return {
      context: 'buyer_view',
      canEditProfile: false,
      canViewAffiliations: false,
      canViewFinancedLots: false,
      canSeeContactPhone: false,
      canInitiateOffer: true,
      heroLabel: 'Vista comprador · Productor',
      helperText: 'Puedes revisar la identidad operativa del productor y luego negociar por canales privados del mercado.',
    };
  }

  if (viewerRole === 'zafra_ceo' || requestedContext === 'zafra_ceo_view') {
    return {
      context: 'zafra_ceo_view',
      canEditProfile: false,
      canViewAffiliations: true,
      canViewFinancedLots: true,
      canSeeContactPhone: true,
      canInitiateOffer: false,
      heroLabel: 'Vista administrativa · Productor',
      helperText: 'Ficha operativa completa para auditoría. Las ediciones las realiza el propietario desde su cuenta.',
    };
  }

  return {
    context: 'read_only',
    canEditProfile: false,
    canViewAffiliations: false,
    canViewFinancedLots: false,
    canSeeContactPhone: false,
    canInitiateOffer: false,
    heroLabel: 'Vista de solo lectura',
    helperText: 'Esta ficha se muestra en modo consulta sin acciones transaccionales.',
  };
}
