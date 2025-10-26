import React, { useState, useCallback, useEffect, useRef, useMemo } from "react";
import {
  View,
  StyleSheet,
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
  GestureResponderEvent,
  PanResponderGestureState,
} from "react-native";
import Slider from '@react-native-community/slider';
import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { captureRef } from "react-native-view-shot";
import * as MediaLibrary from 'expo-media-library';
import { showSuccessToast, showErrorToast, showWarningToast, showInfoToast } from "../utils/ToastUtils";
import DrawingCanvas, { Stroke, DrawingTool } from "./components/DrawingCanvas";
import DrawingToolbar from "./components/DrawingToolbar";
import { useDrawingState } from "./hooks/useDrawingState";
import { DrawingStroke } from "./services/drawingAPI";
import offlineNotesService from "./services/offlineNotesService";
import { TemplateType } from "./components/TemplateOverlay";
import UnsavedChangesModal from "./components/UnsavedChangesModal";
import {
  getTemplateOptions,
  getTemplateBackgroundColor,
} from "./utils/templateConfig";
import { useNetworkStatus, getNetworkStatusText } from "./services/networkService";
import { downloadFileToDevice, saveDrawingAsJPEG, saveDrawingAsPNG } from "./utils/downloadUtils";

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
  
  // Route params loaded

  // Determine if initial data actually contains strokes
  const extractInitialStrokes = (data: any): DrawingStroke[] => {
    if (!data) return [];
    if (Array.isArray(data.strokes)) return data.strokes as DrawingStroke[];
    if (Array.isArray(data)) return data as DrawingStroke[];
    if (data.drawing_data) {
      if (typeof data.drawing_data === 'string') {
        try {
          const parsed = JSON.parse(data.drawing_data);
          return Array.isArray(parsed) ? parsed : (parsed?.strokes || []);
        } catch { return []; }
      }
      if (Array.isArray(data.drawing_data)) return data.drawing_data as DrawingStroke[];
      if (data.drawing_data?.strokes) return data.drawing_data.strokes as DrawingStroke[];
    }
    return [];
  };

  const initialStrokes = extractInitialStrokes(effectiveInitialDrawingData);

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
    // Only skip server load if we truly have non-empty initial strokes to render
    skipInitialLoad: initialStrokes.length > 0,
    autoSave: false // We'll manage autosave manually via offlineNotesService to avoid duplicate saves
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

  // Animation states using React Native's Animated (not Reanimated)
  // If you switch to Reanimated, use useSharedValue instead:
  // import { useSharedValue } from 'react-native-reanimated';
  // const fadeAnim = useSharedValue(0);
  // const slideAnim = useSharedValue(-50);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(-50)).current;

  // Drawing state
  const [currentTool, setCurrentTool] = useState<DrawingTool>('pen');
  const [currentColor, setCurrentColor] = useState('#000000');
  const [currentWidth, setCurrentWidth] = useState(2);
  const [currentZoom, setCurrentZoom] = useState(1); // Track canvas zoom level
  
  // Canvas orientation state
  const [canvasOrientation, setCanvasOrientation] = useState<'landscape' | 'portrait'>(initialOrientation);
  const [canvasRotation, setCanvasRotation] = useState(0); // Rotation angle in degrees
  const [isDropdownOpen, setIsDropdownOpen] = useState(false); // Track dropdown open state
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

  const isTablet = windowDimensions.width >= 768;
  const isSmallPhone = windowDimensions.width < 375;

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
      onStartShouldSetPanResponder: (evt: GestureResponderEvent, gestureState: PanResponderGestureState) => {
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
      onPanResponderMove: (evt: GestureResponderEvent, gestureState: PanResponderGestureState) => {
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
    // Note: If you get Reanimated warnings, this is using React Native's Animated API
    // To use Reanimated instead, you would use:
    // fadeAnim.value = withTiming(1, { duration: 600 });
    // slideAnim.value = withTiming(0, { duration: 600 });
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
      // Request write-only permissions (true = writeOnly, which includes read on iOS)
      const status = await MediaLibrary.requestPermissionsAsync(true);
      setMediaPermission(status);
      return status;
    } catch (e) {
      console.warn('Media permission request failed', e);
      return null;
    }
  }, []);

  // Helper to save an image file URI to the user's Photos/Camera Roll and optionally share it
  // Now uses unified download utility for consistent download location
  const saveImageToPhotos = useCallback(async (fileUri: string, shareAfterSave = false) => {
    try {
      const exportName = `drawing_${new Date().toISOString().replace(/[:.]/g, '-')}.png`;
      
      // Use unified download utility - automatically saves to Photos
      const result = await downloadFileToDevice({
        fileUri,
        fileName: exportName,
        fileType: 'png',
        shareAfterSave,
        showSuccessAlert: false, // We'll handle toast messages ourselves
      });

      if (result.success) {
        return result.assetUri || null;
      } else {
        showWarningToast(result.error || 'Failed to save image');
        return null;
      }
    } catch (err) {
      console.error('Failed to save image to photos', err);
      showErrorToast('Failed to save image');
      throw err;
    }
  }, []);

  useEffect(() => {
    if (showExportModal) {
      ensureMediaPermission();
    }
  }, [showExportModal, ensureMediaPermission]);

  // One-tap quick export: capture canvas and save to Photos
  const handleQuickExport = useCallback(async () => {
    setExporting(true);
    try {
      const uri = await captureRef(canvasCaptureRef.current || canvasCaptureRef, { format: 'png', quality: 1 });
      await saveImageToPhotos(uri, false);
      showSuccessToast('Saved to Photos/Downloads');
    } catch (e) {
      showErrorToast('Failed to export');
    } finally {
      setExporting(false);
    }
  }, [canvasCaptureRef, saveImageToPhotos]);

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
      // Actually erase strokes by calling eraseStrokes with the DrawingStroke
      eraseStrokes(drawingStroke);
    } else {
      // Regular stroke, add via hook; pages will sync from hook state
      addStroke(drawingStroke);
    }
  }, [addStroke, eraseStrokes, currentPageIndex]);

  // Rendering order rules to keep stacked strokes stable and predictable after erasing.
  // Policy:
  // - Highlighter sits below ink tools (pen/pencil/brush/calligraphy) so ink remains readable.
  // - Within the same tool type, newer strokes render above older ones (timestamp ascending).
  // - Preserve original order as a final tiebreaker to avoid jitter after segmentation.
  const getToolPriority = useCallback((tool?: string) => {
    switch (tool) {
      case 'highlighter':
        return 0; // lowest, drawn first (at the back)
      case 'pencil':
      case 'pen':
        return 1;
      case 'brush':
        return 2;
      case 'calligraphy':
        return 3;
      case 'eraser':
        return 4; // not typically rendered; kept highest if present
      default:
        return 2; // neutral default
    }
  }, []);

  const orderedStrokes = useMemo(() => {
    // Map with original index to ensure a stable sort
    const withIndex = strokes.map((s, i) => ({ s, i }));
    withIndex.sort((a, b) => {
      const ap = getToolPriority(a.s.tool);
      const bp = getToolPriority(b.s.tool);
      if (ap !== bp) return ap - bp; // tool priority first

      const at = a.s.timestamp ?? 0;
      const bt = b.s.timestamp ?? 0;
      if (at !== bt) return at - bt; // older under newer

      // Stable fallback by original position
      return a.i - b.i;
    });
    return withIndex.map(x => x.s);
  }, [strokes, getToolPriority]);

  // Fetch folders for folder selection using offline service
  const fetchFolders = useCallback(async () => {
    try {
      // Use offline service to fetch folders (works both online and offline)
      const data = await offlineNotesService.getAllFolders();
      
      const fetchedFolders: Folder[] = (Array.isArray(data) ? data : []).map((folder: any) => ({
        id: folder.id?.toString?.() ?? String(folder.id),
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
          const created = await offlineNotesService.createNote({
            title: drawingTitle || "Untitled Drawing",
            content: "",
            type: "drawing",
            folderId: selectedFolderId || undefined,
            tags: tags,
            drawing_data: strokes,
            template: activeTemplate,
          });
          if (created?.id) {
            setNoteId(created.id.toString());
          }
        } catch (createError) {
          // Error handled silently during auto-save
        }
      } else if (currentNoteId || effectiveNoteId) {
        // Auto-save existing drawing
        if (strokes.length > 0) {
          const id = (currentNoteId || effectiveNoteId)!.toString();
          setSyncStatus("syncing");
          try {
            await offlineNotesService.updateNote(id, {
              title: drawingTitle,
              template: activeTemplate,
              folderId: selectedFolderId || undefined,
              tags: tags,
              drawing_data: strokes,
              // Do not forcibly change type if this note was a document; only set drawing when unknown
              ...(undefined as any),
            });
            setSyncStatus(isOnline ? "saved" : "offline");
          } catch (e) {
            setSyncStatus("offline");
          }
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
    // Keep pages in sync with hook strokes (single-page source of truth)
    setPages([strokes.slice()]);
    setCurrentPageIndex(0);
  }, [strokes]);

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

  // Track when toolbar dropdowns are open to disable slider interaction
  const handleToolbarDropdownToggle = (open: boolean) => {
    setIsDropdownOpen(open);
  };

  // Initialize with provided data
  React.useEffect(() => {    
    if (effectiveInitialDrawingData) {
      // Import only if we truly have strokes to render; avoid importing empty data
      if (initialStrokes.length > 0) {
        importDrawing({ strokes: initialStrokes });
      }

      // Set the note ID if available
      if (effectiveInitialDrawingData.id && !currentNoteId) {
        // Set the current note id so subsequent saves target the correct note
        try { setNoteId(String(effectiveInitialDrawingData.id)); } catch {}
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
  }, [effectiveInitialDrawingData, initialStrokes, importDrawing]);

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

  // If offline and we have an id but empty strokes, load drawing from device cache
  useEffect(() => {
    const loadOffline = async () => {
      const id = (currentNoteId || effectiveNoteId)?.toString();
      if (!isOnline && id && strokes.length === 0) {
        try {
          const data = await offlineNotesService.getDrawing(id);
          if (data?.strokes?.length) {
            importDrawing({ strokes: data.strokes });
          }
        } catch (e) {
          // ignore
        }
      }
    };
    void loadOffline();
  }, [isOnline, currentNoteId, effectiveNoteId, strokes.length, importDrawing]);

  // Sync on reconnect
  const wasOnlineRef = useRef<boolean>(false);
  useEffect(() => {
    if (isOnline && !wasOnlineRef.current) {
      (async () => {
        try {
          const hasPending = await offlineNotesService.hasPendingChanges();
          if (hasPending) {
            setSyncStatus("syncing");
            await offlineNotesService.syncWithServer();
          }
          setSyncStatus("saved");
        } catch {
          setSyncStatus("offline");
        }
      })();
    }
    wasOnlineRef.current = isOnline;
  }, [isOnline]);

  // Periodic sync every 10s while online
  useEffect(() => {
    let h: any;
    if (isOnline) {
      h = setInterval(async () => {
        try {
          const hasPending = await offlineNotesService.hasPendingChanges();
          if (hasPending) {
            await offlineNotesService.syncWithServer();
          }
        } catch {}
      }, 10000);
    }
    return () => h && clearInterval(h);
  }, [isOnline]);

  const handleManualSave = async () => {
    try {
      const id = (currentNoteId || effectiveNoteId)?.toString();
      if (!id) {
        const created = await offlineNotesService.createNote({
          title: drawingTitle || "Untitled Drawing",
          content: "",
          type: "drawing",
          folderId: selectedFolderId || undefined,
          tags: tags,
          drawing_data: strokes,
          template: activeTemplate,
        });
        if (created?.id) setNoteId(created.id.toString());
      } else {
        await offlineNotesService.updateNote(id, {
          title: drawingTitle,
          template: activeTemplate,
          folderId: selectedFolderId || undefined,
          tags: tags,
          drawing_data: strokes,
          type: "drawing",
        });
      }
      setSyncStatus(isOnline ? "saved" : "offline");
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
        { 
          text: "Clear", 
          style: "destructive", 
          onPress: async () => {
            // Clear everything thoroughly
            setCurrentStroke(null); // Clear any current stroke
            setPages([[]]);          // Reset pages to empty array
            setCurrentPageIndex(0);  // Reset to first page
            clear();                 // Call the hook's clear function
            const id = (currentNoteId || effectiveNoteId)?.toString();
            if (id) {
              try {
                await offlineNotesService.clearDrawing(id);
                setSyncStatus(isOnline ? "saved" : "offline");
              } catch (e) {
                setSyncStatus("offline");
              }
            }
          }
        },
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
        const id = (currentNoteId || effectiveNoteId)?.toString();
        if (!id) {
          const created = await offlineNotesService.createNote({
            title: drawingTitle || "Untitled Drawing",
            content: "",
            type: "drawing",
            folderId: selectedFolderId || undefined,
            tags: tags,
            drawing_data: strokes,
            template: activeTemplate,
          });
          if (created?.id) setNoteId(created.id.toString());
        } else {
          await offlineNotesService.updateNote(id, {
            title: drawingTitle,
            template: activeTemplate,
            folderId: selectedFolderId || undefined,
            tags: tags,
            drawing_data: strokes,
            type: "drawing",
          });
        }
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
            opacity: fadeAnim, // This is correct for React Native Animated
            transform: [{ translateY: slideAnim }], // This is correct for React Native Animated
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

            {/* Canvas Rotation Slider */}
            {!readOnly && (
              <View style={styles.rotationSliderContainer}>
                <View style={styles.sliderRow}>
                  <Text style={styles.sliderMinLabel}>0°</Text>
                  <Slider
                    style={{ flex: 1, height: 18, marginHorizontal: 3 }}
                    minimumValue={0}
                    maximumValue={360}
                    step={5} // Increased step size for more skeleton-like behavior
                    value={canvasRotation}
                    onValueChange={(value) => setCanvasRotation(Math.round(value))}
                    minimumTrackTintColor="#8B5CF6"
                    maximumTrackTintColor="#E5E7EB"
                    thumbTintColor="#8B5CF6"
                    tapToSeek={true}
                    disabled={isDropdownOpen} // Disable slider when dropdown is open
                  />
                  <Text style={styles.sliderMaxLabel}>{canvasRotation}°</Text>
                </View>
              </View>
            )}

            {/* Canvas Container */}
            {/* Empty space where page tabs used to be */}
            <View style={{ height: 8 }} />

            <View style={styles.canvasSection}>
              {/* Fixed-position wrapper that doesn't rotate */}
              <View
                style={[styles.modernCanvasWrapper, { 
                  width: 800,
                  height: 600,
                }]}
                ref={canvasCaptureRef}
                onLayout={(ev) => {
                  const { width, height } = ev.nativeEvent.layout;
                  // store canvas layout for direct on-canvas selection
                  setCanvasLayout({ width, height });
                }}
              >
                {/* Inner container that rotates only the canvas content */}
                <View
                  style={{
                    width: '100%',
                    height: '100%',
                    justifyContent: 'center',
                    alignItems: 'center',
                    backgroundColor: 'transparent',
                    transform: [
                      { scale: currentZoom },
                      { rotate: canvasRotation + 'deg' }
                    ],
                  }}
                >
                  <DrawingCanvas
                    key={`canvas-${canvasRotation}`} // Only remount on rotation to avoid pinch jitter
                    // Render directly from hook state to ensure undo/redo and eraser reflect immediately
                    strokes={orderedStrokes}
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
                    canvasWidth={800}
                    canvasHeight={600}
                    onZoomChange={setCurrentZoom}
                  />
                </View>

                {/* Canvas overlay for direct selection mode */}
                {useCanvasSelection && canvasLayout && (
                  <View
                    style={{ position: 'absolute', left: 0, top: 0, width: canvasLayout.width, height: canvasLayout.height }}
                    pointerEvents={selection ? "auto" : "none"}
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
              </View>
              
              {/* Zoom Indicator */}
              {currentZoom !== 1 && (
                <View style={styles.zoomIndicator}>
                  <Text style={styles.zoomIndicatorText}>
                    {Math.round(currentZoom * 100)}%
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
          animationType="fade"
          onRequestClose={() => setShowExportModal(false)}
        >
          <KeyboardAvoidingView 
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.exportModalOverlay}
          >
            <View style={styles.exportModalContainer}>
              {/* Enhanced Header */}
              <View style={styles.exportModalHeader}>
                <LinearGradient
                  colors={["#8B5CF6", "#7C3AED"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.exportModalHeaderGradient}
                >
                  <View style={styles.exportModalIcon}>
                    <MaterialIcons name="file-download" size={28} color="#fff" />
                  </View>
                  <Text style={styles.exportModalTitle}>Export Drawing</Text>
                  <Text style={styles.exportModalSubtitle}>
                    Choose format and save your masterpiece
                  </Text>
                </LinearGradient>
                <TouchableOpacity 
                  style={styles.exportModalCloseButton}
                  onPress={() => setShowExportModal(false)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <MaterialIcons name="close" size={24} color="#FFFFFF" />
                </TouchableOpacity>
              </View>

              <ScrollView 
                style={{ maxHeight: 400 }}
                contentContainerStyle={{ paddingBottom: 16 }}
                showsVerticalScrollIndicator={false}
              >
              {/* Simplified Export Instructions */}
              <View style={styles.exportInstructionsContainer}>
                <Ionicons name="information-circle-outline" size={20} color="#8B5CF6" />
                <Text style={styles.exportInstructionsText}>
                  Select a format to export your entire canvas
                </Text>
              </View>

              {/* Format Selection with Cards */}
              <View style={styles.exportFormatSection}>
                <Text style={styles.exportSectionTitle}>Choose Export Format</Text>
                <View style={styles.exportFormatButtons}>
                  <TouchableOpacity
                    style={[styles.exportFormatButton, exportPNGUri && styles.exportFormatButtonActive]}
                    onPress={async () => {
                      setExporting(true);
                      try {
                        const uri = await captureRef(canvasCaptureRef.current || canvasCaptureRef, { format: 'png', quality: 1 });
                        const exportName = `${drawingTitle || 'drawing'}_${new Date().toISOString().replace(/[:.]/g, '-')}.png`;
                        
                        // Use unified download utility - saves to Photos/Downloads
                        const result = await saveDrawingAsPNG(uri, exportName, true);
                        
                        if (result.success) {
                          showSuccessToast('PNG saved to Photos/Downloads!');
                        } else {
                          showErrorToast(result.error || 'Failed to export PNG');
                        }
                        setShowExportModal(false);
                      } catch (e) {
                        showErrorToast('Failed to export PNG');
                      } finally { setExporting(false); }
                    }}
                  >
                    <LinearGradient
                      colors={exportPNGUri ? ["#10B981", "#059669"] : ["#10B981", "#059669"]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.exportFormatButtonGradient}
                    >
                      <MaterialIcons name="image" size={32} color="#fff" />
                      <Text style={styles.exportFormatButtonText}>PNG</Text>
                      <Text style={styles.exportFormatButtonSubtext}>Best Quality</Text>
                    </LinearGradient>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.exportFormatButton, exportJPGUri && styles.exportFormatButtonActive]}
                    onPress={async () => {
                      setExporting(true);
                      try {
                        const uri = await captureRef(canvasCaptureRef.current || canvasCaptureRef, { format: 'jpg', quality: 0.9 });
                        const exportName = `${drawingTitle || 'drawing'}_${new Date().toISOString().replace(/[:.]/g, '-')}.jpg`;
                        
                        // Use unified download utility - saves to Photos/Downloads
                        const result = await saveDrawingAsJPEG(uri, exportName, true);
                        
                        if (result.success) {
                          showSuccessToast('JPEG saved to Photos/Downloads!');
                        } else {
                          showErrorToast(result.error || 'Failed to export JPEG');
                        }
                        setShowExportModal(false);
                      } catch (e) {
                        showErrorToast('Failed to export JPEG');
                      } finally { setExporting(false); }
                    }}
                  >
                    <LinearGradient
                      colors={exportJPGUri ? ["#F59E0B", "#D97706"] : ["#F59E0B", "#D97706"]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.exportFormatButtonGradient}
                    >
                      <MaterialIcons name="photo" size={32} color="#fff" />
                      <Text style={styles.exportFormatButtonText}>JPEG</Text>
                      <Text style={styles.exportFormatButtonSubtext}>Smaller Size</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
              </View>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
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
                        {!!(folder as any).note_count && (
                          <Text style={styles.folderCardSubtitle}>
                            {(folder as any).note_count} {(folder as any).note_count === 1 ? 'item' : 'items'}
                          </Text>
                        )}
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
    overflow: "visible",
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
    backgroundColor: "transparent", // Changed from gray to transparent
    overflow: "hidden",
    // Remove flex: 1 to allow explicit sizing
  },

  // Canvas section with gesture controls
  canvasSection: {
    flex: 1,
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f3f3f3ff", // Keep this background color as it's for the fixed container
    marginVertical: 2, // Minimize vertical space
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

  // Rotation slider styles
  rotationSliderContainer: {
    backgroundColor: "transparent",
    marginVertical: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  rotationLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 4,
    textAlign: "center",
    fontFamily: "Inter-SemiBold",
  },
  sliderRow: {
    flexDirection: "row",
    alignItems: "center",
    height: 24,
  },
  sliderMinLabel: {
    fontSize: 10,
    color: "#9CA3AF",
    fontFamily: "Inter-Medium",
    minWidth: 16,
  },
  sliderMaxLabel: {
    fontSize: 10,
    color: "#8B5CF6",
    fontFamily: "Inter-SemiBold",
    minWidth: 24,
    textAlign: "right",
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
    backgroundColor: "rgba(0, 0, 0, 0.75)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 16,
  },
  
  exportModalContainer: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    width: "100%",
    maxWidth: 450,
    maxHeight: "92%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.5,
    shadowRadius: 40,
    elevation: 25,
    overflow: 'hidden',
  },

  exportModalHeader: {
    position: "relative",
  },

  exportModalHeaderGradient: {
    paddingTop: 32,
    paddingHorizontal: 24,
    paddingBottom: 24,
    alignItems: "center",
  },

  exportModalIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },

  exportModalTitle: {
    fontSize: 24,
    fontFamily: "Inter-Bold",
    color: "#FFFFFF",
    marginBottom: 6,
    textAlign: "center",
  },

  exportModalSubtitle: {
    fontSize: 14,
    fontFamily: "Inter-Regular",
    color: "rgba(255, 255, 255, 0.9)",
    textAlign: "center",
    lineHeight: 20,
  },

  exportModalCloseButton: {
    position: "absolute",
    top: 12,
    right: 12,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    justifyContent: "center",
    alignItems: "center",
  },

  // Step Indicator Styles
  exportStepContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingVertical: 20,
    backgroundColor: "#F8FAFC",
  },

  exportStepIndicator: {
    alignItems: "center",
    flex: 1,
  },

  exportStepCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#E5E7EB",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 6,
  },

  exportStepActive: {
    backgroundColor: "#8B5CF6",
  },

  exportStepNumber: {
    fontSize: 14,
    fontFamily: "Inter-Bold",
    color: "#FFFFFF",
  },

  exportStepLabel: {
    fontSize: 10,
    fontFamily: "Inter-Medium",
    color: "#6B7280",
    textAlign: "center",
  },

  exportStepDivider: {
    width: 24,
    height: 2,
    backgroundColor: "#E5E7EB",
    marginBottom: 22,
  },

  // Format Section Styles
  exportFormatSection: {
    paddingHorizontal: 24,
    paddingTop: 20,
  },

  exportSectionTitle: {
    fontSize: 16,
    fontFamily: "Inter-SemiBold",
    color: "#1F2937",
    marginBottom: 12,
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
    gap: 12,
  },

  exportFormatButton: {
    flex: 1,
    borderRadius: 16,
    overflow: "hidden",
    elevation: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    borderWidth: 2,
    borderColor: "transparent",
  },

  exportFormatButtonActive: {
    borderColor: "#8B5CF6",
    elevation: 6,
    shadowOpacity: 0.2,
  },

  exportFormatButtonGradient: {
    padding: 16,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 110,
    position: "relative",
  },

  exportFormatButtonText: {
    fontSize: 18,
    fontFamily: "Inter-Bold",
    color: "#FFFFFF",
    marginTop: 10,
    marginBottom: 4,
  },

  exportFormatButtonSubtext: {
    fontSize: 12,
    fontFamily: "Inter-Medium",
    color: "rgba(255, 255, 255, 0.9)",
  },

  exportFormatCheckmark: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 2,
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
    borderWidth: 2,
    borderColor: "#E5E7EB",
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },

  exportCancelButtonText: {
    fontSize: 16,
    fontFamily: "Inter-SemiBold",
    color: "#6B7280",
  },

  exportClearButton: {
    flex: 1,
    backgroundColor: "#FEF3C7",
    borderWidth: 2,
    borderColor: "#FCD34D",
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },

  exportClearButtonText: {
    fontSize: 16,
    fontFamily: "Inter-SemiBold",
    color: "#D97706",
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

  // New simplified export styles
  exportInstructionsContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingVertical: 16,
    backgroundColor: "#F8FAFC",
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 16,
    borderRadius: 12,
    gap: 8,
  },

  exportInstructionsText: {
    fontSize: 14,
    fontFamily: "Inter-Medium",
    color: "#6B7280",
    textAlign: "center",
  },
});

export default DrawingEditor;