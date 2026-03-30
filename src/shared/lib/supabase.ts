import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';

type ExtraShape = {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
};

const extra = (Constants.expoConfig?.extra ?? {}) as ExtraShape;

/**
 * Preferir EXPO_PUBLIC_* del bundle; si Metro no los inlined, usar `extra` del manifiesto (app.config.js).
 * Aplica a claves anon JWT (eyJ…) y a claves nuevas sb_publishable_…
 */
export const SUPABASE_URL = (
  process.env.EXPO_PUBLIC_SUPABASE_URL ?? extra.supabaseUrl ?? ''
).trim();
export const SUPABASE_ANON_KEY = (
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? extra.supabaseAnonKey ?? ''
).trim();

/**
 * Si no es null, la app no puede hablar con Supabase hasta corregir .env y reiniciar Metro.
 */
export function getSupabaseConfigError(): string | null {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return 'Faltan EXPO_PUBLIC_SUPABASE_URL o EXPO_PUBLIC_SUPABASE_ANON_KEY en .env.';
  }
  if (
    SUPABASE_URL.includes('TU_PROYECTO')
    || SUPABASE_ANON_KEY === 'tu_anon_key'
    || SUPABASE_ANON_KEY.length < 32
  ) {
    return 'El .env sigue con valores de ejemplo. En Supabase: Settings → API → copia «Project URL» y «anon public», pégalo en .env y reinicia el servidor de Expo.';
  }
  if (!SUPABASE_URL.startsWith('https://')) {
    return 'EXPO_PUBLIC_SUPABASE_URL debe ser una URL https (p. ej. https://xxxx.supabase.co).';
  }
  return null;
}

const AsyncStorageAdapter = {
  getItem:    (key: string) => AsyncStorage.getItem(key),
  setItem:    (key: string, value: string) => AsyncStorage.setItem(key, value),
  removeItem: (key: string) => AsyncStorage.removeItem(key),
};

export const supabase = createClient(
  SUPABASE_URL || 'https://invalid.supabase.co',
  SUPABASE_ANON_KEY || 'invalid-anon-key',
  {
    auth: {
      // Supabase sessions can exceed SecureStore's per-item limit on Android.
      storage:            AsyncStorageAdapter,
      autoRefreshToken:   true,
      persistSession:     true,
      detectSessionInUrl: false,
    },
  },
);
