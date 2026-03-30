import type { ChatIncidentCategory } from '@/shared/types';

type ModerationHit = {
  category: ChatIncidentCategory;
  message: string;
  severity: 'media' | 'alta' | 'critica';
};

const BLOCKED_PATTERNS: Array<{
  category: ChatIncidentCategory;
  severity: 'media' | 'alta' | 'critica';
  message: string;
  regex: RegExp;
}> = [
  {
    category: 'obscene_language',
    severity: 'alta',
    message: 'No puedes usar lenguaje ofensivo u obsceno dentro del chat.',
    regex: /\b(maldito|maldita|mierda|coño|carajo|puta|puto|marico|marica|hijo de puta|mamaguevo|mamaguevo)\b/i,
  },
  {
    category: 'threat',
    severity: 'critica',
    message: 'No puedes enviar amenazas o intimidaciones dentro del chat.',
    regex: /\b(te voy a matar|te voy a joder|te voy a caer|vas a pagar|te voy a buscar|te voy a romper)\b/i,
  },
  {
    category: 'fraud_attempt',
    severity: 'critica',
    message: 'Ese mensaje parece un intento de fraude o manipulación de pago y no puede enviarse.',
    regex: /\b(transfiere ya|paga ya|dep[oó]sito inmediato|env[ií]a el dinero|hazme la transferencia|sin garant[ií]a|sin factura|sin respaldo)\b/i,
  },
  {
    category: 'unsafe_payment',
    severity: 'alta',
    message: 'Evita presionar pagos inseguros o sin respaldo dentro del chat.',
    regex: /\b(adelanto completo|pago por fuera|sin verificaci[oó]n|sin soporte|sin revisarlo)\b/i,
  },
];

export function moderateOutgoingChatText(text: string): ModerationHit | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  for (const rule of BLOCKED_PATTERNS) {
    if (rule.regex.test(trimmed)) {
      return {
        category: rule.category,
        message: rule.message,
        severity: rule.severity,
      };
    }
  }
  return null;
}

export function explainChatSafetyPolicy() {
  return 'Esta conversación es una herramienta de contacto entre usuarios. Toda negociación, pago, entrega o documento queda bajo responsabilidad de las partes. Evita adelantos sin respaldo, verifica identidad y reporta cualquier intento de estafa, amenaza o información falsa.';
}
