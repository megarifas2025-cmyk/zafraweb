import React, { useState } from 'react';
import { PanResponder, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

type Props = {
  title: string;
  value: string;
  onChange: (next: string) => void;
};

const WIDTH = 300;
const HEIGHT = 140;

export function InspectionSignaturePad({ title, value, onChange }: Props) {
  const [localPath, setLocalPath] = useState(value);

  const responder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (evt) => {
      const { locationX, locationY } = evt.nativeEvent;
      setLocalPath((prev) => {
        const next = `${prev ? `${prev} ` : ''}M ${locationX.toFixed(1)} ${locationY.toFixed(1)}`;
        onChange(next.trim());
        return next;
      });
    },
    onPanResponderMove: (evt) => {
      const { locationX, locationY } = evt.nativeEvent;
      setLocalPath((prev) => {
        const next = `${prev} L ${locationX.toFixed(1)} ${locationY.toFixed(1)}`;
        onChange(next.trim());
        return next;
      });
    },
  });

  const clear = () => {
    setLocalPath('');
    onChange('');
  };

  return (
    <View style={s.wrap}>
      <View style={s.head}>
        <Text style={s.title}>{title}</Text>
        <TouchableOpacity onPress={clear} hitSlop={10}>
          <Text style={s.clear}>Limpiar</Text>
        </TouchableOpacity>
      </View>
      <View style={s.pad} {...responder.panHandlers}>
        <Svg width={WIDTH} height={HEIGHT}>
          {localPath ? <Path d={localPath} stroke="#0f172a" strokeWidth={2.4} fill="none" strokeLinecap="round" strokeLinejoin="round" /> : null}
        </Svg>
        {!localPath ? <Text style={s.hint}>Firma aquí con el dedo</Text> : null}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { marginTop: 16 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  title: { fontSize: 13, fontWeight: '800', color: '#334155', textTransform: 'uppercase', letterSpacing: 0.6 },
  clear: { color: '#2563eb', fontWeight: '700' },
  pad: {
    width: WIDTH,
    maxWidth: '100%',
    height: HEIGHT,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 16,
    backgroundColor: '#fff',
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  hint: { position: 'absolute', color: '#94a3b8', fontSize: 12 },
});
