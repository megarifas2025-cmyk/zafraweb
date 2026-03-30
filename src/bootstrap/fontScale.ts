import { Platform, Text, TextInput } from 'react-native';

/**
 * Limita el multiplicador de fuente del sistema. En Android, valores altos
 * estiran mucho el texto y los bloques en vertical.
 */
/** Android: accesibilidad >1.3 estira mucho filas, tab bar y modales. */
const MAX_FONT_MULTIPLIER = Platform.OS === 'android' ? 1.0 : 1.22;

const T = Text as typeof Text & { defaultProps?: { maxFontSizeMultiplier?: number } };
const TI = TextInput as typeof TextInput & { defaultProps?: { maxFontSizeMultiplier?: number } };
T.defaultProps = { ...T.defaultProps, maxFontSizeMultiplier: MAX_FONT_MULTIPLIER };
TI.defaultProps = { ...TI.defaultProps, maxFontSizeMultiplier: MAX_FONT_MULTIPLIER };
