import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

type RuntimeLogBody = {
  kind?: 'runtime_log';
  level?: 'info' | 'warn' | 'error';
  scope?: string;
  message?: string;
  details?: Record<string, unknown> | null;
  appVersion?: string | null;
  platform?: string | null;
};

type UiEventType =
  | 'screen_view'
  | 'tap'
  | 'submit'
  | 'open_modal'
  | 'close_modal'
  | 'navigate'
  | 'error_ui'
  | 'state_change';

type UiEventItem = {
  ts?: string;
  sessionKey?: string;
  eventType?: UiEventType;
  eventName?: string;
  screen?: string | null;
  module?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  status?: string | null;
  metadata?: Record<string, unknown> | null;
};

type UiEventsBatchBody = {
  kind: 'ui_events_batch';
  appVersion?: string | null;
  platform?: string | null;
  sessionKey?: string | null;
  events?: UiEventItem[];
};

type SessionLoginBody = {
  kind: 'session_login';
  appVersion?: string | null;
  platform?: string | null;
  sessionKey?: string | null;
  deviceLabel?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  accuracyM?: number | null;
  estadoVe?: string | null;
  municipio?: string | null;
  metadata?: Record<string, unknown> | null;
};

type RequestBody = RuntimeLogBody | UiEventsBatchBody | SessionLoginBody;

function jsonResponse(payload: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: corsHeaders,
  });
}

function sanitizeText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

function sanitizeNumber(value: unknown, digits = 3): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Number(value.toFixed(digits));
}

function sanitizeMetadata(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function isUiEventType(value: unknown): value is UiEventType {
  return value === 'screen_view'
    || value === 'tap'
    || value === 'submit'
    || value === 'open_modal'
    || value === 'close_modal'
    || value === 'navigate'
    || value === 'error_ui'
    || value === 'state_change';
}

async function resolveActorRole(
  adminClient: ReturnType<typeof createClient>,
  userId: string,
  userMetadata: Record<string, unknown>,
): Promise<string | null> {
  let actorRole: string | null = typeof userMetadata.rol === 'string' ? userMetadata.rol : null;

  const { data: perfilRow } = await adminClient
    .from('perfiles')
    .select('rol')
    .eq('id', userId)
    .maybeSingle();

  if (perfilRow?.rol && typeof perfilRow.rol === 'string') {
    actorRole = perfilRow.rol;
  }

  return actorRole;
}

async function insertRuntimeLog(
  adminClient: ReturnType<typeof createClient>,
  actorId: string,
  actorRole: string | null,
  body: RuntimeLogBody,
) {
  const level = body.level === 'info' || body.level === 'warn' || body.level === 'error'
    ? body.level
    : 'error';
  const scope = sanitizeText(body.scope, 120);
  const message = sanitizeText(body.message, 500);

  if (!scope || !message) {
    return jsonResponse({ error: 'scope and message are required.' }, 400);
  }

  const { error } = await adminClient.from('app_runtime_logs').insert({
    actor_id: actorId,
    actor_role: actorRole,
    level,
    scope,
    message,
    details: body.details ?? null,
    app_version: sanitizeText(body.appVersion, 60),
    platform: sanitizeText(body.platform, 40),
  });

  if (error) {
    return jsonResponse({ error: error.message }, 500);
  }

  return jsonResponse({ ok: true }, 200);
}

async function insertUiEventsBatch(
  adminClient: ReturnType<typeof createClient>,
  actorId: string,
  actorRole: string | null,
  body: UiEventsBatchBody,
) {
  const events = Array.isArray(body.events) ? body.events.slice(0, 50) : [];
  const rootSessionKey = sanitizeText(body.sessionKey, 180);

  if (!events.length) {
    return jsonResponse({ error: 'events are required.' }, 400);
  }

  const rows = events.flatMap((event) => {
    const eventType = isUiEventType(event.eventType) ? event.eventType : null;
    const eventName = sanitizeText(event.eventName, 120);
    const sessionKey = sanitizeText(event.sessionKey, 180) ?? rootSessionKey;
    if (!eventType || !eventName || !sessionKey) return [];

    return [{
      actor_id: actorId,
      actor_role: actorRole,
      session_key: sessionKey,
      event_type: eventType,
      event_name: eventName,
      screen: sanitizeText(event.screen, 120),
      module: sanitizeText(event.module, 80),
      target_type: sanitizeText(event.targetType, 80),
      target_id: sanitizeText(event.targetId, 120),
      status: sanitizeText(event.status, 40),
      metadata: sanitizeMetadata(event.metadata),
      app_version: sanitizeText(body.appVersion, 60),
      platform: sanitizeText(body.platform, 40),
      created_at: sanitizeText(event.ts, 64) ?? new Date().toISOString(),
    }];
  });

  if (!rows.length) {
    return jsonResponse({ error: 'No valid UI events found.' }, 400);
  }

  const { error } = await adminClient.from('ui_event_logs').insert(rows);
  if (error) {
    return jsonResponse({ error: error.message }, 500);
  }

  return jsonResponse({ ok: true, inserted: rows.length }, 200);
}

async function upsertSessionLogin(
  adminClient: ReturnType<typeof createClient>,
  actorId: string,
  actorRole: string | null,
  body: SessionLoginBody,
) {
  const sessionKey = sanitizeText(body.sessionKey, 180);
  if (!sessionKey) {
    return jsonResponse({ error: 'sessionKey is required.' }, 400);
  }

  const row = {
    actor_id: actorId,
    actor_role: actorRole,
    session_key: sessionKey,
    platform: sanitizeText(body.platform, 40),
    app_version: sanitizeText(body.appVersion, 60),
    device_label: sanitizeText(body.deviceLabel, 120),
    latitude: sanitizeNumber(body.latitude),
    longitude: sanitizeNumber(body.longitude),
    accuracy_m: sanitizeNumber(body.accuracyM, 0),
    estado_ve: sanitizeText(body.estadoVe, 120),
    municipio: sanitizeText(body.municipio, 120),
    metadata: sanitizeMetadata(body.metadata),
  };

  const { error } = await adminClient
    .from('session_login_logs')
    .upsert(row, { onConflict: 'actor_id,session_key' });

  if (error) {
    return jsonResponse({ error: error.message }, 500);
  }

  return jsonResponse({ ok: true }, 200);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Only POST is supported.' }, 400);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const authHeader = req.headers.get('Authorization') ?? req.headers.get('authorization') ?? '';

  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return jsonResponse({ error: 'Missing Supabase env.' }, 500);
  }

  if (!authHeader.startsWith('Bearer ')) {
    return jsonResponse({ error: 'Missing bearer token.' }, 401);
  }

  const authClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const { data: authData, error: authError } = await authClient.auth.getUser();
  if (authError || !authData.user) {
    return jsonResponse({ error: authError?.message ?? 'Unauthorized' }, 401);
  }

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return jsonResponse({ error: 'Invalid JSON body.' }, 400);
  }

  const metadata = (authData.user.user_metadata ?? {}) as Record<string, unknown>;
  const actorRole = await resolveActorRole(adminClient, authData.user.id, metadata);
  const kind = body.kind === 'ui_events_batch' || body.kind === 'session_login'
    ? body.kind
    : 'runtime_log';

  if (kind === 'ui_events_batch') {
    return insertUiEventsBatch(adminClient, authData.user.id, actorRole, body);
  }

  if (kind === 'session_login') {
    return upsertSessionLogin(adminClient, authData.user.id, actorRole, body);
  }

  return insertRuntimeLog(adminClient, authData.user.id, actorRole, body);
});
