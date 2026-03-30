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
import { Ionicons } from '@expo/vector-icons';
import type { Perfil, MensajeInsumosChat } from '@/shared/types';
import { supabase } from '@/shared/lib/supabase';
import {
  listarMensajesInsumo,
  enviarMensajeInsumo,
  enviarImagenInsumo,
  obtenerMetadatasSalaInsumo,
  confirmarVentaInsumo,
  vendedorProponerCierreInsumo,
} from '@/shared/services/insumoChatService';
import { storageService } from '@/shared/services/storageService';
import { moderateOutgoingChatText, explainChatSafetyPolicy } from '@/shared/services/chatModerationService';
import { reportChatIncident } from '@/shared/services/chatGovernanceService';
import { trackUiEvent } from '@/shared/runtime/uiEventTracker';
import { COLORS, FONT, SPACE, RADIUS, SHADOW } from '@/shared/utils/theme';

const PURPLE = '#7B1FA2';
const PURPLE_LIGHT = '#F3E5F5';

interface Props {
  visible: boolean;
  onClose: () => void;
  salaId: string | null;
  perfil: Perfil | null;
  /** Callback cuando el vendedor confirma la venta */
  onVentaConfirmada?: () => void;
}

export function InsumoChatModal({ visible, onClose, salaId, perfil, onVentaConfirmada }: Props) {
  const insets = useSafeAreaInsets();
  const [mensajes, setMensajes] = useState<MensajeInsumosChat[]>([]);
  const [cargando, setCargando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [texto, setTexto] = useState('');
  const [subiendoImagen, setSubiendoImagen] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [metaSala, setMetaSala] = useState<{
    buyer_id: string;
    vendedor_id: string;
    venta_confirmada: boolean;
    vendedor_propuso: boolean;
    nombre_producto: string | null;
  } | null>(null);
  const listRef = useRef<FlatList<MensajeInsumosChat>>(null);

  const sid = salaId;
  const open = visible && !!sid;

  const cargar = useCallback(async () => {
    if (!sid) return;
    setCargando(true);
    try {
      const [msgs, meta] = await Promise.all([
        listarMensajesInsumo(sid),
        obtenerMetadatasSalaInsumo(sid),
      ]);
      setMensajes(msgs);
      if (meta) setMetaSala(meta);
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'No se pudieron cargar los mensajes.');
    } finally {
      setCargando(false);
    }
  }, [sid]);

  useEffect(() => {
    if (!visible || !sid || !perfil) return undefined;
    setMensajes([]);
    setMetaSala(null);
    let cancelled = false;
    void (async () => {
      if (!cancelled) await cargar();
    })();

    const channel = supabase
      .channel(`insumo-chat-${sid}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'mensajes_insumos_chat', filter: `sala_id=eq.${sid}` },
        (payload) => {
          if (cancelled) return;
          const row = payload.new as MensajeInsumosChat;
          setMensajes((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row]));
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [visible, sid, perfil, cargar]);

  useEffect(() => {
    if (!open || !sid) return;
    trackUiEvent({
      eventType: 'open_modal',
      eventName: 'insumo_chat_opened',
      screen: 'InsumoChatModal',
      module: 'agrotienda',
      targetType: 'sala_insumo',
      targetId: sid,
      status: 'success',
    });
  }, [open, sid]);

  useEffect(() => {
    if (mensajes.length === 0) return undefined;
    const t = setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 60);
    return () => clearTimeout(t);
  }, [mensajes.length]);

  async function enviar() {
    if (!sid || !perfil || !texto.trim()) return;
    const moderation = moderateOutgoingChatText(texto);
    if (moderation) {
      await reportChatIncident({
        source: 'market',
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
    const tempId = `temp-${Date.now()}`;
    const tempMsg: MensajeInsumosChat = {
      id: tempId, sala_id: sid, autor_id: perfil.id,
      contenido: trimmed, tipo: 'texto', media_url: null,
      creado_en: new Date().toISOString(),
    };
    setMensajes((prev) => [...prev, tempMsg]);
    setTexto('');
    setEnviando(true);
    try {
      const msgId = await enviarMensajeInsumo(sid, perfil.id, trimmed);
      trackUiEvent({
        eventType: 'submit',
        eventName: 'insumo_message_sent',
        screen: 'InsumoChatModal',
        module: 'agrotienda',
        targetType: 'sala_insumo',
        targetId: sid,
        status: 'success',
      });
      if (msgId) {
        setMensajes((prev) =>
          prev.some((m) => m.id === msgId)
            ? prev.filter((m) => m.id !== tempId)
            : prev.map((m) => (m.id === tempId ? { ...m, id: msgId } : m)),
        );
      } else {
        setMensajes((prev) => prev.filter((m) => m.id !== tempId));
      }
    } catch (e: unknown) {
      setMensajes((prev) => prev.filter((m) => m.id !== tempId));
      setTexto(trimmed);
      Alert.alert('Error', e instanceof Error ? e.message : 'No se pudo enviar.');
    } finally {
      setEnviando(false);
    }
  }

  async function subirImagenDesdeUri(uri: string) {
    if (!perfil || !sid) return;
    setSubiendoImagen(true);
    try {
      const url = await storageService.subirChatImagen(perfil.id, 'logistics', sid, uri);
      await enviarImagenInsumo(sid, perfil.id, url, texto.trim() || undefined);
      setTexto('');
      trackUiEvent({
        eventType: 'submit',
        eventName: 'insumo_image_sent',
        screen: 'InsumoChatModal',
        module: 'agrotienda',
        targetType: 'sala_insumo',
        targetId: sid,
        status: 'success',
      });
    } catch (e: unknown) {
      Alert.alert('Imagen', e instanceof Error ? e.message : 'No se pudo enviar la imagen.');
    } finally {
      setSubiendoImagen(false);
    }
  }

  function abrirGaleria() {
    if (!sid || !perfil) return;
    Alert.alert('Enviar imagen', 'Selecciona cómo adjuntar la foto.', [
      {
        text: 'Cámara',
        onPress: () => void (async () => {
          const perm = await ImagePicker.requestCameraPermissionsAsync();
          if (perm.status !== 'granted') { Alert.alert('Permiso requerido', 'Necesitas acceso a la cámara.'); return; }
          const picked = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8, allowsEditing: true });
          if (picked.canceled || !picked.assets?.[0]?.uri) return;
          await subirImagenDesdeUri(picked.assets[0].uri);
        })(),
      },
      {
        text: 'Galería',
        onPress: () => void (async () => {
          const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (perm.status !== 'granted') { Alert.alert('Permiso requerido', 'Necesitas acceso a tus fotos.'); return; }
          const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8, allowsEditing: true });
          if (picked.canceled || !picked.assets?.[0]?.uri) return;
          await subirImagenDesdeUri(picked.assets[0].uri);
        })(),
      },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  }

  async function proponerCierre() {
    if (!sid || !perfil) return;
    Alert.alert(
      'Proponer cierre de trato',
      `¿Proponer cerrar la venta de "${metaSala?.nombre_producto ?? 'este producto'}"?\nEl comprador deberá aceptar para que se descuente el stock.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Proponer cierre',
          onPress: async () => {
            setConfirmando(true);
            try {
              await vendedorProponerCierreInsumo(sid);
              setMetaSala((prev) => prev ? { ...prev, vendedor_propuso: true } : prev);
              trackUiEvent({
                eventType: 'submit',
                eventName: 'insumo_close_proposed',
                screen: 'InsumoChatModal',
                module: 'agrotienda',
                targetType: 'sala_insumo',
                targetId: sid,
                status: 'success',
              });
              Alert.alert('Propuesta enviada', 'El comprador recibirá una notificación para aceptar el trato.');
            } catch (e: unknown) {
              Alert.alert('Error', e instanceof Error ? e.message : 'No se pudo proponer el cierre.');
            } finally {
              setConfirmando(false);
            }
          },
        },
      ],
    );
  }

  async function confirmarCompra() {
    if (!sid || !perfil) return;
    Alert.alert(
      'Confirmar la compra',
      `¿Confirmar que aceptas la venta de "${metaSala?.nombre_producto ?? 'este producto'}"?\nSe descontará 1 unidad del inventario del vendedor.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Sí, aceptar el trato',
          onPress: async () => {
            setConfirmando(true);
            try {
              await confirmarVentaInsumo(sid);
              setMetaSala((prev) => prev ? { ...prev, venta_confirmada: true } : prev);
              trackUiEvent({
                eventType: 'submit',
                eventName: 'insumo_sale_confirmed',
                screen: 'InsumoChatModal',
                module: 'agrotienda',
                targetType: 'sala_insumo',
                targetId: sid,
                status: 'success',
              });
              Alert.alert('¡Trato cerrado!', 'La compra fue confirmada y el stock del vendedor fue actualizado.');
              onVentaConfirmada?.();
            } catch (e: unknown) {
              Alert.alert('Error', e instanceof Error ? e.message : 'No se pudo confirmar la compra.');
            } finally {
              setConfirmando(false);
            }
          },
        },
      ],
    );
  }

  if (!perfil) return null;
  const esVendedor = perfil.id === metaSala?.vendedor_id;
  const chatClosed = metaSala?.venta_confirmada === true;

  return (
    <Modal visible={open} animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={s.root}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        {/* Header */}
        <View style={[s.topBar, { paddingTop: Math.max(insets.top, Platform.OS === 'ios' ? 16 : SPACE.md) }]}>
          <TouchableOpacity onPress={onClose} hitSlop={12}>
            <Text style={s.cerrar}>‹ Volver</Text>
          </TouchableOpacity>
          <View style={s.topTitWrap}>
            <Text style={s.titulo} numberOfLines={1}>
              {metaSala?.nombre_producto ?? 'Consulta de producto'}
            </Text>
            <Text style={s.subtitulo}>
              {esVendedor ? 'Consulta de comprador' : 'Chat con agrotienda'}
            </Text>
          </View>
          <View style={s.headerIcon}>
            <Ionicons name="storefront-outline" size={20} color="#FFF" />
          </View>
        </View>

        {/* Aviso seguridad chat */}
        <View style={s.noticeCard}>
          <Text style={s.noticeTitle}>Negociación interna</Text>
          <Text style={s.noticeText}>{explainChatSafetyPolicy()}</Text>
        </View>

        {/* Banner trato cerrado */}
        {metaSala?.venta_confirmada ? (
          <View style={s.ventaBanner}>
            <Ionicons name="checkmark-circle" size={22} color="#16a34a" />
            <View style={s.ventaBannerBody}>
              <Text style={s.ventaBannerTit}>Trato cerrado</Text>
              <Text style={s.ventaBannerSub}>Ambas partes confirmaron el acuerdo. El stock fue actualizado y este chat queda solo para consulta.</Text>
            </View>
          </View>
        ) : metaSala?.vendedor_propuso && !esVendedor ? (
          /* Comprador: vendedor propuso cierre → mostrar botón de aceptar */
          <TouchableOpacity
            style={[s.confirmarBtn, { backgroundColor: '#16a34a' }]}
            onPress={() => void confirmarCompra()}
            disabled={confirmando}
            activeOpacity={0.88}
          >
            {confirmando ? (
              <ActivityIndicator color="#FFF" size="small" />
            ) : (
              <>
                <Ionicons name="checkmark-done-outline" size={18} color="#FFF" />
                <Text style={s.confirmarBtnTxt}>El vendedor propone cerrar el trato – Aceptar</Text>
              </>
            )}
          </TouchableOpacity>
        ) : metaSala?.vendedor_propuso && esVendedor ? (
          /* Vendedor: esperando confirmación del comprador */
          <View style={[s.ventaBanner, { backgroundColor: '#fefce8', borderColor: '#fde047' }]}>
            <Ionicons name="time-outline" size={22} color="#ca8a04" />
            <View style={s.ventaBannerBody}>
              <Text style={[s.ventaBannerTit, { color: '#92400e' }]}>Propuesta enviada</Text>
              <Text style={[s.ventaBannerSub, { color: '#92400e' }]}>Esperando que el comprador acepte el trato.</Text>
            </View>
          </View>
        ) : esVendedor ? (
          /* Vendedor: aún no ha propuesto → botón proponer cierre */
          <TouchableOpacity
            style={s.confirmarBtn}
            onPress={() => void proponerCierre()}
            disabled={confirmando}
            activeOpacity={0.88}
          >
            {confirmando ? (
              <ActivityIndicator color="#FFF" size="small" />
            ) : (
              <>
                <Ionicons name="checkmark-circle-outline" size={18} color="#FFF" />
                <Text style={s.confirmarBtnTxt}>Proponer cierre de trato</Text>
              </>
            )}
          </TouchableOpacity>
        ) : null}

        {/* Lista mensajes */}
        {cargando && mensajes.length === 0 ? (
          <ActivityIndicator style={{ marginTop: SPACE.xl }} color={PURPLE} />
        ) : (
          <FlatList
            ref={listRef}
            style={s.flatList}
            data={mensajes}
            keyExtractor={(m) => m.id}
            contentContainerStyle={s.list}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              <Text style={s.vacio}>Aún no hay mensajes. Inicia la consulta sobre el producto.</Text>
            }
            renderItem={({ item }) => {
              const mine = item.autor_id === perfil.id;
              return (
                <View style={[s.burbujaWrap, mine ? s.burbujaWrapMine : s.burbujaWrapOtro]}>
                  <View style={[s.burbuja, mine ? s.burbujaMine : s.burbujaOtro]}>
                    {item.tipo === 'imagen' && item.media_url ? (
                      <Image source={{ uri: item.media_url }} style={s.chatImage} resizeMode="cover" />
                    ) : null}
                    {item.contenido ? (
                      <Text style={[s.burbujaTxt, mine && s.burbujaTxtMine]}>{item.contenido}</Text>
                    ) : null}
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

        {/* Input */}
        <View style={[s.inputRow, { paddingBottom: SPACE.sm + Math.max(insets.bottom, 0) }]}>
          <TouchableOpacity style={[s.mediaBtn, chatClosed && s.disabledBtn]} onPress={abrirGaleria} disabled={chatClosed || subiendoImagen || enviando}>
            <Text style={s.mediaBtnTxt}>{subiendoImagen ? '...' : 'Foto'}</Text>
          </TouchableOpacity>
          <TextInput
            style={[s.input, chatClosed && s.inputDisabled]}
            value={texto}
            onChangeText={setTexto}
            placeholder={chatClosed ? 'Trato cerrado: chat en modo lectura' : 'Escribe un mensaje…'}
            placeholderTextColor={COLORS.textDisabled}
            multiline
            maxLength={2000}
            editable={!chatClosed}
          />
          <TouchableOpacity
            style={[s.enviarBtn, chatClosed && s.disabledBtn]}
            onPress={() => void enviar()}
            disabled={chatClosed || enviando || !texto.trim()}
          >
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
    paddingBottom: SPACE.sm,
    backgroundColor: PURPLE,
    ...SHADOW.sm,
  },
  cerrar: { color: '#FFF', fontSize: FONT.sizes.md, fontWeight: FONT.weights.semibold, minWidth: 72 },
  topTitWrap: { flex: 1, marginLeft: SPACE.xs },
  titulo: { color: '#FFF', fontSize: FONT.sizes.lg, fontWeight: FONT.weights.bold },
  subtitulo: { color: '#E1BEE7', fontSize: FONT.sizes.xs, marginTop: 2 },
  headerIcon: { padding: 8, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 12 },
  noticeCard: {
    margin: SPACE.md, marginBottom: SPACE.sm,
    backgroundColor: PURPLE_LIGHT,
    borderRadius: 18, padding: SPACE.md,
    borderWidth: 1, borderColor: '#CE93D8',
  },
  noticeTitle: { color: '#4A148C', fontWeight: FONT.weights.bold, fontSize: FONT.sizes.sm },
  noticeText: { marginTop: 6, color: '#6A1B9A', fontSize: FONT.sizes.xs, lineHeight: 18 },
  ventaBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#f0fdf4', borderRadius: 16,
    marginHorizontal: SPACE.md, marginBottom: SPACE.sm,
    padding: SPACE.md, borderWidth: 1, borderColor: '#86efac',
  },
  ventaBannerBody: { flex: 1 },
  ventaBannerTit: { fontSize: FONT.sizes.sm, fontWeight: FONT.weights.bold, color: '#15803d' },
  ventaBannerSub: { fontSize: FONT.sizes.xs, color: '#166534', marginTop: 2 },
  confirmarBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#16a34a', borderRadius: 16,
    marginHorizontal: SPACE.md, marginBottom: SPACE.sm,
    paddingVertical: 14, gap: 8, ...SHADOW.sm,
  },
  confirmarBtnTxt: { color: '#FFF', fontWeight: FONT.weights.bold, fontSize: FONT.sizes.md },
  flatList: { flex: 1 },
  list: { padding: SPACE.md, paddingBottom: SPACE.sm },
  vacio: { textAlign: 'center', color: COLORS.textDisabled, marginTop: SPACE.xl, paddingHorizontal: SPACE.lg },
  burbujaWrap: { marginBottom: SPACE.sm, maxWidth: '88%' },
  burbujaWrapMine: { alignSelf: 'flex-end' },
  burbujaWrapOtro: { alignSelf: 'flex-start' },
  burbuja: { borderRadius: RADIUS.md, padding: SPACE.sm, ...SHADOW.sm },
  burbujaMine: { backgroundColor: PURPLE },
  burbujaOtro: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  chatImage: { width: 220, height: 180, borderRadius: 14, marginBottom: 8 },
  burbujaTxt: { fontSize: FONT.sizes.md, color: COLORS.text },
  burbujaTxtMine: { color: '#FFF' },
  hora: { fontSize: FONT.sizes.xs, color: COLORS.textDisabled, marginTop: 4, alignSelf: 'flex-end' },
  horaMine: { color: 'rgba(255,255,255,0.8)' },
  inputRow: {
    flexDirection: 'row', alignItems: 'flex-end',
    padding: SPACE.sm, borderTopWidth: 1,
    borderColor: COLORS.border, backgroundColor: COLORS.surface, gap: SPACE.sm,
  },
  input: {
    flex: 1, minHeight: 44, maxHeight: 120,
    borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md,
    paddingHorizontal: SPACE.sm, paddingVertical: 10,
    fontSize: FONT.sizes.md, color: COLORS.text, backgroundColor: COLORS.background,
  },
  inputDisabled: { opacity: 0.7, backgroundColor: '#F8FAFC' },
  mediaBtn: {
    minHeight: 44, paddingHorizontal: SPACE.sm, borderRadius: RADIUS.md,
    backgroundColor: PURPLE_LIGHT, alignItems: 'center', justifyContent: 'center', minWidth: 56,
  },
  disabledBtn: { opacity: 0.45 },
  mediaBtnTxt: { color: PURPLE, fontWeight: FONT.weights.bold, fontSize: FONT.sizes.sm },
  enviarBtn: {
    backgroundColor: PURPLE, paddingHorizontal: SPACE.md, paddingVertical: 12,
    borderRadius: RADIUS.md, minWidth: 80, alignItems: 'center', justifyContent: 'center',
  },
  enviarTxt: { color: '#FFF', fontWeight: FONT.weights.bold, fontSize: FONT.sizes.sm },
});
