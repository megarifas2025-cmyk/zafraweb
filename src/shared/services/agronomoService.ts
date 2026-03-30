import * as FileSystem from 'expo-file-system/legacy';
import { storageService } from '@/shared/services/storageService';
import { invokeProcessGemini } from '@/shared/services/geminiGatewayService';
import { GEMINI_AGRONOMY_SYSTEM_INSTRUCTION } from '@/shared/lib/geminiEnv';

export interface Insumo {
  nombre: string;
  tipo: 'fungicida' | 'insecticida' | 'herbicida' | 'fertilizante' | 'biologico';
  dosis: string;
  disponibilidad: string;
}

export interface Diagnostico {
  rubro: string;
  problema: string;
  severidad: 'leve' | 'moderada' | 'severa' | 'critica';
  descripcion: string;
  causas: string[];
  acciones: string[];
  insumos: Insumo[];
  prevencion: string;
  confianza: number;
}

export interface RecomendacionAgronomicaContextual {
  prioridad: 'baja' | 'media' | 'alta';
  resumen: string;
  recomendaciones: string[];
  advertencias: string[];
}

const DISCLAIMER_PERITO =
  'Aviso obligatorio: esta orientación es informativa. El productor debe consultar siempre a su perito o técnico de campo autorizado antes de aplicar productos fitosanitarios o tomar decisiones críticas sobre el cultivo.';

const AGRONOMY_SYSTEM_INSTRUCTION = {
  parts: [{ text: GEMINI_AGRONOMY_SYSTEM_INSTRUCTION }],
};

function inferMimeType(uri: string): string {
  const cleanUri = uri.split('?')[0]?.toLowerCase() ?? uri.toLowerCase();
  if (cleanUri.endsWith('.png')) return 'image/png';
  if (cleanUri.endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
}

function extractGeminiText(data: unknown): string {
  const d = data as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>;
    promptFeedback?: { blockReason?: string };
    error?: { message?: string };
  };
  // Detectar bloqueo por safety/API error
  if (d?.error?.message) {
    throw new Error(`Servicio de IA no disponible: ${d.error.message}`);
  }
  if (d?.promptFeedback?.blockReason) {
    throw new Error(`La imagen fue bloqueada por políticas de seguridad (${d.promptFeedback.blockReason}). Intenta con otra foto.`);
  }
  const candidate = d?.candidates?.[0];
  if (candidate?.finishReason === 'SAFETY') {
    throw new Error('La imagen fue bloqueada por filtros de seguridad. Intenta con una foto más clara del cultivo.');
  }
  const text = candidate?.content?.parts?.[0]?.text;
  return typeof text === 'string' ? text.trim() : '';
}

function extractJsonObject(raw: string): string {
  if (!raw) throw new Error('La IA devolvió una respuesta vacía. Verifica que la API key de Gemini esté configurada.');
  // Quitar bloques markdown
  const cleaned = raw.replace(/```json\s*/gi, '').replace(/```/g, '').trim();
  // Buscar primer { y último }
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    return cleaned.slice(start, end + 1);
  }
  // Si Gemini devolvió texto plano (sin JSON), crear un JSON mínimo descriptivo
  const textPreview = cleaned.slice(0, 200);
  throw new Error(`La IA no devolvió JSON. Respuesta recibida: "${textPreview}". Intenta con una foto más clara del cultivo.`);
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

function normalizeInsumos(value: unknown): Insumo[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const row = item as Partial<Insumo>;
      const tipo =
        row.tipo === 'fungicida' ||
        row.tipo === 'insecticida' ||
        row.tipo === 'herbicida' ||
        row.tipo === 'fertilizante' ||
        row.tipo === 'biologico'
          ? row.tipo
          : 'biologico';
      return {
        nombre: typeof row.nombre === 'string' ? row.nombre : '',
        tipo,
        dosis: typeof row.dosis === 'string' ? row.dosis : '',
        disponibilidad: typeof row.disponibilidad === 'string' ? row.disponibilidad : '',
      } satisfies Insumo;
    })
    .filter((item): item is Insumo => item != null && item.nombre.trim().length > 0);
}

function normalizeDiagnostico(raw: unknown, rubroFallback?: string): Diagnostico {
  if (!raw || typeof raw !== 'object') {
    throw new Error('La IA devolvió un diagnóstico inválido.');
  }
  const parsed = raw as Partial<Diagnostico>;
  const severidad =
    parsed.severidad === 'leve' ||
    parsed.severidad === 'moderada' ||
    parsed.severidad === 'severa' ||
    parsed.severidad === 'critica'
      ? parsed.severidad
      : 'moderada';

  return {
    rubro: typeof parsed.rubro === 'string' && parsed.rubro.trim() ? parsed.rubro : rubroFallback ?? 'Cultivo',
    problema: typeof parsed.problema === 'string' && parsed.problema.trim() ? parsed.problema : 'No identificado con certeza',
    severidad,
    descripcion: typeof parsed.descripcion === 'string' ? parsed.descripcion : 'Sin descripción generada por la IA.',
    causas: normalizeStringArray(parsed.causas),
    acciones: normalizeStringArray(parsed.acciones),
    insumos: normalizeInsumos(parsed.insumos),
    prevencion: typeof parsed.prevencion === 'string' ? parsed.prevencion : '',
    confianza: typeof parsed.confianza === 'number' ? parsed.confianza : 0,
  };
}

async function solicitarDiagnosticoGemini(input: {
  prompt: string;
  mimeType: string;
  b64: string;
  useJsonMime: boolean;
}): Promise<Diagnostico> {
  const data = await invokeProcessGemini({
    contents: [{ parts: [{ text: input.prompt }, { inlineData: { mimeType: input.mimeType, data: input.b64 } }] }],
    systemInstruction: AGRONOMY_SYSTEM_INSTRUCTION,
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 1024,
      ...(input.useJsonMime ? { responseMimeType: 'application/json' } : {}),
    },
  });
  const raw = extractGeminiText(data);
  const jsonStr = extractJsonObject(raw);
  const parsed = JSON.parse(jsonStr);
  return normalizeDiagnostico(parsed);
}

export const agronomoService = {
  async diagnosticar(uri: string, rubro?: string, estado_ve?: string, notas?: string): Promise<Diagnostico> {
    const optimizedUri = await storageService.comprimirHasta300KB(uri);
    const b64 = await FileSystem.readAsStringAsync(optimizedUri, { encoding: FileSystem.EncodingType.Base64 });
    const mimeType = inferMimeType(optimizedUri);
    const ctx = [rubro ? `Cultivo: ${rubro}.` : '', estado_ve ? `Ubicación: ${estado_ve}, Venezuela.` : '', notas ? `Reporte del agricultor: "${notas}".` : ''].filter(Boolean).join(' ');
    const prompt =
      `${ctx} ` +
      `INSTRUCCIÓN CRÍTICA: Analiza ESTA imagen de planta/cultivo y devuelve ÚNICAMENTE el siguiente JSON válido sin ningún texto adicional, sin markdown, sin explicaciones: ` +
      `{"rubro":"nombre del cultivo observado","problema":"enfermedad o plaga detectada","severidad":"leve","descripcion":"descripcion breve","causas":["causa1"],"acciones":["accion1"],"insumos":[{"nombre":"producto","tipo":"fungicida","dosis":"dosis","disponibilidad":"Venezuela"}],"prevencion":"medida preventiva","confianza":75} ` +
      `Valores de severidad permitidos: leve, moderada, severa, critica. ` +
      `Valores de tipo para insumos: fungicida, insecticida, herbicida, fertilizante, biologico. ` +
      `${DISCLAIMER_PERITO}`;
    try {
      // Intento 1: con responseMimeType JSON (fuerza formato JSON nativo)
      try {
        const diag = await solicitarDiagnosticoGemini({ prompt, mimeType, b64, useJsonMime: true });
        return normalizeDiagnostico(diag, rubro);
      } catch (e1) {
        // Si fue un bloqueo de seguridad, no reintentar
        const msg1 = e1 instanceof Error ? e1.message : '';
        if (msg1.includes('bloqueada') || msg1.includes('SAFETY') || msg1.includes('API key')) {
          throw e1;
        }
        // Intento 2: sin forzar JSON mime type
        const diag = await solicitarDiagnosticoGemini({ prompt, mimeType, b64, useJsonMime: false });
        return normalizeDiagnostico(diag, rubro);
      }
    } catch (error: unknown) {
      if (error instanceof SyntaxError) {
        throw new Error('La IA devolvió un formato inválido. Intenta con una foto más clara del cultivo, con buena iluminación.', { cause: error });
      }
      throw error instanceof Error ? error : new Error('No se pudo obtener diagnóstico agronómico.');
    }
  },

  async recomendarContexto(input: {
    rubro: string;
    estado_ve?: string | null;
    etapa: string;
    climaResumen: string;
    ultimoEvento?: string | null;
  }): Promise<RecomendacionAgronomicaContextual> {
    return {
      prioridad: 'media',
      resumen: `Seguimiento manual para ${input.rubro} en ${input.estado_ve ?? 'Venezuela'}.`,
      recomendaciones: [
        `Revisa el cultivo en etapa ${input.etapa} y registra novedades en campo.`,
        `Contrasta el clima actual (${input.climaResumen}) antes de aplicar cualquier manejo.`,
      ],
      advertencias: [
        input.ultimoEvento ? `Último evento registrado: ${input.ultimoEvento}.` : 'Sin evento reciente registrado.',
        DISCLAIMER_PERITO,
      ],
    };
  },
};
