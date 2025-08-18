import React, { useState } from "react";
import {
  View,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  Alert,
  Text,
  TouchableOpacity,
  TextInput,
  Modal,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import DrawingCanvas, { Stroke } from "./components/DrawingCanvas";
import DrawingToolbar from "./components/DrawingToolbar";
import { useDrawingState } from "./hooks/useDrawingState";
import { TemplateType } from "./components/TemplateOverlay";
import { getTemplateOptions, getTemplateBackgroundColor } from "./utils/templateConfig";

interface DrawingEditorProps {
  initialDrawingData?: any;
  onSave?: (drawingData: any) => void;
  onBack?: () => void;
  readOnly?: boolean;
  title?: string;
  onAddToNotes?: (drawingData: any, title: string) => void;
  navigation?: any;
  route?: {
    params?: {
      initialSetup?: {
        title: string;
        size: string;
        orientation: string;
        template: string;
        dimensions: string;
      };
    };
  };
}

export const DrawingEditor: React.FC<DrawingEditorProps> = ({
  initialDrawingData,
  onSave,
  onBack,
  readOnly = false,
  title = "Drawing",
  onAddToNotes,
  navigation,
  route,
}) => {
  const {
    strokes,
    currentTool,
    currentColor,
    currentWidth,
    canUndo,
    canRedo,
    handleStrokeComplete,
    undo,
    redo,
    clear,
    changeTool,
    changeColor,
    changeWidth,
    exportDrawing,
    importDrawing,
  } = useDrawingState();

  // Get setup parameters from route
  const setupParams = route?.params?.initialSetup;
  const initialTitle = setupParams?.title || title;
  const selectedTemplate = (setupParams?.template as TemplateType) || 'blank';

  const [currentStroke, setCurrentStroke] = useState<Stroke | null>(null);
  const [drawingTitle, setDrawingTitle] = useState(initialTitle);
  const [editingTitle, setEditingTitle] = useState(false);
  const [showSaveOptions, setShowSaveOptions] = useState(false);
  const [activeTemplate, setActiveTemplate] = useState<TemplateType>(selectedTemplate);

  // If toolbar dropdown opens, we don't need to hide anything since template is now in toolbar
  const handleToolbarDropdownToggle = (open: boolean) => {
    // Template selector is now part of the toolbar, so no special handling needed
  };

  // Initialize with provided data
  React.useEffect(() => {
    if (initialDrawingData) {
      importDrawing(initialDrawingData);
      
      // Restore template if available
      if (initialDrawingData.template) {
        setActiveTemplate(initialDrawingData.template);
      }
    }
  }, [initialDrawingData, importDrawing]);

  // Apply template and setup configurations
  React.useEffect(() => {
    if (setupParams?.template && setupParams.template !== "blank") {
      // Set the active template
      setActiveTemplate(setupParams.template as TemplateType);
      
      // Apply template-specific configurations
      switch (setupParams.template) {
        case "grid":
          console.log("Applied grid template");
          break;
        case "lines":
          console.log("Applied lined paper template");
          break;
        case "dots":
          console.log("Applied dot grid template");
          break;
        case "sketch":
          console.log("Applied sketch pad template");
          break;
        case "notes":
          console.log("Applied note taking template");
          break;
        default:
          break;
      }
    }

    // Apply size and orientation (for future canvas size adjustments)
    if (setupParams?.dimensions) {
      console.log(`Canvas dimensions: ${setupParams.dimensions} (${setupParams.orientation})`);
    }
  }, [setupParams]);

  const handleClear = () => {
    Alert.alert(
      "Clear Drawing",
      "Are you sure you want to clear the entire drawing? This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Clear", style: "destructive", onPress: clear },
      ]
    );
  };

  const handleSave = () => {
    if (onSave) {
      const drawingData = exportDrawing();
      onSave({ 
        ...drawingData, 
        title: drawingTitle,
        template: activeTemplate,
        templateOptions: getTemplateOptionsForCanvas(),
      });
    }
  };

  const handleAddToNotes = () => {
    if (onAddToNotes) {
      const drawingData = exportDrawing();
      onAddToNotes({
        ...drawingData,
        template: activeTemplate,
        templateOptions: getTemplateOptionsForCanvas(),
      }, drawingTitle);
      Alert.alert("Success", "Drawing added to notes successfully!");
    }
  };

  const handleTemplateChange = (newTemplate: TemplateType) => {
    setActiveTemplate(newTemplate);
    // Optional: Show confirmation if user has drawn something
    if (strokes.length > 0) {
      Alert.alert(
        "Template Changed",
        `Template changed to ${newTemplate}. Your drawing remains unchanged.`,
        [{ text: "OK" }]
      );
    }
  };

  const handleSaveTitle = (newTitle: string) => {
    setDrawingTitle(newTitle);
    setEditingTitle(false);
  };

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else if (navigation && typeof navigation.goBack === "function") {
      navigation.goBack();
    }
  };

  // Get template-specific options
  const getTemplateOptionsForCanvas = () => {
    return getTemplateOptions(activeTemplate);
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerButton} onPress={handleBack}>
          <Ionicons name="chevron-back" size={24} color="#333" />
        </TouchableOpacity>

        <View style={styles.titleContainer}>
          {editingTitle && !readOnly ? (
            <TextInput
              style={styles.titleInputInline}
              value={drawingTitle}
              onChangeText={setDrawingTitle}
              onBlur={() => setEditingTitle(false)}
              onSubmitEditing={() => setEditingTitle(false)}
              placeholder="Enter drawing title"
              maxLength={50}
              autoFocus
              returnKeyType="done"
            />
          ) : (
            <TouchableOpacity
              style={{ flexDirection: "row", alignItems: "center" }}
              onPress={() => !readOnly && setEditingTitle(true)}
              activeOpacity={readOnly ? 1 : 0.7}
            >
              <View style={{ alignItems: "center" }}>
                <Text style={styles.headerTitle}>{drawingTitle}</Text>
                {setupParams && (
                  <Text style={styles.setupInfo}>
                    {setupParams.dimensions} • {setupParams.template} • {setupParams.orientation}
                  </Text>
                )}
              </View>
              {!readOnly && (
                <Ionicons
                  name="pencil"
                  size={20}
                  color="#666"
                  style={styles.editIcon}
                />
              )}
            </TouchableOpacity>
          )}
        </View>

        {!readOnly && (
          <TouchableOpacity
            style={styles.headerButton}
            onPress={() => setShowSaveOptions(true)}
          >
            <Ionicons name="ellipsis-vertical" size={24} color="#333" />
          </TouchableOpacity>
        )}
      </View>

      {/* Toolbar just below header */}
      {!readOnly && (
  <View style={styles.toolbarContainer}>
    <DrawingToolbar
      currentTool={currentTool}
      currentColor={currentColor}
      currentWidth={currentWidth}
      currentTemplate={activeTemplate}
      onToolChange={changeTool}
      onColorChange={changeColor}
      onWidthChange={changeWidth}
      onTemplateChange={handleTemplateChange}
      onDropdownToggle={handleToolbarDropdownToggle}
      onUndo={undo}
      onRedo={redo}
      onClear={handleClear}
      onImageImport={(imageUri) => {
        console.log("Image imported:", imageUri);
        Alert.alert("Image Added", "Photo has been added to the canvas!");
      }}
      canUndo={canUndo}
      canRedo={canRedo}
    />
  </View>
)}

      <View style={styles.canvasContainer}>
        <DrawingCanvas
          strokes={strokes}
          currentTool={currentTool}
          currentColor={currentColor}
          currentWidth={currentWidth}
          onStrokeComplete={handleStrokeComplete}
          onStrokeUpdate={setCurrentStroke}
          disabled={readOnly}
          backgroundColor={getTemplateBackgroundColor(activeTemplate)}
          template={activeTemplate}
          templateOptions={getTemplateOptionsForCanvas()}
        />
      </View>


      {/* Save Options Modal */}
      <Modal
        visible={showSaveOptions}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowSaveOptions(false)}
      >
        <SaveOptionsModal
          onSave={() => {
            setShowSaveOptions(false);
            handleSave();
          }}
          onAddToNotes={() => {
            setShowSaveOptions(false);
            handleAddToNotes();
          }}
          onCancel={() => setShowSaveOptions(false)}
          hasOnSave={!!onSave}
          hasOnAddToNotes={!!onAddToNotes}
        />
      </Modal>
    </SafeAreaView>
  );
};

// Title Editor Component
const TitleEditor: React.FC<{
  initialTitle: string;
  onSave: (title: string) => void;
  onCancel: () => void;
}> = ({ initialTitle, onSave, onCancel }) => {
  const [title, setTitle] = useState(initialTitle);

  return (
    <View style={styles.modalOverlay}>
      <View style={styles.titleEditorModal}>
        <Text style={styles.modalTitle}>Edit Title</Text>
        <TextInput
          style={styles.titleInput}
          value={title}
          onChangeText={setTitle}
          placeholder="Enter drawing title"
          maxLength={50}
          autoFocus
        />
        <View style={styles.modalButtons}>
          <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.saveButton}
            onPress={() => onSave(title)}
          >
            <Text style={styles.saveButtonText}>Save</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

// Save Options Modal Component
const SaveOptionsModal: React.FC<{
  onSave: () => void;
  onAddToNotes: () => void;
  onCancel: () => void;
  hasOnSave: boolean;
  hasOnAddToNotes: boolean;
}> = ({ onSave, onAddToNotes, onCancel, hasOnSave, hasOnAddToNotes }) => {
  return (
    <View style={styles.modalOverlay}>
      <View style={styles.saveOptionsModal}>
        <Text style={styles.modalTitle}>Save Options</Text>

        {hasOnSave && (
          <TouchableOpacity style={styles.optionButton} onPress={onSave}>
            <Ionicons name="save-outline" size={24} color="#007bff" />
            <Text style={styles.optionText}>Save Drawing</Text>
          </TouchableOpacity>
        )}

        {hasOnAddToNotes && (
          <TouchableOpacity style={styles.optionButton} onPress={onAddToNotes}>
            <Ionicons name="document-text-outline" size={24} color="#28a745" />
            <Text style={styles.optionText}>Add to Notes</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity style={styles.cancelOption} onPress={onCancel}>
          <Text style={styles.cancelOptionText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: StatusBar.currentHeight || 40,
    backgroundColor: "#fff",
    overflow: "visible",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#f8f9fa",
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  headerButton: {
    padding: 8,
    width: 40,
    alignItems: "center",
  },

  titleContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  titleInputInline: {
    borderWidth: 1,
    borderColor: "#e9ecef",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 18,
    fontFamily: "Inter-Medium",
    color: "#333",
    backgroundColor: "#f8f9fa",
    minWidth: 100,
    maxWidth: 220,
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: "Inter-Medium",
    color: "#333",
    textAlign: "center",
    marginRight: 4,
  },
  setupInfo: {
    fontSize: 12,
    fontFamily: "Inter-Regular",
    color: "#666",
    textAlign: "center",
    marginTop: 2,
  },
  editIcon: {
    marginLeft: 4,
  },

  toolbarContainer: {
    borderBottomWidth: 1,
    borderBottomColor: "#e9ecef",
    backgroundColor: "#fafbfc",
    zIndex: 100, // Higher than canvas
  },
  
  canvasContainer: {
    flex: 1,
    backgroundColor: "#ffffff",
    position: "relative",
    borderRadius: 8,
    margin: 8,
    elevation: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    zIndex: 1, // Lowest priority
  },

  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  titleEditorModal: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 24,
    width: "90%",
    maxWidth: 400,
    elevation: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
  },
  saveOptionsModal: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 24,
    width: "90%",
    maxWidth: 300,
    elevation: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: "#333",
    marginBottom: 20,
    textAlign: "center",
  },
  titleInput: {
    borderWidth: 2,
    borderColor: "#e9ecef",
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 20,
    backgroundColor: "#f8f9fa",
  },
  modalButtons: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#dc3545",
    alignItems: "center",
  },
  cancelButtonText: {
    color: "#dc3545",
    fontSize: 16,
    fontWeight: "600",
  },
  saveButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    backgroundColor: "#007bff",
    alignItems: "center",
  },
  saveButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },
  optionButton: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 8,
    backgroundColor: "#f8f9fa",
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#e9ecef",
  },
  optionText: {
    fontSize: 16,
    fontWeight: "500",
    color: "#333",
    marginLeft: 12,
  },
  cancelOption: {
    padding: 16,
    alignItems: "center",
    marginTop: 8,
  },
  cancelOptionText: {
    fontSize: 16,
    color: "#666",
    fontWeight: "500",
  },
});

export default DrawingEditor;
