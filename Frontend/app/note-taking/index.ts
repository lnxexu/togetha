// Main drawing components
export { default as DrawingEditor } from './DrawingEditor';

// Canvas components
export { default as DrawingCanvas } from './components/DrawingCanvas';
export { default as DrawingToolbar } from './components/DrawingToolbar';
export { default as ImprovedDrawingToolbar } from './components/ImprovedDrawingToolbar';
export { default as ZoomIndicator } from './components/ZoomIndicator';

// Hooks
export { useDrawingState } from './hooks/useDrawingState';
export { useDrawingAPI, useAutoSaveDrawing } from './hooks/useDrawingAPI';

// Services
export { drawingAPI } from './services/drawingAPI';
export type { DrawingStroke, DrawingData } from './services/drawingAPI';

// Utilities
export * from './utils/strokeUtils';

// Types
export type { Point, Stroke, DrawingTool } from './components/DrawingCanvas';
