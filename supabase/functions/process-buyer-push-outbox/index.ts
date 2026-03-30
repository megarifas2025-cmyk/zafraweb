/**
 * Procesa `buyer_push_outbox` y envía notificaciones Expo Push.
 *
 * Despliegue: `supabase functions deploy process-buyer-push-outbox --no-verify-jwt`
 * Secretos: EXPO_ACCESS_TOKEN (https://expo.dev/accounts/[account]/settings/access-tokens)
 * Cron: Supabase Dashboard → Edge Functions → Schedules, o invocar con service_role.
 *
 * Body opcional: { "limit": 50 }
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

type OutboxRow = {
  id: number;
  buyer_id: string;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
};

function unauthorized(message = 'Unauthorized') {
  return new Response(JSON.stringify({ error: message }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const expoToken = Deno.env.get('EXPO_ACCESS_TOKEN');
  const cronSecret = Deno.env.get('BUYER_PUSH_OUTBOX_SECRET');
  if (!serviceKey || !supabaseUrl) {
    return new Response(JSON.stringify({ error: 'Missing Supabase env' }), { status: 500 });
  }
  if (!expoToken) {
    return new Response(JSON.stringify({ error: 'Set EXPO_ACCESS_TOKEN secret' }), { status: 500 });
  }
  if (!cronSecret) {
    return new Response(JSON.stringify({ error: 'Set BUYER_PUSH_OUTBOX_SECRET secret' }), { status: 500 });
  }

  const authHeader = req.headers.get('authorization') ?? '';
  const cronHeader = req.headers.get('x-cron-secret') ?? '';
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (cronHeader !== cronSecret && bearerToken !== cronSecret) {
    return unauthorized();
  }

  let limit = 50;
  try {
    const j = await req.json().catch(() => ({}));
    if (typeof j?.limit === 'number') limit = Math.min(200, Math.max(1, j.limit));
  } catch {
    /* GET */
  }

  const admin = createClient(supabaseUrl, serviceKey);
  const { data: rows, error } = await admin
    .from('buyer_push_outbox')
    .select('id, buyer_id, title, body, data')
    .eq('procesado', false)
    .order('creado_en', { ascending: true })
    .limit(limit);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  const list = (rows ?? []) as OutboxRow[];
  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of list) {
    const { data: perfil } = await admin.from('perfiles').select('expo_push_token').eq('id', row.buyer_id).single();
    const token = perfil?.expo_push_token as string | null | undefined;
    if (!token) {
      skipped += 1;
      continue;
    }

    const r = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${expoToken}`,
      },
      body: JSON.stringify({
        to: token,
        title: row.title,
        body: row.body,
        data: row.data ?? {},
        sound: 'default',
      }),
    });

    if (r.ok) {
      const payload = await r.json().catch(() => null);
      const ticketStatus = payload?.data?.status ?? payload?.status ?? null;
      if (ticketStatus === 'ok' || ticketStatus == null) {
        await admin.from('buyer_push_outbox').update({ procesado: true }).eq('id', row.id);
        sent += 1;
        continue;
      }
      failed += 1;
      continue;
    }

    failed += 1;
  }

  return new Response(JSON.stringify({ processed: list.length, sent, skipped, failed }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
