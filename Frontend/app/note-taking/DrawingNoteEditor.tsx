import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Alert, Text, TouchableOpacity } from 'react-native';
import { DrawingCanvas } from './components/DrawingCanvas';
import { DrawingToolbar } from './components/DrawingToolbar';
import { useDrawingState } from './hooks/useDrawingState';
import { DrawingTool } from './components/DrawingCanvas';

interface DrawingNoteEditorProps {
  noteId: string;
  onSave?: () => void;
  onError?: (error: string) => void;
}

const DrawingNoteEditor: React.FC<DrawingNoteEditorProps> = ({
  noteId,
  onSave,
  onError
}) => {
  const [currentTool, setCurrentTool] = useState<DrawingTool>('pen');
  const [currentColor, setCurrentColor] = useState('#000000');
  const [currentWidth, setCurrentWidth] = useState(2);
  
  const {
    strokes,
    isLoading,
    isSaving,
    hasUnsavedChanges,
    error,
    addStroke,
    clearDrawing,
    saveDrawing,
    clearError
  } = useDrawingState({
    noteId,
    autoSave: true,
    autoSaveInterval: 3000 // Auto-save every 3 seconds
  });

  // Handle errors
  useEffect(() => {
    if (error) {
      onError?.(error);
      Alert.alert('Drawing Error', error, [
        { text: 'OK', onPress: clearError }
      ]);
    }
  }, [error, onError, clearError]);

  // Handle save completion
  useEffect(() => {
    if (!isSaving && !hasUnsavedChanges) {
      onSave?.();
    }
  }, [isSaving, hasUnsavedChanges, onSave]);

  const handleStrokeComplete = (stroke: any) => {
    const drawingStroke = {
      id: `${Date.now()}-${Math.random()}`,
      points: stroke.points.flatMap((p: any) => [p.x, p.y]),
      color: stroke.color,
      width: stroke.width,
      tool: stroke.tool,
      timestamp: Date.now(),
      opacity: stroke.opacity || 1,
    };
    
    addStroke(drawingStroke);
  };

  const handleManualSave = async () => {
    try {
      await saveDrawing();
      Alert.alert('Success', 'Drawing saved successfully!');
    } catch (error) {
      // Error is already handled by the hook
    }
  };

  const handleClearDrawing = async () => {
    Alert.alert(
      'Clear Drawing',
      'Are you sure you want to clear all drawing content? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Clear', 
          style: 'destructive',
          onPress: clearDrawing
        }
      ]
    );
  };

  if (isLoading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text>Loading drawing...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Drawing Toolbar */}
      <DrawingToolbar
        currentTool={currentTool}
        onToolChange={setCurrentTool}
        currentColor={currentColor}
        onColorChange={setCurrentColor}
        currentWidth={currentWidth}
        onWidthChange={setCurrentWidth}
        onUndo={() => {}}
        onClear={handleClearDrawing}
        canUndo={strokes.length > 0}
      />

      {/* Drawing Canvas */}
      <View style={styles.canvasContainer}>
        <DrawingCanvas
          strokes={strokes}
          currentTool={currentTool}
          currentColor={currentColor}
          currentWidth={currentWidth}
          onStrokeComplete={handleStrokeComplete}
          onAddStroke={() => {}}
        />
      </View>

      {/* Status Bar */}
      <View style={styles.statusBar}>
        <View style={styles.statusLeft}>
          {hasUnsavedChanges && (
            <Text style={styles.unsavedText}>Unsaved changes</Text>
          )}
          {isSaving && (
            <Text style={styles.savingText}>Saving...</Text>
          )}
        </View>
        
        <TouchableOpacity 
          style={[
            styles.saveButton,
            (!hasUnsavedChanges || isSaving) && styles.saveButtonDisabled
          ]}
          onPress={handleManualSave}
          disabled={!hasUnsavedChanges || isSaving}
        >
          <Text style={styles.saveButtonText}>
            {isSaving ? 'Saving...' : 'Save Now'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  canvasContainer: {
    flex: 1,
    margin: 10,
    backgroundColor: '#fafafa',
    borderRadius: 8,
    overflow: 'hidden',
  },
  statusBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 10,
    backgroundColor: '#f5f5f5',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  statusLeft: {
    flex: 1,
  },
  unsavedText: {
    color: '#ff9800',
    fontSize: 12,
  },
  savingText: {
    color: '#2196f3',
    fontSize: 12,
  },
  saveButton: {
    backgroundColor: '#4caf50',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 4,
  },
  saveButtonDisabled: {
    backgroundColor: '#ccc',
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
});

export default DrawingNoteEditor;
