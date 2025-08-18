import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Line, Circle } from 'react-native-svg';
import { TemplateType } from './TemplateOverlay';

interface TemplatePreviewProps {
  template: TemplateType;
  size?: number;
}

export const TemplatePreview: React.FC<TemplatePreviewProps> = ({
  template,
  size = 40,
}) => {
  const strokeColor = '#D1D5DB';
  const strokeWidth = 0.8;

  const renderPreview = () => {
    switch (template) {
      case 'blank':
        return null;
      
      case 'grid':
        const gridSpacing = size / 4;
        const gridLines = [];
        
        // Vertical lines
        for (let x = gridSpacing; x < size; x += gridSpacing) {
          gridLines.push(
            <Line
              key={`v-${x}`}
              x1={x}
              y1={0}
              x2={x}
              y2={size}
              stroke={strokeColor}
              strokeWidth={strokeWidth}
            />
          );
        }
        
        // Horizontal lines
        for (let y = gridSpacing; y < size; y += gridSpacing) {
          gridLines.push(
            <Line
              key={`h-${y}`}
              x1={0}
              y1={y}
              x2={size}
              y2={y}
              stroke={strokeColor}
              strokeWidth={strokeWidth}
            />
          );
        }
        
        return gridLines;
      
      case 'lines':
        const lineSpacing = size / 5;
        const horizontalLines = [];
        
        for (let y = lineSpacing; y < size; y += lineSpacing) {
          horizontalLines.push(
            <Line
              key={`line-${y}`}
              x1={0}
              y1={y}
              x2={size}
              y2={y}
              stroke={strokeColor}
              strokeWidth={strokeWidth}
            />
          );
        }
        
        // Add margin line
        horizontalLines.push(
          <Line
            key="margin"
            x1={size * 0.2}
            y1={0}
            x2={size * 0.2}
            y2={size}
            stroke="#3B82F6"
            strokeWidth={strokeWidth * 1.5}
          />
        );
        
        return horizontalLines;
      
      case 'dots':
        const dotSpacing = size / 6;
        const dots = [];
        
        for (let x = dotSpacing; x < size; x += dotSpacing) {
          for (let y = dotSpacing; y < size; y += dotSpacing) {
            dots.push(
              <Circle
                key={`dot-${x}-${y}`}
                cx={x}
                cy={y}
                r={0.5}
                fill={strokeColor}
              />
            );
          }
        }
        
        return dots;
      
      case 'sketch':
        const diagonalLines = [];
        const diagSpacing = size / 3;
        
        // Diagonal lines
        for (let offset = 0; offset < size; offset += diagSpacing) {
          diagonalLines.push(
            <Line
              key={`diag1-${offset}`}
              x1={0}
              y1={offset}
              x2={size - offset}
              y2={size}
              stroke={strokeColor}
              strokeWidth={strokeWidth * 0.6}
            />
          );
          
          diagonalLines.push(
            <Line
              key={`diag2-${offset}`}
              x1={offset}
              y1={0}
              x2={size}
              y2={size - offset}
              stroke={strokeColor}
              strokeWidth={strokeWidth * 0.6}
            />
          );
        }
        
        return diagonalLines;
      
      case 'notes':
        const notesElements = [];
        const headerHeight = size * 0.3;
        const sidebarWidth = size * 0.25;
        const noteLineSpacing = size / 8;
        
        // Header line
        notesElements.push(
          <Line
            key="header"
            x1={0}
            y1={headerHeight}
            x2={size}
            y2={headerHeight}
            stroke={strokeColor}
            strokeWidth={strokeWidth}
          />
        );
        
        // Sidebar line
        notesElements.push(
          <Line
            key="sidebar"
            x1={sidebarWidth}
            y1={headerHeight}
            x2={sidebarWidth}
            y2={size}
            stroke={strokeColor}
            strokeWidth={strokeWidth}
          />
        );
        
        // Content lines
        for (let y = headerHeight + noteLineSpacing; y < size; y += noteLineSpacing) {
          notesElements.push(
            <Line
              key={`note-line-${y}`}
              x1={sidebarWidth}
              y1={y}
              x2={size}
              y2={y}
              stroke={strokeColor}
              strokeWidth={strokeWidth * 0.8}
            />
          );
        }
        
        return notesElements;
      
      default:
        return null;
    }
  };

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Svg width={size} height={size}>
        {renderPreview()}
      </Svg>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
});

export default TemplatePreview;
