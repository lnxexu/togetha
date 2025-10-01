import React, { useState } from "react";
import {
  View,
  TouchableOpacity,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
  Pressable,
} from "react-native";
import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import TemplatePreview from './TemplatePreview';
import { TemplateType } from './TemplateOverlay';
import { TEMPLATE_CONFIGS } from '../utils/templateConfig';
import { DrawingTool } from './DrawingCanvas';

interface ImprovedDrawingToolbarProps {
  currentTool: DrawingTool;
  currentColor: string;
  currentWidth: number;
  currentTemplate?: TemplateType;
  currentZoom?: number;
  onToolChange: (tool: DrawingTool) => void;
  onColorChange: (color: string) => void;
  onWidthChange: (width: number) => void;
  onTemplateChange?: (template: TemplateType) => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onClear?: () => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onZoomReset?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
}

const COLORS = [
  { name: "Black", value: "#000000" },
  { name: "Red", value: "#FF0000" },
  { name: "Blue", value: "#0000FF" },
  { name: "Green", value: "#00AA00" },
  { name: "Yellow", value: "#FFDD00" },
  { name: "Orange", value: "#FF8800" },
  { name: "Purple", value: "#8800FF" },
  { name: "Pink", value: "#FF00AA" },
  { name: "Cyan", value: "#00FFFF" },
  { name: "Brown", value: "#8B4513" },
  { name: "Gray", value: "#808080" },
  { name: "Dark Blue", value: "#000080" },
  { name: "Dark Green", value: "#006400" },
  { name: "Maroon", value: "#800000" },
  { name: "Navy", value: "#191970" },
];

const WIDTHS = [
  { label: "Extra Fine", value: 1 },
  { label: "Fine", value: 2 },
  { label: "Medium", value: 4 },
  { label: "Bold", value: 6 },
  { label: "Extra Bold", value: 8 },
  { label: "Thick", value: 12 },
  { label: "Extra Thick", value: 16 },
  { label: "Jumbo", value: 20 },
  { label: "Super Jumbo", value: 24 },
];

const TOOLS = [
  { name: "pen", icon: "create-outline", label: "Pen" },
  { name: "pencil", icon: "pencil-outline", label: "Pencil" },
  { name: "brush", icon: "brush-outline", label: "Brush" },
  { name: "highlighter", icon: "color-fill-outline", label: "Highlighter" },
  { name: "calligraphy", icon: "text-outline", label: "Calligraphy" },
  { name: "eraser", icon: "remove-outline", label: "Eraser" },
] as const;

// Get template list from configuration
const TEMPLATE_TYPES: TemplateType[] = Object.keys(TEMPLATE_CONFIGS) as TemplateType[];

export const ImprovedDrawingToolbar: React.FC<ImprovedDrawingToolbarProps> = ({
  currentTool,
  currentColor,
  currentWidth,
  currentTemplate = 'blank',
  currentZoom = 1,
  onToolChange,
  onColorChange,
  onWidthChange,
  onTemplateChange,
  onUndo,
  onRedo,
  onClear,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  canUndo = false,
  canRedo = false,
}) => {
  const [showToolsModal, setShowToolsModal] = useState(false);
  const [showColorsModal, setShowColorsModal] = useState(false);
  const [showWidthsModal, setShowWidthsModal] = useState(false);
  const [showTemplatesModal, setShowTemplatesModal] = useState(false);
  
  // Find current width label
  const currentWidthOption = WIDTHS.find((w) => w.value === currentWidth) || WIDTHS[2];
  
  // Main toolbar buttons
  const renderMainToolbar = () => (
    <View style={styles.mainToolbar}>
      {/* Current tool button (opens tool selector) */}
      <TouchableOpacity 
        style={styles.mainButton} 
        onPress={() => setShowToolsModal(true)}
      >
        <Ionicons
          name={TOOLS.find((t) => t.name === currentTool)?.icon || "create-outline"}
          size={24}
          color="#333"
        />
      </TouchableOpacity>
      
      {/* Color selector button */}
      <TouchableOpacity 
        style={[styles.mainButton, styles.colorButton, { backgroundColor: currentColor }]} 
        onPress={() => setShowColorsModal(true)}
      />
      
      {/* Width selector button */}
      <TouchableOpacity 
        style={styles.mainButton} 
        onPress={() => setShowWidthsModal(true)}
      >
        <View style={[styles.widthIndicator, { height: Math.min(20, currentWidth) }]} />
      </TouchableOpacity>
      
      {/* Undo button */}
      <TouchableOpacity
        style={[styles.mainButton, !canUndo && styles.disabledButton]}
        onPress={onUndo}
        disabled={!canUndo}
      >
        <Ionicons name="arrow-undo" size={24} color={canUndo ? "#333" : "#ccc"} />
      </TouchableOpacity>
      
      {/* Redo button */}
      <TouchableOpacity
        style={[styles.mainButton, !canRedo && styles.disabledButton]}
        onPress={onRedo}
        disabled={!canRedo}
      >
        <Ionicons name="arrow-redo" size={24} color={canRedo ? "#333" : "#ccc"} />
      </TouchableOpacity>
      
      {/* More options button */}
      <TouchableOpacity style={styles.mainButton} onPress={() => setShowTemplatesModal(true)}>
        <Ionicons name="grid-outline" size={24} color="#333" />
      </TouchableOpacity>
    </View>
  );
  
  // Tool selector modal
  const renderToolsModal = () => (
    <Modal
      visible={showToolsModal}
      transparent={true}
      animationType="fade"
      onRequestClose={() => setShowToolsModal(false)}
    >
      <Pressable style={styles.modalOverlay} onPress={() => setShowToolsModal(false)}>
        <View style={styles.modalContainer} onStartShouldSetResponder={() => true}>
          <Text style={styles.modalTitle}>Select Tool</Text>
          <View style={styles.toolsGrid}>
            {TOOLS.map((tool) => (
              <TouchableOpacity
                key={tool.name}
                style={[
                  styles.toolButton,
                  currentTool === tool.name && styles.selectedToolButton,
                ]}
                onPress={() => {
                  onToolChange(tool.name as DrawingTool);
                  setShowToolsModal(false);
                }}
              >
                <Ionicons
                  name={tool.icon}
                  size={24}
                  color={currentTool === tool.name ? "#fff" : "#333"}
                />
                <Text
                  style={[
                    styles.toolLabel,
                    currentTool === tool.name && styles.selectedToolLabel,
                  ]}
                >
                  {tool.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Pressable>
    </Modal>
  );
  
  // Color selector modal
  const renderColorsModal = () => (
    <Modal
      visible={showColorsModal}
      transparent={true}
      animationType="fade"
      onRequestClose={() => setShowColorsModal(false)}
    >
      <Pressable style={styles.modalOverlay} onPress={() => setShowColorsModal(false)}>
        <View style={styles.modalContainer} onStartShouldSetResponder={() => true}>
          <Text style={styles.modalTitle}>Select Color</Text>
          <View style={styles.colorsGrid}>
            {COLORS.map((color) => (
              <TouchableOpacity
                key={color.value}
                style={[
                  styles.colorOption,
                  { backgroundColor: color.value },
                  currentColor === color.value && styles.selectedColorOption,
                ]}
                onPress={() => {
                  onColorChange(color.value);
                  setShowColorsModal(false);
                }}
              />
            ))}
          </View>
        </View>
      </Pressable>
    </Modal>
  );
  
  // Width selector modal
  const renderWidthsModal = () => (
    <Modal
      visible={showWidthsModal}
      transparent={true}
      animationType="fade"
      onRequestClose={() => setShowWidthsModal(false)}
    >
      <Pressable style={styles.modalOverlay} onPress={() => setShowWidthsModal(false)}>
        <View style={styles.modalContainer} onStartShouldSetResponder={() => true}>
          <Text style={styles.modalTitle}>Select Width</Text>
          <ScrollView contentContainerStyle={styles.widthsList}>
            {WIDTHS.map((width) => (
              <TouchableOpacity
                key={width.value}
                style={[
                  styles.widthOption,
                  currentWidth === width.value && styles.selectedWidthOption,
                ]}
                onPress={() => {
                  onWidthChange(width.value);
                  setShowWidthsModal(false);
                }}
              >
                <View
                  style={{
                    height: Math.min(20, width.value),
                    backgroundColor: "#333",
                    width: 100,
                    borderRadius: width.value / 2,
                  }}
                />
                <Text style={styles.widthLabel}>{width.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </Pressable>
    </Modal>
  );
  
  // Template selector modal
  const renderTemplatesModal = () => (
    <Modal
      visible={showTemplatesModal}
      transparent={true}
      animationType="fade"
      onRequestClose={() => setShowTemplatesModal(false)}
    >
      <Pressable style={styles.modalOverlay} onPress={() => setShowTemplatesModal(false)}>
        <View style={[styles.modalContainer, styles.templatesModalContainer]} onStartShouldSetResponder={() => true}>
          <Text style={styles.modalTitle}>More Options</Text>
          
          {/* Templates section */}
          <Text style={styles.sectionTitle}>Templates</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.templatesList}>
            {TEMPLATE_TYPES.map((templateType) => (
              <TouchableOpacity
                key={templateType}
                style={[
                  styles.templateOption,
                  currentTemplate === templateType && styles.selectedTemplateOption,
                ]}
                onPress={() => {
                  if (onTemplateChange) onTemplateChange(templateType);
                  setShowTemplatesModal(false);
                }}
              >
                <View style={styles.templatePreviewContainer}>
                  <TemplatePreview template={templateType} />
                </View>
                <Text style={styles.templateName}>{templateType.charAt(0).toUpperCase() + templateType.slice(1)}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          
          {/* Zoom controls */}
          <Text style={styles.sectionTitle}>Zoom</Text>
          <View style={styles.zoomControls}>
            <TouchableOpacity style={styles.zoomButton} onPress={onZoomOut}>
              <Ionicons name="remove" size={20} color="#333" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.zoomResetButton} onPress={onZoomReset}>
              <Text style={styles.zoomText}>{Math.round(currentZoom * 100)}%</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.zoomButton} onPress={onZoomIn}>
              <Ionicons name="add" size={20} color="#333" />
            </TouchableOpacity>
          </View>
          
          {/* Clear canvas button */}
          <TouchableOpacity
            style={styles.clearButton}
            onPress={() => {
              setShowTemplatesModal(false);
              if (onClear) {
                setTimeout(() => {
                  onClear();
                }, 300);
              }
            }}
          >
            <Ionicons name="trash-outline" size={20} color="#fff" />
            <Text style={styles.clearButtonText}>Clear Canvas</Text>
          </TouchableOpacity>
        </View>
      </Pressable>
    </Modal>
  );

  return (
    <View style={styles.container}>
      {renderMainToolbar()}
      {renderToolsModal()}
      {renderColorsModal()}
      {renderWidthsModal()}
      {renderTemplatesModal()}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: 20,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  mainToolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.9)",
    borderRadius: 24,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginHorizontal: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  mainButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: 8,
    backgroundColor: "#f5f5f5",
  },
  colorButton: {
    borderWidth: 2,
    borderColor: "#e0e0e0",
  },
  disabledButton: {
    opacity: 0.5,
  },
  widthIndicator: {
    width: 24,
    backgroundColor: "#333",
    borderRadius: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContainer: {
    backgroundColor: "white",
    borderRadius: 16,
    padding: 16,
    width: "80%",
    maxHeight: "80%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  templatesModalContainer: {
    width: "90%",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 16,
    textAlign: "center",
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginTop: 16,
    marginBottom: 8,
  },
  toolsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-around",
  },
  toolButton: {
    width: "30%",
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
    margin: 5,
    borderRadius: 8,
    backgroundColor: "#f5f5f5",
    padding: 8,
  },
  selectedToolButton: {
    backgroundColor: "#007AFF",
  },
  toolLabel: {
    marginTop: 4,
    fontSize: 12,
    color: "#333",
  },
  selectedToolLabel: {
    color: "#fff",
  },
  colorsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-around",
  },
  colorOption: {
    width: 40,
    height: 40,
    borderRadius: 20,
    margin: 8,
    borderWidth: 1,
    borderColor: "#e0e0e0",
  },
  selectedColorOption: {
    borderWidth: 3,
    borderColor: "#007AFF",
  },
  widthsList: {
    alignItems: "center",
  },
  widthOption: {
    width: "100%",
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 8,
    paddingHorizontal: 16,
  },
  selectedWidthOption: {
    backgroundColor: "#f0f0f0",
  },
  widthLabel: {
    marginLeft: 16,
    fontSize: 14,
    color: "#333",
  },
  templatesList: {
    flexGrow: 0,
    maxHeight: 160,
  },
  templateOption: {
    marginRight: 12,
    alignItems: "center",
    width: 100,
  },
  selectedTemplateOption: {
    backgroundColor: "#f0f0f0",
    borderRadius: 8,
  },
  templatePreviewContainer: {
    width: 80,
    height: 100,
    borderWidth: 1,
    borderColor: "#e0e0e0",
    borderRadius: 4,
    overflow: "hidden",
    backgroundColor: "#fff",
  },
  templateName: {
    marginTop: 4,
    fontSize: 12,
    color: "#333",
    textAlign: "center",
  },
  zoomControls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 8,
  },
  zoomButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f5f5f5",
    marginHorizontal: 8,
  },
  zoomResetButton: {
    paddingHorizontal: 12,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f5f5f5",
  },
  zoomText: {
    fontSize: 14,
    color: "#333",
  },
  clearButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ff3b30",
    borderRadius: 8,
    padding: 10,
    marginTop: 16,
  },
  clearButtonText: {
    color: "#fff",
    fontWeight: "600",
    marginLeft: 8,
  },
});

export default ImprovedDrawingToolbar;
