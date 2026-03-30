import { supabase } from '@/shared/lib/supabase';
import { GEMINI_MODEL } from '@/shared/lib/geminiEnv';

type InvokeGeminiPayload = {
  contents: Array<Record<string, unknown>>;
  generationConfig?: Record<string, unknown>;
  systemInstruction?: Record<string, unknown>;
  safetySettings?: Array<Record<string, unknown>>;
  tools?: Array<Record<string, unknown>>;
};

export const GEMINI_RATE_LIMIT_MESSAGE = 'El agrónomo virtual está analizando muchas fotos. Por favor, intenta en un minuto.';

type EdgeFunctionErrorContext = {
  status?: number;
  json?: () => Promise<unknown>;
  text?: () => Promise<string>;
};

type EdgeFunctionErrorLike = Error & {
  context?: EdgeFunctionErrorContext;
  status?: number;
};

async function readEdgeFunctionErrorPayload(error: unknown): Promise<unknown> {
  const context = (error as EdgeFunctionErrorLike | null | undefined)?.context;
  if (!context) return null;

  if (typeof context.json === 'function') {
    try {
      return await context.json();
    } catch {
      // Ignorar: algunas respuestas no traen JSON válido.
    }
  }

  if (typeof context.text === 'function') {
    try {
      const raw = await context.text();
      if (!raw) return null;
      try {
        return JSON.parse(raw) as unknown;
      } catch {
        return raw;
      }
    } catch {
      return null;
    }
  }

  return null;
}

async function buildGeminiError(error: unknown): Promise<Error> {
  const payload = await readEdgeFunctionErrorPayload(error);
  const rawMessage = error instanceof Error ? error.message : String(error ?? '');
  const normalizedMessage = rawMessage.toLowerCase();
  const payloadMessage =
    typeof payload === 'string'
      ? payload
      : (payload as { error?: string; message?: string; code?: string; upstreamStatus?: number } | null)?.error
        ?? (payload as { error?: string; message?: string; code?: string; upstreamStatus?: number } | null)?.message
        ?? '';
  const status =
    (payload as { upstreamStatus?: number; status?: number } | null)?.upstreamStatus
    ?? (payload as { upstreamStatus?: number; status?: number } | null)?.status
    ?? (error as EdgeFunctionErrorLike | null | undefined)?.status
    ?? (error as EdgeFunctionErrorLike | null | undefined)?.context?.status;
  const code = (payload as { code?: string } | null)?.code;

  const isRateLimit =
    code === 'RATE_LIMIT'
    || status === 429
    || normalizedMessage.includes('429')
    || normalizedMessage.includes('rate limit')
    || normalizedMessage.includes('quota')
    || normalizedMessage.includes('resource exhausted')
    || payloadMessage.includes(GEMINI_RATE_LIMIT_MESSAGE);

  if (isRateLimit) {
    return new Error(GEMINI_RATE_LIMIT_MESSAGE, { cause: error });
  }

  return new Error(
    payloadMessage || rawMessage || 'La Edge Function process-gemini devolvió un error.',
    { cause: error },
  );
}

export function getGeminiUserFacingErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : 'Fallo de red desconocido.';
  return message.includes(GEMINI_RATE_LIMIT_MESSAGE) ? GEMINI_RATE_LIMIT_MESSAGE : message;
}

export async function invokeProcessGemini(payload: InvokeGeminiPayload): Promise<unknown> {
  try {
    const { data, error } = await supabase.functions.invoke('process-gemini', {
      body: {
        model: GEMINI_MODEL,
        ...payload,
      },
    });

    if (error) {
      throw await buildGeminiError(error);
    }

    return data;
  } catch (error) {
    const message = getGeminiUserFacingErrorMessage(error);
    if (message === GEMINI_RATE_LIMIT_MESSAGE) {
      throw new Error(message, { cause: error });
    }
    throw new Error(`No se pudo conectar con el servicio seguro de IA: ${message}`, { cause: error });
  }
}
