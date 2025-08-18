import React from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import Svg, { Line, Circle, Rect, Defs, Pattern, Path } from 'react-native-svg';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

export type TemplateType = 'blank' | 'grid' | 'lines' | 'dots' | 'sketch' | 'notes';

interface TemplateOverlayProps {
  template: TemplateType;
  canvasWidth?: number;
  canvasHeight?: number;
  gridSize?: number;
  lineHeight?: number;
  margin?: number;
}

export const TemplateOverlay: React.FC<TemplateOverlayProps> = ({
  template,
  canvasWidth = screenWidth,
  canvasHeight = screenHeight,
  gridSize = 20,
  lineHeight = 24,
  margin = 40,
}) => {
  const renderBlankTemplate = () => {
    return null; // No overlay for blank canvas
  };

  const renderGridTemplate = () => {
    const lines = [];
    const strokeColor = '#E5E7EB';
    const strokeWidth = 0.5;

    // Vertical lines
    for (let x = gridSize; x < canvasWidth; x += gridSize) {
      lines.push(
        <Line
          key={`v-${x}`}
          x1={x}
          y1={0}
          x2={x}
          y2={canvasHeight}
          stroke={strokeColor}
          strokeWidth={strokeWidth}
        />
      );
    }

    // Horizontal lines
    for (let y = gridSize; y < canvasHeight; y += gridSize) {
      lines.push(
        <Line
          key={`h-${y}`}
          x1={0}
          y1={y}
          x2={canvasWidth}
          y2={y}
          stroke={strokeColor}
          strokeWidth={strokeWidth}
        />
      );
    }

    return (
      <Svg width={canvasWidth} height={canvasHeight} style={StyleSheet.absoluteFillObject}>
        {lines}
      </Svg>
    );
  };

  const renderLinesTemplate = () => {
    const lines = [];
    const strokeColor = '#E5E7EB';
    const strokeWidth = 0.5;
    const marginLine = '#3B82F6';

    // Horizontal lines
    for (let y = lineHeight; y < canvasHeight; y += lineHeight) {
      lines.push(
        <Line
          key={`line-${y}`}
          x1={0}
          y1={y}
          x2={canvasWidth}
          y2={y}
          stroke={strokeColor}
          strokeWidth={strokeWidth}
        />
      );
    }

    // Left margin line (like notebook paper)
    lines.push(
      <Line
        key="margin"
        x1={margin}
        y1={0}
        x2={margin}
        y2={canvasHeight}
        stroke={marginLine}
        strokeWidth={1}
      />
    );

    return (
      <Svg width={canvasWidth} height={canvasHeight} style={StyleSheet.absoluteFillObject}>
        {lines}
      </Svg>
    );
  };

  const renderDotsTemplate = () => {
    const dots = [];
    const dotColor = '#D1D5DB';
    const dotSize = 1;
    const spacing = 15;

    for (let x = spacing; x < canvasWidth; x += spacing) {
      for (let y = spacing; y < canvasHeight; y += spacing) {
        dots.push(
          <Circle
            key={`dot-${x}-${y}`}
            cx={x}
            cy={y}
            r={dotSize}
            fill={dotColor}
          />
        );
      }
    }

    return (
      <Svg width={canvasWidth} height={canvasHeight} style={StyleSheet.absoluteFillObject}>
        {dots}
      </Svg>
    );
  };

  const renderSketchTemplate = () => {
    const elements = [];
    const strokeColor = '#F3F4F6';
    const strokeWidth = 0.3;

    // Light diagonal grid for perspective/construction lines
    const diagonalSpacing = 30;
    
    // Diagonal lines from top-left to bottom-right
    for (let offset = -canvasHeight; offset < canvasWidth; offset += diagonalSpacing) {
      elements.push(
        <Line
          key={`diag1-${offset}`}
          x1={offset}
          y1={0}
          x2={offset + canvasHeight}
          y2={canvasHeight}
          stroke={strokeColor}
          strokeWidth={strokeWidth}
        />
      );
    }

    // Diagonal lines from top-right to bottom-left
    for (let offset = 0; offset < canvasWidth + canvasHeight; offset += diagonalSpacing) {
      elements.push(
        <Line
          key={`diag2-${offset}`}
          x1={offset}
          y1={0}
          x2={offset - canvasHeight}
          y2={canvasHeight}
          stroke={strokeColor}
          strokeWidth={strokeWidth}
        />
      );
    }

    return (
      <Svg width={canvasWidth} height={canvasHeight} style={StyleSheet.absoluteFillObject}>
        {elements}
      </Svg>
    );
  };

  const renderNotesTemplate = () => {
    const elements = [];
    const strokeColor = '#E5E7EB';
    const strokeWidth = 0.5;
    const headerHeight = 80;
    const sidebarWidth = 60;

    // Header section
    elements.push(
      <Line
        key="header-line"
        x1={0}
        y1={headerHeight}
        x2={canvasWidth}
        y2={headerHeight}
        stroke={strokeColor}
        strokeWidth={1}
      />
    );

    // Sidebar line
    elements.push(
      <Line
        key="sidebar-line"
        x1={sidebarWidth}
        y1={headerHeight}
        x2={sidebarWidth}
        y2={canvasHeight}
        stroke={strokeColor}
        strokeWidth={1}
      />
    );

    // Content lines
    for (let y = headerHeight + lineHeight; y < canvasHeight; y += lineHeight) {
      elements.push(
        <Line
          key={`content-line-${y}`}
          x1={sidebarWidth}
          y1={y}
          x2={canvasWidth}
          y2={y}
          stroke={strokeColor}
          strokeWidth={strokeWidth}
        />
      );
    }

    // Header grid for title/date
    const headerGridSize = 10;
    for (let x = sidebarWidth + headerGridSize; x < canvasWidth; x += headerGridSize) {
      elements.push(
        <Line
          key={`header-grid-${x}`}
          x1={x}
          y1={0}
          x2={x}
          y2={headerHeight}
          stroke={'#F3F4F6'}
          strokeWidth={0.3}
        />
      );
    }

    return (
      <Svg width={canvasWidth} height={canvasHeight} style={StyleSheet.absoluteFillObject}>
        {elements}
      </Svg>
    );
  };

  const renderTemplate = () => {
    switch (template) {
      case 'blank':
        return renderBlankTemplate();
      case 'grid':
        return renderGridTemplate();
      case 'lines':
        return renderLinesTemplate();
      case 'dots':
        return renderDotsTemplate();
      case 'sketch':
        return renderSketchTemplate();
      case 'notes':
        return renderNotesTemplate();
      default:
        return renderBlankTemplate();
    }
  };

  if (template === 'blank') {
    return null;
  }

  return (
    <View style={styles.container} pointerEvents="none">
      {renderTemplate()}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1,
  },
});

export default TemplateOverlay;
