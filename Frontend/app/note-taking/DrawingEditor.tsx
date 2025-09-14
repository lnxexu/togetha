import React, { useState, useCallback, useEffect, useRef } from "react";
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
  KeyboardAvoidingView,
  Platform,
  Dimensions,
  Vibration,
  Animated,
  PanResponder,
} from "react-native";
import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { API_URL, API_ENDPOINTS } from "@/constants/ApiConfig";
import { showSuccessToast, showErrorToast, showWarningToast } from "../utils/ToastUtils";
import DrawingCanvas, { Stroke, DrawingTool } from "./components/DrawingCanvas";
import DrawingToolbar from "./components/DrawingToolbar";
import { useDrawingState } from "./hooks/useDrawingState";
import { DrawingStroke, drawingAPI } from "./services/drawingAPI";
import { TemplateType } from "./components/TemplateOverlay";
import UnsavedChangesModal from "./components/UnsavedChangesModal";
import {
  getTemplateOptions,
  getTemplateBackgroundColor,
} from "./utils/templateConfig";
import { useNetworkStatus, getNetworkStatusText, getNetworkStatusColor } from "./services/networkService";

// Configuration: control whether visual thickness / font sizes scale with canvas zoom.
// When false, strokes remain visually stable (positions still follow zoom via coordinate conversion)
// preventing pen strokes, brushes, etc. from becoming thicker when zooming the canvas.
const SCALE_STROKES_WITH_ZOOM = false;

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
    eraseStrokes,
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
  
  // Unsaved changes modal state
  const [showUnsavedChangesModal, setShowUnsavedChangesModal] = useState(false);
  const [showFolderModal, setShowFolderModal] = useState(false);

  // Tags states
  const [tags, setTags] = useState<string[]>([]);
  const [showTagModal, setShowTagModal] = useState(false);
  const [newTag, setNewTag] = useState("");

  // Sync status state
  const [syncStatus, setSyncStatus] = useState<"saved" | "syncing" | "offline">(
    "saved"
  );

  // Network status monitoring
  const networkStatus = useNetworkStatus();
  const isOnline = networkStatus.isConnected && 
                  networkStatus.isInternetReachable && 
                  networkStatus.isServerReachable;

  // Exit confirmation modal state
  const [showExitConfirmModal, setShowExitConfirmModal] = useState(false);
  const [windowDimensions, setWindowDimensions] = useState(Dimensions.get('window'));
  
  // Scroll offset state for coordinate conversion
  const [scrollOffset, setScrollOffset] = useState({ x: 0, y: 0 });

  // Animation states
  const fadeAnim = useState(new Animated.Value(0))[0];
  const slideAnim = useState(new Animated.Value(-50))[0];

  // Drawing state
  const [currentTool, setCurrentTool] = useState<DrawingTool>('pen');
  const [currentColor, setCurrentColor] = useState('#000000');
  const [currentWidth, setCurrentWidth] = useState(2);
  const [currentZoom, setCurrentZoom] = useState(1); // Track canvas zoom level
  
  // Gesture handling refs
  const lastTapRef = useRef(0);
  const gestureStartZoomRef = useRef(1);
  const gestureStartDistanceRef = useRef(0);

  const isTablet = windowDimensions.width >= 768;
  const isSmallPhone = windowDimensions.width < 375;

  // Helper function to calculate distance between two touches
  const getDistance = (touches: any[]) => {
    if (touches.length < 2) return 0;
    const [touch1, touch2] = touches;
    const dx = touch1.pageX - touch2.pageX;
    const dy = touch1.pageY - touch2.pageY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  // Handle double tap to reset zoom
  const handleDoubleTap = () => {
    const now = Date.now();
    const timeSinceLastTap = now - lastTapRef.current;
    
    if (timeSinceLastTap < 300 && timeSinceLastTap > 0) {
      // Double tap detected - reset zoom to 1x
      setCurrentZoom(1);
    }
    
    lastTapRef.current = now;
  };

  // Zoom control functions
  const handleZoomIn = () => {
    const newZoom = Math.min(currentZoom * 1.25, 3); // Max zoom 3x
    setCurrentZoom(newZoom);
  };

  const handleZoomOut = () => {
    const newZoom = Math.max(currentZoom * 0.8, 0.5); // Min zoom 0.5x
    setCurrentZoom(newZoom);
  };

  const resetZoom = () => {
    setCurrentZoom(1);
  };

  // Create PanResponder for pinch-to-zoom gestures
  const panResponder = PanResponder.create({
    onMoveShouldSetPanResponder: (evt, gestureState) => {
      // Only handle multi-touch gestures (pinch-to-zoom)
      return evt.nativeEvent.touches.length === 2;
    },
    onMoveShouldSetPanResponderCapture: (evt, gestureState) => {
      // Only capture pinch gestures
      return evt.nativeEvent.touches.length === 2;
    },
    onPanResponderGrant: (evt, gestureState) => {
      if (evt.nativeEvent.touches.length === 2) {
        gestureStartZoomRef.current = currentZoom;
        gestureStartDistanceRef.current = getDistance(evt.nativeEvent.touches);
      }
    },
    onPanResponderMove: (evt, gestureState) => {
      if (evt.nativeEvent.touches.length === 2) {
        const currentDistance = getDistance(evt.nativeEvent.touches);
        const startDistance = gestureStartDistanceRef.current;
        
        if (startDistance > 0) {
          const scale = currentDistance / startDistance;
          const newZoom = Math.max(0.5, Math.min(3, gestureStartZoomRef.current * scale));
          setCurrentZoom(newZoom);
        }
      }
    },
    onPanResponderRelease: () => {
      // Reset gesture tracking
      gestureStartDistanceRef.current = 0;
    },
    onPanResponderTerminate: () => {
      // Reset gesture tracking
      gestureStartDistanceRef.current = 0;
    },
  });

  // Effects
  useEffect(() => {
    const subscription = Dimensions.addEventListener('change', ({ window }) => {
      setWindowDimensions(window);
    });

    // Animate entrance
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 600,
        useNativeDriver: true,
      }),
    ]).start();

    return () => subscription?.remove();
  }, []);

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
    
    if (stroke.tool === 'eraser') {
      // Use eraser functionality to remove intersecting strokes
      eraseStrokes(drawingStroke);
    } else {
      // Regular stroke, add to canvas
      addStroke(drawingStroke);
    }
  }, [addStroke, eraseStrokes]);

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
    // Add haptic feedback for better UX
    if (Platform.OS === 'ios') {
      Vibration.vibrate(10);
    }
    
    if (folder) {
      setSelectedFolderId(folder.id);
      setFolderName(folder.name);
      showSuccessToast(`Moved to folder "${folder.name}"`);
    } else {
      setSelectedFolderId(null);
      setFolderName("Unorganized Notes");
    }
    setShowFolderModal(false);
  };

  // Tag management functions
  const addTag = () => {
    if (newTag.trim() && !tags.includes(newTag.trim())) {
      setTags([...tags, newTag.trim()]);
      setNewTag("");
      setSyncStatus("syncing");
      // Auto-save with tags
      setTimeout(() => setSyncStatus("saved"), 1000);
    }
  };

  const removeTag = (tagToRemove: string) => {
    setTags(tags.filter(tag => tag !== tagToRemove));
    setSyncStatus("syncing");
    // Auto-save with tags
    setTimeout(() => setSyncStatus("saved"), 1000);
  };

  // Sync status functions
  const getSyncStatusIcon = () => {
    // If network is offline, always show offline status
    if (!isOnline) {
      return "cloud-off";
    }
    
    // Otherwise show actual sync status
    switch (syncStatus) {
      case "syncing":
        return "sync";
      default:
        return "cloud-done";
    }
  };

  const getSyncStatusColor = () => {
    // If network is offline, always show offline color
    if (!isOnline) {
      return "#FF9500"; // Orange for offline
    }
    
    // Otherwise show actual sync status color
    switch (syncStatus) {
      case "syncing":
        return "#007AFF"; // Blue for syncing
      default:
        return "#34C759"; // Green for saved
    }
  };

  const getSyncStatusText = () => {
    // If network is offline, always show network status
    if (!isOnline) {
      return getNetworkStatusText(networkStatus);
    }
    
    // Otherwise show actual sync status
    switch (syncStatus) {
      case "syncing":
        return "Saving...";
      default:
        return "Auto-saved";
    }
  };

  // Auto-save drawing when strokes change or when created
  const autoSave = useCallback(async () => {
    try {
      // Only create a new drawing if we don't have a noteId yet and we're in setup mode
      if (!effectiveNoteId && !currentNoteId && setupParams) {
        // Create initial blank drawing when component mounts from setup
        try {
          const result = await drawingAPI.createDrawingNote(
            drawingTitle || "Untitled Drawing", 
            strokes, // Use current strokes (could be empty or have data)
            selectedFolderId
          );
          // Set the note ID in the useDrawingState hook
          setNoteId(result.noteId);
        } catch (createError) {
          // Error handled silently during auto-save
        }
      } else if (currentNoteId || effectiveNoteId) {
        // Auto-save existing drawing
        if (strokes.length > 0) {
          await saveDrawing({ 
            type: "drawing",
            title: drawingTitle,
            template: activeTemplate,
            folderId: selectedFolderId
          });
        }
      }
    } catch (error) {
      // Silent auto-save error handling
    }
  }, [strokes, drawingTitle, selectedFolderId, activeTemplate, currentNoteId, effectiveNoteId, setupParams, saveDrawing, setNoteId]);

  // Fetch folders on mount
  useEffect(() => {
    fetchFolders();
  }, [fetchFolders]);

  // Create initial blank drawing when setupParams exist and we don't have a noteId
  useEffect(() => {
    if (setupParams && !effectiveNoteId && !currentNoteId) {
      autoSave();
    }
  }, [setupParams, effectiveNoteId, currentNoteId, autoSave]);

  // Auto-save when strokes change (with debounce) - only if we have a noteId
  useEffect(() => {
    if (strokes.length > 0 && (currentNoteId || effectiveNoteId)) {
      const timeoutId = setTimeout(() => {
        autoSave();
      }, 1000); // 1 second debounce

      return () => {
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
    if (effectiveInitialDrawingData) {
      // Import the drawing data
      importDrawing(effectiveInitialDrawingData);

      // Set the note ID if available
      if (effectiveInitialDrawingData.id && !currentNoteId) {
        // Don't set currentNoteId here as it might cause a re-load that overwrites our imported data
      }

      // Restore template if available
      if (effectiveInitialDrawingData.template) {
        setActiveTemplate(effectiveInitialDrawingData.template);
      }

      // Set the title from the drawing data
      if (effectiveInitialDrawingData.title) {
        setDrawingTitle(effectiveInitialDrawingData.title);
      }

      // Set the folder from the drawing data if available
      if (effectiveInitialDrawingData.folderId) {
        setSelectedFolderId(effectiveInitialDrawingData.folderId.toString());
        // Set folder name if available in the data
        if (effectiveInitialDrawingData.folderName) {
          setFolderName(effectiveInitialDrawingData.folderName);
        }
      } else if (effectiveInitialDrawingData.folder_id) {
        // Also check for snake_case version
        setSelectedFolderId(effectiveInitialDrawingData.folder_id.toString());
        // Set folder name if available in the data
        if (effectiveInitialDrawingData.folderName) {
          setFolderName(effectiveInitialDrawingData.folderName);
        }
      }
      
      // Additional check for folder object in the data
      if (effectiveInitialDrawingData.folder && typeof effectiveInitialDrawingData.folder === 'object') {
        setSelectedFolderId(effectiveInitialDrawingData.folder.id?.toString() || effectiveInitialDrawingData.folder);
        if (effectiveInitialDrawingData.folder.name) {
          setFolderName(effectiveInitialDrawingData.folder.name);
        }
      } else if (effectiveInitialDrawingData.folder && typeof effectiveInitialDrawingData.folder === 'string') {
        // If folder is just a folder name string
        setFolderName(effectiveInitialDrawingData.folder);
      }
    }
  }, [effectiveInitialDrawingData, importDrawing]);

  // Apply template and setup configurations
  React.useEffect(() => {
    if (setupParams?.template && setupParams.template !== "blank") {
      // Set the active template
      setActiveTemplate(setupParams.template as TemplateType);

      // Apply template-specific configurations
      switch (setupParams.template) {
        case "grid":
          break;
        case "lines":
          break;
        case "dots":
          break;
        case "sketch":
          break;
        case "notes":
          break;
        default:
          break;
      }
    }

    // Apply size and orientation (for future canvas size adjustments)
    if (setupParams?.dimensions) {
      // Canvas dimensions configuration
    }
  }, [setupParams]);

  const handleManualSave = async () => {
    try {
      await saveDrawing();
      showSuccessToast("Drawing saved successfully");
    } catch (error) {
      showErrorToast("Failed to save drawing. Please try again.");
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
    // If there are strokes (drawing content) or unsaved changes, show confirmation modal
    if (strokes.length > 0 || hasUnsavedChanges) {
      setShowUnsavedChangesModal(true);
    } else {
      // No changes to save, navigate back directly
      if (onBack) {
        onBack();
      } else if (navigation && typeof navigation.goBack === "function") {
        navigation.goBack();
      }
    }
  };

  // Modal handlers for unsaved changes
  const handleSaveAndExit = async () => {
    setShowUnsavedChangesModal(false);
    try {
      if (strokes.length > 0 || hasUnsavedChanges) {
        await saveDrawing();
        showSuccessToast("Drawing saved successfully");
      }
    } catch (error) {
      showErrorToast("Failed to save drawing");
      console.error('Error saving drawing:', error);
      return; // Don't navigate if save failed
    }
    
    // Navigate back after successful save
    if (onBack) {
      onBack();
    } else if (navigation && typeof navigation.goBack === "function") {
      navigation.goBack();
    }
  };

  const handleDiscardAndExit = () => {
    setShowUnsavedChangesModal(false);
    showWarningToast("Changes discarded");
    
    // Navigate back without saving
    if (onBack) {
      onBack();
    } else if (navigation && typeof navigation.goBack === "function") {
      navigation.goBack();
    }
  };

  const handleContinueEditing = () => {
    setShowUnsavedChangesModal(false);
  };
  
  const getTemplateOptionsForCanvas = () => {
    return getTemplateOptions(activeTemplate);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <Animated.View 
        style={[
          styles.rootContainer,
          {
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }],
          },
        ]}
      >
        {/* Header with LinearGradient positioned behind content */}
        <LinearGradient
          colors={["#8B5CF6", "#7C3AED"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.header}
        >
          <View style={styles.headerContent}>
            <View style={styles.headerTopRow}>
              <TouchableOpacity style={styles.backButton} onPress={handleBack}>
                <Ionicons name="chevron-back" size={24} color="#fff" />
              </TouchableOpacity>

              <View style={styles.headerTitleSection}>
                {editingTitle && !readOnly ? (
                  <TextInput
                    style={styles.modernTitleInput}
                    value={drawingTitle}
                    onChangeText={setDrawingTitle}
                    onBlur={() => setEditingTitle(false)}
                    onSubmitEditing={() => setEditingTitle(false)}
                    placeholder="Enter drawing title"
                    placeholderTextColor="rgba(255,255,255,0.6)"
                    maxLength={50}
                    autoFocus
                    returnKeyType="done"
                  />
                ) : (
                  <TouchableOpacity
                    style={styles.titleTouchable}
                    onPress={() => !readOnly && setEditingTitle(true)}
                    activeOpacity={readOnly ? 1 : 0.7}
                  >
                    <Text style={styles.headerTitle}>{drawingTitle}</Text>
                    {!readOnly && (
                      <MaterialIcons
                        name="edit"
                        size={16}
                        color="rgba(255,255,255,0.8)"
                        style={styles.editIcon}
                      />
                    )}
                  </TouchableOpacity>
                )}
                
                {/* Save Status under title */}
                <View style={styles.headerCenter}>
                  <View style={styles.headerSyncStatus}>
                    <MaterialIcons 
                      name={getSyncStatusIcon()} 
                      size={12} 
                      color="rgba(255,255,255,0.8)" 
                    />
                    <Text style={styles.headerSyncText}>{getSyncStatusText()}</Text>
                  </View>
                  {setupParams && (
                    <Text style={styles.setupInfo}>
                      {setupParams.dimensions} • {setupParams.template} • {setupParams.orientation}
                    </Text>
                  )}
                </View>
              </View>

              {!readOnly && (
                <View style={styles.headerActions}>
                  <TouchableOpacity
                    style={styles.saveButton}
                    onPress={handleManualSave}
                    disabled={isSaving}
                  >
                    <MaterialIcons
                      name={isSaving ? "sync" : "check"}
                      size={20}
                      color="#fff"
                    />
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>
        </LinearGradient>

        {/* Main Content Container positioned above header */}
        <View style={styles.mainContentContainer}>
          <ScrollView
            style={styles.mainScrollView}
            contentContainerStyle={styles.mainScrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            bounces={false}
          >
            {/* Compact header info */}
            {!readOnly && (
              <View style={styles.compactHeaderInfo}>
                {/* Compact metadata row */}
                <View style={styles.compactMetadata}>
                  <View style={styles.folderSection}>
                    <TouchableOpacity
                      style={styles.compactFolderSelector}
                      onPress={() => setShowFolderModal(true)}
                    >
                      <MaterialIcons name="folder" size={16} color="#8B5CF6" />
                      <Text style={styles.compactFolderText}>{folderName}</Text>
                      <MaterialIcons name="keyboard-arrow-down" size={16} color="#8B5CF6" />
                    </TouchableOpacity>
                  </View>

                  <View style={styles.tagSection}>
                    <View style={styles.compactTagsSection}>
                      <TouchableOpacity
                        style={styles.addTagButton}
                        onPress={() => setShowTagModal(true)}
                      >
                        <MaterialIcons name="add" size={14} color="#8B5CF6" />
                        <Text style={styles.addTagText}>Tag</Text>
                      </TouchableOpacity>
                      
                      <View style={styles.tagsDisplayContainer}>
                        <ScrollView 
                          horizontal 
                          showsHorizontalScrollIndicator={false}
                          contentContainerStyle={styles.tagsScrollContent}
                        >
                          <View style={styles.tagsContainer}>
                            {tags.map((tag, index) => (
                              <View key={index} style={styles.compactTag}>
                                <Text style={styles.compactTagText} numberOfLines={1}>
                                  {tag}
                                </Text>
                                <TouchableOpacity onPress={() => removeTag(tag)}>
                                  <MaterialIcons name="close" size={12} color="#8B5CF6" />
                                </TouchableOpacity>
                              </View>
                            ))}
                          </View>
                        </ScrollView>
                      </View>
                    </View>
                  </View>
                </View>
              </View>
            )}

            {/* Toolbar */}
            {!readOnly && (
              <View style={styles.compactToolbarContainer}>
                <View style={styles.toolbarContentWrapper}>
                  <DrawingToolbar
                    currentTool={currentTool}
                    currentColor={currentColor}
                    currentWidth={currentWidth}
                    currentTemplate={activeTemplate}
                    currentZoom={currentZoom}
                    onToolChange={setCurrentTool}
                    onColorChange={setCurrentColor}
                    onWidthChange={setCurrentWidth}
                    onTemplateChange={handleTemplateChange}
                    onUndo={undo}
                    onRedo={redo}
                    onClear={handleClear}
                    onDropdownToggle={handleToolbarDropdownToggle}
                    onZoomIn={handleZoomIn}
                    onZoomOut={handleZoomOut}
                    onZoomReset={resetZoom}
                    canUndo={canUndo}
                    canRedo={canRedo}
                  />
                </View>
              </View>
            )}

            {/* Canvas Container */}
            <View style={styles.canvasSection}>
              <ScrollView
                style={styles.canvasScrollView}
                contentContainerStyle={styles.canvasScrollContent}
                showsHorizontalScrollIndicator={false}
                showsVerticalScrollIndicator={false}
                bounces={false}
                scrollEnabled={currentZoom > 1}
                minimumZoomScale={0.5}
                maximumZoomScale={3}
                zoomScale={currentZoom}
                onScroll={(event) => {
                  setScrollOffset({
                    x: event.nativeEvent.contentOffset.x,
                    y: event.nativeEvent.contentOffset.y,
                  });
                }}
                scrollEventThrottle={16}
                onScrollBeginDrag={() => {
                  // Disable drawing when scrolling
                  setCurrentStroke(null);
                }}
                {...panResponder.panHandlers}
              >
                <TouchableOpacity
                  style={[styles.modernCanvasWrapper, { 
                    width: windowDimensions.width - 32, // Account for margins
                    height: Math.min(
                      isTablet ? 600 : isSmallPhone ? 400 : 500,
                      windowDimensions.height - 350
                    ),
                    transform: [{ scale: currentZoom }],
                    transformOrigin: 'center',
                  }]}
                  onPress={handleDoubleTap}
                  activeOpacity={1}
                >
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
                    scaleStrokesWithZoom={SCALE_STROKES_WITH_ZOOM}
                    currentZoom={currentZoom}
                  />
                </TouchableOpacity>
              </ScrollView>
              
              {/* Zoom Indicator */}
              {currentZoom !== 1 && (
                <View style={styles.zoomIndicator}>
                  <Text style={styles.zoomIndicatorText}>
                    {Math.round(currentZoom * 100)}%
                  </Text>
                </View>
              )}
              
              {/* Gesture Hint */}
              {!readOnly && (
                <View style={styles.gestureHint}>
                  <Text style={styles.gestureHintText}>
                    Pinch to zoom • Double tap to reset • Scroll when zoomed
                  </Text>
                </View>
              )}
            </View>
          </ScrollView>
        </View>

        </Animated.View>

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
                <MaterialIcons name="folder" size={28} color="#8B5CF6" />
                <Text style={[styles.modalTitle, { marginBottom: 0, marginLeft: 12 }]}>Select Folder</Text>
              </View>

              <View style={{ maxHeight: 400, paddingBottom: 10 }}>
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
                      color="#8B5CF6"
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
                      selectedFolderId === folder.id && styles.selectedFolderItem,
                    ]}
                    onPress={() => handleFolderSelect(folder)}
                  >
                    <View
                      style={[
                        styles.folderIcon,
                        { backgroundColor: folder.color || "#8B5CF6" },
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
                        color="#8B5CF6"
                      />
                    )}
                  </TouchableOpacity>
                ))}
              </View>

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

        {/* Tag Modal */}
        <Modal
          visible={showTagModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowTagModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <MaterialIcons name="local-offer" size={28} color="#8B5CF6" />
                <Text style={[styles.modalTitle, { marginBottom: 0, marginLeft: 12 }]}>Add Tag</Text>
              </View>

              <TextInput
                style={styles.tagInput}
                value={newTag}
                onChangeText={setNewTag}
                placeholder="Enter tag name"
                placeholderTextColor="#9CA3AF"
                maxLength={20}
                returnKeyType="done"
                onSubmitEditing={addTag}
                autoFocus
              />

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={() => {
                    setShowTagModal(false);
                    setNewTag("");
                  }}
                >
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.modalActionButton,
                    !newTag.trim() && styles.modalActionButtonDisabled,
                  ]}
                  onPress={() => {
                    addTag();
                    setShowTagModal(false);
                  }}
                  disabled={!newTag.trim()}
                >
                  <Text style={styles.modalActionText}>Add Tag</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        <UnsavedChangesModal
          visible={showUnsavedChangesModal}
          onSave={handleSaveAndExit}
          onDiscard={handleDiscardAndExit}
          onCancel={handleContinueEditing}
        />
    </KeyboardAvoidingView>
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
            style={styles.modalSaveButton}
            onPress={() => onSave(title)}
          >
            <Text style={styles.modalSaveButtonText}>Save</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  rootContainer: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  header: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 24,
    paddingTop: Platform.OS === "ios" ? 50 : 50,
    paddingBottom: "100%",
    zIndex: 1,
  },
  headerContent: {
    flex: 1,
  },
  headerTopRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
  },
  headerTitleSection: {
    flex: 1,
  },
  headerCenter: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 2,
  },
  headerSyncStatus: {
    flexDirection: "row",
    alignItems: "center",
    marginRight: 12,
  },
  headerSyncText: {
    fontSize: 12,
    color: "rgba(255,255,255,0.8)",
    fontFamily: "Inter-Medium",
    marginLeft: 4,
  },
  titleTouchable: {
    alignItems: "center",
    flexDirection: "row",
  },
  headerTitle: {
    fontSize: 24,
    color: "#FFFFFF",
    fontFamily: "Inter-Bold",
    lineHeight: 28,
  },
  setupInfo: {
    fontSize: 12,
    fontFamily: "Inter-Regular",
    color: "rgba(255,255,255,0.8)",
    textAlign: "center",
    marginTop: 2,
  },
  editIcon: {
    marginLeft: 8,
  },
  modernTitleInput: {
    fontSize: Platform.select({ ios: 20, android: 18 }),
    fontFamily: "Inter-Bold",
    color: "#FFFFFF",
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 0,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  saveButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    justifyContent: "center",
    alignItems: "center",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
  },
  mainContentContainer: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    marginTop: 120,
    shadowColor: "#1E293B",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 10,
    zIndex: 1000,
    overflow: "hidden",
  },
  mainScrollView: {
    flex: 1,
  },
  mainScrollContent: {
    paddingTop: 20,
    paddingHorizontal: Platform.select({ ios: 16, android: 12 }),
    paddingBottom: 20,
  },
  compactHeaderInfo: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: Platform.select({ ios: 20, android: 16 }),
    marginBottom: 16,
    shadowColor: "#8B5CF6",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    borderColor: "#F3F4F6",
  },
  compactMetadata: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  folderSection: {
    flex: 1,
    alignItems: "flex-start",
  },
  tagSection: {
    flex: 1,
    alignItems: "flex-end",
  },
  compactTagsSection: {
    flexDirection: "row",
    alignItems: "center",
  },
  addTagButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    marginRight: 8,
    marginBottom: 4,
  },
  addTagText: {
    color: "#8B5CF6",
    marginLeft: 4,
    fontFamily: "Inter-Medium",
    fontSize: 12,
  },
  tagsDisplayContainer: {
    marginTop: 8,
    maxHeight: 60,
  },
  tagsScrollContent: {
    paddingRight: 16,
  },
  tagsContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  compactTag: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#EDE9FE",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
    marginRight: 8,
    marginBottom: 4,
    minWidth: 60,
    maxWidth: 100,
  },
  compactTagText: {
    color: "#8B5CF6",
    fontSize: 12,
    fontFamily: "Inter-Medium",
    marginRight: 4,
    flexShrink: 1,
  },
  compactSyncContainer: {
    alignItems: "center",
    marginTop: 8,
  },
  compactFolderSelector: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  compactFolderText: {
    marginHorizontal: 8,
    fontSize: 13,
    fontFamily: "Inter-Medium",
    color: "#6B7280",
  },
  syncStatusContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F9FAFB",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
  },
  syncStatusText: {
    marginLeft: 6,
    fontSize: 12,
    fontFamily: "Inter-Medium",
    color: "#34C759",
  },
  compactToolbarContainer: {
    backgroundColor: "#F8FAFC",
    borderRadius: 12,
    marginBottom: 16,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  toolbarContentWrapper: {
    paddingHorizontal: 8,
  },
  modernCanvasWrapper: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    shadowColor: "#8B5CF6",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
    overflow: "hidden",
    // Remove flex: 1 to allow explicit sizing
  },

  // Canvas section with gesture controls
  canvasSection: {
    flex: 1,
    position: "relative",
  },
  canvasScrollView: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  canvasScrollContent: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: "100%",
    padding: 16, // Add padding to prevent content from touching edges
  },
  zoomIndicator: {
    position: "absolute",
    top: 16,
    right: 16,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    zIndex: 10,
  },
  zoomIndicatorText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "600",
    fontFamily: "Inter-SemiBold",
  },
  gestureHint: {
    position: "absolute",
    bottom: 16,
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 10,
  },
  gestureHintText: {
    color: "#64748b",
    fontSize: 11,
    fontFamily: "Inter-Medium",
    backgroundColor: "rgba(255, 255, 255, 0.9)",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    overflow: "hidden",
  },
  
  // Legacy styles for compatibility
  headerButton: {
    padding: 8,
    width: 40,
    alignItems: "center",
  },
  autoSaveIndicator: {
    fontSize: 12,
    color: "#28a745",
    fontFamily: "Inter-Medium",
  },
  
  // Folder selection styles (legacy)
  legacyFolderSection: {
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

  toolbarContainer: {
    borderBottomWidth: 1,
    borderBottomColor: "#e9ecef",
    backgroundColor: "#fafbfc",
    zIndex: 100,
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
    zIndex: 1,
  },

  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.65)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
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
    fontSize: 24,
    fontFamily: "Inter-Bold",
    color: "#1F2937",
    marginBottom: 24,
    textAlign: "center",
  },
  tagInput: {
    borderWidth: 2,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    fontFamily: "Inter-Regular",
    marginBottom: 20,
    backgroundColor: "#F9FAFB",
    shadowColor: "#1F2937",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
    gap: 16,
  },
  modalActionButton: {
    flex: 1,
    paddingHorizontal: 28,
    paddingVertical: 16,
    borderRadius: 16,
    backgroundColor: "#8B5CF6",
    shadowColor: "#8B5CF6",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 6,
    alignItems: "center",
  },
  modalActionButtonDisabled: {
    backgroundColor: "#D1D5DB",
    opacity: 0.6,
  },
  modalActionText: {
    color: "#fff",
    fontFamily: "Inter-SemiBold",
    fontSize: 17,
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
    backgroundColor: "#F8FAFC",
    borderWidth: 2,
    borderColor: "#E5E7EB",
    paddingVertical: 16,
    paddingHorizontal: 28,
    borderRadius: 16,
    shadowColor: "#1F2937",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cancelButtonText: {
    color: "#dc3545",
    fontSize: 16,
    fontWeight: "600",
  },
  modalSaveButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    backgroundColor: "#007bff",
    alignItems: "center",
  },
  modalSaveButtonText: {
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
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 28,
    width: "92%",
    maxWidth: 420,
    maxHeight: "85%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 15,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  modalCancelText: {
    color: "#6B7280",
    fontFamily: "Inter-SemiBold",
    fontSize: 17,
  },

  // Folder modal styles
  folderItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 18,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    marginBottom: 12,
    shadowColor: "#1E293B",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
    borderWidth: 2,
    borderColor: "#F8FAFC",
  },
  selectedFolderItem: {
    backgroundColor: "#F0F9FF",
    borderColor: "#0EA5E9",
    borderWidth: 2,
    shadowColor: "#0EA5E9",
    shadowOpacity: 0.15,
  },
  folderIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },
  folderItemName: {
    fontSize: 17,
    fontFamily: "Inter-SemiBold",
    color: "#374151",
    marginLeft: 18,
    flex: 1,
  },
  folderDivider: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    marginVertical: 16,
  },
  folderDividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "#E5E7EB",
  },
  folderDividerText: {
    fontSize: 15,
    fontFamily: "Inter-SemiBold",
    color: "#6B7280",
    marginHorizontal: 16,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
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
