import React from 'react';
import {
  Modal,
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getScrollableModalListMaxHeight } from '@/shared/utils/modalListHeight';
import { COLORS, FONT, RADIUS, SHADOW, SPACE } from '@/shared/utils/theme';
import { CEO_COLORS } from '@/features/super-admin/components/ceoTheme';

type Variant = 'authDark' | 'ceoDark' | 'default';

type Props<T> = {
  visible: boolean;
  title: string;
  data: readonly T[];
  keyExtractor: (item: T) => string;
  label: (item: T) => string;
  /** Segunda línea (ej. RIF en empresas). */
  subtitle?: (item: T) => string;
  onSelect: (item: T) => void;
  onClose: () => void;
  variant?: Variant;
  /** Si la lista está vacía. */
  emptyPlaceholder?: string;
  /** Botón inferior (ej. Cerrar sin elegir). */
  footerCloseLabel?: string;
};

/**
 * Lista en modal con altura acotada para que el scroll vertical funcione siempre
 * (evita FlatList sin límite dentro de Modal).
 */
export function ScrollableListModal<T>({
  visible,
  title,
  data,
  keyExtractor,
  label,
  subtitle,
  onSelect,
  onClose,
  variant = 'default',
  emptyPlaceholder,
  footerCloseLabel,
}: Props<T>) {
  const insets = useSafeAreaInsets();
  const listMaxH = getScrollableModalListMaxHeight();
  const palette = variant === 'authDark' ? stylesAuth : variant === 'ceoDark' ? stylesCeo : stylesDefault;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={[palette.overlay, { paddingTop: Math.max(insets.top, 24), paddingBottom: Math.max(insets.bottom, 24) }]}>
        <Pressable style={palette.backdrop} onPress={onClose} />
        <View style={palette.sheet}>
          <Text style={palette.title}>{title}</Text>
          <FlatList
            data={data as T[]}
            keyExtractor={keyExtractor}
            keyboardShouldPersistTaps="handled"
            style={{ maxHeight: listMaxH }}
            contentContainerStyle={palette.listContent}
            nestedScrollEnabled
            removeClippedSubviews={Platform.OS === 'android'}
            initialNumToRender={24}
            maxToRenderPerBatch={32}
            windowSize={10}
            showsVerticalScrollIndicator
            ListEmptyComponent={
              emptyPlaceholder ? (
                <Text style={palette.emptyTxt}>{emptyPlaceholder}</Text>
              ) : null
            }
            renderItem={({ item }) => (
              <TouchableOpacity
                style={palette.row}
                onPress={() => {
                  onSelect(item);
                  onClose();
                }}
              >
                <Text style={palette.rowTxt}>{label(item)}</Text>
                {subtitle ? <Text style={palette.rowSub}>{subtitle(item)}</Text> : null}
              </TouchableOpacity>
            )}
          />
          {footerCloseLabel ? (
            <TouchableOpacity style={palette.footerClose} onPress={onClose}>
              <Text style={palette.footerCloseTxt}>{footerCloseLabel}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const GLASS_BORDER = 'rgba(255,255,255,0.1)';

const stylesAuth = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'center', padding: 24 },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: '#000b' },
  sheet: {
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
    backgroundColor: '#1c1917',
    borderRadius: 20,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    zIndex: 1,
    ...SHADOW.md,
  },
  title: { fontWeight: '800', paddingHorizontal: 16, paddingBottom: 8, color: '#fff' },
  listContent: { paddingBottom: 16 },
  row: { paddingVertical: 16, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  rowTxt: { fontSize: 15, color: '#e7e5e4' },
  rowSub: { fontSize: 13, color: 'rgba(231,229,228,0.65)', marginTop: 4 },
  emptyTxt: { textAlign: 'center', padding: 24, color: 'rgba(231,229,228,0.55)' },
  footerClose: { alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' },
  footerCloseTxt: { color: 'rgba(167,243,208,0.85)', fontWeight: '600', fontSize: 15 },
});

const stylesDefault = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'center', padding: 24 },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    zIndex: 1,
    ...SHADOW.md,
  },
  title: {
    fontWeight: '800',
    paddingHorizontal: 16,
    paddingBottom: 8,
    color: COLORS.text,
    fontSize: FONT.sizes.md,
  },
  listContent: { paddingBottom: 16 },
  row: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  rowTxt: { fontSize: FONT.sizes.md, color: COLORS.text },
  rowSub: { fontSize: FONT.sizes.sm, color: COLORS.textSecondary, marginTop: 2 },
  emptyTxt: { textAlign: 'center', padding: SPACE.lg, color: COLORS.textDisabled },
  footerClose: { alignItems: 'center', paddingVertical: SPACE.sm, paddingHorizontal: SPACE.md, borderTopWidth: 1, borderTopColor: COLORS.border },
  footerCloseTxt: { color: COLORS.primary, fontWeight: '600', fontSize: FONT.sizes.md },
});

const stylesCeo = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'center', padding: 24 },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(2,6,23,0.78)' },
  sheet: {
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
    backgroundColor: CEO_COLORS.panelStrong,
    borderRadius: 24,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: CEO_COLORS.borderStrong,
    zIndex: 1,
    ...SHADOW.lg,
  },
  title: {
    fontWeight: '800',
    paddingHorizontal: 18,
    paddingBottom: 10,
    color: CEO_COLORS.text,
    fontSize: FONT.sizes.lg,
  },
  listContent: { paddingBottom: 16 },
  row: {
    paddingVertical: 15,
    paddingHorizontal: 18,
    borderBottomWidth: 1,
    borderBottomColor: CEO_COLORS.border,
  },
  rowTxt: { fontSize: FONT.sizes.md, color: CEO_COLORS.text },
  rowSub: { fontSize: FONT.sizes.sm, color: CEO_COLORS.textMute, marginTop: 3 },
  emptyTxt: { textAlign: 'center', padding: SPACE.lg, color: CEO_COLORS.textMute },
  footerClose: {
    alignItems: 'center',
    paddingVertical: SPACE.sm,
    paddingHorizontal: SPACE.md,
    borderTopWidth: 1,
    borderTopColor: CEO_COLORS.border,
  },
  footerCloseTxt: { color: CEO_COLORS.cyan, fontWeight: '700', fontSize: FONT.sizes.md },
});
