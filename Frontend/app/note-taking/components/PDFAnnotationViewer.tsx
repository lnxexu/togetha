import React, { useState, useRef, useCallback, useEffect, useMemo } from "react";
import {
  View,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  Alert,
  Text,
  Modal,
  TextInput,
  ScrollView,
  Platform,
  ActivityIndicator,
  Animated,
  PanResponder,
  Easing,
  Image,
  BackHandler,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import { Ionicons, MaterialIcons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Path, Rect, Text as SvgText, G, Circle } from "react-native-svg";
import Pdf from "react-native-pdf";
import { GestureDetector, Gesture, GestureHandlerRootView } from "react-native-gesture-handler";
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedProps,
  useAnimatedReaction,
  withSpring,
  withDecay,
  runOnJS,
} from "react-native-reanimated";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system";
import * as MediaLibrary from "expo-media-library";
import { getLocalPDFPathEnhanced } from "../utils/pdfUtils";
import { PDFDocument as PDFLibDocument, rgb as pdfLibRgb } from "pdf-lib";
import * as Sharing from "expo-sharing";
import { drawingAPI, PDFSaveOptions } from "../services/drawingAPI";
import offlineNotesService from "../services/offlineNotesService";
import { API_URL, API_ENDPOINTS } from "@/constants/ApiConfig";
import { savePDFToDownloads, saveDrawingAsJPEG } from "../utils/downloadUtils";
import { showSuccessToast, showErrorToast, showInfoToast, showWarningToast } from "@/app/utils/ToastUtils";
import type { DrawingTool } from "./DrawingCanvas";
import { useNetworkStatus, getNetworkStatusText } from "../services/networkService";
import ViewShot from "react-native-view-shot";
import { RootStackParamList } from "@/app/navigation/AppNavigator";
import PDFToolbar from "./PDFToolbar";
import UnsavedChangesModal from "./UnsavedChangesModal";
// Define animated SVG Path component for live drawing
const AnimatedPath = Reanimated.createAnimatedComponent(Path);
const ReanimatedSvgPath = Reanimated.createAnimatedComponent(Path);
const AnimatedRe: any = Reanimated;
const PdfAny: any = Pdf;
// Alias for compatibility with prior code references
const PDFLibDocument = PDFDocument as any;
// WebView functionality has been removed

const { width: screenWidth, height: screenHeight } = Dimensions.get("window");

interface Annotation {
  id: string;
  type:
    | "highlight"
    | "note"
    | "text"
    | "pen"
    | "brush"
    | "pencil"
    | "selection";
  page: number;
  x: number; // Percentage of PDF page width (0-1)
  y: number; // Percentage of PDF page height (0-1)
  width?: number; // Percentage of PDF page width (0-1)
  height?: number; // Percentage of PDF page height (0-1)
  color: string;
  text?: string;
  path?: string; // SVG path with normalized coordinates (0-1)
  strokeWidth?: number;
  opacity?: number;
  pressure?: number[];
  timestamp: number;
  // Legacy fields - kept for backward compatibility
  zoomLevel?: number;
  pdfScale?: number;
}

interface Stroke {
  id: string;
  points: { x: number; y: number }[];
  color?: string;
  width?: number;
  page?: number;
  timestamp?: number;
}

interface PDFAnnotationViewerProps {
  source: { uri: string };
  fileName: string;
  onClose: () => void;
  noteId?: string; // Optional note ID for backend integration
  docId?: string; // Optional backend RAG document id
  enableDirectSave?: boolean; // Whether to save annotations directly to PDF
  autoSave?: boolean; // Whether to auto-save annotations
  annotations?: Annotation[]; // External annotations to load
  onAnnotationChange?: (annotations: Annotation[]) => void; // Callback when annotations change
  networkStatus?: any; // Network status object
  saveStatus?: any; // Save status object
  strokes?: Stroke[]; // Drawing strokes to render on top of PDF
}

const ANNOTATION_COLORS = [
  "#FFD700", // Gold
  "#FF6B6B", // Coral Red
  "#4ECDC4", // Turquoise
  "#45B7D1", // Sky Blue
  "#96CEB4", // Mint Green
  "#FECA57", // Sunny Yellow
  "#FF9FF3", // Pink
  "#A8E6CF", // Light Green
];

// Configuration: default for whether visual thickness / font sizes scale with PDF zoom.
// When false, annotations remain visually stable (positions still follow zoom via coordinate conversion)
// preventing highlights, pen strokes, note bubbles from becoming thicker when zooming.
const DEFAULT_SCALE_STROKES_WITH_ZOOM = true;
// Consider extremely large PDFs as potential memory hazards when stacked vertically.
// Defaults; can be overridden via settings UI and persisted
const DEFAULT_LARGE_PDF_PAGE_THRESHOLD = 40; // lower threshold for older/low-memory devices
const DEFAULT_MAX_CONTENT_HEIGHT_PX = 250000; // hard cap to avoid massive stacked views

// --- Drawing Stroke Helpers ---
const pointsToPath = (pts: { x: number; y: number }[]) => {
  if (!pts || pts.length === 0) return "";
  let d = `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`;
  for (let i = 1; i < pts.length; i++) {
    d += ` L ${pts[i].x.toFixed(2)} ${pts[i].y.toFixed(2)}`;
  }
  return d;
};

const mapPointsToDisplay = (
  points: { x: number; y: number }[],
  pageDisplayWidth: number,
  pageDisplayHeight: number,
  isNormalized = false
): { x: number; y: number }[] => {
  if (!points) return [];
  if (isNormalized) {
    return points.map((p) => ({
      x: p.x * pageDisplayWidth,
      y: p.y * pageDisplayHeight,
    }));
  }
  return points;
};

// Simplify points by uniform decimation to a maximum number of points.
// This is cheap and avoids heavy RDP computations while keeping stroke shape.
const simplifyPoints = (pts: { x: number; y: number }[], maxPoints = 300) => {
  if (!pts || pts.length <= maxPoints) return pts;
  const step = Math.ceil(pts.length / maxPoints);
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < pts.length; i += step) {
    out.push(pts[i]);
  }
  // ensure last point is included
  if (out.length === 0 || out[out.length - 1] !== pts[pts.length - 1])
    out.push(pts[pts.length - 1]);
  return out;
};

// Variant that preserves optional timestamp field
const simplifyPointsWithTimestamp = (
  pts: { x: number; y: number; timestamp?: number }[],
  maxPoints = 300
) => {
  if (!pts || pts.length <= maxPoints) return pts;
  const step = Math.ceil(pts.length / maxPoints);
  const out: { x: number; y: number; timestamp?: number }[] = [];
  for (let i = 0; i < pts.length; i += step) {
    out.push(pts[i]);
  }
  if (out.length === 0 || out[out.length - 1] !== pts[pts.length - 1])
    out.push(pts[pts.length - 1]);
  return out;
};

const PDFAnnotationViewer: React.FC<PDFAnnotationViewerProps> = ({
  source,
  fileName,
  onClose,
  noteId,
  docId,
  enableDirectSave = true,
  autoSave = true,
  annotations: externalAnnotations,
  onAnnotationChange,
  networkStatus: externalNetworkStatus,
  saveStatus,
  strokes,
}) => {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [currentNoteId, setCurrentNoteId] = useState<string | undefined>(noteId);
  
  // Performance: Path conversion cache to avoid recomputing on every render
  const pathConversionCache = useRef<Map<string, string>>(new Map());
  const maxCacheSize = 500; // Limit cache size to prevent memory issues
  
  // Runtime toggle for stroke scaling behavior
  const [scaleStrokesWithZoom, setScaleStrokesWithZoom] = useState<boolean>(
    DEFAULT_SCALE_STROKES_WITH_ZOOM
  );
  const [currentPage, setCurrentPage] = useState(1); // UI no longer uses this; kept for backward compat
  const [totalPages, setTotalPages] = useState(0); // UI no longer uses this; kept for backward compat
  const currentPageRef = useRef(1);
  const totalPagesRef = useRef(0);
  const [selectedTool, setSelectedTool] = useState<
    | "highlight"
    | "note"
    | "text"
    | "eraser"
    | "pen"
    | "brush"
    | "pencil"
    | "selection"
    | "textSelect"
    | null
  >(null);
  const [strokeWidth, setStrokeWidth] = useState(3);
  const [selectedColor, setSelectedColor] = useState(ANNOTATION_COLORS[0]);
  const [highlightOpacity, setHighlightOpacity] = useState(0.45);
  const [eraserSize, setEraserSize] = useState(0.05);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentPath, setCurrentPath] = useState("");
  const currentPathRef = useRef("");
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [notePosition, setNotePosition] = useState({ x: 0, y: 0, page: 1 });
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const fadeAnim = useState(new Animated.Value(0))[0];
  const slideAnim = useState(new Animated.Value(-50))[0];
  const spinnerRotate = useRef(new Animated.Value(0)).current;
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  // Edit/View mode: default to View on first encounter
  const [isEditMode, setIsEditMode] = useState(false);
  // Remember last non-null drawing tool to restore when re-entering Edit mode
  const lastEditToolRef = useRef<"pen" | "pencil" | "brush" | "highlight" | "eraser">("pen");
  // Store original screen coordinates for page detection
  const currentScreenPointsRef = useRef<{ x: number; y: number; timestamp?: number }[]>([]);
  // Live drawing optimization: incremental smoothing to avoid recalculating full path every frame
  const USE_INCREMENTAL_SMOOTHING = true;
  const livePathRef = useRef<string>("");
  const incLastPointRef = useRef<{ x: number; y: number } | null>(null);
  const incLastMidRef = useRef<{ x: number; y: number } | null>(null);
  // UI chrome visibility (focus mode)
  const [uiHidden, setUiHidden] = useState(false);
  const wasAutoHiddenRef = useRef(false);
  const [toolbarCollapsed, setToolbarCollapsed] = useState(false);
  // Toolbox modal
  const [showToolbox, setShowToolbox] = useState(false);

  // WebView functionality has been removed

  // Text selection state (using alternative approach since react-native-pdf doesn't support text selection)
  const [selectedText, setSelectedText] = useState<string>("");
  const [selectionRect, setSelectionRect] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const [showAskRinaPopup, setShowAskRinaPopup] = useState(false);
  const [showAskRinaModal, setShowAskRinaModal] = useState(false);
  const [rinaQuery, setRinaQuery] = useState("");

  // Persist per-tool settings (stroke width, color, eraser size, highlight opacity)
  const settingsKey = useMemo(() => {
    const keyBase = source?.uri || "default";
    return `pdf_tool_settings_${keyBase}`;
  }, [source?.uri]);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(settingsKey);
        if (raw) {
          const stored = JSON.parse(raw) as {
            strokeWidth?: number;
            selectedColor?: string;
            eraserSize?: number;
            highlightOpacity?: number;
          };
          if (typeof stored.strokeWidth === "number") setStrokeWidth(stored.strokeWidth);
          if (typeof stored.selectedColor === "string") setSelectedColor(stored.selectedColor);
          if (typeof stored.eraserSize === "number") setEraserSize(Math.max(0.01, Math.min(0.15, stored.eraserSize)));
          if (typeof stored.highlightOpacity === "number") setHighlightOpacity(Math.max(0.1, Math.min(1, stored.highlightOpacity)));
        }
      } catch (e) {
        console.warn("Failed to load tool settings", e);
      }
    })();
  }, [settingsKey]);

  const persistSettings = useCallback(async (partial: Partial<{ strokeWidth: number; selectedColor: string; eraserSize: number; highlightOpacity: number }>) => {
    try {
      const raw = await AsyncStorage.getItem(settingsKey);
      const prev = raw ? JSON.parse(raw) : {};
      const next = { ...prev, ...partial };
      await AsyncStorage.setItem(settingsKey, JSON.stringify(next));
    } catch (e) {
      console.warn("Failed to save tool settings", e);
    }
  }, [settingsKey]);

  useEffect(() => { persistSettings({ strokeWidth }); }, [strokeWidth, persistSettings]);
  useEffect(() => { persistSettings({ selectedColor }); }, [selectedColor, persistSettings]);
  useEffect(() => { persistSettings({ eraserSize }); }, [eraserSize, persistSettings]);
  useEffect(() => { persistSettings({ highlightOpacity }); }, [highlightOpacity, persistSettings]);

  // Text extraction modal states
  const [showTextExtractionModal, setShowTextExtractionModal] = useState(false);
  const [isExtractingText, setIsExtractingText] = useState(false);
  const [extractedText, setExtractedText] = useState("");

  // Placeholder helper used in debug logging paths
  const debugPDFCoordinates = (..._args: any[]) => {};

  // Bbox selection state for textSelect mode
  const [isBboxDrawing, setIsBboxDrawing] = useState(false);
  const [bboxStart, setBboxStart] = useState<{ x: number; y: number } | null>(
    null
  );
  const [currentBbox, setCurrentBbox] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const [showTextPreviewModal, setShowTextPreviewModal] = useState(false);
  const [previewExtractedText, setPreviewExtractedText] = useState<string>("");

  // AI Assistant modal state
  const [showAIModal, setShowAIModal] = useState(false);
  const [aiMessage, setAiMessage] = useState<string>("");
  const [aiModalAnimation] = useState(new Animated.Value(0));
  const [chatMessages, setChatMessages] = useState<
    Array<{ type: "user" | "ai"; text: string }>
  >([{ type: "ai", text: "How can I help you with this document?" }]);
  const chatScrollViewRef = useRef<ScrollView>(null);

  // Toolbar integration helpers
  type ToolbarTool = DrawingTool;
  const mapToolbarToolToViewer = (t: ToolbarTool): typeof selectedTool => {
    switch (t) {
      case "pen":
        return "pen";
      case "pencil":
        return "pencil";
      case "brush":
        return "brush";
      case "highlighter":
        return "highlight";
      case "calligraphy":
        // Map calligraphy to brush for now
        return "brush";
      case "eraser":
        return "eraser";
      default:
        return null;
    }
  };
  const mapViewerToolToToolbar = (): ToolbarTool => {
    switch (selectedTool) {
      case "pen":
        return "pen";
      case "pencil":
        return "pencil";
      case "brush":
        return "brush";
      case "highlight":
        return "highlighter";
      case "eraser":
        return "eraser";
      default:
        return "pen";
    }
  };

  const handleToolbarToolChange = (t: ToolbarTool) => {
    // Choosing a tool should enter Edit mode
    if (!isEditMode) setIsEditMode(true);
    // Remember this tool for future when toggling back to Edit
    if (t !== "calligraphy") {
      lastEditToolRef.current =
        t === "highlighter" ? "highlight" : (t as any);
    }
    setSelectedTool(mapToolbarToolToViewer(t));
  };

  // Keep mode consistent if selectedTool is cleared elsewhere
  useEffect(() => {
    if (!isEditMode) return;
    if (selectedTool === null) {
      // Still in edit mode but no tool: keep as selection (view-like) but allow pinch-zoom overlay
      // No change needed; scroll enabling logic already handles this case
    }
  }, [selectedTool, isEditMode]);

  const handleToolbarColorChange = (color: string) => {
    setSelectedColor(color);
  };

  const handleToolbarWidthChange = (width: number) => {
    setStrokeWidth(width);
  };

  // Toggle between Edit and View modes
  const handleModeToggle = useCallback(() => {
    const next = !isEditMode;
    setIsEditMode(next);
    if (next) {
      // Entering Edit: ensure a drawing tool is selected
      if (selectedTool === null) {
        const tool = lastEditToolRef.current;
        setSelectedTool(tool as any);
      }
    } else {
      // Entering View: clear drawing state and disable tools
      if (isDrawing) {
        setIsDrawing(false);
      }
      setCurrentPath("");
      currentPathRef.current = "";
      try {
        svLivePath.value = "";
      } catch {}
      setSelectedTool(null);
      setShouldCaptureGestures(false);
    }
  }, [isEditMode, selectedTool, isDrawing]);

  const handleToolbarUndo = () => handleUndo();
  const handleToolbarRedo = () => handleRedo();
  const handleToolbarClear = () => handleClearAllAnnotations();

  // Quick Export: capture current view as image to Photos
  const handleToolbarQuickExport = async () => {
    try {
      if (viewShotRef.current) {
        showInfoToast("Capturing snapshot...");
        const uri = await viewShotRef.current.capture?.();
        if (uri) {
          const exportName = `${fileName.replace(/\.[^/.]+$/, "")}_snapshot.jpg`;
          const result = await saveDrawingAsJPEG(uri, exportName, false);
          
          if (!result.success) {
            showErrorToast(result.error || "Could not save snapshot");
          }
          // Success toast is handled by downloadUtils
        }
      }
    } catch (e) {
      console.warn("Quick export failed", e);
      showErrorToast("Could not save snapshot");
    }
  };

  // Image import: inserted as a note-like image annotation at current page center (placeholder impl)
  const handleToolbarImageImport = async (imageUri: string) => {
    try {
      // For now, drop a note annotation containing the image URI as text; can be extended to true image annotations
      const { normalizedX, normalizedY } = screenToPDFCoordinates(
        (pdfViewerBounds?.width || screenWidth) / 2,
        (pdfViewerBounds?.height || screenHeight) / 2
      );
      const newNote: Annotation = {
        id: `img-${Date.now()}`,
        type: "note",
        page: currentPageRef.current || 1,
        x: normalizedX,
        y: normalizedY,
        color: selectedColor,
        text: imageUri,
        createdAt: Date.now(),
      } as any;
      // Record current annotations to undo stack and clear redo stack
      try {
        undoStackRef.current.push(JSON.parse(JSON.stringify(annotations || [])));
        if (undoStackRef.current.length > 50) undoStackRef.current.shift();
        redoStackRef.current = [];
        setCanUndo(undoStackRef.current.length > 0);
        setCanRedo(false);
      } catch (historyErr) {
        console.warn("Failed to push to undo stack (image import):", historyErr);
      }
      // Apply new note
      updateAnnotations((prev) => [...prev, newNote]);
      setHasUnsavedChanges(true);
    } catch (e) {
      console.warn("Image import mapping failed", e);
    }
  };

  // Floating button position state
  const [buttonPosition, setButtonPosition] = useState({
    x: Math.max(20, screenWidth - 76),
    y: 100,
  });
  const buttonPositionRef = useRef({
    x: Math.max(20, screenWidth - 76),
    y: 100,
  });
  const [isDraggingButton, setIsDraggingButton] = useState(false);
  const buttonPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        setIsDraggingButton(true);
      },
      onPanResponderMove: (_, gestureState) => {
        // Update button position based on drag
        buttonPositionRef.current = {
          x: Math.max(
            10,
            Math.min(
              screenWidth - 66,
              buttonPositionRef.current.x + gestureState.dx
            )
          ),
          y: Math.max(
            80,
            Math.min(
              screenHeight - 180,
              buttonPositionRef.current.y + gestureState.dy
            )
          ),
        };
        setButtonPosition(buttonPositionRef.current);
      },
      onPanResponderRelease: (_, __) => {
        setIsDraggingButton(false);
      },
      onPanResponderTerminate: () => {
        setIsDraggingButton(false);
      },
    })
  ).current;

  // Ultra-optimized path update function for lag-free drawing
  const updatePathWithAnimation = useCallback(() => {
    if (currentPointsRef.current.length === 0) return;

    const updatePath = () => {
      if (!currentPointsRef.current.length) return;

      const now = performance.now();

  // Target a balanced refresh rate: 90fps on high-end, ~60-75fps otherwise
  const targetFrameTime = window.screen?.height > 1920 ? 11 : 14; // ~90fps : ~70fps

      if (now - lastRenderTimeRef.current < targetFrameTime) {
        // Schedule next frame immediately for smoothest possible drawing
        animationFrameRef.current = requestAnimationFrame(updatePath);
        return;
      }

      const pointsLength = currentPointsRef.current.length;

      // Only recalculate if we have new points or significant changes
      if (pointsLength === pointsCountRef.current && pathCacheRef.current) {
        lastRenderTimeRef.current = now;
        animationFrameRef.current = requestAnimationFrame(updatePath);
        return;
      }

      // Dynamic smoothing based on drawing speed and point density
      let adaptiveSmoothing = smoothingLevelRef.current;
      if (pointsLength > 50) {
        // Reduce smoothing calculations for long strokes to maintain performance
        adaptiveSmoothing = Math.max(
          4,
          smoothingLevelRef.current - Math.floor(pointsLength / 100)
        );
      }

      // Simplify large live point buffers before expensive smoothing to save CPU
      const simplifiedLive = simplifyPointsWithTimestamp(
        currentPointsRef.current,
        320
      );

      // Calculate the smoothed path with adaptive parameters
      const smooth = convertPointsToSmoothedPath(
        simplifiedLive as any,
        adaptiveSmoothing
      );

      // Cache the result to avoid redundant calculations
      pathCacheRef.current = smooth;
      pointsCountRef.current = pointsLength;

      // Update the immediate ref for zero-lag access
      currentPathRef.current = smooth;

      // Throttle React state updates to ~30fps to avoid JS-thread churn on low-end devices
      const nowMs = Date.now();
      if (!lastSetTimeRef.current || nowMs - lastSetTimeRef.current >= 33) {
        setCurrentPath(smooth);
        lastSetTimeRef.current = nowMs;
      }

      // Also update the shared stroke path cache so live-drawing uses same cached paths
      try {
  const liveKey = `live-${currentPageRef.current}`;
        if ((strokePathCacheRef as any)?.current instanceof Map) {
          (strokePathCacheRef as any).current.set(liveKey, smooth);
        }
      } catch (e) {
        // ignore cache errors
      }

      lastRenderTimeRef.current = now;

      // Continue the render loop for real-time updates
      if (pendingPathUpdateRef.current) {
        animationFrameRef.current = requestAnimationFrame(updatePath);
      }
    };

    if (!pendingPathUpdateRef.current) {
      pendingPathUpdateRef.current = true;
      animationFrameRef.current = requestAnimationFrame(updatePath);
    }
  }, []);

  // Shared stroke path cache for both saved strokes and live in-progress strokes
  const strokePathCacheRef = useRef<Map<string, string>>(new Map());

  // Live path driven by Reanimated to avoid React re-renders
  const svLivePath = useSharedValue("");
  const svLiveStrokeColor = useSharedValue<string>(selectedColor);
  const svLiveStrokeWidth = useSharedValue<number>(strokeWidth);
  const svLiveOpacity = useSharedValue<number>(0.95);
  const svLiveHaloOpacity = useSharedValue<number>(1);
  const livePathAnimatedProps = useAnimatedProps(() => ({
    d: svLivePath.value,
    stroke: svLiveStrokeColor.value as any,
    strokeWidth: svLiveStrokeWidth.value,
    opacity: svLiveOpacity.value,
    strokeLinecap: "round" as any,
    strokeLinejoin: "round" as any,
    strokeMiterlimit: 10 as any,
    fill: "none" as any,
  }));

  // Halo paths to improve contrast while drawing
  const liveHaloOuterProps = useAnimatedProps(() => ({
    d: svLivePath.value,
    stroke: ("rgba(0,0,0,0.28)" as unknown) as any,
    strokeWidth: svLiveStrokeWidth.value + 6,
    opacity: svLiveHaloOpacity.value,
    strokeLinecap: "round" as any,
    strokeLinejoin: "round" as any,
    strokeMiterlimit: 10 as any,
    fill: "none" as any,
  }));
  const liveHaloInnerProps = useAnimatedProps(() => ({
    d: svLivePath.value,
    stroke: ("rgba(255,255,255,0.75)" as unknown) as any,
    strokeWidth: svLiveStrokeWidth.value + 3,
    opacity: svLiveHaloOpacity.value,
    strokeLinecap: "round" as any,
    strokeLinejoin: "round" as any,
    strokeMiterlimit: 10 as any,
    fill: "none" as any,
  }));

  // Sync live stroke style with current tool settings
  useEffect(() => {
    svLiveStrokeColor.value = selectedColor;
  }, [selectedColor]);
  useEffect(() => {
    const base =
      selectedTool === "brush"
        ? strokeWidth * 1.8
        : selectedTool === "pencil"
        ? strokeWidth * 0.8
        : strokeWidth;
    svLiveStrokeWidth.value = base;
  }, [strokeWidth, selectedTool]);
  useEffect(() => {
    svLiveOpacity.value = selectedTool === "highlight" ? Math.max(0.1, Math.min(1, highlightOpacity)) : 0.95;
  }, [selectedTool, highlightOpacity]);
  useEffect(() => {
    // Keep halos subtle for highlights, full for pen/brush/pencil
    svLiveHaloOpacity.value = selectedTool === "highlight" ? 0.35 : 1;
  }, [selectedTool]);

  // (moved) Precompute and cache stroke paths when strokes or layout change so rendering is cheap

  // Single zoom state - simplified approach from DrawingEditor
  const [currentZoom, setCurrentZoom] = useState(1); // Track PDF zoom level

  // When zoom or toggle changes, update live stroke width to reflect scaling behavior
  useEffect(() => {
    const base =
      selectedTool === "brush"
        ? strokeWidth * 1.8
        : selectedTool === "pencil"
        ? strokeWidth * 0.8
        : strokeWidth;
    svLiveStrokeWidth.value = scaleStrokesWithZoom
      ? base * (currentZoom || 1)
      : base;
  }, [currentZoom, scaleStrokesWithZoom, selectedTool, strokeWidth]);

  // PDF transformation state with pan support
  const [pdfTransform, setPdfTransform] = useState({
    scale: 1,
    translateX: 0,
    translateY: 0,
  });
  // Track active pinch to temporarily disable ScrollView and reduce jitter
  const [isPinching, setIsPinching] = useState(false);
  // Keep a mutable ref of the transform for synchronous updates inside gesture handlers
  const pdfTransformRef = useRef(pdfTransform);
  useEffect(() => {
    pdfTransformRef.current = pdfTransform;
  }, [pdfTransform]);

  // Clean up animation frames on unmount
  useEffect(() => {
    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  // Canvas-like container dimensions
  const [containerSize, setContainerSize] = useState({
    width: screenWidth,
    height: screenHeight,
  });
  const pdfContainerRef = useRef<View>(null);
  const pdfScrollRef = useRef<ScrollView>(null);
  const [pdfContainerLayout, setPdfContainerLayout] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);

  // (moved) Precompute and cache stroke paths when strokes or layout change so rendering is cheap

  // Animated values for smooth pan/zoom transitions during gestures
  // (Deprecated by Reanimated-based transforms)
  const animatedTranslateX = useRef(new Animated.Value(0)).current;
  const animatedTranslateY = useRef(new Animated.Value(0)).current;
  const animatedScale = useRef(new Animated.Value(1)).current;

  // Finish animation config - change type to 'spring' or 'timing'.
  // tuning: for 'spring' adjust speed/bounciness; for 'timing' adjust duration/easing.
  const FINISH_ANIMATION: {
    type: "spring" | "timing";
    springConfig?: { speed?: number; bounciness?: number };
    timingConfig?: { duration?: number };
  } = {
    type: "spring",
    springConfig: { speed: 14, bounciness: 6 },
    timingConfig: { duration: 180 },
  };

  const USE_NATIVE_TRANSFORM_ANIMATIONS = Platform.OS !== "android";

  const animateToFinal = (
    final: { scale: number; translateX: number; translateY: number },
    callback?: () => void
  ) => {
    // Reanimated spring for transform completion
    svScale.value = withSpring(final.scale, { damping: 18, stiffness: 180 });
    svTranslateX.value = withSpring(final.translateX, {
      damping: 18,
      stiffness: 180,
    });
    svTranslateY.value = withSpring(final.translateY, {
      damping: 18,
      stiffness: 180,
    });
    // Sync JS state after spring (approximate via runOnJS at end of current tick)
    const sync = () => {
      setCurrentZoom(final.scale);
      setPdfTransform(final);
      callback?.();
    };
    runOnJS(sync)();
  };

  // helper to show/hide page HUD
  // Page HUD removed

  // Sync animated values to pdfTransform state with immediate updates for real-time responsiveness
  useEffect(() => {
    // Keep legacy Animated values in sync (for any residual UI),
    // and update Reanimated shared values as the single source of truth.
    animatedTranslateX.setValue(pdfTransform.translateX);
    animatedTranslateY.setValue(pdfTransform.translateY);
    animatedScale.setValue(pdfTransform.scale);
    svScale.value = pdfTransform.scale;
    svTranslateX.value = pdfTransform.translateX;
    svTranslateY.value = pdfTransform.translateY;
  }, [pdfTransform.translateX, pdfTransform.translateY, pdfTransform.scale]);

  // Reduce motion: disable page transition animations
  const [pageOpacity] = useState(new Animated.Value(1));
  // Removed annotation animations to make annotations static
  // Dynamically control whether the gesture overlay should capture touches
  const [shouldCaptureGestures, setShouldCaptureGestures] = useState(false);
  const pinchHysteresisTimerRef = useRef<any>(null);

  // Keep page fully opaque; no scale/rotate animations on page changes
  useEffect(() => {
    pageOpacity.setValue(1);
  }, [currentPage, pageOpacity]);

  // Gesture handling refs - from DrawingEditor approach
  const gestureStartZoomRef = useRef(1);
  const gestureStartDistanceRef = useRef(0);
  // Track latest zoom in a ref so panResponder sees updates
  const currentZoomRef = useRef(currentZoom);
  useEffect(() => {
    currentZoomRef.current = currentZoom;
  }, [currentZoom]);

  // Performance: Clear path cache when zoom or container size changes significantly
  const lastZoomForCache = useRef(currentZoom);
  const lastContainerSizeForCache = useRef({ width: 0, height: 0 });
  useEffect(() => {
    const zoomChanged = Math.abs(currentZoom - lastZoomForCache.current) > 0.1;
    const sizeChanged = 
      Math.abs(containerSize.width - lastContainerSizeForCache.current.width) > 10 ||
      Math.abs(containerSize.height - lastContainerSizeForCache.current.height) > 10;
    
    if (zoomChanged || sizeChanged) {
      pathConversionCache.current.clear();
      lastZoomForCache.current = currentZoom;
      lastContainerSizeForCache.current = containerSize;
      if (__DEV__) {
        console.log('🔄 Path cache cleared due to layout change');
      }
    }
  }, [currentZoom, containerSize.width, containerSize.height]);

  // For panning when zoomed
  const gestureStartTranslateRef = useRef({ x: 0, y: 0 });
  const gestureStartTouchRef = useRef({ x: 0, y: 0 });

  // Buffer points for current freehand drawing so we can generate a smoothed path
  const currentPointsRef = useRef<
    { x: number; y: number; timestamp?: number }[]
  >([]);
  // Eraser size (normalized influence radius) - defined earlier with tool settings
  const animationFrameRef = useRef<number | null>(null);
  const lastRenderTimeRef = useRef<number>(0);
  const pendingPathUpdateRef = useRef<boolean>(false);
  const pathCacheRef = useRef<string>("");
  const pointsCountRef = useRef<number>(0);
  const smoothingLevelRef = useRef<number>(8);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const lastSetTimeRef = useRef<number | null>(null);

  // Midpoint tracking for pinch-to-zoom focal point preservation
  const gestureMidpointRef = useRef({ x: 0, y: 0 }); // screen coords
  const gestureMidpointPdfRef = useRef({ x: 0, y: 0 }); // container/pdf coords

  // Scale constants
  // Enforce min zoom at 100% (no zoom-out)
  const MIN_PDF_SCALE = 1.0;
  const MAX_PDF_SCALE = 3.0; // Match DrawingEditor limit
  // Pinch sensitivity gain (>1 accelerates). Keep 1.0 to avoid violent shaking.
  const PINCH_SENSITIVITY = 1.0;
  // Smoothing factors to reduce shake during pinch
  const PINCH_SMOOTH_SCALE = 0.25; // 0..1
  const PINCH_SMOOTH_TRANSLATION = 0.30; // 0..1
  // Pan sensitivity tuning
  const PAN_MIN_DISTANCE = 1; // pixels to activate pan quickly
  const PAN_ACTIVE_OFFSET_X = 3; // activate when horizontal exceeds ~3px
  const PAN_X_GAIN = 1.15; // slightly amplify horizontal movement for sensitivity
  const PAN_Y_GAIN = 1.0; // keep vertical neutral

  // Reanimated shared values for better gesture performance
  const svScale = useSharedValue(1);
  const svTranslateX = useSharedValue(0);
  const svTranslateY = useSharedValue(0);
  const svContainerW = useSharedValue(screenWidth);
  const svContainerH = useSharedValue(screenHeight);
  const svStartScale = useSharedValue(1);
  const svAnchorX = useSharedValue(0);
  const svAnchorY = useSharedValue(0);
  const svStartTX = useSharedValue(0);
  const svStartTY = useSharedValue(0);
  // Absolute window offset of the transform container (for mapping pageX/pageY)
  const transformContainerRef = useRef<any>(null);
  const containerWindowOffsetRef = useRef<{ left: number; top: number; width: number; height: number }>({ left: 0, top: 0, width: 0, height: 0 });

  // Mirror animated transform into a JS ref so coordinate mapping during drawing is accurate.
  const liveTransformRef = useRef({ scale: 1, translateX: 0, translateY: 0 });
  const updateLiveTransform = useCallback((scale: number, translateX: number, translateY: number) => {
    liveTransformRef.current = { scale, translateX, translateY };
  }, []);

  // Keep JS ref in sync with Reanimated shared values in real time (runs on UI thread, updates JS via runOnJS)
  useAnimatedReaction(
    () => ({ s: svScale.value, tx: svTranslateX.value, ty: svTranslateY.value }),
    (vals) => {
      runOnJS(updateLiveTransform)(vals.s, vals.tx, vals.ty);
    }
  );

  // Animated style for the PDF + annotations transform container
  const pdfAnimatedStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { scale: svScale.value },
        { translateX: svTranslateX.value },
        { translateY: svTranslateY.value },
      ],
      backfaceVisibility: "hidden",
    } as any;
  });

  // Utility in worklet context
  const clamp = (v: number, min: number, max: number) => {
    "worklet";
    return Math.max(min, Math.min(max, v));
  };

  // Pinch-to-zoom gesture using Reanimated + RNGH
  const pinchGesture = useMemo(() => {
    return Gesture.Pinch()
      .shouldCancelWhenOutside(false)
      .enabled(!isEditMode || selectedTool === null) // Disable pinch when drawing tools are active
      .onStart((e: any) => {
        'worklet';
        svStartScale.value = svScale.value;
        // Compute anchor point in content coords
        svAnchorX.value = (e.focalX - svTranslateX.value) / svScale.value;
        svAnchorY.value = (e.focalY - svTranslateY.value) / svScale.value;
        runOnJS(setShouldCaptureGestures)(true);
        runOnJS(setIsPinching)(true);
      })
      .onUpdate((e: any) => {
        'worklet';
        // Apply gain then clamp target scale
        const gainedScale = Math.pow(e.scale || 1, PINCH_SENSITIVITY);
        const nextScaleRaw = clamp(
          svStartScale.value * gainedScale,
          MIN_PDF_SCALE,
          MAX_PDF_SCALE
        );
        // Smooth scale to reduce shake
        const smoothedScale = svScale.value + PINCH_SMOOTH_SCALE * (nextScaleRaw - svScale.value);
        // Compute target translation from smoothed scale (anchor at focal)
        const targetTX = e.focalX - svAnchorX.value * smoothedScale;
        const targetTY = e.focalY - svAnchorY.value * smoothedScale;
        // Soft clamp with small margin
        const maxOffsetX = (svContainerW.value * (smoothedScale - 1)) / 2;
        const maxOffsetY = (svContainerH.value * (smoothedScale - 1)) / 2;
        const margin = 6;
        const softClamp = (v: number, min: number, max: number) => {
          'worklet';
          if (v < min - margin) return min - margin;
          if (v > max + margin) return max + margin;
          return v;
        };
        const targetTXClamped = softClamp(targetTX, -maxOffsetX, maxOffsetX);
        const targetTYClamped = softClamp(targetTY, -maxOffsetY, maxOffsetY);
        // Smooth translation toward target to avoid jitter
        svScale.value = smoothedScale;
        svTranslateX.value = svTranslateX.value + PINCH_SMOOTH_TRANSLATION * (targetTXClamped - svTranslateX.value);
        svTranslateY.value = svTranslateY.value + PINCH_SMOOTH_TRANSLATION * (targetTYClamped - svTranslateY.value);
      })
      .onEnd(() => {
        'worklet';
        // On end, clamp strictly to bounds and spring to reduce wobble
        const scale = svScale.value || 1;
        const maxOffsetX = (svContainerW.value * (scale - 1)) / 2;
        const maxOffsetY = (svContainerH.value * (scale - 1)) / 2;
        const clampedTX = clamp(svTranslateX.value, -maxOffsetX, maxOffsetX);
        const clampedTY = clamp(svTranslateY.value, -maxOffsetY, maxOffsetY);
  svTranslateX.value = withSpring(clampedTX, { damping: 20, stiffness: 200 });
  svTranslateY.value = withSpring(clampedTY, { damping: 20, stiffness: 200 });
        // Sync JS state with final values
        runOnJS(setCurrentZoom)(scale);
        runOnJS(setPdfTransform)({ scale, translateX: clampedTX, translateY: clampedTY });
        runOnJS(setIsPinching)(false);
      });
  }, [MIN_PDF_SCALE, MAX_PDF_SCALE, isEditMode, selectedTool]);

  // One-finger pan:
  // - View mode: allow panning at any zoom (including < 1 and > 1) when no tool is active
  // - Edit mode: allow panning only when zoomed in (> 1), to avoid interfering with drawing
  const panEnabled = (!isEditMode && selectedTool === null) || (selectedTool === null && currentZoom > 1);
  const panGesture = useMemo(() => {
    return Gesture.Pan()
      .shouldCancelWhenOutside(false)
      .enabled(panEnabled)
      .minDistance(PAN_MIN_DISTANCE)
      .activeOffsetX([-PAN_ACTIVE_OFFSET_X, PAN_ACTIVE_OFFSET_X])
      .minPointers(1)
      .maxPointers(1)
      .onStart(() => {
        'worklet';
        svStartTX.value = svTranslateX.value;
        svStartTY.value = svTranslateY.value;
        // Temporarily disable ScrollView while panning to avoid conflicts
        runOnJS(setShouldCaptureGestures)(true);
      })
      .onUpdate((e) => {
        'worklet';
        const scale = svScale.value || 1;
        // Compute symmetric clamps for both zoomed-in (scale>1) and zoomed-out (scale<1)
        const maxOffsetX = scale >= 1
          ? (svContainerW.value * (scale - 1)) / 2
          : (svContainerW.value * (1 - scale)) / 2;
        const maxOffsetY = scale >= 1
          ? (svContainerH.value * (scale - 1)) / 2
          : (svContainerH.value * (1 - scale)) / 2;
        const nextTX = svStartTX.value + (e.translationX * PAN_X_GAIN);
        const nextTY = svStartTY.value + (e.translationY * PAN_Y_GAIN);
        svTranslateX.value = clamp(nextTX, -maxOffsetX, maxOffsetX);
        svTranslateY.value = clamp(nextTY, -maxOffsetY, maxOffsetY);
      })
      .onEnd((e) => {
        'worklet';
        const scale = svScale.value || 1;
        // Apply decay (inertial) with clamping for both zoomed-in and zoomed-out
        const maxOffsetX = scale >= 1
          ? (svContainerW.value * (scale - 1)) / 2
          : (svContainerW.value * (1 - scale)) / 2;
        const maxOffsetY = scale >= 1
          ? (svContainerH.value * (scale - 1)) / 2
          : (svContainerH.value * (1 - scale)) / 2;
        svTranslateX.value = withDecay({
          velocity: e.velocityX ?? 0,
          clamp: [-maxOffsetX, maxOffsetX],
        });
        svTranslateY.value = withDecay({
          velocity: e.velocityY ?? 0,
          clamp: [-maxOffsetY, maxOffsetY],
        });
        const final = {
          scale: svScale.value,
          translateX: svTranslateX.value,
          translateY: svTranslateY.value,
        };
        runOnJS(setCurrentZoom)(final.scale);
        runOnJS(setPdfTransform)(final);
        runOnJS(setShouldCaptureGestures)(false);
      })
      .onFinalize(() => {
        'worklet';
        // Safety: ensure ScrollView is re-enabled if gesture cancels
        runOnJS(setShouldCaptureGestures)(false);
      });
  }, [panEnabled]);

  // Double-tap to zoom in/out around tap location
  const doubleTapGesture = useMemo(() => {
    return Gesture.Tap()
      .numberOfTaps(2)
      .maxDelay(300)
      .onEnd((e, success) => {
        'worklet';
        if (!success) return;
        const current = svScale.value;
        const target = current <= 1 ? Math.min(2, MAX_PDF_SCALE) : 1;
        // anchor around tap location
        const anchorX = (e.x - svTranslateX.value) / current;
        const anchorY = (e.y - svTranslateY.value) / current;
        const nextTX = e.x - anchorX * target;
        const nextTY = e.y - anchorY * target;
        const maxOffsetX = (svContainerW.value * (target - 1)) / 2;
        const maxOffsetY = (svContainerH.value * (target - 1)) / 2;
  svScale.value = withSpring(target, { damping: 16, stiffness: 220 });
        svTranslateX.value = withSpring(clamp(nextTX, -maxOffsetX, maxOffsetX));
        svTranslateY.value = withSpring(clamp(nextTY, -maxOffsetY, maxOffsetY));
        runOnJS(setCurrentZoom)(target);
        runOnJS(setPdfTransform)({
          scale: target,
          translateX: clamp(nextTX, -maxOffsetX, maxOffsetX),
          translateY: clamp(nextTY, -maxOffsetY, maxOffsetY),
        });
      });
  }, [MIN_PDF_SCALE, MAX_PDF_SCALE]);

  const combinedGesture = useMemo(() => {
    const pinchPan = Gesture.Simultaneous(pinchGesture, panGesture);
    return Gesture.Exclusive(doubleTapGesture, pinchPan);
  }, [pinchGesture, panGesture, doubleTapGesture]);

  // Helper function to calculate distance between two touches - from DrawingEditor
  const getDistance = (touches: any[]) => {
    if (touches.length < 2) return 0;
    const touch1 = touches[0];
    const touch2 = touches[1];
    const dx = touch2.pageX - touch1.pageX;
    const dy = touch2.pageY - touch1.pageY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  // Convert an array of {x,y} points into a smooth SVG path using Catmull-Rom
  // to cubic Bezier conversion. This produces 'M' + multiple 'C' commands which
  // render smoothly with fewer segments and better visual quality than many 'L's.
  // Enhanced stroke smoothing function with dynamic tension and point filtering
  // for more seamless, professional-looking strokes.
  const convertPointsToSmoothedPath = (
    points: { x: number; y: number; timestamp?: number }[],
    segments = 8
  ) => {
    if (!points || points.length === 0) return "";
    if (points.length === 1)
      return `M${points[0].x.toFixed(2)},${points[0].y.toFixed(2)}`;

    // Ultra-fast point filtering with minimal allocations
    const workingPoints: typeof points = points.length < 50 ? points : [];

    if (points.length >= 50) {
      // For longer paths, use more aggressive filtering for performance
      let prevPoint = points[0];
      workingPoints.push(prevPoint);

      const minDistance = segments > 6 ? 2.5 : 1.8; // Adaptive distance based on smoothing level

      // Optimized filtering loop with reduced calculations
      for (let i = 1; i < points.length; i++) {
        const point = points[i];

        // Skip predicted points when finalizing (they're only for live preview)
        if ((point as any).isPredicted) continue;

        const dx = point.x - prevPoint.x;
        const dy = point.y - prevPoint.y;

        // Fast distance check using squared distance (avoid sqrt when possible)
        const distanceSquared = dx * dx + dy * dy;
        const minDistanceSquared = minDistance * minDistance;

        if (distanceSquared >= minDistanceSquared) {
          workingPoints.push(point);
          prevPoint = point;
        }
      }
    }

    // Skip complex speed calculations for real-time drawing
    const finalPoints = workingPoints.length >= 2 ? workingPoints : points;

    // Simplified tension calculation for better performance
    const baseTension = Math.min(0.4, segments / 20); // Faster calculation
    const tensionFactor = 1 - baseTension;

    // Pre-calculate the 1/6 factor to avoid repeated division
    const sixthFactor = tensionFactor / 6;

    // Fast number formatting (2 decimals for performance vs 3 decimals)
    const f = (n: number) => Math.round(n * 100) / 100;

    // Build the Bezier path with optimized calculations
    let d = `M${f(finalPoints[0].x)},${f(finalPoints[0].y)}`;

    // Optimized Bezier curve generation
    for (let i = 0; i < finalPoints.length - 1; i++) {
      const p0 = finalPoints[i - 1] || finalPoints[i];
      const p1 = finalPoints[i];
      const p2 = finalPoints[i + 1];
      const p3 = finalPoints[i + 2] || p2;

      // Optimized Catmull-Rom to Bezier conversion (avoid repeated calculations)
      const dx02 = (p2.x - p0.x) * sixthFactor;
      const dy02 = (p2.y - p0.y) * sixthFactor;
      const dx31 = (p3.x - p1.x) * sixthFactor;
      const dy31 = (p3.y - p1.y) * sixthFactor;

      const b1x = p1.x + dx02;
      const b1y = p1.y + dy02;
      const b2x = p2.x - dx31;
      const b2y = p2.y - dy31;

      d += ` C${f(b1x)},${f(b1y)} ${f(b2x)},${f(b2y)} ${f(p2.x)},${f(p2.y)}`;
    }

    return d;
  };

  // Handle double tap to reset zoom - from DrawingEditor
  const lastTapRef = useRef(0);
  const handleDoubleTap = () => {
    const now = Date.now();
    const timeSinceLastTap = now - lastTapRef.current;

    if (timeSinceLastTap < 300 && timeSinceLastTap > 0) {
      setCurrentZoom(1);
      setPdfTransform({ scale: 1, translateX: 0, translateY: 0 });
    }

    lastTapRef.current = now;
  };

  // Direct PDF annotation state
  const [isSavingToPDF, setIsSavingToPDF] = useState(false);
  const [lastSavedPath, setLastSavedPath] = useState<string | null>(null);

  // Save an exported PDF into a user-accessible location (Downloads / gallery).
  // Now uses unified download utility for consistent download location
  const saveExportedPdfToDevice = async (savedFileUri: string) => {
    try {
      if (!savedFileUri) throw new Error("No file path provided");
      
      const fileName = savedFileUri.split("/").pop() || "exported.pdf";
      
      // Use unified download utility - automatically saves to Downloads
      const result = await savePDFToDownloads(savedFileUri, fileName, false);
      
      return result;
    } catch (err) {
      console.error("Error saving PDF:", err);
      return { success: false, error: err };
    }
  };

  const onAfterExportSaved = async (savedPath: string) => {
    try {
      const name = savedPath.split("/").pop() || fileName;

      // Use unified download utility to save to Downloads.
      // This utility will handle all user-facing toasts and notifications.
      await savePDFToDownloads(savedPath, name, false);
    } catch (err) {
      console.error("Error in onAfterExportSaved:", err);
      // Error toast is already handled by the download utility in most cases.
    }
  };
  const [saveMode, setSaveMode] = useState<"overlay" | "direct">("direct");
  const [showSaveModeModal, setShowSaveModeModal] = useState(false);

  // Folder and tag states for metadata
  const [folders, setFolders] = useState<any[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [folderName, setFolderName] = useState("PDF Documents");
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [folderFilter, setFolderFilter] = useState("");
  const [isLoadingFolders, setIsLoadingFolders] = useState(false);

  // Sync status state
  const [syncStatus, setSyncStatus] = useState<"saved" | "syncing" | "offline">(
    "saved"
  );
  const localNetworkStatus = useNetworkStatus();
  const isOnline = localNetworkStatus.isConnected && localNetworkStatus.isInternetReachable && localNetworkStatus.isServerReachable;

  useEffect(() => {
    setCurrentNoteId(noteId);
  }, [noteId]);

  // PDF viewport tracking
  const [pdfDimensions, setPdfDimensions] = useState({
    width: screenWidth,
    height: screenHeight,
  });
  const [scrollOffset, setScrollOffset] = useState({ x: 0, y: 0 });

  // Scroll tracking for annotation positioning
  const [pdfScrollOffset, setPdfScrollOffset] = useState({ x: 0, y: 0 });

  // Actual PDF page dimensions (from the PDF file itself)
  const [pdfPageDimensions, setPdfPageDimensions] = useState({
    width: 595,
    height: 842,
  }); // Default A4 size in points
  const [pdfViewerBounds, setPdfViewerBounds] = useState({
    width: screenWidth,
    height: screenHeight,
  });

  // Precompute and cache stroke paths when strokes or layout change so rendering is cheap
  useEffect(() => {
    if (!strokes || !Array.isArray(strokes) || strokes.length === 0) return;

    // Compute pdf display size used by mapping function
    const containerWidth = containerSize.width || screenWidth;
    const containerHeight = containerSize.height || screenHeight;
    const pdfWidth = pdfPageDimensions?.width || 595;
    const pdfHeight = pdfPageDimensions?.height || 842;
    const aspectRatio = pdfWidth / pdfHeight;
    let pdfDisplayWidth, pdfDisplayHeight;
    if (containerWidth / containerHeight > aspectRatio) {
      pdfDisplayHeight = containerHeight;
      pdfDisplayWidth = pdfDisplayHeight * aspectRatio;
    } else {
      pdfDisplayWidth = containerWidth;
      pdfDisplayHeight = pdfDisplayWidth / aspectRatio;
    }

    // Build cache entries
    const maxPoints = 300; // conservative default
    for (const stroke of strokes) {
      try {
        const isNormalized = true;
        const displayPoints = mapPointsToDisplay(
          stroke.points || [],
          pdfDisplayWidth,
          pdfDisplayHeight,
          isNormalized
        );
        const simplified = simplifyPoints(displayPoints, maxPoints);
        const cacheKey = `${stroke.id}-${simplified.length}-${Math.round(
          (stroke.width || 2) * 10
        )}`;
        if (!strokePathCacheRef.current.has(cacheKey)) {
          strokePathCacheRef.current.set(cacheKey, pointsToPath(simplified));
        }
      } catch (e) {
        // ignore per-stroke errors
      }
    }
  }, [strokes, containerSize.width, containerSize.height, pdfPageDimensions]);

  // Local source state for PDF loading. If a remote URL is provided we'll
  // download it and replace this with the local file URI so the native
  // PDF viewer can access it reliably.
  const [currentSource, setCurrentSource] = useState<{ uri: string }>(source);

  // Performance: Batch annotation updates to reduce re-renders
  const pendingAnnotationUpdates = useRef<Annotation[] | null>(null);
  const annotationUpdateTimer = useRef<NodeJS.Timeout | null>(null);
  
  const flushAnnotationUpdates = useCallback(() => {
    if (pendingAnnotationUpdates.current) {
      setAnnotations(pendingAnnotationUpdates.current);
      if (onAnnotationChange) {
        onAnnotationChange(pendingAnnotationUpdates.current);
      }
      pendingAnnotationUpdates.current = null;
    }
  }, [onAnnotationChange]);

  // Helper function to update annotations with callback
  const updateAnnotations = useCallback(
    (newAnnotations: Annotation[] | ((prev: Annotation[]) => Annotation[]), immediate = false) => {
      const resolvedAnnotations = typeof newAnnotations === "function"
        ? newAnnotations(pendingAnnotationUpdates.current || annotations)
        : newAnnotations;
      
      if (immediate) {
        // Immediate update for critical operations (save, delete, etc.)
        if (annotationUpdateTimer.current) {
          clearTimeout(annotationUpdateTimer.current);
          annotationUpdateTimer.current = null;
        }
        pendingAnnotationUpdates.current = null;
        setAnnotations(resolvedAnnotations);
        if (onAnnotationChange) {
          onAnnotationChange(resolvedAnnotations);
        }
      } else {
        // Batched update for drawing operations
        pendingAnnotationUpdates.current = resolvedAnnotations;
        
        if (annotationUpdateTimer.current) {
          clearTimeout(annotationUpdateTimer.current);
        }
        
        annotationUpdateTimer.current = setTimeout(() => {
          flushAnnotationUpdates();
          annotationUpdateTimer.current = null;
        }, 16); // ~60fps batching
      }
    },
    [annotations, onAnnotationChange, flushAnnotationUpdates]
  );

  const pdfRef = useRef<any>(null);
  const viewShotRef = useRef<any>(null);
  const annotationStorageKey = `pdf_annotations_${fileName}`;
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Undo / Redo stacks for annotations
  const undoStackRef = useRef<Annotation[][]>([]);
  const redoStackRef = useRef<Annotation[][]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  // Apply annotations without recording history (used by undo/redo)
  const applyAnnotationsWithoutHistory = async (anns: Annotation[]) => {
    try {
      setAnnotations(anns);
      if (onAnnotationChange) onAnnotationChange(anns);
      await AsyncStorage.setItem(annotationStorageKey, JSON.stringify(anns));
      setCanUndo(undoStackRef.current.length > 0);
      setCanRedo(redoStackRef.current.length > 0);
    } catch (err) {
      console.error("Error applying annotations without history:", err);
    }
  };

  const handleUndo = async () => {
    if (undoStackRef.current.length === 0) return;
    try {
      const previous = undoStackRef.current.pop() as Annotation[];
      // Push current state to redo stack
      redoStackRef.current.push(JSON.parse(JSON.stringify(annotations || [])));
      await applyAnnotationsWithoutHistory(previous);
      setHasUnsavedChanges(true);
      setCanUndo(undoStackRef.current.length > 0);
      setCanRedo(redoStackRef.current.length > 0);
    } catch (err) {
      console.error("Undo failed:", err);
    }
  };

  const handleRedo = async () => {
    if (redoStackRef.current.length === 0) return;
    try {
      const next = redoStackRef.current.pop() as Annotation[];
      // Push current state to undo stack
      undoStackRef.current.push(JSON.parse(JSON.stringify(annotations || [])));
      await applyAnnotationsWithoutHistory(next);
      setHasUnsavedChanges(true);
      setCanUndo(undoStackRef.current.length > 0);
      setCanRedo(redoStackRef.current.length > 0);
    } catch (err) {
      console.error("Redo failed:", err);
    }
  };

  // Load annotations when component mounts
  React.useEffect(() => {
    // Use external annotations if provided, otherwise load from storage or offline note
    if (externalAnnotations && externalAnnotations.length > 0) {
      updateAnnotations(externalAnnotations);
    } else {
      loadAnnotations();
    }

    // If source is remote, download it to local storage first then validate
    (async () => {
      try {
        if (
          source?.uri &&
          (source.uri.startsWith("http://") ||
            source.uri.startsWith("https://"))
        ) {
          setIsLoading(true);

          // Normalize URL to use configured API_URL (Django's build_absolute_uri might use different host)
          let downloadUrl = source.uri;
          try {
            const sourceUrl = new URL(source.uri);
            const apiUrl = new URL(API_URL);

            // Get actual port numbers (default to 80 for http, 443 for https if not specified)
            const getActualPort = (url: URL) => {
              if (url.port) return url.port;
              return url.protocol === "https:" ? "443" : "80";
            };

            const sourcePort = getActualPort(sourceUrl);
            const apiPort = getActualPort(apiUrl);

            // If the source URL is from the same backend but different host (e.g., Django using 192.168.x.x)
            // replace it with our configured API_URL
            const isPrivateIP =
              sourceUrl.hostname.startsWith("192.168.") ||
              sourceUrl.hostname.startsWith("10.0.") ||
              sourceUrl.hostname.startsWith("172.") ||
              sourceUrl.hostname === "localhost" ||
              sourceUrl.hostname === "127.0.0.1";

            if (
              sourcePort === apiPort &&
              isPrivateIP &&
              sourceUrl.hostname !== apiUrl.hostname
            ) {
              downloadUrl = API_URL + sourceUrl.pathname + sourceUrl.search;
            }
          } catch (urlParseError) {
            console.warn(
              "Could not parse URL for normalization:",
              urlParseError
            );
          }

          try {
            // Get auth headers if this is a backend URL
            let fetchHeaders: HeadersInit | undefined;
            if (
              downloadUrl.includes(API_URL) ||
              downloadUrl.includes("192.168.") ||
              downloadUrl.includes("localhost")
            ) {
              const token = await AsyncStorage.getItem("authToken");
              if (token) {
                fetchHeaders = {
                  Authorization: `Token ${token}`,
                  Accept: "application/pdf",
                };
              }
            }

            const result = await getLocalPDFPathEnhanced(
              downloadUrl,
              fileName,
              undefined, // Remove progress logging
              fetchHeaders
            );
            // Replace source with local file URI for the PDF viewer
            // Note: FileSystem.documentDirectory paths are file:// URIs on native
            const localUri = result.uri;
            setCurrentSource({ uri: localUri });
          } catch (err) {
            console.error("Failed to download remote PDF before loading:", err);
            setHasError(true);
            setIsLoading(false);

            // Show a more helpful error dialog with options
            const errorMessage =
              err instanceof Error ? err.message : String(err);
            const isNetworkError =
              errorMessage.includes("404") ||
              errorMessage.includes("not available");
            const urlInfo =
              downloadUrl !== source.uri
                ? `\nOriginal URL: ${source.uri}\nNormalized URL: ${downloadUrl}`
                : `\nURL: ${downloadUrl}`;

            Alert.alert(
              "PDF Download Failed",
              `Unable to download PDF: ${errorMessage}${urlInfo}\n\nThis might be because:\n• The file doesn't exist on the server\n• Network connection issues\n• Server authentication required`,
              [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Retry",
                  onPress: () => {
                    // Retry the download
                    setHasError(false);
                    setIsLoading(true);
                    // Re-run the same logic
                  },
                },
                {
                  text: "Open in Browser",
                  onPress: () => {
                    // Try to open the URL in browser as fallback
                    import("expo-web-browser").then((WebBrowser) => {
                      WebBrowser.openBrowserAsync(source.uri).catch(
                        console.error
                      );
                    });
                  },
                },
              ]
            );
            return;
          }
        }

        // Validate the (now local) source
        await validatePDFSource();
      } catch (err) {
        console.error("Error preparing PDF source:", err);
      }
    })(); // Animate UI entrance
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

    // Add a shorter backup timeout to clear loading if PDF is actually loaded but onLoadComplete didn't fire
    const backupTimeout = setTimeout(() => {
      if (isLoading && !hasError) {
        setIsLoading(false);
      }
    }, 5000); // 5 seconds backup

    return () => {
      clearTimeout(backupTimeout);
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, []);

  // Keep the loading icon rotating while isLoading is true
  useEffect(() => {
    let cancelled = false;
    const start = () => {
      spinnerRotate.setValue(0);
      Animated.timing(spinnerRotate, {
        toValue: 1,
        duration: 1000,
        useNativeDriver: true,
        easing: Easing.linear,
      }).start(() => {
        if (!cancelled && isLoading) start();
      });
    };
    if (isLoading) start();
    return () => {
      cancelled = true;
    };
  }, [isLoading, spinnerRotate]);

  // Cleanup: Flush pending annotation updates on unmount
  useEffect(() => {
    return () => {
      if (annotationUpdateTimer.current) {
        clearTimeout(annotationUpdateTimer.current);
        flushAnnotationUpdates();
      }
    };
  }, [flushAnnotationUpdates]);

  const validatePDFSource = async () => {
    try {
      const uriToCheck = currentSource?.uri || source?.uri;

      // Only call FileSystem.getInfoAsync for local file URIs
      if (
        uriToCheck &&
        (uriToCheck.startsWith("file://") ||
          uriToCheck.startsWith(FileSystem.documentDirectory || ""))
      ) {
        // For local files, check if file exists
        const fileInfo = await FileSystem.getInfoAsync(uriToCheck);
        if (!fileInfo.exists) {
          console.error("PDF file not found at:", uriToCheck);
          setHasError(true);
          Alert.alert("File Not Found", `PDF file not found at: ${uriToCheck}`);
          return;
        }
        // Check file size
        if (fileInfo.size === 0) {
          console.error("PDF file is empty");
          setHasError(true);
          Alert.alert(
            "Invalid File",
            "The PDF file appears to be empty or corrupted"
          );
          return;
        }
      } else {
        // For remote URLs we won't call FileSystem.getInfoAsync (not supported)
      }
    } catch (error) {
      console.error("Error validating PDF file:", error);
      setHasError(true);
      Alert.alert("File Error", "Unable to access the PDF file");
    }
  };

  const loadAnnotations = async () => {
    try {
      // Utility: parse path into numeric point pairs (best-effort)
      const parsePathPoints = (path: string): { x: number; y: number }[] => {
        const pts: { x: number; y: number }[] = [];
        if (!path || typeof path !== 'string') return pts;
        try {
          const tokens = path
            .replace(/,/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .match(/[MLQCSZ]|-?\d*\.?\d+/g) || [];
          let i = 0;
          let lastCmd = '';
          while (i < tokens.length) {
            const tk = tokens[i++];
            if (/^[MLQCSZ]$/.test(tk)) {
              lastCmd = tk;
              if (tk === 'M' || tk === 'L') {
                const x = parseFloat(tokens[i++] || 'NaN');
                const y = parseFloat(tokens[i++] || 'NaN');
                if (Number.isFinite(x) && Number.isFinite(y)) pts.push({ x, y });
              } else if (tk === 'Q') {
                // Q x1 y1 x y -> end point at the end
                const x1 = parseFloat(tokens[i++] || 'NaN');
                const y1 = parseFloat(tokens[i++] || 'NaN');
                const x = parseFloat(tokens[i++] || 'NaN');
                const y = parseFloat(tokens[i++] || 'NaN');
                if (Number.isFinite(x) && Number.isFinite(y)) pts.push({ x, y });
              } else if (tk === 'C') {
                // C x1 y1 x2 y2 x y -> end point at the end
                const x1 = parseFloat(tokens[i++] || 'NaN');
                const y1 = parseFloat(tokens[i++] || 'NaN');
                const x2 = parseFloat(tokens[i++] || 'NaN');
                const y2 = parseFloat(tokens[i++] || 'NaN');
                const x = parseFloat(tokens[i++] || 'NaN');
                const y = parseFloat(tokens[i++] || 'NaN');
                if (Number.isFinite(x) && Number.isFinite(y)) pts.push({ x, y });
              }
            } else {
              // If command letter omitted (repeated), infer from lastCmd for M/L
              if (lastCmd === 'M' || lastCmd === 'L') {
                const x = parseFloat(tk);
                const y = parseFloat(tokens[i++] || 'NaN');
                if (Number.isFinite(x) && Number.isFinite(y)) pts.push({ x, y });
              }
            }
          }
        } catch {}
        return pts;
      };

      // Migration: fix legacy pixel paths by inferring page and normalizing
      const migrateLegacyAnnotation = (ann: Annotation): Annotation | null => {
        try {
          if (!ann?.path) return null;
          const pts = parsePathPoints(ann.path);
          if (!pts.length) return null;
          // If any coordinate looks like pixel-space (> 1), treat as legacy
          const hasPixel = pts.some(p => p.x > 1 || p.y > 1);
          if (!hasPixel) return null;

          // Use current layout metrics to infer page and normalize
          const { displayW, displayH, pageSpacing } = getLayoutMetrics();
          if (!(displayW > 0 && displayH > 0)) return null;
          // Infer page by average Y position in content space
          const avgY = pts.reduce((s, p) => s + p.y, 0) / pts.length;
          const pageWithSpacing = displayH + pageSpacing;
          let pageIndex = Math.max(0, Math.floor(avgY / pageWithSpacing));
          const maxPageIndex = Math.max(0, (totalPagesRef.current || displayTotalPages || 1) - 1);
          if (pageIndex > maxPageIndex) pageIndex = maxPageIndex;
          const inferredPage = pageIndex + 1;

          // Normalize path relative to inferred page
          const pageStartY = effectiveSafeMode ? 0 : pageIndex * (displayH + pageSpacing);
          const offsetX = Math.max(0, ((pdfViewerBounds?.width || pdfContainerLayout?.width || containerSize.width || screenWidth) - displayW) / 2);
          let normalized = '';
          for (let i = 0; i < pts.length; i++) {
            const nx = Math.max(0, Math.min(1, (pts[i].x - offsetX) / displayW));
            const ny = Math.max(0, Math.min(1, (pts[i].y - pageStartY) / displayH));
            normalized += (i === 0 ? 'M' : ' L') + nx.toFixed(6) + ',' + ny.toFixed(6);
          }

          const out: Annotation = {
            ...ann,
            page: inferredPage,
            path: normalized,
          };
          return out;
        } catch (e) {
          console.warn('Migration failed for annotation:', ann?.id, e);
          return null;
        }
      };
      // Helper: Normalize any incoming annotation shapes to our internal schema
      const normalizeAnnotations = (items: any[]): Annotation[] => {
        const makeId = () => `ann_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
        const clamp01 = (n: any) => {
          const v = typeof n === 'number' ? n : parseFloat(String(n));
          if (isNaN(v)) return 0;
          return Math.min(1, Math.max(0, v));
        };
        const toPercent = (value: any, size: number) => {
          if (typeof value !== 'number') {
            const parsed = parseFloat(String(value));
            if (!isNaN(parsed)) value = parsed; else return 0;
          }
          // If clearly already percentage
          if (value >= 0 && value <= 1) return value;
          // Best-effort convert pixels -> percent using viewer/container or screen fallback
          return size > 0 ? Math.min(1, Math.max(0, value / size)) : 0;
        };

  const vw = Math.max(1, pdfContainerLayout?.width || containerSize.width || screenWidth);
  const vh = Math.max(1, pdfContainerLayout?.height || containerSize.height || screenHeight);
  // IMPORTANT: don't clamp to 1 when total pages not yet known; otherwise all pages collapse to 1.
  const rawTotalPages = (totalPagesRef.current || displayTotalPages || 0);
  const knownTotalPages = rawTotalPages > 0 ? rawTotalPages : undefined;

        const mapType = (t: any, hasPath: boolean): Annotation['type'] => {
          const s = String(t || '').toLowerCase();
          if (s === 'drawing') return hasPath ? 'pen' : 'pencil';
          if (s === 'bookmark') return 'note';
          if (s === 'underline' || s === 'strikethrough') return 'selection';
          if (s === 'text' || s === 'note') return 'note';
          if (s === 'highlight') return 'highlight';
          if (s === 'pen' || s === 'brush' || s === 'pencil') return s as any;
          return 'selection';
        };

        const normalizeOne = (raw: any): Annotation => {
          // Detect shapes
          const hasPosition = raw && typeof raw === 'object' && raw.position && typeof raw.position === 'object';
          const hasPathField = !!raw?.path || !!raw?.strokeData;

          // Extract coords
          const rawX = hasPosition ? raw.position.x : raw.x;
          const rawY = hasPosition ? raw.position.y : raw.y;
          const rawW = hasPosition ? raw.position.width : raw.width;
          const rawH = hasPosition ? raw.position.height : raw.height;

          const x = toPercent(rawX, vw);
          const y = toPercent(rawY, vh);
          const width = rawW !== undefined ? toPercent(rawW, vw) : undefined;
          const height = rawH !== undefined ? toPercent(rawH, vh) : undefined;

          const page = (() => {
            const p = raw?.page ?? raw?.pageNumber ?? 1;
            const n = parseInt(String(p), 10);
            // If total pages unknown, only enforce lower bound (>=1).
            if (isNaN(n) || n < 1) return 1;
            if (knownTotalPages !== undefined) {
              return Math.min(knownTotalPages, n);
            }
            return n; // preserve original page when total not known yet
          })();

          const type = mapType(raw?.type, hasPathField);
          const color = typeof raw?.color === 'string' ? raw.color : '#FFEB3B';
          const text = raw?.text ?? raw?.note ?? undefined;
          const path = (raw?.path as string) ?? (raw?.strokeData as string) ?? undefined;

          const id = String(raw?.id || makeId());
          const timestamp = (() => {
            const t = raw?.timestamp ?? raw?.created_at;
            const d = t ? new Date(t).getTime() : Date.now();
            return isNaN(d) ? Date.now() : d;
          })();

          const norm: Annotation = {
            id,
            type,
            page,
            x: clamp01(x),
            y: clamp01(y),
            color,
            timestamp,
          };
          if (width !== undefined) norm.width = clamp01(width);
          if (height !== undefined) norm.height = clamp01(height);
          if (text !== undefined) norm.text = String(text);
          if (path) norm.path = path;
          return norm;
        };

        try {
          if (!Array.isArray(items)) return [];
          // Handle nested payloads like [{ annotations: [...] }]
          if (items.length === 1 && Array.isArray((items[0] as any)?.annotations)) {
            items = (items[0] as any).annotations;
          }
        } catch {}

        const out = items.map(normalizeOne);
        // Optional: filter invalid pages only when we know total pages
        if (knownTotalPages !== undefined) {
          return out.filter(a => a.page >= 1 && a.page <= knownTotalPages);
        }
        return out;
      };

      // If we have a note context, prefer offline note annotations first
      if (currentNoteId) {
        try {
          const note = await offlineNotesService.getNoteById(currentNoteId);
          const rawAnns = (note?.document_annotations || []) as any[];
          let anns = normalizeAnnotations(Array.isArray(rawAnns) ? rawAnns : []);
          // Defensive: log and migrate missing/invalid pages
          const before = JSON.stringify(anns);
          const fixed = anns.map(a => {
            if (!a.page || a.page < 1) {
              console.warn('Annotation missing/invalid page; attempting migration:', a.id, a.type);
              const migrated = migrateLegacyAnnotation(a);
              return migrated || { ...a, page: 1 };
            }
            // Also try to migrate legacy pixel paths even if page exists
            const migrated = migrateLegacyAnnotation(a);
            return migrated || a;
          });
          const after = JSON.stringify(fixed);
          if (before !== after) {
            // Persist fixes locally and offline
            try { await AsyncStorage.setItem(annotationStorageKey, JSON.stringify(fixed)); } catch {}
            try {
              if (currentNoteId) {
                await offlineNotesService.updateNote(currentNoteId, {
                  document_annotations: fixed,
                  type: 'document',
                  folderId: selectedFolderId || undefined,
                });
              }
            } catch {}
            anns = fixed;
          }
          if (anns.length > 0) {
            updateAnnotations(anns);
            try { await AsyncStorage.setItem(annotationStorageKey, JSON.stringify(anns)); } catch {}
            return;
          }
        } catch {}
      }

      const stored = await AsyncStorage.getItem(annotationStorageKey);
      if (stored) {
        const loadedAnnotations = JSON.parse(stored) as any[];
        let normalizedAnnotations = normalizeAnnotations(loadedAnnotations);
        // Defensive: migrate missing/invalid page and legacy pixel paths
        const before = JSON.stringify(normalizedAnnotations);
        const fixed = normalizedAnnotations.map(a => {
          if (!a.page || a.page < 1) {
            console.warn('Annotation missing/invalid page in local store; attempting migration:', a.id, a.type);
            const migrated = migrateLegacyAnnotation(a);
            return migrated || { ...a, page: 1 };
          }
          const migrated = migrateLegacyAnnotation(a);
          return migrated || a;
        });
        const after = JSON.stringify(fixed);
        if (before !== after) {
          try { await AsyncStorage.setItem(annotationStorageKey, JSON.stringify(fixed)); } catch {}
          normalizedAnnotations = fixed;
        }
        updateAnnotations(normalizedAnnotations, true); // Immediate update for loading
        console.log(
          "✅ Loaded annotations from AsyncStorage:",
          normalizedAnnotations.length,
          "items"
        );
      }
    } catch (error) {
      console.error("❌ Error loading annotations:", error);
    }
  };

  const saveAnnotations = async (newAnnotations: Annotation[]) => {
    try {
      await AsyncStorage.setItem(
        annotationStorageKey,
        JSON.stringify(newAnnotations)
      );
      updateAnnotations(newAnnotations, true); // Immediate update for save operations
    } catch (error) {
      console.error("Error saving annotations:", error);
    }
  };

  // Persist annotations both locally (AsyncStorage) and optionally to backend (when noteId provided)
  // All annotations MUST store coordinates & dimensions as normalized percentages (0-1) relative to the PDF page.
  const saveAnnotationsWithChanges = async (newAnnotations: Annotation[]) => {
    try {
      // Normalize & validate before saving to guarantee percentage storage.
      const validatedAnnotations = newAnnotations.map((ann) => {
        const clone: Annotation = { ...ann };

        // Ensure path-based annotations already use normalized (0-1) coordinates.
        if (clone.path && /\d/.test(clone.path)) {
          // Heuristic check: if any coordinate exceeds 1 it's legacy pixel data -> re-normalize.
          if (/([0-9]+\.[0-9]+|[0-9]+)/.test(clone.path)) {
            const needsNormalization = clone.path.split(/[ML]/).some((seg) => {
              const parts = seg.trim().split(",");
              if (parts.length === 2) {
                const x = parseFloat(parts[0]);
                const y = parseFloat(parts[1]);
                return x > 1 || y > 1; // pixel style
              }
              return false;
            });
            if (needsNormalization) {
              console.warn(
                "⚠️ Legacy path detected – converting to normalized % coordinates."
              );
              clone.path = convertPathToNormalized(clone.path);
            }
          }
        }

        // Clamp numeric percentage fields without altering page index.
        if (typeof clone.x === "number")
          clone.x = Math.min(1, Math.max(0, clone.x));
        if (typeof clone.y === "number")
          clone.y = Math.min(1, Math.max(0, clone.y));
        if (typeof clone.width === "number")
          clone.width = Math.min(1, Math.max(0, clone.width));
        if (typeof clone.height === "number")
          clone.height = Math.min(1, Math.max(0, clone.height));
        // Ensure page is a positive integer and leave it untouched otherwise
        if (clone.page && (!Number.isInteger(clone.page) || clone.page < 1)) {
          clone.page = Math.max(1, Math.round(clone.page));
        }

        // Logging for debugging & auditing persisted data.
        if (clone.x !== undefined && clone.y !== undefined) {
          console.log(
            `📍 Annotation(${clone.type}) % coords: x=${clone.x.toFixed(
              4
            )}, y=${clone.y.toFixed(4)}`
          );
        }
        if (clone.path) {
          const pathSample =
            clone.path.substring(0, 60) + (clone.path.length > 60 ? "…" : "");
          console.log(
            `✏️ Path (${clone.type}) normalized sample: ${pathSample}`
          );
        }
        return clone;
      });

      // Record history for undo: push current state, clear redo stack
      try {
        undoStackRef.current.push(
          JSON.parse(JSON.stringify(annotations || []))
        );
        // Limit undo stack size to avoid unbounded memory growth
        if (undoStackRef.current.length > 50) undoStackRef.current.shift();
        // Any new change invalidates the redo stack
        redoStackRef.current = [];
        setCanUndo(undoStackRef.current.length > 0);
        setCanRedo(false);
      } catch (historyErr) {
        console.warn("Failed to push to undo stack:", historyErr);
      }

      // Update state first
      updateAnnotations(validatedAnnotations);

      // IMMEDIATELY save to AsyncStorage for persistence across reloads
      await AsyncStorage.setItem(
        annotationStorageKey,
        JSON.stringify(validatedAnnotations)
      );

      // Verify the save was successful by reading it back
      const savedData = await AsyncStorage.getItem(annotationStorageKey);
      const parsedData = savedData ? JSON.parse(savedData) : [];

      if (parsedData.length !== validatedAnnotations.length) {
        throw new Error("Save verification failed - annotation count mismatch");
      }

      setHasUnsavedChanges(true);

      // Trigger auto-save with 1 second debounce (like DrawingEditor)
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
      
      autoSaveTimerRef.current = setTimeout(() => {
        autoSaveAnnotations(validatedAnnotations);
      }, 1000); // 1 second debounce like DrawingEditor

      // Auto-save after 2 seconds of no changes (for PDF export if enabled)
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }

      if (autoSave) {
        autoSaveTimeoutRef.current = setTimeout(() => {
          handleSaveAnnotations();
        }, 2000);
      }
    } catch (error) {
      console.error("❌ Error saving annotations to AsyncStorage:", error);
      Alert.alert(
        "Save Error",
        "Failed to save annotations. Please try again."
      );
      // Rollback state change if save failed
      await loadAnnotations();
    }
  };

  // Auto-save function: save to both AsyncStorage and offline notes service
  const autoSaveAnnotations = useCallback(async (anns?: Annotation[]) => {
    const annotationsToSave = anns || annotations;
    try {
      // Already persisted to AsyncStorage in saveAnnotationsWithChanges
      // Now also save to offline notes service so it appears in notes list
      if (currentNoteId) {
        try {
          await offlineNotesService.updateNote(currentNoteId, {
            document_annotations: annotationsToSave,
            type: "document",
            folderId: selectedFolderId || undefined,
          });
          setHasUnsavedChanges(false); // Mark as saved after successful offline save
          setSyncStatus(isOnline ? "saved" : "offline");
        } catch (error) {
          console.error("Failed to save annotations to offline notes:", error);
          setHasUnsavedChanges(true);
          setSyncStatus("offline");
        }
      } else {
        // If no note ID yet, still mark as having unsaved changes
        setHasUnsavedChanges(true);
        setSyncStatus("offline");
      }
    } catch (error) {
      console.error("Auto-save (local) failed:", error);
      setHasUnsavedChanges(true);
      setSyncStatus("offline");
    }
  }, [annotations, currentNoteId, isOnline]);

  // Cleanup auto-save timer on unmount
  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, []);

  // Handle back button with unsaved changes
  useEffect(() => {
    const backHandler = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        if (hasUnsavedChanges) {
          // Store the navigation action for after save/cancel
          pendingNavigationRef.current = () => {
            navigation.goBack();
          };
          setShowUnsavedModal(true);
          return true; // Prevent default back action
        }
        return false; // Allow default back action
      }
    );

    return () => backHandler.remove();
  }, [hasUnsavedChanges, navigation]);

  // Backend syncing is handled through offlineNotesService; keep here for future hooks
  const syncAnnotationsToBackend = async (_anns: Annotation[]) => {
    return;
  };

  // Explicit sync on demand (invoked from UnsavedChangesModal Save)
  const syncAnnotationsNow = useCallback(async (anns?: Annotation[]) => {
    const annotationsToSync = anns || annotations;
    try {
      setSyncStatus("syncing");
      if (currentNoteId) {
        await offlineNotesService.updateNote(currentNoteId, {
          document_annotations: annotationsToSync,
          type: "document",
          folderId: selectedFolderId || undefined,
        });
      } else {
        const created = await offlineNotesService.createNote({
          title: fileName || "PDF Document",
          content: "",
          type: "document",
          document_annotations: annotationsToSync,
          folderId: selectedFolderId || undefined,
        });
        if (created?.id) setCurrentNoteId(String(created.id));
      }
      setSyncStatus(isOnline ? "saved" : "offline");
      setHasUnsavedChanges(false);
    } catch (e) {
      console.error("Sync failed:", e);
      setSyncStatus("offline");
      throw e;
    }
  }, [annotations, currentNoteId, fileName, isOnline]);

  const handleSaveAnnotations = async () => {
    if (!hasUnsavedChanges) return;

    try {
      setIsSavingToPDF(true);

      if (saveMode === "direct" && enableDirectSave) {
        // Save annotations directly to PDF
        await saveAnnotationsDirectlyToPDF(annotations);
      } else {
        // Save annotations as overlays (traditional method)
        await AsyncStorage.setItem(
          annotationStorageKey,
          JSON.stringify(annotations)
        );
      }

      setHasUnsavedChanges(false);
    } catch (error) {
      // If this is a network failure and we're offline, don't spam alerts; just set status
      const msg = String(error || '');
      if (!isOnline && (msg.includes('Network request failed') || msg.includes('TypeError'))) {
        console.warn("Offline: suppressing save error alert.", error);
        setSyncStatus("offline");
      } else {
        console.error("Error saving annotations:", error);
        Alert.alert(
          "Error",
          `Failed to save annotations using ${saveMode} mode. Please try again.`
        );
      }
    } finally {
      setIsSavingToPDF(false);
    }
  };

  const saveAnnotationsDirectlyToPDF = async (
    annotationsToSave: Annotation[]
  ) => {
    try {

      // Convert UI annotations to PDF annotations format
      const pdfAnnotations: PDFAnnotation[] = annotationsToSave.map(
        (annotation) => ({
          ...annotation,
          type: annotation.type as PDFAnnotation["type"],
        })
      );

      const saveOptions: PDFSaveOptions = {
        createBackup: true,
        saveDirectly: false, // Create new file to preserve original
        outputFileName: `annotated_${Date.now()}_${fileName}`,
        viewerInfo: {
          totalPages: Math.max(1, totalPagesRef.current || displayTotalPages || 1),
          viewerWidth: Math.max(1, pdfContainerLayout?.width || containerSize.width || screenWidth),
          viewerHeight: Math.max(1, pdfContainerLayout?.height || containerSize.height || screenHeight),
          pdfPageDimensions: {
            width: Math.max(1, pdfPageDimensions?.width || 595),
            height: Math.max(1, pdfPageDimensions?.height || 842),
          },
        },
      };

      let result;
      const pdfUriToSave = currentSource?.uri || source.uri;

      if (isOnline && (currentNoteId || noteId)) {
        // Online: Save to both backend and PDF
        try {
          result = await drawingAPI.savePDFAnnotationsWithBackend(
            String(currentNoteId || noteId),
            pdfUriToSave,
            pdfAnnotations,
            saveOptions
          );
        } catch (e) {
          // If backend fails online, fall back to local-only PDF save so user isn't blocked
          console.warn("Backend save failed, falling back to local PDF save:", e);
          result = await drawingAPI.savePDFAnnotations(
            pdfUriToSave,
            pdfAnnotations,
            saveOptions
          );
        }
      } else {
        // Offline: Do local-only PDF save; backend sync will occur later via offlineNotesService
        result = await drawingAPI.savePDFAnnotations(
          pdfUriToSave,
          pdfAnnotations,
          saveOptions
        );
      }

      setLastSavedPath(result.savedPath);
      console.log(
        "Annotations successfully embedded in PDF:",
        result.savedPath
      );

     
    } catch (error) {
      // If offline, suppress network error alerts and mark offline status
      const msg = String(error || '');
      if (!isOnline && (msg.includes('Network request failed') || msg.includes('TypeError'))) {
        console.warn("Offline: skipping backend save error and keeping local state.", error);
        setSyncStatus("offline");
        return; // do not rethrow to avoid upstream alert
      }
      console.error("Error saving annotations to PDF:", error);
      throw error; // rethrow for non-network errors
    }
  };

  const handleShareAnnotations = async () => {
    try {
      if (annotations.length === 0) {
        Alert.alert("No Annotations", "There are no annotations to share.");
        return;
      }

      // Create a summary of annotations
      const annotationSummary = annotations
        .map((ann, index) => {
          const typeText = ann.type.charAt(0).toUpperCase() + ann.type.slice(1);
          const pageText = `Page ${ann.page}`;
          const textContent = ann.text ? `: "${ann.text}"` : "";
          return `${index + 1}. ${typeText} on ${pageText}${textContent}`;
        })
        .join("\n");

      const shareContent = `PDF Annotations for "${fileName}"\n\n${annotationSummary}`;

      if (await Sharing.isAvailableAsync()) {
        // Create a temporary text file for sharing instead of using data URL
        // Data URLs are not supported on Android for sharing
        const tempFileName = `annotations_${Date.now()}.txt`;
        const tempFilePath = `${FileSystem.documentDirectory}${tempFileName}`;

        try {
          await FileSystem.writeAsStringAsync(tempFilePath, shareContent);
          console.log(
            "📝 Created temporary text file for sharing:",
            tempFilePath
          );

          await Sharing.shareAsync(tempFilePath, {
            mimeType: "text/plain",
            dialogTitle: "Share Annotations",
          });

          // Clean up temporary file after sharing
          setTimeout(async () => {
            try {
              await FileSystem.deleteAsync(tempFilePath, { idempotent: true });
              console.log("🗑️ Cleaned up temporary annotation file");
            } catch (cleanupError) {
              console.log(
                "Note: Could not clean up temporary file:",
                cleanupError
              );
            }
          }, 5000);
        } catch (fileError) {
          console.error(
            "Error creating temporary file for sharing:",
            fileError
          );
          // Fallback to alert with text content
          Alert.alert("Annotation Summary", shareContent, [
            { text: "Close", style: "cancel" },
            {
              text: "Copy Text",
              onPress: () => {
                console.log("📋 Annotation text ready to copy:", shareContent);
                Alert.alert(
                  "Info",
                  "Annotation text has been logged. You can copy it from the console."
                );
              },
            },
          ]);
        }
      } else {
        Alert.alert(
          "Share Not Available",
          "Sharing is not available on this device."
        );
      }
    } catch (error) {
      console.error("Error sharing annotations:", error);
      Alert.alert("Error", "Failed to share annotations.");
    }
  };

  // Share the actual annotated PDF. If a recent annotated PDF exists, reuse it; otherwise generate one first.
  const handleShareAnnotatedPdf = async () => {
    try {
      showInfoToast("Preparing PDF for sharing...");

      // If we already have a saved annotated PDF, reuse it
      if (lastSavedPath) {
        const info = await FileSystem.getInfoAsync(lastSavedPath);
        if (info.exists) {
          await shareExportedPDF(lastSavedPath);
          return;
        }
      }

      // Convert UI annotations to PDF format
      const pdfAnnotations: PDFAnnotation[] = annotations.map((annotation) => ({
        ...annotation,
        type: annotation.type as PDFAnnotation["type"],
      }));

      if (!source?.uri) {
        showErrorToast("Original PDF not available");
        return;
      }

      // Create an export filename
      const timestamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, "_");
      const baseFileName = (fileName || "document").replace(/\.pdf$/i, "");
      const exportFileName = `${baseFileName}_annotated_${timestamp}.pdf`;

      const saveOptions: PDFSaveOptions = {
        createBackup: false,
        saveDirectly: false, // generate a new file, don't overwrite
        outputFileName: exportFileName,
        viewerInfo: {
          totalPages,
          viewerWidth: containerSize.width || screenWidth,
          viewerHeight: containerSize.height || Math.max(1, screenHeight - 300),
          pdfPageDimensions,
        },
      };

      const result = await drawingAPI.savePDFAnnotations(
        source.uri,
        pdfAnnotations,
        saveOptions
      );

      if (!result?.savedPath) {
        showErrorToast("Failed to create annotated PDF for sharing");
        return;
      }

      setLastSavedPath(result.savedPath);
      await shareExportedPDF(result.savedPath);
    } catch (err) {
      console.error("Error preparing PDF for share:", err);
      showErrorToast("Could not share the annotated PDF");
    }
  };

  const handleClearAllAnnotations = () => {
    if (annotations.length === 0) {
      Alert.alert("No Annotations", "There are no annotations to clear.");
      return;
    }

    Alert.alert(
      "Clear All Annotations",
      `Are you sure you want to delete all ${annotations.length} annotations? This action cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear All",
          style: "destructive",
          onPress: () => {
            saveAnnotationsWithChanges([]);
            Alert.alert("Success", "All annotations have been cleared.");
          },
        },
      ]
    );
  };

  const handleViewInfo = () => {
    const annotationCounts = annotations.reduce((counts, ann) => {
      counts[ann.type] = (counts[ann.type] || 0) + 1;
      return counts;
    }, {} as Record<string, number>);

    const countText = Object.entries(annotationCounts)
      .map(
        ([type, count]) =>
          `${type.charAt(0).toUpperCase() + type.slice(1)}: ${count}`
      )
      .join("\n");

    Alert.alert(
      "Document Information",
  `File: ${fileName}\nPages: ${totalPagesRef.current}\nCurrent Page: ${currentPageRef.current}\n\nAnnotations:\n${
        countText || "No annotations"
      }`
    );
  };

  const onPdfLoadComplete = (
    numberOfPages: number,
    filePath: string,
    { width, height }: { width?: number; height?: number } = {}
  ) => {
  setTotalPages(numberOfPages);
  if (displayTotalPages !== numberOfPages) setDisplayTotalPages(numberOfPages);
  totalPagesRef.current = numberOfPages;
    // Enable safe mode for very large PDFs to avoid massive view sizes
    if (numberOfPages >= pageThreshold && !useSafeMode && safeModeOverride !== false) {
      setUseSafeMode(true);
      // Optional: inform the user once
      try {
        Alert.alert(
          "Large Document Detected",
          `This PDF has ${numberOfPages} pages. Switching to Memory-Safe mode to prevent crashes. You can still navigate pages with the controls at the bottom.`
        );
      } catch {}
    }
    setIsLoading(false);
    setHasError(false);
  setCurrentPage(1); // Reset to first page
  currentPageRef.current = 1;

    // Set actual PDF page dimensions if available
    if (width && height) {
      setPdfPageDimensions({ width, height });

      // Calculate aspect ratio for a single page
      const aspectRatio = height / width;

      // For vertical scrolling, pages are fit-to-width; height follows aspect ratio.
      // We still compute a nominal single-page size for annotation mapping.
      const pageWidth = screenWidth;
      const pageHeight = pageWidth * aspectRatio;

      // Set container size for a single page view (will be refined by onLayout)
      setContainerSize({ width: pageWidth, height: pageHeight });

      // Update PDF viewer bounds for accurate coordinate conversion
      setPdfViewerBounds({ width: pageWidth, height: pageHeight });

      // If the total stacked height is too large, force safe mode
      const spacing = 10;
      const contentHeight = Math.max(1, numberOfPages * (pageHeight + spacing) - spacing);
      if (contentHeight > maxContentHeight && !useSafeMode && safeModeOverride !== false) {
        setUseSafeMode(true);
        try {
          Alert.alert(
            "Memory-Safe Mode Enabled",
            `This document is tall when stacked (${numberOfPages} pages). To avoid crashes, we're rendering one page at a time.`
          );
        } catch {}
      }
    } else {
      // Fallback dimensions
      const pageWidth = screenWidth;
      const pageHeight = pageWidth * (11 / 8.5); // Letter size aspect ratio

      setContainerSize({ width: pageWidth, height: pageHeight });
      setPdfViewerBounds({ width: pageWidth, height: pageHeight });

      // Apply content-height guard even with fallback sizes
      const spacing = 10;
      const contentHeight = Math.max(1, numberOfPages * (pageHeight + spacing) - spacing);
      if (contentHeight > maxContentHeight && !useSafeMode && safeModeOverride !== false) {
        setUseSafeMode(true);
        try {
          Alert.alert(
            "Memory-Safe Mode Enabled",
            `This document is tall when stacked (${numberOfPages} pages). To avoid crashes, we're rendering one page at a time.`
          );
        } catch {}
      }
    }

    console.log(
      "PDF loaded successfully:",
      numberOfPages,
      "pages from:",
      filePath
    );
  };

  // Fallback: sometimes the native PDF viewer reports 1 page even for multi-page PDFs
  // (depends on source uri, remote files, or viewer quirks). Use pdf-lib to determine
  // the real page count and update state when necessary.
  useEffect(() => {
    (async () => {
      try {
        if (totalPages && totalPages > 1) return; // nothing to do

        const uriToCheck = currentSource?.uri || source?.uri;
        if (!uriToCheck) return;

        console.log(
          "Attempting fallback page-count check for URI:",
          uriToCheck
        );

        let base64Data: string | null = null;

        // Local file -> read directly
        if (
          uriToCheck.startsWith("file://") ||
          uriToCheck.startsWith(FileSystem.documentDirectory || "")
        ) {
          try {
            base64Data = await FileSystem.readAsStringAsync(uriToCheck, {
              encoding: FileSystem.EncodingType.Base64,
            });
            console.log(
              "Read local PDF for fallback page count (base64 length):",
              base64Data?.length || 0
            );
          } catch (err) {
            console.warn(
              "Could not read local PDF for fallback page count:",
              err
            );
          }
        } else if (
          uriToCheck.startsWith("http://") ||
          uriToCheck.startsWith("https://")
        ) {
          // Download to cache then read
          try {
            const tmpPath =
              FileSystem.cacheDirectory + `pdf_pagecount_${Date.now()}.pdf`;
            const dl = await FileSystem.downloadAsync(uriToCheck, tmpPath);
            base64Data = await FileSystem.readAsStringAsync(dl.uri, {
              encoding: FileSystem.EncodingType.Base64,
            });
            console.log(
              "Downloaded remote PDF for fallback page count to:",
              dl.uri
            );
          } catch (err) {
            console.warn(
              "Could not download remote PDF for fallback page count:",
              err
            );
          }
        }

        if (!base64Data) return;

        try {
          // Convert base64 to Uint8Array in a way that works across environments
          const base64ToUint8Array = (b64: string) => {
            if (typeof atob !== "undefined") {
              const binary = atob(b64);
              const len = binary.length;
              const bytes = new Uint8Array(len);
              for (let i = 0; i < len; i++) {
                bytes[i] = binary.charCodeAt(i);
              }
              return bytes;
            }

            // Try Node/Buffer fallback when available
            try {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const BufferCtor: any =
                (global as any).Buffer ||
                (typeof Buffer !== "undefined" ? Buffer : undefined);
              if (BufferCtor && typeof BufferCtor.from === "function") {
                const buf = BufferCtor.from(b64, "base64");
                return new Uint8Array(
                  buf.buffer,
                  buf.byteOffset,
                  buf.byteLength
                );
              }
            } catch (bufErr) {
              // ignore and fallthrough to throw
            }

            throw new Error("No base64 decode available in this environment");
          };

          const bytes = base64ToUint8Array(base64Data);

          // Try normal load first
          let pdfDoc: any;
          try {
            pdfDoc = await PDFLibDocument.load(bytes);
          } catch (loadErr: any) {
            console.warn(
              "pdf-lib initial load failed for page count fallback:",
              loadErr && loadErr.message ? loadErr.message : loadErr
            );
            const msg =
              loadErr && loadErr.message
                ? loadErr.message.toLowerCase()
                : String(loadErr || "").toLowerCase();
            if (msg.includes("encrypted") || msg.includes("password")) {
              try {
                console.log(
                  "PDF appears to be encrypted - retrying page-count load with ignoreEncryption:true"
                );
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                pdfDoc = await (PDFLibDocument as any).load(bytes, {
                  ignoreEncryption: true,
                });
              } catch (retryErr) {
                console.warn(
                  "Retry with ignoreEncryption failed for page count fallback:",
                  retryErr
                );
                throw retryErr;
              }
            } else {
              throw loadErr;
            }
          }

          const realPageCount =
            (pdfDoc.getPages && pdfDoc.getPages().length) || undefined;
          if (realPageCount && realPageCount > 1) {
            console.log(
              "Fallback detected real PDF page count:",
              realPageCount
            );
            setTotalPages(realPageCount);
          }
        } catch (err) {
          console.warn(
            "pdf-lib fallback failed to load PDF for page count:",
            err
          );
        }
      } catch (err) {
        console.warn("Fallback page-count check failed:", err);
      }
    })();
    // Re-run fallback when currentSource or source change or when totalPages is still <= 1
  }, [currentSource?.uri, source?.uri, totalPages]);

  const onPdfLoadProgress = (percent: number) => {
    // If we're getting progress events, the PDF is loading
    if (percent > 0) {
      setHasError(false);
    }
  };

  const onPdfError = (error: any) => {
    console.error("PDF loading error:", error);
    console.error("PDF source URI:", source.uri);
    setIsLoading(false);
    setHasError(true);

    let errorMessage = "Failed to load PDF";
    if (error && typeof error === "object") {
      if (error.message) {
        errorMessage = `PDF Error: ${error.message}`;
      } else {
        errorMessage = `PDF Error: ${JSON.stringify(error)}`;
      }
    }

    const isRemoteUrl =
      source.uri.startsWith("http://") || source.uri.startsWith("https://");
    const troubleshootingText = isRemoteUrl
      ? "\n\nTroubleshooting for remote PDF:\n• Check network connection\n• Verify PDF URL is accessible\n• Try opening URL in browser"
      : "\n\nTroubleshooting for local PDF:\n• Check if file exists\n• Verify file permissions\n• Ensure file is a valid PDF";

    Alert.alert(
      "PDF Loading Error",
      `${errorMessage}\n\nSource: ${source.uri}${troubleshootingText}`
    );
  };

  // Page changes are now handled by ScrollView onScroll event

  const onPdfScaleChanged = (scale: number) => {
    console.log("PDF internal scale changed:", scale);
    // Update our zoom states to stay synchronized with PDF component
    setCurrentZoom(scale);
    setPdfTransform((prev) => ({ ...prev, scale }));
  };

  // Text selection handlers for react-native-pdf-selection
  const onTextSelectionChange = useCallback(
    (selection: {
      text: string;
      pageNumber: number;
      bounds: { x: number; y: number; width: number; height: number };
    }) => {
      if (selection.text && selection.text.trim().length > 0) {
        setSelectedText(selection.text);
        // Convert PDF coordinates to screen coordinates if needed
        setSelectionRect({
          x: selection.bounds.x,
          y: selection.bounds.y,
          width: selection.bounds.width,
          height: selection.bounds.height,
        });
        setShowAskRinaPopup(true);

        // Auto-hide popup after 8 seconds if not interacted with
        setTimeout(() => {
          setShowAskRinaPopup(false);
        }, 8000);
      }
    },
    []
  );

  const onSelectionCleared = useCallback(() => {
    console.log("PDF text selection cleared");
    setSelectedText("");
    setSelectionRect(null);
    setShowAskRinaPopup(false);
  }, []);

  // Ask Rina handlers
  const handleAskRina = useCallback(() => {
    // If doc is still processing, show notice
    if (docId && ragStatus !== 'completed') {
      Alert.alert('AI processing', 'This document is still being processed for AI features. Try again shortly.');
      return;
    }

    if (selectedText.trim()) {
      setRinaQuery(`Explain this text: "${selectedText}"`);
      setShowAskRinaModal(true);
      setShowAskRinaPopup(false);
    }
  }, [selectedText]);

  const handleCustomRinaQuery = useCallback(() => {
    if (docId && ragStatus !== 'completed') {
      Alert.alert('AI processing', 'This document is still being processed for AI features. Try again shortly.');
      return;
    }

    if (selectedText.trim()) {
      setRinaQuery("");
      setShowAskRinaModal(true);
      setShowAskRinaPopup(false);
    }
  }, [selectedText]);

  // Poll RAG processing status for provided docId prop
  useEffect(() => {
    let mounted = true;
    let timer: any = null;
    async function pollStatus(id: string) {
      try {
        setIsCheckingRag(true);
        const res = await checkRAGStatus(id);
        if (!mounted) return;
        setRagStatus(res.status || null);
      } catch (e) {
        // ignore transient errors
        console.warn('Failed to fetch RAG status', e);
      } finally {
        if (mounted) setIsCheckingRag(false);
      }
    }

  const id = docId || (noteId as any) || undefined;
    if (id) {
      // initial check
      pollStatus(id);
      // poll every 4 seconds until completed or failed
      timer = setInterval(() => pollStatus(id), 4000);
    }

    return () => {
      mounted = false;
      if (timer) clearInterval(timer);
    };
  }, [noteId, docId]);

  const handleRinaModalClose = useCallback(() => {
    setShowAskRinaModal(false);
    setRinaQuery("");
    // Clear selection when modal is closed
    setSelectedText("");
    setSelectionRect(null);
    setShowAskRinaPopup(false);
    // Also close text preview modal if open
    setShowTextPreviewModal(false);
    setPreviewExtractedText("");
  }, []);

  // Handle text select tool activation (WebView functionality has been removed)
  const handleTextSelectTool = useCallback(() => {
    if (selectedTool === "textSelect") {
      setSelectedTool(null);
      return;
    }

    // Text selection functionality has been removed
    Alert.alert(
      "Feature not available",
      "Text selection functionality has been removed."
    );
  }, [selectedTool]);

  // WebView text selection functionality has been removed

  // Convert touch coordinates (overlay screen space) to SVG viewBox coordinates,
  // inverting the current PDF transform and accounting for page horizontal offset.
  // Map overlay-local touch (locationX/locationY) directly to SVG viewBox coords.
  // Overlay resides inside the same transform+scroll container as the PDF and SVG,
  // so local coords already correspond to content space.
  const localToSvg = useCallback((localX: number, localY: number) => {
    const { displayW, contentHeight } = getLayoutMetrics();
    const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
    return {
      x: clamp(localX, 0, displayW),
      y: clamp(localY, 0, contentHeight),
    };
  }, []);

  // Helper to determine which page a content-space Y coordinate falls on
  const getPageFromContentY = useCallback((contentY: number) => {
    if (effectiveSafeMode) {
      return currentPageRef.current || 1;
    }
    const { displayH, pageSpacing } = getLayoutMetrics();
    const pageWithSpacingHeight = displayH + pageSpacing;
    const pageIndex = Math.max(0, Math.floor(contentY / pageWithSpacingHeight));
    const maxPageIndex = Math.max(0, (totalPagesRef.current || totalPages || 1) - 1);
    return Math.min(pageIndex, maxPageIndex) + 1; // Return 1-based page number
  }, [effectiveSafeMode, totalPages]);

  // Sync status functions
  const getSyncStatusIcon = () => {
    switch (syncStatus) {
      case "syncing":
        return "sync";
      case "offline":
        return "cloud-off";
      default:
        return "cloud-done";
    }
  };

  const getSyncStatusColor = () => {
    switch (syncStatus) {
      case "syncing":
        return "#F59E0B";
      case "offline":
        return "#EF4444";
      default:
        return "#34C759";
    }
  };

  const getSyncStatusText = () => {
    switch (syncStatus) {
      case "syncing":
        return "Syncing...";
      case "offline":
  return getNetworkStatusText(localNetworkStatus);
      default:
        return "Auto-saved";
    }
  };

  // If offline and we have a note id but empty annotations, try to load from device cache
  useEffect(() => {
    const loadOffline = async () => {
      if (!isOnline && currentNoteId && (!annotations || annotations.length === 0)) {
        try {
          const note = await offlineNotesService.getNoteById(currentNoteId);
          const anns = (note?.document_annotations || []) as Annotation[];
          if (Array.isArray(anns) && anns.length > 0) {
            updateAnnotations(anns);
          }
        } catch {}
      }
    };
    void loadOffline();
  }, [isOnline, currentNoteId]);

  // Sync on reconnect and periodic while online
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

  const handleFolderSelect = (folder: any | null) => {
    if (folder) {
      setSelectedFolderId(folder.id);
      setFolderName(folder.name);
    } else {
      setSelectedFolderId(null);
      setFolderName("PDF Documents");
    }
    setShowFolderModal(false);
  };

  // Fetch folders via offlineNotesService (handles offline gracefully)
  const fetchFolders = useCallback(async () => {
    try {
      setIsLoadingFolders(true);
      const data = await offlineNotesService.getAllFolders();
      setFolders(Array.isArray(data) ? data : []);

      // Keep displayed name in sync if a folder is already selected
      if (selectedFolderId) {
        const match = (Array.isArray(data) ? data : []).find(
          (f: any) => (f.id ?? f.localId)?.toString() === selectedFolderId
        );
        if (match) setFolderName(match.name);
      }
    } catch (e) {
      console.warn("Failed to load folders:", e);
      // Keep UI calm when offline; show a soft warning instead of alert spam
      if (isOnline) {
        Alert.alert("Error", "Failed to load folders. Please try again.");
      }
    } finally {
      setIsLoadingFolders(false);
    }
  }, [selectedFolderId, isOnline]);

  // Load folders when opening the modal
  useEffect(() => {
    if (showFolderModal) {
      fetchFolders();
    }
  }, [showFolderModal, fetchFolders]);

  // Reset zoom function for double-tap with immediate response
  const resetZoom = () => {
    if (
      currentZoom === 1 &&
      pdfTransform.translateX === 0 &&
      pdfTransform.translateY === 0
    )
      return;

    // Reset immediately without animation for responsive feel
    setCurrentZoom(1);
    setPdfTransform({ scale: 1, translateX: 0, translateY: 0 });
  };

  // Zoom buttons functionality with immediate response (no animation delays)
  const handleZoomIn = () => {
    const newZoom = Math.min(currentZoom * 1.25, MAX_PDF_SCALE);
    if (newZoom === currentZoom) return; // Already at max zoom

    // Center-based zoom: adjust translate so the center of the container remains centered
    const containerW =
      pdfContainerLayout?.width || containerSize.width || screenWidth;
    const containerH =
      pdfContainerLayout?.height || containerSize.height || screenHeight;
    const centerX = containerW / 2;
    const centerY = containerH / 2;

    const pdfCenterX =
      (centerX + pdfScrollOffset.x - pdfTransform.translateX) / currentZoom;
    const pdfCenterY =
      (centerY + pdfScrollOffset.y - pdfTransform.translateY) / currentZoom;

    const newTranslateX = centerX + pdfScrollOffset.x - pdfCenterX * newZoom;
    const newTranslateY = centerY + pdfScrollOffset.y - pdfCenterY * newZoom;

    // Clamp
    const maxOffsetX = (containerW * (newZoom - 1)) / 2;
    const maxOffsetY = (containerH * (newZoom - 1)) / 2;
    const clampedX = Math.max(-maxOffsetX, Math.min(maxOffsetX, newTranslateX));
    const clampedY = Math.max(-maxOffsetY, Math.min(maxOffsetY, newTranslateY));

    // Update immediately without animation for responsive feel
    setCurrentZoom(newZoom);
    const next = { scale: newZoom, translateX: clampedX, translateY: clampedY };
    setPdfTransform((prev) => ({ ...prev, ...next }));
    // Keep Reanimated shared values in sync
    svScale.value = newZoom;
    svTranslateX.value = clampedX;
    svTranslateY.value = clampedY;
  };

  const handleZoomOut = () => {
    const newZoom = Math.max(currentZoom * 0.8, MIN_PDF_SCALE);
    if (newZoom === currentZoom) return; // Already at min zoom

    const containerW =
      pdfContainerLayout?.width || containerSize.width || screenWidth;
    const containerH =
      pdfContainerLayout?.height || containerSize.height || screenHeight;
    const centerX = containerW / 2;
    const centerY = containerH / 2;

    const pdfCenterX =
      (centerX + pdfScrollOffset.x - pdfTransform.translateX) / currentZoom;
    const pdfCenterY =
      (centerY + pdfScrollOffset.y - pdfTransform.translateY) / currentZoom;

    const newTranslateX = centerX + pdfScrollOffset.x - pdfCenterX * newZoom;
    const newTranslateY = centerY + pdfScrollOffset.y - pdfCenterY * newZoom;

    // Clamp
    const maxOffsetX = (containerW * (newZoom - 1)) / 2;
    const maxOffsetY = (containerH * (newZoom - 1)) / 2;
    const clampedX = Math.max(-maxOffsetX, Math.min(maxOffsetX, newTranslateX));
    const clampedY = Math.max(-maxOffsetY, Math.min(maxOffsetY, newTranslateY));

    // Update immediately without animation for responsive feel
    setCurrentZoom(newZoom);
    const next = { scale: newZoom, translateX: clampedX, translateY: clampedY };
    setPdfTransform((prev) => ({ ...prev, ...next }));
    // Keep Reanimated shared values in sync
    svScale.value = newZoom;
    svTranslateX.value = clampedX;
    svTranslateY.value = clampedY;
  };

  // Pan responder for pinch-to-zoom gestures and drawing - optimized for real-time response
  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: (evt) => {
      const touches = (evt.nativeEvent as any).touches || [];
      // Only capture for drawing/annotation tools (single touch)
      if (
        isEditMode &&
        touches.length === 1 &&
        selectedTool !== null &&
        selectedTool !== "selection"
      )
        return true;
      return false;
    },
    onMoveShouldSetPanResponder: (evt) => {
      const touches = (evt.nativeEvent as any).touches || [];
      if (
        isEditMode &&
        touches.length === 1 &&
        selectedTool !== null &&
        selectedTool !== "selection"
      )
        return true;
      return false;
    },
    onMoveShouldSetPanResponderCapture: (evt) => {
      const touches = (evt.nativeEvent as any).touches || [];
      if (
        isEditMode &&
        touches.length === 1 &&
        selectedTool !== null &&
        selectedTool !== "selection"
      )
        return true;
      return false;
    },
    onShouldBlockNativeResponder: () => false,
    onStartShouldSetPanResponderCapture: (evt) => {
      const touches = (evt.nativeEvent as any).touches || [];
      return (
        isEditMode &&
        touches.length === 1 &&
        selectedTool !== null &&
        selectedTool !== "selection"
      );
    },

    onPanResponderGrant: (evt) => {
      // Do not auto-enter focus mode when drawing; respect user choice
      wasAutoHiddenRef.current = false;
      const touches = (evt.nativeEvent as any).touches || [];
      if (touches.length === 1 && selectedTool) {
        // Single touch drawing gesture
  const touch = touches[0];
  const { locationX, locationY } = touch as any;

        if (selectedTool === "selection" || selectedTool === "textSelect") {
          // Text selection functionality has been removed
          return;
        } else if (selectedTool === "note" || selectedTool === "text") {
          // Handle note/text placement
          const coords = screenToPDFCoordinates(locationX, locationY);
          setNotePosition({ x: coords.normalizedX, y: coords.normalizedY, page: coords.actualPage });
          setShowNoteModal(true);
        } else if (selectedTool === "highlight") {
          // For highlight tool, we'll start drawing a freehand highlight
          setIsDrawing(true);
          // Initialize point buffer with higher-precision timestamp
          const now = Date.now();
          const p0svg = localToSvg(locationX, locationY);
          currentPointsRef.current = [{ x: p0svg.x, y: p0svg.y, timestamp: now }];
          // Store original screen coordinates for page detection
          currentScreenPointsRef.current = [{ x: locationX, y: locationY, timestamp: now }];
          // Reset rendering timers
          lastRenderTimeRef.current = performance.now();
          pendingPathUpdateRef.current = false;
          // Initialize incremental smoothing path in SVG coordinates
          const p0 = localToSvg(locationX, locationY);
          livePathRef.current = `M${p0.x.toFixed(2)},${p0.y.toFixed(2)}`;
          incLastPointRef.current = { x: p0.x, y: p0.y };
          incLastMidRef.current = null;
          currentPathRef.current = livePathRef.current;
          svLivePath.value = livePathRef.current;
          setCurrentPath(livePathRef.current);

          // Pre-allocate space for better performance
          currentPointsRef.current.length = 0; // Clear
          currentPointsRef.current.push({ x: p0svg.x, y: p0svg.y, timestamp: now });
        } else {
          // Start drawing path for pen, brush, pencil, freehand highlight, eraser
          setIsDrawing(true);

          // Initialize with optimized settings
          const now = Date.now();
          const p0svg2 = localToSvg(locationX, locationY);
          const initialPoint = { x: p0svg2.x, y: p0svg2.y, timestamp: now };
          currentPointsRef.current = [initialPoint];
          // Store original screen coordinates for page detection
          currentScreenPointsRef.current = [{ x: locationX, y: locationY, timestamp: now }];
          lastPointRef.current = initialPoint;
          // Initialize incremental smoothing path for pen tools in SVG coords
          const p0 = p0svg2;
          livePathRef.current = `M${p0.x.toFixed(2)},${p0.y.toFixed(2)}`;
          incLastPointRef.current = { x: p0.x, y: p0.y };
          incLastMidRef.current = null;

          // Reset performance tracking
          lastRenderTimeRef.current = performance.now();
          pendingPathUpdateRef.current = false;
          pathCacheRef.current = "";
          pointsCountRef.current = 1;

          // Set tool-specific smoothing level for optimal performance
          smoothingLevelRef.current =
            selectedTool === "pencil"
              ? 6
              : selectedTool === "pen"
              ? 8
              : selectedTool === "brush"
              ? 10
              : 8;

          // Initial path (simple M command for single point)
          currentPathRef.current = livePathRef.current;
          svLivePath.value = livePathRef.current;
          setCurrentPath(livePathRef.current);
        }
      }
    },

    onPanResponderMove: (evt) => {
      const touches = (evt.nativeEvent as any).touches || [];
      if (
        touches.length === 1 &&
        (isDrawing || isBboxDrawing) &&
        selectedTool
      ) {
        // Handle drawing with real-time path updates
  const touch = touches[0];
  const { locationX, locationY } = touch as any;

        if (selectedTool === "textSelect") {
          // textSelect now extracts all page text automatically
          // No bbox drawing needed
          return;
        } else if (
          selectedTool === "pen" ||
          selectedTool === "brush" ||
          selectedTool === "pencil" ||
          selectedTool === "highlight" ||
          selectedTool === "eraser"
        ) {
          // Optimize point collection with distance-based filtering for smoother performance
          const p = localToSvg(locationX, locationY);
          const newPoint = { x: p.x, y: p.y, timestamp: Date.now() };

          // Skip points that are too close to reduce computational overhead
          if (lastPointRef.current) {
            const dx = newPoint.x - lastPointRef.current.x;
            const dy = newPoint.y - lastPointRef.current.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            // Only add points with sufficient movement (reduces jitter and improves performance)
            if (distance < 1.2) {
              return; // Skip this point to reduce processing
            }
          }

          // Add the filtered point
          currentPointsRef.current.push(newPoint);
          // Also store the original screen coordinates for page detection
          currentScreenPointsRef.current.push({ x: locationX, y: locationY, timestamp: Date.now() });
          lastPointRef.current = newPoint;

          // Incremental smoothing using quadratic curves: use midpoint strategy
          if (USE_INCREMENTAL_SMOOTHING && incLastPointRef.current) {
            const prev = incLastPointRef.current;
            const midX = (prev.x + newPoint.x) / 2;
            const midY = (prev.y + newPoint.y) / 2;
            const lastMid = incLastMidRef.current;
            if (!lastMid) {
              // First segment: draw a straight line to avoid curve overshoot
              livePathRef.current += ` L${midX.toFixed(2)},${midY.toFixed(2)}`;
            } else {
              // Smooth join from previous midpoint using prev as the control point
              livePathRef.current += ` Q${prev.x.toFixed(2)},${prev.y.toFixed(2)} ${midX.toFixed(2)},${midY.toFixed(2)}`;
            }
            incLastMidRef.current = { x: midX, y: midY };
            incLastPointRef.current = { x: newPoint.x, y: newPoint.y };

            // Throttle state updates to ~30-45 fps
            const nowMs = Date.now();
            // Always update reanimated path; throttle React setState only
            svLivePath.value = livePathRef.current;
            if (!lastSetTimeRef.current || nowMs - lastSetTimeRef.current >= 33) {
              currentPathRef.current = livePathRef.current;
              lastSetTimeRef.current = nowMs;
            }
          } else {
            // Fallback to animated recalculation (legacy path)
            // Efficient buffer management with sliding window
            const maxPoints = selectedTool === "pencil" ? 240 : 420;
            if (currentPointsRef.current.length > maxPoints) {
              currentPointsRef.current.splice(0, Math.floor(maxPoints * 0.1));
            }
            if (!pendingPathUpdateRef.current) {
              updatePathWithAnimation();
            }
          }
        }
      }
    },

    onPanResponderRelease: (evt) => {
      // On release finalize drawing or reset gesture trackers
      if (isDrawing && currentPath && selectedTool) {
        // If using incremental smoothing, close the last segment to the last point
        if (USE_INCREMENTAL_SMOOTHING && incLastPointRef.current && incLastMidRef.current) {
          const p = incLastPointRef.current;
          livePathRef.current += ` L${p.x.toFixed(2)},${p.y.toFixed(2)}`;
          currentPathRef.current = livePathRef.current;
          setCurrentPath(livePathRef.current);
        }
        // If we used point buffer, convert to final smoothed path
        const finalPath =
          currentPointsRef.current && currentPointsRef.current.length > 0
            ? convertPointsToSmoothedPath(
                currentPointsRef.current,
                Math.max(4, Math.min(12, smoothingLevelRef.current))
              )
            : currentPath; // Use tool-specific smoothing level

        if (selectedTool === "highlight") {
          svLivePath.value = finalPath;
          addFreehandHighlight(finalPath);
          // Text extraction via WebView has been removed
        } else if (
          selectedTool === "pen" ||
          selectedTool === "brush" ||
          selectedTool === "pencil"
        ) {
          svLivePath.value = finalPath;
          addPenAnnotation(finalPath, selectedTool);
        } else if (selectedTool === "eraser") {
          partialEraseAnnotations(finalPath);
        }

        // Optimized cleanup for maximum performance
        currentPointsRef.current.length = 0; // Faster than reassigning array
        currentScreenPointsRef.current.length = 0; // Clear screen points too
        lastPointRef.current = null;

        // Reset all performance tracking
        setIsDrawing(false);
  setCurrentPath("");
  svLivePath.value = "";
        currentPathRef.current = "";
        pathCacheRef.current = "";
        pointsCountRef.current = 0;

  // Reset incremental smoothing refs
  incLastPointRef.current = null;
  incLastMidRef.current = null;

  // Cancel any pending animation frames to avoid memory leaks
        if (animationFrameRef.current !== null) {
          cancelAnimationFrame(animationFrameRef.current);
          animationFrameRef.current = null;
          pendingPathUpdateRef.current = false;
        }
      }

      // Trigger autosave shortly after stroke completes
      try {
        if (autoSave) {
          if (autoSaveTimeoutRef.current) clearTimeout(autoSaveTimeoutRef.current);
          autoSaveTimeoutRef.current = setTimeout(() => {
            handleSaveAnnotations();
          }, 500);
        }
      } catch {}

      // Reset gesture tracking (drawing only)
      gestureStartDistanceRef.current = 0;
      gestureStartTouchRef.current = { x: 0, y: 0 };

      // Do not override user-initiated focus mode; only restore if we auto-hid
      if (wasAutoHiddenRef.current) {
        setTimeout(() => {
          setUiHidden(false);
          wasAutoHiddenRef.current = false;
        }, 150);
      }
      // HUD removed
    },

    onPanResponderTerminate: () => {
      // Reset gesture tracking (drawing only)
      gestureStartDistanceRef.current = 0;
      gestureStartTouchRef.current = { x: 0, y: 0 };

      // Reset bbox selection state if active
      if (isBboxDrawing) {
        setIsBboxDrawing(false);
        setBboxStart(null);
        setCurrentBbox(null);
      }

      // Do not override user-initiated focus mode; only restore if we auto-hid
      if (wasAutoHiddenRef.current) {
        setTimeout(() => {
          setUiHidden(false);
          wasAutoHiddenRef.current = false;
        }, 150);
      }
      // HUD removed
    },
  });

  // % -> screen using current pdfScale and the measured viewer bounds.
  // ---------------------------------------------------------------------------
  // Enhanced coordinate conversion for VERTICAL paging PDF viewer
  const screenToPDFCoordinates = (screenX: number, screenY: number) => {
    // Get container dimensions for the PDF viewer
    const containerW =
      pdfViewerBounds?.width ||
      pdfContainerLayout?.width ||
      containerSize.width ||
      screenWidth;
    const containerH =
      pdfViewerBounds?.height ||
      pdfContainerLayout?.height ||
      containerSize.height ||
      screenHeight;

    // Calculate PDF page aspect ratio
    const pageAspect =
      pdfPageDimensions?.height && pdfPageDimensions?.width
        ? pdfPageDimensions.height / pdfPageDimensions.width
        : containerH / containerW;

    // In vertical paging mode, we fit to width; height is based on aspect ratio
    const displayW = containerW;
    const displayH = displayW * pageAspect;

    // Account for horizontal centering if PDF doesn't fill entire container width (rare if fit to width)
    const offsetX = Math.max(0, (containerW - displayW) / 2);

    // Get page spacing for horizontal paging (should match the 'spacing' prop on the PDF component)
    const pageSpacing = 10;

    // Get current transform (scale, translateX, translateY)
    const { scale, translateX, translateY } = pdfTransform;

  // Reverse transform to get coordinates in the untransformed PDF space
  // In safe mode, ignore vertical scroll offset (single page). Otherwise include it for stacked pages.
  const untransformedX = (screenX - translateX) / scale;
  const untransformedY = effectiveSafeMode
    ? (screenY - translateY) / scale
    : (screenY + (pdfScrollOffset?.y || 0) - translateY) / scale;

    // For vertical paging, calculate which page the Y coordinate actually falls on
    // instead of using the current scroll-based page
    let actualPageIndex = 0;
    if (!effectiveSafeMode) {
      // Calculate which page this Y coordinate falls on
      const pageWithSpacingHeight = displayH + pageSpacing;
      actualPageIndex = Math.max(0, Math.floor(untransformedY / pageWithSpacingHeight));
      // Clamp to valid page range
      const maxPageIndex = Math.max(0, (totalPagesRef.current || totalPages || 1) - 1);
      actualPageIndex = Math.min(actualPageIndex, maxPageIndex);
    }

    const pageStartX = offsetX;
    const pageStartY = effectiveSafeMode ? 0 : actualPageIndex * (displayH + pageSpacing);

    // Calculate coordinates relative to the actual page where the drawing occurs
    const pageX = untransformedX - pageStartX;
    const pageY = untransformedY - pageStartY;

    // Convert to normalized coordinates (0-1) within the current page
    let normalizedX = pageX / displayW;
    let normalizedY = pageY / displayH;

    // Clamp to [0, 1] and warn if out of bounds
    if (
      normalizedX < 0 ||
      normalizedX > 1 ||
      normalizedY < 0 ||
      normalizedY > 1
    ) {
      if (__DEV__) {
        console.warn("⚠️ Normalized coordinates out of bounds, clamping:", {
          x: normalizedX,
          y: normalizedY,
        });
      }
      normalizedX = Math.max(0, Math.min(1, normalizedX));
      normalizedY = Math.max(0, Math.min(1, normalizedY));
    }

    if (__DEV__) {
    }

    return {
      normalizedX,
      normalizedY,
      actualPage: actualPageIndex + 1, // Convert back to 1-based page numbering
    };
  };

  // Centralized layout metrics for vertical stacked pages
  const getLayoutMetrics = () => {
    const containerW =
      pdfViewerBounds?.width ||
      pdfContainerLayout?.width ||
      containerSize.width ||
      screenWidth;
    const containerH =
      pdfViewerBounds?.height ||
      pdfContainerLayout?.height ||
      containerSize.height ||
      screenHeight;

    const pageAspect =
      pdfPageDimensions?.height && pdfPageDimensions?.width
        ? pdfPageDimensions.height / pdfPageDimensions.width
        : containerH / containerW;

    const displayW = containerW; // fit-to-width
    const displayH = displayW * pageAspect;
    const pageSpacing = 10; // keep in sync with Pdf prop
    const offsetX = Math.max(0, (containerW - displayW) / 2);
    const totalPagesCount = totalPagesRef.current || totalPages || 0;
    // In safe mode, only render one page tall surface to avoid massive views
    const contentHeight = effectiveSafeMode
      ? displayH
      : Math.max(
          1,
          totalPagesCount > 0
            ? totalPagesCount * (displayH + pageSpacing) - pageSpacing
            : displayH
        );

    return {
      containerW,
      containerH,
      displayW,
      displayH,
      pageSpacing,
      offsetX,
      contentHeight,
    };
  };

  // Convert normalized PDF coordinates (0-1 percentages) back to current screen coordinates
  const pdfToScreenCoordinates = (normalizedX: number, normalizedY: number) => {
    // Get the current container dimensions
    const viewerWidth = containerSize.width || screenWidth;
    const viewerHeight = containerSize.height || screenHeight - 300;

    // Since annotations are in the same transform container as the PDF,
    // we don't need to apply the transform here - the transform is applied
    // at the container level, so we just convert normalized to container coordinates
    const containerX = normalizedX * viewerWidth;
    const containerY = normalizedY * viewerHeight;

    console.log("pdfToScreen (unified transform + scroll):", {
      normalized: { x: normalizedX, y: normalizedY },
      container: { width: viewerWidth, height: viewerHeight },
      containerCoords: { x: containerX, y: containerY },
      scroll: pdfScrollOffset,
      note: "Transform and scroll applied at container level",
    });

    return {
      screenX: containerX,
      screenY: containerY,
    };
  };

  const addPenAnnotation = (
    path: string,
    penType: "pen" | "brush" | "pencil"
  ) => {
    // Determine the actual page from the first point in the path
    // currentPointsRef contains SVG/content-space coordinates from localToSvg
    let actualPage = currentPageRef.current;
    if (currentPointsRef.current && currentPointsRef.current.length > 0) {
      // Use the first content-space point to determine which page this stroke belongs to
      const firstPoint = currentPointsRef.current[0];
      actualPage = getPageFromContentY(firstPoint.y);
      if (__DEV__) {
        console.log(`🖊️ Drawing on page ${actualPage} - First point Y: ${firstPoint.y.toFixed(2)}`);
      }
    }
    // Convert path coordinates to PDF page percentages for storage using the correct page
    const normalizedPath = convertPathToNormalized(path, actualPage);

    console.log(
      `➕ Adding ${penType} annotation on page ${actualPage} of ${totalPages}`
    );

    const newAnnotation: Annotation = {
      id: Date.now().toString(),
      type: penType,
      page: actualPage,
      x: 0, // Will be calculated from path bounds if needed
      y: 0, // Will be calculated from path bounds if needed
      color: selectedColor,
      path: normalizedPath, // SVG path with percentage coordinates (0-1)
      strokeWidth,
      pressure: extractPressureFromPath(path),
      timestamp: Date.now(),
    };

    const updated = [...annotations, newAnnotation];
    saveAnnotationsWithChanges(updated);
  };

  const addFreehandHighlight = (path: string) => {
    // Determine the actual page from the first point in the path
    // currentPointsRef contains SVG/content-space coordinates from localToSvg
    let actualPage = currentPageRef.current;
    if (currentPointsRef.current && currentPointsRef.current.length > 0) {
      // Use the first content-space point to determine which page this stroke belongs to
      const firstPoint = currentPointsRef.current[0];
      actualPage = getPageFromContentY(firstPoint.y);
      if (__DEV__) {
        console.log(`✨ Highlighting on page ${actualPage} - First point Y: ${firstPoint.y.toFixed(2)}`);
      }
    }
    // Convert path coordinates to PDF page percentages for storage using the correct page
    const normalizedPath = convertPathToNormalized(path, actualPage);

    console.log(
      `➕ Adding highlight annotation on page ${actualPage} of ${totalPages}`
    );

    const newAnnotation: Annotation = {
      id: Date.now().toString(),
      type: "highlight",
      page: actualPage,
      x: 0, // Will be calculated from path bounds if needed
      y: 0, // Will be calculated from path bounds if needed
      color: selectedColor,
      path: normalizedPath, // SVG path with percentage coordinates (0-1)
      strokeWidth,
      opacity: Math.max(0.1, Math.min(1, highlightOpacity)),
      timestamp: Date.now(),
    };

    const updated = [...annotations, newAnnotation];
    saveAnnotationsWithChanges(updated);
  };

  const extractPressureFromPath = (path: string): number[] => {
    const pressureData: number[] = [];
    const commands = path.split(/[ML]/).filter((cmd) => cmd.trim());

    commands.forEach((cmd) => {
      const parts = cmd.trim().split(":");
      if (parts.length === 2) {
        const pressure = parseFloat(parts[1]);
        pressureData.push(isNaN(pressure) ? 1 : pressure);
      } else {
        pressureData.push(1); // Default pressure
      }
    });

    return pressureData;
  };

  const cleanPathFromPressure = (path: string): string => {
    return path.replace(/:[\d.]+/g, "");
  };

  const convertPathToNormalized = (path: string, targetPage?: number): string => {
    const cleanPath = cleanPathFromPressure(path);

    // Helper: sample a path containing M, L, C commands into a list of points
    const samplePathToPoints = (
      p: string,
      samplesPerSeg = 6
    ): { x: number; y: number }[] => {
      const pts: { x: number; y: number }[] = [];
      if (!p) return pts;

      // Tokenize commands and numbers (keep absolute commands only)
      const tokens =
        p
          .replace(/,/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .match(/[MLQC]|-?\d*\.?\d+/g) || [];
      let idx = 0;
      let cx = 0,
        cy = 0;

      const readNum = () => parseFloat(tokens[idx++]);

      while (idx < tokens.length) {
        const tk = tokens[idx++];
        if (tk === "M" || tk === "L") {
          const x = readNum();
          const y = readNum();
          pts.push({ x, y });
          cx = x;
          cy = y;
        } else if (tk === "Q") {
          // Quadratic Bezier: control point (x1,y1) and end point (x,y)
          const x1 = readNum();
          const y1 = readNum();
          const x = readNum();
          const y = readNum();
          // sample this quadratic Bezier
          for (let s = 1; s <= samplesPerSeg; s++) {
            const t = s / samplesPerSeg;
            const mt = 1 - t;
            const bx = mt * mt * cx + 2 * mt * t * x1 + t * t * x;
            const by = mt * mt * cy + 2 * mt * t * y1 + t * t * y;
            pts.push({ x: bx, y: by });
          }
          cx = x;
          cy = y;
        } else if (tk === "C") {
          const x1 = readNum();
          const y1 = readNum();
          const x2 = readNum();
          const y2 = readNum();
          const x = readNum();
          const y = readNum();
          // sample this cubic Bezier
          for (let s = 1; s <= samplesPerSeg; s++) {
            const t = s / samplesPerSeg;
            const mt = 1 - t;
            const bx =
              mt * mt * mt * cx +
              3 * mt * mt * t * x1 +
              3 * mt * t * t * x2 +
              t * t * t * x;
            const by =
              mt * mt * mt * cy +
              3 * mt * mt * t * y1 +
              3 * mt * t * t * y2 +
              t * t * t * y;
            pts.push({ x: bx, y: by });
          }
          cx = x;
          cy = y;
        } else {
          // Unexpected token: try to parse as pair
          const maybeNum = parseFloat(tk);
          if (!Number.isNaN(maybeNum) && idx < tokens.length) {
            const y = parseFloat(tokens[idx++]);
            pts.push({ x: maybeNum, y });
            cx = maybeNum;
            cy = y;
          }
        }
      }

      return pts;
    };

    const points = samplePathToPoints(cleanPath, 6);
    if (!points || points.length === 0) return "";

    // Compute vertical layout metrics to map content coords -> page coords
    const containerW =
      pdfViewerBounds?.width ||
      pdfContainerLayout?.width ||
      containerSize.width ||
      screenWidth;
    const containerH =
      pdfViewerBounds?.height ||
      pdfContainerLayout?.height ||
      containerSize.height ||
      screenHeight;
    const pageAspect =
      pdfPageDimensions?.height && pdfPageDimensions?.width
        ? pdfPageDimensions.height / pdfPageDimensions.width
        : containerH / containerW;
    const displayW = containerW; // fit-to-width
    const displayH = displayW * pageAspect;
    const offsetX = Math.max(0, (containerW - displayW) / 2);
    const pageSpacing = 10; // keep in sync with Pdf prop
    
    // Determine the effective page for normalization
    // The points from localToSvg are already in content space (stacked pages vertically)
    // So we need to determine which page based on the Y coordinate of the first point
    let effectivePage: number;
    if (typeof targetPage === 'number' && Number.isFinite(targetPage)) {
      effectivePage = targetPage;
    } else if (points.length > 0) {
      // Calculate page from the first point's Y coordinate in content space
      const pageWithSpacingHeight = displayH + pageSpacing;
      const calculatedPageIndex = Math.max(0, Math.floor(points[0].y / pageWithSpacingHeight));
      const maxPageIndex = Math.max(0, (totalPagesRef.current || totalPages || 1) - 1);
      effectivePage = Math.min(calculatedPageIndex, maxPageIndex) + 1;
    } else {
      effectivePage = currentPageRef.current || 1;
    }
    
    const pageIndex = Math.max(0, effectivePage - 1);
    const pageStartY = (effectiveSafeMode ? 0 : pageIndex * (displayH + pageSpacing));

    // Convert sampled points to normalized M/L path (relative to the detected page)
    // Points from localToSvg are in content space, so subtract pageStartY to get page-relative coords
    let normalized = "";
    for (let i = 0; i < points.length; i++) {
      const px = (points[i].x - offsetX) / displayW;
      const py = (points[i].y - pageStartY) / displayH;
      const nx = Math.max(0, Math.min(1, px));
      const ny = Math.max(0, Math.min(1, py));
      if (i === 0) normalized += `M${nx.toFixed(6)},${ny.toFixed(6)}`;
      else normalized += ` L${nx.toFixed(6)},${ny.toFixed(6)}`;
    }

    return normalized;
  };

  const convertNormalizedPathToScreenForPage = useCallback((
    path: string,
    page: number
  ): string => {
    if (!path) return "";
    
    // Performance: Check cache first
    const { displayW, displayH, offsetX, pageSpacing } = getLayoutMetrics();
    const pageIndex = Math.max(0, (page || 1) - 1);
    const pageStartY = effectiveSafeMode ? 0 : pageIndex * (displayH + pageSpacing);
    
    // Create cache key including all factors that affect the conversion
    const cacheKey = `${path}|${page}|${displayW.toFixed(0)}|${displayH.toFixed(0)}|${currentZoom.toFixed(2)}`;
    
    // Return cached result if available
    if (pathConversionCache.current.has(cacheKey)) {
      return pathConversionCache.current.get(cacheKey)!;
    }

    // Build path string in SVG-local coordinates for current page
    const parts = path.split(/([ML])/);
    let svgPath = "";

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (part === "M" || part === "L") {
        svgPath += part;
      } else if (part && part.trim()) {
        const coords = part.trim().split(",");
        if (coords.length === 2) {
          const normalizedX = parseFloat(coords[0]);
          const normalizedY = parseFloat(coords[1]);
          if (Number.isFinite(normalizedX) && Number.isFinite(normalizedY)) {
            const x =
              Math.max(0, Math.min(1, normalizedX)) * displayW + offsetX;
            const y =
              Math.max(0, Math.min(1, normalizedY)) * displayH + pageStartY;
            svgPath += `${x.toFixed(2)},${y.toFixed(2)}`;
          } else {
            svgPath += part;
          }
        } else {
          svgPath += part;
        }
      }
    }

    // Cache the result (with size limit)
    if (pathConversionCache.current.size >= maxCacheSize) {
      // Clear oldest entries (simple FIFO strategy)
      const keysToDelete = Array.from(pathConversionCache.current.keys()).slice(0, 100);
      keysToDelete.forEach(k => pathConversionCache.current.delete(k));
    }
    pathConversionCache.current.set(cacheKey, svgPath);

    return svgPath;
  }, [effectiveSafeMode, currentZoom]);

  // Backward-compatible helper using current page
  const convertNormalizedPathToScreen = (path: string, page?: number): string => {
    const targetPage = page && Number.isFinite(page) ? page : (currentPageRef.current || 1);
    return convertNormalizedPathToScreenForPage(path, targetPage);
  };

  const scalePathForZoom = (path: string, scale: number): string => {
    // This function is deprecated - use convertNormalizedPathToScreen instead
    // keeping for backward compatibility but delegating to the new approach
    return convertNormalizedPathToScreen(path);
  };

  const partialEraseAnnotations = (eraserPath: string) => {
    // Determine the actual page where erasing is happening
    // currentPointsRef contains SVG/content-space coordinates from localToSvg
    let actualErasePage = currentPageRef.current;
    if (currentPointsRef.current && currentPointsRef.current.length > 0) {
      const firstPoint = currentPointsRef.current[0];
      actualErasePage = getPageFromContentY(firstPoint.y);
    }
    const normalizedEraserPath = convertPathToNormalized(eraserPath, actualErasePage);
    const eraserPoints = getPathPoints(normalizedEraserPath);
    const eraseThreshold = Math.max(0.01, Math.min(0.15, eraserSize));

    const modifiedAnnotations = annotations
      .map((ann) => {
        if (ann.page !== actualErasePage) return ann; // Keep annotations from other pages
        if (!ann.path && !ann.x && !ann.y) return ann; // Keep annotations without position data

        // For path-based annotations (drawings, highlights, pen strokes)
        if (ann.path) {
          const annotationPoints = getPathPoints(ann.path);
          const remainingPoints: { x: number; y: number }[] = [];

          annotationPoints.forEach((point) => {
            let shouldKeep = true;
            for (const eraserPoint of eraserPoints) {
              const distance = Math.sqrt(
                (point.x - eraserPoint.x) ** 2 + (point.y - eraserPoint.y) ** 2
              );
              if (distance < eraseThreshold) {
                shouldKeep = false;
                break;
              }
            }
            if (shouldKeep) {
              remainingPoints.push(point);
            }
          });

          // If we have remaining points, create a new path
          if (remainingPoints.length > 1) {
            const newPath = reconstructPath(remainingPoints);
            return {
              ...ann,
              path: newPath,
              id: ann.id + "_modified_" + Date.now(), // Update ID to trigger re-render
            };
          } else {
            // If too few points remain, remove the annotation
            return null;
          }
        }

        // For point-based annotations (notes, text) - coordinates are already normalized
        if (ann.x !== undefined && ann.y !== undefined) {
          const shouldErase = eraserPoints.some((eraserPoint) => {
            const distance = Math.sqrt(
              (ann.x - eraserPoint.x) ** 2 + (ann.y - eraserPoint.y) ** 2
            );
            return distance < eraseThreshold;
          });
          return shouldErase ? null : ann;
        }

        return ann;
      })
      .filter((ann) => ann !== null) as Annotation[];

    saveAnnotationsWithChanges(modifiedAnnotations);
  };

  // Text extraction functionality using WebView has been removed
  const attemptToExtractTextFromPath = (path: string) => {
    // Functionality has been removed
    setShowTextExtractionModal(true);
  };

  const getPathPoints = (path: string) => {
    // Reuse a lightweight parser that understands M/L/C absolute commands
    const pts: { x: number; y: number }[] = [];
    if (!path) return pts;
    const tokens =
      path
        .replace(/,/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .match(/[MLC]|-?\d*\.?\d+/g) || [];
    let i = 0;
    let cx = 0,
      cy = 0;
    const readNum = () => parseFloat(tokens[i++]);

    while (i < tokens.length) {
      const tk = tokens[i++];
      if (tk === "M" || tk === "L") {
        const x = readNum();
        const y = readNum();
        pts.push({ x, y });
        cx = x;
        cy = y;
      } else if (tk === "C") {
        const x1 = readNum();
        const y1 = readNum();
        const x2 = readNum();
        const y2 = readNum();
        const x = readNum();
        const y = readNum();
        // sample cubic to points
        const samples = 6;
        for (let s = 1; s <= samples; s++) {
          const t = s / samples;
          const mt = 1 - t;
          const bx =
            mt * mt * mt * cx +
            3 * mt * mt * t * x1 +
            3 * mt * t * t * x2 +
            t * t * t * x;
          const by =
            mt * mt * mt * cy +
            3 * mt * mt * t * y1 +
            3 * mt * t * t * y2 +
            t * t * t * y;
          pts.push({ x: bx, y: by });
        }
        cx = x;
        cy = y;
      } else {
        // fallback: try to parse as number pair
        const maybeX = parseFloat(tk);
        if (!Number.isNaN(maybeX) && i < tokens.length) {
          const y = parseFloat(tokens[i++]);
          pts.push({ x: maybeX, y });
          cx = maybeX;
          cy = y;
        }
      }
    }

    return pts;
  };

  const reconstructPath = (points: { x: number; y: number }[]): string => {
    if (points.length === 0) return "";

    let path = `M${points[0].x},${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      path += ` L${points[i].x},${points[i].y}`;
    }

    return path;
  };

  const eraseAnnotations = (eraserPath: string) => {
    // Simple bounding box intersection check
    const erased = annotations.filter((ann) => {
  if (ann.page !== currentPageRef.current) return true; // Keep annotations from other pages
      if (!ann.path && !ann.x && !ann.y) return true; // Keep annotations without position data

      // For path-based annotations (drawings, freehand highlights)
      if (ann.path) {
        return !isPathIntersecting(ann.path, eraserPath);
      }

      // For point-based annotations (notes, text, old-style highlights)
      if (ann.x !== undefined && ann.y !== undefined) {
        return !isPointInEraserPath(ann.x, ann.y, eraserPath);
      }

      return true;
    });

    saveAnnotationsWithChanges(erased);
  };

  // Simple path intersection detection (using normalized coordinates)
  const isPathIntersecting = (path1: string, path2: string) => {
    // Extract points from both paths
    const getPathPoints = (path: string) => {
      const points: { x: number; y: number }[] = [];
      const commands = path.split(/[ML]/).filter((cmd) => cmd.trim());

      commands.forEach((cmd) => {
        const coords = cmd.trim().split(",");
        if (coords.length === 2) {
          points.push({
            x: parseFloat(coords[0]),
            y: parseFloat(coords[1]),
          });
        }
      });

      return points;
    };

    const path1Points = getPathPoints(path1);
    const path2Points = getPathPoints(path2);

    // Check if any point in path1 is close to any point in path2
  const threshold = Math.max(0.01, Math.min(0.15, eraserSize));

    for (const p1 of path1Points) {
      for (const p2 of path2Points) {
        const distance = Math.sqrt((p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2);
        if (distance < threshold) {
          return true;
        }
      }
    }

    return false;
  };

  // Check if a point is close to the eraser path (using normalized coordinates)
  const isPointInEraserPath = (x: number, y: number, eraserPath: string) => {
    const getPathPoints = (path: string) => {
      const points: { x: number; y: number }[] = [];
      const commands = path.split(/[ML]/).filter((cmd) => cmd.trim());

      commands.forEach((cmd) => {
        const coords = cmd.trim().split(",");
        if (coords.length === 2) {
          points.push({
            x: parseFloat(coords[0]),
            y: parseFloat(coords[1]),
          });
        }
      });

      return points;
    };

    const eraserPoints = getPathPoints(eraserPath);
    const threshold = 0.05; // Normalized threshold (5% of screen)

    for (const point of eraserPoints) {
      const distance = Math.sqrt((x - point.x) ** 2 + (y - point.y) ** 2);
      if (distance < threshold) {
        return true;
      }
    }

    return false;
  };

  const addHighlightAnnotation = (x: number, y: number) => {
    // Convert screen coordinates to PDF page percentages (0-1)
    const coords = screenToPDFCoordinates(x, y);
    const actualPage = coords.actualPage;

    console.log(
      `➕ Adding highlight annotation on page ${actualPage} of ${totalPages}`
    );
    console.log("🔍 Highlight coordinate conversion:", {
      input: { x, y },
      output: coords,
      targetPage: actualPage,
    });

    // Validate coordinates and page
    if (actualPage < 1 || actualPage > (totalPagesRef.current || 1)) {
      console.error(
        `❌ Invalid page ${actualPage} for highlight (valid range: 1-${totalPagesRef.current})`
      );
      Alert.alert(
        "Error",
        `Cannot add annotation: invalid page ${actualPage}`
      );
      return;
    }

    const newAnnotation: Annotation = {
      id: Date.now().toString(),
      type: "highlight",
      page: actualPage,
      x: coords.normalizedX, // Percentage of PDF page width (0-1)
      y: coords.normalizedY, // Percentage of PDF page height (0-1)
      width: 0.15, // 15% of PDF page width
      height: 0.025, // 2.5% of PDF page height
      color: selectedColor,
      opacity: Math.max(0.1, Math.min(1, highlightOpacity)),
      timestamp: Date.now(),
    };

    console.log("✅ Created highlight annotation:", newAnnotation);
    const updated = [...annotations, newAnnotation];
    saveAnnotationsWithChanges(updated);
  };

  const addNoteAnnotation = () => {
    if (!noteText.trim()) return;

    const actualPage = notePosition.page || currentPageRef.current;

    console.log(
      `➕ Adding ${
        selectedTool === "text" ? "text" : "note"
      } annotation on page ${actualPage} of ${totalPagesRef.current}`
    );

    // Validate page and coordinates
    if (actualPage < 1 || actualPage > (totalPagesRef.current || 1)) {
      console.error(
        `❌ Invalid page ${actualPage} for note (valid range: 1-${totalPagesRef.current})`
      );
      Alert.alert(
        "Error",
        `Cannot add annotation: invalid page ${actualPage}`
      );
      return;
    }

    console.log("🔍 Note coordinate conversion:", {
      input: notePosition,
      containerSize,
      targetPage: actualPage,
    });

    const newAnnotation: Annotation = {
      id: Date.now().toString(),
      type: selectedTool === "text" ? "text" : "note",
      page: actualPage,
      x: notePosition.x, // Use the normalized coordinates directly
      y: notePosition.y, // Use the normalized coordinates directly
      color: selectedColor,
      text: noteText,
      timestamp: Date.now(),
    };

    console.log("✅ Created note annotation:", newAnnotation);
    const updated = [...annotations, newAnnotation];
    saveAnnotationsWithChanges(updated);
    setShowNoteModal(false);
    setNoteText("");
  };

  const deleteAnnotation = (id: string) => {
    const updated = annotations.filter((ann) => ann.id !== id);
    saveAnnotationsWithChanges(updated);
  };

  // Enhanced debugging function to test coordinate conversion for horizontal paging
  const debugCoordinateConversion = () => {
    console.log("🧪 HORIZONTAL PAGING COORDINATE CONVERSION DEBUG TEST:");
    console.log("📊 Current state:", {
      totalPages,
      currentPage,
      containerSize,
      pdfPageDimensions,
      screenDimensions: { width: screenWidth, height: screenHeight },
    });

    // Test annotation coordinates
    annotations.forEach((ann, index) => {
      console.log(`  Annotation ${index + 1}:`, {
        id: ann.id,
        type: ann.type,
        page: ann.page,
        coordinates: { x: ann.x, y: ann.y },
        isValidPage: ann.page >= 1 && ann.page <= totalPages,
        isValidCoords: ann.x >= 0 && ann.x <= 1 && ann.y >= 0 && ann.y <= 1,
      });
    });

    // Test coordinate conversion with sample points for the current page
    const testPoints = [
      { x: 20, y: 20, desc: "top-left" },
      { x: screenWidth / 2, y: screenHeight / 4, desc: "top-center" },
      { x: screenWidth - 20, y: 20, desc: "top-right" },
      { x: screenWidth / 2, y: screenHeight / 2, desc: "center" },
      { x: 20, y: screenHeight - 100, desc: "bottom-left" },
      { x: screenWidth - 20, y: screenHeight - 100, desc: "bottom-right" },
    ];

  console.log(`🧪 Testing coordinate conversion on page ${currentPageRef.current}:`);
    testPoints.forEach((point) => {
      const converted = screenToPDFCoordinates(point.x, point.y);
      console.log(
        `  ${point.desc}: (${point.x}, ${
          point.y
        }) → (${converted.normalizedX.toFixed(
          3
        )}, ${converted.normalizedY.toFixed(3)})`
      );
    });
  };

  const exportAnnotatedPDF = async () => {
    try {
      if (annotations.length === 0) {
        showWarningToast("Add annotations to export PDF");
        return;
      }

      // Automatically export to new file and download to phone storage
      showInfoToast("Exporting PDF...");
      await exportToPDFNewFile();
    } catch (error) {
      console.error("Error in export options:", error);
      showErrorToast("Failed to export PDF");
    }
  };

  const exportToPDFNewFile = async () => {
    try {
      console.log("🚀 Starting PDF export process with enhanced debugging...");
      console.log("📋 Export context:", {
        fileName,
        sourceUri: source.uri,
        totalAnnotations: annotations.length,
        totalPages,
        currentPage,
        containerSize,
        pdfPageDimensions,
      });

      // Convert UI annotations to PDF annotations format
      const pdfAnnotations: PDFAnnotation[] = annotations.map((annotation) => ({
        ...annotation,
        type: annotation.type as PDFAnnotation["type"],
      }));

      // Enhanced debugging: Log detailed page distribution
      const pageDistribution = pdfAnnotations.reduce((acc, ann) => {
        acc[ann.page] = (acc[ann.page] || 0) + 1;
        return acc;
      }, {} as Record<number, number>);

      console.log("� ENHANCED EXPORT DEBUG:");
      console.log("�📊 Annotation distribution by page:", pageDistribution);
      console.log("📄 Total pages in PDF viewer:", totalPages);
      console.log("📝 Total annotations to export:", pdfAnnotations.length);
      console.log("📏 Container dimensions:", containerSize);
      console.log("📐 PDF page dimensions:", pdfPageDimensions);

      // Validate all annotations have valid pages
      const invalidAnnotations = pdfAnnotations.filter(
        (ann) => ann.page < 1 || ann.page > totalPages
      );
      if (invalidAnnotations.length > 0) {
        console.error("❌ Found annotations with invalid page numbers:");
        invalidAnnotations.forEach((ann) => {
          console.error(
            `  - Annotation ID ${ann.id}: page ${ann.page} (valid range: 1-${totalPages})`
          );
        });
      }

      // Validate coordinates
      const invalidCoords = pdfAnnotations.filter(
        (ann) => ann.x < 0 || ann.x > 1 || ann.y < 0 || ann.y > 1
      );
      if (invalidCoords.length > 0) {
        console.warn("⚠️ Found annotations with invalid coordinates:");
        invalidCoords.forEach((ann) => {
          console.warn(
            `  - Annotation ID ${ann.id}: coords (${ann.x}, ${ann.y})`
          );
        });
      }

      // Generate meaningful filename
      const timestamp = new Date()
        .toISOString()
        .slice(0, 19)
        .replace(/[T:]/g, "_");
      const baseFileName = fileName.replace(/\.pdf$/i, "");
      const exportFileName = `${baseFileName}_annotated_${timestamp}.pdf`;

      const saveOptions: PDFSaveOptions = {
        createBackup: false, // No need for backup when creating new file
        saveDirectly: false,
        outputFileName: exportFileName,
        viewerInfo: {
          totalPages,
          viewerWidth: containerSize.width || screenWidth,
          viewerHeight: containerSize.height || screenHeight - 300,
          pdfPageDimensions,
        },
      };

      // Run coordinate validation before export
      debugCoordinateConversion();

      // Calculate exact PDF page height based on dimensions
      let pageHeight;
      if (pdfPageDimensions.width && pdfPageDimensions.height) {
        const aspectRatio = pdfPageDimensions.height / pdfPageDimensions.width;
        const viewerWidth = containerSize.width || screenWidth;
        pageHeight = viewerWidth * aspectRatio;
      } else {
        pageHeight = (containerSize.height || screenHeight - 300) / totalPages;
      }

      console.log("📏 PDF EXPORT PRECISE DIMENSIONS:", {
        pdfPageDimensions,
        calculatedPageHeight: pageHeight,
        totalPages,
        containerSize,
      });

      // Validate annotations before export
      const invalidPageAnnotations = pdfAnnotations.filter(
        (ann) => ann.page < 1 || ann.page > totalPages
      );
      if (invalidPageAnnotations.length > 0) {
        console.error(
          "❌ CRITICAL: Found annotations with invalid page numbers before export:",
          invalidPageAnnotations
        );
        console.warn(
          `${invalidPageAnnotations.length} annotations have invalid page numbers. This may cause display issues.`
        );
      }

      debugPDFCoordinates(
        pdfAnnotations,
        {
          totalPages,
          viewerWidth: containerSize.width || screenWidth,
          viewerHeight: totalPages * pageHeight, // Use exact height calculation
          pdfPageDimensions,
        },
        totalPages
      );

      console.log(
        `Exporting ${pdfAnnotations.length} annotations to new PDF with enhanced debugging...`
      );
      const result = await drawingAPI.savePDFAnnotations(
        source.uri,
        pdfAnnotations,
        saveOptions
      );

      // Validate the export result
      if (!result.savedPath) {
        throw new Error("Export completed but no file path was returned");
      }

      // Enhanced validation of the exported file
      try {
        const exportedFileInfo = await FileSystem.getInfoAsync(
          result.savedPath
        );
        if (!exportedFileInfo.exists) {
          throw new Error("Exported PDF file was not created");
        }

        const exportedSize =
          "size" in exportedFileInfo ? exportedFileInfo.size || 0 : 0;
        console.log(
          `✅ Export validation passed - file exists at: ${result.savedPath}`
        );
        console.log(
          `📊 Exported file size: ${(exportedSize / 1024).toFixed(1)} KB`
        );

        // Multi-page specific validation
        if (totalPages > 1) {
          console.log(
            `🔍 Multi-page export validation for ${totalPages} pages`
          );

          // Check if the file size is reasonable for multi-page
          const minExpectedSize = totalPages * 5 * 1024; // 5KB minimum per page
          if (exportedSize < minExpectedSize) {
            console.warn(
              `⚠️ Multi-page PDF seems small: ${exportedSize} bytes for ${totalPages} pages`
            );
          }

          // Test if the multi-page PDF can be read properly
          try {
            const testRead = await FileSystem.readAsStringAsync(
              result.savedPath,
              {
                encoding: FileSystem.EncodingType.Base64,
                length: 2048, // Read first 2KB for multi-page test
              }
            );

            if (testRead && testRead.length > 0) {
              console.log("✅ Multi-page PDF read test passed");
            } else {
              throw new Error("Multi-page PDF read test failed - empty result");
            }
          } catch (readError) {
            console.error("❌ Multi-page PDF read test failed:", readError);
            throw new Error(
              `Multi-page PDF validation failed: ${
                readError instanceof Error
                  ? readError.message
                  : "Read test failed"
              }`
            );
          }
        }
      } catch (validationErr) {
        console.error("❌ Export validation failed:", validationErr);
        throw new Error(
          `Export validation failed: ${
            validationErr instanceof Error
              ? validationErr.message
              : "Unknown error"
          }`
        );
      }

      setLastSavedPath(result.savedPath);

      // Automatically save to Downloads
      console.log("💾 Automatically saving exported PDF to Downloads");
      await onAfterExportSaved(result.savedPath);
      // Success/error toasts are shown by onAfterExportSaved
    } catch (error) {
      console.error("Error exporting PDF to new file:", error);
      showErrorToast(
        `Export failed: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  };

  const exportToPDFDirect = async () => {
    try {
      showInfoToast("Updating original PDF...");

      // Convert UI annotations to PDF annotations format
      const pdfAnnotations: PDFAnnotation[] = annotations.map((annotation) => ({
        ...annotation,
        type: annotation.type as PDFAnnotation["type"],
      }));

      // Save directly to original with automatic backup
      const saveOptions: PDFSaveOptions = {
        createBackup: true,
        saveDirectly: true,
      };

      const result = await drawingAPI.savePDFAnnotations(
        source.uri,
        pdfAnnotations,
        saveOptions
      );

      const backupLabel = result?.backupPath
        ? ` (backup ${result.backupPath.split("/").pop()})`
        : "";
      showSuccessToast(`Original PDF updated${backupLabel}`);
    } catch (error) {
      console.error("Error updating original PDF:", error);
      Alert.alert(
        "Update Failed",
        `Could not update original PDF.\n\nError: ${
          error instanceof Error ? error.message : "Unknown error"
        }\n\nYour original file is unchanged. Try exporting to a new file instead.`
      );
    }
  };

  // Helper function to open PDF in external applications
  const openInExternalApp = async (pdfPath: string) => {
    try {
      console.log("🌐 Attempting to open PDF in external app:", pdfPath);

      // Check if file exists
      const fileInfo = await FileSystem.getInfoAsync(pdfPath);
      if (!fileInfo.exists) {
        Alert.alert("File Not Found", "The PDF file could not be found.");
        return;
      }

      // Try to use the system's default PDF viewer
      const result = await Sharing.shareAsync(pdfPath, {
        mimeType: "application/pdf",
        dialogTitle: "Open PDF in...",
      });

      console.log("✅ External app open result:", result);
    } catch (error) {
      console.error("❌ Failed to open in external app:", error);
      Alert.alert(
        "Open Failed",
        `Could not open PDF in external app: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  };

  // Helper function to copy file path to clipboard
  const copyFilePathToClipboard = async (pdfPath: string) => {
    try {
      // Note: You'll need to install expo-clipboard for this
      // For now, show the path in an alert
      Alert.alert(
        "File Location",
        `PDF saved at:\n\n${pdfPath}\n\nYou can access this file using a file manager app.`,
        [
          {
            text: "Show Details",
            onPress: () => showFileDetails(pdfPath),
          },
          {
            text: "OK",
          },
        ]
      );
    } catch (error) {
      console.error("❌ Failed to handle file path:", error);
    }
  };

  // Helper function to show detailed file information with access guidance
  const showFileDetails = async (pdfPath: string) => {
    try {
      const fileInfo = await FileSystem.getInfoAsync(pdfPath);
      const fileName = pdfPath.split("/").pop() || "Unknown";
      const fileSize = "size" in fileInfo ? (fileInfo.size || 0) / 1024 : 0;
      const modTime =
        "modificationTime" in fileInfo
          ? new Date(fileInfo.modificationTime * 1000).toLocaleString()
          : "Unknown";

      Alert.alert(
        "PDF File Location & Access",
        `📄 File: ${fileName}\n` +
          `📊 Size: ${fileSize.toFixed(1)} KB (${totalPages} pages)\n` +
          `🕒 Created: ${modTime}\n\n` +
          `📍 IMPORTANT - File Location:\n` +
          `This file is saved in the app's private directory and is NOT visible in your device's regular file manager.\n\n` +
          `🔍 To access this PDF:\n` +
          `• Use the "Share" button to send to other apps\n` +
          `• Use "Open in External App" to view in PDF readers\n` +
          `• Share to Google Drive, Dropbox, or email to save permanently\n\n` +
          `💡 For permanent storage, use the Share feature!`,
        [
          {
            text: "Share Now",
            onPress: () => shareExportedPDF(pdfPath),
          },
          {
            text: "Access Guide",
            onPress: () => showFileAccessGuide(),
          },
          {
            text: "OK",
          },
        ]
      );
    } catch (error) {
      console.error("❌ Failed to get file details:", error);
      Alert.alert("Error", "Could not retrieve file information.");
    }
  };

  // Helper function to show comprehensive file access guide
  const showFileAccessGuide = () => {
    Alert.alert(
      "📱 How to Access Your Exported PDFs",
      `🔒 IMPORTANT: PDFs are saved in the app's private storage for security. They're NOT visible in your device's file manager by default.\n\n` +
        `✅ RECOMMENDED METHODS:\n\n` +
        `1️⃣ SHARE TO PERMANENT LOCATION:\n` +
        `   • Tap "Share" on any exported PDF\n` +
        `   • Choose: Google Drive, Dropbox, Email, etc.\n` +
        `   • This saves it where you can always find it\n\n` +
        `2️⃣ OPEN IN PDF APPS:\n` +
        `   • Use "Open in External App"\n` +
        `   • Opens in Adobe Reader, Chrome, etc.\n` +
        `   • From there, use the app's save feature\n\n` +
        `3️⃣ MANAGE WITHIN APP:\n` +
        `   • Use "All Exports" to see all saved PDFs\n` +
        `   • Load PDFs back into this app anytime\n` +
        `   • Share or delete old exports\n\n` +
        `💡 TIP: Always use "Share" to save PDFs to permanent, accessible locations!`,
      [
        {
          text: "Show My Exports",
          onPress: () => showExportedPDFs(),
        },
        {
          text: "Got It",
        },
      ]
    );
  };

  // Helper function to attempt saving to Downloads or Documents folder
  // Now uses unified download utility for consistent download location
  const trySaveToUserAccessibleLocation = async (
    sourcePath: string,
    fileName: string
  ) => {
    try {
      console.log("🔄 Attempting to save to user-accessible location...");

      // Use unified download utility - automatically saves to Downloads
      const result = await savePDFToDownloads(sourcePath, fileName, false);

      if (result.success) {
        showSuccessToast("PDF saved to Downloads");
        return { success: true, location: "downloads" };
      } else {
        throw new Error(result.error || "Unknown error");
      }
    } catch (error) {
      console.warn("❌ Could not save to user-accessible location:", error);

      // Show error toast and offer share as fallback
      showErrorToast("Could not save to Downloads");
      
      // Offer share option only on critical failure
      setTimeout(() => {
        Alert.alert(
          "Share PDF Instead?",
          "Would you like to share the PDF to save it elsewhere?",
          [
            {
              text: "Share",
              onPress: () => shareExportedPDF(sourcePath),
            },
            {
              text: "Cancel",
              style: "cancel",
            },
          ]
        );
      }, 500);

      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  };

  // Helper function to show alternative viewing options
  const showAlternativeViewingOptions = (pdfPath: string) => {
    const fileName = pdfPath.split("/").pop() || "exported.pdf";

    Alert.alert(
      "📱 PDF Access Options",
      `✅ PDF saved successfully!\n\n📄 File: ${fileName}\n📊 Pages: ${totalPages}\n\n🔒 NOTE: File is in app storage (not visible in file manager)\n\n🎯 Choose how to access it:`,
      [
        {
          text: "📤 Share to Drive/Downloads",
          onPress: () => shareExportedPDF(pdfPath),
        },
        {
          text: "📱 Open in PDF App",
          onPress: () => openInExternalApp(pdfPath),
        },
        {
          text: "💾 Save to Gallery",
          onPress: () => trySaveToUserAccessibleLocation(pdfPath, fileName),
        },
        {
          text: "ℹ️ Access Guide",
          onPress: () => showFileAccessGuide(),
        },
        {
          text: "Cancel",
        },
      ]
    );
  };

  // Helper function to view PDF within the app
  const viewPdfInApp = (pdfPath: string) => {
    Alert.alert(
      "View PDF",
      "Would you like to load this annotated PDF in the current viewer?",
      [
        {
          text: "Yes, Load PDF",
          onPress: () => loadAnnotatedPDF(pdfPath),
        },
        {
          text: "Cancel",
          style: "cancel",
        },
      ]
    );
  };

  // Helper function to find exported PDFs in the app directory
  const findExportedPDFs = async () => {
    // Function removed - not PDF or JPEG export function
    return [];
  };

  // Helper function to show exported PDFs to the user
  const showExportedPDFs = async () => {
    // Function removed - not PDF or JPEG export function
    Alert.alert("Export Function", "Only PDF export is available");
  };

  // Helper function to show options for a specific PDF
  const showPDFOptions = (pdf: any) => {
    const formattedDate =
      pdf.modified.toLocaleDateString() +
      " " +
      pdf.modified.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });

    Alert.alert(
      pdf.name,
      `Size: ${pdf.sizeKB} KB\nModified: ${formattedDate}\n\nWhat would you like to do?`,
      [
        {
          text: "Load in Viewer",
          onPress: () => loadAnnotatedPDF(pdf.path),
        },
        {
          text: "Share PDF",
          onPress: () => shareExportedPDF(pdf.path),
        },
        {
          text: "Open Externally",
          onPress: () => openInExternalApp(pdf.path),
        },
        {
          text: "Delete File",
          style: "destructive",
          onPress: () => confirmDeletePDF(pdf),
        },
        {
          text: "Cancel",
          style: "cancel",
        },
      ]
    );
  };

  // Helper function to show all exported PDFs
  const showAllExportedPDFs = (pdfs: any[]) => {
    const pdfList = pdfs
      .map((pdf) => {
        const formattedDate = pdf.modified.toLocaleDateString();
        return `• ${pdf.name}\n  Size: ${pdf.sizeKB} KB, Modified: ${formattedDate}`;
      })
      .join("\n\n");

    Alert.alert(
      `All Exported PDFs (${pdfs.length})`,
      pdfList + "\n\nUse 'Recent Exported PDFs' to access individual files.",
      [
        {
          text: "Clear All",
          style: "destructive",
          onPress: () => confirmClearAllPDFs(pdfs),
        },
        {
          text: "OK",
        },
      ]
    );
  };

  // Helper function to confirm PDF deletion
  const confirmDeletePDF = (pdf: any) => {
    Alert.alert(
      "Delete PDF?",
      `Are you sure you want to delete:\n\n${pdf.name}\n\nThis action cannot be undone.`,
      [
        {
          text: "Delete",
          style: "destructive",
          onPress: () => deletePDF(pdf),
        },
        {
          text: "Cancel",
          style: "cancel",
        },
      ]
    );
  };

  // Helper function to delete a PDF file
  const deletePDF = async (pdf: any) => {
    try {
      await FileSystem.deleteAsync(pdf.path, { idempotent: true });
      Alert.alert("Deleted", `${pdf.name} has been deleted.`);
    } catch (error) {
      console.error("❌ Failed to delete PDF:", error);
      Alert.alert("Delete Failed", "Could not delete the PDF file.");
    }
  };

  // Helper function to confirm clearing all PDFs
  const confirmClearAllPDFs = (pdfs: any[]) => {
    Alert.alert(
      "Clear All PDFs?",
      `This will delete all ${pdfs.length} exported PDF files from the app directory.\n\nThis action cannot be undone.`,
      [
        {
          text: "Delete All",
          style: "destructive",
          onPress: () => clearAllPDFs(pdfs),
        },
        {
          text: "Cancel",
          style: "cancel",
        },
      ]
    );
  };

  // Helper function to clear all exported PDFs
  const clearAllPDFs = async (pdfs: any[]) => {
    try {
      let deletedCount = 0;
      for (const pdf of pdfs) {
        try {
          await FileSystem.deleteAsync(pdf.path, { idempotent: true });
          deletedCount++;
        } catch (error) {
          console.log(`Could not delete ${pdf.name}:`, error);
        }
      }

      Alert.alert(
        "Cleanup Complete",
        `Deleted ${deletedCount} of ${pdfs.length} PDF files.`
      );
    } catch (error) {
      console.error("❌ Failed to clear PDFs:", error);
      Alert.alert("Cleanup Failed", "Could not delete all PDF files.");
    }
  };

  // Helper function to load an annotated PDF back into the viewer
  const loadAnnotatedPDF = async (pdfPath: string) => {
    try {
      console.log("🔄 Loading annotated PDF into viewer:", pdfPath);

      // Check if file exists
      const fileInfo = await FileSystem.getInfoAsync(pdfPath);
      if (!fileInfo.exists) {
        Alert.alert("File Not Found", "The PDF file could not be found.");
        return;
      }

      // Update the source to load the annotated PDF
      setCurrentSource({ uri: pdfPath });

      // Clear existing annotations since they're now embedded in the PDF
      setAnnotations([]);
      await AsyncStorage.removeItem(`annotations_${pdfPath}`);

      // Reset to first page
      setCurrentPage(1);

      Alert.alert(
        "PDF Loaded",
        `Successfully loaded the annotated PDF.\n\nFile: ${pdfPath
          .split("/")
          .pop()}\nPages: ${totalPages}`
      );
    } catch (error) {
      console.error("❌ Failed to load annotated PDF:", error);
      Alert.alert(
        "Load Failed",
        `Could not load the PDF: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  };

  const shareExportedPDF = async (pdfPath: string) => {
    try {
      // Verify file exists
      const info = await FileSystem.getInfoAsync(pdfPath);
      if (!info.exists) {
        Alert.alert("File Not Found", "The annotated PDF could not be found.");
        return;
      }

      // Prepare a shareable copy in cache with a proper .pdf extension
      const originalName = pdfPath.split("/").pop() || fileName || "annotated.pdf";
      const ensuredName = /\.pdf$/i.test(originalName) ? originalName : `${originalName}.pdf`;
      const targetPath = `${FileSystem.cacheDirectory}${ensuredName}`;

      // Overwrite any existing cache file
      const existing = await FileSystem.getInfoAsync(targetPath);
      if (existing.exists) {
        try { await FileSystem.deleteAsync(targetPath, { idempotent: true }); } catch {}
      }

      // Copy to cache to ensure world-readable share via FileProvider
      await FileSystem.copyAsync({ from: pdfPath, to: targetPath });

      // Share using appropriate MIME/UTI
      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        Alert.alert("Share Not Available", "Sharing is not available on this device.");
        return;
      }

      const shareOptions: any = {
        mimeType: "application/pdf",
        dialogTitle: "Share Annotated PDF",
      };

      // iOS benefits from explicit UTI
      if (Platform.OS === "ios") {
        shareOptions.UTI = "com.adobe.pdf";
      }

      await Sharing.shareAsync(targetPath, shareOptions);
    } catch (error) {
      console.error("Error sharing PDF:", error);
      Alert.alert("Share Error", `Failed to share the PDF. ${error instanceof Error ? error.message : ""}`);
    }
  };

  // Export the entire PDF document as a JPEG image
  // Now uses unified download utility for consistent download location
  const exportToJPEG = async () => {
    try {
      if (!pdfRef.current) {
        showErrorToast("Cannot access PDF document");
        return;
      }

      // Show non-intrusive info toast
      showInfoToast("Exporting current page...");

      // Use viewShotRef to capture current page
      let captureUri = null;
      if (viewShotRef.current) {
        try {
          captureUri = await viewShotRef.current.capture();
          console.log("Captured current view:", captureUri);
        } catch (captureErr) {
          console.log("Failed to capture current view:", captureErr);
          showErrorToast("Could not capture page");
          return;
        }
      } else {
        showErrorToast("Could not capture page");
        return;
      }

      if (!captureUri) {
        showErrorToast("Could not capture page");
        return;
      }

      const exportName = `${fileName.replace(/\.[^/.]+$/, "")}_page_${currentPageRef.current || 1}.jpg`;

      // Use unified download utility - saves to Photos/Downloads
      const result = await saveDrawingAsJPEG(captureUri, exportName, true);

      if (!result.success) {
        showErrorToast(result.error || "Could not export as JPEG");
      }
      // Success toast is handled by downloadUtils
    } catch (err) {
      console.error("Error exporting to JPEG:", err);
      showErrorToast("Could not export to JPEG");
    }
  };

  // Helper function to share a JPEG image
  const shareJPEGImage = async (uri: string) => {
    try {
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: "image/jpeg",
          dialogTitle: "Share JPEG Export",
        });
      } else {
        Alert.alert(
          "Share Not Available",
          "Sharing is not available on this device."
        );
      }
    } catch (error) {
      console.error("Error sharing JPEG:", error);
      Alert.alert("Share Failed", "Could not share the JPEG image.");
    }
  };

  // Helper function to convert hex color to RGB
  const hexToRgb = (hex: string) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
      ? {
          r: parseInt(result[1], 16),
          g: parseInt(result[2], 16),
          b: parseInt(result[3], 16),
        }
      : { r: 0, g: 0, b: 0 };
  };

  // Performance: Memoize annotation rendering to prevent unnecessary recalculations
  const memoizedAnnotations = useMemo(() => {
    // Group annotations by page for vertical stacked rendering
    const groupedByPage = new Map<number, Annotation[]>();
    for (const ann of annotations) {
      const p = Math.max(1, ann.page || 1);
      if (!groupedByPage.has(p)) groupedByPage.set(p, []);
      groupedByPage.get(p)!.push(ann);
    }
    return groupedByPage;
  }, [annotations]);

  const renderAnnotations = useCallback(() => {
    const groupedByPage = memoizedAnnotations;

    // Layout metrics
    const { displayW, displayH, offsetX, pageSpacing, contentHeight } =
      getLayoutMetrics();

    // Only render annotations for currently visible window of pages
    const windowRadius = effectiveSafeMode ? 0 : 2; // render current page +/- 2
    const current = currentPageRef.current || displayCurrentPage || 1;
    const startPage = Math.max(1, current - windowRadius);
    const endPage = Math.min(
      totalPagesRef.current || displayTotalPages || 1,
      current + windowRadius
    );

    return (
      <Svg
        pointerEvents="box-none"
        style={{ position: "absolute", left: 0, top: 0, right: 0, height: contentHeight }}
        width={displayW}
        height={contentHeight}
        viewBox={`0 0 ${displayW} ${contentHeight}`}
        preserveAspectRatio="xMidYMid meet"
      >
        {Array.from(groupedByPage.entries())
          .filter(([page]) => page >= startPage && page <= endPage)
          .map(([page, anns]) => {
            const pageIndex = Math.max(0, page - 1);
            const stackedTop = pageIndex * (displayH + pageSpacing);
            const pageTop = effectiveSafeMode ? 0 : stackedTop;
            return (
              <G key={`ann-page-${page}`}>
                {anns.map((annotation) => {
                  // Performance: skip rendering if annotation has no visual data
                  if (!annotation.path && annotation.x === undefined && annotation.y === undefined) {
                    return null;
                  }

                  const getPenStyle = (penType: string, baseWidth: number) => {
                    switch (penType) {
                      case "pen":
                        return {
                          strokeWidth: baseWidth,
                          opacity: 1,
                          strokeLinecap: "round" as const,
                          strokeLinejoin: "round" as const,
                          strokeDasharray: "0",
                          strokeMiterlimit: 10,
                        };
                      case "brush":
                        return {
                          strokeWidth: baseWidth * 1.8,
                          opacity: 0.9,
                          strokeLinecap: "round" as const,
                          strokeLinejoin: "round" as const,
                          strokeDasharray: "0",
                          strokeMiterlimit: 10,
                        };
                      case "pencil":
                        return {
                          strokeWidth: baseWidth * 0.8,
                          opacity: 0.8,
                          strokeLinecap: "round" as const,
                          strokeLinejoin: "round" as const,
                          strokeDasharray: "0",
                          strokeMiterlimit: 10,
                        };
                      default:
                        return {
                          strokeWidth: baseWidth,
                          opacity: 1,
                          strokeLinecap: "round" as const,
                          strokeLinejoin: "round" as const,
                          strokeDasharray: "0",
                          strokeMiterlimit: 10,
                        };
                    }
                  };

                  switch (annotation.type) {
                    case "highlight":
                      if (annotation.path) {
                        const svgPath = convertNormalizedPathToScreenForPage(
                          annotation.path,
                          page
                        );
                        const highlightBase = annotation.strokeWidth || 12;
                        const highlightStrokeWidth = scaleStrokesWithZoom
                          ? highlightBase * (currentZoom || 1)
                          : highlightBase;
                        return (
                          <Path
                            key={annotation.id}
                            d={svgPath}
                            stroke={annotation.color}
                            strokeWidth={highlightStrokeWidth}
                            fill="none"
                            opacity={typeof annotation.opacity === "number" ? annotation.opacity : Math.max(0.1, Math.min(1, highlightOpacity))}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeMiterlimit={10}
                            onPress={() => deleteAnnotation(annotation.id)}
                          />
                        );
                      } else {
                        const x = (annotation.x || 0) * displayW + offsetX;
                        const y = (annotation.y || 0) * displayH + pageTop;
                        const w = (annotation.width || 0.15) * displayW;
                        const h = (annotation.height || 0.025) * displayH;
                        return (
                          <Rect
                            key={annotation.id}
                            x={x}
                            y={y}
                            width={w}
                            height={h}
                            rx={4}
                            fill={annotation.color}
                            opacity={typeof annotation.opacity === "number" ? annotation.opacity : Math.max(0.1, Math.min(1, highlightOpacity))}
                          />
                        );
                      }

                    case "pen":
                    case "brush":
                    case "pencil":
                      const baseStroke = annotation.strokeWidth || 3;
                      const penStyle = getPenStyle(annotation.type, baseStroke);
                      const strokeW = scaleStrokesWithZoom
                        ? (penStyle.strokeWidth as number) * (currentZoom || 1)
                        : (penStyle.strokeWidth as number);
                      const penPath = convertNormalizedPathToScreenForPage(
                        annotation.path || "",
                        page
                      );
                      return (
                        <Path
                          key={annotation.id}
                          d={penPath}
                          stroke={annotation.color}
                          strokeWidth={strokeW}
                          strokeLinecap={penStyle.strokeLinecap}
                          strokeLinejoin={penStyle.strokeLinejoin}
                          strokeDasharray={penStyle.strokeDasharray}
                          strokeMiterlimit={penStyle.strokeMiterlimit}
                          fill="none"
                          opacity={penStyle.opacity}
                          onPress={() => deleteAnnotation(annotation.id)}
                        />
                      );

                    case "note":
                      const cx = (annotation.x || 0) * displayW + offsetX;
                      const cy = (annotation.y || 0) * displayH + pageTop;
                      const noteRadius = 12;
                      return (
                        <Circle
                          key={annotation.id}
                          cx={cx}
                          cy={cy}
                          r={noteRadius}
                          fill={annotation.color}
                        />
                      );

                    case "text":
                      const tx = (annotation.x || 0) * displayW + offsetX;
                      const ty = (annotation.y || 0) * displayH + pageTop;
                      return (
                        <SvgText
                          key={annotation.id}
                          x={tx}
                          y={ty}
                          fill={annotation.color}
                          fontSize={14}
                          fontWeight="bold"
                          onPress={() => {
                            Alert.alert("Text", annotation.text, [
                              {
                                text: "Delete",
                                onPress: () => deleteAnnotation(annotation.id),
                              },
                              { text: "Close" },
                            ]);
                          }}
                        >
                          {annotation.text}
                        </SvgText>
                      );

                    default:
                      return null;
                  }
                })}
              </G>
            );
          })}

        {/* Drawing Strokes Layer (from drawing editor) */}
        {strokes &&
          Array.isArray(strokes) &&
          (() => {
            if (!strokes.length) return null;

            return strokes.map((stroke) => {
              const isNormalized = true; // adapt if your points are screen coords

              // Map and simplify points to reduce SVG complexity
              const displayPoints = (() => {
                const pg = Math.max(1, stroke.page || currentPageRef.current || 1);
                if (pg < startPage || pg > endPage) return [] as {x:number;y:number}[];
                const pageIndex = Math.max(0, pg - 1);
                const stackedTop = pageIndex * (displayH + pageSpacing);
                const pageTop = effectiveSafeMode ? 0 : stackedTop;
                return (stroke.points || []).map((pt) => ({
                  x: (pt.x || 0) * displayW + offsetX,
                  y: (pt.y || 0) * displayH + pageTop,
                }));
              })();

            {/* Live in-progress stroke driven by Reanimated (always mounted) */}
        <>
          {/* Halo layers for better visibility */}
          <ReanimatedSvgPath animatedProps={liveHaloOuterProps as any} />
          <ReanimatedSvgPath animatedProps={liveHaloInnerProps as any} />
          {/* Main live path */}
          <ReanimatedSvgPath animatedProps={livePathAnimatedProps as any} />
        </>
              const simplified = simplifyPoints(displayPoints, 300);

              // Build or reuse cached path string
              const cacheKey = `${stroke.id}-${simplified.length}-${Math.round(
                (stroke.width || 2) * 10
              )}`;
              let pathData = strokePathCacheRef.current.get(cacheKey);
              if (!pathData) {
                pathData = pointsToPath(simplified);
                strokePathCacheRef.current.set(cacheKey, pathData);
              }

              const baseStrokeWidth = stroke.width ?? 2;
              const strokeWidth = scaleStrokesWithZoom
                ? baseStrokeWidth * (currentZoom || 1)
                : baseStrokeWidth;

              return (
                <AnimatedPath
                  key={`drawing-stroke-${stroke.id}`}
                  d={pathData}
                  stroke={stroke.color || "#000000"}
                  strokeWidth={strokeWidth}
                  fill="none"
                  opacity={0.95}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  pointerEvents="none"
                />
              );
            });
          })()}

        {/* Live in-progress drawing path (real-time) */}
        {(() => {
          try {
            const liveKey = `live-${currentPageRef.current}`;
            const livePath = strokePathCacheRef.current.get(liveKey);
            if (livePath) {
              const baseStroke = strokeWidth || 3;
              const liveStrokeWidth = scaleStrokesWithZoom
                ? baseStroke * (currentZoom || 1)
                : baseStroke;
              let liveOpacity = 1;
              if (selectedTool === "highlight") liveOpacity = Math.max(0.1, Math.min(1, highlightOpacity));
              if (selectedTool === "eraser") liveOpacity = 0.6;
              return (
                <AnimatedPath
                  key={`live-path-${currentPageRef.current}`}
                  d={livePath}
                  stroke={selectedColor}
                  strokeWidth={liveStrokeWidth}
                  fill="none"
                  opacity={liveOpacity}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  pointerEvents="none"
                />
              );
            }
          } catch (e) {
            // ignore
          }
          return null;
        })()}

        {/* Current drawing/highlight/eraser/pen path */}
        {isDrawing &&
          currentPath &&
          (() => {
            // Ultra-fast path access - prioritize the cached path for zero-lag rendering
            const smoothedLivePath =
              pathCacheRef.current || currentPathRef.current || currentPath;
            // Don't scale stroke width since the transform container handles all scaling
            const factor = scaleStrokesWithZoom ? (currentZoom || 1) : 1;
            const baseStrokeWidth = strokeWidth * factor;

            switch (selectedTool) {
              case "highlight":
                return (
                  <Path
                    d={smoothedLivePath}
                    stroke={selectedColor}
                    strokeWidth={baseStrokeWidth * 3}
                    fill="none"
                    opacity={0.4}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeMiterlimit={10} // Improves corner appearance
                  />
                );
              case "pen":
                return (
                  <Path
                    d={smoothedLivePath}
                    stroke={selectedColor}
                    strokeWidth={baseStrokeWidth}
                    fill="none"
                    opacity={1}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                );
              case "brush":
                return (
                  <Path
                    d={smoothedLivePath}
                    stroke={selectedColor}
                    strokeWidth={baseStrokeWidth * 1.8}
                    fill="none"
                    opacity={0.9}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeMiterlimit={10} // Improves corner appearance
                  />
                );
              case "pencil":
                return (
                  <Path
                    d={smoothedLivePath}
                    stroke={selectedColor}
                    strokeWidth={baseStrokeWidth * 0.8}
                    fill="none"
                    opacity={0.8}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeMiterlimit={10} // Improves corner appearance
                  />
                );
              case "eraser":
                return (
                  <Path
                    d={smoothedLivePath}
                    stroke="#FF4444"
                    strokeWidth={baseStrokeWidth * 2}
                    fill="none"
                    opacity={0.6}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeDasharray="5,5"
                  />
                );
              default:
                return (
                  <Path
                    d={smoothedLivePath}
                    stroke={selectedColor}
                    strokeWidth={baseStrokeWidth}
                    fill="none"
                    opacity={1}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                );
            }
          })()}

        {/* Bbox selection rectangle for textSelect mode */}
        {isBboxDrawing && currentBbox && selectedTool === "textSelect" && (
          <Rect
            x={currentBbox.x}
            y={currentBbox.y}
            width={currentBbox.width}
            height={currentBbox.height}
            fill="none"
            stroke="#8B5CF6"
            strokeWidth={2}
            strokeDasharray="5,5"
            opacity={0.8}
            rx={4}
          />
        )}
      </Svg>
    );
  }, [
    memoizedAnnotations,
    effectiveSafeMode,
    displayCurrentPage,
    displayTotalPages,
    scaleStrokesWithZoom,
    currentZoom,
    highlightOpacity,
    convertNormalizedPathToScreenForPage,
    deleteAnnotation,
    strokes,
  ]);

  return (
    <GestureHandlerRootView style={styles.container}>
      {/* Floating AI Button */}
      <Animated.View
        style={[
          styles.floatingAIButton,
          {
            left: buttonPosition.x,
            bottom: buttonPosition.y,
            transform: [{ scale: isDraggingButton ? 1.1 : 1 }],
          },
        ]}
        {...buttonPanResponder.panHandlers}
      >
        <TouchableOpacity
          style={styles.floatingAIButtonContent}
          onLongPress={() => {}}
          delayLongPress={200}
          onPress={() => {
            if (!isDraggingButton) {
              setShowAIModal(true);
              // Start slide-up animation
              Animated.timing(aiModalAnimation, {
                toValue: 1,
                duration: 300,
                useNativeDriver: true,
              }).start();
            }
          }}
        >
          <MaterialCommunityIcons name="robot" size={28} color="#FFFFFF" />
        </TouchableOpacity>
      </Animated.View>
      {/* Header as background (hidden in focus mode) */}
      {!uiHidden && (
        <View style={styles.headerBackground}>
          <LinearGradient
            colors={["#A855F7", "#8B5CF6", "#7C3AED"]}
            style={styles.gradientHeader}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          >
            <Animated.View
              style={[
                styles.header,
                {
                  opacity: fadeAnim,
                  transform: [{ translateY: slideAnim }],
                },
              ]}
            >
              <TouchableOpacity
                onPress={onClose}
                style={styles.backButton}
                activeOpacity={0.8}
              >
                <Ionicons name="chevron-back" size={24} color="#fff" />
              </TouchableOpacity>
              <View style={styles.headerCenter}>
                <Text style={styles.headerTitle} numberOfLines={1}>
                  {fileName}
                </Text>
                <Text style={styles.headerSubtitle}>PDF Annotation Viewer</Text>

                {/* Status Indicator */}
                {(externalNetworkStatus || saveStatus) && (
                  <View style={styles.statusIndicator}>
                    <MaterialIcons
                      name={
                        !externalNetworkStatus?.isConnected ||
                        !externalNetworkStatus?.isInternetReachable
                          ? "cloud-off"
                          : saveStatus?.status === "saving"
                          ? "sync"
                          : saveStatus?.status === "error"
                          ? "error"
                          : "cloud-done"
                      }
                      size={12}
                      color={
                        !externalNetworkStatus?.isConnected ||
                        !externalNetworkStatus?.isInternetReachable
                          ? "#FF9500"
                          : saveStatus?.status === "saving"
                          ? "#007AFF"
                          : saveStatus?.status === "error"
                          ? "#FF3B30"
                          : "#34C759"
                      }
                    />
                    <Text
                      style={[
                        styles.statusText,
                        {
                          color:
                            !externalNetworkStatus?.isConnected ||
                            !externalNetworkStatus?.isInternetReachable
                              ? "#FF9500"
                              : saveStatus?.status === "saving"
                              ? "#007AFF"
                              : saveStatus?.status === "error"
                              ? "#FF3B30"
                              : "#34C759",
                        },
                      ]}
                    >
                      {!externalNetworkStatus?.isConnected ||
                      !externalNetworkStatus?.isInternetReachable
                        ? "Offline"
                        : saveStatus?.status === "saving"
                        ? "Saving..."
                        : saveStatus?.status === "error"
                        ? "Error"
                        : "Saved"}
                    </Text>
                  </View>
                )}
              </View>
              <View style={styles.headerRight}>
                {/* Save Button */}
                <TouchableOpacity
                  onPress={handleSaveAnnotations}
                  style={[
                    styles.saveButton,
                    hasUnsavedChanges && styles.saveButtonActive,
                    isSavingToPDF && styles.saveButtonSaving,
                  ]}
                  activeOpacity={0.8}
                  disabled={isSavingToPDF}
                >
                  {isSavingToPDF ? (
                    <MaterialIcons name="sync" size={20} color="#ffffff" />
                  ) : (
                    <MaterialIcons
                      name={hasUnsavedChanges ? "save" : "check"}
                      size={20}
                      color="#ffffff"
                    />
                  )}
                </TouchableOpacity>

                {/* More Options Menu */}
                <TouchableOpacity
                  onPress={() => setShowMoreMenu(true)}
                  style={styles.moreButton}
                  activeOpacity={0.8}
                >
                  <MaterialIcons name="more-vert" size={24} color="#ffffff" />
                </TouchableOpacity>
              </View>
            </Animated.View>
          </LinearGradient>
        </View>
      )}

      {/* Main Container with border */}
      <View style={styles.mainContainer}>
        {/* Annotation Toolbar: replaced with shared DrawingToolbar (keeps zoom controls) */}
        {!uiHidden && (
          <View style={styles.toolbarScrollContainer}>
            <PDFToolbar
              currentTool={mapViewerToolToToolbar()}
              currentColor={selectedColor}
              currentWidth={strokeWidth}
              highlighterOpacity={highlightOpacity}
              eraserSize={eraserSize}
              currentZoom={currentZoom}
              compact
              isEditMode={isEditMode}
              onModeToggle={handleModeToggle}
              onToolChange={handleToolbarToolChange}
              onColorChange={handleToolbarColorChange}
              onWidthChange={handleToolbarWidthChange}
              scaleStrokesWithZoom={scaleStrokesWithZoom}
              onToggleScaleStrokes={() => setScaleStrokesWithZoom((v) => !v)}
              onUndo={handleToolbarUndo}
              onRedo={handleToolbarRedo}
              onClear={handleToolbarClear}
              onQuickExport={handleToolbarQuickExport}
              onZoomIn={handleZoomIn}
              onZoomOut={handleZoomOut}
              onZoomReset={resetZoom}
              canUndo={canUndo}
              canRedo={canRedo}
            />
          </View>
        )}

        {/* PDF Viewer - Direct without container */}
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <Animated.View
              style={{
                transform: [
                  {
                    rotate: spinnerRotate.interpolate({
                      inputRange: [0, 1],
                      outputRange: ["0deg", "360deg"],
                    }),
                  },
                ],
              }}
            >
              <MaterialIcons name="sync" size={56} color="#667eea" />
            </Animated.View>
            <Text style={styles.loadingText}>Loading your PDF…</Text>
            <Text style={[styles.loadingText, { fontSize: 14, marginTop: 4 }]}>
              Please wait while we prepare your document
            </Text>
          </View>
        ) : hasError ? (
          <View style={styles.errorContainer}>
            <View style={styles.errorIconContainer}>
              <MaterialIcons name="error-outline" size={72} color="#ef4444" />
            </View>
            <Text style={styles.errorTitle}>Oops! Cannot Load PDF</Text>
            <Text style={styles.errorMessage}>
              We're having trouble loading your PDF file. Here are some things
              you can try:
              {"\n\n"}📁 Check if the file exists and is accessible
              {"\n"}📋 Verify the file is a valid PDF document
              {"\n"}🔒 Ensure you have permission to read the file
            </Text>

            <LinearGradient
              colors={["#A855F7", "#8B5CF6", "#7C3AED"]}
              style={styles.retryButton}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <TouchableOpacity
                style={styles.retryButtonInner}
                onPress={() => {
                  setHasError(false);
                  setIsLoading(true);
                }}
                activeOpacity={0.8}
              >
                <MaterialIcons name="refresh" size={20} color="#ffffff" />
                <Text style={styles.retryButtonText}>Try Again</Text>
              </TouchableOpacity>
            </LinearGradient>
          </View>
        ) : (
          <View style={{ flex: 1 }}>
            {/* PDF Container */}
            <View
              style={styles.pdfCanvasContainer}
              ref={(ref) => {
                // Cast ref to any to avoid TypeScript errors with changing from ScrollView to View
                pdfScrollRef.current = ref as any;
              }}
            >
              {/* PDF and Annotation Transform Container (Reanimated host) */}
              <AnimatedRe.View
                style={[styles.pdfTransformContainer, { flex: 1 }]}
                // Let single-finger touches pass to PDF for vertical scrolling,
                // but if two fingers start, enable our overlay to handle pinch zoom
                onTouchStart={(e: any) => {
                  const touches = (e.nativeEvent as any)?.touches || [];
                  if (pinchHysteresisTimerRef.current) {
                    clearTimeout(pinchHysteresisTimerRef.current);
                    pinchHysteresisTimerRef.current = null;
                  }
                  if (touches.length >= 2) setShouldCaptureGestures(true);
                }}
                onTouchMove={(e: any) => {
                  const touches = (e.nativeEvent as any)?.touches || [];
                  if (touches.length >= 2 && !shouldCaptureGestures) {
                    setShouldCaptureGestures(true);
                  }
                }}
                onTouchEnd={(e: any) => {
                  const touches = (e.nativeEvent as any)?.touches || [];
                  if (touches.length < 2 && !selectedTool) {
                    // Add a small hysteresis before giving control back to ScrollView
                    // Remove zoom level restriction to ensure pinch works at all zoom levels
                    if (pinchHysteresisTimerRef.current) {
                      clearTimeout(pinchHysteresisTimerRef.current);
                    }
                    pinchHysteresisTimerRef.current = setTimeout(() => {
                      setShouldCaptureGestures(false);
                      pinchHysteresisTimerRef.current = null;
                    }, 80); // Reduced hysteresis for more responsive pinch
                  }
                }}
                onLayout={(event: any) => {
                  const { width, height } = event.nativeEvent.layout;
                  if (__DEV__) {
                    console.log("PDF container size:", { width, height });
                  }
                }}
              >
                {/* ViewShot component to enable JPEG export */}
                <ViewShot
                  ref={viewShotRef}
                  options={{
                    format: "jpg",
                    quality: 0.9,
                    result: "tmpfile",
                  }}
                  style={{ flex: 1 }}
                >
                  {/* Opacity is controlled by RN Animated to avoid mixing with Reanimated style */}
                  <Animated.View style={{ flex: 1, opacity: pageOpacity }}>
                    <AnimatedRe.View
                      ref={transformContainerRef}
                      onLayout={(event: any) => {
                      const { x, y, width, height } = event.nativeEvent.layout;
                      if (width && height) {
                        setContainerSize({ width, height });
                        setPdfViewerBounds({ width, height });
                        setPdfContainerLayout({ x, y, width, height });
                        // Keep shared container dims for clamping in worklets
                        svContainerW.value = width;
                        svContainerH.value = height;
                        // Also capture absolute window position for precise touch mapping
                        try {
                          requestAnimationFrame(() => {
                            (transformContainerRef.current as any)?.measureInWindow?.((absX: number, absY: number, w: number, h: number) => {
                              containerWindowOffsetRef.current = { left: absX, top: absY, width: w, height: h };
                            });
                          });
                        } catch {}
                      }
                      }}
                      // Apply Reanimated transform style
                      style={[{ flex: 1 }, pdfAnimatedStyle]}
                    >
                    {(() => {
                      const { contentHeight, displayH, pageSpacing } = getLayoutMetrics();
                      // In safe mode, mount a single-page PDF surface to avoid OOM
                      if (effectiveSafeMode) {
                        const pageToShow = currentPageRef.current || displayCurrentPage || 1;
                        return (
                          <View style={{ flex: 1, height: displayH }}>
                            {Platform.OS !== "web" && Pdf ? (
                              <>
                              {/* @ts-ignore - library typing mismatch */}
                              <PdfAny
                                ref={pdfRef}
                                source={currentSource}
                                style={{ width: "100%", height: displayH }}
                                page={pageToShow}
                                onLoadComplete={onPdfLoadComplete}
                                onLoadProgress={onPdfLoadProgress}
                                onError={onPdfError}
                                enablePaging={false}
                                horizontal={false}
                                fitPolicy={2}
                                spacing={10}
                                enableDoubleTapZoom={false}
                                enableRTL={false}
                                enableAnnotationRendering={true}
                                enableAntialiasing={true}
                                singlePage={true}
                                enableSwipe={false}
                               />
                              </>
                            ) : (
                              <View style={styles.webPdfPlaceholder}>
                                <MaterialIcons name="description" size={64} color="#9CA3AF" />
                                <Text style={styles.webPdfText}>PDF viewing not supported on web</Text>
                                <Text style={styles.webPdfSubtext}>Please use the mobile app to view and annotate PDFs</Text>
                              </View>
                            )}
                            {/* Annotation Layer - current page only */}
                            <View
                              style={{ position: "absolute", left: 0, top: 0, right: 0, height: displayH, zIndex: 10 }}
                              pointerEvents="box-none"
                            >
                              {renderAnnotations()}
                            </View>
                            {/* Gesture capture overlay - only active when NOT drawing */}
                            {(!isEditMode || selectedTool === null) && (
                              <GestureDetector gesture={combinedGesture}>
                                <View
                                  pointerEvents="auto"
                                  style={{ position: "absolute", left: 0, top: 0, right: 0, height: displayH, zIndex: 9998, backgroundColor: "transparent" }}
                                  collapsable={false}
                                />
                              </GestureDetector>
                            )}
                            {/* Drawing overlay - only active when drawing tool selected */}
                            {isEditMode && selectedTool !== null && (
                              <View
                                pointerEvents="auto"
                                style={{ position: "absolute", left: 0, top: 0, right: 0, height: displayH, zIndex: 9999, backgroundColor: "transparent" }}
                                collapsable={false}
                                {...panResponder.panHandlers}
                              />
                            )}
                          </View>
                        );
                      }

                      // Normal mode: vertical ScrollView with stacked pages
                      return (
                        <ScrollView
                          ref={pdfScrollRef as any}
                          style={{ flex: 1 }}
                          contentContainerStyle={{ height: contentHeight }}
                          scrollEventThrottle={16}
                          showsVerticalScrollIndicator={false}
                          horizontal={false}
                          scrollEnabled={
                            !isEditMode
                              ? ((!shouldCaptureGestures && !isPinching) ? true : false)
                              : ((!shouldCaptureGestures && !isPinching && (selectedTool === null || selectedTool === 'selection')) ? true : false)
                          }
                          onScroll={(e) => {
                            const y = e.nativeEvent.contentOffset.y;
                            if (pdfScrollOffset.y !== y) setPdfScrollOffset({ x: 0, y });
                            const denom = displayH + pageSpacing;
                            const approx = Math.max(1, Math.min((totalPagesRef.current || totalPages || 1), Math.floor((y + displayH * 0.5) / denom) + 1));
                            if (approx !== currentPageRef.current) {
                              currentPageRef.current = approx;
                              if (displayCurrentPage !== approx) setDisplayCurrentPage(approx);
                            }
                          }}
                        >
                          <View style={{ height: contentHeight }}>
                            {Platform.OS !== "web" && Pdf ? (
                              <>
                              {/* @ts-ignore - library typing mismatch */}
                              <PdfAny
                                ref={pdfRef}
                                source={currentSource}
                                style={{ width: "100%", height: contentHeight }}
                                page={currentPage}
                                onLoadComplete={onPdfLoadComplete}
                                onLoadProgress={onPdfLoadProgress}
                                onError={onPdfError}
                                enablePaging={false}
                                horizontal={false}
                                fitPolicy={2}
                                spacing={10}
                                enableDoubleTapZoom={false}
                                enableRTL={false}
                                enableAnnotationRendering={true}
                                enableAntialiasing={true}
                                singlePage={false}
                                enableSwipe={false}
                                onPageChanged={(page: number, pageCount: number) => {
                                  currentPageRef.current = page;
                                  if (pageCount !== totalPagesRef.current) {
                                    totalPagesRef.current = pageCount;
                                    if (displayTotalPages !== pageCount) setDisplayTotalPages(pageCount);
                                  }
                                }}
                              />
                              </>
                            ) : (
                              <View style={styles.webPdfPlaceholder}>
                                <MaterialIcons name="description" size={64} color="#9CA3AF" />
                                <Text style={styles.webPdfText}>PDF viewing not supported on web</Text>
                                <Text style={styles.webPdfSubtext}>Please use the mobile app to view and annotate PDFs</Text>
                              </View>
                            )}
                            <View
                              style={{ position: "absolute", left: 0, top: 0, right: 0, height: contentHeight, zIndex: 10 }}
                              pointerEvents="box-none"
                            >
                              {renderAnnotations()}
                            </View>
                            {/* Gesture capture overlay - only active when NOT drawing */}
                            {(!isEditMode || selectedTool === null) && (
                              <GestureDetector gesture={combinedGesture}>
                                <View
                                  pointerEvents="auto"
                                  style={{ position: "absolute", left: 0, top: 0, right: 0, height: contentHeight, zIndex: 9998, backgroundColor: "transparent" }}
                                  collapsable={false}
                                />
                              </GestureDetector>
                            )}
                            {/* Drawing overlay - only active when drawing tool selected */}
                            {isEditMode && selectedTool !== null && (
                              <View
                                pointerEvents="auto"
                                style={{ position: "absolute", left: 0, top: 0, right: 0, height: contentHeight, zIndex: 9999, backgroundColor: "transparent" }}
                                collapsable={false}
                                {...panResponder.panHandlers}
                              />
                            )}
                          </View>
                        </ScrollView>
                      );
                    })()}
                    </AnimatedRe.View>
                  </Animated.View>
                </ViewShot>
              </AnimatedRe.View>
            </View>

            {/* Page indicator removed in favor of floating buttons */}
          </View>
        )}
  </View>

      {/* Focus mode exit controls */}
      {uiHidden && (
        <>
          <TouchableOpacity
            style={styles.focusExitButton}
            onPress={() => setUiHidden(false)}
            activeOpacity={0.8}
          >
            <MaterialIcons name="fullscreen-exit" size={20} color="#fff" />
          </TouchableOpacity>
          <View style={styles.focusHint} pointerEvents="none">
            <Text style={styles.focusHintText}>
              Pinch to zoom • Drag to pan
            </Text>
          </View>
        </>
      )}

      {/* Floating zoom controls removed (zoom is in toolbar) */}

      {/* Floating page navigation controls: simple prev/input/next */}
      {!uiHidden && displayTotalPages > 0 && (
        <View style={styles.floatingPageContainer} pointerEvents="box-none">
          <Animated.View
            style={[
              styles.floatingPageInner,
              { opacity: fadeAnim, paddingHorizontal: 12, paddingVertical: 10 },
            ]}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <TouchableOpacity
                style={styles.floatingPageButton}
                activeOpacity={0.7}
                onPress={() => {
                  const target = Math.max(1, (currentPageRef.current || 1) - 1);
                  currentPageRef.current = target;
                  setDisplayCurrentPage(target);
                  if (!effectiveSafeMode) {
                    const { displayH, pageSpacing } = getLayoutMetrics();
                    const y = Math.max(0, (target - 1) * (displayH + pageSpacing));
                    (pdfScrollRef.current as any)?.scrollTo?.({ y, animated: true });
                  }
                }}
                disabled={(currentPageRef.current || 1) <= 1}
              >
                <MaterialIcons
                  name="chevron-left"
                  size={20}
                  color={(currentPageRef.current || 1) <= 1 ? "#9CA3AF" : "#374151"}
                />
              </TouchableOpacity>

              <Text style={styles.floatingPageText}>Page</Text>
              <TextInput
                style={{
                  width: 56,
                  height: 32,
                  borderRadius: 6,
                  backgroundColor: "#F3F4F6",
                  paddingHorizontal: 8,
                  color: "#111827",
                  textAlign: "center",
                }}
                keyboardType="numeric"
                defaultValue={String(displayCurrentPage)}
                onSubmitEditing={(e) => {
                  const raw = e.nativeEvent.text || "";
                  const num = Math.max(
                    1,
                    Math.min(parseInt(raw, 10) || 1, displayTotalPages || 1)
                  );
                  if (num !== currentPageRef.current) {
                    currentPageRef.current = num;
                    setDisplayCurrentPage(num);
                    if (!effectiveSafeMode) {
                      const { displayH, pageSpacing } = getLayoutMetrics();
                      const y = Math.max(0, (num - 1) * (displayH + pageSpacing));
                      (pdfScrollRef.current as any)?.scrollTo?.({ y, animated: true });
                    }
                  }
                }}
                returnKeyType="done"
              />
              <Text style={styles.floatingPageText}>/ {displayTotalPages}</Text>

              <TouchableOpacity
                style={styles.floatingPageButton}
                activeOpacity={0.7}
                onPress={() => {
                  const current = currentPageRef.current || 1;
                  const max = displayTotalPages || 1;
                  const target = Math.min(max, current + 1);
                  currentPageRef.current = target;
                  setDisplayCurrentPage(target);
                  if (!effectiveSafeMode) {
                    const { displayH, pageSpacing } = getLayoutMetrics();
                    const y = Math.max(0, (target - 1) * (displayH + pageSpacing));
                    (pdfScrollRef.current as any)?.scrollTo?.({ y, animated: true });
                  }
                }}
                disabled={(displayTotalPages || 1) <= (currentPageRef.current || 1)}
              >
                <MaterialIcons
                  name="chevron-right"
                  size={20}
                  color={(displayTotalPages || 1) <= (currentPageRef.current || 1) ? "#9CA3AF" : "#374151"}
                />
              </TouchableOpacity>
            </View>
          </Animated.View>
        </View>
      )}

      {/* Page HUD during scrolling/zooming */}
      {/* Page HUD removed */}

      {/* (single) Folder Selection Modal is rendered further down with DrawingEditor styles */}

      {/* Note/Text Modal */}
      <Modal visible={showNoteModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <Animated.View style={[styles.noteModal, { opacity: fadeAnim }]}>
            <View style={styles.modalHeader}>
              <MaterialIcons
                name={selectedTool === "text" ? "text-fields" : "note-add"}
                size={24}
                color="#667eea"
              />
              <Text style={styles.modalTitle}>
                {selectedTool === "text" ? "Add Text" : "Add Note"}
              </Text>
            </View>

            <View style={styles.modalContent}>
              <TextInput
                style={styles.noteInput}
                placeholder={
                  selectedTool === "text"
                    ? "Enter your text here..."
                    : "Write your note here..."
                }
                placeholderTextColor="#999"
                value={noteText}
                onChangeText={setNoteText}
                multiline
                autoFocus
              />

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={[styles.modalActionButton, styles.cancelButton]}
                  onPress={() => {
                    setShowNoteModal(false);
                    setNoteText("");
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.modalActionButton}
                  onPress={addNoteAnnotation}
                  activeOpacity={0.8}
                >
                  <Text style={styles.modalActionText}>
                    {selectedTool === "text" ? "Add Text" : "Add Note"}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </Animated.View>
        </View>
      </Modal>

      {/* Folder Selection Modal (replaces Export Modal) */}
      <Modal
        visible={showFolderModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowFolderModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.folderModalContent}>
            <View style={styles.folderModalHeaderRow}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
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
                onChangeText={(v) => setFolderFilter(v)}
                value={folderFilter}
                returnKeyType="search"
              />
            </View>

            <ScrollView
              style={styles.folderListScroll}
              contentContainerStyle={styles.folderListContent}
            >
              <TouchableOpacity
                style={[
                  styles.folderCard,
                  !selectedFolderId && styles.selectedFolderCard,
                ]}
                onPress={() => handleFolderSelect(null)}
                activeOpacity={0.8}
              >
                <View
                  style={[
                    styles.folderCardIcon,
                    { backgroundColor: "#64748B" },
                  ]}
                >
                  <MaterialIcons name="notes" size={20} color="#fff" />
                </View>
                <View style={styles.folderCardTextWrap}>
                  <Text style={styles.folderCardTitle}>Unorganized Notes</Text>
                  <Text style={styles.folderCardSubtitle}>No folder</Text>
                </View>
                {!selectedFolderId && (
                  <MaterialIcons name="check-circle" size={20} color="#8B5CF6" />
                )}
              </TouchableOpacity>

              <View style={styles.folderDividerRow}>
                <View style={styles.folderDividerLine} />
                <Text style={styles.folderDividerText}>All folders</Text>
                <View style={styles.folderDividerLine} />
              </View>

              {isLoadingFolders ? (
                <View style={{ paddingVertical: 16, alignItems: "center" }}>
                  <ActivityIndicator size="small" color="#8B5CF6" />
                  <Text style={{ color: "#6B7280", marginTop: 8 }}>Loading folders...</Text>
                </View>
              ) : (
                (folders || [])
                  .filter((f: any) =>
                    folderFilter
                      ? f.name?.toLowerCase?.().includes(folderFilter.toLowerCase())
                      : true
                  )
                  .map((folder: any) => {
                    const selected = selectedFolderId?.toString() === folder.id?.toString();
                    return (
                      <TouchableOpacity
                        key={folder.id}
                        style={[styles.folderCard, selected && styles.selectedFolderCard]}
                        onPress={() => handleFolderSelect(folder)}
                        activeOpacity={0.8}
                      >
                        <View
                          style={[
                            styles.folderCardIcon,
                            { backgroundColor: "#8B5CF6" },
                          ]}
                        >
                          <MaterialIcons name="folder" size={20} color="#fff" />
                        </View>
                        <View style={styles.folderCardTextWrap}>
                          <Text style={styles.folderCardTitle}>{folder.name}</Text>
                          {!!folder.note_count && (
                            <Text style={styles.folderCardSubtitle}>
                              {folder.note_count} {folder.note_count === 1 ? "item" : "items"}
                            </Text>
                          )}
                        </View>
                        {selected && (
                          <MaterialIcons name="check-circle" size={20} color="#8B5CF6" />
                        )}
                      </TouchableOpacity>
                    );
                  })
              )}

            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* More Options Modal */}
      <Modal
        visible={showMoreMenu}
        transparent
        animationType="fade"
        onRequestClose={() => setShowMoreMenu(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowMoreMenu(false)}
        >
          <View style={styles.moreMenuContainer}>
            {/* Quick actions moved from header */}
            <TouchableOpacity
              style={styles.moreMenuItem}
              onPress={() => {
                setShowMoreMenu(false);
                setUiHidden(true);
              }}
              activeOpacity={0.8}
            >
              <MaterialIcons name="fullscreen" size={20} color="#334155" />
              <Text style={styles.moreMenuText}>Enter Focus Mode</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.moreMenuItem}
              onPress={() => {
                setShowMoreMenu(false);
                setSaveMode((prev) =>
                  prev === "direct" ? "overlay" : "direct"
                );
              }}
              activeOpacity={0.8}
            >
              <MaterialIcons
                name={saveMode === "direct" ? "layers" : "picture-as-pdf"}
                size={20}
                color={saveMode === "direct" ? "#8B5CF6" : "#22C55E"}
              />
              <Text
                style={[
                  styles.moreMenuText,
                  { color: saveMode === "direct" ? "#8B5CF6" : "#22C55E" },
                ]}
              >
                Switch to {saveMode === "direct" ? "Overlay" : "Direct PDF"}{" "}
                Mode
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.moreMenuItem}
              onPress={() => {
                setShowMoreMenu(false);
                setShowFolderModal(true);
              }}
              activeOpacity={0.8}
            >
              <MaterialIcons name="folder" size={20} color="#667eea" />
              <Text style={[styles.moreMenuText, { color: "#667eea" }]}>
                Select Folder
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.moreMenuItem,
                annotations.length > 0 && {
                  backgroundColor: "rgba(34, 197, 94, 0.1)",
                },
              ]}
              onPress={() => {
                setShowMoreMenu(false);
                exportAnnotatedPDF();
              }}
              disabled={annotations.length === 0}
              activeOpacity={0.8}
            >
              <MaterialIcons
                name="picture-as-pdf"
                size={20}
                color={annotations.length > 0 ? "#22C55E" : "#94A3B8"}
              />
              <Text
                style={[
                  styles.moreMenuText,
                  {
                    color: annotations.length > 0 ? "#22C55E" : "#94A3B8",
                    fontWeight: annotations.length > 0 ? "600" : "400",
                  },
                ]}
              >
                Export PDF{" "}
                {annotations.length > 0 ? `(${annotations.length})` : ""}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.moreMenuItem}
              onPress={() => {
                setShowMoreMenu(false);
                exportToJPEG();
              }}
              activeOpacity={0.8}
            >
              <MaterialIcons name="image" size={20} color="#F59E0B" />
              <Text style={[styles.moreMenuText, { color: "#F59E0B" }]}>
                Export PDF as JPEG
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.moreMenuItem}
              onPress={() => {
                setShowMoreMenu(false);
                handleShareAnnotatedPdf();
              }}
              activeOpacity={0.8}
            >
              <MaterialIcons name="share" size={20} color="#334155" />
              <Text style={styles.moreMenuText}>Share</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.moreMenuItem, { borderBottomWidth: 0 }]}
              onPress={() => {
                setShowMoreMenu(false);
                handleViewInfo();
              }}
              activeOpacity={0.8}
            >
              <MaterialIcons name="info-outline" size={20} color="#334155" />
              <Text style={styles.moreMenuText}>Document Info</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* AI Assistant Modal */}
      <Modal
        visible={showAIModal}
        transparent={true}
        animationType="none"
        onRequestClose={() => {
          // Start slide-down animation
          Animated.timing(aiModalAnimation, {
            toValue: 0,
            duration: 250,
            useNativeDriver: true,
          }).start(() => setShowAIModal(false));
        }}
      >
        <TouchableOpacity
          style={styles.aiModalOverlay}
          activeOpacity={1}
          onPress={() => {
            // Start slide-down animation
            Animated.timing(aiModalAnimation, {
              toValue: 0,
              duration: 250,
              useNativeDriver: true,
            }).start(() => setShowAIModal(false));
          }}
        >
          <Animated.View
            style={[
              styles.aiModalContainer,
              {
                transform: [
                  {
                    translateY: aiModalAnimation.interpolate({
                      inputRange: [0, 1],
                      outputRange: [600, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <View style={styles.aiModalContent}>
              <View style={styles.aiModalHandle} />
              <View style={styles.aiModalHeader}>
                <View style={styles.aiModalIconContainer}>
                  <MaterialCommunityIcons
                    name="robot"
                    size={24}
                    color="#8B5CF6"
                  />
                </View>
                <Text style={styles.aiModalTitle}>AI Assistant</Text>
                <TouchableOpacity
                  style={styles.aiModalCloseButton}
                  onPress={() => {
                    // Start slide-down animation
                    Animated.timing(aiModalAnimation, {
                      toValue: 0,
                      duration: 250,
                      useNativeDriver: true,
                    }).start(() => setShowAIModal(false));
                  }}
                >
                  <MaterialIcons name="close" size={24} color="#6B7280" />
                </TouchableOpacity>
              </View>

              <ScrollView
                ref={chatScrollViewRef}
                style={styles.aiModalBody}
                contentContainerStyle={{ flexGrow: 1 }}
                onContentSizeChange={() => {
                  // Scroll to bottom when content size changes (new message added)
                  if (chatMessages.length > 1) {
                    chatScrollViewRef.current?.scrollToEnd({ animated: true });
                  }
                }}
              >
                <View style={styles.aiChatContainer}>
                  {chatMessages.map((message, index) =>
                    message.type === "ai" ? (
                      <View key={index} style={styles.aiMessageBubble}>
                        <Text style={styles.aiMessageText}>{message.text}</Text>
                      </View>
                    ) : (
                      <View key={index} style={styles.userMessageBubble}>
                        <Text style={styles.userMessageText}>
                          {message.text}
                        </Text>
                      </View>
                    )
                  )}
                </View>
              </ScrollView>

              <View style={styles.aiInputContainer}>
                <TextInput
                  style={styles.aiInput}
                  placeholder="Ask me anything about this document..."
                  placeholderTextColor="#9CA3AF"
                  value={aiMessage}
                  onChangeText={setAiMessage}
                  multiline
                />
                <TouchableOpacity
                  style={styles.aiSendButton}
                  onPress={async () => {
                    if (aiMessage.trim() === "") return;

                    // Add user message to chat
                    const userMessage = aiMessage.trim();
                    setChatMessages((prev) => [
                      ...prev,
                      { type: "user", text: userMessage },
                    ]);

                    // Clear input after sending
                    setAiMessage("");

                    // Add a temporary typing placeholder so UI shows the assistant is working
                    const placeholderId = `ai-typing-${Date.now()}`;
                    setChatMessages((prev) => [
                      ...prev,
                      { type: "ai", text: "Thinking...", id: placeholderId },
                    ]);

                    try {
                      // If this PDF has a linked docId (RAG document), include it for focused retrieval
                      const docIds = docId ? [String(docId)] : [];
                      const res = await queryOllamaRAG(userMessage, docIds, 5);

                      const answer = res?.answer || res?.response || "No answer generated.";

                      // Replace the typing placeholder with the returned answer
                      setChatMessages((prev) =>
                        prev.map((m: any) =>
                          m.id === placeholderId ? { type: "ai", text: answer } : m
                        )
                      );
                    } catch (err: any) {
                      // Build a helpful message from the error object (service may return JSON with detail/body)
                      let display = 'AI assistant is unavailable. Please try again later.';
                      try {
                        if (err?.body?.detail) {
                          display = String(err.body.detail);
                        } else if (err?.body) {
                          display = JSON.stringify(err.body);
                        } else if (err?.message) {
                          display = String(err.message);
                        }
                      } catch (e) {}

                      // In development, include status code for debugging
                      if (__DEV__ && err?.status) {
                        display = `${display} (status: ${err.status})`;
                      }

                      // Replace the typing placeholder with the error message
                      setChatMessages((prev) =>
                        prev.map((m: any) =>
                          m.id === placeholderId
                            ? { type: "ai", text: display }
                            : m
                        )
                      );
                      console.warn("Ollama RAG query failed:", err);
                    } finally {
                      // Ensure chat scrolls to bottom (onContentSizeChange also handles this)
                      try {
                        chatScrollViewRef.current?.scrollToEnd({ animated: true });
                      } catch {}
                    }
                  }}
                >
                  <Ionicons name="send" size={20} color="#FFFFFF" />
                </TouchableOpacity>
              </View>
            </View>
          </Animated.View>
        </TouchableOpacity>
      </Modal>

      {/* Ask Rina Popup */}
      {showAskRinaPopup && !uiHidden && (
        <Animated.View
          style={[
            styles.askRinaPopup,
            selectionRect
              ? {
                  top: selectionRect.y - 60,
                  left: selectionRect.x + selectionRect.width / 2 - 75,
                }
              : {
                  top: "50%",
                  left: "50%",
                  transform: [{ translateX: -75 }, { translateY: -30 }],
                },
          ]}
        >
          <View style={styles.askRinaPopupContent}>
            <TouchableOpacity
              style={styles.askRinaButton}
              onPress={handleAskRina}
              activeOpacity={0.8}
            >
              <MaterialIcons name="psychology" size={18} color="#8B5CF6" />
              <Text style={styles.askRinaButtonText}>Ask Rina</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.customQueryButton}
              onPress={handleCustomRinaQuery}
              activeOpacity={0.8}
            >
              <MaterialIcons name="edit" size={16} color="#6B7280" />
            </TouchableOpacity>
          </View>
          <View style={styles.askRinaPopupArrow} />
        </Animated.View>
      )}

      {/* Toolbox Modal */}
      <Modal
        visible={showToolbox}
        transparent
        animationType="slide"
        onRequestClose={() => setShowToolbox(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.toolboxModal}>
            <View style={styles.toolboxHeader}>
              <Text style={styles.toolboxTitle}>Tools</Text>
              <TouchableOpacity onPress={() => setShowToolbox(false)}>
                <MaterialIcons name="close" size={22} color="#6B7280" />
              </TouchableOpacity>
            </View>
            <View style={styles.toolboxGrid}>
              {(
                [
                  { key: "selection", icon: "select-all", label: "Select" },
                  { key: "pen", icon: "edit", label: "Pen" },
                  { key: "brush", icon: "brush", label: "Brush" },
                  { key: "pencil", icon: "edit", label: "Pencil" },
                  { key: "highlight", icon: "gesture", label: "Highlight" },
                  { key: "note", icon: "note-add", label: "Note" },
                  { key: "text", icon: "text-fields", label: "Text" },
                  { key: "eraser", icon: "auto-fix-normal", label: "Eraser" },
                ] as const
              ).map((item) => (
                <TouchableOpacity
                  key={item.key}
                  style={[
                    styles.toolboxItem,
                    selectedTool === item.key && styles.toolboxItemActive,
                  ]}
                  onPress={() => {
                    // @ts-ignore
                    setSelectedTool(
                      selectedTool === item.key ? null : item.key
                    );
                    setShowToolbox(false);
                  }}
                >
                  <MaterialIcons
                    name={item.icon as any}
                    size={22}
                    color={selectedTool === item.key ? "#4F46E5" : "#64748b"}
                  />
                  <Text
                    style={[
                      styles.toolboxItemLabel,
                      selectedTool === item.key && { color: "#4F46E5" },
                    ]}
                  >
                    {item.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.toolboxFooter}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 6 }}
              >
                {ANNOTATION_COLORS.map((c) => (
                  <TouchableOpacity
                    key={c}
                    style={[
                      styles.colorButton,
                      { backgroundColor: c },
                      selectedColor === c && styles.colorButtonActive,
                    ]}
                    onPress={() => setSelectedColor(c)}
                  />
                ))}
                <View style={styles.toolbarDivider} />
                {[1, 3, 6, 10].map((w) => (
                  <TouchableOpacity
                    key={`w-${w}`}
                    style={[
                      styles.strokeButton,
                      strokeWidth === w && styles.strokeButtonActive,
                    ]}
                    onPress={() => setStrokeWidth(w)}
                  >
                    <View
                      style={[
                        styles.strokePreview,
                        {
                          width: Math.max(2, w + 1),
                          height: Math.max(2, w + 1),
                          backgroundColor: "#64748b",
                        },
                      ]}
                    />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </View>
        </View>
      </Modal>

      {/* Ask Rina Modal */}
      <Modal visible={showAskRinaModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.rinaModalContent}>
            <View style={styles.rinaModalHeader}>
              <MaterialIcons name="psychology" size={24} color="#8B5CF6" />
              <Text style={styles.rinaModalTitle}>Ask Rina</Text>
              <TouchableOpacity
                onPress={handleRinaModalClose}
                style={styles.rinaModalCloseButton}
              >
                <MaterialIcons name="close" size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <View style={styles.rinaModalContent}>
              <View style={styles.selectedTextContainer}>
                <Text style={styles.selectedTextLabel}>Selected Text:</Text>
                <Text style={styles.selectedTextDisplay}>{selectedText}</Text>
              </View>

              <View style={styles.queryContainer}>
                <Text style={styles.queryLabel}>Your Question:</Text>
                <TextInput
                  style={styles.queryInput}
                  placeholder="What would you like to know about this text?"
                  placeholderTextColor="#9CA3AF"
                  value={rinaQuery}
                  onChangeText={setRinaQuery}
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                />
                {isCheckingRag && (
                  <Text style={{ color: '#F59E0B', marginTop: 8 }}>
                    AI processing in background — RAG indexing in progress
                  </Text>
                )}
                {ragStatus === 'failed' && (
                  <Text style={{ color: '#EF4444', marginTop: 8 }}>
                    AI processing failed for this document. You can still ask, but results may be limited.
                  </Text>
                )}
              </View>

              <View style={styles.rinaModalActions}>
                <TouchableOpacity
                  style={styles.rinaModalCancelButton}
                  onPress={handleRinaModalClose}
                  activeOpacity={0.8}
                >
                  <Text style={styles.rinaModalCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.rinaModalSubmitButton,
                    (!rinaQuery.trim() || !selectedText.trim() || (!!docId && ragStatus !== 'completed')) &&
                      styles.rinaModalSubmitButtonDisabled,
                  ]}
                  onPress={() => {
                    // Navigate to RINA chatbot with the query and selected text
                    const fullQuery =
                      rinaQuery.trim() ||
                      `Explain this text: "${selectedText}"`;
                    console.log("Navigating to RINA with:", {
                      query: fullQuery,
                      selectedText,
                    });

                    // Store the context for RINA (you might want to pass this differently based on your chatbot implementation)
                    navigation.navigate("RINA", {
                      initialQuery: fullQuery,
                      contextText: selectedText,
                      source: "pdf_annotation",
                    } as any);

                    handleRinaModalClose();
                  }}
                  disabled={!rinaQuery.trim() || !selectedText.trim() || (!!docId && ragStatus !== 'completed')}
                  activeOpacity={0.8}
                >
                  <MaterialIcons
                    name="send"
                    size={18}
                    color={
                      !rinaQuery.trim() || !selectedText.trim()
                        ? "#9CA3AF"
                        : "#FFFFFF"
                    }
                  />
                  <Text
                    style={[
                      styles.rinaModalSubmitText,
                      (!rinaQuery.trim() || !selectedText.trim()) &&
                        styles.rinaModalSubmitTextDisabled,
                    ]}
                  >
                    Ask Rina
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* Text Extraction Modal for Selection Mode (fallback) */}
      <Modal
        visible={showTextExtractionModal}
        animationType="slide"
        transparent
      >
        <View style={styles.modalOverlay}>
          <View style={styles.textExtractionModal}>
            <View style={styles.textExtractionHeader}>
              <MaterialIcons name="text-fields" size={24} color="#8B5CF6" />
              <Text style={styles.textExtractionTitle}>
                Select Text for RINA
              </Text>
              <TouchableOpacity
                onPress={() => {
                  setShowTextExtractionModal(false);
                  setSelectedTool(null);
                }}
                style={styles.textExtractionCloseButton}
              >
                <MaterialIcons name="close" size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <View style={styles.textExtractionContent}>
              {isExtractingText ? (
                <View style={styles.extractingContainer}>
                  <ActivityIndicator size="large" color="#8B5CF6" />
                  <Text style={styles.extractingText}>
                    Preparing text selection...
                  </Text>
                </View>
              ) : (
                <>
                  <Text style={styles.extractionInstructions}>
                    📝 Copy and paste text from the PDF above, or type the
                    content you'd like RINA to help you with:
                  </Text>

                  <TextInput
                    style={styles.textExtractionInput}
                    placeholder="Type or paste the text from the PDF here..."
                    placeholderTextColor="#9CA3AF"
                    multiline
                    numberOfLines={8}
                    textAlignVertical="top"
                    value={extractedText}
                    onChangeText={setExtractedText}
                    autoFocus={true}
                  />

                  <View style={styles.textExtractionActions}>
                    <TouchableOpacity
                      style={styles.textExtractionCancelButton}
                      onPress={() => {
                        setShowTextExtractionModal(false);
                        setSelectedTool(null);
                      }}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.textExtractionCancelText}>
                        Cancel
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.textExtractionSelectButton,
                        !extractedText.trim() &&
                          styles.textExtractionSelectButtonDisabled,
                      ]}
                      onPress={() => {
                        if (extractedText.trim()) {
                          // Trigger the same flow as PDF selection
                          onTextSelectionChange({
                            text: extractedText.trim(),
                            pageNumber: currentPage,
                            bounds: { x: 0, y: 0, width: 0, height: 0 },
                          });
                          setShowTextExtractionModal(false);
                        }
                      }}
                      disabled={!extractedText.trim()}
                      activeOpacity={0.8}
                    >
                      <MaterialIcons
                        name="check"
                        size={18}
                        color={!extractedText.trim() ? "#9CA3AF" : "#FFFFFF"}
                      />
                      <Text
                        style={[
                          styles.textExtractionSelectText,
                          !extractedText.trim() &&
                            styles.textExtractionSelectTextDisabled,
                        ]}
                      >
                        Select This Text
                      </Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </View>
          </View>
        </View>
      </Modal>

      {/* WebView PDF Selector has been removed */}

      {/* Text Preview Modal for bbox extracted text */}
      <Modal visible={showTextPreviewModal} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.textExtractionModal}>
            <View style={styles.textExtractionHeader}>
              <MaterialIcons name="text-format" size={24} color="#8B5CF6" />
              <Text style={styles.textExtractionTitle}>Extracted Text</Text>
              <TouchableOpacity
                onPress={() => {
                  setShowTextPreviewModal(false);
                  setPreviewExtractedText("");
                }}
                style={styles.textExtractionCloseButton}
              >
                <MaterialIcons name="close" size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <View style={styles.textExtractionContent}>
              <Text style={styles.extractionInstructions}>
                Text extracted from page {currentPage}. You can edit the text
                below:
              </Text>

              <TextInput
                style={[styles.textExtractionInput, { height: 300 }]}
                value={previewExtractedText}
                onChangeText={setPreviewExtractedText}
                multiline
                textAlignVertical="top"
                placeholder="Extracted text will appear here..."
                placeholderTextColor="#9CA3AF"
              />

              <View style={styles.textExtractionActions}>
                <TouchableOpacity
                  style={styles.textExtractionCancelButton}
                  onPress={() => {
                    setShowTextPreviewModal(false);
                    setPreviewExtractedText("");
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={styles.textExtractionCancelText}>Close</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.textExtractionSelectButton}
                  onPress={() => {
                    // Close the preview modal
                    setShowTextPreviewModal(false);

                    // Set selected text and open Rina modal
                    setSelectedText(previewExtractedText);
                    setRinaQuery("Explain this text:");
                    setShowAskRinaModal(true);

                    // Clear preview text
                    setPreviewExtractedText("");
                  }}
                  activeOpacity={0.8}
                >
                  <MaterialIcons name="smart-toy" size={18} color="#FFFFFF" />
                  <Text style={styles.textExtractionSelectText}>Ask Rina</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* Unsaved Changes Modal */}
      <UnsavedChangesModal
        visible={showUnsavedModal}
        onSave={async () => {
          setIsSavingAnnotations(true);
          try {
            await syncAnnotationsNow();
            setShowUnsavedModal(false);
          } finally {
            setIsSavingAnnotations(false);
          }
        }}
        onCancel={() => {
          setShowUnsavedModal(false);
          // Execute pending navigation without saving
          if (pendingNavigationRef.current) {
            const navigate = pendingNavigationRef.current;
            pendingNavigationRef.current = null;
            navigate();
          }
        }}
        isSaving={isSavingAnnotations}
      />
    </GestureHandlerRootView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8fafc",
    position: "relative",
  },
  headerBackground: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: "100%", // adjust as needed for header height
    zIndex: 0,
  },
  gradientHeader: {
    flex: 1,
    paddingTop: Platform.OS === "ios" ? 40 : 14,
    paddingBottom: 8,
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
    overflow: "hidden",
  },

  mainContainer: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    marginTop: 110, // Slightly smaller header footprint
    shadowColor: "#1E293B",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 100,
    overflow: "hidden",
    zIndex: 1,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  backButton: {
    padding: 6,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
    marginHorizontal: 8,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#ffffff",
    textAlign: "center",
    textShadowColor: "rgba(0,0,0,0.3)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  headerSubtitle: {
    fontSize: 11,
    color: "rgba(255,255,255,0.8)",
    marginTop: 2,
    textAlign: "center",
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
  },

  exportText: {
    fontSize: 12,
    color: "#ffffff",
    marginLeft: 4,
    fontWeight: "600",
  },
  pdf: {
    flex: 1,
    width: "100%",
    height: "100%",
    backgroundColor: "#F3F4F6", // subtle viewer background
    margin: 0,
    padding: 0,
  },
  toolbarScrollContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    elevation: 9999,
    backgroundColor: "transparent",
    borderRadius: 0,
    marginBottom: 0,
    marginLeft: 0,
    marginRight: 0,
    marginTop: 0,
    paddingVertical: 0,
    borderWidth: 0,
    borderColor: "transparent",
  },
  toolbarContent: {
    flexDirection: "row",
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "flex-start",
    paddingHorizontal: 16,
    gap: 8,
  },
  toolButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#F3F4F6",
    justifyContent: "center",
    alignItems: "center",
    marginHorizontal: 4,
    borderWidth: 0,
    shadowColor: "#667eea",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  toolButtonActive: {
    backgroundColor: "#EDE9FE",
    shadowColor: "#667eea",
    shadowOpacity: 0.18,
    borderWidth: 2,
    borderColor: "#667eea",
    transform: [{ scale: 1.08 }],
  },
  toolbarDivider: {
    width: 1,
    height: 28,
    backgroundColor: "#E5E7EB",
    marginHorizontal: 10,
    borderRadius: 1,
  },
  colorSection: {
    alignItems: "center",
  },
  colorButtons: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  colorButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    marginHorizontal: 4,
    borderWidth: 2,
    borderColor: "#F3F4F6",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  colorButtonActive: {
    borderColor: "#667eea",
    borderWidth: 3,
    transform: [{ scale: 1.12 }],
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  noteModal: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    width: "92%",
    maxWidth: 420,
    maxHeight: "85%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 15,
    overflow: "hidden",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
    paddingVertical: 20,
    backgroundColor: "#F8FAFC",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1F2937",
    marginLeft: 8,
  },
  modalContent: {
    padding: 20,
  },
  noteInput: {
    borderWidth: 2,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    padding: 16,
    height: 120,
    textAlignVertical: "top",
    fontSize: 16,
    marginBottom: 20,
    backgroundColor: "#F9FAFB",
    color: "#1e293b",
    fontFamily: Platform.OS === "ios" ? "System" : "Roboto",
  },
  modalActions: {
    flexDirection: "row",
    gap: 12,
  },
  modalActionButton: {
    flex: 1,
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#667eea",
  },
  cancelButton: {
    backgroundColor: "#F8FAFC",
    borderWidth: 2,
    borderColor: "#E5E7EB",
  },
  modalActionText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 16,
  },
  modalCancelText: {
    color: "#6B7280",
    fontWeight: "600",
    fontSize: 16,
  },
  loadingContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.95)",
  },
  loadingText: {
    marginTop: 16,
    fontSize: 18,
    color: "#667eea",
    fontWeight: "500",
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
    backgroundColor: "#ffffff",
  },
  errorIconContainer: {
    marginBottom: 24,
    padding: 16,
    borderRadius: 50,
    backgroundColor: "#fef2f2",
  },
  errorTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: "#1e293b",
    marginBottom: 16,
    textAlign: "center",
  },
  errorMessage: {
    fontSize: 16,
    color: "#64748b",
    textAlign: "center",
    lineHeight: 24,
    marginBottom: 32,
    paddingHorizontal: 16,
  },
  retryButton: {
    borderRadius: 16,
    elevation: 4,
    shadowColor: "#667eea",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  retryButtonInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    paddingVertical: 16,
    gap: 8,
  },
  retryButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
  },

  // Compact metadata styles (from DrawingEditor)
  compactHeaderInfo: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: Platform.OS === "ios" ? 20 : 16,
    marginBottom: 16,
    marginHorizontal: 16,
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
  tagsScrollContent: {},
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

  // PDF scroll and zoom styles
  pdfScrollView: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  pdfScrollContent: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: "100%",
  },

  // Stroke width control styles
  strokeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#F3F4F6",
    justifyContent: "center",
    alignItems: "center",
    marginHorizontal: 3,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  strokeButtonActive: {
    backgroundColor: "#EDE9FE",
    borderColor: "#667eea",
    borderWidth: 2,
  },
  strokePreview: {
    borderRadius: 6,
    backgroundColor: "#64748b",
  },

  // Save button and more menu styles
  saveButton: {
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.2)",
    marginRight: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 36,
  },
  saveButtonActive: {
    backgroundColor: "#34C759",
  },
  moreButton: {
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 36,
  },
  moreMenuContainer: {
    position: "absolute",
    top: 100,
    right: 20,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    paddingVertical: 8,
    minWidth: 200,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 12,
    borderWidth: 1,
    borderColor: "rgba(148, 163, 184, 0.1)",
  },
  moreMenuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  moreMenuText: {
    fontSize: 15,
    fontFamily: "Inter-Medium",
    color: "#334155",
    marginLeft: 12,
    fontWeight: "500",
  },

  // Save mode button styles
  saveModeButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.15)",
    marginRight: 8,
    minWidth: 50,
    justifyContent: "center",
  },
  saveModeButtonDirect: {
    backgroundColor: "rgba(34, 197, 94, 0.2)",
  },
  saveModeButtonDisabled: {
    opacity: 0.5,
  },
  saveModeText: {
    fontSize: 10,
    fontWeight: "600",
    color: "#8B5CF6",
    marginLeft: 4,
  },
  saveModeTextDirect: {
    color: "#22C55E",
  },
  saveButtonSaving: {
    backgroundColor: "#F59E0B",
  },
  statusIndicator: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
  },
  statusText: {
    fontSize: 10,
    fontWeight: "500",
    marginLeft: 4,
    color: "#fff",
  },
  webPdfPlaceholder: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    padding: 40,
  },
  webPdfText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#4B5563",
    marginTop: 16,
    textAlign: "center",
  },
  webPdfSubtext: {
    fontSize: 14,
    color: "#9CA3AF",
    marginTop: 8,
    textAlign: "center",
    lineHeight: 20,
  },

  // PDF Canvas Container styles
  pdfCanvasContainer: {
    flex: 1,
    backgroundColor: "#F3F4F6", // subtle background behind PDF and annotations
    overflow: "hidden",
    width: "100%",
    height: "100%",
  },
  // Floating zoom controls - Material Design 3 styled
  floatingZoomContainer: {
    position: "absolute",
    right: 20,
    bottom: 40, // Moved lower for better thumb reach
    zIndex: 50,
    elevation: 50,
    alignItems: "center",
  },
  floatingZoomInner: {
    backgroundColor: "rgba(255, 255, 255, 0.95)",
    borderRadius: 28,
    paddingVertical: 8,
    paddingHorizontal: 4,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
  },
  floatingZoomButton: {
    width: 50,
    height: 50,
    borderRadius: 26,
    backgroundColor: "transparent",
    justifyContent: "center",
    alignItems: "center",
    marginVertical: 2,
  },
  floatingZoomButtonMiddle: {
    marginVertical: 4,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "rgba(0, 0, 0, 0.08)",
  },
  floatingPageContainer: {
    position: "absolute",
    alignSelf: "center",
    bottom: 14, // Slightly closer to bottom
    zIndex: 50,
    elevation: 50,
    alignItems: "center",
  },
  floatingPageInner: {
    flexDirection: "row",
    backgroundColor: "rgba(255, 255, 255, 0.85)", // More transparent
    borderRadius: 28,
    paddingVertical: 6, // Slightly smaller
    paddingHorizontal: 10, // Slightly smaller
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 }, // Reduced shadow
    shadowOpacity: 0.1, // Less pronounced shadow
    shadowRadius: 16,
    elevation: 8,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
  },
  floatingPageButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "transparent",
    justifyContent: "center",
    alignItems: "center",
    // Better visual feedback with subtle highlight
    borderWidth: 0.5,
    borderColor: "rgba(0,0,0,0.04)",
    overflow: "hidden",
  },
  floatingPageIndicator: {
    paddingHorizontal: 8,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: "rgba(0, 0, 0, 0.08)",
    justifyContent: "center",
    alignItems: "center",
    height: 36,
  },
  floatingPageText: {
    fontSize: 13, // Slightly smaller font
    fontWeight: "600", // Less bold
    color: "#374151",
  },
  floatingNavContainer: {
    position: "absolute",
    left: 20,
    top: 0,
    bottom: 0,
    zIndex: 50,
    elevation: 50,
    justifyContent: "center",
    alignItems: "center",
  },
  pdfScrollViewContent: {
    flexGrow: 1,
    justifyContent: "flex-start",
    alignItems: "center",
    // No minHeight - we'll use exact PDF dimensions
    paddingVertical: 0, // Remove padding to eliminate extra space
  },
  pdfTransformContainer: {
    flex: 1,
    backgroundColor: "#F3F4F6", // keep transform container matching viewer background
    width: "100%",
    height: "100%",
  },
  focusExitButton: {
    position: "absolute",
    right: 16,
    top: 24,
    zIndex: 100,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.4)",
    alignItems: "center",
    justifyContent: "center",
  },
  focusHint: {
    position: "absolute",
    bottom: 10,
    alignSelf: "center",
    backgroundColor: "rgba(0,0,0,0.35)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  focusHintText: {
    color: "#fff",
    fontSize: 12,
  },

  // Export Modal Styles
  exportModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  exportModalContent: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 24,
    width: screenWidth - 48,
    maxWidth: 400,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 20,
  },
  exportModalTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#1F2937",
    marginBottom: 8,
    textAlign: "center",
  },
  exportModalSubtitle: {
    fontSize: 16,
    color: "#6B7280",
    marginBottom: 24,
    textAlign: "center",
    lineHeight: 22,
  },
  exportModalButtons: {
    width: "100%",
    gap: 12,
  },
  exportFormatButton: {
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 24,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  exportFormatButtonGradient: {
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 24,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    width: "100%",
  },
  exportFormatButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
    marginLeft: 8,
  },
  exportFormatButtonSubtext: {
    color: "rgba(255, 255, 255, 0.8)",
    fontSize: 12,
    fontWeight: "400",
    marginLeft: 8,
  },
  exportActionButtons: {
    width: "100%",
    marginTop: 12,
  },
  exportCancelButton: {
    backgroundColor: "#F3F4F6",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  exportCancelButtonText: {
    color: "#374151",
    fontSize: 16,
    fontWeight: "500",
  },
  exportButton: {
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 24,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  exportButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
    marginLeft: 8,
  },
  exportCloseButton: {
    backgroundColor: "#F3F4F6",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 24,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  exportCloseButtonText: {
    color: "#374151",
    fontSize: 16,
    fontWeight: "500",
  },
  // Folder modal styles (copied from DrawingEditor)
  folderModalContent: {
    width: "92%",
    maxHeight: "78%",
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 12,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 12,
  },
  folderModalHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
    marginBottom: 8,
  },
  folderModalTitle: {
    marginLeft: 10,
    fontSize: 16,
    color: "#111827",
    fontWeight: "600",
  },
  folderSearchRow: {
    paddingVertical: 8,
  },
  folderSearchInput: {
    backgroundColor: "#F3F4F6",
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    color: "#111827",
    fontSize: 14,
  },
  folderListScroll: {
    marginTop: 6,
  },
  folderListContent: {
    paddingBottom: 18,
  },
  folderCard: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    marginBottom: 8,
  },
  selectedFolderCard: {
    backgroundColor: "#F8FAFC",
  },
  folderCardIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  folderCardTextWrap: {
    flex: 1,
  },
  folderCardTitle: {
    fontSize: 15,
    color: "#111827",
    fontWeight: "600",
  },
  folderCardSubtitle: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 2,
  },
  folderDividerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 10,
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

  // Debug page indicator styles
  debugPageIndicator: {
    position: "absolute",
    top: 20,
    right: 20,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: "center",
    zIndex: 1000,
  },
  debugPageText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 4,
  },
  debugPageButtons: {
    flexDirection: "row",
    gap: 8,
  },
  debugPageButton: {
    backgroundColor: "#667eea",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  debugPageButtonText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "bold",
  },

  // Ask Rina popup styles
  askRinaPopup: {
    position: "absolute",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
    borderWidth: 1,
    borderColor: "rgba(139, 92, 246, 0.2)",
    zIndex: 1000,
  },
  askRinaPopupContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  askRinaButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(139, 92, 246, 0.1)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 6,
  },
  askRinaButtonText: {
    color: "#8B5CF6",
    fontSize: 14,
    fontWeight: "600",
  },
  customQueryButton: {
    padding: 6,
    borderRadius: 6,
    backgroundColor: "#F3F4F6",
  },
  askRinaPopupArrow: {
    position: "absolute",
    bottom: -8,
    left: "50%",
    marginLeft: -8,
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderTopWidth: 8,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderTopColor: "#FFFFFF",
  },

  // Ask Rina modal styles
  rinaModalContent: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    width: "92%",
    maxWidth: 420,
    maxHeight: "80%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 15,
    overflow: "hidden",
  },
  rinaModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 20,
    backgroundColor: "rgba(139, 92, 246, 0.05)",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(139, 92, 246, 0.1)",
  },
  rinaModalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#8B5CF6",
    marginLeft: 8,
    flex: 1,
  },
  rinaModalCloseButton: {
    padding: 4,
  },
  selectedTextContainer: {
    marginBottom: 20,
  },
  selectedTextLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 8,
  },
  selectedTextDisplay: {
    backgroundColor: "#F9FAFB",
    padding: 12,
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: "#8B5CF6",
    fontSize: 14,
    color: "#1F2937",
    lineHeight: 20,
  },
  queryContainer: {
    marginBottom: 20,
  },
  queryLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 8,
  },
  queryInput: {
    borderWidth: 2,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    minHeight: 100,
    textAlignVertical: "top",
    backgroundColor: "#F9FAFB",
    color: "#1F2937",
  },
  rinaModalActions: {
    flexDirection: "row",
    gap: 12,
  },
  rinaModalCancelButton: {
    flex: 1,
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F8FAFC",
    borderWidth: 2,
    borderColor: "#E5E7EB",
  },
  rinaModalCancelText: {
    color: "#6B7280",
    fontWeight: "600",
    fontSize: 16,
  },
  rinaModalSubmitButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: "#8B5CF6",
    gap: 8,
  },
  rinaModalSubmitButtonDisabled: {
    backgroundColor: "#E5E7EB",
  },
  rinaModalSubmitText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 16,
  },
  rinaModalSubmitTextDisabled: {
    color: "#9CA3AF",
  },

  // Text extraction modal styles
  textExtractionModal: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    width: "92%",
    maxWidth: 420,
    maxHeight: "85%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 15,
    overflow: "hidden",
  },
  textExtractionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 20,
    backgroundColor: "rgba(139, 92, 246, 0.05)",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(139, 92, 246, 0.1)",
  },
  textExtractionTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#8B5CF6",
    marginLeft: 8,
    flex: 1,
  },
  textExtractionCloseButton: {
    padding: 4,
  },
  textExtractionContent: {
    padding: 20,
  },
  extractingContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
  },
  extractingText: {
    marginTop: 16,
    fontSize: 16,
    color: "#8B5CF6",
    fontWeight: "500",
  },
  extractionInstructions: {
    fontSize: 14,
    color: "#6B7280",
    lineHeight: 20,
    marginBottom: 16,
    textAlign: "center",
  },
  textExtractionInput: {
    borderWidth: 2,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    minHeight: 200,
    textAlignVertical: "top",
    backgroundColor: "#F9FAFB",
    color: "#1F2937",
    marginBottom: 20,
  },
  textExtractionActions: {
    flexDirection: "row",
    gap: 12,
  },
  textExtractionCancelButton: {
    flex: 1,
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F8FAFC",
    borderWidth: 2,
    borderColor: "#E5E7EB",
  },
  textExtractionCancelText: {
    color: "#6B7280",
    fontWeight: "600",
    fontSize: 16,
  },
  textExtractionSelectButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: "#8B5CF6",
    gap: 8,
  },
  textExtractionSelectButtonDisabled: {
    backgroundColor: "#E5E7EB",
  },
  textExtractionSelectText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 16,
  },
  textExtractionSelectTextDisabled: {
    color: "#9CA3AF",
  },

  // Selection mode overlay styles
  selectionModeOverlay: {
    position: "absolute",
    top: 20,
    left: 20,
    right: 20,
    zIndex: 100,
    alignItems: "center",
  },
  selectionModeIndicator: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(139, 92, 246, 0.1)",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(139, 92, 246, 0.3)",
    gap: 8,
  },
  selectionModeText: {
    color: "#8B5CF6",
    fontSize: 14,
    fontWeight: "500",
  },

  // AI Assistant floating button and modal styles
  floatingAIButton: {
    position: "absolute",
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#8B5CF6",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
    zIndex: 1000,
  },
  floatingAIButtonContent: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 28,
  },
  aiModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    justifyContent: "flex-end",
  },
  aiModalContainer: {
    backgroundColor: "transparent",
    width: "100%",
    height: "90%", // Allow the modal to take up to 90% of screen height
    justifyContent: "flex-end",
  },
  aiModalContent: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: Platform.OS === "ios" ? 48 : 24, // Extra padding for iOS devices with home indicator
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 16,
    minHeight: "50%",
    maxHeight: "92%",
  },
  aiModalHandle: {
    width: 40,
    height: 4,
    backgroundColor: "#E5E7EB",
    borderRadius: 2,
    alignSelf: "center",
    marginTop: 12,
    marginBottom: 8,
  },
  aiModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  aiModalIconContainer: {
    backgroundColor: "rgba(139, 92, 246, 0.1)",
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  aiModalTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: "700",
    color: "#1F2937",
    marginLeft: 12,
  },
  aiModalCloseButton: {
    padding: 6,
    borderRadius: 20,
  },
  aiModalBody: {
    flexGrow: 1,
    padding: 16,
    maxHeight: "70%",
  },
  aiChatContainer: {
    paddingBottom: 16,
  },
  aiMessageBubble: {
    backgroundColor: "#F3F4F6",
    borderRadius: 16,
    borderTopLeftRadius: 4,
    padding: 12,
    marginBottom: 12,
    maxWidth: "80%",
    alignSelf: "flex-start",
  },
  aiMessageText: {
    fontSize: 16,
    color: "#1F2937",
    lineHeight: 22,
  },
  userMessageBubble: {
    backgroundColor: "#8B5CF6",
    borderRadius: 16,
    borderTopRightRadius: 4,
    padding: 12,
    marginBottom: 12,
    maxWidth: "80%",
    alignSelf: "flex-end",
  },
  userMessageText: {
    fontSize: 16,
    color: "#FFFFFF",
    lineHeight: 22,
  },
  aiInputContainer: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: "flex-end",
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
    backgroundColor: "#FFFFFF", // Ensure the input area has a solid background
  },
  aiInput: {
    flex: 1,
    backgroundColor: "#F9FAFB",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    paddingHorizontal: 16,
    paddingVertical: 10,
    paddingRight: 48,
    fontSize: 16,
    maxHeight: 120,
  },
  aiSendButton: {
    position: "absolute",
    right: 24,
    bottom: 20,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#8B5CF6",
    alignItems: "center",
    justifyContent: "center",
  },
  // Toolbox styles
  toolboxModal: {
    width: "92%",
    maxWidth: 480,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 12,
  },
  toolboxHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
  },
  toolboxTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
  },
  toolboxGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingVertical: 10,
  },
  toolboxItem: {
    width: "25%",
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
  },
  toolboxItemActive: {
    backgroundColor: "#EEF2FF",
  },
  toolboxItemLabel: {
    marginTop: 6,
    fontSize: 12,
    color: "#374151",
  },
  toolboxFooter: {
    paddingTop: 6,
  },
});

export default PDFAnnotationViewer;