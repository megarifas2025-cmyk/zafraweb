import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { cacheDirectory, copyAsync } from 'expo-file-system/legacy';
import { fetchFieldInspectionForPdf } from '@/shared/services/fieldInspectionService';
import type { FieldInspection, InsumoRecomendado } from '@/shared/types';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function insumosListHtml(items: InsumoRecomendado[]): string {
  if (!items.length) return '<p><em>Sin insumos registrados.</em></p>';
  return `<ul>${items
    .map(
      (i) =>
        `<li><strong>${escapeHtml(i.nombre)}</strong>${i.dosis ? ` — ${escapeHtml(i.dosis)}` : ''}${i.notas ? `<br/><span style="font-size:11px;color:#555">${escapeHtml(i.notas)}</span>` : ''}</li>`,
    )
    .join('')}</ul>`;
}

export function buildFieldInspectionPdfHtml(data: FieldInspection): string {
  const c = data.companies;
  const fecha = new Date().toLocaleString('es-VE');
  const coords =
    data.coordenadas_gps != null
      ? `${data.coordenadas_gps.lat.toFixed(6)}, ${data.coordenadas_gps.lng.toFixed(6)}`
      : '—';
  const logoImg = c?.logo_url ? `<img src="${escapeHtml(c.logo_url)}" style="max-height:56px;max-width:120px" />` : '—';

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8" /></head>
<body style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#222;padding:24px">
  <table style="width:100%;border-collapse:collapse">
    <tr>
      <td style="width:50%;vertical-align:top">
        ${logoImg}
        <p style="margin:8px 0 0 0"><strong>${escapeHtml(c?.razon_social ?? 'Empresa')}</strong></p>
        <p style="margin:4px 0">RIF: ${escapeHtml(c?.rif ?? '—')}</p>
        <p style="margin:4px 0">${escapeHtml(c?.direccion_fiscal ?? c?.direccion ?? '—')}</p>
        <p style="margin:4px 0">Tel: ${escapeHtml(c?.telefono_contacto ?? '—')}</p>
        <p style="margin:4px 0">Correo: ${escapeHtml(c?.correo_contacto ?? '—')}</p>
      </td>
      <td style="width:50%;vertical-align:top;text-align:right">
        <p style="margin:0"><strong>${escapeHtml(data.numero_control)}</strong></p>
        <p style="margin:4px 0">${escapeHtml(fecha)}</p>
        <p style="margin:4px 0"><strong>GPS:</strong> ${escapeHtml(coords)}</p>
        <p style="margin:4px 0"><strong>Fecha programada:</strong> ${escapeHtml(data.fecha_programada)}</p>
        <p style="margin:4px 0"><strong>Estatus:</strong> ${escapeHtml(data.estatus)}</p>
        <p style="margin:4px 0"><strong>Acta:</strong> ${escapeHtml(data.estado_acta ?? '—')}</p>
      </td>
    </tr>
  </table>
  <hr style="border:none;border-top:1px solid #333;margin:16px 0" />
  <h2 style="font-size:14px;margin:0 0 8px 0">Resultado de inspección técnica</h2>
  <table style="width:100%;border:1px solid #ccc;border-collapse:collapse;margin-bottom:12px">
    <tr style="background:#f5f5f5"><th style="text-align:left;padding:8px;border:1px solid #ccc">Campo</th><th style="text-align:left;padding:8px;border:1px solid #ccc">Detalle</th></tr>
    <tr><td style="padding:8px;border:1px solid #ccc">Tipo de inspección</td><td style="padding:8px;border:1px solid #ccc">${escapeHtml(data.tipo_inspeccion ?? '—')}</td></tr>
    <tr><td style="padding:8px;border:1px solid #ccc">Resumen dictamen</td><td style="padding:8px;border:1px solid #ccc">${escapeHtml(data.resumen_dictamen ?? '—')}</td></tr>
    <tr><td style="padding:8px;border:1px solid #ccc">Observaciones</td><td style="padding:8px;border:1px solid #ccc">${escapeHtml(data.observaciones_tecnicas ?? '—')}</td></tr>
    <tr><td style="padding:8px;border:1px solid #ccc">Daño estimado</td><td style="padding:8px;border:1px solid #ccc">${escapeHtml(data.porcentaje_dano != null ? `${data.porcentaje_dano}%` : '—')}</td></tr>
    <tr><td style="padding:8px;border:1px solid #ccc">Rendimiento precosecha</td><td style="padding:8px;border:1px solid #ccc">${escapeHtml(data.estimacion_rendimiento_ton != null ? `${data.estimacion_rendimiento_ton} ton` : '—')}</td></tr>
    <tr><td style="padding:8px;border:1px solid #ccc">Area verificada</td><td style="padding:8px;border:1px solid #ccc">${escapeHtml(data.area_verificada_ha != null ? `${data.area_verificada_ha} ha` : '—')}</td></tr>
    <tr><td style="padding:8px;border:1px solid #ccc">Fase fenológica</td><td style="padding:8px;border:1px solid #ccc">${escapeHtml(data.fase_fenologica ?? '—')}</td></tr>
    <tr><td style="padding:8px;border:1px solid #ccc">Malezas / Plagas</td><td style="padding:8px;border:1px solid #ccc">${escapeHtml(`${data.malezas_reportadas ?? '—'} / ${data.plagas_reportadas ?? '—'}`)}</td></tr>
    <tr><td style="padding:8px;border:1px solid #ccc">Precisión GPS</td><td style="padding:8px;border:1px solid #ccc">${escapeHtml(data.precision_gps_m != null ? `±${Math.round(data.precision_gps_m)} m` : '—')}</td></tr>
    <tr><td style="padding:8px;border:1px solid #ccc">Fuera de lote</td><td style="padding:8px;border:1px solid #ccc">${escapeHtml(data.fuera_de_lote ? 'Sí' : 'No')}</td></tr>
    <tr><td style="padding:8px;border:1px solid #ccc">Firmas</td><td style="padding:8px;border:1px solid #ccc">${escapeHtml(`${data.firma_perito?.nombre ?? 'Perito pendiente'} / ${data.firma_productor?.nombre ?? 'Productor pendiente'}`)}</td></tr>
  </table>
  <h3 style="font-size:13px">Insumos recomendados</h3>
  ${insumosListHtml(data.insumos_recomendados ?? [])}
  <p style="margin-top:24px;font-size:10px;color:#777">Documento generado desde ZafraClic · Módulo Búnker</p>
</body></html>`;
}

export async function generateAndShareFieldInspectionPdf(inspectionId: string): Promise<void> {
  try {
    const data = await fetchFieldInspectionForPdf(inspectionId);
    if (!data) throw new Error('Inspección no encontrada o sin permiso.');
    const html = buildFieldInspectionPdfHtml(data);
    const { uri } = await Print.printToFileAsync({ html });
    const name = `${data.numero_control.replace(/[^a-zA-Z0-9-]/g, '_')}.pdf`;
    const base = cacheDirectory;
    if (!base) throw new Error('Generación de PDF no disponible en este dispositivo.');
    const dest = `${base}${name}`;
    await copyAsync({ from: uri, to: dest });
    const can = await Sharing.isAvailableAsync();
    if (can) {
      await Sharing.shareAsync(dest, { mimeType: 'application/pdf', dialogTitle: 'Compartir informe' });
    } else {
      throw new Error('Compartir archivos no está disponible en este dispositivo.');
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'No se pudo generar el informe PDF.';
    if (e instanceof Error) {
      throw new Error(msg, { cause: e });
    }
    throw new Error(msg, { cause: e });
  }
}
