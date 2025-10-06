import React, { useRef, useState } from "react";
import { View, ScrollView, TouchableOpacity, Text, StyleSheet, Modal } from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import type { DrawingTool } from "./DrawingCanvas";
import type { TemplateType } from "./TemplateOverlay";

// PDF-specific toolbar with DrawingToolbar-like appearance, but without tool selectors.
export interface PDFToolbarProps {
  // Minimal tool selection and vitals
  currentTool?: DrawingTool; // only pen | brush | highlighter | eraser are rendered
  currentColor?: string; // color swatch
  currentWidth?: number; // px label
  highlighterOpacity?: number; // 0..1 for display
  eraserSize?: number; // 0..1 for display
  currentTemplate?: TemplateType;
  currentZoom?: number;
  compact?: boolean;
  isEditMode?: boolean;
  onModeToggle?: () => void;
  // Stroke scaling toggle
  scaleStrokesWithZoom?: boolean;
  onToggleScaleStrokes?: () => void;
  // Actions
  onToolChange?: (tool: DrawingTool) => void;
  onColorChange?: (color: string) => void;
  onWidthChange?: (width: number) => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onClear?: () => void;
  onQuickExport?: () => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onZoomReset?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
}

export const PDFToolbar: React.FC<PDFToolbarProps> = ({
  currentZoom = 1,
  compact = false,
  currentTool,
  currentColor = '#000000',
  currentWidth = 2,
  highlighterOpacity,
  eraserSize,
  isEditMode = true,
  onModeToggle,
  scaleStrokesWithZoom = false,
  onToggleScaleStrokes,
  onToolChange,
  onColorChange,
  onWidthChange,
  onUndo,
  onRedo,
  onClear,
  onQuickExport,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  canUndo = false,
  canRedo = false,
}) => {
  const inViewMode = !isEditMode;
  const toolsEnabled = !!isEditMode;
  // Dropdown state for tool selection (shown when tapping the Pen button)
  const [toolsOpen, setToolsOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const penButtonRef = useRef<any>(null);
  // Color & width selectors
  const [colorOpen, setColorOpen] = useState(false);
  const [colorMenuPos, setColorMenuPos] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const colorButtonRef = useRef<any>(null);
  const [widthOpen, setWidthOpen] = useState(false);
  const [widthMenuPos, setWidthMenuPos] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const widthButtonRef = useRef<any>(null);
  // Tool definitions with appropriate icons
  const tools = [
    { key: 'pen', label: 'Pen', renderIcon: (color: string, size = 16) => (
      <Ionicons name="create-outline" size={size} color={color} />
    ) },
    { key: 'highlighter', label: 'Highlighter', renderIcon: (color: string, size = 16) => (
      <MaterialCommunityIcons name="marker" size={size} color={color} />
    ) },
    { key: 'brush', label: 'Brush', renderIcon: (color: string, size = 16) => (
      <Ionicons name="brush-outline" size={size} color={color} />
    ) },
    { key: 'eraser', label: 'Eraser', renderIcon: (color: string, size = 16) => (
      <MaterialCommunityIcons name="eraser" size={size} color={color} />
    ) },
  ] as const;

  const currentToolDef = tools.find(t => t.key === currentTool) || tools[0];
  const COLORS = [
    '#000000', '#6B7280', '#1F2937',
    '#FF6B6B', '#F59E0B', '#FFD700',
    '#10B981', '#4ECDC4', '#45B7D1',
    '#3B82F6', '#A78BFA', '#EC4899',
  ];
  const WIDTHS = [1, 2, 3, 4, 6, 8, 12];

  return (
    <View
      style={[
        styles.toolbarWrapper,
        compact && {
          marginTop: 0,
          marginBottom: 0,
        },
      ]}
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.container}
        contentContainerStyle={[
          styles.contentContainer,
          compact && { paddingHorizontal: 6, paddingVertical: 6 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Mode toggle (shows the target mode to switch to) */}
        <View style={styles.section}>
          <TouchableOpacity
            style={[styles.modeButton, inViewMode && styles.modeButtonInactive]}
            onPress={onModeToggle}
            activeOpacity={0.85}
            accessibilityLabel={inViewMode ? 'Switch to Edit' : 'Switch to View'}
          >
            <Ionicons
              name={inViewMode ? 'create-outline' : 'eye-outline'}
              size={14}
              color={inViewMode ? '#6A009C' : '#374151'}
            />
            <Text style={styles.modeButtonText}>{inViewMode ? 'Edit' : 'View'}</Text>
          </TouchableOpacity>
        </View>

        {/* Single tool dropdown button */}
        {onToolChange && (
          <View style={styles.section}>
            <TouchableOpacity
              ref={penButtonRef}
              style={[
                styles.dropdownButton,
                toolsOpen && styles.dropdownButtonActive,
                !toolsEnabled && styles.disabledButton,
              ]}
              onPress={() => {
                if (!toolsEnabled) return;
                setToolsOpen((v) => {
                  const next = !v;
                  if (next) {
                    requestAnimationFrame(() => {
                      try {
                        (penButtonRef.current as any)?.measureInWindow?.((x: number, y: number, width: number, height: number) => {
                          setMenuPos({ x, y, width, height });
                        });
                      } catch {
                        setMenuPos(null);
                      }
                    });
                  }
                  return next;
                });
              }}
              activeOpacity={toolsEnabled ? 0.85 : 1}
            >
              {currentToolDef.renderIcon('#374151', 16)}
              <Text style={styles.dropdownButtonText}>{currentToolDef.label}</Text>
              <Ionicons name={toolsOpen ? 'chevron-up' : 'chevron-down'} size={14} color="#6B7280" />
            </TouchableOpacity>

            {/* Tools dropdown rendered in a modal to avoid clipping */}
            <Modal
              visible={toolsOpen && toolsEnabled}
              transparent
              animationType="fade"
              onRequestClose={() => setToolsOpen(false)}
            >
              <TouchableOpacity style={styles.dropdownOverlay} activeOpacity={1} onPress={() => setToolsOpen(false)}>
                <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
                  <View
                    style={[
                      styles.dropdownMenu,
                      {
                        position: 'absolute',
                        top: (menuPos?.y ?? 60) + (menuPos?.height ?? 28) + 6,
                        left: Math.max(8, (menuPos?.x ?? 20) - 6),
                      },
                    ]}
                  >
                    <View style={styles.dropdownCaret} />
                    <Text style={styles.dropdownHeader}>Tool</Text>
                    {tools.map((t) => {
                      const selected = currentTool === (t.key as DrawingTool);
                      return (
                        <TouchableOpacity
                          key={t.key}
                          style={[styles.dropdownItem, selected && styles.dropdownItemActive]}
                          onPress={() => {
                            onToolChange?.(t.key as DrawingTool);
                            setToolsOpen(false);
                          }}
                          activeOpacity={0.85}
                        >
                          {t.renderIcon(selected ? '#6A009C' : '#374151', 16)}
                          <Text style={[styles.dropdownItemText, selected && { color: '#6A009C' }]}>{t.label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              </TouchableOpacity>
            </Modal>
          </View>
        )}

        {/* Vitals */}
        <View style={styles.section}>
          <View style={styles.vitalsRow}>
            <TouchableOpacity
              ref={colorButtonRef}
              style={[styles.vitalChip, styles.clickableChip, inViewMode && styles.disabledButton]}
              activeOpacity={toolsEnabled ? 0.85 : 1}
              onPress={() => {
                if (!onColorChange || !toolsEnabled) return;
                setColorOpen(true);
                requestAnimationFrame(() => {
                  try {
                    (colorButtonRef.current as any)?.measureInWindow?.((x: number, y: number, width: number, height: number) => {
                      setColorMenuPos({ x, y, width, height });
                    });
                  } catch {
                    setColorMenuPos(null);
                  }
                });
              }}
            >
              <View style={[styles.colorDot, { backgroundColor: currentColor }]} />
              <Text style={styles.vitalText}>Color</Text>
            </TouchableOpacity>
            <TouchableOpacity
              ref={widthButtonRef}
              style={[styles.vitalChip, styles.clickableChip, inViewMode && styles.disabledButton]}
              activeOpacity={toolsEnabled ? 0.85 : 1}
              onPress={() => {
                if (!onWidthChange || !toolsEnabled) return;
                setWidthOpen(true);
                requestAnimationFrame(() => {
                  try {
                    (widthButtonRef.current as any)?.measureInWindow?.((x: number, y: number, width: number, height: number) => {
                      setWidthMenuPos({ x, y, width, height });
                    });
                  } catch {
                    setWidthMenuPos(null);
                  }
                });
              }}
            >
              <Text style={styles.vitalText}>{currentWidth}px</Text>
            </TouchableOpacity>

           
            {/* Color picker modal */}
            <Modal
              visible={colorOpen && toolsEnabled}
              transparent
              animationType="fade"
              onRequestClose={() => setColorOpen(false)}
            >
              <TouchableOpacity style={styles.dropdownOverlay} activeOpacity={1} onPress={() => setColorOpen(false)}>
                <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
                  <View
                    style={[
                      styles.dropdownMenu,
                      {
                        position: 'absolute',
                        top: (colorMenuPos?.y ?? 60) + (colorMenuPos?.height ?? 28) + 6,
                        left: Math.max(8, (colorMenuPos?.x ?? 20) - 6),
                        paddingHorizontal: 10,
                        paddingVertical: 10,
                      },
                    ]}
                  >
                    <View style={styles.dropdownCaret} />
                    <Text style={styles.dropdownHeader}>Color</Text>
                    <View style={styles.colorsGrid}>
                      {COLORS.map((c) => {
                        const selected = (currentColor || '').toLowerCase() === c.toLowerCase();
                        return (
                          <TouchableOpacity
                            key={c}
                            style={[styles.colorSwatch, { backgroundColor: c }, selected && styles.colorSwatchSelected]}
                            onPress={() => { onColorChange?.(c); setColorOpen(false); }}
                            activeOpacity={0.85}
                          />
                        );
                      })}
                    </View>
                  </View>
                </View>
              </TouchableOpacity>
            </Modal>

            {/* Width picker modal */}
            <Modal
              visible={widthOpen && toolsEnabled}
              transparent
              animationType="fade"
              onRequestClose={() => setWidthOpen(false)}
            >
              <TouchableOpacity style={styles.dropdownOverlay} activeOpacity={1} onPress={() => setWidthOpen(false)}>
                <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
                  <View
                    style={[
                      styles.dropdownMenu,
                      {
                        position: 'absolute',
                        top: (widthMenuPos?.y ?? 60) + (widthMenuPos?.height ?? 28) + 6,
                        left: Math.max(8, (widthMenuPos?.x ?? 20) - 6),
                        paddingHorizontal: 10,
                        paddingVertical: 10,
                      },
                    ]}
                  >
                    <View style={styles.dropdownCaret} />
                    <Text style={styles.dropdownHeader}>Stroke Width</Text>
                    <View style={styles.widthsRow}>
                      {WIDTHS.map((w) => {
                        const selected = Math.round(w) === Math.round(currentWidth || 0);
                        return (
                          <TouchableOpacity
                            key={w}
                            style={[styles.widthChip, selected && styles.widthChipActive]}
                            onPress={() => { onWidthChange?.(w); setWidthOpen(false); }}
                            activeOpacity={0.85}
                          >
                            <Text style={[styles.widthChipText, selected && styles.widthChipTextActive]}>{w}px</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                </View>
              </TouchableOpacity>
            </Modal>
            {typeof highlighterOpacity === 'number' && currentTool === 'highlighter' && (
              <View style={styles.vitalChip}>
                <Text style={styles.vitalText}>Opacity {Math.round(Math.max(0, Math.min(1, highlighterOpacity)) * 100)}%</Text>
              </View>
            )}
            {typeof eraserSize === 'number' && currentTool === 'eraser' && (
              <View style={styles.vitalChip}>
                <Text style={styles.vitalText}>Eraser {Math.round(Math.max(0, Math.min(1, eraserSize)) * 100)}%</Text>
              </View>
            )}
          </View>
        </View>
        {/* Actions */}
        <View style={styles.section}>
          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={[styles.actionButton, !canUndo && styles.disabledButton]}
              onPress={onUndo}
              disabled={!canUndo}
            >
              <Ionicons name="arrow-undo" size={18} color={canUndo ? "#333" : "#ccc"} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionButton, !canRedo && styles.disabledButton]}
              onPress={onRedo}
              disabled={!canRedo}
            >
              <Ionicons name="arrow-redo" size={18} color={canRedo ? "#333" : "#ccc"} />
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionButton} onPress={onClear}>
              <Ionicons name="trash" size={18} color="#ff4444" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Zoom */}
        {(onZoomIn || onZoomOut || onZoomReset) && (
          <View style={styles.section}>
            <View style={styles.zoomSection}>
              <TouchableOpacity style={styles.zoomButton} onPress={onZoomReset} activeOpacity={0.8} accessibilityLabel="Reset view">
                <Ionicons name="refresh" size={16} color="#64748b" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.zoomButton} onPress={onZoomOut} activeOpacity={0.8}>
                <Ionicons name="remove" size={16} color="#64748b" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.zoomResetButton} onPress={onZoomReset} activeOpacity={0.8}>
                <Text style={styles.zoomText}>{Math.round(currentZoom * 100)}%</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.zoomButton} onPress={onZoomIn} activeOpacity={0.8}>
                <Ionicons name="add" size={16} color="#64748b" />
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  toolbarWrapper: {
    backgroundColor: "#F8FAFC",
    borderRadius: 8,
    marginBottom: 8,
    marginTop: 8,
    shadowColor: "#000",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    zIndex: 100,
    elevation: 5,
  },
  container: {
    width: "100%",
    minWidth: 0,
    backgroundColor: "transparent",
    borderRadius: 0,
    borderWidth: 0,
    elevation: 0,
    height: 36,
  },
  contentContainer: {
    flexDirection: "row",
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 8,
    gap: 6,
  },
  section: {
    alignItems: "center",
    minWidth: 44,
    justifyContent: "center",
  },
  toolsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  actionsRow: {
    flexDirection: "row",
    gap: 6,
  },
  actionButton: {
    alignItems: "center",
    justifyContent: "center",
    padding: 4,
    borderRadius: 6,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#EEF2FF",
    width: 26,
    height: 26,
  },
  disabledButton: {
    backgroundColor: "#f1f3f4",
    opacity: 0.6,
  },
  zoomSection: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  zoomButton: {
    width: 30,
    height: 30,
    borderRadius: 14,
    backgroundColor: "#F8FAFC",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#EEF2FF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  toolButton: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#EEF2FF',
    width: 30,
    height: 30,
  },
  toolButtonActive: {
    backgroundColor: '#EDE9FE',
    borderColor: '#C4B5FD',
  },
  vitalsRow: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
  vitalChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#EEF2FF',
  },
  clickableChip: {
    // visual feedback handled via activeOpacity
  },
  colorDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  vitalText: {
    fontSize: 10,
    color: '#374151',
    fontFamily: 'Inter-Medium',
  },
  zoomResetButton: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: "#F8FAFC",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#EEF2FF",
    minWidth: 48,
  },
  zoomText: {
    fontSize: 10,
    fontWeight: "600",
    color: "#64748b",
    fontFamily: "Inter-SemiBold",
  },
  // Mode button styles
  modeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#EEF2FF',
    height: 28,
  },
  modeButtonInactive: {
    backgroundColor: '#F3F4F6',
  },
  modeButtonText: {
    fontSize: 10,
    color: '#374151',
    fontFamily: 'Inter-Medium',
  },
  // Dropdown modal styles
  dropdownOverlay: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  dropdownMenu: {
    position: 'absolute',
    width: 180,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 12,
    paddingVertical: 6,
  },
  dropdownCaret: {
    position: 'absolute',
    top: -6,
    left: 16,
    width: 10,
    height: 10,
    backgroundColor: '#FFFFFF',
    borderLeftWidth: 1,
    borderTopWidth: 1,
    borderColor: '#E5E7EB',
    transform: [{ rotate: '45deg' }],
  },
  dropdownHeader: {
    fontSize: 10,
    color: '#6B7280',
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  dropdownItemActive: {
    backgroundColor: '#F8FAFC',
  },
  dropdownItemText: {
    fontSize: 12,
    color: '#374151',
    fontFamily: 'Inter-Medium',
  },
  colorsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    paddingHorizontal: 4,
    paddingVertical: 6,
  },
  colorSwatch: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  colorSwatchSelected: {
    borderColor: '#6A009C',
    borderWidth: 2,
  },
  widthsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 4,
    paddingVertical: 6,
  },
  widthChip: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#F8FAFC',
  },
  widthChipActive: {
    borderColor: '#C4B5FD',
    backgroundColor: '#EDE9FE',
  },
  widthChipText: {
    fontSize: 10,
    color: '#374151',
    fontFamily: 'Inter-Medium',
  },
  widthChipTextActive: {
    color: '#6A009C',
    fontFamily: 'Inter-SemiBold',
  },
  // Single dropdown button styles
  dropdownButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#EEF2FF',
    height: 30,
  },
  dropdownButtonActive: {
    backgroundColor: '#EDE9FE',
    borderColor: '#C4B5FD',
  },
  dropdownButtonText: {
    fontSize: 10,
    color: '#374151',
    fontFamily: 'Inter-SemiBold',
  },
});

export default PDFToolbar;
