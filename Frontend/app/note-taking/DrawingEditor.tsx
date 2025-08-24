import React, { useState, useCallback, useEffect } from "react";
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
  ScrollView,
} from "react-native";
import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_URL, API_ENDPOINTS } from "@/constants/ApiConfig";
import DrawingCanvas, { Stroke, DrawingTool } from "./components/DrawingCanvas";
import DrawingToolbar from "./components/DrawingToolbar";
import { useDrawingState } from "./hooks/useDrawingState";
import { DrawingStroke, drawingAPI } from "./services/drawingAPI";
import { TemplateType } from "./components/TemplateOverlay";
import {
  getTemplateOptions,
  getTemplateBackgroundColor,
} from "./utils/templateConfig";

interface Folder {
  id: string;
  name: string;
  color: string;
  icon: string;
}

interface DrawingEditorProps {
  initialDrawingData?: any;
  noteId?: number;
  onSave?: (drawingData: any) => void;
  onBack?: () => void;
  readOnly?: boolean;
  title?: string;
  onAddToNotes?: (drawingData: any, title: string) => void;
  navigation?: any;
  route?: {
    params?: {
      noteId?: string;
      initialDrawingData?: {
        id: string;
        title: string;
        strokes: any[];
        template?: string;
        createdAt?: string;
        updatedAt?: string;
        drawing_data?: any;
        folderId?: string | number;
        folder_id?: string | number; // Also support snake_case version
        folderName?: string;
      };
      readOnly?: boolean;
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
  noteId,
}) => {
  // Get setup parameters from route
  const setupParams = route?.params?.initialSetup;
  const initialTitle = setupParams?.title || title;
  const selectedTemplate = (setupParams?.template as TemplateType) || "blank";
  
  // Get initial drawing data from route params (for navigation) or props (for direct usage)
  const routeInitialDrawingData = route?.params?.initialDrawingData;
  const routeNoteId = route?.params?.noteId;
  const effectiveInitialDrawingData = routeInitialDrawingData || initialDrawingData;
  const effectiveNoteId = routeNoteId || noteId;
  
  console.log('DrawingEditor: Route params:', {
    hasInitialDrawingData: !!effectiveInitialDrawingData,
    hasRouteData: !!routeInitialDrawingData,
    hasPropData: !!initialDrawingData,
    noteId: effectiveNoteId,
    routeNoteId,
    propNoteId: noteId
  });

  const {
    strokes,
    isLoading,
    isSaving,
    hasUnsavedChanges,
    currentNoteId,
    addStroke,
    clearDrawing,
    saveDrawing,
    undoLastStroke,
    undo,
    redo,
    canUndo,
    canRedo,
    importDrawing,
    exportDrawing,
    clear,
    setNoteId,
  } = useDrawingState({ 
    noteId: effectiveNoteId?.toString(), 
    defaultTitle: initialTitle,
    skipInitialLoad: !!effectiveInitialDrawingData // Skip initial load if we have initial data
  });

  const [currentStroke, setCurrentStroke] = useState<Stroke | null>(null);
  const [drawingTitle, setDrawingTitle] = useState(initialTitle);
  const [editingTitle, setEditingTitle] = useState(false);
  const [activeTemplate, setActiveTemplate] =
    useState<TemplateType>(selectedTemplate);

  // Folder selection states
  const [folders, setFolders] = useState<Folder[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [folderName, setFolderName] = useState("Unorganized Notes");
  const [showFolderModal, setShowFolderModal] = useState(false);

  // Exit confirmation modal state
  const [showExitConfirmModal, setShowExitConfirmModal] = useState(false);

  // Drawing state
  const [currentTool, setCurrentTool] = useState<DrawingTool>('pen');
  const [currentColor, setCurrentColor] = useState('#000000');
  const [currentWidth, setCurrentWidth] = useState(2);

  const handleStrokeComplete = useCallback((stroke: Stroke) => {
    const drawingStroke: DrawingStroke = {
      id: stroke.id,
      points: stroke.points.flatMap(p => [p.x, p.y]),
      color: stroke.color,
      width: stroke.width,
      tool: stroke.tool,
      timestamp: Date.now(),
      opacity: stroke.opacity || 1,
    };
    
    addStroke(drawingStroke);
  }, [addStroke]);

  // Fetch folders for folder selection
  const fetchFolders = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem("authToken");
      if (!token) return;

      const response = await fetch(`${API_URL}${API_ENDPOINTS.NOTE_FOLDERS}`, {
        method: "GET",
        headers: {
          Authorization: `Token ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) return;

      const data = await response.json();
      const fetchedFolders: Folder[] = data.map((folder: any) => ({
        id: folder.id.toString(),
        name: folder.name,
        color: folder.color || "#667EEA",
        icon: folder.icon || "folder",
      }));

      setFolders(fetchedFolders);

      // Update folder name if we have a selected folder ID (from initial data)
      if (selectedFolderId) {
        const selectedFolder = fetchedFolders.find(
          f => f.id === selectedFolderId
        );
        if (selectedFolder) {
          console.log('DrawingEditor: Updating folder name from fetched data:', selectedFolder.name);
          setFolderName(selectedFolder.name);
        }
      }
    } catch (error) {
      console.error("Error fetching folders:", error);
    }
  }, [selectedFolderId]);

  const handleFolderSelect = (folder: Folder | null) => {
    if (folder) {
      setSelectedFolderId(folder.id);
      setFolderName(folder.name);
    } else {
      setSelectedFolderId(null);
      setFolderName("Unorganized Notes");
    }
    setShowFolderModal(false);
  };

  // Auto-save drawing when strokes change or when created
  const autoSave = useCallback(async () => {
    console.log('AutoSave triggered with:', {
      effectiveNoteId,
      currentNoteId,
      setupParams: !!setupParams,
      strokesCount: strokes.length,
      drawingTitle
    });

    try {
      // Only create a new drawing if we don't have a noteId yet and we're in setup mode
      if (!effectiveNoteId && !currentNoteId && setupParams) {
        console.log('Creating new drawing note...');
        // Create initial blank drawing when component mounts from setup
        try {
          const result = await drawingAPI.createDrawingNote(
            drawingTitle || "Untitled Drawing", 
            strokes, // Use current strokes (could be empty or have data)
            selectedFolderId
          );
          console.log('Created new drawing note:', result.noteId);
          // Set the note ID in the useDrawingState hook
          setNoteId(result.noteId);
        } catch (createError) {
          console.error('Failed to create drawing note:', createError);
        }
      } else if (currentNoteId || effectiveNoteId) {
        // Auto-save existing drawing
        console.log('Auto-saving existing drawing with noteId:', currentNoteId || effectiveNoteId);
        console.log('Strokes to save:', strokes.length);
        
        if (strokes.length > 0) {
          console.log('Calling saveDrawing...');
          await saveDrawing({ 
            type: "drawing",
            title: drawingTitle,
            template: activeTemplate,
            folderId: selectedFolderId
          });
          console.log('SaveDrawing completed');
        } else {
          console.log('No strokes to save, skipping...');
        }
      } else {
        console.log('No conditions met for auto-save');
      }
    } catch (error) {
      console.error("Auto-save error:", error);
    }
  }, [strokes, drawingTitle, selectedFolderId, activeTemplate, currentNoteId, effectiveNoteId, setupParams, saveDrawing, setNoteId]);

  // Fetch folders on mount
  useEffect(() => {
    fetchFolders();
  }, [fetchFolders]);

  // Create initial blank drawing when setupParams exist and we don't have a noteId
  useEffect(() => {
    console.log('Setup effect triggered:', {
      hasSetupParams: !!setupParams,
      effectiveNoteId,
      currentNoteId
    });
    if (setupParams && !effectiveNoteId && !currentNoteId) {
      console.log('Triggering autoSave for setup...');
      autoSave();
    }
  }, [setupParams, effectiveNoteId, currentNoteId, autoSave]);

  // Auto-save when strokes change (with debounce) - only if we have a noteId
  useEffect(() => {
    console.log('Strokes change effect triggered:', {
      strokesCount: strokes.length,
      hasCurrentNoteId: !!currentNoteId,
      hasEffectiveNoteId: !!effectiveNoteId,
      shouldTriggerAutoSave: strokes.length > 0 && (currentNoteId || effectiveNoteId)
    });
    
    if (strokes.length > 0 && (currentNoteId || effectiveNoteId)) {
      console.log('Setting up auto-save timeout...');
      const timeoutId = setTimeout(() => {
        console.log('Auto-save timeout triggered');
        autoSave();
      }, 1000); // 1 second debounce

      return () => {
        console.log('Clearing auto-save timeout');
        clearTimeout(timeoutId);
      };
    }
  }, [strokes, currentNoteId, effectiveNoteId, autoSave]);

  // If toolbar dropdown opens, we don't need to hide anything since template is now in toolbar
  const handleToolbarDropdownToggle = (open: boolean) => {
    // Template selector is now part of the toolbar, so no special handling needed
  };

  // Initialize with provided data
  React.useEffect(() => {
    console.log('DrawingEditor: useEffect triggered with effectiveInitialDrawingData:', !!effectiveInitialDrawingData);
    
    if (effectiveInitialDrawingData) {
      console.log('DrawingEditor: Initializing with drawing data:', effectiveInitialDrawingData);
      console.log('DrawingEditor: Initial strokes count:', effectiveInitialDrawingData.strokes?.length || 0);
      console.log('DrawingEditor: About to call importDrawing with:', {
        hasStrokes: !!effectiveInitialDrawingData.strokes,
        strokesLength: effectiveInitialDrawingData.strokes?.length,
        dataKeys: Object.keys(effectiveInitialDrawingData)
      });
      
      // Import the drawing data
      importDrawing(effectiveInitialDrawingData);

      // Set the note ID if available
      if (effectiveInitialDrawingData.id && !currentNoteId) {
        console.log('DrawingEditor: Setting note ID from initial data:', effectiveInitialDrawingData.id);
        // Don't set currentNoteId here as it might cause a re-load that overwrites our imported data
      }

      // Restore template if available
      if (effectiveInitialDrawingData.template) {
        console.log('DrawingEditor: Setting template from initial data:', effectiveInitialDrawingData.template);
        setActiveTemplate(effectiveInitialDrawingData.template);
      }

      // Set the title from the drawing data
      if (effectiveInitialDrawingData.title) {
        console.log('DrawingEditor: Setting title from initial data:', effectiveInitialDrawingData.title);
        setDrawingTitle(effectiveInitialDrawingData.title);
      }

      // Set the folder from the drawing data if available
      if (effectiveInitialDrawingData.folderId) {
        console.log('DrawingEditor: Setting folder from initial data:', effectiveInitialDrawingData.folderId);
        setSelectedFolderId(effectiveInitialDrawingData.folderId.toString());
        // We'll update the folder name when folders are fetched
      } else if (effectiveInitialDrawingData.folder_id) {
        // Also check for snake_case version
        console.log('DrawingEditor: Setting folder from initial data (snake_case):', effectiveInitialDrawingData.folder_id);
        setSelectedFolderId(effectiveInitialDrawingData.folder_id.toString());
      }
    }
  }, [effectiveInitialDrawingData, importDrawing]);

  // Debug effect to monitor strokes
  React.useEffect(() => {
    console.log('DrawingEditor: Current strokes count:', strokes.length);
  }, [strokes]);

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
      console.log(
        `Canvas dimensions: ${setupParams.dimensions} (${setupParams.orientation})`
      );
    }
  }, [setupParams]);

  const handleManualSave = async () => {
    try {
      await saveDrawing();
    } catch (error) {
      // Show error toast
      console.error("Failed to save drawing:", error);
    }
  };

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

  const handleTemplateChange = (newTemplate: TemplateType) => {
    setActiveTemplate(newTemplate);
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
    // If there are strokes (drawing content) or unsaved changes, show confirmation dialog
    if (strokes.length > 0 || hasUnsavedChanges) {
      setShowExitConfirmModal(true);
    } else {
      // No content, go back directly
      if (onBack) {
        onBack();
      } else if (navigation && typeof navigation.goBack === "function") {
        navigation.goBack();
      }
    }
  };
  
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
                    {setupParams.dimensions} • {setupParams.template} •{" "}
                    {setupParams.orientation}
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
          <View style={styles.headerActions}>
            <Text style={styles.autoSaveIndicator}>Auto-saved</Text>
          </View>
        )}
      </View>

      {/* Folder Selection - positioned below header */}
      {!readOnly && (
        <View style={styles.folderSection}>
          <TouchableOpacity
            style={styles.folderSelector}
            onPress={() => setShowFolderModal(true)}
          >
            <MaterialIcons
              name="folder"
              size={18}
              color={selectedFolderId ? "#6A009C" : "#64748B"}
            />
            <Text
              style={[
                styles.folderName,
                { color: selectedFolderId ? "#6A009C" : "#64748B" },
              ]}
            >
              {folderName}
            </Text>
            <MaterialIcons
              name="chevron-right"
              size={18}
              color="#9CA3AF"
            />
          </TouchableOpacity>
        </View>
      )}

      {/* Toolbar just below header */}
      {!readOnly && (
        <View style={styles.toolbarContainer}>
          <DrawingToolbar
            currentTool={currentTool}
            currentColor={currentColor}
            currentWidth={currentWidth}
            currentTemplate={activeTemplate}
            onToolChange={setCurrentTool}
            onColorChange={setCurrentColor}
            onWidthChange={setCurrentWidth}
            onTemplateChange={handleTemplateChange}
            onUndo={undo}
            onRedo={redo}
            onClear={handleClear}
            onDropdownToggle={handleToolbarDropdownToggle}
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
          onAddStroke={addStroke}
          onStrokeUpdate={setCurrentStroke}
          disabled={readOnly}
          backgroundColor={getTemplateBackgroundColor(activeTemplate)}
          template={activeTemplate}
          templateOptions={getTemplateOptionsForCanvas()}
        />
      </View>

      {/* Folder Selection Modal */}
      <Modal
        visible={showFolderModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowFolderModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <MaterialIcons name="folder" size={28} color="#6A009C" />
              <Text style={[styles.modalTitle, { marginBottom: 0, marginLeft: 12 }]}>Select Folder</Text>
            </View>

            <ScrollView
              style={{ maxHeight: 400 }}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 10 }}
            >
              {/* Unorganized Notes Option */}
              <TouchableOpacity
                style={[
                  styles.folderItem,
                  !selectedFolderId && styles.selectedFolderItem,
                ]}
                onPress={() => handleFolderSelect(null)}
              >
                <View
                  style={[styles.folderIcon, { backgroundColor: "#64748B" }]}
                >
                  <MaterialIcons name="notes" size={20} color="#FFFFFF" />
                </View>
                <Text style={styles.folderItemName}>Unorganized Notes</Text>
                {!selectedFolderId && (
                  <MaterialIcons
                    name="check-circle"
                    size={22}
                    color="#6A009C"
                  />
                )}
              </TouchableOpacity>

              <View style={styles.folderDivider}>
                <View style={styles.folderDividerLine} />
                <Text style={styles.folderDividerText}>Folders</Text>
                <View style={styles.folderDividerLine} />
              </View>

              {/* Folder List */}
              {folders.map((folder) => (
                <TouchableOpacity
                  key={folder.id}
                  style={[
                    styles.folderItem,
                    selectedFolderId === folder.id &&
                      styles.selectedFolderItem,
                  ]}
                  onPress={() => handleFolderSelect(folder)}
                >
                  <View
                    style={[
                      styles.folderIcon,
                      { backgroundColor: folder.color || "#6A009C" },
                    ]}
                  >
                    <MaterialIcons
                      name={folder.icon as any || "folder"}
                      size={20}
                      color="#FFFFFF"
                    />
                  </View>
                  <Text style={styles.folderItemName}>{folder.name}</Text>
                  {selectedFolderId === folder.id && (
                    <MaterialIcons
                      name="check-circle"
                      size={22}
                      color="#6A009C"
                    />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>

            <TouchableOpacity
              style={[
                styles.cancelButton,
                { marginTop: 20, alignSelf: "stretch" },
              ]}
              onPress={() => setShowFolderModal(false)}
            >
              <Text style={[styles.modalCancelText, { textAlign: "center" }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Exit Confirmation Modal */}
      <Modal
        visible={showExitConfirmModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowExitConfirmModal(false)}
      >
        <View style={styles.exitConfirmOverlay}>
          <View style={styles.exitConfirmModal}>
            <View style={styles.exitConfirmHeader}>
              <MaterialIcons name="exit-to-app" size={28} color="#FF6B6B" />
              <Text style={styles.exitConfirmTitle}>Exit Drawing Editor</Text>
            </View>
            
            <Text style={styles.exitConfirmMessage}>
              Are you sure you want to exit the drawing editor?{'\n'}
              Your changes have been saved automatically.
            </Text>
            
            <View style={styles.exitConfirmActions}>
              <TouchableOpacity
                style={[styles.exitConfirmButton, styles.exitConfirmCancelButton]}
                onPress={() => {
                  setShowExitConfirmModal(false);
                }}
              >
                <Text style={styles.exitConfirmCancelText}>Continue Drawing</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.exitConfirmButton, styles.exitConfirmExitButton]}
                onPress={() => {
                  setShowExitConfirmModal(false);
                  // Call the appropriate back handler
                  if (onBack) {
                    onBack();
                  } else if (navigation && typeof navigation.goBack === "function") {
                    navigation.goBack();
                  }
                }}
              >
                <Text style={styles.exitConfirmExitText}>Exit</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
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
  headerActions: {
    alignItems: "center",
  },
  autoSaveIndicator: {
    fontSize: 12,
    color: "#28a745",
    fontFamily: "Inter-Medium",
  },
  
  // Folder selection styles
  folderSection: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: "#f8f9fa",
    borderBottomWidth: 1,
    borderBottomColor: "#e9ecef",
  },
  folderSelector: {
    flexDirection: "row",
    alignItems: "center",
    padding: 8,
    backgroundColor: "#ffffff",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  folderName: {
    flex: 1,
    marginLeft: 8,
    fontSize: 14,
    fontFamily: "Inter-Medium",
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
  optionSubtext: {
    fontSize: 12,
    color: "#666",
    marginTop: 2,
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

  // Modal styles
  modalContent: {
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
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
  },
  modalCancelText: {
    color: "#dc3545",
    fontSize: 16,
    fontWeight: "600",
  },

  // Folder modal styles
  folderItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginVertical: 2,
  },
  selectedFolderItem: {
    backgroundColor: "#f0f9ff",
    borderWidth: 1,
    borderColor: "#bfdbfe",
  },
  folderIcon: {
    width: 32,
    height: 32,
    borderRadius: 6,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  folderItemName: {
    flex: 1,
    fontSize: 16,
    fontWeight: "500",
    color: "#1f2937",
  },
  folderDivider: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 16,
  },
  folderDividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "#e5e7eb",
  },
  folderDividerText: {
    marginHorizontal: 12,
    fontSize: 12,
    fontWeight: "500",
    color: "#6b7280",
    textTransform: "uppercase",
  },

  // Exit Confirmation Modal Styles
  exitConfirmOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  exitConfirmModal: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 24,
    width: "100%",
    maxWidth: 340,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 10,
  },
  exitConfirmHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  exitConfirmTitle: {
    fontSize: 20,
    fontFamily: "Inter-Bold",
    color: "#1F2937",
    marginLeft: 12,
  },
  exitConfirmMessage: {
    fontSize: 16,
    fontFamily: "Inter-Regular",
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 24,
    marginBottom: 24,
  },
  exitConfirmActions: {
    flexDirection: "row",
    gap: 12,
  },
  exitConfirmButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  exitConfirmCancelButton: {
    backgroundColor: "#F3F4F6",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  exitConfirmExitButton: {
    backgroundColor: "#EF4444",
  },
  exitConfirmCancelText: {
    fontSize: 15,
    fontFamily: "Inter-Medium",
    color: "#374151",
  },
  exitConfirmExitText: {
    fontSize: 15,
    fontFamily: "Inter-Medium",
    color: "#FFFFFF",
  },
});

export default DrawingEditor;
