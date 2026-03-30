import type { AlertaGenerada, ClimaActual } from '@/shared/services/weatherService';
import type { Cosecha, Finca } from '@/shared/types';
import type { FieldLogTipoDb } from '@/hooks/useOfflineSync';

export type AgronomicStage =
  | 'sin_datos'
  | 'preparacion'
  | 'siembra'
  | 'emergencia'
  | 'desarrollo'
  | 'floracion'
  | 'llenado'
  | 'precosecha'
  | 'cosecha';

export type LocalFieldEvent = {
  id: string;
  finca_id: string;
  fecha: string;
  tipo: string;
  descripcion?: string | null;
  sincronizado?: number;
  tipo_evento?: FieldLogTipoDb;
};

export type AgronomicAssistantSnapshot = {
  hasMinimumData: boolean;
  finca: Finca | null;
  stage: AgronomicStage;
  stageLabel: string;
  summary: string;
  todayTask: string;
  nextTask: string;
  applicationWindow: string;
  risks: string[];
  latestEventLabel: string | null;
  latestEventDate: string | null;
};

function normalizeDate(input?: string | null): Date | null {
  if (!input) return null;
  const date = new Date(input);
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysBetween(from: Date, to = new Date()): number {
  const diff = to.getTime() - from.getTime();
  return Math.max(0, Math.floor(diff / 86_400_000));
}

function inferEventType(entry: LocalFieldEvent): FieldLogTipoDb {
  if (entry.tipo_evento) return entry.tipo_evento;
  const raw = `${entry.tipo} ${entry.descripcion ?? ''}`.toLowerCase();
  if (raw.includes('siembra')) return 'SIEMBRA';
  if (raw.includes('fertiliz')) return 'FERTILIZACION';
  if (raw.includes('quim')) return 'APLICACION_QUIMICA';
  return 'OTRO';
}

function stageLabel(stage: AgronomicStage): string {
  switch (stage) {
    case 'preparacion':
      return 'Preparación';
    case 'siembra':
      return 'Siembra';
    case 'emergencia':
      return 'Emergencia';
    case 'desarrollo':
      return 'Desarrollo vegetativo';
    case 'floracion':
      return 'Floración';
    case 'llenado':
      return 'Llenado';
    case 'precosecha':
      return 'Pre-cosecha';
    case 'cosecha':
      return 'Cosecha';
    default:
      return 'Sin datos suficientes';
  }
}

function stageTasks(stage: AgronomicStage, rubro: string): { summary: string; todayTask: string; nextTask: string } {
  switch (stage) {
    case 'preparacion':
      return {
        summary: `Tu lote de ${rubro} está en fase de organización inicial.`,
        todayTask: 'Verifica suelo, drenaje y disponibilidad de insumos antes de sembrar.',
        nextTask: 'Registrar siembra o primer evento productivo en el diario.',
      };
    case 'siembra':
      return {
        summary: `Acabas de iniciar el ciclo del ${rubro}.`,
        todayTask: 'Confirma uniformidad de siembra y humedad suficiente en el lote.',
        nextTask: 'Vigilar nacimiento y registrar cualquier falla temprana.',
      };
    case 'emergencia':
      return {
        summary: `El cultivo de ${rubro} está arrancando y requiere observación diaria.`,
        todayTask: 'Revisa emergencia pareja, resiembra fallas y vigila daños tempranos.',
        nextTask: 'Registrar malezas, plagas iniciales o necesidad de nutrición base.',
      };
    case 'desarrollo':
      return {
        summary: `El ${rubro} está en crecimiento activo.`,
        todayTask: 'Prioriza nutrición, control preventivo y observación sanitaria.',
        nextTask: 'Preparar siguiente fertilización o aplicación foliar si el clima lo permite.',
      };
    case 'floracion':
      return {
        summary: `Tu ${rubro} está en una etapa sensible de floración.`,
        todayTask: 'Evita estrés hídrico y revisa plagas o enfermedades que afecten flor o cuajado.',
        nextTask: 'Monitorear estabilidad del cultivo y registrar cualquier incidencia.',
      };
    case 'llenado':
      return {
        summary: `El ${rubro} entra en llenado y consolidación de rendimiento.`,
        todayTask: 'Vigila humedad, sanidad y calidad del desarrollo final.',
        nextTask: 'Preparar logística de cosecha y evaluar fecha probable de salida.',
      };
    case 'precosecha':
      return {
        summary: `El lote de ${rubro} se acerca a cosecha.`,
        todayTask: 'Confirma madurez, mano de obra y ventana climática para cosechar.',
        nextTask: 'Organizar cosecha, venta y transporte.',
      };
    case 'cosecha':
      return {
        summary: `Tu ciclo de ${rubro} está en cosecha o cierre.`,
        todayTask: 'Ejecuta cosecha con registro de calidad, rendimiento y salida.',
        nextTask: 'Preparar venta, transporte y cierre del ciclo en el diario.',
      };
    default:
      return {
        summary: 'Faltan datos base para activar el acompañamiento agronómico completo.',
        todayTask: 'Registra tu finca y anota al menos la siembra o el primer evento relevante.',
        nextTask: 'Completar datos del cultivo para que la app te acompañe con más precisión.',
      };
  }
}

function inferStageFromDays(daysSinceSowing: number): AgronomicStage {
  if (daysSinceSowing <= 3) return 'siembra';
  if (daysSinceSowing <= 15) return 'emergencia';
  if (daysSinceSowing <= 45) return 'desarrollo';
  if (daysSinceSowing <= 70) return 'floracion';
  if (daysSinceSowing <= 95) return 'llenado';
  if (daysSinceSowing <= 120) return 'precosecha';
  return 'cosecha';
}

export function buildAgronomicAssistantSnapshot(input: {
  fincas: Finca[];
  cosechas: Cosecha[];
  localEntries: LocalFieldEvent[];
  climateAlerts?: AlertaGenerada[];
  currentClimate?: ClimaActual | null;
}): AgronomicAssistantSnapshot {
  const finca = input.fincas[0] ?? null;
  const lotEntries = finca ? input.localEntries.filter((entry) => entry.finca_id === finca.id) : [];
  const latestEntry = lotEntries
    .slice()
    .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())[0] ?? null;
  const sowingEntry = lotEntries
    .filter((entry) => inferEventType(entry) === 'SIEMBRA')
    .sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime())[0] ?? null;
  const harvestEntry = lotEntries
    .filter((entry) => {
      const raw = `${entry.tipo} ${entry.descripcion ?? ''}`.toLowerCase();
      return raw.includes('cosecha');
    })
    .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())[0] ?? null;
  const linkedHarvest = finca
    ? input.cosechas.find((item) => item.finca_id === finca.id && item.estado !== 'cancelada') ?? null
    : null;

  const minimumData = Boolean(finca?.id && finca.rubro && (sowingEntry || latestEntry || linkedHarvest));
  let stage: AgronomicStage = 'sin_datos';
  if (finca?.id && !minimumData) {
    stage = 'preparacion';
  }
  if (sowingEntry) {
    const sowingDate = normalizeDate(sowingEntry.fecha);
    if (sowingDate) stage = inferStageFromDays(daysBetween(sowingDate));
  }
  if (!sowingEntry && latestEntry) {
    const inferredType = inferEventType(latestEntry);
    if (inferredType === 'FERTILIZACION' || inferredType === 'APLICACION_QUIMICA') {
      stage = 'desarrollo';
    } else if (latestEntry.tipo.toLowerCase().includes('cosecha')) {
      stage = 'cosecha';
    }
  }
  if (linkedHarvest?.estado === 'vendida') stage = 'cosecha';
  if (harvestEntry) stage = 'cosecha';

  const taskPack = stageTasks(stage, finca?.rubro ?? 'cultivo');
  const risks = (input.climateAlerts ?? []).map((item) => item.titulo);
  if (input.currentClimate?.descripcion?.toLowerCase().includes('lluv')) {
    risks.push('Posible lluvia en el entorno del lote.');
  }
  if ((input.currentClimate?.temperatura ?? 0) >= 38) {
    risks.push('Temperatura muy alta: vigila estrés hídrico y horario de labores.');
  }

  const applicationWindow = !minimumData
    ? 'Completa siembra o primer evento del diario para activar recomendaciones más precisas.'
    : risks.some((risk) => risk.toLowerCase().includes('lluv'))
      ? 'Es mejor esperar antes de aplicar foliares o fertilizantes por posible lluvia cercana.'
      : (input.currentClimate?.temperatura ?? 0) >= 38
        ? 'Evita aplicar en horas de calor fuerte; prioriza primeras horas de la mañana o final de la tarde.'
        : 'La ventana luce operativa si confirmas humedad, viento y mano de obra en campo.';

  return {
    hasMinimumData: minimumData,
    finca,
    stage,
    stageLabel: stageLabel(stage),
    summary: taskPack.summary,
    todayTask: taskPack.todayTask,
    nextTask: taskPack.nextTask,
    applicationWindow,
    risks: Array.from(new Set(risks)).slice(0, 4),
    latestEventLabel: latestEntry?.tipo ?? null,
    latestEventDate: latestEntry?.fecha ?? null,
  };
}
