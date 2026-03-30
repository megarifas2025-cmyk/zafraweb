import * as TaskManager from 'expo-task-manager';
import type { TaskManagerTaskBody } from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/shared/lib/supabase';
import { logWarn } from '@/shared/runtime/appLogger';
import type { RolUsuario } from '@/shared/types';

export const FREIGHT_BACKGROUND_TASK = 'freight-background-tracking';
export const FREIGHT_BACKGROUND_CONTEXT_KEY = '@zafraclic/freight-background-context';

type StoredTrackingContext = {
  freightRequestId: string;
  actorId: string;
  actorRole: RolUsuario;
  label?: string | null;
};

type BackgroundTaskPayload = {
  locations?: Array<{ coords?: { latitude?: number; longitude?: number; accuracy?: number | null } }>;
};

TaskManager.defineTask(FREIGHT_BACKGROUND_TASK, async ({ data, error }: TaskManagerTaskBody<BackgroundTaskPayload>) => {
  if (error) {
    logWarn('freight.bg.task', 'Error recibido por la tarea de tracking background.', {
      message: error.message,
    });
    return;
  }

  const payload = data as BackgroundTaskPayload | undefined;
  const locations = payload?.locations ?? [];
  if (!locations.length) return;

  const rawContext = await AsyncStorage.getItem(FREIGHT_BACKGROUND_CONTEXT_KEY);
  if (!rawContext) return;

  const context: StoredTrackingContext | null = (() => {
    try {
      return JSON.parse(rawContext) as StoredTrackingContext;
    } catch {
      return null;
    }
  })();
  if (!context?.freightRequestId || !context.actorId) return;

  const latest = locations[locations.length - 1];
  const coords = latest?.coords;
  if (typeof coords?.latitude !== 'number' || typeof coords?.longitude !== 'number') return;

  const { error: insertError } = await supabase.from('freight_tracking_updates').insert({
    freight_request_id: context.freightRequestId,
    actor_id: context.actorId,
    actor_role: context.actorRole,
    event_type: 'location_ping',
    lat: coords.latitude,
    lng: coords.longitude,
    accuracy_m: coords.accuracy ?? null,
    label: context.label ?? null,
  });

  if (insertError) {
    logWarn('freight.bg.task_insert', 'No se pudo insertar ping de tracking en Supabase.', {
      freightRequestId: context.freightRequestId,
      actorId: context.actorId,
      message: insertError.message,
      code: insertError.code ?? null,
    });
  }
});
