import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { supabase } from '@/shared/lib/supabase';
import { logWarn, serializeError } from '@/shared/runtime/appLogger';

try {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
} catch {
  /* setNotificationHandler no disponible en Expo Go SDK 53+ */
}

let androidChannelReady = false;

async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android' || androidChannelReady) return;
  androidChannelReady = true;
  await Notifications.setNotificationChannelAsync('default', {
    name: 'ZafraClic',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

function resolveEasProjectId(): string | null {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  const fromExtra = extra?.eas?.projectId;
  if (fromExtra) return fromExtra;
  const legacy = (Constants as { easConfig?: { projectId?: string } }).easConfig?.projectId;
  return legacy ?? null;
}

/**
 * Solicita permiso y devuelve el token Expo Push (Expo Push API).
 * En emulador sin Google Play Services suele fallar: se ignora sin romper la app.
 */
export async function registerForPushNotificationsAsync(): Promise<string | null> {
  await ensureAndroidChannel();

  const { status: existing } = await Notifications.getPermissionsAsync();
  let final = existing;
  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    final = status;
  }
  if (final !== 'granted') return null;

  const projectId = resolveEasProjectId();
  if (!projectId) {
    logWarn('push.expo', 'Falta extra.eas.projectId en app.config.');
    return null;
  }

  try {
    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    return tokenData.data ?? null;
  } catch (e) {
    logWarn('push.expo', 'No se pudo obtener token push (dispositivo/emulador).', {
      error: serializeError(e),
    });
    return null;
  }
}

export async function persistExpoPushToken(perfilId: string, token: string): Promise<void> {
  const { error } = await supabase.from('perfiles').update({ expo_push_token: token }).eq('id', perfilId);
  if (error) logWarn('push.persist', error.message, { perfilId });
}

/** Evita que el siguiente usuario en el mismo dispositivo reciba pushes del anterior. */
export async function clearExpoPushTokenForUser(perfilId: string): Promise<void> {
  const { error } = await supabase.from('perfiles').update({ expo_push_token: null }).eq('id', perfilId);
  if (error) logWarn('push.clear', error.message, { perfilId });
}
