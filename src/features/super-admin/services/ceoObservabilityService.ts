import { supabase } from '@/shared/lib/supabase';
import type {
  CeoObservabilitySummary,
  RolUsuario,
  SessionLoginLogEntry,
  UiEventLogEntry,
} from '@/shared/types';

export type UiEventFilters = {
  limit?: number;
  offset?: number;
  role?: RolUsuario | 'all';
  userId?: string;
  screen?: string;
  eventType?: UiEventLogEntry['event_type'] | 'all';
  sessionKey?: string;
};

export type SessionLoginFilters = {
  limit?: number;
  offset?: number;
  role?: RolUsuario | 'all';
  userId?: string;
  sessionKey?: string;
};

export type UiEventFeedRow = UiEventLogEntry & {
  actor_name?: string | null;
};

export type SessionLoginFeedRow = SessionLoginLogEntry & {
  actor_name?: string | null;
};

function clampLimit(value: number | undefined, fallback = 40) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(1, Math.min(120, Math.floor(value)));
}

async function hydrateActorNames<T extends { actor_id: string }>(rows: T[]): Promise<Array<T & { actor_name?: string | null }>> {
  const actorIds = Array.from(new Set(rows.map((row) => row.actor_id).filter(Boolean)));
  if (!actorIds.length) return rows;

  const { data, error } = await supabase
    .from('perfiles')
    .select('id, nombre')
    .in('id', actorIds);

  if (error || !data) return rows;
  const byId = new Map<string, string>();
  for (const row of data as Array<{ id: string; nombre: string | null }>) {
    if (row?.id) byId.set(row.id, row.nombre ?? '');
  }

  return rows.map((row) => ({
    ...row,
    actor_name: byId.get(row.actor_id) ?? null,
  }));
}

export async function fetchCeoObservabilitySummary(hours = 24): Promise<CeoObservabilitySummary> {
  const { data, error } = await supabase.rpc('ceo_observability_summary', {
    p_window_hours: hours,
  });

  if (error) throw error;
  const raw = (data ?? {}) as Partial<CeoObservabilitySummary>;

  return {
    events_total: Number(raw.events_total ?? 0),
    unique_users: Number(raw.unique_users ?? 0),
    login_count: Number(raw.login_count ?? 0),
    ui_errors: Number(raw.ui_errors ?? 0),
    top_screens: Array.isArray(raw.top_screens) ? raw.top_screens : [],
    roles: Array.isArray(raw.roles) ? raw.roles : [],
  };
}

export async function listUiEventFeed(filters: UiEventFilters = {}): Promise<UiEventFeedRow[]> {
  const limit = clampLimit(filters.limit, 50);
  const offset = Math.max(0, Math.floor(filters.offset ?? 0));
  let query = supabase
    .from('ui_event_logs')
    .select('id, actor_id, actor_role, session_key, event_type, event_name, screen, module, target_type, target_id, status, metadata, app_version, platform, created_at')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (filters.role && filters.role !== 'all') {
    query = query.eq('actor_role', filters.role);
  }
  if (filters.userId) {
    query = query.eq('actor_id', filters.userId);
  }
  if (filters.screen) {
    query = query.eq('screen', filters.screen);
  }
  if (filters.eventType && filters.eventType !== 'all') {
    query = query.eq('event_type', filters.eventType);
  }
  if (filters.sessionKey) {
    query = query.eq('session_key', filters.sessionKey);
  }

  const { data, error } = await query;
  if (error) throw error;
  return hydrateActorNames((data ?? []) as UiEventFeedRow[]);
}

export async function listSessionLoginFeed(filters: SessionLoginFilters = {}): Promise<SessionLoginFeedRow[]> {
  const limit = clampLimit(filters.limit, 50);
  const offset = Math.max(0, Math.floor(filters.offset ?? 0));
  let query = supabase
    .from('session_login_logs')
    .select('id, actor_id, actor_role, session_key, platform, app_version, device_label, latitude, longitude, accuracy_m, estado_ve, municipio, metadata, created_at')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (filters.role && filters.role !== 'all') {
    query = query.eq('actor_role', filters.role);
  }
  if (filters.userId) {
    query = query.eq('actor_id', filters.userId);
  }
  if (filters.sessionKey) {
    query = query.eq('session_key', filters.sessionKey);
  }

  const { data, error } = await query;
  if (error) throw error;
  return hydrateActorNames((data ?? []) as SessionLoginFeedRow[]);
}
