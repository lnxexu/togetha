import React, { useState } from "react";
import {
  View,
  TouchableOpacity,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from 'expo-image-picker';
import TemplatePreview from './TemplatePreview';
import { TemplateType } from './TemplateOverlay';
import { TEMPLATE_CONFIGS, getTemplateConfig } from '../utils/templateConfig';

export type DrawingTool =
  | "pen"
  | "highlighter"
  | "eraser"
  | "brush"
  | "pencil"
  | "marker"
  | "calligraphy";

interface DrawingToolbarProps {
  currentTool: DrawingTool;
  currentColor: string;
  currentWidth: number;
  currentTemplate?: TemplateType;
  onToolChange: (tool: DrawingTool) => void;
  onColorChange: (color: string) => void;
  onWidthChange: (width: number) => void;
  onTemplateChange?: (template: TemplateType) => void;
  onDropdownToggle?: (open: boolean) => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onClear?: () => void;
  onImageImport?: (imageUri: string) => void;
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
  { name: "marker", icon: "color-filter-outline", label: "Marker" },
  { name: "highlighter", icon: "color-fill-outline", label: "Highlighter" },
  { name: "calligraphy", icon: "text-outline", label: "Calligraphy" },
  { name: "eraser", icon: "ellipse-outline", label: "Eraser" },
] as const;

// Get template list from configuration
const TEMPLATE_TYPES: TemplateType[] = Object.keys(TEMPLATE_CONFIGS) as TemplateType[];

export const DrawingToolbar: React.FC<DrawingToolbarProps> = ({
  currentTool,
  currentColor,
  currentWidth,
  currentTemplate = 'blank',
  onToolChange,
  onColorChange,
  onWidthChange,
  onTemplateChange,
  onDropdownToggle,
  onUndo,
  onRedo,
  onClear,
  onImageImport,
  canUndo = false,
  canRedo = false,
}) => {
  // Use a single state to track which dropdown is open
  const [activeDropdown, setActiveDropdown] = useState<"color" | "width" | "image" | "template" | null>(null);
  
  // Helper functions to check which dropdown is active
  const showColorPicker = activeDropdown === "color";
  const showWidthPicker = activeDropdown === "width";
  const showImageOptions = activeDropdown === "image";
  const showTemplateSelector = activeDropdown === "template";

  // notify parent when dropdown open state changes (used to hide template selector)
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

  const requestPermissions = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Permission Required',
        'Sorry, we need camera roll permissions to make this work!'
      );
      return false;
    }
    return true;
  };

  const pickImageFromGallery = async () => {
    const hasPermission = await requestPermissions();
    if (!hasPermission) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      onImageImport?.(result.assets[0].uri);
      setActiveDropdown(null);
    }
  };

  const takePhotoWithCamera = async () => {
    const cameraPermission = await ImagePicker.requestCameraPermissionsAsync();
    if (cameraPermission.status !== 'granted') {
      Alert.alert(
        'Permission Required',
        'Sorry, we need camera permissions to take photos!'
      );
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      onImageImport?.(result.assets[0].uri);
      setActiveDropdown(null);
    }
  };

  return (
    <View style={styles.toolbarWrapper}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.container}
        contentContainerStyle={styles.contentContainer}
      >
        {/* Tools Section */}
        <View style={styles.section}>
          <View style={styles.toolsRow}>
            {TOOLS.map((tool) => {
              const isActive = currentTool === tool.name;
              return (
                <TouchableOpacity
                  key={tool.name}
                  style={isActive ? styles.activeToolButton : undefined}
                  onPress={() => onToolChange(tool.name as DrawingTool)}
                >
                  <Ionicons
                    name={tool.icon as any}
                    size={isActive ? 32 : 22}
                    color={isActive ? "#8B5CF6" : "#333"}
                    style={isActive ? styles.activeToolIcon : styles.toolIcon}
                  />
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Template Section */}
        {onTemplateChange && (
          <View style={styles.section}>
            <View style={styles.templateSection}>
              <TouchableOpacity
                style={[
                  styles.dropdown,
                  showTemplateSelector && styles.dropdownActive
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
                    size={16}
                  />
                </View>
                <View style={styles.labelContainer}>
                  <Text style={[
                    styles.dropdownLabel,
                    showTemplateSelector && { color: '#FFFFFF' }
                  ]}>{getCurrentTemplateName()}</Text>
                  <Ionicons 
                    name={showTemplateSelector ? "chevron-up" : "chevron-down"} 
                    size={12} 
                    color={showTemplateSelector ? "#FFFFFF" : "#666"}
                  />
                </View>
              </TouchableOpacity>

              {/* Template Selector Dropdown */}
              {/* Moved to popout container below */}
            </View>
          </View>
        )}

        {/* Color Section */}
        <View style={styles.section}>
          <View style={styles.colorSection}>
            <TouchableOpacity
              style={[
                styles.dropdown,
                showColorPicker && styles.dropdownActive
              ]}
              onPress={() => {
                setActiveDropdown(showColorPicker ? null : "color");
              }}
              activeOpacity={0.7}
              hitSlop={{ top: 5, bottom: 5, left: 5, right: 5 }}
            >
              <View
                style={[styles.colorIndicator, { backgroundColor: currentColor }]}
              />
              <View style={styles.labelContainer}>
                <Text style={[
                  styles.dropdownLabel,
                  showColorPicker && { color: '#FFFFFF' }
                ]}>{getCurrentColorName()}</Text>
                <Ionicons 
                  name={showColorPicker ? "chevron-up" : "chevron-down"} 
                  size={12} 
                  color={showColorPicker ? "#FFFFFF" : "#666"}
                />
              </View>
            </TouchableOpacity>

            {/* Color Picker Dropdown */}
            {/* Moved to popout container below */}
          </View>
        </View>

        {/* Brush Size Section */}
        <View style={styles.section}>
          <View style={styles.widthSection}>
            <TouchableOpacity
              style={[
                styles.dropdown,
                showWidthPicker && styles.dropdownActive
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
                <Text style={[
                  styles.dropdownLabel,
                  showWidthPicker && { color: '#FFFFFF' }
                ]}>{getCurrentWidthLabel()}</Text>
                <Ionicons 
                  name={showWidthPicker ? "chevron-up" : "chevron-down"} 
                  size={12} 
                  color={showWidthPicker ? "#FFFFFF" : "#666"}
                />
              </View>
            </TouchableOpacity>

            {/* Width Picker Dropdown */}
            {/* Moved to popout container below */}
          </View>
        </View>

        {/* Image Import Section */}
        <View style={styles.section}>
          <View style={styles.imageSection}>
            <TouchableOpacity
              style={[
                styles.dropdown,
                showImageOptions && styles.dropdownActive
              ]}
              onPress={() => {
                setActiveDropdown(showImageOptions ? null : "image");
              }}
              activeOpacity={0.7}
              hitSlop={{ top: 5, bottom: 5, left: 5, right: 5 }}
            >
              <Ionicons 
                name="image-outline" 
                size={16} 
                color={showImageOptions ? "#FFFFFF" : "#333"}
              />
              <View style={styles.labelContainer}>
                <Text style={[
                  styles.dropdownLabel,
                  showImageOptions && { color: '#FFFFFF' }
                ]}>Import</Text>
                <Ionicons 
                  name={showImageOptions ? "chevron-up" : "chevron-down"} 
                  size={12} 
                  color={showImageOptions ? "#FFFFFF" : "#666"}
                />
              </View>
            </TouchableOpacity>

            {/* Image Options Dropdown */}
            {/* Moved to popout container below */}
          </View>
        </View>

        {/* Actions Section */}
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
      </ScrollView>
      
      {/* Popout containers below the toolbar */}
      <View style={styles.popoutContainer}>
        {/* Color Picker Popout */}
        {showColorPicker && (
          <View style={styles.colorDropdown}>
            <View style={styles.colorGrid}>
              {COLORS.map((color) => (
                <TouchableOpacity
                  key={color.value}
                  style={[
                    styles.colorCard,
                    currentColor === color.value && styles.selectedColorCard
                  ]}
                  onPress={() => {
                    onColorChange(color.value);
                    setActiveDropdown(null);
                  }}
                  activeOpacity={0.7}
                  hitSlop={{ top: 5, bottom: 5, left: 5, right: 5 }}
                >
                  <View style={[
                    styles.colorCardPreview,
                    { backgroundColor: color.value },
                    currentColor === color.value && styles.selectedColorPreview
                  ]} />
                  <Text style={[
                    styles.colorCardName,
                    currentColor === color.value && styles.selectedColorText
                  ]}>
                    {color.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Width Picker Popout */}
        {showWidthPicker && (
          <View style={styles.widthDropdown}>
            <View style={styles.widthGrid}>
              {WIDTHS.map((width) => (
                <TouchableOpacity
                  key={width.value}
                  style={[
                    styles.widthCard,
                    currentWidth === width.value && styles.selectedWidthCard
                  ]}
                  onPress={() => {
                    onWidthChange(width.value);
                    setActiveDropdown(null);
                  }}
                  activeOpacity={0.7}
                  hitSlop={{ top: 5, bottom: 5, left: 5, right: 5 }}
                >
                  <View style={[
                    styles.widthCardPreview,
                    {
                      width: Math.min(width.value + 8, 24),
                      height: Math.min(width.value + 8, 24),
                      backgroundColor: currentColor,
                    },
                    currentWidth === width.value && styles.selectedWidthPreview
                  ]} />
                  <Text style={[
                    styles.widthCardLabel,
                    currentWidth === width.value && styles.selectedWidthText
                  ]}>
                    {width.label}
                  </Text>
                  <Text style={[
                    styles.widthCardValue,
                    currentWidth === width.value && styles.selectedWidthValueText
                  ]}>
                    {width.value}px
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Template Selector Popout */}
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
                      currentTemplate === templateType && styles.selectedTemplateCard
                    ]}
                    onPress={() => {
                      onTemplateChange(templateType);
                      setActiveDropdown(null);
                    }}
                    activeOpacity={0.7}
                    hitSlop={{ top: 5, bottom: 5, left: 5, right: 5 }}
                  >
                    <View style={[
                      styles.templateCardIcon,
                      currentTemplate === templateType && styles.selectedTemplateIcon
                    ]}>
                      <TemplatePreview 
                        template={templateType} 
                        size={28}
                      />
                    </View>
                    <Text style={[
                      styles.templateCardName,
                      currentTemplate === templateType && styles.selectedTemplateText
                    ]}>
                      {config.name}
                    </Text>
                    <Text style={[
                      styles.templateCardDescription,
                      currentTemplate === templateType && styles.selectedTemplateDescText
                    ]}>
                      {config.description.length > 25 ? 
                        config.description.substring(0, 25) + '...' : 
                        config.description
                      }
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {/* Image Options Popout */}
        {showImageOptions && (
          <View style={styles.imageDropdown}>
            <View style={styles.imageGrid}>
              <TouchableOpacity
                style={styles.imageCard}
                onPress={pickImageFromGallery}
                activeOpacity={0.7}
                hitSlop={{ top: 5, bottom: 5, left: 5, right: 5 }}
              >
                <View style={styles.imageCardIcon}>
                  <Ionicons name="images-outline" size={20} color="#6A009C" />
                </View>
                <Text style={styles.imageCardText}>Gallery</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={styles.imageCard}
                onPress={takePhotoWithCamera}
                activeOpacity={0.7}
                hitSlop={{ top: 5, bottom: 5, left: 5, right: 5 }}
              >
                <View style={styles.imageCardIcon}>
                  <Ionicons name="camera-outline" size={20} color="#28a745" />
                </View>
                <Text style={styles.imageCardText}>Camera</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  toolbarWrapper: {
    backgroundColor: "#ffffffff",
    borderRadius: 0,
    borderWidth: 0,
    shadowColor: "transparent",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
    zIndex: 100,
  },
  
  container: {
    width: '100%',
    minWidth: 360,
    backgroundColor: "#ffffffff",
    borderRadius: 0,
    borderWidth: 0,
    shadowColor: "transparent",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },

  popoutContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: "#fafbfc",
    alignItems: 'center',
  },

  contentContainer: {
    flexDirection: 'row',
    flexGrow: 1,
    alignItems: "flex-start",
    justifyContent: "flex-start",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 16,
  },

  section: {
    alignItems: "center",
    minWidth: 80,
    justifyContent: "center",
  },

  // Tools Section
  toolsRow: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  toolIcon: {
  },
  activeToolIcon: {
    // Optionally add a little shadow or scale for effect
  },
  activeToolButton: {
    // Optionally add a little padding for touch area, but no background/border
    borderRadius: 20,
  },

  toolButton: {
    alignItems: "center",
    justifyContent: "center",
    padding: 8,
    borderRadius: 10,
    backgroundColor: "rgba(248, 249, 250, 0.8)",
    borderWidth: 2,
    borderColor: "rgba(222, 226, 230, 0.8)",
    width: 40,
    height: 40,
  },

  selectedToolButton: {
    backgroundColor: "#007bff",
    borderColor: "#007bff",
  },

  // Section Styles
  colorSection: {
    alignItems: 'center',
  },

  widthSection: {
    alignItems: 'center',
  },

  imageSection: {
    alignItems: 'center',
  },

  templateSection: {
    alignItems: 'center',
  },

  // Dropdown Styles
  dropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 1,
    elevation: 1,
    gap: 6,
    minWidth: 80,
  },

  dropdownActive: {
    backgroundColor: '#6A009C',
    borderColor: '#6A009C',
    shadowColor: '#6A009C',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 2,
  },

  labelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    justifyContent: 'space-between',
  },

  dropdownLabel: {
    fontSize: 11,
    fontFamily: 'Inter-Medium',
    color: '#374151',
  },

  // Color Dropdown Styles
  colorIndicator: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },

  // Template Dropdown Styles
  templateIndicator: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },

  colorDropdown: {
    marginTop: 8,
    width: 300,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 6,
    padding: 10,
  },

  // Width Dropdown Styles
  sizeIndicator: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#374151',
  },

  widthDropdown: {
    marginTop: 8,
    width: 300,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 6,
    padding: 10,
  },

  // Image Dropdown Styles
  imageDropdown: {
    marginTop: 8,
    width: 180,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 6,
    padding: 10,
  },

  // Template Dropdown Styles
  templateDropdown: {
    marginTop: 8,
    width: 300,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 6,
    padding: 10,
  },

  // Actions Section
  actionsRow: {
    flexDirection: "row",
    gap: 6,
  },

  actionButton: {
    alignItems: "center",
    justifyContent: "center",
    padding: 8,
    borderRadius: 8,
    backgroundColor: "rgba(248, 249, 250, 0.8)",
    borderWidth: 1,
    borderColor: "rgba(222, 226, 230, 0.8)",
    width: 36,
    height: 36,
  },

  disabledButton: {
    backgroundColor: "#f1f3f4",
    opacity: 0.6,
  },

  // New Card-based Styles (Template-like)
  sectionTitle: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    color: '#374151',
    marginBottom: 8,
    textAlign: 'center',
  },

  // Color Card Styles
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    gap: 5,
  },
  colorCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 8,
    width: 60,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  selectedColorCard: {
    backgroundColor: '#6A009C',
    borderColor: '#6A009C',
    shadowColor: '#6A009C',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 4,
  },
  colorCardPreview: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#E5E7EB',
    marginBottom: 6,
  },
  selectedColorPreview: {
    borderColor: '#FFFFFF',
    borderWidth: 3,
  },
  colorCardName: {
    fontSize: 10,
    fontFamily: 'Inter-Medium',
    color: '#374151',
    textAlign: 'center',
  },
  selectedColorText: {
    color: '#FFFFFF',
  },

  // Width Card Styles
  widthGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    gap: 5,
  },
  widthCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 8,
    width: 65,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  selectedWidthCard: {
    backgroundColor: '#6A009C',
    borderColor: '#6A009C',
    shadowColor: '#6A009C',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 4,
  },
  widthCardPreview: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 6,
  },
  selectedWidthPreview: {
    borderColor: '#FFFFFF',
    borderWidth: 2,
  },
  widthCardLabel: {
    fontSize: 10,
    fontFamily: 'Inter-Medium',
    color: '#374151',
    textAlign: 'center',
    marginBottom: 2,
  },
  selectedWidthText: {
    color: '#FFFFFF',
  },
  widthCardValue: {
    fontSize: 9,
    fontFamily: 'Inter-Regular',
    color: '#6B7280',
    textAlign: 'center',
  },
  selectedWidthValueText: {
    color: '#E5E7EB',
  },

  // Image Card Styles
  imageGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    gap: 8,
  },
  imageCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    width: 70,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  imageCardIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  imageCardText: {
    fontSize: 10,
    fontFamily: 'Inter-Medium',
    color: '#374151',
    textAlign: 'center',
  },

  // Template Card Styles (matching original TemplateSelector styles)
  templateGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    gap: 8,
  },
  templateCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 10,
    width: 85,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  selectedTemplateCard: {
    backgroundColor: '#6A009C',
    borderColor: '#6A009C',
    shadowColor: '#6A009C',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 4,
  },
  templateCardIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
    overflow: 'hidden',
  },
  selectedTemplateIcon: {
    backgroundColor: '#6A009C',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  templateCardName: {
    fontSize: 11,
    fontFamily: 'Inter-Medium',
    color: '#374151',
    textAlign: 'center',
    marginBottom: 2,
  },
  selectedTemplateText: {
    color: '#FFFFFF',
  },
  templateCardDescription: {
    fontSize: 9,
    fontFamily: 'Inter-Regular',
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 12,
  },
  selectedTemplateDescText: {
    color: '#E5E7EB',
  },
});

export default DrawingToolbar;