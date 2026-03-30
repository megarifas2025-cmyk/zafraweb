import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { chatService, mensajeConTexto } from '@/shared/services/chatService';
import { supabase } from '@/shared/lib/supabase';
import { logWarn, serializeError } from '@/shared/runtime/appLogger';
import type { Mensaje, Perfil, SalaChat } from '@/shared/types';
import type { MachineryRentalRow } from '@/shared/services/machineryService';
import { marcarMaquinariaRentada } from '@/shared/services/machineryService';
import { COLORS, FONT, RADIUS, SHADOW, SPACE } from '@/shared/utils/theme';

type MensajeConTexto = Mensaje & { texto: string };

type Props = {
  visible: boolean;
  perfil: Perfil | null;
  listing: MachineryRentalRow | null;
  onClose: () => void;
};

export function MachineryNegotiationModal({ visible, perfil, listing, onClose }: Props) {
  const [sala, setSala] = useState<SalaChat | null>(null);
  const [mensajes, setMensajes] = useState<MensajeConTexto[]>([]);
  const [texto, setTexto] = useState('');
  const [cargando, setCargando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [servicioAcordado, setServicioAcordado] = useState(false);
  const [marcandoAcordado, setMarcandoAcordado] = useState(false);

  const salaId = sala?.id ?? null;
  const esOwner = perfil?.id != null && listing?.owner_id === perfil.id;

  const loadMensajes = useCallback(async () => {
    if (!salaId) return;
    setCargando(true);
    try {
      const rows = await chatService.obtenerMensajes(salaId);
      setMensajes(rows);
    } finally {
      setCargando(false);
    }
  }, [salaId]);

  useEffect(() => {
    if (!visible || !perfil || !listing) return undefined;
    let cancelled = false;
    setMensajes([]);
    setTexto('');
    setCargando(true);

    void (async () => {
      try {
        const salaCreada = await chatService.crearSala(perfil.id, listing.owner_id, undefined);
        if (cancelled) return;
        setSala(salaCreada);
        setServicioAcordado(false);
      } catch (error) {
        logWarn('machinery.chat.open', 'No se pudo abrir la negociación de maquinaria.', {
          actorId: perfil.id,
          ownerId: listing.owner_id,
          listingId: listing.id,
          error: serializeError(error),
        });
        if (!cancelled) setCargando(false);
      }
    })();

    return () => {
      cancelled = true;
      setSala(null);
    };
  }, [visible, perfil, listing]);

  useEffect(() => {
    if (!visible || !salaId) return undefined;
    let cancelled = false;

    void (async () => {
      await loadMensajes();
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
  }, [visible, salaId, loadMensajes]);

  async function acordarServicio() {
    if (!listing) return;
    Alert.alert(
      'Confirmar acuerdo',
      '¿Confirmas que se acordó el servicio? La maquinaria quedará marcada como RENTADA y dejará de aparecer en el listado público.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Sí, marcar como rentada',
          onPress: async () => {
            setMarcandoAcordado(true);
            try {
              await marcarMaquinariaRentada(listing.id);
              setServicioAcordado(true);
              Alert.alert('Servicio acordado', 'La maquinaria fue marcada como rentada y ya no aparece en el listado público.');
            } catch (e: unknown) {
              Alert.alert('Error', e instanceof Error ? e.message : 'No se pudo actualizar el estado.');
            } finally {
              setMarcandoAcordado(false);
            }
          },
        },
      ],
    );
  }

  async function enviar() {
    if (!perfil || !salaId || !texto.trim()) return;
    const trimmed = texto.trim();
    setEnviando(true);
    try {
      const msgId = await chatService.enviarMensaje(salaId, perfil.id, trimmed);
      setTexto('');
      if (msgId) {
        const now = new Date().toISOString();
        setMensajes((prev) => {
          if (prev.some((m) => m.id === msgId)) return prev;
          const row: MensajeConTexto = {
            id: msgId,
            sala_id: salaId,
            autor_id: perfil.id,
            contenido: trimmed,
            nonce: '__plain__',
            tipo: 'texto',
            media_url: null,
            leido: false,
            creado_en: now,
            texto: trimmed,
          };
          return [...prev, row];
        });
      }
    } catch {
      Alert.alert('Error', 'No se pudo enviar el mensaje. Verifica tu conexión.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal visible={visible && !!listing} animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={s.root}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        <View style={s.header}>
          <TouchableOpacity onPress={onClose} hitSlop={12}>
            <Text style={s.back}>‹ Volver</Text>
          </TouchableOpacity>
          <View style={s.headerText}>
            <Text style={s.title}>Negociación privada</Text>
            <Text style={s.subtitle} numberOfLines={2}>
              {listing ? `${listing.tipo_maquina} · ${listing.marca_modelo}` : 'Maquinaria'}
            </Text>
          </View>
        </View>

        <View style={s.noticeCard}>
          <Text style={s.noticeTitle}>Sin precio público</Text>
          <Text style={s.noticeBody}>
            Acuerden condiciones, disponibilidad, operador y pago directamente por este chat privado entre productores.
          </Text>
        </View>

        {esOwner ? (
          <View style={[s.dealCard, servicioAcordado && s.dealCardDone]}>
            <Text style={s.dealTitle}>{servicioAcordado ? '✅ Servicio acordado' : 'Confirmar acuerdo de servicio'}</Text>
            {servicioAcordado ? (
              <Text style={s.dealBody}>La maquinaria está marcada como rentada y dejó de aparecer en el listado público.</Text>
            ) : (
              <>
                <Text style={s.dealBody}>Una vez que acuerden el servicio con el solicitante, marca la maquinaria como rentada para que desaparezca del listado.</Text>
                <TouchableOpacity
                  style={s.dealBtn}
                  onPress={() => void acordarServicio()}
                  disabled={marcandoAcordado}
                  activeOpacity={0.88}
                >
                  {marcandoAcordado
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={s.dealBtnTxt}>Marcar maquinaria como rentada</Text>}
                </TouchableOpacity>
              </>
            )}
          </View>
        ) : null}

        {cargando && mensajes.length === 0 ? (
          <ActivityIndicator style={{ marginTop: SPACE.xl }} color={COLORS.primary} />
        ) : (
          <FlatList
            data={mensajes}
            keyExtractor={(item) => item.id}
            contentContainerStyle={s.list}
            ListEmptyComponent={
              <Text style={s.empty}>
                Sin mensajes aún. Usa este chat para coordinar el alquiler o apoyo entre productores.
              </Text>
            }
            renderItem={({ item }) => {
              const mine = item.autor_id === perfil?.id;
              return (
                <View style={[s.bubbleWrap, mine ? s.bubbleWrapMine : s.bubbleWrapOther]}>
                  <View style={[s.bubble, mine ? s.bubbleMine : s.bubbleOther]}>
                    <Text style={[s.bubbleTxt, mine && s.bubbleTxtMine]}>{item.texto}</Text>
                  </View>
                </View>
              );
            }}
          />
        )}

        <View style={s.inputRow}>
          <TextInput
            style={s.input}
            value={texto}
            onChangeText={setTexto}
            placeholder="Escribe para negociar de forma privada..."
            placeholderTextColor={COLORS.textDisabled}
            multiline
            maxLength={1200}
          />
          <TouchableOpacity style={s.sendBtn} onPress={() => void enviar()} disabled={enviando || !texto.trim()}>
            {enviando ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.sendTxt}>Enviar</Text>}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACE.md,
    paddingTop: Platform.OS === 'ios' ? 52 : SPACE.md,
    paddingBottom: SPACE.md,
    backgroundColor: COLORS.primary,
    ...SHADOW.sm,
  },
  back: { color: '#fff', fontSize: FONT.sizes.md, fontWeight: FONT.weights.semibold, minWidth: 72 },
  headerText: { flex: 1 },
  title: { color: '#fff', fontSize: FONT.sizes.lg, fontWeight: FONT.weights.bold },
  subtitle: { color: 'rgba(255,255,255,0.9)', marginTop: 4, fontSize: FONT.sizes.sm },
  noticeCard: {
    margin: SPACE.md,
    backgroundColor: '#fff',
    borderRadius: RADIUS.md,
    padding: SPACE.md,
    ...SHADOW.sm,
  },
  noticeTitle: { color: COLORS.primary, fontWeight: FONT.weights.bold, fontSize: FONT.sizes.sm },
  noticeBody: { marginTop: 6, color: COLORS.textSecondary, lineHeight: 20, fontSize: FONT.sizes.sm },
  list: { paddingHorizontal: SPACE.md, paddingBottom: SPACE.md, gap: SPACE.sm },
  empty: { color: COLORS.textSecondary, marginTop: SPACE.md, lineHeight: 20 },
  bubbleWrap: { flexDirection: 'row' },
  bubbleWrapMine: { justifyContent: 'flex-end' },
  bubbleWrapOther: { justifyContent: 'flex-start' },
  bubble: { maxWidth: '82%', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleMine: { backgroundColor: COLORS.primary },
  bubbleOther: { backgroundColor: '#fff', ...SHADOW.sm },
  bubbleTxt: { color: COLORS.text, fontSize: FONT.sizes.sm, lineHeight: 19 },
  bubbleTxtMine: { color: '#fff' },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: SPACE.sm,
    padding: SPACE.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  input: {
    flex: 1,
    minHeight: 46,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: COLORS.text,
    backgroundColor: '#fff',
  },
  sendBtn: {
    minHeight: 46,
    paddingHorizontal: 16,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
  },
  sendTxt: { color: '#fff', fontWeight: FONT.weights.bold, fontSize: FONT.sizes.sm },
  dealCard: {
    margin: SPACE.md,
    marginTop: 0,
    backgroundColor: '#fff',
    borderRadius: RADIUS.md,
    padding: SPACE.md,
    borderWidth: 1,
    borderColor: '#dbeafe',
    ...SHADOW.sm,
  },
  dealCardDone: { borderColor: '#bbf7d0', backgroundColor: '#f0fdf4' },
  dealTitle: { color: COLORS.primary, fontWeight: FONT.weights.bold, fontSize: FONT.sizes.sm },
  dealBody: { marginTop: 6, color: COLORS.textSecondary, lineHeight: 20, fontSize: FONT.sizes.sm },
  dealBtn: {
    marginTop: SPACE.sm,
    minHeight: 42,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACE.md,
  },
  dealBtnTxt: { color: '#fff', fontWeight: FONT.weights.bold, fontSize: FONT.sizes.sm },
});
