import React, { useState } from "react";
import {
  View,
  TouchableOpacity,
  Text,
  StyleSheet,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import TemplatePreview from "./TemplatePreview";
import { TemplateType } from "./TemplateOverlay";
import { TEMPLATE_CONFIGS, getTemplateConfig } from "../utils/templateConfig";
import { DrawingTool } from "./DrawingCanvas";

interface DrawingToolbarProps {
  currentTool: DrawingTool;
  currentColor: string;
  currentWidth: number;
  currentTemplate?: TemplateType;
  currentZoom?: number;
  compact?: boolean;
  onToolChange: (tool: DrawingTool) => void;
  onColorChange: (color: string) => void;
  onWidthChange: (width: number) => void;
  onTemplateChange?: (template: TemplateType) => void;
  onDropdownToggle?: (open: boolean) => void;
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

const TEMPLATE_TYPES: TemplateType[] = Object.keys(
  TEMPLATE_CONFIGS
) as TemplateType[];

export const DrawingToolbar: React.FC<DrawingToolbarProps> = ({
  currentTool,
  currentColor,
  currentWidth,
  currentTemplate = "blank",
  currentZoom = 1,
  compact = false,
  onToolChange,
  onColorChange,
  onWidthChange,
  onTemplateChange,
  onDropdownToggle,
  onUndo,
  onRedo,
  onClear,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  canUndo = false,
  canRedo = false,
}) => {
  const [activeDropdown, setActiveDropdown] = useState<
    "tools" | "color" | "width" | "template" | null
  >(null);
  const showToolSelector = activeDropdown === "tools";
  const showColorPicker = activeDropdown === "color";
  const showWidthPicker = activeDropdown === "width";
  const showTemplateSelector = activeDropdown === "template";

  React.useEffect(() => {
    onDropdownToggle?.(activeDropdown !== null);
  }, [activeDropdown, onDropdownToggle]);

  const getCurrentColorName = () => {
    const color = COLORS.find((c) => c.value === currentColor);
    return color ? color.name : "Custom";
  };

  const getCurrentWidthLabel = () => {
    const width = WIDTHS.find((w) => w.value === currentWidth);
    return width ? width.label : `${currentWidth}px`;
  };

  const getCurrentTemplateName = () => {
    const config = getTemplateConfig(currentTemplate);
    return config.name;
  };

  const getCurrentToolInfo = () => {
    const tool = TOOLS.find((t) => t.name === currentTool);
    return tool || TOOLS[0];
  };

  return (
    <View
      style={[
        styles.toolbarWrapper,
        compact && {
          marginTop: 0,
          marginBottom: 0,
          borderWidth: 0,
          backgroundColor: "transparent",
          elevation: 0,
          shadowColor: "transparent",
        },
      ]}
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.container}
        contentContainerStyle={[
          styles.contentContainer,
          compact && { paddingHorizontal: 0, paddingVertical: 0 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.section}>
          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={[styles.actionButton, !canUndo && styles.disabledButton]}
              onPress={onUndo}
              disabled={!canUndo}
            >
              <Ionicons
                name="arrow-undo"
                size={18}
                color={canUndo ? "#333" : "#ccc"}
              />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionButton, !canRedo && styles.disabledButton]}
              onPress={onRedo}
              disabled={!canRedo}
            >
              <Ionicons
                name="arrow-redo"
                size={18}
                color={canRedo ? "#333" : "#ccc"}
              />
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionButton} onPress={onClear}>
              <Ionicons name="trash" size={18} color="#ff4444" />
            </TouchableOpacity>
          </View>
        </View>
        <View style={styles.section}>
          <View style={styles.toolsSection}>
            <TouchableOpacity
              style={[
                styles.dropdown,
                showToolSelector && styles.dropdownActive,
              ]}
              onPress={() => {
                setActiveDropdown(showToolSelector ? null : "tools");
              }}
              activeOpacity={0.7}
              hitSlop={{ top: 5, bottom: 5, left: 5, right: 5 }}
            >
              <View style={styles.toolIndicator}>
                <Ionicons
                  name={getCurrentToolInfo().icon as any}
                  size={16}
                  color={showToolSelector ? "#FFFFFF" : "#333"}
                />
              </View>
              <View style={styles.labelContainer}>
                <Text
                  style={[
                    styles.dropdownLabel,
                    showToolSelector && { color: "#FFFFFF" },
                  ]}
                >
                  {getCurrentToolInfo().label}
                </Text>
                <Ionicons
                  name={showToolSelector ? "chevron-up" : "chevron-down"}
                  size={12}
                  color={showToolSelector ? "#FFFFFF" : "#666"}
                />
              </View>
            </TouchableOpacity>
          </View>
        </View>

        {onTemplateChange && (
          <View style={styles.section}>
            <View style={styles.templateSection}>
              <TouchableOpacity
                style={[
                  styles.dropdown,
                  showTemplateSelector && styles.dropdownActive,
                ]}
                onPress={() => {
                  setActiveDropdown(showTemplateSelector ? null : "template");
                }}
                activeOpacity={0.7}
                hitSlop={{ top: 5, bottom: 5, left: 5, right: 5 }}
              >
                <View style={styles.templateIndicator}>
                  <TemplatePreview
                    template={currentTemplate}
                    width={16}
                    height={16}
                  />
                </View>
                <View style={styles.labelContainer}>
                  <Text
                    style={[
                      styles.dropdownLabel,
                      showTemplateSelector && { color: "#FFFFFF" },
                    ]}
                  >
                    {getCurrentTemplateName()}
                  </Text>
                  <Ionicons
                    name={showTemplateSelector ? "chevron-up" : "chevron-down"}
                    size={12}
                    color={showTemplateSelector ? "#FFFFFF" : "#666"}
                  />
                </View>
              </TouchableOpacity>
            </View>
          </View>
        )}

        <View style={styles.section}>
          <View style={styles.colorSection}>
            <TouchableOpacity
              style={[
                styles.dropdown,
                showColorPicker && styles.dropdownActive,
              ]}
              onPress={() => {
                setActiveDropdown(showColorPicker ? null : "color");
              }}
              activeOpacity={0.7}
              hitSlop={{ top: 5, bottom: 5, left: 5, right: 5 }}
            >
              <View
                style={[
                  styles.colorIndicator,
                  { backgroundColor: currentColor },
                ]}
              />
              <View style={styles.labelContainer}>
                <Text
                  style={[
                    styles.dropdownLabel,
                    showColorPicker && { color: "#FFFFFF" },
                  ]}
                >
                  {getCurrentColorName()}
                </Text>
                <Ionicons
                  name={showColorPicker ? "chevron-up" : "chevron-down"}
                  size={12}
                  color={showColorPicker ? "#FFFFFF" : "#666"}
                />
              </View>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.widthSection}>
            <TouchableOpacity
              style={[
                styles.dropdown,
                showWidthPicker && styles.dropdownActive,
              ]}
              onPress={() => {
                setActiveDropdown(showWidthPicker ? null : "width");
              }}
              activeOpacity={0.7}
              hitSlop={{ top: 5, bottom: 5, left: 5, right: 5 }}
            >
              <View
                style={[
                  styles.sizeIndicator,
                  {
                    width: Math.min(currentWidth + 4, 16),
                    height: Math.min(currentWidth + 4, 16),
                    backgroundColor: currentColor,
                  },
                ]}
              />
              <View style={styles.labelContainer}>
                <Text
                  style={[
                    styles.dropdownLabel,
                    showWidthPicker && { color: "#FFFFFF" },
                  ]}
                >
                  {getCurrentWidthLabel()}
                </Text>
                <Ionicons
                  name={showWidthPicker ? "chevron-up" : "chevron-down"}
                  size={12}
                  color={showWidthPicker ? "#FFFFFF" : "#666"}
                />
              </View>
            </TouchableOpacity>
          </View>
        </View>

        {(onZoomIn || onZoomOut || onZoomReset) && (
          <View style={styles.section}>
            <View style={styles.zoomSection}>
              <TouchableOpacity
                style={styles.zoomButton}
                onPress={onZoomOut}
                activeOpacity={0.8}
              >
                <Ionicons name="remove" size={16} color="#64748b" />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.zoomResetButton}
                onPress={onZoomReset}
                activeOpacity={0.8}
              >
                <Text style={styles.zoomText}>
                  {Math.round(currentZoom * 100)}%
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.zoomButton}
                onPress={onZoomIn}
                activeOpacity={0.8}
              >
                <Ionicons name="add" size={16} color="#64748b" />
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>

      <View
        style={[
          styles.popoutContainer,
          compact && { top: 36, paddingHorizontal: 0, paddingBottom: 0 },
        ]}
      >
        {showToolSelector && (
          <View style={styles.toolsDropdown}>
            <View style={styles.toolsGrid}>
              {TOOLS.map((tool) => (
                <TouchableOpacity
                  key={tool.name}
                  style={[
                    styles.toolCard,
                    currentTool === tool.name && styles.selectedToolCard,
                  ]}
                  onPress={() => {
                    onToolChange(tool.name as DrawingTool);
                    setActiveDropdown(null);
                  }}
                  activeOpacity={0.7}
                  hitSlop={{ top: 5, bottom: 5, left: 5, right: 5 }}
                >
                  <View
                    style={[
                      styles.toolCardIcon,
                      currentTool === tool.name && styles.selectedToolIcon,
                    ]}
                  >
                    <Ionicons
                      name={tool.icon as any}
                      size={20}
                      color={currentTool === tool.name ? "#FFFFFF" : "#374151"}
                    />
                  </View>
                  <Text
                    style={[
                      styles.toolCardName,
                      currentTool === tool.name && styles.selectedToolText,
                    ]}
                  >
                    {tool.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {showColorPicker && (
          <View style={styles.colorDropdown}>
            <View style={styles.colorGrid}>
              {COLORS.map((color) => (
                <TouchableOpacity
                  key={color.value}
                  style={[
                    styles.colorCard,
                    currentColor === color.value && styles.selectedColorCard,
                  ]}
                  onPress={() => {
                    onColorChange(color.value);
                    setActiveDropdown(null);
                  }}
                  activeOpacity={0.7}
                  hitSlop={{ top: 5, bottom: 5, left: 5, right: 5 }}
                >
                  <View
                    style={[
                      styles.colorCardPreview,
                      { backgroundColor: color.value },
                      currentColor === color.value &&
                        styles.selectedColorPreview,
                    ]}
                  />
                  <Text
                    style={[
                      styles.colorCardName,
                      currentColor === color.value && styles.selectedColorText,
                    ]}
                  >
                    {color.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {showWidthPicker && (
          <View style={styles.widthDropdown}>
            <View style={styles.widthGrid}>
              {WIDTHS.map((width) => (
                <TouchableOpacity
                  key={width.value}
                  style={[
                    styles.widthCard,
                    currentWidth === width.value && styles.selectedWidthCard,
                  ]}
                  onPress={() => {
                    onWidthChange(width.value);
                    setActiveDropdown(null);
                  }}
                  activeOpacity={0.7}
                  hitSlop={{ top: 5, bottom: 5, left: 5, right: 5 }}
                >
                  <View
                    style={[
                      styles.widthCardPreview,
                      {
                        width: Math.min(width.value + 8, 24),
                        height: Math.min(width.value + 8, 24),
                        backgroundColor: currentColor,
                      },
                      currentWidth === width.value &&
                        styles.selectedWidthPreview,
                    ]}
                  />
                  <Text
                    style={[
                      styles.widthCardLabel,
                      currentWidth === width.value && styles.selectedWidthText,
                    ]}
                  >
                    {width.label}
                  </Text>
                  <Text
                    style={[
                      styles.widthCardValue,
                      currentWidth === width.value &&
                        styles.selectedWidthValueText,
                    ]}
                  >
                    {width.value}px
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {showTemplateSelector && onTemplateChange && (
          <View style={styles.templateDropdown}>
            <View style={styles.templateGrid}>
              {TEMPLATE_TYPES.map((templateType) => {
                const config = getTemplateConfig(templateType);
                return (
                  <TouchableOpacity
                    key={templateType}
                    style={[
                      styles.templateCard,
                      currentTemplate === templateType &&
                        styles.selectedTemplateCard,
                    ]}
                    onPress={() => {
                      onTemplateChange(templateType);
                      setActiveDropdown(null);
                    }}
                    activeOpacity={0.7}
                    hitSlop={{ top: 5, bottom: 5, left: 5, right: 5 }}
                  >
                    <View
                      style={[
                        styles.templateCardIcon,
                        currentTemplate === templateType &&
                          styles.selectedTemplateIcon,
                      ]}
                    >
                      <TemplatePreview
                        template={templateType}
                        width={28}
                        height={28}
                      />
                    </View>
                    <Text
                      style={[
                        styles.templateCardName,
                        currentTemplate === templateType &&
                          styles.selectedTemplateText,
                      ]}
                    >
                      {config.name}
                    </Text>
                    <Text
                      style={[
                        styles.templateCardDescription,
                        currentTemplate === templateType &&
                          styles.selectedTemplateDescText,
                      ]}
                    >
                      {config.description.length > 25
                        ? config.description.substring(0, 25) + "..."
                        : config.description}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}
      </View>
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
    height: 36, // Reduce height
  },

  popoutContainer: {
    position: "absolute",
    top: "100%",
    left: 0,
    right: 0,
    paddingHorizontal: 8,
    paddingBottom: 8,
    backgroundColor: "transparent",
    alignItems: "center",
    zIndex: 99999,
    elevation: 999,
    pointerEvents: "box-none", // Allow touch events to pass through to children
  },

  contentContainer: {
    flexDirection: "row",
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "flex-start",
    paddingHorizontal: 4,
    paddingVertical: 4,
    gap: 6, // Reduced gap between items
  },

  section: {
    alignItems: "center",
    minWidth: 44, // Reduce minimum width
    justifyContent: "center",
  },

  // Section Styles
  toolsSection: {
    alignItems: "center",
  },

  colorSection: {
    alignItems: "center",
  },

  widthSection: {
    alignItems: "center",
  },

  // imageSection removed

  templateSection: {
    alignItems: "center",
  },

  // Zoom Section
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

  // Dropdown Styles
  dropdown: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "transparent",
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderWidth: 0,
    gap: 4,
    minWidth: 56,
  },

  dropdownActive: {
    backgroundColor: "#6A009C",
    borderColor: "#6A009C",
    shadowColor: "#6A009C",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 2,
  },

  labelContainer: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    justifyContent: "space-between",
  },

  dropdownLabel: {
    fontSize: 11,
    fontFamily: "Inter-Medium",
    color: "#374151",
  },

  // Tool Dropdown Styles
  toolIndicator: {
    width: 14,
    height: 14,
    borderRadius: 8,
    backgroundColor: "#F3F4F6",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#EEF2FF",
  },

  // Color Dropdown Styles
  colorIndicator: {
    width: 14,
    height: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#EEF2FF",
  },

  // Template Dropdown Styles
  templateIndicator: {
    width: 14,
    height: 14,
    borderRadius: 8,
    backgroundColor: "#F3F4F6",
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#EEF2FF",
  },

  toolsDropdown: {
    width: 260,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#EEF2FF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 15,
    elevation: 999,
    padding: 8,
    pointerEvents: "auto",
  },

  colorDropdown: {
    width: 220,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#EEF2FF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 15,
    elevation: 999,
    padding: 8,
    pointerEvents: "auto",
  },

  // Width Dropdown Styles
  sizeIndicator: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#374151",
  },

  widthDropdown: {
    width: 220,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#EEF2FF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 15,
    elevation: 999,
    padding: 8,
    pointerEvents: "auto",
  },

  // Image Dropdown Styles removed

  // Template Dropdown Styles
  templateDropdown: {
    width: 240,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#EEF2FF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 15,
    elevation: 999,
    padding: 8,
    pointerEvents: "auto",
  },

  // Actions Section
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

  // New Card-based Styles (Template-like)
  sectionTitle: {
    fontSize: 14,
    fontFamily: "Inter-Medium",
    color: "#374151",
    marginBottom: 8,
    textAlign: "center",
  },

  // Color Card Styles
  colorGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-start",
    gap: 6,
  },
  colorCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    padding: 6,
    width: 52,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#EEF2FF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  selectedColorCard: {
    backgroundColor: "#6A009C",
    borderColor: "#6A009C",
    shadowColor: "#6A009C",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 4,
  },
  colorCardPreview: {
    width: 22,
    height: 22,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#EEF2FF",
    marginBottom: 6,
  },
  selectedColorPreview: {
    borderColor: "#FFFFFF",
    borderWidth: 3,
  },
  colorCardName: {
    fontSize: 10,
    fontFamily: "Inter-Medium",
    color: "#374151",
    textAlign: "center",
  },
  selectedColorText: {
    color: "#FFFFFF",
  },

  // Width Card Styles
  widthGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-start",
    gap: 6,
  },
  widthCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    padding: 6,
    width: 60,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#EEF2FF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  selectedWidthCard: {
    backgroundColor: "#6A009C",
    borderColor: "#6A009C",
    shadowColor: "#6A009C",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 4,
  },
  widthCardPreview: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    marginBottom: 6,
  },
  selectedWidthPreview: {
    borderColor: "#FFFFFF",
    borderWidth: 2,
  },
  widthCardLabel: {
    fontSize: 10,
    fontFamily: "Inter-Medium",
    color: "#374151",
    textAlign: "center",
    marginBottom: 2,
  },
  selectedWidthText: {
    color: "#FFFFFF",
  },
  widthCardValue: {
    fontSize: 9,
    fontFamily: "Inter-Regular",
    color: "#6B7280",
    textAlign: "center",
  },
  selectedWidthValueText: {
    color: "#E5E7EB",
  },

  // Image Card Styles removed

  // Template Card Styles (matching original TemplateSelector styles)
  templateGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-start",
    gap: 6,
  },
  templateCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    padding: 8,
    width: 72,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#EEF2FF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  selectedTemplateCard: {
    backgroundColor: "#6A009C",
    borderColor: "#6A009C",
    shadowColor: "#6A009C",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 4,
  },
  templateCardIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: "#F3F4F6",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 6,
    overflow: "hidden",
  },
  selectedTemplateIcon: {
    backgroundColor: "#6A009C",
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  templateCardName: {
    fontSize: 11,
    fontFamily: "Inter-Medium",
    color: "#374151",
    textAlign: "center",
    marginBottom: 2,
  },
  selectedTemplateText: {
    color: "#FFFFFF",
  },
  templateCardDescription: {
    fontSize: 9,
    fontFamily: "Inter-Regular",
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 12,
  },
  selectedTemplateDescText: {
    color: "#E5E7EB",
  },

  // Tool Card Styles
  toolsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-start",
    gap: 6,
  },
  toolCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    padding: 8,
    width: 68,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#EEF2FF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  selectedToolCard: {
    backgroundColor: "#6A009C",
    borderColor: "#6A009C",
    shadowColor: "#6A009C",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 4,
  },
  toolCardIcon: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: "#F3F4F6",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 6,
    borderWidth: 1,
    borderColor: "#EEF2FF",
  },
  selectedToolIcon: {
    backgroundColor: "#6A009C",
    borderColor: "#FFFFFF",
    borderWidth: 2,
  },
  toolCardName: {
    fontSize: 11,
    fontFamily: "Inter-Medium",
    color: "#374151",
    textAlign: "center",
  },
  selectedToolText: {
    color: "#FFFFFF",
  },
});

export default DrawingToolbar;
