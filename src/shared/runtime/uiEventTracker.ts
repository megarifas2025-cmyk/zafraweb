import Constants from 'expo-constants';
import * as Location from 'expo-location';
import { Platform } from 'react-native';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/shared/lib/supabase';
import { logWarn, serializeError } from '@/shared/runtime/appLogger';
import type { Perfil } from '@/shared/types';

export type UiEventType =
  | 'screen_view'
  | 'tap'
  | 'submit'
  | 'open_modal'
  | 'close_modal'
  | 'navigate'
  | 'error_ui'
  | 'state_change';

type UiEventInput = {
  eventType: UiEventType;
  eventName: string;
  screen?: string | null;
  module?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  status?: string | null;
  metadata?: Record<string, unknown> | null;
};

type QueuedUiEvent = UiEventInput & {
  ts: string;
  sessionKey: string;
};

const BATCH_SIZE = 20;
const FLUSH_DELAY_MS = 4_000;
const LOGIN_COORD_PRECISION = 3;
const SCREEN_VIEW_DEDUPE_MS = 900;

let activeSessionKey: string | null = null;
let queue: QueuedUiEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let flushing = false;
let lastScreenKey = '';
let lastScreenAt = 0;
const capturedLoginSessions = new Set<string>();

function getAppVersion(): string | null {
  return Constants.expoConfig?.version ?? null;
}

function trimOrNull(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function roundApprox(value: number | null | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Number(value.toFixed(LOGIN_COORD_PRECISION));
}

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushUiEventQueue();
  }, FLUSH_DELAY_MS);
}

function safeMetadata(metadata: Record<string, unknown> | null | undefined): Record<string, unknown> {
  return metadata ?? {};
}

export function buildTrackingSessionKey(session: Session | null | undefined): string | null {
  if (!session?.user?.id) return null;
  const seed = session.user.last_sign_in_at
    ?? (typeof session.expires_at === 'number' ? String(session.expires_at) : null)
    ?? new Date().toISOString();
  const raw = `${session.user.id}:${seed}`;
  return raw.replace(/[^a-zA-Z0-9:._-]/g, '');
}

export function setUiTrackingContext(input: { sessionKey: string | null }) {
  activeSessionKey = trimOrNull(input.sessionKey);
}

export function clearUiTrackingContext() {
  activeSessionKey = null;
  queue = [];
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
}

export function trackUiEvent(input: UiEventInput) {
  const sessionKey = activeSessionKey;
  if (!sessionKey) return;

  queue.push({
    ...input,
    eventName: input.eventName.trim(),
    sessionKey,
    ts: new Date().toISOString(),
    metadata: safeMetadata(input.metadata),
  });

  if (queue.length >= BATCH_SIZE) {
    void flushUiEventQueue();
    return;
  }

  scheduleFlush();
}

export function trackScreenView(screen: string, metadata?: Record<string, unknown> | null) {
  const normalized = screen.trim();
  const now = Date.now();
  if (lastScreenKey === normalized && now - lastScreenAt < SCREEN_VIEW_DEDUPE_MS) return;
  lastScreenKey = normalized;
  lastScreenAt = now;
  trackUiEvent({
    eventType: 'screen_view',
    eventName: 'screen_view',
    screen: normalized,
    module: normalized,
    metadata,
  });
}

export async function flushUiEventQueue() {
  if (flushing || !activeSessionKey || !queue.length) return;
  flushing = true;
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }

  const batch = queue.slice(0, BATCH_SIZE);
  queue = queue.slice(batch.length);

  try {
    const { error } = await supabase.functions.invoke('ingest-app-log', {
      body: {
        kind: 'ui_events_batch',
        appVersion: getAppVersion(),
        platform: Platform.OS,
        sessionKey: activeSessionKey,
        events: batch,
      },
    });

    if (error) {
      throw new Error(error.message);
    }
  } catch (error) {
    logWarn('ui_event_tracker.flush', 'No se pudo persistir el lote de eventos UI.', {
      size: batch.length,
      error: serializeError(error),
    });
    queue = [...batch, ...queue].slice(0, 200);
  } finally {
    flushing = false;
    if (queue.length) scheduleFlush();
  }
}

export async function captureLoginSessionLocation(input: {
  sessionKey: string;
  perfil: Pick<Perfil, 'id' | 'rol' | 'estado_ve' | 'municipio'>;
}) {
  const sessionKey = trimOrNull(input.sessionKey);
  if (!sessionKey || capturedLoginSessions.has(sessionKey)) return;
  capturedLoginSessions.add(sessionKey);
  if (capturedLoginSessions.size > 40) {
    const first = capturedLoginSessions.values().next().value as string | undefined;
    if (first) capturedLoginSessions.delete(first);
  }

  let latitude: number | null = null;
  let longitude: number | null = null;
  let accuracyM: number | null = null;
  let estadoVe = trimOrNull(input.perfil.estado_ve);
  let municipio = trimOrNull(input.perfil.municipio);
  const metadata: Record<string, unknown> = {
    location_scope: 'login_location_only',
    role: input.perfil.rol,
  };

  try {
    const permission = await Location.requestForegroundPermissionsAsync();
    metadata.permission_status = permission.status;

    if (permission.granted) {
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      latitude = roundApprox(position.coords.latitude);
      longitude = roundApprox(position.coords.longitude);
      accuracyM = typeof position.coords.accuracy === 'number'
        ? Math.round(position.coords.accuracy)
        : null;

      try {
        const geocoded = await Location.reverseGeocodeAsync({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
        const first = geocoded[0];
        estadoVe = trimOrNull(first?.region) ?? estadoVe;
        municipio = trimOrNull(first?.city) ?? trimOrNull(first?.subregion) ?? municipio;
      } catch (geoError) {
        metadata.reverse_geocode_error = serializeError(geoError);
      }
    }
  } catch (error) {
    metadata.capture_error = serializeError(error);
    logWarn('ui_event_tracker.login_location', 'No se pudo capturar la ubicación del inicio de sesión.', {
      perfilId: input.perfil.id,
      error: serializeError(error),
    });
  }

  try {
    const { error } = await supabase.functions.invoke('ingest-app-log', {
      body: {
        kind: 'session_login',
        sessionKey,
        appVersion: getAppVersion(),
        platform: Platform.OS,
        deviceLabel: `${Platform.OS}-${String(Platform.Version)}`,
        latitude,
        longitude,
        accuracyM,
        estadoVe,
        municipio,
        metadata,
      },
    });

    if (error) {
      throw new Error(error.message);
    }
  } catch (error) {
    logWarn('ui_event_tracker.login_location', 'No se pudo persistir el inicio de sesión en observabilidad.', {
      perfilId: input.perfil.id,
      error: serializeError(error),
    });
  }
}
