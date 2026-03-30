/**
 * Crea usuario Auth + perfiles (rol perito) + peritos → trigger llena company_employees.
 * Invocar con JWT del zafra_ceo. Secretos: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY.
 * Deploy: supabase functions deploy create-perito-account
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type Body = {
  nombre: string;
  doc_numero: string;
  doc_prefijo?: string;
  email: string;
  password: string;
  company_id: string;
  estado_ve?: string;
};

async function writeAuditLog(
  admin: ReturnType<typeof createClient>,
  actorId: string,
  action: string,
  reason: string,
  details: Record<string, unknown>,
  targetId?: string,
  targetLabel?: string,
) {
  await admin.from('admin_audit_logs').insert({
    actor_id: actorId,
    actor_role: 'zafra_ceo',
    action,
    target_table: 'peritos',
    target_id: targetId ?? null,
    target_label: targetLabel ?? null,
    reason,
    details,
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors });
  }

  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!url || !serviceKey || !anonKey) {
    return new Response(JSON.stringify({ error: 'Missing Supabase env' }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  const nombre = String(body.nombre ?? '').trim();
  const docNumero = String(body.doc_numero ?? '').trim();
  const email = String(body.email ?? '').trim().toLowerCase();
  const password = String(body.password ?? '');
  const companyId = String(body.company_id ?? '').trim();
  if (!nombre || !docNumero || !email || password.length < 6 || !companyId) {
    return new Response(JSON.stringify({ error: 'Datos incompletos o contraseña muy corta (mín. 6)' }), {
      status: 400,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: authUser, error: authErr } = await userClient.auth.getUser();
  if (authErr || !authUser?.user) {
    return new Response(JSON.stringify({ error: 'Sesión inválida' }), {
      status: 401,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  const admin = createClient(url, serviceKey);
  const { data: caller, error: callerErr } = await admin
    .from('perfiles')
    .select('rol, nombre')
    .eq('id', authUser.user.id)
    .maybeSingle();
  if (callerErr || caller?.rol !== 'zafra_ceo') {
    return new Response(JSON.stringify({ error: 'Solo zafra_ceo puede crear peritos' }), {
      status: 403,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  const rawPref = String(body.doc_prefijo ?? 'V').toUpperCase();
  const docPref = (['V', 'E', 'J', 'G'].includes(rawPref) ? rawPref : 'V') as 'V' | 'E' | 'J' | 'G';
  const estadoVe = String(body.estado_ve ?? 'Venezuela').trim() || 'Venezuela';

  const { data: company, error: companyErr } = await admin
    .from('companies')
    .select('id, razon_social')
    .eq('id', companyId)
    .maybeSingle();
  if (companyErr || !company) {
    return new Response(JSON.stringify({ error: 'La empresa seleccionada no existe o no está disponible.' }), {
      status: 400,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      rol: 'perito',
      nombre,
      doc_numero: docNumero,
      doc_prefijo: docPref,
      estado_ve: estadoVe,
    },
  });

  if (createErr || !created.user) {
    return new Response(JSON.stringify({ error: createErr?.message ?? 'No se pudo crear el usuario' }), {
      status: 400,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  const uid = created.user.id;

  const { error: perfilErr } = await admin.from('perfiles').insert({
    id: uid,
    rol: 'perito',
    nombre,
    doc_numero: docNumero,
    doc_prefijo: docPref,
    estado_ve: estadoVe,
    kyc_estado: 'verified',
  });

  if (perfilErr) {
    await admin.auth.admin.deleteUser(uid);
    return new Response(JSON.stringify({ error: perfilErr.message }), {
      status: 400,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  const { error: peritoErr } = await admin.from('peritos').insert({
    company_id: companyId,
    perfil_id: uid,
    activo: true,
  });

  if (peritoErr) {
    await admin.from('perfiles').delete().eq('id', uid);
    await admin.auth.admin.deleteUser(uid);
    return new Response(JSON.stringify({ error: peritoErr.message }), {
      status: 400,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  try {
    await writeAuditLog(
      admin,
      authUser.user.id,
      'create_perito_account',
      `Alta ejecutiva de perito para ${company.razon_social}`,
      {
        actor_name: caller?.nombre ?? 'Zafra CEO',
        email,
        company_id: company.id,
        company_name: company.razon_social,
        doc_numero: docNumero,
      },
      uid,
      nombre,
    );
  } catch (auditErr) {
    console.error('No se pudo registrar la bitácora ejecutiva del alta de perito:', auditErr);
  }

  return new Response(JSON.stringify({ userId: uid, email }), {
    status: 200,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
});
