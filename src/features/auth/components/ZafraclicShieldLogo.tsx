import React from 'react';
import Svg, { G, Path, Text as SvgText } from 'react-native-svg';

/** Escudo institucional según `nuevo diseño.txt` (SVG → react-native-svg). */
export function ZafraclicShieldLogo({ size = 200 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 200 200">
      <G transform="translate(3,3)">
        <Path
          d="M100 45 L170 70 V120 C170 165 100 195 100 195 C100 195 30 165 30 120 V70 L100 45Z"
          fill="rgba(0,0,0,0.3)"
        />
      </G>
      <Path
        d="M100 40 L170 65 V115 C170 160 100 190 100 190 C100 190 30 160 30 115 V65 L100 40Z"
        fill="#0F3B25"
        stroke="#fbbf24"
        strokeWidth={3}
      />
      <Path
        d="M100 50 L160 72 V115 C160 152 100 178 100 178 C100 178 40 152 40 115 V72 L100 50Z"
        fill="none"
        stroke="#fbbf24"
        strokeWidth={0.5}
        opacity={0.4}
      />
      <SvgText
        x={100}
        y={128}
        fill="#ffffff"
        fontSize={23}
        fontWeight="900"
        textAnchor="middle"
        fontStyle="italic"
        letterSpacing={0}
      >
        ZafraClic
      </SvgText>
    </Svg>
  );
}
