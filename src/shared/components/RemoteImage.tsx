/**
 * RemoteImage — Image con estado de carga y fallback de error.
 * Sustituye <Image source={{ uri }} /> en cualquier parte de la app.
 */
import React, { useState } from 'react';
import {
  Image,
  View,
  StyleSheet,
  type ImageStyle,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type Props = {
  uri: string | null | undefined;
  style?: StyleProp<ImageStyle>;
  containerStyle?: StyleProp<ViewStyle>;
  fallbackIcon?: string;
  fallbackIconSize?: number;
  fallbackIconColor?: string;
  resizeMode?: 'cover' | 'contain' | 'stretch' | 'center';
};

export function RemoteImage({
  uri,
  style,
  containerStyle,
  fallbackIcon = 'image-outline',
  fallbackIconSize = 28,
  fallbackIconColor = '#CBD5E1',
  resizeMode = 'cover',
}: Props) {
  const [error, setError] = useState(false);

  if (!uri || error) {
    return (
      <View style={[styles.placeholder, containerStyle, style as StyleProp<ViewStyle>]}>
        <Ionicons name={fallbackIcon as 'image-outline'} size={fallbackIconSize} color={fallbackIconColor} />
      </View>
    );
  }

  return (
    <Image
      source={{ uri }}
      style={style}
      resizeMode={resizeMode}
      onError={() => setError(true)}
    />
  );
}

const styles = StyleSheet.create({
  placeholder: {
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
