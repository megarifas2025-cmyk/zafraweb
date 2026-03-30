/**
 * Envía la imagen al backend seguro y devuelve el nombre del insumo detectado.
 */
import { readAsStringAsync, EncodingType } from 'expo-file-system/legacy';
import { invokeProcessGemini } from '@/shared/services/geminiGatewayService';
import { GEMINI_AGRONOMY_SYSTEM_INSTRUCTION } from '@/shared/lib/geminiEnv';

export async function extractNombreInsumoDesdeImagen(imageUri: string): Promise<string> {
  try {
    const base64 = await readAsStringAsync(imageUri, {
      encoding: EncodingType.Base64,
    });
    const mime = imageUri.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
    const prompt =
      'Mira la imagen (empaque, etiqueta o producto agrícola). ' +
      'Responde SOLO con el nombre corto del insumo agrícola (ej. "Urea granulada", "Herbicida glifosato", semilla híbrida de maíz). ' +
      'Sin comillas ni explicación.';
    const json = await invokeProcessGemini({
      systemInstruction: {
        parts: [{ text: GEMINI_AGRONOMY_SYSTEM_INSTRUCTION }],
      },
      contents: [
        {
          parts: [
            { text: prompt },
            { inlineData: { mimeType: mime, data: base64 } },
          ],
        },
      ],
    });
    const text: string | undefined = (json as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> })?.candidates?.[0]?.content?.parts?.[0]?.text;
    return (text ?? '').trim().replace(/^["']|["']$/g, '') || 'Producto no identificado';
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo procesar la imagen con IA.';
    throw new Error(message, { cause: error });
  }
}
