import type { User } from '@supabase/supabase-js';
import { isKycDisabledGlobally } from '@/shared/config/kycBypass';
import { getPasswordResetRedirectTo } from '@/shared/lib/authDeepLink';
import { mensajeSupabaseConPista } from '@/shared/lib/supabaseErrors';
import { supabase } from '@/shared/lib/supabase';
import { logError, logInfo, serializeError } from '@/shared/runtime/appLogger';
import { buildTrackingSessionKey, setUiTrackingContext, trackUiEvent } from '@/shared/runtime/uiEventTracker';
import { requestTransporterCompanyLink } from '@/shared/services/transporterCompanyLinkService';
import type { DocPrefijo, RolUsuario, TransporterRegistrationMode } from '@/shared/types';

export interface RegisterPayload {
  email:     string;
  password:  string;
  nombre:    string;
  rol:       RolUsuario;
  telefono?: string;
  estado_ve: string;
  municipio: string;
  doc_prefijo: DocPrefijo;
  doc_numero: string;
  /** ISO yyyy-mm-dd */
  fecha_nacimiento?: string | null;
  transporter_registration_mode?: TransporterRegistrationMode;
  transporter_company_id?: string | null;
}

const SELF_SERVICE_ROLES: RolUsuario[] = [
  'company',
  'independent_producer',
  'buyer',
  'transporter',
  'agrotienda',
];

function readUserMeta(user: User): Record<string, unknown> {
  return (user.user_metadata ?? {}) as Record<string, unknown>;
}

function getAllowedSelfServiceRole(user: User): RolUsuario | null {
  const raw = readUserMeta(user).rol;
  return SELF_SERVICE_ROLES.includes(raw as RolUsuario) ? (raw as RolUsuario) : null;
}

function getNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function getDocPrefijo(value: unknown): DocPrefijo | null {
  return value === 'V' || value === 'E' || value === 'J' || value === 'G' ? value : null;
}

function buildSelfServicePerfil(user: User, rol: RolUsuario) {
  const meta = readUserMeta(user);
  return {
    id: user.id,
    rol,
    nombre: getNullableString(meta.nombre) ?? 'Usuario',
    telefono: getNullableString(meta.telefono),
    estado_ve: getNullableString(meta.estado_ve) ?? 'Venezuela',
    municipio: getNullableString(meta.municipio),
    doc_prefijo: getDocPrefijo(meta.doc_prefijo),
    doc_numero: getNullableString(meta.doc_numero),
    fecha_nacimiento: getNullableString(meta.fecha_nacimiento),
    kyc_estado: isKycDisabledGlobally() ? ('verified' as const) : ('pendiente' as const),
  };
}

function buildCompanySeed(user: User) {
  const meta = readUserMeta(user);
  const nombre = getNullableString(meta.nombre) ?? 'Empresa';
  const estado = getNullableString(meta.estado_ve) ?? 'Venezuela';
  const municipio = getNullableString(meta.municipio);
  const telefono = getNullableString(meta.telefono) ?? '';
  const docPrefijo = getDocPrefijo(meta.doc_prefijo) ?? 'J';
  const docNumero = getNullableString(meta.doc_numero);
  const rif = docNumero ? `${docPrefijo}-${docNumero}` : `${docPrefijo}-${user.id.slice(0, 8).toUpperCase()}`;
  const direccionBase = [municipio, estado].filter(Boolean).join(', ') || estado;

  return {
    perfil_id: user.id,
    razon_social: nombre,
    rif,
    direccion_fiscal: direccionBase,
    direccion: direccionBase,
    telefono_contacto: telefono,
    correo_contacto: user.email?.trim().toLowerCase() ?? 'empresa@example.com',
    logo_url: '',
  };
}

async function ensureCompanyOperationalRow(user: User) {
  const { data: current, error: selectError } = await supabase
    .from('companies')
    .select('id')
    .eq('perfil_id', user.id)
    .maybeSingle();
  if (selectError) throw new Error(mensajeSupabaseConPista(selectError));
  if (current) return false;

  const payload = buildCompanySeed(user);
  const { error: insertError } = await supabase.from('companies').insert(payload);
  if (insertError) {
    const code = typeof (insertError as { code?: string })?.code === 'string'
      ? (insertError as { code: string }).code
      : '';
    if (code === '23505') return false;
    throw new Error(mensajeSupabaseConPista(insertError));
  }
  return true;
}

export const authService = {
  puedeAutorepararPerfil(user: User) {
    return getAllowedSelfServiceRole(user) != null;
  },
  async asegurarPerfil(user: User) {
    const allowedRole = getAllowedSelfServiceRole(user);
    if (!allowedRole) return false;
    let createdProfile = false;

    const { data: perfilActual, error: selectError } = await supabase
      .from('perfiles')
      .select('id')
      .eq('id', user.id)
      .maybeSingle();
    if (selectError) throw new Error(mensajeSupabaseConPista(selectError));
    if (!perfilActual) {
      const { error: insertError } = await supabase.from('perfiles').insert(buildSelfServicePerfil(user, allowedRole));
      if (insertError) {
        const code = typeof (insertError as { code?: string })?.code === 'string'
          ? (insertError as { code: string }).code
          : '';
        if (code !== '23505') throw new Error(mensajeSupabaseConPista(insertError));
      } else {
        createdProfile = true;
      }
    }

    if (allowedRole === 'company') {
      await ensureCompanyOperationalRow(user);
    }

    logInfo('auth.ensure_profile', 'Perfil autoservicio verificado.', {
      userId: user.id,
      role: allowedRole,
      createdProfile,
    });
    return createdProfile;
  },
  async registrar(p: RegisterPayload) {
    try {
      const { data, error } = await supabase.auth.signUp({
        email: p.email,
        password: p.password,
        options: {
          data: {
            nombre: p.nombre,
            rol: p.rol,
            telefono: p.telefono,
            estado_ve: p.estado_ve,
            municipio: p.municipio,
            doc_prefijo: p.doc_prefijo,
            doc_numero: p.doc_numero,
            fecha_nacimiento: p.fecha_nacimiento ?? null,
            transporter_registration_mode: p.transporter_registration_mode ?? null,
            transporter_company_id: p.transporter_company_id ?? null,
          },
        },
      });
      if (error) throw error;
      if (!data.user) throw new Error('No se creó el usuario.');
      await this.asegurarPerfil(data.user);
      if (p.rol === 'transporter' && p.transporter_registration_mode === 'company_link' && p.transporter_company_id) {
        await requestTransporterCompanyLink({
          transporterId: data.user.id,
          companyId: p.transporter_company_id,
        });
      }
      logInfo('auth.register', 'Registro completado.', {
        userId: data.user.id,
        role: p.rol,
        email: p.email.trim().toLowerCase(),
      });
      return data;
    } catch (error) {
      logError('auth.register', 'Falló el registro de usuario.', {
        email: p.email.trim().toLowerCase(),
        role: p.rol,
        error: serializeError(error),
      });
      throw error;
    }
  },
  async login(email: string, password: string) {
    const em = email.trim().toLowerCase();
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email: em, password });
      if (error) throw error;
      const sessionKey = buildTrackingSessionKey(data.session);
      if (sessionKey) {
        setUiTrackingContext({ sessionKey });
        trackUiEvent({
          eventType: 'submit',
          eventName: 'auth_login_success',
          screen: 'Login',
          module: 'auth',
          status: 'success',
          metadata: {
            email_domain: em.includes('@') ? em.split('@')[1] : null,
          },
        });
      }
      logInfo('auth.login', 'Inicio de sesión completado.', {
        userId: data.user?.id ?? null,
        email: em,
      });
      return data;
    } catch (error) {
      logError('auth.login', 'Falló el inicio de sesión.', {
        email: em,
        error: serializeError(error),
      });
      throw error;
    }
  },
  async logout() {
    try {
      const { data: sess } = await supabase.auth.getSession();
      const uid = sess.session?.user?.id;
      if (uid) {
        trackUiEvent({
          eventType: 'tap',
          eventName: 'auth_logout',
          screen: 'Perfil',
          module: 'auth',
          targetType: 'session',
          targetId: uid,
          status: 'success',
        });
      }
      if (uid) {
        const { clearExpoPushTokenForUser } = await import('@/shared/services/pushNotifications');
        await clearExpoPushTokenForUser(uid);
      }
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      logInfo('auth.logout', 'Cierre de sesión completado.');
    } catch (error) {
      logError('auth.logout', 'Falló el cierre de sesión.', {
        error: serializeError(error),
      });
      throw error;
    }
  },
  async resetPassword(email: string) {
    const redirectTo = getPasswordResetRedirectTo();
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
      if (error) throw error;
      logInfo('auth.reset_password', 'Solicitud de recuperación enviada.', {
        email: email.trim().toLowerCase(),
      });
    } catch (error) {
      logError('auth.reset_password', 'Falló la recuperación de contraseña.', {
        email: email.trim().toLowerCase(),
        error: serializeError(error),
      });
      throw error;
    }
  },

  /** Usuario ya autenticado (pantalla Perfil). */
  async updatePassword(newPassword: string) {
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      logInfo('auth.update_password', 'Contraseña actualizada correctamente.');
    } catch (error) {
      logError('auth.update_password', 'Falló la actualización de contraseña.', {
        error: serializeError(error),
      });
      throw error;
    }
  },
};
