import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  Image,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Perfil } from '@/shared/types';
import { supabase } from '@/shared/lib/supabase';
import {
  listarMensajesLogistica,
  enviarMensajeLogistica,
  enviarImagenLogistica,
  obtenerMetadatosSala,
  confirmarTransportistaFlete,
} from '@/shared/services/freightRequestsService';
import { reportChatIncident } from '@/shared/services/chatGovernanceService';
import { moderateOutgoingChatText, explainChatSafetyPolicy } from '@/shared/services/chatModerationService';
import { storageService } from '@/shared/services/storageService';
import type { LogisticsMensaje } from '@/shared/types';
import { COLORS, FONT, SPACE, RADIUS, SHADOW } from '@/shared/utils/theme';

interface Props {
  visible: boolean;
  onClose: () => void;
  salaId: string | null;
  perfil: Perfil | null;
  /** Texto opcional para el subtítulo (p. ej. tipo de servicio). */
  subtitle?: string | null;
  /** Callback tras confirmar el transportista (recarga lista de solicitudes). */
  onTratoCerrado?: () => void;
}

export function LogisticsChatModal({ visible, onClose, salaId, perfil, subtitle: subtitleProp, onTratoCerrado }: Props) {
  const insets = useSafeAreaInsets();
  const [mensajes, setMensajes] = useState<LogisticsMensaje[]>([]);
  const [cargando, setCargando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [texto, setTexto] = useState('');
  const [headerSub, setHeaderSub] = useState<string | null>(null);
  const [subiendoImagen, setSubiendoImagen] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [salaInfo, setSalaInfo] = useState<{
    requester_id: string;
    trato_cerrado: boolean;
    freight_estado: string | null;
  } | null>(null);
  const listRef = useRef<FlatList<LogisticsMensaje>>(null);

  const cargar = useCallback(async () => {
    if (!salaId) return;
    setCargando(true);
    try {
      const [rows, meta] = await Promise.all([
        listarMensajesLogistica(salaId),
        obtenerMetadatosSala(salaId),
      ]);
      setMensajes(rows);
      if (meta) {
        setSalaInfo({
          requester_id: meta.requester_id,
          trato_cerrado: meta.trato_cerrado,
          freight_estado: meta.freight_estado,
        });
      }
      if (!subtitleProp && salaId) {
        const { data } = await supabase
          .from('logistics_salas')
          .select('freight_requests(tipo_servicio, origen_municipio, origen_estado)')
          .eq('id', salaId)
          .maybeSingle();
        const frRaw = data?.freight_requests as
          | { tipo_servicio?: string; origen_municipio?: string; origen_estado?: string }
          | { tipo_servicio?: string; origen_municipio?: string; origen_estado?: string }[]
          | null
          | undefined;
        const fr = Array.isArray(frRaw) ? frRaw[0] : frRaw;
        if (fr?.tipo_servicio) {
          setHeaderSub(`${fr.tipo_servicio} · ${fr.origen_municipio ?? ''}, ${fr.origen_estado ?? ''}`);
        }
      }
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'No se pudieron cargar los mensajes.');
    } finally {
      setCargando(false);
    }
  }, [salaId, subtitleProp]);

  useEffect(() => {
    if (subtitleProp) setHeaderSub(subtitleProp);
  }, [subtitleProp]);

  // Auto-scroll al último mensaje cada vez que llega uno nuevo
  useEffect(() => {
    if (mensajes.length === 0) return undefined;
    const t = setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 60);
    return () => clearTimeout(t);
  }, [mensajes.length]);

  useEffect(() => {
    if (!visible || !salaId || !perfil) return undefined;
    setMensajes([]);
    setSalaInfo(null);
    let cancelled = false;
    (async () => {
      if (!cancelled) await cargar();
    })();

    const channel = supabase
      .channel(`logistics-msg-${salaId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'logistics_mensajes',
          filter: `sala_id=eq.${salaId}`,
        },
        (payload) => {
          if (cancelled) return;
          const row = payload.new as LogisticsMensaje;
          setMensajes((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row]));
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [visible, salaId, perfil, cargar]);

  async function enviar() {
    if (!sid || !perfil || !texto.trim()) return;
    const moderation = moderateOutgoingChatText(texto);
    if (moderation) {
      await reportChatIncident({
        source: 'logistics',
        logisticsSalaId: sid,
        reportedBy: perfil.id,
        offenderId: perfil.id,
        category: moderation.category,
        severity: moderation.severity,
        reason: moderation.message,
        messageExcerpt: texto.trim(),
        autoDetected: true,
      }).catch(() => undefined);
      Alert.alert('Mensaje bloqueado', moderation.message);
      return;
    }
    const trimmed = texto.trim();

    // Optimistic update: el mensaje aparece de inmediato
    const tempId = `temp-${Date.now()}`;
    const tempMsg: LogisticsMensaje = {
      id: tempId,
      sala_id: sid,
      autor_id: perfil.id,
      contenido: trimmed,
      tipo: 'texto',
      media_url: null,
      creado_en: new Date().toISOString(),
    };
    setMensajes((prev) => [...prev, tempMsg]);
    setTexto('');
    setEnviando(true);

    try {
      const msgId = await enviarMensajeLogistica(sid, perfil.id, trimmed);
      if (msgId) {
        setMensajes((prev) => {
          if (prev.some((m) => m.id === msgId)) return prev.filter((m) => m.id !== tempId);
          return prev.map((m) => (m.id === tempId ? { ...m, id: msgId } : m));
        });
      } else {
        setMensajes((prev) => prev.filter((m) => m.id !== tempId));
      }
    } catch (e: unknown) {
      setMensajes((prev) => prev.filter((m) => m.id !== tempId));
      setTexto(trimmed);
      const raw = e instanceof Error ? e.message : 'No se pudo enviar.';
      const clean = raw.includes('CHAT_POLICY_BLOCK:') ? raw.split('CHAT_POLICY_BLOCK:').pop() ?? raw : raw;
      Alert.alert(raw.includes('CHAT_POLICY_BLOCK:') ? 'Mensaje bloqueado' : 'Error', clean);
    } finally {
      setEnviando(false);
    }
  }

  async function subirImagenDesdeUri(uri: string) {
    if (!perfil || !sid) return;
    setSubiendoImagen(true);
    try {
      const url = await storageService.subirChatImagen(perfil.id, 'logistics', sid, uri);
      await enviarImagenLogistica(sid, url, texto);
      setTexto('');
    } catch (e: unknown) {
      Alert.alert('Imagen', e instanceof Error ? e.message : 'No se pudo enviar la imagen.');
    } finally {
      setSubiendoImagen(false);
    }
  }

  function enviarImagen() {
    if (!sid || !perfil) return;
    Alert.alert('Enviar imagen', 'Selecciona cómo quieres adjuntar la foto.', [
      {
        text: 'Cámara',
        onPress: () =>
          void (async () => {
            const permission = await ImagePicker.requestCameraPermissionsAsync();
            if (permission.status !== 'granted') {
              Alert.alert('Permiso requerido', 'Debes permitir acceso a la cámara para tomar una foto.');
              return;
            }
            const picked = await ImagePicker.launchCameraAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              quality: 0.8,
              allowsEditing: true,
            });
            if (picked.canceled || !picked.assets?.[0]?.uri) return;
            await subirImagenDesdeUri(picked.assets[0].uri);
          })(),
      },
      {
        text: 'Galería',
        onPress: () =>
          void (async () => {
            const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (permission.status !== 'granted') {
              Alert.alert('Permiso requerido', 'Debes permitir acceso a tus fotos para compartir imágenes en el chat.');
              return;
            }
            const picked = await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              quality: 0.8,
              allowsEditing: true,
            });
            if (picked.canceled || !picked.assets?.[0]?.uri) return;
            await subirImagenDesdeUri(picked.assets[0].uri);
          })(),
      },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  }

  function reportarChat() {
    if (!perfil || !sid) return;
    Alert.alert('Reportar conversación', 'Selecciona el motivo del reporte.', [
      {
        text: 'Estafa',
        onPress: () =>
          void reportChatIncident({
            source: 'logistics',
            logisticsSalaId: sid,
            reportedBy: perfil.id,
            category: 'fraud_attempt',
            severity: 'critica',
            reason: 'Reporte manual por posible estafa o manipulación de servicio logístico.',
            messageExcerpt: texto.trim() || null,
          }).then(() => Alert.alert('Reporte enviado', 'Tu reporte fue enviado al panel del CEO.')),
      },
      {
        text: 'Lenguaje ofensivo',
        onPress: () =>
          void reportChatIncident({
            source: 'logistics',
            logisticsSalaId: sid,
            reportedBy: perfil.id,
            category: 'manual_report',
            severity: 'alta',
            reason: 'Reporte manual por lenguaje ofensivo o maltrato.',
            messageExcerpt: texto.trim() || null,
          }).then(() => Alert.alert('Reporte enviado', 'Tu reporte fue enviado al panel del CEO.')),
      },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  }

  async function confirmarTransportista() {
    if (!sid || !perfil) return;
    Alert.alert(
      'Confirmar transportista',
      'Al confirmar, este transportista queda asignado a tu solicitud. Los demás serán notificados que el trato está cerrado.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Sí, confirmar',
          onPress: async () => {
            setConfirmando(true);
            try {
              await confirmarTransportistaFlete(sid);
              setSalaInfo(prev => prev ? { ...prev, trato_cerrado: true, freight_estado: 'asignada' } : prev);
              Alert.alert(
                '¡Acuerdo cerrado!',
                'El transportista fue confirmado. Tu solicitud ya no aparece en la pizarra pública.',
              );
              onTratoCerrado?.();
            } catch (e: unknown) {
              Alert.alert('Error', e instanceof Error ? e.message : 'No se pudo confirmar el acuerdo.');
            } finally {
              setConfirmando(false);
            }
          },
        },
      ],
    );
  }

  // sid debe estar declarado antes de las funciones que lo usan
  const sid = salaId;

  if (!perfil) return null;
  const open = visible && !!sid;
  const emptyHint =
    perfil.rol === 'transporter'
      ? 'Aún no hay mensajes. Preséntate y coordina los detalles con el generador de carga.'
      : 'Aún no hay mensajes. Saluda al transportista o al generador de carga.';

  return (
    <Modal visible={open} animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={s.root}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <View style={[s.topBar, { paddingTop: Math.max(insets.top, Platform.OS === 'ios' ? 16 : SPACE.md) }]}>
          <TouchableOpacity onPress={onClose} hitSlop={12}>
            <Text style={s.cerrar}>‹ Volver</Text>
          </TouchableOpacity>
          <View style={s.topTitWrap}>
            <Text style={s.titulo} numberOfLines={1}>
              Coordinación logística
            </Text>
            {headerSub ? (
              <Text style={s.subtitulo} numberOfLines={2}>
                {headerSub}
              </Text>
            ) : null}
          </View>
        </View>

        <View style={s.noticeCard}>
          <Text style={s.noticeTitle}>Seguridad del chat</Text>
          <Text style={s.noticeText}>{explainChatSafetyPolicy()}</Text>
          <TouchableOpacity style={s.noticeBtn} onPress={reportarChat} activeOpacity={0.88}>
            <Text style={s.noticeBtnTxt}>Reportar incidente</Text>
          </TouchableOpacity>
        </View>

        {/* Banner: trato cerrado */}
        {salaInfo?.trato_cerrado ? (
          <View style={s.tratoCerradoBanner}>
            <Text style={s.tratoCerradoIcon}>🔒</Text>
            <View style={s.tratoCerradoBody}>
              <Text style={s.tratoCerradoTit}>Acuerdo confirmado</Text>
              <Text style={s.tratoCerradoSub}>El solicitante eligió este transportista. El servicio está en coordinación.</Text>
            </View>
          </View>
        ) : null}

        {/* Botón confirmar: solo visible para el solicitante cuando el trato aún no está cerrado */}
        {salaInfo && !salaInfo.trato_cerrado &&
         perfil?.id === salaInfo.requester_id &&
         (salaInfo.freight_estado === 'abierta' || salaInfo.freight_estado === 'con_postulaciones') ? (
          <TouchableOpacity
            style={s.confirmarBtn}
            onPress={() => void confirmarTransportista()}
            disabled={confirmando}
            activeOpacity={0.88}
          >
            {confirmando ? (
              <ActivityIndicator color="#FFF" size="small" />
            ) : (
              <>
                <Text style={s.confirmarBtnIcon}>✅</Text>
                <Text style={s.confirmarBtnTxt}>Confirmar este transportista</Text>
              </>
            )}
          </TouchableOpacity>
        ) : null}

        {cargando && mensajes.length === 0 ? (
          <ActivityIndicator style={{ marginTop: SPACE.xl }} color={COLORS.primary} />
        ) : (
          <FlatList
            ref={listRef}
            style={s.flatList}
            data={mensajes}
            keyExtractor={(m) => m.id}
            contentContainerStyle={s.list}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={<Text style={s.vacio}>{emptyHint}</Text>}
            renderItem={({ item }) => {
              const mine = item.autor_id === perfil.id;
              return (
                <View style={[s.burbujaWrap, mine ? s.burbujaWrapMine : s.burbujaWrapOtro]}>
                  <View style={[s.burbuja, mine ? s.burbujaMine : s.burbujaOtro]}>
                    {item.tipo === 'imagen' && item.media_url ? <Image source={{ uri: item.media_url }} style={s.chatImage} resizeMode="cover" /> : null}
                    {item.contenido ? <Text style={[s.burbujaTxt, mine ? s.burbujaTxtMine : undefined]}>{item.contenido}</Text> : null}
                    <Text style={[s.hora, mine && s.horaMine]}>
                      {item.creado_en ? new Date(item.creado_en).toLocaleString('es-VE', { hour: '2-digit', minute: '2-digit' }) : ''}
                    </Text>
                  </View>
                </View>
              );
            }}
          />
        )}

        <View style={[s.inputRow, { paddingBottom: SPACE.sm + Math.max(insets.bottom, 0) }]}>
          <TouchableOpacity style={s.mediaBtn} onPress={enviarImagen} disabled={subiendoImagen || enviando}>
            <Text style={s.mediaBtnTxt}>{subiendoImagen ? '...' : 'Foto'}</Text>
          </TouchableOpacity>
          <TextInput
            style={s.input}
            value={texto}
            onChangeText={setTexto}
            placeholder="Escribe un mensaje…"
            placeholderTextColor={COLORS.textDisabled}
            multiline
            maxLength={2000}
          />
          <TouchableOpacity style={s.enviar} onPress={() => void enviar()} disabled={enviando || !texto.trim()}>
            {enviando ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={s.enviarTxt}>Enviar</Text>}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACE.sm,
    paddingTop: Platform.OS === 'ios' ? 52 : SPACE.md,
    paddingBottom: SPACE.sm,
    backgroundColor: COLORS.primary,
    ...SHADOW.sm,
  },
  cerrar: { color: '#FFF', fontSize: FONT.sizes.md, fontWeight: FONT.weights.semibold, minWidth: 72 },
  topTitWrap: { flex: 1, marginLeft: SPACE.xs },
  titulo: { color: '#FFF', fontSize: FONT.sizes.lg, fontWeight: FONT.weights.bold },
  subtitulo: { color: '#E8F5E9', fontSize: FONT.sizes.xs, marginTop: 2 },
  noticeCard: {
    margin: SPACE.md,
    marginBottom: SPACE.sm,
    backgroundColor: '#fff7ed',
    borderRadius: 18,
    padding: SPACE.md,
    borderWidth: 1,
    borderColor: '#fdba74',
  },
  noticeTitle: { color: '#9a3412', fontWeight: FONT.weights.bold, fontSize: FONT.sizes.sm },
  noticeText: { marginTop: 6, color: '#7c2d12', fontSize: FONT.sizes.xs, lineHeight: 18 },
  noticeBtn: {
    marginTop: SPACE.sm,
    alignSelf: 'flex-start',
    backgroundColor: '#fff',
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACE.md,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#fdba74',
  },
  noticeBtnTxt: { color: '#9a3412', fontWeight: FONT.weights.bold, fontSize: FONT.sizes.sm },
  flatList: { flex: 1 },
  list: { padding: SPACE.md, paddingBottom: SPACE.sm },
  vacio: { textAlign: 'center', color: COLORS.textDisabled, marginTop: SPACE.xl, paddingHorizontal: SPACE.lg },
  burbujaWrap: { marginBottom: SPACE.sm, maxWidth: '88%' },
  burbujaWrapMine: { alignSelf: 'flex-end' },
  burbujaWrapOtro: { alignSelf: 'flex-start' },
  burbuja: { borderRadius: RADIUS.md, padding: SPACE.sm, ...SHADOW.sm },
  burbujaMine: { backgroundColor: COLORS.primary },
  burbujaOtro: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  chatImage: { width: 220, height: 180, borderRadius: 14, marginBottom: 8, backgroundColor: '#dbeafe' },
  burbujaTxt: { fontSize: FONT.sizes.md, color: COLORS.text },
  burbujaTxtMine: { color: '#FFF' },
  hora: { fontSize: FONT.sizes.xs, color: COLORS.textDisabled, marginTop: 4, alignSelf: 'flex-end' },
  horaMine: { color: 'rgba(255,255,255,0.85)' },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: SPACE.sm,
    borderTopWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    gap: SPACE.sm,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACE.sm,
    paddingVertical: 10,
    fontSize: FONT.sizes.md,
    color: COLORS.text,
    backgroundColor: COLORS.background,
  },
  mediaBtn: {
    minHeight: 44,
    paddingHorizontal: SPACE.sm,
    borderRadius: RADIUS.md,
    backgroundColor: '#eef2ff',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 56,
  },
  mediaBtnTxt: { color: COLORS.primary, fontWeight: FONT.weights.bold, fontSize: FONT.sizes.sm },
  enviar: {
    backgroundColor: COLORS.success,
    paddingHorizontal: SPACE.md,
    paddingVertical: 12,
    borderRadius: RADIUS.md,
    minWidth: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  enviarTxt: { color: '#FFF', fontWeight: FONT.weights.bold, fontSize: FONT.sizes.sm },
  tratoCerradoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0fdf4',
    borderRadius: 16,
    marginHorizontal: SPACE.md,
    marginBottom: SPACE.sm,
    padding: SPACE.md,
    borderWidth: 1,
    borderColor: '#86efac',
    gap: 10,
  },
  tratoCerradoIcon: { fontSize: 22 },
  tratoCerradoBody: { flex: 1 },
  tratoCerradoTit: { fontSize: FONT.sizes.sm, fontWeight: FONT.weights.bold, color: '#15803d' },
  tratoCerradoSub: { fontSize: FONT.sizes.xs, color: '#166534', marginTop: 2 },
  confirmarBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#16a34a',
    borderRadius: 16,
    marginHorizontal: SPACE.md,
    marginBottom: SPACE.sm,
    paddingVertical: 14,
    gap: 8,
    ...SHADOW.sm,
  },
  confirmarBtnIcon: { fontSize: 18 },
  confirmarBtnTxt: { color: '#FFF', fontWeight: FONT.weights.bold, fontSize: FONT.sizes.md },
});
