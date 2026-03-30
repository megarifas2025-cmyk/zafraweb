/**
 * Deep links para recuperación de contraseña (Supabase Auth).
 * Añade en Supabase → Authentication → URL Configuration → Redirect URLs:
 *   - zafraclick://reset-password
 *   - exp://127.0.0.1:8081/--/reset-password (y variante LAN si aplica)
 * Expo genera la URL exacta con Linking.createURL.
 */
import * as Linking from 'expo-linking';

const RESET_PATH = 'reset-password';

export function getPasswordResetRedirectTo(): string {
  return Linking.createURL(RESET_PATH);
}

export type ParsedAuthFragment = {
  access_token: string;
  refresh_token: string;
  type: string | null;
};

/** Parsea #access_token=… o ?access_token=… del callback de Supabase. */
export function parseSupabaseAuthParamsFromUrl(url: string): ParsedAuthFragment | null {
  try {
    const hashIdx = url.indexOf('#');
    const fragment = hashIdx >= 0 ? url.slice(hashIdx + 1) : '';
    const qIdx = url.indexOf('?');
    const queryOnly = qIdx >= 0 ? url.slice(qIdx + 1).split('#')[0] : '';
    const raw = fragment || queryOnly;
    if (!raw) return null;
    const params = new URLSearchParams(raw);
    const access_token = params.get('access_token');
    const refresh_token = params.get('refresh_token');
    if (!access_token || !refresh_token) return null;
    return {
      access_token,
      refresh_token,
      type: params.get('type'),
    };
  } catch {
    return null;
  }
}
