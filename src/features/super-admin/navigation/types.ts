import type { ProducerProfileAccessContext } from '@/shared/entities/producer-profile/producerProfileAccess';
import type { RolUsuario, UiEventLogEntry } from '@/shared/types';

export type SuperAdminStackParamList = {
  SuperAdminHome: undefined;
  CeoUsersOverview: undefined;
  CeoGlobalActivity: {
    initialRole?: RolUsuario | 'all';
    initialEventType?: UiEventLogEntry['event_type'] | 'all';
    initialScreen?: string;
    initialSessionKey?: string;
    title?: string;
    subtitle?: string;
  } | undefined;
  CeoAccessSessions: undefined;
  CeoFreightSupervision: undefined;
  CreatePeritoAccount: undefined;
  CeoGovernance: undefined;
  CeoAuditTrail: undefined;
  CeoSystemReport: undefined;
  CeoChatIncidents: undefined;
  CeoChatAudit: { incidentId: string; incidentTitle?: string | null };
  SharedProducerProfile: {
    producerId: string;
    producerName?: string;
    accessContext?: ProducerProfileAccessContext;
  };
};
