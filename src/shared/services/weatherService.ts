/**
 * weatherService – Clima Open-Meteo (gratuito, sin API key) + alertas agrícolas
 * API: https://open-meteo.com/
 * Docs: https://open-meteo.com/en/docs
 */
import { supabase } from '@/shared/lib/supabase';

export interface ClimaActual {
  municipio: string;
  temperatura: number;
  descripcion: string;
  humedad?: number | null;
  vientoKmh?: number | null;
  sensacionTermica?: number | null;
  lluviaMmActual?: number | null;
}

export interface AlertaGenerada {
  titulo: string;
  mensaje: string;
  severidad: 'baja' | 'media' | 'alta' | 'critica';
}

type AlertFingerprintInput = {
  perfilId: string;
  fincaId?: string | null;
  tipo: string;
  titulo: string;
};

/** Convierte código WMO a descripción en español. */
function wmoDescripcion(code: number): string {
  if (code === 0) return 'Cielo despejado';
  if (code === 1) return 'Mayormente despejado';
  if (code === 2) return 'Parcialmente nublado';
  if (code === 3) return 'Nublado';
  if (code <= 48) return 'Niebla';
  if (code <= 57) return 'Llovizna';
  if (code <= 67) return 'Lluvia';
  if (code <= 77) return 'Nieve';
  if (code <= 82) return 'Chubascos';
  if (code <= 86) return 'Chubascos de nieve';
  if (code <= 99) return 'Tormenta eléctrica';
  return 'N/D';
}

/** URL base Open-Meteo con todos los campos necesarios. */
function buildUrl(lat: number, lon: number): string {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    current: 'temperature_2m,rain,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code',
    hourly: 'temperature_2m,relative_humidity_2m,apparent_temperature,rain,precipitation',
    daily: 'weather_code,precipitation_sum',
    timezone: 'GMT',
    forecast_days: '3',
  });
  return `https://api.open-meteo.com/v1/forecast?${params.toString()}`;
}

interface OpenMeteoResponse {
  current?: {
    temperature_2m?: number;
    rain?: number;
    apparent_temperature?: number;
    relative_humidity_2m?: number;
    wind_speed_10m?: number;
    weather_code?: number;
  };
  hourly?: {
    time?: string[];
    precipitation?: number[];
    rain?: number[];
    relative_humidity_2m?: number[];
  };
  daily?: {
    time?: string[];
    weather_code?: number[];
    precipitation_sum?: number[];
  };
}

async function fetchOpenMeteo(lat: number, lon: number, signal?: AbortSignal): Promise<OpenMeteoResponse | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8_000);
  const effectiveSignal = signal ?? ctrl.signal;
  try {
    const r = await fetch(buildUrl(lat, lon), { signal: effectiveSignal });
    clearTimeout(timer);
    if (!r.ok) throw new Error(`Open-Meteo HTTP ${r.status}`);
    return (await r.json()) as OpenMeteoResponse;
  } catch {
    clearTimeout(timer);
    return null;
  }
}

export const weatherService = {
  async obtenerPorCoordenadas(lat: number, lon: number, signal?: AbortSignal): Promise<ClimaActual> {
    const data = await fetchOpenMeteo(lat, lon, signal);
    if (!data?.current) {
      return { municipio: 'N/D', temperatura: 0, descripcion: 'Sin conexión' };
    }

    const cur = data.current;
    const temp = Math.round(cur.temperature_2m ?? 0);
    const sensacion = cur.apparent_temperature != null ? Math.round(cur.apparent_temperature) : null;
    const humedad = typeof cur.relative_humidity_2m === 'number' ? cur.relative_humidity_2m : null;
    const vientoKmh = cur.wind_speed_10m != null ? Math.round(cur.wind_speed_10m) : null;
    const lluvia = cur.rain ?? null;
    const desc = wmoDescripcion(cur.weather_code ?? 0);

    return {
      municipio: `${lat.toFixed(2)},${lon.toFixed(2)}`,
      temperatura: temp,
      descripcion: desc,
      humedad,
      vientoKmh,
      sensacionTermica: sensacion,
      lluviaMmActual: lluvia,
    };
  },

  async generarAlerta(clima: ClimaActual, rubro?: string): Promise<AlertaGenerada | null> {
    if (clima.temperatura > 38) {
      return {
        titulo: 'Ola de calor',
        mensaje: `Temperatura alta: ${clima.temperatura}°C${rubro ? ` en tu lote de ${rubro}` : ''}. Refuerza vigilancia hídrica y evita aplicaciones en horas fuertes.`,
        severidad: 'alta',
      };
    }
    return null;
  },

  async generarAlertasAgricolas(input: {
    clima: ClimaActual;
    rubro?: string | null;
    mmLluviaProxima?: number;
    stageLabel?: string | null;
  }): Promise<AlertaGenerada[]> {
    const alerts: AlertaGenerada[] = [];
    const ctx = input.rubro ? ` para ${input.rubro}` : '';
    const rainMm = input.mmLluviaProxima ?? 0;

    if (rainMm >= 5) {
      alerts.push({
        titulo: 'Lluvia próxima',
        mensaje: `Se esperan ${rainMm.toFixed(1)} mm de lluvia${ctx}. Evita foliares o fertilización expuesta si no es indispensable.`,
        severidad: rainMm >= 10 ? 'alta' : 'media',
      });
    }

    if (input.clima.temperatura >= 38) {
      alerts.push({
        titulo: 'Estrés térmico',
        mensaje: `El lote registra ${input.clima.temperatura}°C${ctx}. Protege labores sensibles y revisa hidratación del cultivo.`,
        severidad: 'alta',
      });
    }

    if ((input.clima.humedad ?? 0) >= 88 && ['desarrollo', 'floracion', 'llenado'].includes((input.stageLabel ?? '').toLowerCase())) {
      alerts.push({
        titulo: 'Humedad favorable a enfermedades',
        mensaje: `La humedad está alta${ctx}. Mantén vigilancia sanitaria y revisa aparición de manchas o mildiu.`,
        severidad: 'media',
      });
    }

    if ((input.clima.vientoKmh ?? 0) >= 30) {
      alerts.push({
        titulo: 'Viento fuerte',
        mensaje: `Se detecta viento fuerte (${input.clima.vientoKmh} km/h)${ctx}. No apliques productos de cobertura sin evaluar deriva.`,
        severidad: 'media',
      });
    }

    return alerts;
  },

  /** Suma precipitación de las próximas `horas` horas usando Open-Meteo hourly. */
  async lluviaAcumuladaProximasHoras(lat: number, lon: number, horas = 6): Promise<{ mm: number; sinApi: boolean }> {
    const data = await fetchOpenMeteo(lat, lon);
    if (!data?.hourly?.time || !data.hourly.precipitation) return { mm: 0, sinApi: true };

    const ahora = Date.now();
    let mm = 0;
    let count = 0;
    for (let i = 0; i < data.hourly.time.length && count < horas; i++) {
      const t = new Date(data.hourly.time[i] + 'Z').getTime();
      if (t >= ahora) {
        mm += data.hourly.precipitation[i] ?? 0;
        count++;
      }
    }
    return { mm, sinApi: false };
  },

  async riesgoLavadoPluvial(lat: number, lon: number, umbralMm = 5): Promise<{ alerta: boolean; mm: number; sinApi: boolean }> {
    const { mm, sinApi } = await this.lluviaAcumuladaProximasHoras(lat, lon, 6);
    return { alerta: !sinApi && mm >= umbralMm, mm, sinApi };
  },

  async existeAlertaReciente(input: AlertFingerprintInput, withinHours = 10): Promise<boolean> {
    const since = new Date(Date.now() - withinHours * 3_600_000).toISOString();
    let query = supabase
      .from('alertas_clima')
      .select('id', { head: true, count: 'exact' })
      .eq('perfil_id', input.perfilId)
      .eq('tipo', input.tipo)
      .eq('titulo', input.titulo)
      .gte('creado_en', since);
    if (input.fincaId) query = query.eq('finca_id', input.fincaId);
    const { count, error } = await query;
    if (error) throw error;
    return (count ?? 0) > 0;
  },

  async guardarAlerta(perfilId: string, alerta: AlertaGenerada, fincaId?: string, dedupeHours = 10): Promise<void> {
    const exists = await this.existeAlertaReciente({
      perfilId,
      fincaId,
      tipo: 'clima',
      titulo: alerta.titulo,
    }, dedupeHours);
    if (exists) return;
    const { error } = await supabase.from('alertas_clima').insert({
      perfil_id: perfilId,
      finca_id: fincaId ?? null,
      tipo: 'clima',
      titulo: alerta.titulo,
      mensaje: alerta.mensaje,
      severidad: alerta.severidad,
      leida: false,
    });
    if (error) throw error;
  },
};
