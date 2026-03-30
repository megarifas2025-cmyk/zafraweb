import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';
import { resolvePerfilForSession } from '@/shared/lib/resolvePerfil';
import type { Perfil, RolUsuario } from '@/shared/types';

export type AppUserRole =
  | 'Admin'
  | 'Empresa'
  | 'Perito'
  | 'Agricultor'
  | 'Comprador'
  | 'Transporte'
  | 'Agrotienda';

export type AuthStatus =
  | 'booting'
  | 'guest'
  | 'authenticated'
  | 'blocked'
  | 'missing_profile'
  | 'recovery';

const ACTIVE_ROLES: readonly RolUsuario[] = [
  'zafra_ceo',
  'company',
  'perito',
  'independent_producer',
  'buyer',
  'transporter',
  'agrotienda',
] as const;

const ROLE_LABEL_MAP: Record<RolUsuario, AppUserRole> = {
  zafra_ceo: 'Admin',
  company: 'Empresa',
  perito: 'Perito',
  independent_producer: 'Agricultor',
  buyer: 'Comprador',
  transporter: 'Transporte',
  agrotienda: 'Agrotienda',
};

type DerivedAuthSlice = {
  perfil: Perfil | null;
  role: RolUsuario | null;
  roleLabel: AppUserRole | null;
};

type AppStoreState = {
  session: Session | null;
  perfilDb: Perfil | null;
  perfil: Perfil | null;
  role: RolUsuario | null;
  roleLabel: AppUserRole | null;
  authStatus: AuthStatus;
  bootMessage: string | null;
  passwordRecoveryActive: boolean;
  isOfflineMode: boolean;

  hydrateSession: (session: Session | null) => void;
  applyPerfilDb: (perfilDb: Perfil | null) => void;
  refreshDerivedAuth: () => void;
  setAuthStatus: (authStatus: AuthStatus) => void;
  syncAuthStatus: () => void;
  setBootMessage: (bootMessage: string | null) => void;
  clearBootMessage: () => void;
  setPasswordRecoveryActive: (passwordRecoveryActive: boolean) => void;
  clearPasswordRecoveryFlow: () => void;
  setOfflineMode: (isOfflineMode: boolean) => void;
  clearAuth: () => void;
};

function isRolUsuario(value: unknown): value is RolUsuario {
  return typeof value === 'string' && (ACTIVE_ROLES as readonly string[]).includes(value);
}

function readRoleFromSession(session: Session | null): RolUsuario | null {
  const rawRole = (session?.user.user_metadata as Record<string, unknown> | undefined)?.rol;
  return isRolUsuario(rawRole) ? rawRole : null;
}

export function mapRolUsuarioToAppRole(role: RolUsuario | null | undefined): AppUserRole | null {
  if (!role) return null;
  return ROLE_LABEL_MAP[role] ?? null;
}

export function readUnknownRoleAsRolUsuario(value: unknown): RolUsuario | null {
  return isRolUsuario(value) ? value : null;
}

function deriveResolvedAuth(
  session: Session | null,
  perfilDb: Perfil | null,
  bootMessage: string | null,
): DerivedAuthSlice {
  const perfil = resolvePerfilForSession(session, perfilDb, !bootMessage);
  const role = perfil?.rol ?? readRoleFromSession(session);

  return {
    perfil,
    role,
    roleLabel: mapRolUsuarioToAppRole(role),
  };
}

function deriveAuthStatus(state: Pick<AppStoreState, 'session' | 'perfil' | 'bootMessage' | 'passwordRecoveryActive'>): AuthStatus {
  if (state.passwordRecoveryActive && state.session) return 'recovery';
  if (!state.session) return 'guest';
  if (state.perfil?.bloqueado) return 'blocked';
  if (!state.perfil && state.bootMessage) return 'missing_profile';
  return 'authenticated';
}

export const useAppStore = create<AppStoreState>((set) => ({
  session: null,
  perfilDb: null,
  perfil: null,
  role: null,
  roleLabel: null,
  authStatus: 'booting',
  bootMessage: null,
  passwordRecoveryActive: false,
  isOfflineMode: false,

  hydrateSession: (session) =>
    set((state) => {
      const nextPerfilDb =
        session && state.perfilDb?.id === session.user.id ? state.perfilDb : null;

      return {
        session,
        perfilDb: nextPerfilDb,
        ...deriveResolvedAuth(session, nextPerfilDb, state.bootMessage),
      };
    }),

  applyPerfilDb: (perfilDb) =>
    set((state) => {
      const safePerfilDb =
        perfilDb && state.session?.user?.id === perfilDb.id ? perfilDb : null;

      return {
        perfilDb: safePerfilDb,
        ...deriveResolvedAuth(state.session, safePerfilDb, state.bootMessage),
      };
    }),

  refreshDerivedAuth: () =>
    set((state) => ({
      ...deriveResolvedAuth(state.session, state.perfilDb, state.bootMessage),
    })),

  setAuthStatus: (authStatus) => set({ authStatus }),

  syncAuthStatus: () =>
    set((state) => ({
      authStatus: deriveAuthStatus(state),
    })),

  setBootMessage: (bootMessage) =>
    set((state) => ({
      bootMessage,
      ...deriveResolvedAuth(state.session, state.perfilDb, bootMessage),
    })),

  clearBootMessage: () =>
    set((state) => ({
      bootMessage: null,
      ...deriveResolvedAuth(state.session, state.perfilDb, null),
    })),

  setPasswordRecoveryActive: (passwordRecoveryActive) =>
    set({ passwordRecoveryActive }),

  clearPasswordRecoveryFlow: () =>
    set({ passwordRecoveryActive: false }),

  setOfflineMode: (isOfflineMode) => set({ isOfflineMode }),

  clearAuth: () =>
    set({
      session: null,
      perfilDb: null,
      perfil: null,
      role: null,
      roleLabel: null,
      authStatus: 'guest',
      bootMessage: null,
      passwordRecoveryActive: false,
      isOfflineMode: false,
    }),
}));
