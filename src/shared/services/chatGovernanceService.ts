import { supabase } from '@/shared/lib/supabase';
import type { ChatAuditMessage, ChatIncident, ChatIncidentCategory, ChatIncidentStatus } from '@/shared/types';

export async function reportChatIncident(input: {
  source: 'market' | 'logistics';
  salaId?: string | null;
  logisticsSalaId?: string | null;
  /** reportedBy es ignorado intencionalmente: la función DB usa auth.uid() por seguridad */
  reportedBy?: string;
  offenderId?: string | null;
  category: ChatIncidentCategory;
  severity: 'media' | 'alta' | 'critica';
  reason: string;
  messageExcerpt?: string | null;
  autoDetected?: boolean;
}) {
  const { error } = await supabase.rpc('report_chat_incident', {
    p_source: input.source,
    p_sala_id: input.salaId ?? null,
    p_logistics_sala_id: input.logisticsSalaId ?? null,
    p_offender_id: input.offenderId ?? null,
    p_category: input.category,
    p_severity: input.severity,
    p_reason: input.reason,
    p_message_excerpt: input.messageExcerpt ?? null,
    p_auto_detected: input.autoDetected ?? false,
  });
  if (error) throw error;
}

export async function listChatIncidentsForCeo(limit = 60): Promise<ChatIncident[]> {
  const { data, error } = await supabase
    .from('chat_incidents')
    .select('id, source, sala_id, logistics_sala_id, reported_by, offender_id, category, severity, message_excerpt, reason, status, auto_detected, created_at, reviewed_at, reviewed_by')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as ChatIncident[];
}

export async function updateChatIncidentStatus(
  incidentId: string,
  reviewerId: string,
  status: ChatIncidentStatus,
) {
  const { error } = await supabase
    .from('chat_incidents')
    .update({
      status,
      reviewed_by: reviewerId,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', incidentId);
  if (error) throw error;
}

export async function getChatAuditMessages(incidentId: string): Promise<ChatAuditMessage[]> {
  const { data, error } = await supabase.rpc('ceo_get_chat_audit_messages', {
    p_incident_id: incidentId,
  });
  if (error) throw error;
  return (data ?? []) as ChatAuditMessage[];
}
