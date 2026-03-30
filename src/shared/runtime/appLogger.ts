import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { supabase } from '@/shared/lib/supabase';

type LogLevel = 'info' | 'warn' | 'error';

type LogPayload = {
  scope: string;
  message: string;
  details?: Record<string, unknown>;
};

function emit(level: LogLevel, payload: LogPayload) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    scope: payload.scope,
    message: payload.message,
    details: payload.details ?? null,
  };

  if (level !== 'info') {
    void persistRuntimeLog(level, payload);
  }

  if (level === 'error') {
    console.error('[app]', JSON.stringify(entry));
    return;
  }

  if (level === 'warn') {
    console.warn('[app]', JSON.stringify(entry));
    return;
  }

  console.info('[app]', JSON.stringify(entry));
}

async function persistRuntimeLog(level: LogLevel, payload: LogPayload) {
  try {
    const appVersion = Constants.expoConfig?.version ?? null;
    const { error } = await supabase.functions.invoke('ingest-app-log', {
      body: {
        level,
        scope: payload.scope,
        message: payload.message,
        details: payload.details ?? null,
        appVersion,
        platform: Platform.OS,
      },
    });

    if (error) {
      console.warn('[app][logger]', JSON.stringify({
        level: 'warn',
        scope: 'runtime.logger',
        message: 'No se pudo persistir el runtime log en Supabase.',
        details: { error: error.message },
      }));
    }
  } catch (error) {
    console.warn('[app][logger]', JSON.stringify({
      level: 'warn',
      scope: 'runtime.logger',
      message: 'Fallo inesperado persistiendo runtime log.',
      details: serializeError(error),
    }));
  }
}

export function logInfo(scope: string, message: string, details?: Record<string, unknown>) {
  emit('info', { scope, message, details });
}

export function logWarn(scope: string, message: string, details?: Record<string, unknown>) {
  emit('warn', { scope, message, details });
}

export function logError(scope: string, message: string, details?: Record<string, unknown>) {
  emit('error', { scope, message, details });
}

export function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack ?? null,
    };
  }

  return {
    value: String(error),
  };
}
