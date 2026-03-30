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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import type { Perfil, SalaChat, Mensaje } from '@/shared/types';
import { chatService, mensajeConTexto } from '@/shared/services/chatService';
import { useChatUnread } from '@/shared/store/ChatUnreadContext';
import { reportChatIncident } from '@/shared/services/chatGovernanceService';
import { moderateOutgoingChatText, explainChatSafetyPolicy } from '@/shared/services/chatModerationService';
import { storageService } from '@/shared/services/storageService';
import { supabase } from '@/shared/lib/supabase';
import { BuyerRatingModal } from '@/shared/components/BuyerRatingModal';
import { COLORS, FONT, SPACE, RADIUS, SHADOW } from '@/shared/utils/theme';

type MensajeConTexto = Mensaje & { texto: string };

interface Props {
  visible: boolean;
  onClose: () => void;
  sala: SalaChat | null;
  perfil: Perfil | null;
}

function subtituloSala(sala: SalaChat, miPerfilId: string): string {
  const rubro = sala.cosecha?.rubro ?? 'Negociación';
  const soyComprador = sala.comprador_id === miPerfilId;
  const peer = soyComprador ? sala.agricultor?.nombre : sala.comprador?.nombre;
  return peer ? `${peer} · ${rubro}` : rubro;
}

export function CosechaChatModal({ visible, onClose, sala, perfil }: Props) {
  const insets = useSafeAreaInsets();
  const { refreshMercadoUnread } = useChatUnread();
  const [mensajes, setMensajes] = useState<MensajeConTexto[]>([]);
  const [cargando, setCargando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [texto, setTexto] = useState('');
  const listRef = useRef<FlatList<MensajeConTexto>>(null);
  const [precioTxt, setPrecioTxt] = useState('');
  const [cerrandoTrato, setCerrandoTrato] = useState(false);
  const [tratoCerrado, setTratoCerrado] = useState(false);
  const [precioAcordado, setPrecioAcordado] = useState<number | null>(null);
  const [ratingOpen, setRatingOpen] = useState(false);
  const [subiendoImagen, setSubiendoImagen] = useState(false);

  const salaId = sala?.id ?? null;
  const soyComprador = sala?.comprador_id === perfil?.id;
  const buyerName = sala?.comprador?.nombre ?? 'Comprador';

  const cargar = useCallback(async () => {
    if (!salaId) return;
    setCargando(true);
    try {
      const rows = await chatService.obtenerMensajes(salaId);
      setMensajes(rows);
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'No se pudieron cargar los mensajes.');
    } finally {
      setCargando(false);
    }
  }, [salaId]);

  useEffect(() => {
    if (!visible || !salaId || !perfil) return undefined;
    setMensajes([]);
    setTratoCerrado(Boolean(sala?.trato_cerrado));
    setPrecioAcordado(sala?.precio_acordado ?? null);
    let cancelled = false;
    (async () => {
      if (!cancelled) await cargar();
      if (!cancelled && salaId && perfil) {
        try {
          await chatService.marcarLeidos(salaId, perfil.id);
          await refreshMercadoUnread();
        } catch {
          /* ignore */
        }
      }
    })();

    const channel = chatService.suscribir(salaId, (nuevo) => {
      if (cancelled) return;
      const row = mensajeConTexto(nuevo as Mensaje);
      setMensajes((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row]));
    });

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  // Solo recrear la suscripción cuando cambia la sala o la visibilidad — no por cambios de precio/trato
  }, [visible, salaId, perfil, cargar, refreshMercadoUnread]);

  useEffect(() => {
    if (!visible) return;
    setPrecioTxt('');
  }, [visible, salaId]);

  // Auto-scroll al último mensaje cada vez que llega uno nuevo
  useEffect(() => {
    if (mensajes.length === 0) return undefined;
    const t = setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 60);
    return () => clearTimeout(t);
  }, [mensajes.length]);

  async function enviar() {
    if (!salaId || !perfil || !texto.trim()) return;
    const moderation = moderateOutgoingChatText(texto);
    if (moderation) {
      await reportChatIncident({
        source: 'market',
        salaId,
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

    // Optimistic update: el mensaje aparece de inmediato en la burbuja
    const tempId = `temp-${Date.now()}`;
    const tempMsg: MensajeConTexto = {
      id: tempId,
      sala_id: salaId,
      autor_id: perfil.id,
      contenido: trimmed,
      nonce: '__plain__',
      tipo: 'texto',
      media_url: null,
      leido: false,
      creado_en: new Date().toISOString(),
      texto: trimmed,
    };
    setMensajes((prev) => [...prev, tempMsg]);
    setTexto('');
    setEnviando(true);

    try {
      const msgId = await chatService.enviarMensaje(salaId, perfil.id, trimmed);
      if (msgId) {
        setMensajes((prev) => {
          // Si realtime ya trajo el mensaje real, elimina el temporal
          if (prev.some((m) => m.id === msgId)) return prev.filter((m) => m.id !== tempId);
          // Si no, reemplaza el temporal con el ID real
          return prev.map((m) => (m.id === tempId ? { ...m, id: msgId } : m));
        });
      } else {
        setMensajes((prev) => prev.filter((m) => m.id !== tempId));
      }
    } catch (e: unknown) {
      // Revierte el optimistic update y devuelve el texto al input
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
    if (!perfil || !salaId) return;
    setSubiendoImagen(true);
    try {
      const url = await storageService.subirChatImagen(perfil.id, 'market', salaId, uri);
      const caption = texto.trim();
      const msgId = await chatService.enviarImagen(salaId, url, caption);
      setTexto('');
      if (msgId) {
        const now = new Date().toISOString();
        setMensajes((prev) => {
          if (prev.some((m) => m.id === msgId)) return prev;
          const base: Mensaje = {
            id: msgId,
            sala_id: salaId,
            autor_id: perfil.id,
            contenido: caption,
            nonce: '__plain__',
            tipo: 'imagen',
            media_url: url,
            leido: false,
            creado_en: now,
          };
          return [...prev, mensajeConTexto(base)];
        });
      }
    } catch (e: unknown) {
      Alert.alert('Imagen', e instanceof Error ? e.message : 'No se pudo enviar la imagen.');
    } finally {
      setSubiendoImagen(false);
    }
  }

  function enviarImagen() {
    if (!salaId || !perfil) return;
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
    if (!perfil || !salaId) return;
    const offenderId = sala?.comprador_id === perfil.id ? sala?.agricultor_id : sala?.comprador_id;
    Alert.alert('Reportar conversación', 'Selecciona el motivo del reporte.', [
      {
        text: 'Estafa',
        onPress: () =>
          void reportChatIncident({
            source: 'market',
            salaId,
            reportedBy: perfil.id,
            offenderId,
            category: 'fraud_attempt',
            severity: 'critica',
            reason: 'Reporte manual por posible estafa o presión de pago.',
            messageExcerpt: texto.trim() || null,
          }).then(() => Alert.alert('Reporte enviado', 'Tu reporte fue enviado al panel del CEO.')),
      },
      {
        text: 'Lenguaje ofensivo',
        onPress: () =>
          void reportChatIncident({
            source: 'market',
            salaId,
            reportedBy: perfil.id,
            offenderId,
            category: 'manual_report',
            severity: 'alta',
            reason: 'Reporte manual por lenguaje ofensivo o trato indebido.',
            messageExcerpt: texto.trim() || null,
          }).then(() => Alert.alert('Reporte enviado', 'Tu reporte fue enviado al panel del CEO.')),
      },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  }

  async function cerrarTrato() {
    if (!salaId) return;
    const precio = Number.parseFloat(precioTxt.replace(',', '.'));
    if (!Number.isFinite(precio) || precio <= 0) {
      Alert.alert('Precio', 'Indica un precio acordado válido para cerrar el trato.');
      return;
    }
    setCerrandoTrato(true);
    try {
      const sugeridos = await chatService.cerrarTrato(salaId, precio);
      setTratoCerrado(true);
      setPrecioAcordado(precio);
      setPrecioTxt('');
      Alert.alert(
        'Trato cerrado',
        sugeridos.length > 0
          ? `Se cerró la negociación. Hay ${sugeridos.length} transportista(s) cercanos sugeridos para mover la carga.`
          : 'Se cerró la negociación. Ya puedes coordinar el transporte desde el panel correspondiente.',
      );
    } catch (e: unknown) {
      Alert.alert('Cierre de trato', e instanceof Error ? e.message : 'No se pudo cerrar el trato.');
    } finally {
      setCerrandoTrato(false);
    }
  }

  if (!perfil) return null;
  const open = visible && !!sala;

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
              Negociación
            </Text>
            {sala ? (
              <Text style={s.subtitulo} numberOfLines={2}>
                {subtituloSala(sala, perfil.id)}
              </Text>
            ) : null}
          </View>
        </View>

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
            ListHeaderComponent={
              sala ? (
                <>
                  <View style={s.dealCard}>
                    <Text style={s.dealTitle}>{tratoCerrado ? 'Trato cerrado' : 'Cierre comercial'}</Text>
                    {tratoCerrado ? (
                      <>
                        <Text style={s.dealText}>Precio acordado: {precioAcordado != null ? `USD ${precioAcordado.toFixed(2)}` : 'Acordado en chat'}</Text>
                        {soyComprador ? (
                          <Text style={s.dealHint}>Ahora puedes solicitar transporte para mover tu compra desde el panel comprador.</Text>
                        ) : (
                          <TouchableOpacity style={s.rateBtn} onPress={() => setRatingOpen(true)} activeOpacity={0.88}>
                            <Text style={s.rateBtnTxt}>Calificar comprador</Text>
                          </TouchableOpacity>
                        )}
                      </>
                    ) : (
                      <>
                        <Text style={s.dealText}>Cuando lleguen a un acuerdo, ingresen el precio y cierren el trato. La cosecha quedará marcada como <Text style={{ fontWeight: 'bold', color: '#15803d' }}>VENDIDA</Text> y desaparecerá del mercado.</Text>
                        <View style={s.dealActions}>
                          <TextInput
                            style={s.dealInput}
                            value={precioTxt}
                            onChangeText={setPrecioTxt}
                            placeholder="Precio acordado USD"
                            placeholderTextColor={COLORS.textDisabled}
                            keyboardType="decimal-pad"
                          />
                          <TouchableOpacity style={s.dealBtn} onPress={() => void cerrarTrato()} disabled={cerrandoTrato} activeOpacity={0.88}>
                            {cerrandoTrato ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.dealBtnTxt}>Cerrar trato</Text>}
                          </TouchableOpacity>
                        </View>
                      </>
                    )}
                  </View>
                  <View style={s.noticeCard}>
                    <Text style={s.noticeTitle}>Seguridad del chat</Text>
                    <Text style={s.noticeText}>{explainChatSafetyPolicy()}</Text>
                    <TouchableOpacity style={s.noticeBtn} onPress={reportarChat} activeOpacity={0.88}>
                      <Text style={s.noticeBtnTxt}>Reportar incidente</Text>
                    </TouchableOpacity>
                  </View>
                </>
              ) : null
            }
            ListEmptyComponent={
              <Text style={s.vacio}>Sin mensajes aún. Escribe para iniciar la negociación.</Text>
            }
            renderItem={({ item }) => {
              const mine = item.autor_id === perfil.id;
              return (
                <View style={[s.burbujaWrap, mine ? s.burbujaWrapMine : s.burbujaWrapOtro]}>
                  <View style={[s.burbuja, mine ? s.burbujaMine : s.burbujaOtro]}>
                    {item.tipo === 'imagen' && item.media_url ? <Image source={{ uri: item.media_url }} style={s.chatImage} resizeMode="cover" /> : null}
                    {item.texto ? <Text style={[s.burbujaTxt, mine ? s.burbujaTxtMine : undefined]}>{item.texto}</Text> : null}
                    <Text style={[s.hora, mine && s.horaMine]}>
                      {item.creado_en
                        ? new Date(item.creado_en).toLocaleString('es-VE', { hour: '2-digit', minute: '2-digit' })
                        : ''}
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
          <TouchableOpacity style={s.enviar} onPress={enviar} disabled={enviando || !texto.trim()}>
            {enviando ? <ActivityIndicator color="#FFF" size="small" /> : <Text style={s.enviarTxt}>Enviar</Text>}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
      <BuyerRatingModal
        visible={ratingOpen}
        onClose={() => setRatingOpen(false)}
        salaId={salaId}
        buyerName={buyerName}
      />
    </Modal>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACE.sm,
    paddingBottom: SPACE.sm,
    backgroundColor: COLORS.primary,
    ...SHADOW.sm,
  },
  flatList: { flex: 1 },
  cerrar: { color: '#FFF', fontSize: FONT.sizes.md, fontWeight: FONT.weights.semibold, minWidth: 72 },
  topTitWrap: { flex: 1, marginLeft: SPACE.xs },
  titulo: { color: '#FFF', fontSize: FONT.sizes.lg, fontWeight: FONT.weights.bold },
  subtitulo: { color: '#E8F5E9', fontSize: FONT.sizes.xs, marginTop: 2 },
  dealCard: {
    margin: SPACE.md,
    marginBottom: SPACE.sm,
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: SPACE.md,
    borderWidth: 1,
    borderColor: '#dbeafe',
    ...SHADOW.sm,
  },
  noticeCard: {
    marginHorizontal: SPACE.md,
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
  dealTitle: { fontSize: FONT.sizes.md, fontWeight: FONT.weights.bold, color: COLORS.text },
  dealText: { marginTop: 6, fontSize: FONT.sizes.sm, color: COLORS.textSecondary, lineHeight: 20 },
  dealHint: { marginTop: 8, fontSize: FONT.sizes.xs, color: COLORS.primary, fontWeight: FONT.weights.bold, lineHeight: 18 },
  dealActions: { flexDirection: 'row', gap: SPACE.sm, marginTop: SPACE.md, alignItems: 'center' },
  dealInput: {
    flex: 1,
    minHeight: 42,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACE.sm,
    backgroundColor: COLORS.background,
    color: COLORS.text,
  },
  dealBtn: {
    minHeight: 42,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACE.md,
  },
  dealBtnTxt: { color: '#fff', fontWeight: FONT.weights.bold, fontSize: FONT.sizes.sm },
  rateBtn: {
    marginTop: SPACE.sm,
    minHeight: 42,
    borderRadius: RADIUS.md,
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rateBtnTxt: { color: COLORS.primary, fontWeight: FONT.weights.bold, fontSize: FONT.sizes.sm },
  list: { padding: SPACE.md, paddingBottom: SPACE.sm },
  vacio: { textAlign: 'center', color: COLORS.textDisabled, marginTop: SPACE.xl, paddingHorizontal: SPACE.lg },
  burbujaWrap: { marginBottom: SPACE.sm, maxWidth: '88%' },
  burbujaWrapMine: { alignSelf: 'flex-end' },
  burbujaWrapOtro: { alignSelf: 'flex-start' },
  burbuja: { borderRadius: RADIUS.md, padding: SPACE.sm, ...SHADOW.sm },
  burbujaOtro: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  burbujaMine: { backgroundColor: COLORS.primary },
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
});
