import { useState, useCallback, useRef } from 'react';
import { Stroke, DrawingTool } from '../components/DrawingCanvas';

interface UseDrawingStateProps {
  maxHistorySize?: number;
}

interface DrawingState {
  strokes: Stroke[];
  currentTool: DrawingTool;
  currentColor: string;
  currentWidth: number;
}

export const useDrawingState = ({ maxHistorySize = 50 }: UseDrawingStateProps = {}) => {
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [currentTool, setCurrentTool] = useState<DrawingTool>('pen');
  const [currentColor, setCurrentColor] = useState('#000000');
  const [currentWidth, setCurrentWidth] = useState(4);
  
  // History management for undo/redo
  const [history, setHistory] = useState<Stroke[][]>([[]]);
  const [historyIndex, setHistoryIndex] = useState(0);
  
  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;
  // Add a new state to history
  const addToHistory = useCallback((newStrokes: Stroke[]) => {
    setHistory(prev => {
      const newHistory = prev.slice(0, historyIndex + 1);
      newHistory.push([...newStrokes]);
      
      // Limit history size
      if (newHistory.length > maxHistorySize) {
        newHistory.shift();
        setHistoryIndex(prev => prev - 1);
        return newHistory;
      }
      
      setHistoryIndex(newHistory.length - 1);
      return newHistory;
    });
  }, [historyIndex, maxHistorySize]);

  // Handle stroke completion
  interface Stroke {
    tool: DrawingTool;
    points: Array<{ x: number; y: number }>;
    color: string; // Added color property
    width: number; // Added width property
    erasedStrokes?: Stroke[]; // Optional property for erased strokes
  }

  const handleStrokeComplete = (newStroke: Stroke) => {
    if (newStroke.tool === 'eraser') {
      // Filter out strokes that intersect with the eraser's path
      const updatedStrokes = strokes.filter(stroke => {
        return !newStroke.points.some(eraserPoint => 
          stroke.points.some(strokePoint => {
            const distance = Math.sqrt(
              Math.pow(strokePoint.x - eraserPoint.x, 2) +
              Math.pow(strokePoint.y - eraserPoint.y, 2)
            );
            return distance < (stroke.width / 2); // Accessing stroke.width now works
          })
        );
      });
      
      setStrokes(updatedStrokes);
      addToHistory(updatedStrokes);
    } else if (newStroke.points.length >= 2) {
      // For normal strokes, add them to the drawing
      const updatedStrokes = [...strokes, newStroke];
      setStrokes(updatedStrokes);
      addToHistory(updatedStrokes);
    }
  };
  // Undo last action
  const undo = useCallback(() => {
    if (canUndo) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      setStrokes([...history[newIndex]]);
    }
  }, [canUndo, historyIndex, history]);

  // Redo last undone action
  const redo = useCallback(() => {
    if (canRedo) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      setStrokes([...history[newIndex]]);
    }
  }, [canRedo, historyIndex, history]);

  // Clear all strokes
  const clear = useCallback(() => {
    setStrokes([]);
    addToHistory([]);
  }, [addToHistory]);

  // Tool change handlers
  const changeTool = useCallback((tool: DrawingTool) => {
    setCurrentTool(tool);
    
    // Auto-adjust width for different tools
    switch (tool) {
      case 'highlighter':
        setCurrentWidth(16);
        break;
      case 'eraser':
        setCurrentWidth(20);
        break;
      case 'brush':
        setCurrentWidth(8);
        break;
      case 'pencil':
        setCurrentWidth(2);
        break;
      case 'marker':
        setCurrentWidth(6);
        break;
      case 'calligraphy':
        setCurrentWidth(12);
        break;
      case 'pen':
      default:
        setCurrentWidth(4);
        break;
    }
  }, []);

  const changeColor = useCallback((color: string) => {
    setCurrentColor(color);
  }, []);

  const changeWidth = useCallback((width: number) => {
    setCurrentWidth(width);
  }, []);

  // Export drawing data
  const exportDrawing = useCallback(() => {
    return {
      strokes,
      timestamp: Date.now(),
      version: '1.0'
    };
  }, [strokes]);

  // Import drawing data
  const importDrawing = useCallback((data: { strokes: Stroke[] }) => {
    setStrokes(data.strokes);
    addToHistory(data.strokes);
  }, [addToHistory]);

  // Get drawing statistics
  const getStats = useCallback(() => {
    const totalPoints = strokes.reduce((sum, stroke) => sum + stroke.points.length, 0);
    const toolCounts = strokes.reduce((counts, stroke) => {
      counts[stroke.tool] = (counts[stroke.tool] || 0) + 1;
      return counts;
    }, {} as Record<DrawingTool, number>);

    return {
      totalStrokes: strokes.length,
      totalPoints,
      toolCounts,
      colors: [...new Set(strokes.map(s => s.color))], // Ensure Stroke type has a color property
    };
  }, [strokes]);

  return {
    // State
    strokes,
    currentTool,
    currentColor,
    currentWidth,
    canUndo,
    canRedo,
    
    // Actions
    handleStrokeComplete,
    undo,
    redo,
    clear,
    changeTool,
    changeColor,
    changeWidth,
    
    // Utilities
    exportDrawing,
    importDrawing,
    getStats,
  };
};