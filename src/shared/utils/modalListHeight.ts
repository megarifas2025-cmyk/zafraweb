import { Dimensions } from 'react-native';

/** Altura máxima para listas dentro de modales (scroll vertical fiable en iOS/Android). */
export function getScrollableModalListMaxHeight(ratio = 0.55, cap = 420): number {
  return Math.min(cap, Math.round(Dimensions.get('window').height * ratio));
}
