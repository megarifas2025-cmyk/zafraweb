import { supabase } from '@/shared/lib/supabase';
import type { AdminAuditLogEntry, Perfil, RolUsuario } from '@/shared/types';

export type GovernanceFilter = 'pending_kyc' | 'blocked' | 'all';

export type GovernanceUserRow = Pick<
  Perfil,
  'id' | 'nombre' | 'rol' | 'kyc_estado' | 'bloqueado' | 'activo' | 'estado_ve' | 'municipio' | 'telefono'
> & {
  creado_en?: string;
};

export type CeoDashboardMetrics = {
  totalUsers: number;
  pendingKyc: number;
  blockedUsers: number;
  companies: number;
  peritos: number;
  activeFreight: number;
  agrotiendas: number;
};

export type RoleCountRow = {
  rol: RolUsuario;
  total: number;
};

export type CeoMetricsFull = CeoDashboardMetrics & { roleCounts: RoleCountRow[] };

const CEO_METRICS_TIMEOUT_MS = 8_000;

async function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

const EMPTY_METRICS: CeoDashboardMetrics = {
  totalUsers: 0,
  pendingKyc: 0,
  blockedUsers: 0,
  companies: 0,
  peritos: 0,
  activeFreight: 0,
  agrotiendas: 0,
};

/**
 * Carga todas las métricas del CEO en UNA sola llamada RPC (get_ceo_dashboard_metrics).
 * Incluye también los conteos por rol (roleCounts).
 * Tiene timeout de 8 s para no bloquear la UI indefinidamente.
 */
export async function fetchCeoMetricsFull(): Promise<CeoMetricsFull> {
  const query = supabase.rpc('get_ceo_dashboard_metrics');

  const result = await withTimeout(
    Promise.resolve(query.then(({ data, error }) => {
      if (error) throw error;
      return data as CeoMetricsFull;
    })),
    CEO_METRICS_TIMEOUT_MS,
    { ...EMPTY_METRICS, roleCounts: [] } as CeoMetricsFull,
  );

  return result;
}

/**
 * Alias para compatibilidad con SuperAdminDashboard que solo usa CeoDashboardMetrics.
 */
export async function fetchCeoDashboardMetrics(): Promise<CeoDashboardMetrics> {
  const full = await fetchCeoMetricsFull();
  return {
    totalUsers:    full.totalUsers,
    pendingKyc:    full.pendingKyc,
    blockedUsers:  full.blockedUsers,
    companies:     full.companies,
    peritos:       full.peritos,
    activeFreight: full.activeFreight,
    agrotiendas:   full.agrotiendas,
  };
}

/**
 * Alias para compatibilidad con CeoSystemReportScreen que necesita ambos.
 */
export async function listRoleCounts(): Promise<RoleCountRow[]> {
  const full = await fetchCeoMetricsFull();
  return full.roleCounts;
}

export async function listGovernanceUsers(filter: GovernanceFilter, search = ''): Promise<GovernanceUserRow[]> {
  let query = supabase
    .from('perfiles')
    .select('id, nombre, rol, kyc_estado, bloqueado, activo, estado_ve, municipio, telefono, creado_en')
    .order('creado_en', { ascending: false })
    .limit(80);

  if (filter === 'pending_kyc') query = query.neq('kyc_estado', 'verified');
  if (filter === 'blocked') query = query.eq('bloqueado', true);

  const trimmed = search.trim();
  if (trimmed) {
    query = query.or(`nombre.ilike.%${trimmed}%,doc_numero.ilike.%${trimmed}%,telefono.ilike.%${trimmed}%`);
  }

  const queryPromise = query.then(({ data, error }) => {
    if (error) throw error;
    return (data ?? []) as GovernanceUserRow[];
  });

  return withTimeout(Promise.resolve(queryPromise), CEO_METRICS_TIMEOUT_MS, []);
}

export async function updateGovernanceUserStatus(
  actorId: string,
  user: GovernanceUserRow,
  next: { bloqueado?: boolean; activo?: boolean },
  reason: string,
): Promise<void> {
  const patch: Record<string, unknown> = {};
  if (typeof next.bloqueado === 'boolean') patch.bloqueado = next.bloqueado;
  if (typeof next.activo === 'boolean') patch.activo = next.activo;
  const { error } = await supabase.from('perfiles').update(patch).eq('id', user.id);
  if (error) throw error;

  await logAdminAuditAction({
    actorId,
    action: next.bloqueado ? 'block_user' : 'unblock_user',
    targetTable: 'perfiles',
    targetId: user.id,
    targetLabel: user.nombre,
    reason,
    details: {
      rol: user.rol,
      activo: typeof next.activo === 'boolean' ? next.activo : user.activo,
      bloqueado: typeof next.bloqueado === 'boolean' ? next.bloqueado : user.bloqueado,
    },
  });
}

export async function logAdminAuditAction(input: {
  actorId: string;
  action: string;
  targetTable?: string | null;
  targetId?: string | null;
  targetLabel?: string | null;
  reason?: string | null;
  details?: Record<string, unknown> | null;
}) {
  const { data: actor, error: actorError } = await supabase
    .from('perfiles')
    .select('rol')
    .eq('id', input.actorId)
    .maybeSingle();
  if (actorError) throw actorError;

  const { error } = await supabase.from('admin_audit_logs').insert({
    actor_id: input.actorId,
    actor_role: actor?.rol ?? 'zafra_ceo',
    action: input.action,
    target_table: input.targetTable ?? null,
    target_id: input.targetId ?? null,
    target_label: input.targetLabel ?? null,
    reason: input.reason ?? null,
    details: input.details ?? {},
  });
  if (error) throw error;
}

export async function listAdminAuditLogs(limit = 60): Promise<AdminAuditLogEntry[]> {
  const queryPromise = supabase
    .from('admin_audit_logs')
    .select('id, actor_id, actor_role, action, target_table, target_id, target_label, reason, details, created_at')
    .order('created_at', { ascending: false })
    .limit(limit)
    .then(({ data, error }) => {
      if (error) throw error;
      return (data ?? []) as AdminAuditLogEntry[];
    });

  return withTimeout(Promise.resolve(queryPromise), CEO_METRICS_TIMEOUT_MS, []);
}
