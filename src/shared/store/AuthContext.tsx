import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import type { ReactNode } from 'react';
import * as Linking from 'expo-linking';
import { AppState } from 'react-native';
import type { Session } from '@supabase/supabase-js';
import { parseSupabaseAuthParamsFromUrl } from '@/shared/lib/authDeepLink';
import { isAccountVerified } from '@/shared/lib/accountStatus';
import { getSupabaseConfigError, supabase } from '@/shared/lib/supabase';
import { logWarn, serializeError } from '@/shared/runtime/appLogger';
import {
  buildTrackingSessionKey,
  captureLoginSessionLocation,
  clearUiTrackingContext,
  setUiTrackingContext,
} from '@/shared/runtime/uiEventTracker';
import { authService } from '@/shared/services/authService';
import { syncPerfilLocationFromDevice } from '@/shared/services/profileLocationService';
import { useAppStore } from '@/store/useAppStore';
import type { Perfil } from '@/shared/types';

/** Evita spinner infinito si no hay red o Supabase no responde al arrancar sesión. */
const AUTH_GET_SESSION_MS = 22_000;
const PERFIL_QUERY_MS = 10_000;
const LIVE_LOCATION_SYNC_MS = 5 * 60 * 1000;

function readableUnknownError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === 'object' && error !== null) {
    const maybeMessage = (error as { message?: unknown }).message;
    if (typeof maybeMessage === 'string' && maybeMessage.trim()) return maybeMessage;
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }
  return String(error);
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<{ ok: true; value: T } | { ok: false }> {
  let t: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<'__timeout__'>(resolve => {
    t = setTimeout(() => resolve('__timeout__'), ms);
  });
  try {
    const result = await Promise.race([promise, timeout]);
    if (t) clearTimeout(t);
    if (result === '__timeout__') return { ok: false };
    return { ok: true, value: result as T };
  } catch {
    if (t) clearTimeout(t);
    return { ok: false };
  }
}

interface AuthCtx {
  session:       Session | null;
  perfil:        Perfil | null;
  loading:       boolean;
  isVerificado:  boolean;
  refreshPerfil: () => Promise<void>;
  bootMessage:   string | null;
  clearBootMessage: () => void;
  /** True tras abrir el enlace del correo de recuperación (deep link). */
  passwordRecoveryActive: boolean;
  clearPasswordRecoveryFlow: () => void;
}

const AuthContext = createContext<AuthCtx>({
  session:      null,
  perfil:       null,
  loading:      true,
  isVerificado: false,
  refreshPerfil: async () => {},
  bootMessage:  null,
  clearBootMessage: () => {},
  passwordRecoveryActive: false,
  clearPasswordRecoveryFlow: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const session = useAppStore((state) => state.session);
  const perfil = useAppStore((state) => state.perfil);
  const perfilDb = useAppStore((state) => state.perfilDb);
  const authStatus = useAppStore((state) => state.authStatus);
  const bootMessage = useAppStore((state) => state.bootMessage);
  const passwordRecoveryActive = useAppStore((state) => state.passwordRecoveryActive);
  const loading = authStatus === 'booting';
  const isVerificado = isAccountVerified(perfil);
  const lastLocationSyncAtRef = useRef(0);
  const syncingLocationRef = useRef(false);
  const lastCapturedLoginSessionRef = useRef<string | null>(null);

  const cargarPerfil = useCallback(async (uid: string, sessionActual?: Session | null) => {
    const store = useAppStore.getState();

    const { data, error } = await supabase
      .from('perfiles')
      .select('*')
      .eq('id', uid)
      .maybeSingle();

    if (error) {
      store.setBootMessage(`No se pudo cargar tu perfil desde la base de datos: ${error.message}`);
      store.applyPerfilDb(null);
      return false;
    }

    if (data) {
      store.setBootMessage(null);
      store.applyPerfilDb(data as Perfil);
      return true;
    }

    if (sessionActual?.user) {
      if (!authService.puedeAutorepararPerfil(sessionActual.user)) {
        const rawRol = (sessionActual.user.user_metadata as Record<string, unknown> | undefined)?.rol;
        store.setBootMessage(
          `Tu cuenta existe, pero falta el perfil operativo en la base de datos para el rol ${String(rawRol ?? 'desconocido')}. ` +
            'Debes crear ese perfil desde el backend o con una herramienta administrativa.',
        );
        store.applyPerfilDb(null);
        return false;
      }

      try {
        await authService.asegurarPerfil(sessionActual.user);

        const { data: reparado, error: repairError } = await supabase
          .from('perfiles')
          .select('*')
          .eq('id', uid)
          .maybeSingle();

        if (!repairError && reparado) {
          store.setBootMessage(null);
          store.applyPerfilDb(reparado as Perfil);
          return true;
        }

        if (repairError) {
          store.setBootMessage(`No se pudo leer tu perfil después de repararlo: ${repairError.message}`);
        }
      } catch (repairErr) {
        store.setBootMessage(`No se pudo reparar tu perfil automáticamente: ${readableUnknownError(repairErr)}`);
      }
    }

    store.applyPerfilDb(null);
    return false;
  }, []);

  const clearBootMessage = useCallback(() => {
    const store = useAppStore.getState();
    store.clearBootMessage();
    store.syncAuthStatus();
  }, []);

  const clearPasswordRecoveryFlow = useCallback(() => {
    const store = useAppStore.getState();
    store.clearPasswordRecoveryFlow();
    store.syncAuthStatus();
  }, []);

  const refreshPerfil = useCallback(async () => {
    const currentSession = useAppStore.getState().session;
    if (!currentSession?.user) return;
    await cargarPerfil(currentSession.user.id, currentSession);
    useAppStore.getState().syncAuthStatus();
  }, [cargarPerfil]);

  useEffect(() => {
    let cancelled = false;
    const store = useAppStore.getState();
    store.setAuthStatus('booting');

    async function consumeAuthDeepLink(url: string): Promise<boolean> {
      const parsed = parseSupabaseAuthParamsFromUrl(url);
      if (!parsed) return false;

      const lower = url.toLowerCase();
      const isRecovery = parsed.type === 'recovery' || lower.includes('reset-password');
      if (!isRecovery) return false;

      const { data, error } = await supabase.auth.setSession({
        access_token: parsed.access_token,
        refresh_token: parsed.refresh_token,
      });

      if (error || cancelled) return false;

      const bridgeStore = useAppStore.getState();
      bridgeStore.hydrateSession(data.session ?? null);
      bridgeStore.setPasswordRecoveryActive(true);
      bridgeStore.syncAuthStatus();
      return true;
    }

    const { data: listener } = supabase.auth.onAuthStateChange(async (event, nextSession) => {
      if (cancelled) return;

      const bridgeStore = useAppStore.getState();

      if (event === 'SIGNED_OUT' || !nextSession?.user) {
        bridgeStore.clearAuth();
        return;
      }

      if (nextSession.user) {
        bridgeStore.setBootMessage(null);
      }

      bridgeStore.hydrateSession(nextSession);

      if (event === 'PASSWORD_RECOVERY') {
        bridgeStore.setPasswordRecoveryActive(true);
      }

      await cargarPerfil(nextSession.user.id, nextSession);

      if (cancelled) return;
      useAppStore.getState().syncAuthStatus();
    });

    (async () => {
      const cfgErr = getSupabaseConfigError();
      if (cfgErr) {
        if (!cancelled) {
          const bridgeStore = useAppStore.getState();
          bridgeStore.clearAuth();
          bridgeStore.setBootMessage(cfgErr);
          bridgeStore.setAuthStatus('guest');
        }
        return;
      }

      try {
        const initialUrl = await Linking.getInitialURL();
        if (initialUrl && !cancelled) {
          await consumeAuthDeepLink(initialUrl);
        }

        const got = await withTimeout(supabase.auth.getSession(), AUTH_GET_SESSION_MS);
        if (cancelled) return;

        if (!got.ok) {
          const bridgeStore = useAppStore.getState();
          bridgeStore.clearAuth();
          bridgeStore.setBootMessage(
            'No hubo respuesta al iniciar sesión. Revisa tu conexión e inténtalo de nuevo.',
          );
          bridgeStore.setAuthStatus('guest');
          return;
        }

        const currentSession = got.value.data.session;

        if (!currentSession?.user) {
          useAppStore.getState().clearAuth();
          return;
        }

        useAppStore.getState().hydrateSession(currentSession);

        const perf = await withTimeout(
          cargarPerfil(currentSession.user.id, currentSession),
          PERFIL_QUERY_MS,
        );

        if (cancelled) return;

        if (!perf.ok) {
          const bridgeStore = useAppStore.getState();
          bridgeStore.setBootMessage(
            'Tu sesión existe, pero el perfil tardó demasiado en responder. Revisa la conexión e intenta de nuevo.',
          );
          bridgeStore.applyPerfilDb(null);
        }
      } finally {
        if (!cancelled && useAppStore.getState().authStatus === 'booting') {
          useAppStore.getState().syncAuthStatus();
        }
      }
    })();

    const linkSub = Linking.addEventListener('url', ({ url }) => {
      void consumeAuthDeepLink(url);
    });
    return () => {
      cancelled = true;
      linkSub.remove();
      listener.subscription.unsubscribe();
    };
  }, [cargarPerfil]);

  useEffect(() => {
    if (!session?.user || !perfilDb?.id) {
      lastCapturedLoginSessionRef.current = null;
      clearUiTrackingContext();
      return;
    }

    const sessionKey = buildTrackingSessionKey(session);
    setUiTrackingContext({ sessionKey });

    if (!sessionKey || lastCapturedLoginSessionRef.current === sessionKey) return;
    lastCapturedLoginSessionRef.current = sessionKey;

    void captureLoginSessionLocation({
      sessionKey,
      perfil: {
        id: perfilDb.id,
        rol: perfilDb.rol,
        estado_ve: perfilDb.estado_ve,
        municipio: perfilDb.municipio,
      },
    });
  }, [
    session,
    session?.user?.id,
    session?.user?.last_sign_in_at,
    session?.expires_at,
    perfilDb?.id,
    perfilDb?.rol,
    perfilDb?.estado_ve,
    perfilDb?.municipio,
  ]);

  const syncLiveLocation = useCallback(
    async (force = false) => {
      if (!session?.user || !perfilDb?.id) return;
      if (syncingLocationRef.current) return;
      const now = Date.now();
      if (!force && now - lastLocationSyncAtRef.current < LIVE_LOCATION_SYNC_MS) return;
      lastLocationSyncAtRef.current = now;
      syncingLocationRef.current = true;
      try {
        const result = await syncPerfilLocationFromDevice({
          id: perfilDb.id,
          estado_ve: perfilDb.estado_ve,
          municipio: perfilDb.municipio,
        });
        if (result.changedProfileFields) {
          await cargarPerfil(perfilDb.id, session);
          useAppStore.getState().syncAuthStatus();
        }
      } catch (error) {
        logWarn('auth.profile_location_sync', 'No se pudo sincronizar la ubicación operativa del perfil.', {
          perfilId: perfilDb.id,
          error: serializeError(error),
        });
      } finally {
        syncingLocationRef.current = false;
      }
    },
    [session, perfilDb?.id, perfilDb?.estado_ve, perfilDb?.municipio, cargarPerfil],
  );

  useEffect(() => {
    if (!session?.user || !perfilDb?.id) return;
    void syncLiveLocation(true);
    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void syncLiveLocation();
      }
    });
    const timer = setInterval(() => {
      void syncLiveLocation();
    }, LIVE_LOCATION_SYNC_MS);
    return () => {
      appStateSub.remove();
      clearInterval(timer);
    };
  }, [session, perfilDb?.id, syncLiveLocation]);

  const value = useMemo<AuthCtx>(() => ({
    session,
    perfil,
    loading,
    isVerificado,
    refreshPerfil,
    bootMessage,
    clearBootMessage,
    passwordRecoveryActive,
    clearPasswordRecoveryFlow,
  }), [
    session,
    perfil,
    loading,
    isVerificado,
    refreshPerfil,
    bootMessage,
    clearBootMessage,
    passwordRecoveryActive,
    clearPasswordRecoveryFlow,
  ]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
