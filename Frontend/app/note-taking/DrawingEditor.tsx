import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  View,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  Alert,
  Text,
  TouchableOpacity,
  Pressable,
  TextInput,
  Modal,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
  Vibration,
  Animated,
  PanResponder,
  Image,
  ActivityIndicator,
  Share,
} from "react-native";
import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { captureRef } from "react-native-view-shot";
import * as FileSystem from "expo-file-system";
import * as MediaLibrary from 'expo-media-library';
import { API_URL, API_ENDPOINTS } from "@/constants/ApiConfig";
import { showSuccessToast, showErrorToast, showWarningToast, showInfoToast } from "../utils/ToastUtils";
import DrawingCanvas, { Stroke, DrawingTool, CanvasOrientation } from "./components/DrawingCanvas";
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
  const initialOrientation = (setupParams?.orientation as 'landscape' | 'portrait') || "landscape";
  
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
  removeStrokesByIds,
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
  // New API from useDrawingState for removing strokes when deleting pages
  // (note: removeStrokesByIds is returned by the hook)

  const [currentStroke, setCurrentStroke] = useState<Stroke | null>(null);
  // Pages support: each page holds an array of DrawingStroke objects
  const [pages, setPages] = useState<DrawingStroke[][]>(() => [[]]);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [drawingTitle, setDrawingTitle] = useState(initialTitle);
  const [editingTitle, setEditingTitle] = useState(false);
  const [activeTemplate, setActiveTemplate] =
    useState<TemplateType>(selectedTemplate);

  // Folder selection states
  const [folders, setFolders] = useState<Folder[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [folderName, setFolderName] = useState("Unorganized Notes");
  
  // Local filter for folder search in modal
  const [folderFilter, setFolderFilter] = useState<string>("");
  
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
  
  // Canvas orientation state
  const [canvasOrientation, setCanvasOrientation] = useState<'landscape' | 'portrait'>(initialOrientation);
  // Export state
  const [showExportModal, setShowExportModal] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportPNGUri, setExportPNGUri] = useState<string | null>(null);
  const [exportJPGUri, setExportJPGUri] = useState<string | null>(null);
  const canvasCaptureRef = useRef<any>(null);
  // Selection overlay for export (in preview coordinates)
  const [previewLayout, setPreviewLayout] = useState<{ width: number; height: number } | null>(null);
  const [imageOriginalSize, setImageOriginalSize] = useState<{ width: number; height: number } | null>(null);
  const [selection, setSelection] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const selectionPanRef = useRef<any>(null);
  const selectionPanResponderRef = useRef<any>(null);
  const selectionModeRef = useRef<'move' | 'resize-tl' | 'resize-tr' | 'resize-bl' | 'resize-br' | null>(null);
  const selectionStartRef = useRef<{ left: number; top: number; width: number; height: number; x: number; y: number } | null>(null);
  const [isManipulatorAvailable, setIsManipulatorAvailable] = useState(false);
  const [mediaPermission, setMediaPermission] = useState<MediaLibrary.PermissionResponse | null>(null);
  const [canvasLayout, setCanvasLayout] = useState<{ width: number; height: number } | null>(null);
  const [useCanvasSelection, setUseCanvasSelection] = useState(false);
  
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

  // Create PanResponder for pinch-to-zoom gestures and drawing - optimized for real-time response
  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: (evt, gestureState) => {
      const touches = evt.nativeEvent.touches || [];
      // Start responder immediately for multi-touch (pinch), when drawing,
      // or when we're zoomed in and want to pan the content with one finger.
      if (touches.length === 2) {
        return true;
      }
      if (!readOnly) return true; // Allow drawing when not read-only
      if (currentZoom > 1 && touches.length === 1) return true;
      return false;
    },
    onMoveShouldSetPanResponder: (evt, gestureState) => {
      const touches = evt.nativeEvent.touches || [];
      // Accept move gestures immediately without delay
      if (touches.length === 2) return true; // pinch
      // If drawing enabled, handle single-touch move immediately
      if (!readOnly && touches.length === 1) return true;
      // If zoomed in, allow single-finger pan immediately
      if (currentZoom > 1 && touches.length === 1) return true;
      return false;
    },
    onMoveShouldSetPanResponderCapture: (evt, gestureState) => {
      const touches = evt.nativeEvent.touches || [];
      // Capture gestures immediately for real-time response
      if (touches.length === 2) return true;
      if (!readOnly && touches.length === 1) return true;
      if (currentZoom > 1 && touches.length === 1) return true;
      return false;
    },
    // Enable immediate response by setting these to true
    onShouldBlockNativeResponder: () => true,
    onStartShouldSetPanResponderCapture: (evt, gestureState) => {
      const touches = evt.nativeEvent.touches || [];
      return touches.length === 2 || !readOnly || currentZoom > 1;
    },

    onPanResponderGrant: (evt, gestureState) => {
      const touches = evt.nativeEvent.touches || [];
      if (touches.length === 2) {
        // Pinch-to-zoom gesture
        gestureStartZoomRef.current = currentZoom;
        gestureStartDistanceRef.current = getDistance(touches);
      } else if (touches.length === 1 && currentZoom > 1 && readOnly) {
        // Start panning when zoomed in and read-only mode
        // Note: Drawing gestures are handled by DrawingCanvas itself
      }
    },

    onPanResponderMove: (evt, gestureState) => {
      const touches = evt.nativeEvent.touches || [];
      
      if (touches.length === 2) {
        // Handle pinch-to-zoom with immediate updates
        const currentDistance = getDistance(touches);
        const startDistance = gestureStartDistanceRef.current;

        if (startDistance > 0) {
          const scale = currentDistance / startDistance;
          const newZoom = Math.max(0.5, Math.min(3, gestureStartZoomRef.current * scale));
          setCurrentZoom(newZoom);
        }
      }
      // Note: Single-touch drawing is handled by DrawingCanvas PanResponder
      // Note: Single-touch panning when zoomed could be added here if needed
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

  // Canvas preferences management
  const saveCanvasPreferences = async () => {
    try {
      const preferences = {
        orientation: canvasOrientation,
      };
      await AsyncStorage.setItem('canvas_preferences', JSON.stringify(preferences));
    } catch (error) {
      console.log('Error saving canvas preferences:', error);
    }
  };

  // Quick orientation toggle function
  const toggleOrientation = useCallback(() => {
    const newOrientation = canvasOrientation === 'landscape' ? 'portrait' : 'landscape';
    setCanvasOrientation(newOrientation);
    
    // Provide haptic feedback
    if (Platform.OS === 'ios') {
      Vibration.vibrate(50);
    }
    
    showInfoToast(`Canvas switched to ${newOrientation} mode`);
  }, [canvasOrientation]);

  const loadCanvasPreferences = async () => {
    try {
      const saved = await AsyncStorage.getItem('canvas_preferences');
      if (saved) {
        const preferences = JSON.parse(saved);
        if (preferences.orientation) setCanvasOrientation(preferences.orientation);
      }
    } catch (error) {
      console.log('Error loading canvas preferences:', error);
    }
  };

  // Effects
  useEffect(() => {
    // Initialize PanResponder for moving/resizing the selection overlay (works for preview or canvas selection)
    selectionPanResponderRef.current = PanResponder.create({
      onStartShouldSetPanResponder: (evt, gestureState) => {
        const activeLayout = useCanvasSelection ? canvasLayout : previewLayout;
        if (!selection || !activeLayout) return false;
        // Always handle touches that start inside the selection or on a handle
        const touch = evt.nativeEvent; // single touch expected
        const x = touch.locationX;
        const y = touch.locationY;
        const sx = selection.left;
        const sy = selection.top;
        const sw = selection.width;
        const sh = selection.height;

        const HANDLE_SIZE = 28; // interactive area for handles

        // Check corners (relative to selection)
        const inTL = Math.abs(x - sx) <= HANDLE_SIZE && Math.abs(y - sy) <= HANDLE_SIZE;
        const inTR = Math.abs(x - (sx + sw)) <= HANDLE_SIZE && Math.abs(y - sy) <= HANDLE_SIZE;
        const inBL = Math.abs(x - sx) <= HANDLE_SIZE && Math.abs(y - (sy + sh)) <= HANDLE_SIZE;
        const inBR = Math.abs(x - (sx + sw)) <= HANDLE_SIZE && Math.abs(y - (sy + sh)) <= HANDLE_SIZE;

        if (inTL) selectionModeRef.current = 'resize-tl';
        else if (inTR) selectionModeRef.current = 'resize-tr';
        else if (inBL) selectionModeRef.current = 'resize-bl';
        else if (inBR) selectionModeRef.current = 'resize-br';
        else if (x >= sx && x <= sx + sw && y >= sy && y <= sy + sh) selectionModeRef.current = 'move';
        else selectionModeRef.current = null;

        if (selectionModeRef.current) {
          selectionStartRef.current = { left: selection.left, top: selection.top, width: selection.width, height: selection.height, x, y };
          return true;
        }

        return false;
  },
      onMoveShouldSetPanResponder: () => !!selectionModeRef.current,
      onPanResponderGrant: () => {},
      onPanResponderMove: (evt, gestureState) => {
        const activeLayout = useCanvasSelection ? canvasLayout : previewLayout;
        if (!selectionStartRef.current || !activeLayout) return;
        const start = selectionStartRef.current;
        const dx = gestureState.dx;
        const dy = gestureState.dy;
        const maxW = activeLayout.width;
        const maxH = activeLayout.height;

        const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

        if (selectionModeRef.current === 'move') {
          const nl = clamp(start.left + dx, 0, maxW - start.width);
          const nt = clamp(start.top + dy, 0, maxH - start.height);
          setSelection({ left: Math.round(nl), top: Math.round(nt), width: start.width, height: start.height });
        } else if (selectionModeRef.current && selectionModeRef.current.startsWith('resize')) {
          let nl = start.left;
          let nt = start.top;
          let nw = start.width;
          let nh = start.height;

          switch (selectionModeRef.current) {
            case 'resize-tl':
              nl = clamp(start.left + dx, 0, start.left + start.width - 20);
              nt = clamp(start.top + dy, 0, start.top + start.height - 20);
              nw = clamp(start.width - (nl - start.left), 20, maxW - nl);
              nh = clamp(start.height - (nt - start.top), 20, maxH - nt);
              break;
            case 'resize-tr':
              nt = clamp(start.top + dy, 0, start.top + start.height - 20);
              nw = clamp(start.width + dx, 20, maxW - start.left);
              nh = clamp(start.height - (nt - start.top), 20, maxH - nt);
              break;
            case 'resize-bl':
              nl = clamp(start.left + dx, 0, start.left + start.width - 20);
              nw = clamp(start.width - (nl - start.left), 20, maxW - nl);
              nh = clamp(start.height + dy, 20, maxH - start.top);
              break;
            case 'resize-br':
              nw = clamp(start.width + dx, 20, maxW - start.left);
              nh = clamp(start.height + dy, 20, maxH - start.top);
              break;
            default:
              break;
          }

          setSelection({ left: Math.round(nl), top: Math.round(nt), width: Math.round(nw), height: Math.round(nh) });
        }
  },
      onPanResponderRelease: () => {
        selectionModeRef.current = null;
        selectionStartRef.current = null;
      },
      onPanResponderTerminate: () => {
        selectionModeRef.current = null;
        selectionStartRef.current = null;
      },
    });
  }, [selection, previewLayout]);

  // Separate effect for subscription and entrance animation
  useEffect(() => {
    const subscription = Dimensions.addEventListener('change', ({ window }) => {
      setWindowDimensions(window);
    });

    // Load canvas preferences on mount
    loadCanvasPreferences();

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

  // Detect if expo-image-manipulator is available at runtime (optional dependency)
  useEffect(() => {
    try {
      // try require so bundlers that don't have it won't crash until runtime
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const ImageManipulator = require('expo-image-manipulator');
      if (ImageManipulator) setIsManipulatorAvailable(true);
    } catch (e) {
      setIsManipulatorAvailable(false);
    }
  }, []);

  // Request media library permission when export modal opens
  const ensureMediaPermission = useCallback(async () => {
    try {
      const status = await MediaLibrary.requestPermissionsAsync();
      setMediaPermission(status);
      return status;
    } catch (e) {
      console.warn('Media permission request failed', e);
      return null;
    }
  }, []);

  // Helper to save an image file URI to the user's Photos/Camera Roll and optionally share it
  const saveImageToPhotos = useCallback(async (fileUri: string, shareAfterSave = false) => {
    try {
      const perm = await MediaLibrary.requestPermissionsAsync();
      if (!perm || (!perm.granted && perm.status !== 'granted')) {
        showWarningToast('Permission to save to Photos is required');
        return null;
      }

      // Create asset in the media library
      const asset = await MediaLibrary.createAssetAsync(fileUri);

      // Try to create or add to an app-specific album for better organization
      try {
        const albumName = 'Togetha';
        const album = await MediaLibrary.getAlbumAsync(albumName);
        if (!album) {
          await MediaLibrary.createAlbumAsync(albumName, asset, false);
        }
      } catch (albumErr) {
        // Non-fatal if album creation fails
        console.warn('Could not create album for export', albumErr);
      }

      if (shareAfterSave) {
        // Use the asset uri for sharing so other apps can access it
        await Share.share({ url: asset.uri, title: 'Exported drawing' } as any);
      }

      return asset.uri;
    } catch (err) {
      console.error('Failed to save image to photos', err);
      throw err;
    }
  }, []);

  useEffect(() => {
    if (showExportModal) {
      ensureMediaPermission();
    }
  }, [showExportModal, ensureMediaPermission]);

  // Save canvas preferences when orientation changes
  useEffect(() => {
    saveCanvasPreferences();
  }, [canvasOrientation]);

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
      // User requested the eraser be rendered/behave like a white brush.
      // Treat eraser strokes as normal painted strokes using the canvas background color.
      // Add to current page and global state
      setPages(prev => {
        const copy = prev.map(p => p.slice());
        copy[currentPageIndex] = copy[currentPageIndex] || [];
        copy[currentPageIndex].push(drawingStroke);
        return copy;
      });
      addStroke(drawingStroke);
    } else {
      // Regular stroke, add to canvas
      setPages(prev => {
        const copy = prev.map(p => p.slice());
        copy[currentPageIndex] = copy[currentPageIndex] || [];
        copy[currentPageIndex].push(drawingStroke);
        return copy;
      });
      addStroke(drawingStroke);
    }
  }, [addStroke, eraseStrokes, currentPageIndex]);

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
            selectedFolderId,
            tags
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
            folderId: selectedFolderId,
            tags: tags
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

  // Initialize pages from existing strokes when strokes are imported, but only if pages are empty
  useEffect(() => {
    if (strokes && strokes.length > 0 && (pages.length === 0 || (pages.length === 1 && (pages[0]?.length || 0) === 0))) {
      // Place existing strokes on the first page
      setPages([strokes.slice()]);
      setCurrentPageIndex(0);
    }
  }, [strokes, pages.length]);

  // Helper: confirm then delete a page
  const confirmDeletePage = (index: number) => {
    Alert.alert(
      `Delete Page ${index + 1}?`,
      'This will permanently delete all strokes on this page. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => handleDeletePage(index) },
      ]
    );
  };

  const handleDeletePage = (index: number) => {
    setPages(prev => {
      if (prev.length <= 1) {
        // If only one page, clear it instead of deleting
        const copy = prev.map(p => p.slice());
        copy[0] = [];
        // Also remove from global strokes
        const idsToRemove = prev[0].map(s => s.id).filter(Boolean) as string[];
        if (idsToRemove.length > 0 && typeof (removeStrokesByIds as any) === 'function') {
          try { (removeStrokesByIds as any)(idsToRemove); } catch (e) { /* ignore */ }
        }
        return copy;
      }

      // Collect IDs to remove from global strokes for this page
      const idsToRemove = prev[index].map(s => s.id).filter(Boolean) as string[];

      const newPages = prev.filter((_, i) => i !== index).map(p => p.slice());

      // Adjust current page index
      setTimeout(() => {
        setCurrentPageIndex(ci => {
          if (ci === index) return Math.max(0, index - 1);
          if (ci > index) return ci - 1;
          return ci;
        });
      }, 0);

      // Remove strokes globally
      if (idsToRemove.length > 0 && typeof (removeStrokesByIds as any) === 'function') {
        try { (removeStrokesByIds as any)(idsToRemove); } catch (e) { /* ignore */ }
      }

      return newPages;
    });
  };

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
      await saveDrawing({
        type: "drawing",
        title: drawingTitle,
        template: activeTemplate,
        folderId: selectedFolderId,
        tags: tags
      });
      // Wait a brief moment to ensure save state is updated
      await new Promise(resolve => setTimeout(resolve, 100));
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
        await saveDrawing({
          type: "drawing",
          title: drawingTitle,
          template: activeTemplate,
          folderId: selectedFolderId,
          tags: tags
        });
        // Wait a brief moment to ensure save completion
        await new Promise(resolve => setTimeout(resolve, 100));
        showSuccessToast("Drawing saved successfully");
      }
    } catch (error) {
      showErrorToast("Failed to save drawing");
      console.error('Error saving drawing:', error);
      // Show modal again if save failed
      setShowUnsavedChangesModal(true);
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
    showInfoToast("Changes discarded");
    
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
                  {/* hide size/dimensions per request - no need to show canvas dimensions in header */}
                </View>
              </View>

              {!readOnly && (
                <View style={styles.headerActions}>
                  <TouchableOpacity
                    style={styles.saveButton}
                    onPress={() => setShowFolderModal(true)}
                  >
                    <MaterialIcons name="folder" size={18} color="#fff" />
                  </TouchableOpacity>

                  {/* Export button (to the right of save/check) */}
                  <TouchableOpacity
                    style={[styles.saveButton, { marginRight: 8 }]}
                    onPress={() => setShowExportModal(true)}
                  >
                    <MaterialIcons name="file-download" size={18} color="#fff" />
                  </TouchableOpacity>

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
                <View />
            )}

            {/* Toolbar */}
            {!readOnly && (
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
            )}

            {/* Orientation is now controlled only via the floating quick toggle. */}

            {/* Canvas Container */}
            {/* Page tabs */}
            <View style={styles.tabsContainer}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsScrollContent}>
                {pages.map((page, idx) => (
                  <TouchableOpacity
                    key={`page-tab-${idx}`}
                    onPress={() => setCurrentPageIndex(idx)}
                    onLongPress={() => confirmDeletePage(idx)}
                    style={[
                      styles.tabButton,
                      idx === currentPageIndex ? styles.tabButtonActive : styles.tabButtonInactive,
                    ]}
                  >
                    <Text style={[styles.tabText, idx === currentPageIndex ? styles.tabTextActive : styles.tabTextInactive]}>Page {idx + 1}</Text>
                  </TouchableOpacity>
                ))}

                {/* Modern Add page icon (icon-only) */}
                <TouchableOpacity
                  onPress={() => {
                    // Atomically add a new page and set the current page to the newly created index
                    setPages(prev => {
                      const newPages = [...prev, []];
                      // set current to last page index
                      setCurrentPageIndex(newPages.length - 1);
                      return newPages;
                    });
                  }}
                  style={styles.addPagePillWrapper}
                  activeOpacity={0.85}
                >
                  <LinearGradient colors={["#7C3AED", "#8B5CF6"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.addPageIcon}>
                    <MaterialIcons name="note-add" size={18} color="#fff" />
                  </LinearGradient>
                </TouchableOpacity>
              </ScrollView>
            </View>

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
              >
                <TouchableOpacity
                  style={[styles.modernCanvasWrapper, { 
                    width: 800,
                    height: 600,
                    transform: [{ scale: currentZoom }],
                  }]}
                  onPress={handleDoubleTap}
                    activeOpacity={1}
                    ref={canvasCaptureRef}
                    onLayout={(ev) => {
                      const { width, height } = ev.nativeEvent.layout;
                      // store canvas layout for direct on-canvas selection
                      setCanvasLayout({ width, height });
                    }}
                  {...panResponder.panHandlers}
                >
                  <DrawingCanvas
                    strokes={pages[currentPageIndex] || []}
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
                    orientation={canvasOrientation}
                  />

                  {/* Canvas overlay for direct selection mode */}
                  {useCanvasSelection && canvasLayout && (
                    <View
                      style={{ position: 'absolute', left: 0, top: 0, width: canvasLayout.width, height: canvasLayout.height }}
                      pointerEvents="box-only"
                      {...(selectionPanResponderRef.current ? selectionPanResponderRef.current.panHandlers : {})}
                    >
                      {selection && (
                        <View style={{ position: 'absolute', left: selection.left, top: selection.top, width: selection.width, height: selection.height }}>
                          <View style={{ flex: 1, borderWidth: 1, borderColor: '#111827', backgroundColor: 'rgba(255,255,255,0.12)' }} />
                          {/* corner handles */}
                          <View style={{ position: 'absolute', left: -12, top: -12, width: 24, height: 24, borderRadius: 6, backgroundColor: 'rgba(17,24,39,0.9)' }} />
                          <View style={{ position: 'absolute', right: -12, top: -12, width: 24, height: 24, borderRadius: 6, backgroundColor: 'rgba(17,24,39,0.9)' }} />
                          <View style={{ position: 'absolute', left: -12, bottom: -12, width: 24, height: 24, borderRadius: 6, backgroundColor: 'rgba(17,24,39,0.9)' }} />
                          <View style={{ position: 'absolute', right: -12, bottom: -12, width: 24, height: 24, borderRadius: 6, backgroundColor: 'rgba(17,24,39,0.9)' }} />
                        </View>
                      )}
                    </View>
                  )}
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

              {/* Quick Orientation Toggle */}
              {!readOnly && (
                <TouchableOpacity 
                  style={styles.quickOrientationToggle} 
                  onPress={toggleOrientation}
                  activeOpacity={0.8}
                >
                  <Ionicons 
                    name={canvasOrientation === 'landscape' ? 'phone-portrait' : 'phone-landscape'} 
                    size={20} 
                    color="#4F46E5" 
                  />
                </TouchableOpacity>
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

        {/* Export Modal and helpers */}
        <Modal
          visible={showExportModal}
          transparent={true}
          animationType="slide"
          onRequestClose={() => setShowExportModal(false)}
        >
          <View style={styles.exportModalOverlay}>
            <View style={styles.exportModalContainer}>
              <View style={styles.exportModalHeader}>
                <View style={styles.exportModalIcon}>
                  <LinearGradient
                    colors={["#8B5CF6", "#7C3AED"]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.exportModalIconGradient}
                  >
                    <MaterialIcons name="file-download" size={24} color="#fff" />
                  </LinearGradient>
                </View>
                <Text style={styles.exportModalTitle}>Export Drawing</Text>
                <Text style={styles.exportModalSubtitle}>
                  Create a high-quality export of your drawing
                </Text>
                <TouchableOpacity 
                  style={styles.exportModalCloseButton}
                  onPress={() => setShowExportModal(false)}
                >
                  <MaterialIcons name="close" size={20} color="#6B7280" />
                </TouchableOpacity>
              </View>

              {/* Preview + selection area (single preview shown) */}
              <View style={styles.exportPreviewContainer}>
                {exporting ? (
                  <View style={styles.exportLoadingContainer}>
                    <ActivityIndicator size="large" color="#8B5CF6" />
                    <Text style={styles.exportLoadingText}>Preparing export...</Text>
                  </View>
                ) : (
                  <View
                    onLayout={(ev) => {
                      const { width, height } = ev.nativeEvent.layout;
                      setPreviewLayout({ width, height });
                    }}
                    style={styles.exportPreviewImageContainer}
                  >

              {/* Floating action bar for canvas selection mode */}
              {useCanvasSelection && (
                <View style={{ position: 'absolute', bottom: 20, left: 20, right: 20, flexDirection: 'row', justifyContent: 'space-between' }} pointerEvents="box-none">
                  <TouchableOpacity
                    style={[styles.cancelButton, { flex: 0.45 }]}
                    onPress={() => {
                      // cancel selection and re-open modal
                      setSelection(null);
                      setUseCanvasSelection(false);
                      setShowExportModal(true);
                    }}
                  >
                    <Text style={styles.cancelButtonText}>Cancel</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.modalActionButton, { flex: 0.45 }]}
                    onPress={async () => {
                      // Capture canvas and crop using current selection
                      try {
                        setExporting(true);
                        const uri = await captureRef(canvasCaptureRef.current || canvasCaptureRef, { format: 'png', quality: 1 });
                        setExportPNGUri(uri);

                        if (selection && canvasLayout && isManipulatorAvailable) {
                          const imgW = imageOriginalSize?.width || canvasLayout.width;
                          const imgH = imageOriginalSize?.height || canvasLayout.height;
                          const scaleX = imgW / canvasLayout.width;
                          const scaleY = imgH / canvasLayout.height;
                          const crop = {
                            originX: Math.round(selection.left * scaleX),
                            originY: Math.round(selection.top * scaleY),
                            width: Math.round(selection.width * scaleX),
                            height: Math.round(selection.height * scaleY),
                          };
                          // eslint-disable-next-line @typescript-eslint/no-var-requires
                          const ImageManipulator = require('expo-image-manipulator');
                          const result = await ImageManipulator.manipulateAsync(uri, [{ crop }], { compress: 1, format: ImageManipulator.SaveFormat.PNG });
                          try {
                            // Save result.uri to Photos and share
                            await saveImageToPhotos(result.uri, true);
                            showSuccessToast('Export saved to Photos and shared');
                          } catch (saveErr) {
                            console.warn('Saving to photos failed, falling back to share file', saveErr);
                            const dest = `${FileSystem.documentDirectory}drawing_export_${Date.now()}${result.uri.endsWith('.jpg') ? '.jpg' : '.png'}`;
                            await FileSystem.copyAsync({ from: result.uri, to: dest });
                            await Share.share({ url: dest, title: 'Exported drawing' } as any);
                            showSuccessToast('Export saved to documents');
                          }
                        } else {
                          // fallback: share full capture
                          try {
                            await saveImageToPhotos(uri, true);
                            showSuccessToast('Export saved to Photos and shared');
                          } catch (saveErr) {
                            const dest = `${FileSystem.documentDirectory}drawing_export_${Date.now()}${uri.endsWith('.jpg') ? '.jpg' : '.png'}`;
                            await FileSystem.copyAsync({ from: uri, to: dest });
                            await Share.share({ url: dest, title: 'Exported drawing' } as any);
                            showSuccessToast('Export saved to documents');
                          }
                        }
                      } catch (e) {
                        console.error('Canvas export error', e);
                        showErrorToast('Failed to export selection from canvas');
                      } finally {
                        setExporting(false);
                        setSelection(null);
                        setUseCanvasSelection(false);
                      }
                    }}
                  >
                    <Text style={styles.modalActionText}>Capture & Crop</Text>
                  </TouchableOpacity>
                </View>
              )}
                    {/* Show whichever preview is available (PNG preferred) */}
                    {exportPNGUri || exportJPGUri ? (
                      <Image
                        source={{ uri: exportPNGUri || exportJPGUri || undefined }}
                        style={{ width: '100%', height: '100%' }}
                        resizeMode="contain"
                        onLoad={(e) => {
                          const { width, height } = e.nativeEvent.source;
                          setImageOriginalSize({ width, height });
                        }}
                      />
                    ) : (
                      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ color: '#9CA3AF' }}>Preview will appear here</Text>
                      </View>
                    )}

                    {/* interactive selection overlay (overlay captures gestures) */}
                    {previewLayout && (
                      <Pressable
                        style={{ position: 'absolute', left: 0, top: 0, width: previewLayout.width, height: previewLayout.height }}
                        onPressIn={(event) => {
                          console.log('Pressable onPressIn triggered');
                          console.log('Selection exists:', !!selection);
                          console.log('Image URI exists:', !!(exportPNGUri || exportJPGUri));
                          console.log('Event coordinates:', event.nativeEvent.locationX, event.nativeEvent.locationY);
                          
                          if (exportPNGUri || exportJPGUri) {
                            const { locationX, locationY } = event.nativeEvent;
                            
                            // Check if tap is inside existing selection (if any)
                            let tappedInsideSelection = false;
                            if (selection) {
                              tappedInsideSelection = locationX >= selection.left && locationX <= (selection.left + selection.width) &&
                                                    locationY >= selection.top && locationY <= (selection.top + selection.height);
                              console.log('Tapped inside existing selection:', tappedInsideSelection);
                            }
                            
                            // Create new selection at press location (unless tapping inside existing selection for dragging)
                            if (!tappedInsideSelection) {
                              const size = Math.min(previewLayout.width, previewLayout.height) * 0.3;
                              const left = Math.max(0, Math.min(locationX - size/2, previewLayout.width - size));
                              const top = Math.max(0, Math.min(locationY - size/2, previewLayout.height - size));
                              console.log('Creating new selection:', { left, top, width: size, height: size });
                              setSelection({ left, top, width: size, height: size });
                            }
                          }
                        }}
                        onPress={(event) => {
                          console.log('Pressable onPress triggered as fallback');
                          // Fallback for onPress if onPressIn doesn't work
                          if (exportPNGUri || exportJPGUri) {
                            const { locationX, locationY } = event.nativeEvent;
                            
                            // Check if tap is inside existing selection (if any)
                            let tappedInsideSelection = false;
                            if (selection) {
                              tappedInsideSelection = locationX >= selection.left && locationX <= (selection.left + selection.width) &&
                                                    locationY >= selection.top && locationY <= (selection.top + selection.height);
                            }
                            
                            // Create new selection at press location (unless tapping inside existing selection for dragging)
                            if (!tappedInsideSelection) {
                              const size = Math.min(previewLayout.width, previewLayout.height) * 0.3;
                              const left = Math.max(0, Math.min(locationX - size/2, previewLayout.width - size));
                              const top = Math.max(0, Math.min(locationY - size/2, previewLayout.height - size));
                              console.log('Creating selection via onPress fallback:', { left, top, width: size, height: size });
                              setSelection({ left, top, width: size, height: size });
                            }
                          }
                        }}
                        // Only attach pan handlers when a selection exists to avoid responder conflicts
                        {...(selection ? (selectionPanResponderRef.current ? selectionPanResponderRef.current.panHandlers : {}) : {})}
                      >
                        {selection && (
                          <View style={{ position: 'absolute', left: selection.left, top: selection.top, width: selection.width, height: selection.height }}>
                            <View style={{ flex: 1, borderWidth: 2, borderColor: '#8B5CF6', backgroundColor: 'rgba(139,92,246,0.1)' }} />
                            {/* corner handles */}
                            <View style={{ position: 'absolute', left: -8, top: -8, width: 16, height: 16, borderRadius: 8, backgroundColor: '#8B5CF6', borderWidth: 2, borderColor: '#fff' }} />
                            <View style={{ position: 'absolute', right: -8, top: -8, width: 16, height: 16, borderRadius: 8, backgroundColor: '#8B5CF6', borderWidth: 2, borderColor: '#fff' }} />
                            <View style={{ position: 'absolute', left: -8, bottom: -8, width: 16, height: 16, borderRadius: 8, backgroundColor: '#8B5CF6', borderWidth: 2, borderColor: '#fff' }} />
                            <View style={{ position: 'absolute', right: -8, bottom: -8, width: 16, height: 16, borderRadius: 8, backgroundColor: '#8B5CF6', borderWidth: 2, borderColor: '#fff' }} />
                          </View>
                        )}
                        {/* Show tap hint when no selection */}
                        {!selection && (exportPNGUri || exportJPGUri) && (
                          <View style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(139,92,246,0.05)', pointerEvents: 'none' }}>
                            <View style={{ backgroundColor: 'rgba(139,92,246,0.9)', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 }}>
                              <Text style={{ color: '#fff', fontSize: 12, fontFamily: 'Inter-Medium' }}>Tap anywhere to select area</Text>
                            </View>
                          </View>
                        )}
                      </Pressable>
                    )}
                  </View>
                )}
              </View>

              <View style={styles.exportFormatButtons}>
                <TouchableOpacity
                  style={styles.exportFormatButton}
                  onPress={async () => {
                    setExporting(true);
                    try {
                      const uri = await captureRef(canvasCaptureRef.current || canvasCaptureRef, { format: 'png', quality: 1 });
                      setExportPNGUri(uri);
                      setExportJPGUri(null);
                      // Auto-create a centered selection if none exists
                      if (previewLayout && !selection) {
                        const w = Math.round(previewLayout.width * 0.8);
                        const h = Math.round(previewLayout.height * 0.8);
                        setSelection({ 
                          left: Math.round((previewLayout.width - w) / 2), 
                          top: Math.round((previewLayout.height - h) / 2), 
                          width: w, 
                          height: h 
                        });
                      }
                    } catch (e) {
                      showErrorToast('Failed to capture PNG');
                    } finally { setExporting(false); }
                  }}
                >
                  <LinearGradient
                    colors={["#10B981", "#059669"]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.exportFormatButtonGradient}
                  >
                    <MaterialIcons name="image" size={18} color="#fff" />
                    <Text style={styles.exportFormatButtonText}>PNG</Text>
                    <Text style={styles.exportFormatButtonSubtext}>Best Quality</Text>
                  </LinearGradient>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.exportFormatButton}
                  onPress={async () => {
                    setExporting(true);
                    try {
                      const uri = await captureRef(canvasCaptureRef.current || canvasCaptureRef, { format: 'jpg', quality: 0.9 });
                      setExportJPGUri(uri);
                      setExportPNGUri(null);
                      // Auto-create a centered selection if none exists
                      if (previewLayout && !selection) {
                        const w = Math.round(previewLayout.width * 0.8);
                        const h = Math.round(previewLayout.height * 0.8);
                        setSelection({ 
                          left: Math.round((previewLayout.width - w) / 2), 
                          top: Math.round((previewLayout.height - h) / 2), 
                          width: w, 
                          height: h 
                        });
                      }
                    } catch (e) {
                      showErrorToast('Failed to capture JPEG');
                    } finally { setExporting(false); }
                  }}
                >
                  <LinearGradient
                    colors={["#F59E0B", "#D97706"]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.exportFormatButtonGradient}
                  >
                    <MaterialIcons name="photo" size={18} color="#fff" />
                    <Text style={styles.exportFormatButtonText}>JPEG</Text>
                    <Text style={styles.exportFormatButtonSubtext}>Smaller Size</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>

              {/* Selection info text */}
              <View style={styles.exportSelectionInfo}>
                <Text style={styles.exportSelectionInfoText}>
                  {selection ? 'Tap and drag on the preview to adjust selection area' : 'Tap on the preview to create a selection area'}
                </Text>
              </View>

              <View style={styles.exportActionButtons}>
                <TouchableOpacity
                  style={styles.exportCancelButton}
                  onPress={() => setShowExportModal(false)}
                >
                  <Text style={styles.exportCancelButtonText}>Cancel</Text>
                </TouchableOpacity>

                {selection && (
                  <TouchableOpacity
                    style={styles.exportClearButton}
                    onPress={() => setSelection(null)}
                  >
                    <Text style={styles.exportClearButtonText}>Clear</Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={[styles.exportSaveButton, selection ? { flex: 2 } : { flex: 3 }]}
                  onPress={async () => {
                    // Crop & save the selected area (if selection present) using expo-image-manipulator when available
                    try {
                      const uriToUse = exportPNGUri || exportJPGUri || null;
                      if (!uriToUse) { showWarningToast('Capture an image first'); return; }

                      if (selection && previewLayout && isManipulatorAvailable) {
                        // Map selection (preview coords) to actual image pixels
                        const imgW = imageOriginalSize?.width || previewLayout.width;
                        const imgH = imageOriginalSize?.height || previewLayout.height;
                        const scaleX = imgW / previewLayout.width;
                        const scaleY = imgH / previewLayout.height;
                        const crop = {
                          originX: Math.round(selection.left * scaleX),
                          originY: Math.round(selection.top * scaleY),
                          width: Math.round(selection.width * scaleX),
                          height: Math.round(selection.height * scaleY),
                        };
                        // eslint-disable-next-line @typescript-eslint/no-var-requires
                        const ImageManipulator = require('expo-image-manipulator');
                        const result = await ImageManipulator.manipulateAsync(uriToUse, [{ crop }], { compress: 1, format: exportPNGUri ? ImageManipulator.SaveFormat.PNG : ImageManipulator.SaveFormat.JPEG });
                        try {
                          await saveImageToPhotos(result.uri, true);
                          showSuccessToast('Export saved to Photos and shared');
                        } catch (saveErr) {
                          console.warn('Saving to photos failed, falling back to share file', saveErr);
                          const dest = `${FileSystem.documentDirectory}drawing_export_${Date.now()}${result.uri.endsWith('.jpg') ? '.jpg' : '.png'}`;
                          await FileSystem.copyAsync({ from: result.uri, to: dest });
                          await Share.share({ url: dest, title: 'Exported drawing' } as any);
                          showSuccessToast('Export saved to documents');
                        }
                      } else {
                        // Fallback: save full captured image
                        try {
                          await saveImageToPhotos(uriToUse, true);
                          showSuccessToast('Export saved to Photos and shared');
                        } catch (saveErr) {
                          const dest = `${FileSystem.documentDirectory}drawing_export_${Date.now()}${uriToUse.endsWith('.jpg') ? '.jpg' : '.png'}`;
                          await FileSystem.copyAsync({ from: uriToUse, to: dest });
                          await Share.share({ url: dest, title: 'Exported drawing' } as any);
                          showSuccessToast('Export saved to documents');
                        }
                      }
                    } catch (e) {
                      console.error('Export error', e);
                      showErrorToast('Failed to export image');
                    }
                  }}
                >
                  <LinearGradient
                    colors={["#8B5CF6", "#7C3AED"]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.exportSaveButtonGradient}
                  >
                    <MaterialIcons name="save-alt" size={18} color="#fff" />
                    <Text style={styles.exportSaveButtonText}>Export & Share</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Folder Selection Modal */}
        <Modal
          visible={showFolderModal}
          transparent={true}
          animationType="slide"
          onRequestClose={() => setShowFolderModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.folderModalContent}>
              <View style={styles.folderModalHeaderRow}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <MaterialIcons name="folder" size={22} color="#8B5CF6" />
                  <Text style={styles.folderModalTitle}> Select Folder</Text>
                </View>
                <TouchableOpacity onPress={() => setShowFolderModal(false)}>
                  <MaterialIcons name="close" size={22} color="#6B7280" />
                </TouchableOpacity>
              </View>

              {/* Search / quick filter */}
              <View style={styles.folderSearchRow}>
                <TextInput
                  placeholder="Search folders"
                  placeholderTextColor="#9CA3AF"
                  style={styles.folderSearchInput}
                  onChangeText={(v) => {
                    setFolderFilter(v);
                  }}
                  defaultValue={folderFilter}
                  returnKeyType="search"
                />
              </View>

              <ScrollView style={styles.folderListScroll} contentContainerStyle={styles.folderListContent}>
                {/* Unorganized Notes Card */}
                <TouchableOpacity
                  style={[styles.folderCard, !selectedFolderId && styles.selectedFolderCard]}
                  onPress={() => {
                    handleFolderSelect(null);
                    setShowFolderModal(false);
                  }}
                >
                  <View style={[styles.folderCardIcon, { backgroundColor: '#64748B' }]}>
                    <MaterialIcons name="notes" size={20} color="#fff" />
                  </View>
                  <View style={styles.folderCardTextWrap}>
                    <Text style={styles.folderCardTitle}>Unorganized Notes</Text>
                    <Text style={styles.folderCardSubtitle}>No folder</Text>
                  </View>
                  {!selectedFolderId && <MaterialIcons name="check-circle" size={20} color="#8B5CF6" />}
                </TouchableOpacity>

                {/* Divider */}
                <View style={styles.folderDividerRow}>
                  <View style={styles.folderDividerLine} />
                  <Text style={styles.folderDividerText}>All folders</Text>
                  <View style={styles.folderDividerLine} />
                </View>

                {/* Folder List (filtered) */}
                {folders
                  .filter(f => !folderFilter || f.name.toLowerCase().includes(folderFilter.toLowerCase()))
                  .map(folder => (
                    <TouchableOpacity
                      key={folder.id}
                      style={[styles.folderCard, selectedFolderId === folder.id && styles.selectedFolderCard]}
                      onPress={() => {
                        handleFolderSelect(folder);
                        setShowFolderModal(false);
                      }}
                    >
                      <View style={[styles.folderCardIcon, { backgroundColor: folder.color || '#8B5CF6' }]}>
                        <MaterialIcons name={(folder.icon as any) || 'folder'} size={20} color="#fff" />
                      </View>
                      <View style={styles.folderCardTextWrap}>
                        <Text style={styles.folderCardTitle}>{folder.name}</Text>
                        <Text style={styles.folderCardSubtitle}>Folder ID: {folder.id}</Text>
                      </View>
                      {selectedFolderId === folder.id && <MaterialIcons name="check-circle" size={20} color="#8B5CF6" />}
                    </TouchableOpacity>
                  ))}
              </ScrollView>
            </View>
          </View>
        </Modal>

        {/* Tag modal removed from UI per request */}

        <UnsavedChangesModal
          visible={showUnsavedChangesModal}
          onSave={handleSaveAndExit}
          onDiscard={handleDiscardAndExit}
          onCancel={handleContinueEditing}
          isSaving={isSaving}
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
    backgroundColor: "#b4b0b0ff",
  },
  rootContainer: {
    flex: 1,
    backgroundColor: "#b4b0b0ff",
  },
  header: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingTop: Platform.OS === "ios" ? 44 : 40,
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
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 8,
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
    fontSize: 18,
    color: "#FFFFFF",
    fontFamily: "Inter-Bold",
    lineHeight: 22,
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
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    justifyContent: "center",
    alignItems: "center",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
  },
  mainContentContainer: {
    flex: 1,
    backgroundColor: "#f3f3f3ff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    marginTop: 90,
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
    paddingHorizontal: Platform.select({ ios: 12, android: 8 }),
  },
  /* Folder and toolbar container styles removed per request */
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
  /* Toolbar styles removed per request */
  modernCanvasWrapper: {
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f3f3f3ff",
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
    backgroundColor: "#f3f3f3ff",
  },
  canvasScrollContent: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: "100%",
// Add padding to prevent content from touching edges
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

  // Additional styles for folder selection modal (copied from notes styles)
  folderItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginBottom: 8,
  },
  // alias for older DrawingEditor usage
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
    folderName: {
    flex: 1,
    marginLeft: 8,
    fontSize: 14,
    fontFamily: "Inter-Medium",
  },
  // Modern folder modal styles from DrawingEditor
  folderModalContent: {
    width: '92%',
    maxHeight: '78%',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 12,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 12,
  },
  folderModalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
    marginBottom: 8,
  },
  folderModalTitle: {
    marginLeft: 10,
    fontSize: 16,
    color: '#111827',
    fontWeight: '600',
  },
  folderSearchRow: {
    paddingVertical: 8,
  },
  folderSearchInput: {
    backgroundColor: '#F3F4F6',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    color: '#111827',
    fontSize: 14,
  },
  folderListScroll: {
    marginTop: 6,
  },
  folderListContent: {
    paddingBottom: 18,
  },
  folderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    marginBottom: 8,
  },
  selectedFolderCard: {
    backgroundColor: '#F8FAFC',
  },
  folderCardIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  folderCardTextWrap: {
    flex: 1,
  },
  folderCardTitle: {
    fontSize: 15,
    color: '#111827',
    fontWeight: '600',
  },
  folderCardSubtitle: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  folderDividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 10,
  },
  folderDivider: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 16,
  },
  folderDividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "#E2E8F0",
  },
  folderDividerText: {
    fontSize: 12,
    fontFamily: "Inter-Medium",
    color: "#64748B",
    marginHorizontal: 12,
  },
  createNoteButton: {
    backgroundColor: "#6A009C",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 24,
    alignItems: "center",
    marginTop: 16,
  },
  createNoteButtonText: {
    fontSize: 14,
    fontFamily: "Inter-Medium",
    color: "#FFFFFF",
  },
  emptyStateHint: {
    fontSize: 12,
    fontFamily: "Inter-Regular",
    color: "#94A3B8",
    textAlign: "center",
    marginTop: 8,
  },
  selectedNoteItem: {
    backgroundColor: "#EDE9FE",
    borderColor: "#6A009C",
    borderWidth: 2,
  },
  folderBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#EDE9FE",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginRight: 4,
  },
  folderBadgeText: {
    fontSize: 10,
    fontFamily: "Inter-Regular",
    color: "#6A009C",
    marginLeft: 4,
  },
  folderStatsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 8,
  },
  folderBadgeInline: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#EDE9FE",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  metadataContainer: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 4,
  },
  inlineTagsContainer: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 2,
  },
  // New - Adding styles to ensure dropdown is always on top
  overlayForDropdown: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "transparent",
    zIndex: 9998,
  },
  dropdownMenuAbsolute: {
    position: "absolute",
    elevation: 9999,
    zIndex: 9999999,
  },
  floatingOptionsMenu: {
    backgroundColor: "#fff",
    borderRadius: 8,
    paddingVertical: 8,
    minWidth: 150,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 9999,
  },
  gridTagsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 8,
    gap: 4,
  },
  gridTag: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F1F5F9",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    fontSize: 10,
  },
  gridTagText: {
    fontSize: 9,
    fontFamily: "Inter-Regular",
    color: "#4B5563",
    marginLeft: 2,
  },
  gridMoreTagsIndicator: {
    backgroundColor: "#E2E8F0",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  gridMoreTagsText: {
    fontSize: 9,
    fontFamily: "Inter-Medium",
    color: "#64748B",
  },
  // Page tabs styles
  tabsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  tabsScrollContent: {
    alignItems: 'center',
    paddingVertical: 4,
  },
  tabButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginRight: 8,
    borderRadius: 10,
    minWidth: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabButtonActive: {
    backgroundColor: '#8B5CF6',
  },
  tabButtonInactive: {
    backgroundColor: '#ffffffff',
  },
  tabText: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
  },
  tabTextActive: {
    color: '#fff',
  },
  tabTextInactive: {
    color: '#374151',
  },
  addPagePillWrapper: {
    marginLeft: 4,
  },
  addPageIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#8B5CF6',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 6,
  },
  htmlPreviewContainer: {
    marginTop: 8,
    maxHeight: 60,
    overflow: "hidden",
  },
  gridHtmlPreviewContainer: {
    marginTop: 6,
    maxHeight: 40,
    overflow: "hidden",
  },
  fadeOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 20,
    backgroundColor: "rgba(255, 255, 255, 0.8)",
  },

  // New folder card header and options button styles
  folderCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    width: "100%",
    marginBottom: 8,
  },

  folderOptionsButton: {
    padding: 4,
    borderRadius: 8,
    backgroundColor: "rgba(156, 163, 175, 0.1)",
  },

  // Add folder card styles
  addFolderCard: {
    backgroundColor: "#F8FAFC",
    borderRadius: 16,
    padding: 16,
    marginRight: 12,
    minWidth: 120,
    maxWidth: 140,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#1E293B",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 2,
    borderColor: "#E5E7EB",
    borderStyle: "dashed",
  },

  addFolderIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F3E8FF",
    marginBottom: 8,
  },

  addFolderText: {
    fontSize: 14,
    fontFamily: "Inter-Medium",
    color: "#6A009C",
    textAlign: "center",
  },

  // Unorganized folder styles
  unorganizedFolderCard: {
    backgroundColor: "#F8FAFC",
    borderRadius: 12,
    padding: 12,
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    shadowColor: "#1E293B",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },

  selectedUnorganizedFolderCard: {
    backgroundColor: "#6A009C",
    borderColor: "#6A009C",
    shadowColor: "#6A009C",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },

  unorganizedFolderIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#E5E7EB",
    marginRight: 12,
  },

  unorganizedFolderName: {
    fontSize: 14,
    fontFamily: "Inter-Medium",
    color: "#374151",
    flex: 1,
  },

  activeUnorganizedFolderName: {
    color: "#FFFFFF",
  },

  unorganizedFolderCount: {
    fontSize: 12,
    fontFamily: "Inter-Regular",
    color: "#6B7280",
  },

  // Folder options modal styles - Enhanced
  folderOptionsModalContent: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 24,
    margin: 20,
    marginTop: "auto",
    marginBottom: "auto",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 15 },
    shadowOpacity: 0.3,
    shadowRadius: 25,
    elevation: 15,
  },

  folderOptionsTitle: {
    fontSize: 20,
    fontFamily: "Inter-Bold",
    color: "#1F2937",
    textAlign: "center",
    marginBottom: 24,
    letterSpacing: -0.2,
  },

  folderOptionItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 18,
    paddingHorizontal: 16,
    borderRadius: 16,
    marginBottom: 8,
    backgroundColor: "#F9FAFB",
    shadowColor: "#64748B",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },

  folderOptionText: {
    fontSize: 16,
    fontFamily: "Inter-Medium",
    color: "#374151",
    marginLeft: 16,
    flex: 1,
  },

  /* cancelOption already defined earlier; removed duplicate */

  // Delete confirmation modal styles - Enhanced
  deleteConfirmModalContent: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 28,
    margin: 20,
    alignItems: "center",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 15 },
    shadowOpacity: 0.3,
    shadowRadius: 25,
    elevation: 15,
  },

  deleteConfirmIcon: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: "#FEF2F2",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 24,
    borderWidth: 3,
    borderColor: "#FECACA",
  },

  deleteConfirmTitle: {
    fontSize: 22,
    fontFamily: "Inter-Bold",
    color: "#1F2937",
    marginBottom: 16,
    textAlign: "center",
    letterSpacing: -0.3,
  },

  deleteConfirmMessage: {
    fontSize: 16,
    fontFamily: "Inter-Regular",
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 24,
    marginBottom: 32,
  },

  deleteConfirmButtons: {
    flexDirection: "row",
    gap: 16,
    width: "100%",
  },

  deleteConfirmCancelButton: {
    flex: 1,
    backgroundColor: "#F9FAFB",
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    shadowColor: "#64748B",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },

  deleteConfirmDeleteButton: {
    flex: 1,
    backgroundColor: "#EF4444",
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: "center",
    shadowColor: "#EF4444",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },

  deleteConfirmCancelText: {
    fontSize: 16,
    fontFamily: "Inter-Medium",
    color: "#374151",
  },

  deleteConfirmDeleteText: {
    fontSize: 16,
    fontFamily: "Inter-Medium",
    color: "#FFFFFF",
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
  
  // Canvas Orientation Controls Styles
  /* Orientation toolbar styles removed; quick toggle remains */
  
  // Quick Orientation Toggle Styles
  quickOrientationToggle: {
    position: 'absolute',
    top: 16,
    right: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 25,
    width: 50,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    zIndex: 10,
  },

  // Modern Export Modal Styles
  exportModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  
  exportModalContainer: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    width: "95%",
    maxWidth: 400,
    maxHeight: "90%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.4,
    shadowRadius: 35,
    elevation: 20,
  },

  exportModalHeader: {
    alignItems: "center",
    paddingTop: 28,
    paddingHorizontal: 24,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
    position: "relative",
  },

  exportModalIcon: {
    marginBottom: 16,
  },

  exportModalIconGradient: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: "center",
    alignItems: "center",
  },

  exportModalTitle: {
    fontSize: 22,
    fontFamily: "Inter-Bold",
    color: "#1F2937",
    marginBottom: 8,
    textAlign: "center",
  },

  exportModalSubtitle: {
    fontSize: 15,
    fontFamily: "Inter-Regular",
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 22,
  },

  exportModalCloseButton: {
    position: "absolute",
    top: 16,
    right: 16,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#F8FAFC",
    justifyContent: "center",
    alignItems: "center",
  },

  exportPreviewContainer: {
    alignItems: "center",
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 16,
  },

  exportLoadingContainer: {
    width: 340,
    height: 240,
    borderRadius: 16,
    backgroundColor: "#F8FAFC",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#E5E7EB",
    borderStyle: "dashed",
  },

  exportLoadingText: {
    fontSize: 16,
    fontFamily: "Inter-Medium",
    color: "#8B5CF6",
    marginTop: 12,
  },

  exportPreviewImageContainer: {
    width: 340,
    height: 240,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },

  exportFormatButtons: {
    flexDirection: "row",
    paddingHorizontal: 24,
    gap: 12,
    marginBottom: 20,
  },

  exportFormatButton: {
    flex: 1,
    borderRadius: 16,
    overflow: "hidden",
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
  },

  exportFormatButtonGradient: {
    padding: 16,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 80,
  },

  exportFormatButtonText: {
    fontSize: 16,
    fontFamily: "Inter-Bold",
    color: "#FFFFFF",
    marginTop: 8,
    marginBottom: 2,
  },

  exportFormatButtonSubtext: {
    fontSize: 12,
    fontFamily: "Inter-Medium",
    color: "rgba(255, 255, 255, 0.9)",
  },

  exportSelectionControls: {
    flexDirection: "row",
    paddingHorizontal: 24,
    gap: 12,
    marginBottom: 20,
  },

  exportSelectionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },

  exportSelectionButtonText: {
    fontSize: 14,
    fontFamily: "Inter-Medium",
    color: "#6B7280",
    marginLeft: 8,
  },

  exportActionButtons: {
    flexDirection: "row",
    paddingHorizontal: 24,
    paddingBottom: 28,
    gap: 12,
  },

  exportCancelButton: {
    flex: 1,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },

  exportCancelButtonText: {
    fontSize: 16,
    fontFamily: "Inter-SemiBold",
    color: "#6B7280",
  },

  exportSaveButton: {
    flex: 2,
    borderRadius: 16,
    overflow: "hidden",
    elevation: 6,
    shadowColor: "#8B5CF6",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
  },

  exportSaveButtonGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    paddingHorizontal: 20,
  },

  exportSaveButtonText: {
    fontSize: 16,
    fontFamily: "Inter-Bold",
    color: "#FFFFFF",
    marginLeft: 8,
  },

  exportSelectionInfo: {
    paddingHorizontal: 24,
    paddingBottom: 16,
    alignItems: "center",
  },

  exportSelectionInfoText: {
    fontSize: 13,
    fontFamily: "Inter-Regular",
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 18,
  },

  exportClearButton: {
    flex: 1,
    backgroundColor: "#FEF3C7",
    borderWidth: 1,
    borderColor: "#F59E0B",
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: 4,
  },

  exportClearButtonText: {
    fontSize: 16,
    fontFamily: "Inter-SemiBold",
    color: "#D97706",
  },
});

export default DrawingEditor;