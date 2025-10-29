import React from 'react';
import { ViewStyle } from 'react-native';
import Svg, { Rect, Path, Text as SvgText } from 'react-native-svg';

interface PDFPlaceholderProps {
  width?: number;
  height?: number;
  style?: ViewStyle;
  accentColor?: string; // header color
  borderColor?: string;
  backgroundColor?: string;
}

// Simple, lightweight SVG placeholder for PDF thumbnails
const PDFPlaceholder: React.FC<PDFPlaceholderProps> = ({
  width = 120,
  height = 160,
  style,
  accentColor = '#EF4444',
  borderColor = '#E5E7EB',
  backgroundColor = '#FFFFFF',
}) => {
  const corner = Math.max(8, Math.min(18, Math.floor(Math.min(width, height) * 0.12)));
  const headerH = Math.max(18, Math.floor(height * 0.18));

  return (
    <Svg width={width} height={height} style={style}>
      {/* Document body with folded corner */}
      <Rect x={0.5} y={0.5} width={width - 1} height={height - 1} rx={8} ry={8} fill={backgroundColor} stroke={borderColor} />
      {/* Folded corner */}
      <Path
        d={`M ${width - corner - 0.5} 0.5 L ${width - 0.5} ${corner + 0.5} L ${width - 0.5} 0.5 Z`}
        fill={'#F3F4F6'}
        stroke={borderColor}
      />
      {/* Header band */}
      <Rect x={0.5} y={0.5} width={width - 1} height={headerH} rx={8} ry={8} fill={accentColor} />
      {/* Header text */}
      <SvgText
        x={width / 2}
        y={Math.round(headerH * 0.65)}
        textAnchor="middle"
        fontSize={Math.max(10, Math.floor(headerH * 0.5))}
        fill="#FFFFFF"
      >
        PDF
      </SvgText>
      {/* Content lines */}
      {Array.from({ length: 5 }).map((_, i) => {
        const lineW = width * (0.75 - i * 0.08);
        const lineH = Math.max(4, Math.floor(height * 0.03));
        const x = (width - lineW) / 2;
        const y = headerH + 10 + i * (lineH + 8);
        if (y + lineH > height - 10) return null;
        return (
          <Rect
            key={i}
            x={x}
            y={y}
            width={lineW}
            height={lineH}
            rx={lineH / 2}
            fill={'#E5E7EB'}
          />
        );
      })}
    </Svg>
  );
};

export default PDFPlaceholder;
