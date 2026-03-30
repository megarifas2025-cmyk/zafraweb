/**
 * storageService – Compresión <300KB antes de subir
 * Documentos KYC: sin comprimir. Fotos de plagas/docs: máx 300KB.
 */
import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import { supabase } from '@/shared/lib/supabase';

const MAX_SIZE_BYTES = 300 * 1024; // 300KB
type Bucket =
  | 'kyc-docs'
  | 'cosecha-fotos'
  | 'avatares'
  | 'diario-fotos'
  | 'vehiculo-docs'
  | 'billetera-logistica'
  | 'early-warnings'
  | 'chat-media'
  | 'field-inspection-photos';

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function inferContentType(uri: string): string {
  const cleanUri = uri.split('?')[0] ?? uri;
  const ext = cleanUri.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    case 'pdf':
      return 'application/pdf';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    default:
      return 'application/octet-stream';
  }
}

function base64ToBytes(base64: string): Uint8Array {
  const clean = base64.replace(/\s/g, '');
  if (typeof globalThis.atob === 'function') {
    const binary = globalThis.atob(clean);
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  }

  const normalized = clean.replace(/=+$/, '');
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;

  for (const char of normalized) {
    const value = BASE64_ALPHABET.indexOf(char);
    if (value < 0) continue;
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }

  return Uint8Array.from(bytes);
}

export const storageService = {
  async comprimirHasta300KB(uri: string): Promise<string> {
    let result = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 1280 } }],
      { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG },
    );
    let info = await FileSystem.getInfoAsync(result.uri);
    let size = info.exists ? info.size : 0;
    let quality = 0.7;
    while (size > MAX_SIZE_BYTES && quality > 0.2) {
      quality -= 0.1;
      result = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: Math.round(1280 * quality) } }],
        { compress: quality, format: ImageManipulator.SaveFormat.JPEG },
      );
      info = await FileSystem.getInfoAsync(result.uri);
      size = info.exists ? info.size : 0;
    }
    return result.uri;
  },

  async subir(bucket: Bucket, ruta: string, uri: string, comprimir = true): Promise<string> {
    const esImagen = /\.(jpg|jpeg|png|webp)$/i.test(uri);
    const finalUri = comprimir && esImagen ? await this.comprimirHasta300KB(uri) : uri;

    const b64 = await FileSystem.readAsStringAsync(finalUri, { encoding: FileSystem.EncodingType.Base64 });
    const bytes = base64ToBytes(b64);
    const contentType = inferContentType(finalUri);

    const { error } = await supabase.storage.from(bucket).upload(ruta, bytes, { contentType, upsert: true });
    if (error) throw error;
    const { data } = supabase.storage.from(bucket).getPublicUrl(ruta);
    return data.publicUrl;
  },

  async subirKyc(userId: string, tipo: string, uri: string): Promise<string> {
    const ext = uri.split('.').pop() ?? 'jpg';
    return this.subir('kyc-docs', `${userId}/${tipo}_${Date.now()}.${ext}`, uri, false);
  },

  async subirBilletera(userId: string, tipo: string, viajeId: string, uri: string): Promise<string> {
    const ext = uri.split('.').pop() ?? 'jpg';
    return this.subir('billetera-logistica', `${userId}/${viajeId}/${tipo}_${Date.now()}.${ext}`, uri, false);
  },

  async subirCosechaFoto(userId: string, cosechaId: string, uri: string): Promise<string> {
    return this.subir('cosecha-fotos', `${userId}/${cosechaId}/${Date.now()}.jpg`, uri, true);
  },

  async subirAvatar(userId: string, uri: string): Promise<string> {
    return this.subir('avatares', `${userId}/avatar-${Date.now()}.jpg`, uri, true);
  },

  async subirChatImagen(userId: string, scope: 'market' | 'logistics', refId: string, uri: string): Promise<string> {
    return this.subir('chat-media', `${userId}/${scope}/${refId}/${Date.now()}.jpg`, uri, true);
  },

  async subirLogoEmpresa(perfilId: string, uri: string): Promise<string> {
    return this.subir('avatares', `company-logos/${perfilId}/${Date.now()}.jpg`, uri, true);
  },
};
