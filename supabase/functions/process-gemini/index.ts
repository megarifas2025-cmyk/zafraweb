import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Rate limiter en memoria por instancia de Edge Function
const _rateLimitMap = new Map<string, { windowStart: number; count: number }>();

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

type GeminiRequestBody = {
  model?: string;
  contents?: Array<Record<string, unknown>>;
  generationConfig?: Record<string, unknown>;
  systemInstruction?: Record<string, unknown>;
  safetySettings?: Array<Record<string, unknown>>;
  tools?: Array<Record<string, unknown>>;
};

const STABLE_GEMINI_MODEL = 'gemini-1.5-flash';
const GEMINI_RATE_LIMIT_MESSAGE = 'El agrónomo virtual está analizando muchas fotos. Por favor, intenta en un minuto.';

function jsonResponse(payload: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: corsHeaders,
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Only POST is supported.' }, 400);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const authHeader = req.headers.get('Authorization') ?? req.headers.get('authorization') ?? '';
  if (!supabaseUrl || !supabaseAnonKey) {
    return jsonResponse({ error: 'Missing Supabase env.' }, 500);
  }
  if (!authHeader.startsWith('Bearer ')) {
    return jsonResponse({ error: 'Missing bearer token.' }, 401);
  }

  const authClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: authHeader,
      },
    },
  });
  const { data: authData, error: authError } = await authClient.auth.getUser();
  if (authError || !authData.user) {
    return jsonResponse({ error: authError?.message ?? 'Unauthorized' }, 401);
  }

  // Rate limiting en memoria: máx 20 llamadas por usuario por ventana de 60s
  const uid = authData.user.id;
  const now = Date.now();
  const windowMs = 60_000;
  const maxCalls = 20;
  const entry = _rateLimitMap.get(uid);
  if (entry && now - entry.windowStart < windowMs) {
    if (entry.count >= maxCalls) {
      return jsonResponse({ error: GEMINI_RATE_LIMIT_MESSAGE, code: 'RATE_LIMIT' }, 429);
    }
    entry.count += 1;
  } else {
    _rateLimitMap.set(uid, { windowStart: now, count: 1 });
  }
  // Limpiar entradas antiguas ocasionalmente para evitar memory leak en instancias de larga vida
  if (_rateLimitMap.size > 500) {
    for (const [k, v] of _rateLimitMap) {
      if (now - v.windowStart >= windowMs) _rateLimitMap.delete(k);
    }
  }

  let body: GeminiRequestBody;
  try {
    body = (await req.json()) as GeminiRequestBody;
  } catch {
    return jsonResponse({ error: 'Invalid JSON body.' }, 400);
  }

  const contents = Array.isArray(body.contents) ? body.contents : null;
  if (!contents || contents.length === 0) {
    return jsonResponse({ error: 'Request body must include a non-empty contents array.' }, 400);
  }

  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) {
    return jsonResponse({ error: 'Missing GEMINI_API_KEY secret.' }, 500);
  }

  const model = STABLE_GEMINI_MODEL;

  const payload: Record<string, unknown> = {
    contents,
  };

  if (body.generationConfig && typeof body.generationConfig === 'object') {
    payload.generationConfig = body.generationConfig;
  }
  if (body.systemInstruction && typeof body.systemInstruction === 'object') {
    payload.systemInstruction = body.systemInstruction;
  }
  if (Array.isArray(body.safetySettings)) {
    payload.safetySettings = body.safetySettings;
  }
  if (Array.isArray(body.tools)) {
    payload.tools = body.tools;
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  try {
    const upstream = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify(payload),
    });

    const rawText = await upstream.text();
    let upstreamJson: unknown = null;
    try {
      upstreamJson = rawText ? JSON.parse(rawText) : null;
    } catch {
      upstreamJson = rawText;
    }

    if (!upstream.ok) {
      const isRateLimited = upstream.status === 429;
      const message =
        isRateLimited
          ? GEMINI_RATE_LIMIT_MESSAGE
          :
        (upstreamJson as { error?: { message?: string } } | null)?.error?.message ||
        upstream.statusText ||
        'Gemini upstream request failed.';
      const status = isRateLimited ? 429 : upstream.status >= 400 && upstream.status < 500 ? 400 : 500;
      return jsonResponse({
        error: message,
        code: isRateLimited ? 'RATE_LIMIT' : 'UPSTREAM_ERROR',
        upstreamStatus: upstream.status,
        details: upstreamJson,
      }, status);
    }

    return new Response(JSON.stringify(upstreamJson), {
      status: 200,
      headers: corsHeaders,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown upstream network error.';
    return jsonResponse({ error: message }, 500);
  }
});
