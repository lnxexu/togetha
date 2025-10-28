import React, {
  useState,
  useRef,
  useCallback,
  useEffect,
  useMemo,
} from "react";
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
import {
  Ionicons,
  MaterialIcons,
  MaterialCommunityIcons,
} from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Path, Rect, Text as SvgText, G, Circle } from "react-native-svg";
import Pdf from "react-native-pdf";
import {
  GestureDetector,
  Gesture,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedProps,
  useAnimatedReaction,
  withSpring,
  withDecay,
  runOnJS,
} from "react-native-reanimated";
import { PDFDocument } from "pdf-lib";
import { PDFAnnotation, getLocalPDFPathEnhanced } from "../utils/pdfUtils";
import { drawingAPI, PDFSaveOptions } from "../services/drawingAPI";
import offlineNotesService from "../services/offlineNotesService";
import { API_URL } from "@/constants/ApiConfig";
import { savePDFToDownloads, saveDrawingAsJPEG } from "../utils/downloadUtils";
import {
  showSuccessToast,
  showErrorToast,
  showInfoToast,
  showWarningToast,
} from "@/app/utils/ToastUtils";
import type { DrawingTool } from "./DrawingCanvas";
import {
  useNetworkStatus,
  getNetworkStatusText,
} from "../services/networkService";
import ViewShot from "react-native-view-shot";
import { RootStackParamList } from "@/app/navigation/AppNavigator";
import PDFToolbar from "./PDFToolbar";
import UnsavedChangesModal from "./UnsavedChangesModal";

const AnimatedPath = Reanimated.createAnimatedComponent(Path);
const ReanimatedSvgPath = Reanimated.createAnimatedComponent(Path);
const AnimatedRe: any = Reanimated;
const PdfAny: any = Pdf;
const PDFLibDocument = PDFDocument as any;
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
  x: number;
  y: number;
  width?: number;
  height?: number;
  color: string;
  text?: string;
  path?: string;
  strokeWidth?: number;
  opacity?: number;
  pressure?: number[];
  timestamp: number;
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
  noteId?: string;
  enableDirectSave?: boolean;
  autoSave?: boolean;
  annotations?: Annotation[];
  onAnnotationChange?: (annotations: Annotation[]) => void;
  networkStatus?: any;
  saveStatus?: any;
  strokes?: Stroke[];
}

const ANNOTATION_COLORS = [
  "#FFD700",
  "#FF6B6B",
  "#4ECDC4",
  "#45B7D1",
  "#96CEB4",
  "#FECA57",
  "#FF9FF3",
  "#A8E6CF",
];

const DEFAULT_SCALE_STROKES_WITH_ZOOM = true;
const DEFAULT_LARGE_PDF_PAGE_THRESHOLD = 40;
const DEFAULT_MAX_CONTENT_HEIGHT_PX = 250000;

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

const simplifyPoints = (pts: { x: number; y: number }[], maxPoints = 300) => {
  if (!pts || pts.length <= maxPoints) return pts;
  const step = Math.ceil(pts.length / maxPoints);
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < pts.length; i += step) {
    out.push(pts[i]);
  }
  if (out.length === 0 || out[out.length - 1] !== pts[pts.length - 1])
    out.push(pts[pts.length - 1]);
  return out;
};

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
  const [currentNoteId, setCurrentNoteId] = useState<string | undefined>(
    noteId
  );
  const pathConversionCache = useRef<Map<string, string>>(new Map());
  const maxCacheSize = 500;
  const [scaleStrokesWithZoom, setScaleStrokesWithZoom] = useState<boolean>(
    DEFAULT_SCALE_STROKES_WITH_ZOOM
  );
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
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
  const [isEditMode, setIsEditMode] = useState(false);
  const lastEditToolRef = useRef<
    "pen" | "pencil" | "brush" | "highlight" | "eraser"
  >("pen");
  const currentScreenPointsRef = useRef<
    { x: number; y: number; timestamp?: number }[]
  >([]);
  const USE_INCREMENTAL_SMOOTHING = true;
  const livePathRef = useRef<string>("");
  const incLastPointRef = useRef<{ x: number; y: number } | null>(null);
  const incLastMidRef = useRef<{ x: number; y: number } | null>(null);
  const [uiHidden, setUiHidden] = useState(false);
  const wasAutoHiddenRef = useRef(false);
  const [showToolbox, setShowToolbox] = useState(false);
  const [displayTotalPages, setDisplayTotalPages] = useState(0);
  const [useSafeMode, setUseSafeMode] = useState(false);
  const [safeModeOverride, setSafeModeOverride] = useState<boolean | null>(
    null
  );
  const effectiveSafeMode = useSafeMode;
  const maxContentHeight = DEFAULT_MAX_CONTENT_HEIGHT_PX;
  const pageThreshold = DEFAULT_LARGE_PDF_PAGE_THRESHOLD;
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [showUnsavedModal, setShowUnsavedModal] = useState(false);
  const pendingNavigationRef = useRef<null | (() => void)>(null);
  const [isSavingAnnotations, setIsSavingAnnotations] = useState(false);
  const [selectedText, setSelectedText] = useState("");
  const [selectionRect, setSelectionRect] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const [showAskRinaPopup, setShowAskRinaPopup] = useState(false);
  const [rinaQuery, setRinaQuery] = useState("");
  const [showAskRinaModal, setShowAskRinaModal] = useState(false);
  const [displayCurrentPage, setDisplayCurrentPage] = useState<number>(1);
  const [showTextExtractionModal, setShowTextExtractionModal] = useState(false);
  const [isExtractingText, setIsExtractingText] = useState(false);
  const [extractedText, setExtractedText] = useState("");
  const debugPDFCoordinates = (..._args: any[]) => {};
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
  const [showAIModal, setShowAIModal] = useState(false);
  const [aiMessage, setAiMessage] = useState<string>("");
  const [aiModalAnimation] = useState(new Animated.Value(0));
  const [chatMessages, setChatMessages] = useState<
    Array<{ type: "user" | "ai"; text: string }>
  >([{ type: "ai", text: "How can I help you with this document?" }]);
  const chatScrollViewRef = useRef<ScrollView>(null);

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
    if (!isEditMode) setIsEditMode(true);
    if (t !== "calligraphy") {
      lastEditToolRef.current = t === "highlighter" ? "highlight" : (t as any);
    }
    setSelectedTool(mapToolbarToolToViewer(t));
  };

  useEffect(() => {
    if (!isEditMode) return;
    if (selectedTool === null) {
    }
  }, [selectedTool, isEditMode]);

  const handleToolbarColorChange = (color: string) => {
    setSelectedColor(color);
  };

  const handleToolbarWidthChange = (width: number) => {
    setStrokeWidth(width);
  };

  const handleModeToggle = useCallback(() => {
    const next = !isEditMode;
    setIsEditMode(next);
    if (next) {
      if (selectedTool === null) {
        const tool = lastEditToolRef.current;
        setSelectedTool(tool as any);
      }
    } else {
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
  const handleToolbarQuickExport = async () => {
    try {
      if (viewShotRef.current) {
        showInfoToast("Capturing snapshot...");
        const uri = await viewShotRef.current.capture?.();
        if (uri) {
          const exportName = `${fileName.replace(
            /\.[^/.]+$/,
            ""
          )}_snapshot.jpg`;
          const result = await saveDrawingAsJPEG(uri, exportName, false);

          if (!result.success) {
            showErrorToast(result.error || "Could not save snapshot");
          }
        }
      }
    } catch (e) {
      console.warn("Quick export failed", e);
      showErrorToast("Could not save snapshot");
    }
  };
  // Floating AI button removed; AI action moved into More menu

  const updatePathWithAnimation = useCallback(() => {
    if (currentPointsRef.current.length === 0) return;

    const updatePath = () => {
      if (!currentPointsRef.current.length) return;
      const now = performance.now();
  const targetFrameTime = window.screen?.height > 1920 ? 11 : 14;
      if (now - lastRenderTimeRef.current < targetFrameTime) {
        animationFrameRef.current = requestAnimationFrame(updatePath);
        return;
      }

      const pointsLength = currentPointsRef.current.length;

      
      if (pointsLength === pointsCountRef.current && pathCacheRef.current) {
        lastRenderTimeRef.current = now;
        animationFrameRef.current = requestAnimationFrame(updatePath);
        return;
      }

      
      let adaptiveSmoothing = smoothingLevelRef.current;
      if (pointsLength > 50) {
        
        adaptiveSmoothing = Math.max(
          4,
          smoothingLevelRef.current - Math.floor(pointsLength / 100)
        );
      }

      
      const simplifiedLive = simplifyPointsWithTimestamp(
        currentPointsRef.current,
        320
      );

      
      const smooth = convertPointsToSmoothedPath(
        simplifiedLive as any,
        adaptiveSmoothing
      );

      
      pathCacheRef.current = smooth;
      pointsCountRef.current = pointsLength;

      
      currentPathRef.current = smooth;

      
      const nowMs = Date.now();
      if (!lastSetTimeRef.current || nowMs - lastSetTimeRef.current >= 33) {
        setCurrentPath(smooth);
        lastSetTimeRef.current = nowMs;
      }

      
      try {
        const liveKey = `live-${currentPageRef.current}`;
        if ((strokePathCacheRef as any)?.current instanceof Map) {
          (strokePathCacheRef as any).current.set(liveKey, smooth);
        }
      } catch (e) {
        
      }

      lastRenderTimeRef.current = now;

      
      if (pendingPathUpdateRef.current) {
        animationFrameRef.current = requestAnimationFrame(updatePath);
      }
    };

    if (!pendingPathUpdateRef.current) {
      pendingPathUpdateRef.current = true;
      animationFrameRef.current = requestAnimationFrame(updatePath);
    }
  }, []);

  
  const strokePathCacheRef = useRef<Map<string, string>>(new Map());

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

  const liveHaloOuterProps = useAnimatedProps(() => ({
    d: svLivePath.value,
    stroke: "rgba(0,0,0,0.28)" as unknown as any,
    strokeWidth: svLiveStrokeWidth.value + 6,
    opacity: svLiveHaloOpacity.value,
    strokeLinecap: "round" as any,
    strokeLinejoin: "round" as any,
    strokeMiterlimit: 10 as any,
    fill: "none" as any,
  }));
  const liveHaloInnerProps = useAnimatedProps(() => ({
    d: svLivePath.value,
    stroke: "rgba(255,255,255,0.75)" as unknown as any,
    strokeWidth: svLiveStrokeWidth.value + 3,
    opacity: svLiveHaloOpacity.value,
    strokeLinecap: "round" as any,
    strokeLinejoin: "round" as any,
    strokeMiterlimit: 10 as any,
    fill: "none" as any,
  }));

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
    svLiveOpacity.value =
      selectedTool === "highlight"
        ? Math.max(0.1, Math.min(1, highlightOpacity))
        : 0.95;
  }, [selectedTool, highlightOpacity]);
  useEffect(() => {
    svLiveHaloOpacity.value = selectedTool === "highlight" ? 0.35 : 1;
  }, [selectedTool]);


  const [currentZoom, setCurrentZoom] = useState(1);

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

  const [pdfTransform, setPdfTransform] = useState({
    scale: 1,
    translateX: 0,
    translateY: 0,
  });
  const [isPinching, setIsPinching] = useState(false);
  const pdfTransformRef = useRef(pdfTransform);
  useEffect(() => {
    pdfTransformRef.current = pdfTransform;
  }, [pdfTransform]);

  useEffect(() => {
    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

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


  const animatedTranslateX = useRef(new Animated.Value(0)).current;
  const animatedTranslateY = useRef(new Animated.Value(0)).current;
  const animatedScale = useRef(new Animated.Value(1)).current;

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
    svScale.value = withSpring(final.scale, { damping: 18, stiffness: 180 });
    svTranslateX.value = withSpring(final.translateX, {
      damping: 18,
      stiffness: 180,
    });
    svTranslateY.value = withSpring(final.translateY, {
      damping: 18,
      stiffness: 180,
    });
    const sync = () => {
      setCurrentZoom(final.scale);
      setPdfTransform(final);
      callback?.();
    };
    runOnJS(sync)();
  };

  

  useEffect(() => {
    animatedTranslateX.setValue(pdfTransform.translateX);
    animatedTranslateY.setValue(pdfTransform.translateY);
    animatedScale.setValue(pdfTransform.scale);
    svScale.value = pdfTransform.scale;
    svTranslateX.value = pdfTransform.translateX;
    svTranslateY.value = pdfTransform.translateY;
  }, [pdfTransform.translateX, pdfTransform.translateY, pdfTransform.scale]);

  const [pageOpacity] = useState(new Animated.Value(1));
  const [shouldCaptureGestures, setShouldCaptureGestures] = useState(false);
  const pinchHysteresisTimerRef = useRef<any>(null);

  useEffect(() => {
    pageOpacity.setValue(1);
  }, [currentPage, pageOpacity]);

  const gestureStartZoomRef = useRef(1);
  const gestureStartDistanceRef = useRef(0);
  const currentZoomRef = useRef(currentZoom);
  useEffect(() => {
    currentZoomRef.current = currentZoom;
  }, [currentZoom]);

  const lastZoomForCache = useRef(currentZoom);
  const lastContainerSizeForCache = useRef({ width: 0, height: 0 });
  useEffect(() => {
    const zoomChanged = Math.abs(currentZoom - lastZoomForCache.current) > 0.1;
    const sizeChanged =
      Math.abs(containerSize.width - lastContainerSizeForCache.current.width) >
        10 ||
      Math.abs(
        containerSize.height - lastContainerSizeForCache.current.height
      ) > 10;

    if (zoomChanged || sizeChanged) {
      pathConversionCache.current.clear();
      lastZoomForCache.current = currentZoom;
      lastContainerSizeForCache.current = containerSize;
      if (__DEV__) {
        console.log("🔄 Path cache cleared due to layout change");
      }
    }
  }, [currentZoom, containerSize.width, containerSize.height]);

  const gestureStartTranslateRef = useRef({ x: 0, y: 0 });
  const gestureStartTouchRef = useRef({ x: 0, y: 0 });

  const currentPointsRef = useRef<
    { x: number; y: number; timestamp?: number }[]
  >([]);
  const animationFrameRef = useRef<number | null>(null);
  const lastRenderTimeRef = useRef<number>(0);
  const pendingPathUpdateRef = useRef<boolean>(false);
  const pathCacheRef = useRef<string>("");
  const pointsCountRef = useRef<number>(0);
  const smoothingLevelRef = useRef<number>(8);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const lastSetTimeRef = useRef<number | null>(null);

  const MIN_PDF_SCALE = 1.0;
  const MAX_PDF_SCALE = 3.0;
  const PINCH_SENSITIVITY = 1.0;
  const PINCH_SMOOTH_SCALE = 0.25;
  const PINCH_SMOOTH_TRANSLATION = 0.3;
  const PAN_MIN_DISTANCE = 1;
  const PAN_ACTIVE_OFFSET_X = 3;
  const PAN_X_GAIN = 1.15;
  const PAN_Y_GAIN = 1.0;

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
  const transformContainerRef = useRef<any>(null);
  const containerWindowOffsetRef = useRef<{
    left: number;
    top: number;
    width: number;
    height: number;
  }>({ left: 0, top: 0, width: 0, height: 0 });

  const liveTransformRef = useRef({ scale: 1, translateX: 0, translateY: 0 });
  const updateLiveTransform = useCallback(
    (scale: number, translateX: number, translateY: number) => {
      liveTransformRef.current = { scale, translateX, translateY };
    },
    []
  );

  useAnimatedReaction(
    () => ({
      s: svScale.value,
      tx: svTranslateX.value,
      ty: svTranslateY.value,
    }),
    (vals) => {
      runOnJS(updateLiveTransform)(vals.s, vals.tx, vals.ty);
    }
  );

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

  const clamp = (v: number, min: number, max: number) => {
    "worklet";
    return Math.max(min, Math.min(max, v));
  };

  const pinchGesture = useMemo(() => {
    return Gesture.Pinch()
      .shouldCancelWhenOutside(false)
  .enabled(!isEditMode || selectedTool === null)
      .onStart((e: any) => {
        "worklet";
        svStartScale.value = svScale.value;
        svAnchorX.value = (e.focalX - svTranslateX.value) / svScale.value;
        svAnchorY.value = (e.focalY - svTranslateY.value) / svScale.value;
        runOnJS(setShouldCaptureGestures)(true);
        runOnJS(setIsPinching)(true);
      })
      .onUpdate((e: any) => {
        "worklet";
        const gainedScale = Math.pow(e.scale || 1, PINCH_SENSITIVITY);
        const nextScaleRaw = clamp(
          svStartScale.value * gainedScale,
          MIN_PDF_SCALE,
          MAX_PDF_SCALE
        );
        const smoothedScale =
          svScale.value + PINCH_SMOOTH_SCALE * (nextScaleRaw - svScale.value);
        const targetTX = e.focalX - svAnchorX.value * smoothedScale;
        const targetTY = e.focalY - svAnchorY.value * smoothedScale;
        const maxOffsetX = (svContainerW.value * (smoothedScale - 1)) / 2;
        const maxOffsetY = (svContainerH.value * (smoothedScale - 1)) / 2;
        const margin = 6;
        const softClamp = (v: number, min: number, max: number) => {
          "worklet";
          if (v < min - margin) return min - margin;
          if (v > max + margin) return max + margin;
          return v;
        };
        const targetTXClamped = softClamp(targetTX, -maxOffsetX, maxOffsetX);
        const targetTYClamped = softClamp(targetTY, -maxOffsetY, maxOffsetY);
        svScale.value = smoothedScale;
        svTranslateX.value =
          svTranslateX.value +
          PINCH_SMOOTH_TRANSLATION * (targetTXClamped - svTranslateX.value);
        svTranslateY.value =
          svTranslateY.value +
          PINCH_SMOOTH_TRANSLATION * (targetTYClamped - svTranslateY.value);
      })
      .onEnd(() => {
        "worklet";
        const scale = svScale.value || 1;
        const maxOffsetX = (svContainerW.value * (scale - 1)) / 2;
        const maxOffsetY = (svContainerH.value * (scale - 1)) / 2;
        const clampedTX = clamp(svTranslateX.value, -maxOffsetX, maxOffsetX);
        const clampedTY = clamp(svTranslateY.value, -maxOffsetY, maxOffsetY);
        svTranslateX.value = withSpring(clampedTX, {
          damping: 20,
          stiffness: 200,
        });
        svTranslateY.value = withSpring(clampedTY, {
          damping: 20,
          stiffness: 200,
        });
        runOnJS(setCurrentZoom)(scale);
        runOnJS(setPdfTransform)({
          scale,
          translateX: clampedTX,
          translateY: clampedTY,
        });
        runOnJS(setIsPinching)(false);
      });
  }, [MIN_PDF_SCALE, MAX_PDF_SCALE, isEditMode, selectedTool]);

  const panEnabled =
    (!isEditMode && selectedTool === null) ||
    (selectedTool === null && currentZoom > 1);
  const panGesture = useMemo(() => {
    return Gesture.Pan()
      .shouldCancelWhenOutside(false)
      .enabled(panEnabled)
      .minDistance(PAN_MIN_DISTANCE)
      .activeOffsetX([-PAN_ACTIVE_OFFSET_X, PAN_ACTIVE_OFFSET_X])
      .minPointers(1)
      .maxPointers(1)
      .onStart(() => {
        "worklet";
        svStartTX.value = svTranslateX.value;
        svStartTY.value = svTranslateY.value;
        runOnJS(setShouldCaptureGestures)(true);
      })
      .onUpdate((e) => {
        "worklet";
        const scale = svScale.value || 1;
        const maxOffsetX =
          scale >= 1
            ? (svContainerW.value * (scale - 1)) / 2
            : (svContainerW.value * (1 - scale)) / 2;
        const maxOffsetY =
          scale >= 1
            ? (svContainerH.value * (scale - 1)) / 2
            : (svContainerH.value * (1 - scale)) / 2;
        const nextTX = svStartTX.value + e.translationX * PAN_X_GAIN;
        const nextTY = svStartTY.value + e.translationY * PAN_Y_GAIN;
        svTranslateX.value = clamp(nextTX, -maxOffsetX, maxOffsetX);
        svTranslateY.value = clamp(nextTY, -maxOffsetY, maxOffsetY);
      })
      .onEnd((e) => {
        "worklet";
        const scale = svScale.value || 1;
        const maxOffsetX =
          scale >= 1
            ? (svContainerW.value * (scale - 1)) / 2
            : (svContainerW.value * (1 - scale)) / 2;
        const maxOffsetY =
          scale >= 1
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
        "worklet";
        runOnJS(setShouldCaptureGestures)(false);
      });
  }, [panEnabled]);

  const doubleTapGesture = useMemo(() => {
    return Gesture.Tap()
      .numberOfTaps(2)
      .maxDelay(300)
      .onEnd((e, success) => {
        "worklet";
        if (!success) return;
        const current = svScale.value;
        const target = current <= 1 ? Math.min(2, MAX_PDF_SCALE) : 1;
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

  const getDistance = (touches: any[]) => {
    if (touches.length < 2) return 0;
    const touch1 = touches[0];
    const touch2 = touches[1];
    const dx = touch2.pageX - touch1.pageX;
    const dy = touch2.pageY - touch1.pageY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const convertPointsToSmoothedPath = (
    points: { x: number; y: number; timestamp?: number }[],
    segments = 8
  ) => {
    if (!points || points.length === 0) return "";
    if (points.length === 1)
      return `M${points[0].x.toFixed(2)},${points[0].y.toFixed(2)}`;

    const workingPoints: typeof points = points.length < 50 ? points : [];

    if (points.length >= 50) {
      let prevPoint = points[0];
      workingPoints.push(prevPoint);

      const minDistance = segments > 6 ? 2.5 : 1.8;

      for (let i = 1; i < points.length; i++) {
        const point = points[i];

        if ((point as any).isPredicted) continue;

        const dx = point.x - prevPoint.x;
        const dy = point.y - prevPoint.y;

        const distanceSquared = dx * dx + dy * dy;
        const minDistanceSquared = minDistance * minDistance;

        if (distanceSquared >= minDistanceSquared) {
          workingPoints.push(point);
          prevPoint = point;
        }
      }
    }

    const finalPoints = workingPoints.length >= 2 ? workingPoints : points;

    const baseTension = Math.min(0.4, segments / 20);
    const tensionFactor = 1 - baseTension;

    const sixthFactor = tensionFactor / 6;

    const f = (n: number) => Math.round(n * 100) / 100;

    let d = `M${f(finalPoints[0].x)},${f(finalPoints[0].y)}`;

    for (let i = 0; i < finalPoints.length - 1; i++) {
      const p0 = finalPoints[i - 1] || finalPoints[i];
      const p1 = finalPoints[i];
      const p2 = finalPoints[i + 1];
      const p3 = finalPoints[i + 2] || p2;

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

  const [isSavingToPDF, setIsSavingToPDF] = useState(false);
  const [lastSavedPath, setLastSavedPath] = useState<string | null>(null);

  const saveExportedPdfToDevice = async (savedFileUri: string) => {
    try {
      if (!savedFileUri) throw new Error("No file path provided");

      const fileName = savedFileUri.split("/").pop() || "exported.pdf";

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

      await savePDFToDownloads(savedPath, name, false);
    } catch (err) {
      console.error("Error in onAfterExportSaved:", err);
    }
  };
  const [saveMode, setSaveMode] = useState<"overlay" | "direct">("direct");
  const [showSaveModeModal, setShowSaveModeModal] = useState(false);

  const [folders, setFolders] = useState<any[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [folderName, setFolderName] = useState("PDF Documents");
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [folderFilter, setFolderFilter] = useState("");
  const [isLoadingFolders, setIsLoadingFolders] = useState(false);

  const [syncStatus, setSyncStatus] = useState<"saved" | "syncing" | "offline">(
    "saved"
  );
  const localNetworkStatus = useNetworkStatus();
  const isOnline =
    localNetworkStatus.isConnected &&
    localNetworkStatus.isInternetReachable &&
    localNetworkStatus.isServerReachable;

  useEffect(() => {
    setCurrentNoteId(noteId);
  }, [noteId]);

  const [pdfDimensions, setPdfDimensions] = useState({
    width: screenWidth,
    height: screenHeight,
  });
  const [scrollOffset, setScrollOffset] = useState({ x: 0, y: 0 });

  const [pdfScrollOffset, setPdfScrollOffset] = useState({ x: 0, y: 0 });

  const [pdfPageDimensions, setPdfPageDimensions] = useState({
    width: 595,
    height: 842,
  });
  const [pdfViewerBounds, setPdfViewerBounds] = useState({
    width: screenWidth,
    height: screenHeight,
  });

  useEffect(() => {
    if (!strokes || !Array.isArray(strokes) || strokes.length === 0) return;

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

    const maxPoints = 300;
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
      }
    }
  }, [strokes, containerSize.width, containerSize.height, pdfPageDimensions]);

  const [currentSource, setCurrentSource] = useState<{ uri: string }>(source);

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

  const updateAnnotations = useCallback(
    (
      newAnnotations: Annotation[] | ((prev: Annotation[]) => Annotation[]),
      immediate = false
    ) => {
      const resolvedAnnotations =
        typeof newAnnotations === "function"
          ? newAnnotations(pendingAnnotationUpdates.current || annotations)
          : newAnnotations;

      if (immediate) {
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
        pendingAnnotationUpdates.current = resolvedAnnotations;

        if (annotationUpdateTimer.current) {
          clearTimeout(annotationUpdateTimer.current);
        }

        annotationUpdateTimer.current = setTimeout(() => {
          flushAnnotationUpdates();
          annotationUpdateTimer.current = null;
        }, 16);
      }
    },
    [annotations, onAnnotationChange, flushAnnotationUpdates]
  );

  const pdfRef = useRef<any>(null);
  const viewShotRef = useRef<any>(null);
  const annotationStorageKey = `pdf_annotations_${fileName}`;
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const undoStackRef = useRef<Annotation[][]>([]);
  const redoStackRef = useRef<Annotation[][]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

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
      undoStackRef.current.push(JSON.parse(JSON.stringify(annotations || [])));
      await applyAnnotationsWithoutHistory(next);
      setHasUnsavedChanges(true);
      setCanUndo(undoStackRef.current.length > 0);
      setCanRedo(redoStackRef.current.length > 0);
    } catch (err) {
      console.error("Redo failed:", err);
    }
  };

  React.useEffect(() => {
    if (externalAnnotations && externalAnnotations.length > 0) {
      updateAnnotations(externalAnnotations);
    } else {
      loadAnnotations();
    }

    (async () => {
      try {
        if (
          source?.uri &&
          (source.uri.startsWith("http://") ||
            source.uri.startsWith("https://"))
        ) {
          setIsLoading(true);

          let downloadUrl = source.uri;
          try {
            const sourceUrl = new URL(source.uri);
            const apiUrl = new URL(API_URL);

            const getActualPort = (url: URL) => {
              if (url.port) return url.port;
              return url.protocol === "https:" ? "443" : "80";
            };

            const sourcePort = getActualPort(sourceUrl);
            const apiPort = getActualPort(apiUrl);

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
              undefined,
              fetchHeaders
            );
            const localUri = result.uri;
            setCurrentSource({ uri: localUri });
          } catch (err) {
            console.error("Failed to download remote PDF before loading:", err);
            setHasError(true);
            setIsLoading(false);

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
                    setHasError(false);
                    setIsLoading(true);
                  },
                },
                {
                  text: "Open in Browser",
                  onPress: () => {
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

      if (
        uriToCheck &&
        (uriToCheck.startsWith("file://") ||
          uriToCheck.startsWith(FileSystem.documentDirectory || ""))
      ) {
        const fileInfo = await FileSystem.getInfoAsync(uriToCheck);
        if (!fileInfo.exists) {
          console.error("PDF file not found at:", uriToCheck);
          setHasError(true);
          Alert.alert("File Not Found", `PDF file not found at: ${uriToCheck}`);
          return;
        }
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
      }
    } catch (error) {
      console.error("Error validating PDF file:", error);
      setHasError(true);
      Alert.alert("File Error", "Unable to access the PDF file");
    }
  };

  const loadAnnotations = async () => {
    try {
      const parsePathPoints = (path: string): { x: number; y: number }[] => {
        const pts: { x: number; y: number }[] = [];
        if (!path || typeof path !== "string") return pts;
        try {
          const tokens =
            path
              .replace(/,/g, " ")
              .replace(/\s+/g, " ")
              .trim()
              .match(/[MLQCSZ]|-?\d*\.?\d+/g) || [];
          let i = 0;
          let lastCmd = "";
          while (i < tokens.length) {
            const tk = tokens[i++];
            if (/^[MLQCSZ]$/.test(tk)) {
              lastCmd = tk;
              if (tk === "M" || tk === "L") {
                const x = parseFloat(tokens[i++] || "NaN");
                const y = parseFloat(tokens[i++] || "NaN");
                if (Number.isFinite(x) && Number.isFinite(y))
                  pts.push({ x, y });
              } else if (tk === "Q") {
                const x1 = parseFloat(tokens[i++] || "NaN");
                const y1 = parseFloat(tokens[i++] || "NaN");
                const x = parseFloat(tokens[i++] || "NaN");
                const y = parseFloat(tokens[i++] || "NaN");
                if (Number.isFinite(x) && Number.isFinite(y))
                  pts.push({ x, y });
              } else if (tk === "C") {
                const x1 = parseFloat(tokens[i++] || "NaN");
                const y1 = parseFloat(tokens[i++] || "NaN");
                const x2 = parseFloat(tokens[i++] || "NaN");
                const y2 = parseFloat(tokens[i++] || "NaN");
                const x = parseFloat(tokens[i++] || "NaN");
                const y = parseFloat(tokens[i++] || "NaN");
                if (Number.isFinite(x) && Number.isFinite(y))
                  pts.push({ x, y });
              }
            } else {
              if (lastCmd === "M" || lastCmd === "L") {
                const x = parseFloat(tk);
                const y = parseFloat(tokens[i++] || "NaN");
                if (Number.isFinite(x) && Number.isFinite(y))
                  pts.push({ x, y });
              }
            }
          }
        } catch {}
        return pts;
      };

      const migrateLegacyAnnotation = (ann: Annotation): Annotation | null => {
        try {
          if (!ann?.path) return null;
          const pts = parsePathPoints(ann.path);
          if (!pts.length) return null;
          const hasPixel = pts.some((p) => p.x > 1 || p.y > 1);
          if (!hasPixel) return null;

          const { displayW, displayH, pageSpacing } = getLayoutMetrics();
          if (!(displayW > 0 && displayH > 0)) return null;
          const avgY = pts.reduce((s, p) => s + p.y, 0) / pts.length;
          const pageWithSpacing = displayH + pageSpacing;
          let pageIndex = Math.max(0, Math.floor(avgY / pageWithSpacing));
          const maxPageIndex = Math.max(
            0,
            (totalPagesRef.current || displayTotalPages || 1) - 1
          );
          if (pageIndex > maxPageIndex) pageIndex = maxPageIndex;
          const inferredPage = pageIndex + 1;

          const pageStartY = effectiveSafeMode
            ? 0
            : pageIndex * (displayH + pageSpacing);
          const offsetX = Math.max(
            0,
            ((pdfViewerBounds?.width ||
              pdfContainerLayout?.width ||
              containerSize.width ||
              screenWidth) -
              displayW) /
              2
          );
          let normalized = "";
          for (let i = 0; i < pts.length; i++) {
            const nx = Math.max(
              0,
              Math.min(1, (pts[i].x - offsetX) / displayW)
            );
            const ny = Math.max(
              0,
              Math.min(1, (pts[i].y - pageStartY) / displayH)
            );
            normalized +=
              (i === 0 ? "M" : " L") + nx.toFixed(6) + "," + ny.toFixed(6);
          }

          const out: Annotation = {
            ...ann,
            page: inferredPage,
            path: normalized,
          };
          return out;
        } catch (e) {
          console.warn("Migration failed for annotation:", ann?.id, e);
          return null;
        }
      };
      const normalizeAnnotations = (items: any[]): Annotation[] => {
        const makeId = () =>
          `ann_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
        const clamp01 = (n: any) => {
          const v = typeof n === "number" ? n : parseFloat(String(n));
          if (isNaN(v)) return 0;
          return Math.min(1, Math.max(0, v));
        };
        const toPercent = (value: any, size: number) => {
          if (typeof value !== "number") {
            const parsed = parseFloat(String(value));
            if (!isNaN(parsed)) value = parsed;
            else return 0;
          }
          if (value >= 0 && value <= 1) return value;
          return size > 0 ? Math.min(1, Math.max(0, value / size)) : 0;
        };

        const vw = Math.max(
          1,
          pdfContainerLayout?.width || containerSize.width || screenWidth
        );
        const vh = Math.max(
          1,
          pdfContainerLayout?.height || containerSize.height || screenHeight
        );
        const rawTotalPages = totalPagesRef.current || displayTotalPages || 0;
        const knownTotalPages = rawTotalPages > 0 ? rawTotalPages : undefined;

        const mapType = (t: any, hasPath: boolean): Annotation["type"] => {
          const s = String(t || "").toLowerCase();
          if (s === "drawing") return hasPath ? "pen" : "pencil";
          if (s === "bookmark") return "note";
          if (s === "underline" || s === "strikethrough") return "selection";
          if (s === "text" || s === "note") return "note";
          if (s === "highlight") return "highlight";
          if (s === "pen" || s === "brush" || s === "pencil") return s as any;
          return "selection";
        };

        const normalizeOne = (raw: any): Annotation => {
          const hasPosition =
            raw &&
            typeof raw === "object" &&
            raw.position &&
            typeof raw.position === "object";
          const hasPathField = !!raw?.path || !!raw?.strokeData;

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
            if (isNaN(n) || n < 1) return 1;
            if (knownTotalPages !== undefined) {
              return Math.min(knownTotalPages, n);
            }
            return n; // preserve original page when total not known yet
          })();

          const type = mapType(raw?.type, hasPathField);
          const color = typeof raw?.color === "string" ? raw.color : "#FFEB3B";
          const text = raw?.text ?? raw?.note ?? undefined;
          const path =
            (raw?.path as string) ?? (raw?.strokeData as string) ?? undefined;

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
          if (
            items.length === 1 &&
            Array.isArray((items[0] as any)?.annotations)
          ) {
            items = (items[0] as any).annotations;
          }
        } catch {}

        const out = items.map(normalizeOne);
        if (knownTotalPages !== undefined) {
          return out.filter((a) => a.page >= 1 && a.page <= knownTotalPages);
        }
        return out;
      };

      if (currentNoteId) {
        try {
          const note = await offlineNotesService.getNoteById(currentNoteId);
          const rawAnns = (note?.document_annotations || []) as any[];
          let anns = normalizeAnnotations(
            Array.isArray(rawAnns) ? rawAnns : []
          );
          const before = JSON.stringify(anns);
          const fixed = anns.map((a) => {
            if (!a.page || a.page < 1) {
              console.warn(
                "Annotation missing/invalid page; attempting migration:",
                a.id,
                a.type
              );
              const migrated = migrateLegacyAnnotation(a);
              return migrated || { ...a, page: 1 };
            }
            const migrated = migrateLegacyAnnotation(a);
            return migrated || a;
          });
          const after = JSON.stringify(fixed);
          if (before !== after) {
            try {
              await AsyncStorage.setItem(
                annotationStorageKey,
                JSON.stringify(fixed)
              );
            } catch {}
            try {
              if (currentNoteId) {
                await offlineNotesService.updateNote(currentNoteId, {
                  document_annotations: fixed,
                  type: "document",
                  folderId: selectedFolderId || undefined,
                });
              }
            } catch {}
            anns = fixed;
          }
          if (anns.length > 0) {
            updateAnnotations(anns);
            try {
              await AsyncStorage.setItem(
                annotationStorageKey,
                JSON.stringify(anns)
              );
            } catch {}
            return;
          }
        } catch {}
      }

      const stored = await AsyncStorage.getItem(annotationStorageKey);
      if (stored) {
        const loadedAnnotations = JSON.parse(stored) as any[];
        let normalizedAnnotations = normalizeAnnotations(loadedAnnotations);
        const before = JSON.stringify(normalizedAnnotations);
        const fixed = normalizedAnnotations.map((a) => {
          if (!a.page || a.page < 1) {
            console.warn(
              "Annotation missing/invalid page in local store; attempting migration:",
              a.id,
              a.type
            );
            const migrated = migrateLegacyAnnotation(a);
            return migrated || { ...a, page: 1 };
          }
          const migrated = migrateLegacyAnnotation(a);
          return migrated || a;
        });
        const after = JSON.stringify(fixed);
        if (before !== after) {
          try {
            await AsyncStorage.setItem(
              annotationStorageKey,
              JSON.stringify(fixed)
            );
          } catch {}
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

  const saveAnnotationsWithChanges = async (newAnnotations: Annotation[]) => {
    try {
      const validatedAnnotations = newAnnotations.map((ann) => {
        const clone: Annotation = { ...ann };

        if (clone.path && /\d/.test(clone.path)) {
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

        if (typeof clone.x === "number")
          clone.x = Math.min(1, Math.max(0, clone.x));
        if (typeof clone.y === "number")
          clone.y = Math.min(1, Math.max(0, clone.y));
        if (typeof clone.width === "number")
          clone.width = Math.min(1, Math.max(0, clone.width));
        if (typeof clone.height === "number")
          clone.height = Math.min(1, Math.max(0, clone.height));
        if (clone.page && (!Number.isInteger(clone.page) || clone.page < 1)) {
          clone.page = Math.max(1, Math.round(clone.page));
        }

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

      try {
        undoStackRef.current.push(
          JSON.parse(JSON.stringify(annotations || []))
        );
        if (undoStackRef.current.length > 50) undoStackRef.current.shift();
        redoStackRef.current = [];
        setCanUndo(undoStackRef.current.length > 0);
        setCanRedo(false);
      } catch (historyErr) {
        console.warn("Failed to push to undo stack:", historyErr);
      }

      updateAnnotations(validatedAnnotations);

      await AsyncStorage.setItem(
        annotationStorageKey,
        JSON.stringify(validatedAnnotations)
      );

      const savedData = await AsyncStorage.getItem(annotationStorageKey);
      const parsedData = savedData ? JSON.parse(savedData) : [];

      if (parsedData.length !== validatedAnnotations.length) {
        throw new Error("Save verification failed - annotation count mismatch");
      }

      setHasUnsavedChanges(true);

      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }

      autoSaveTimerRef.current = setTimeout(() => {
        autoSaveAnnotations(validatedAnnotations);
      }, 1000); // 1 second debounce like DrawingEditor

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
      await loadAnnotations();
    }
  };

  const autoSaveAnnotations = useCallback(
    async (anns?: Annotation[]) => {
      const annotationsToSave = anns || annotations;
      try {
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
            console.error(
              "Failed to save annotations to offline notes:",
              error
            );
            setHasUnsavedChanges(true);
            setSyncStatus("offline");
          }
        } else {
          setHasUnsavedChanges(true);
          setSyncStatus("offline");
        }
      } catch (error) {
        console.error("Auto-save (local) failed:", error);
        setHasUnsavedChanges(true);
        setSyncStatus("offline");
      }
    },
    [annotations, currentNoteId, isOnline]
  );

  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const backHandler = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        if (hasUnsavedChanges) {
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

  const syncAnnotationsToBackend = async (_anns: Annotation[]) => {
    return;
  };

  const syncAnnotationsNow = useCallback(
    async (anns?: Annotation[]) => {
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
    },
    [annotations, currentNoteId, fileName, isOnline]
  );

  const handleSaveAnnotations = async () => {
    if (!hasUnsavedChanges) return;

    try {
      setIsSavingToPDF(true);

      if (saveMode === "direct" && enableDirectSave) {
        await saveAnnotationsDirectlyToPDF(annotations);
      } else {
        await AsyncStorage.setItem(
          annotationStorageKey,
          JSON.stringify(annotations)
        );
      }

      setHasUnsavedChanges(false);
    } catch (error) {
      const msg = String(error || "");
      if (
        !isOnline &&
        (msg.includes("Network request failed") || msg.includes("TypeError"))
      ) {
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
          totalPages: Math.max(
            1,
            totalPagesRef.current || displayTotalPages || 1
          ),
          viewerWidth: Math.max(
            1,
            pdfContainerLayout?.width || containerSize.width || screenWidth
          ),
          viewerHeight: Math.max(
            1,
            pdfContainerLayout?.height || containerSize.height || screenHeight
          ),
          pdfPageDimensions: {
            width: Math.max(1, pdfPageDimensions?.width || 595),
            height: Math.max(1, pdfPageDimensions?.height || 842),
          },
        },
      };

      let result;
      const pdfUriToSave = currentSource?.uri || source.uri;

      if (isOnline && (currentNoteId || noteId)) {
        try {
          result = await drawingAPI.savePDFAnnotationsWithBackend(
            String(currentNoteId || noteId),
            pdfUriToSave,
            pdfAnnotations,
            saveOptions
          );
        } catch (e) {
          console.warn(
            "Backend save failed, falling back to local PDF save:",
            e
          );
          result = await drawingAPI.savePDFAnnotations(
            pdfUriToSave,
            pdfAnnotations,
            saveOptions
          );
        }
      } else {
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
      const msg = String(error || "");
      if (
        !isOnline &&
        (msg.includes("Network request failed") || msg.includes("TypeError"))
      ) {
        console.warn(
          "Offline: skipping backend save error and keeping local state.",
          error
        );
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

  const handleShareAnnotatedPdf = async () => {
    try {
      showInfoToast("Preparing PDF for sharing...");

      if (lastSavedPath) {
        const info = await FileSystem.getInfoAsync(lastSavedPath);
        if (info.exists) {
          await shareExportedPDF(lastSavedPath);
          return;
        }
      }

      const pdfAnnotations: PDFAnnotation[] = annotations.map((annotation) => ({
        ...annotation,
        type: annotation.type as PDFAnnotation["type"],
      }));

      if (!source?.uri) {
        showErrorToast("Original PDF not available");
        return;
      }

      const timestamp = new Date()
        .toISOString()
        .slice(0, 19)
        .replace(/[T:]/g, "_");
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
      `File: ${fileName}\nPages: ${totalPagesRef.current}\nCurrent Page: ${
        currentPageRef.current
      }\n\nAnnotations:\n${countText || "No annotations"}`
    );
  };

  const onPdfLoadComplete = (
    numberOfPages: number,
    filePath: string,
    { width, height }: { width?: number; height?: number } = {}
  ) => {
    setTotalPages(numberOfPages);
    if (displayTotalPages !== numberOfPages)
      setDisplayTotalPages(numberOfPages);
    totalPagesRef.current = numberOfPages;
    if (
      numberOfPages >= pageThreshold &&
      !useSafeMode &&
      safeModeOverride !== false
    ) {
      setUseSafeMode(true);
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

    if (width && height) {
      setPdfPageDimensions({ width, height });

      const aspectRatio = height / width;

      const pageWidth = screenWidth;
      const pageHeight = pageWidth * aspectRatio;

      setContainerSize({ width: pageWidth, height: pageHeight });

      setPdfViewerBounds({ width: pageWidth, height: pageHeight });

      const spacing = 10;
      const contentHeight = Math.max(
        1,
        numberOfPages * (pageHeight + spacing) - spacing
      );
      if (
        contentHeight > maxContentHeight &&
        !useSafeMode &&
        safeModeOverride !== false
      ) {
        setUseSafeMode(true);
        try {
          Alert.alert(
            "Memory-Safe Mode Enabled",
            `This document is tall when stacked (${numberOfPages} pages). To avoid crashes, we're rendering one page at a time.`
          );
        } catch {}
      }
    } else {
      const pageWidth = screenWidth;
      const pageHeight = pageWidth * (11 / 8.5); // Letter size aspect ratio

      setContainerSize({ width: pageWidth, height: pageHeight });
      setPdfViewerBounds({ width: pageWidth, height: pageHeight });

      const spacing = 10;
      const contentHeight = Math.max(
        1,
        numberOfPages * (pageHeight + spacing) - spacing
      );
      if (
        contentHeight > maxContentHeight &&
        !useSafeMode &&
        safeModeOverride !== false
      ) {
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

            try {
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
            }

            throw new Error("No base64 decode available in this environment");
          };

          const bytes = base64ToUint8Array(base64Data);

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
  }, [currentSource?.uri, source?.uri, totalPages]);

  const onPdfLoadProgress = (percent: number) => {
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

  const onPdfScaleChanged = (scale: number) => {
    console.log("PDF internal scale changed:", scale);
    setCurrentZoom(scale);
    setPdfTransform((prev) => ({ ...prev, scale }));
  };

  const onTextSelectionChange = useCallback(
    (selection: {
      text: string;
      pageNumber: number;
      bounds: { x: number; y: number; width: number; height: number };
    }) => {
      if (selection.text && selection.text.trim().length > 0) {
        setSelectedText(selection.text);
        setSelectionRect({
          x: selection.bounds.x,
          y: selection.bounds.y,
          width: selection.bounds.width,
          height: selection.bounds.height,
        });
        setShowAskRinaPopup(true);

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

  const handleAskRina = useCallback(() => {
    if (selectedText.trim()) {
      setRinaQuery(`Explain this text: "${selectedText}"`);
      setShowAskRinaModal(true);
      setShowAskRinaPopup(false);
    }
  }, [selectedText]);

  const handleCustomRinaQuery = useCallback(() => {
    if (selectedText.trim()) {
      setRinaQuery("");
      setShowAskRinaModal(true);
      setShowAskRinaPopup(false);
    }
  }, [selectedText]);

  const handleRinaModalClose = useCallback(() => {
    setShowAskRinaModal(false);
    setRinaQuery("");
    setSelectedText("");
    setSelectionRect(null);
    setShowAskRinaPopup(false);
    setShowTextPreviewModal(false);
    setPreviewExtractedText("");
  }, []);

  const handleTextSelectTool = useCallback(() => {
    if (selectedTool === "textSelect") {
      setSelectedTool(null);
      return;
    }

    Alert.alert(
      "Feature not available",
      "Text selection functionality has been removed."
    );
  }, [selectedTool]);

  const localToSvg = useCallback((localX: number, localY: number) => {
    const { displayW, contentHeight } = getLayoutMetrics();
    const clamp = (v: number, min: number, max: number) =>
      Math.max(min, Math.min(max, v));
    return {
      x: clamp(localX, 0, displayW),
      y: clamp(localY, 0, contentHeight),
    };
  }, []);

  const getPageFromContentY = useCallback(
    (contentY: number) => {
      if (effectiveSafeMode) {
        return currentPageRef.current || 1;
      }
      const { displayH, pageSpacing } = getLayoutMetrics();
      const pageWithSpacingHeight = displayH + pageSpacing;
      const pageIndex = Math.max(
        0,
        Math.floor(contentY / pageWithSpacingHeight)
      );
      const maxPageIndex = Math.max(
        0,
        (totalPagesRef.current || totalPages || 1) - 1
      );
      return Math.min(pageIndex, maxPageIndex) + 1; // Return 1-based page number
    },
    [effectiveSafeMode, totalPages]
  );

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

  useEffect(() => {
    const loadOffline = async () => {
      if (
        !isOnline &&
        currentNoteId &&
        (!annotations || annotations.length === 0)
      ) {
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

  const fetchFolders = useCallback(async () => {
    try {
      setIsLoadingFolders(true);
      const data = await offlineNotesService.getAllFolders();
      setFolders(Array.isArray(data) ? data : []);

      if (selectedFolderId) {
        const match = (Array.isArray(data) ? data : []).find(
          (f: any) => (f.id ?? f.localId)?.toString() === selectedFolderId
        );
        if (match) setFolderName(match.name);
      }
    } catch (e) {
      console.warn("Failed to load folders:", e);
      if (isOnline) {
        Alert.alert("Error", "Failed to load folders. Please try again.");
      }
    } finally {
      setIsLoadingFolders(false);
    }
  }, [selectedFolderId, isOnline]);

  useEffect(() => {
    if (showFolderModal) {
      fetchFolders();
    }
  }, [showFolderModal, fetchFolders]);

  const resetZoom = () => {
    if (
      currentZoom === 1 &&
      pdfTransform.translateX === 0 &&
      pdfTransform.translateY === 0
    )
      return;

    setCurrentZoom(1);
    setPdfTransform({ scale: 1, translateX: 0, translateY: 0 });
  };

  const handleZoomIn = () => {
    const newZoom = Math.min(currentZoom * 1.25, MAX_PDF_SCALE);
    if (newZoom === currentZoom) return; // Already at max zoom

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

    const maxOffsetX = (containerW * (newZoom - 1)) / 2;
    const maxOffsetY = (containerH * (newZoom - 1)) / 2;
    const clampedX = Math.max(-maxOffsetX, Math.min(maxOffsetX, newTranslateX));
    const clampedY = Math.max(-maxOffsetY, Math.min(maxOffsetY, newTranslateY));

    setCurrentZoom(newZoom);
    const next = { scale: newZoom, translateX: clampedX, translateY: clampedY };
    setPdfTransform((prev) => ({ ...prev, ...next }));
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

    const maxOffsetX = (containerW * (newZoom - 1)) / 2;
    const maxOffsetY = (containerH * (newZoom - 1)) / 2;
    const clampedX = Math.max(-maxOffsetX, Math.min(maxOffsetX, newTranslateX));
    const clampedY = Math.max(-maxOffsetY, Math.min(maxOffsetY, newTranslateY));

    setCurrentZoom(newZoom);
    const next = { scale: newZoom, translateX: clampedX, translateY: clampedY };
    setPdfTransform((prev) => ({ ...prev, ...next }));
    svScale.value = newZoom;
    svTranslateX.value = clampedX;
    svTranslateY.value = clampedY;
  };

  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: (evt) => {
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
      wasAutoHiddenRef.current = false;
      const touches = (evt.nativeEvent as any).touches || [];
      if (touches.length === 1 && selectedTool) {
        const touch = touches[0];
        const { locationX, locationY } = touch as any;

        if (selectedTool === "selection" || selectedTool === "textSelect") {
          return;
        } else if (selectedTool === "note" || selectedTool === "text") {
          const coords = screenToPDFCoordinates(locationX, locationY);
          setNotePosition({
            x: coords.normalizedX,
            y: coords.normalizedY,
            page: coords.actualPage,
          });
          setShowNoteModal(true);
        } else if (selectedTool === "highlight") {
          setIsDrawing(true);
          const now = Date.now();
          const p0svg = localToSvg(locationX, locationY);
          currentPointsRef.current = [
            { x: p0svg.x, y: p0svg.y, timestamp: now },
          ];
          currentScreenPointsRef.current = [
            { x: locationX, y: locationY, timestamp: now },
          ];
          lastRenderTimeRef.current = performance.now();
          pendingPathUpdateRef.current = false;
          const p0 = localToSvg(locationX, locationY);
          livePathRef.current = `M${p0.x.toFixed(2)},${p0.y.toFixed(2)}`;
          incLastPointRef.current = { x: p0.x, y: p0.y };
          incLastMidRef.current = null;
          currentPathRef.current = livePathRef.current;
          svLivePath.value = livePathRef.current;
          setCurrentPath(livePathRef.current);

          currentPointsRef.current.length = 0; // Clear
          currentPointsRef.current.push({
            x: p0svg.x,
            y: p0svg.y,
            timestamp: now,
          });
        } else {
          setIsDrawing(true);

          const now = Date.now();
          const p0svg2 = localToSvg(locationX, locationY);
          const initialPoint = { x: p0svg2.x, y: p0svg2.y, timestamp: now };
          currentPointsRef.current = [initialPoint];
          currentScreenPointsRef.current = [
            { x: locationX, y: locationY, timestamp: now },
          ];
          lastPointRef.current = initialPoint;
          const p0 = p0svg2;
          livePathRef.current = `M${p0.x.toFixed(2)},${p0.y.toFixed(2)}`;
          incLastPointRef.current = { x: p0.x, y: p0.y };
          incLastMidRef.current = null;

          lastRenderTimeRef.current = performance.now();
          pendingPathUpdateRef.current = false;
          pathCacheRef.current = "";
          pointsCountRef.current = 1;

          smoothingLevelRef.current =
            selectedTool === "pencil"
              ? 6
              : selectedTool === "pen"
              ? 8
              : selectedTool === "brush"
              ? 10
              : 8;

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
        const touch = touches[0];
        const { locationX, locationY } = touch as any;

        if (selectedTool === "textSelect") {
          return;
        } else if (
          selectedTool === "pen" ||
          selectedTool === "brush" ||
          selectedTool === "pencil" ||
          selectedTool === "highlight" ||
          selectedTool === "eraser"
        ) {
          const p = localToSvg(locationX, locationY);
          const newPoint = { x: p.x, y: p.y, timestamp: Date.now() };

          if (lastPointRef.current) {
            const dx = newPoint.x - lastPointRef.current.x;
            const dy = newPoint.y - lastPointRef.current.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance < 1.2) {
              return; // Skip this point to reduce processing
            }
          }

          currentPointsRef.current.push(newPoint);
          currentScreenPointsRef.current.push({
            x: locationX,
            y: locationY,
            timestamp: Date.now(),
          });
          lastPointRef.current = newPoint;

          if (USE_INCREMENTAL_SMOOTHING && incLastPointRef.current) {
            const prev = incLastPointRef.current;
            const midX = (prev.x + newPoint.x) / 2;
            const midY = (prev.y + newPoint.y) / 2;
            const lastMid = incLastMidRef.current;
            if (!lastMid) {
              livePathRef.current += ` L${midX.toFixed(2)},${midY.toFixed(2)}`;
            } else {
              livePathRef.current += ` Q${prev.x.toFixed(2)},${prev.y.toFixed(
                2
              )} ${midX.toFixed(2)},${midY.toFixed(2)}`;
            }
            incLastMidRef.current = { x: midX, y: midY };
            incLastPointRef.current = { x: newPoint.x, y: newPoint.y };

            const nowMs = Date.now();
            svLivePath.value = livePathRef.current;
            if (
              !lastSetTimeRef.current ||
              nowMs - lastSetTimeRef.current >= 33
            ) {
              currentPathRef.current = livePathRef.current;
              lastSetTimeRef.current = nowMs;
            }
          } else {
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
      if (isDrawing && currentPath && selectedTool) {
        if (
          USE_INCREMENTAL_SMOOTHING &&
          incLastPointRef.current &&
          incLastMidRef.current
        ) {
          const p = incLastPointRef.current;
          livePathRef.current += ` L${p.x.toFixed(2)},${p.y.toFixed(2)}`;
          currentPathRef.current = livePathRef.current;
          setCurrentPath(livePathRef.current);
        }
        const finalPath =
          currentPointsRef.current && currentPointsRef.current.length > 0
            ? convertPointsToSmoothedPath(
                currentPointsRef.current,
                Math.max(4, Math.min(12, smoothingLevelRef.current))
              )
            : currentPath;

        if (selectedTool === "highlight") {
          svLivePath.value = finalPath;
          addFreehandHighlight(finalPath);
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

        currentPointsRef.current.length = 0;
        currentScreenPointsRef.current.length = 0;
        lastPointRef.current = null;

        setIsDrawing(false);
        setCurrentPath("");
        svLivePath.value = "";
        currentPathRef.current = "";
        pathCacheRef.current = "";
        pointsCountRef.current = 0;

        incLastPointRef.current = null;
        incLastMidRef.current = null;

        if (animationFrameRef.current !== null) {
          cancelAnimationFrame(animationFrameRef.current);
          animationFrameRef.current = null;
          pendingPathUpdateRef.current = false;
        }
      }

      try {
        if (autoSave) {
          if (autoSaveTimeoutRef.current)
            clearTimeout(autoSaveTimeoutRef.current);
          autoSaveTimeoutRef.current = setTimeout(() => {
            handleSaveAnnotations();
          }, 500);
        }
      } catch {}

      gestureStartDistanceRef.current = 0;
      gestureStartTouchRef.current = { x: 0, y: 0 };

      if (wasAutoHiddenRef.current) {
        setTimeout(() => {
          setUiHidden(false);
          wasAutoHiddenRef.current = false;
        }, 150);
      }
    },

    onPanResponderTerminate: () => {
      gestureStartDistanceRef.current = 0;
      gestureStartTouchRef.current = { x: 0, y: 0 };

      if (isBboxDrawing) {
        setIsBboxDrawing(false);
        setBboxStart(null);
        setCurrentBbox(null);
      }

      if (wasAutoHiddenRef.current) {
        setTimeout(() => {
          setUiHidden(false);
          wasAutoHiddenRef.current = false;
        }, 150);
      }
    },
  });

  const screenToPDFCoordinates = (screenX: number, screenY: number) => {
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

    const displayW = containerW;
    const displayH = displayW * pageAspect;

    const offsetX = Math.max(0, (containerW - displayW) / 2);

    const pageSpacing = 10;

    const { scale, translateX, translateY } = pdfTransform;

    const untransformedX = (screenX - translateX) / scale;
    const untransformedY = effectiveSafeMode
      ? (screenY - translateY) / scale
      : (screenY + (pdfScrollOffset?.y || 0) - translateY) / scale;

    let actualPageIndex = 0;
    if (!effectiveSafeMode) {
      const pageWithSpacingHeight = displayH + pageSpacing;
      actualPageIndex = Math.max(
        0,
        Math.floor(untransformedY / pageWithSpacingHeight)
      );
      const maxPageIndex = Math.max(
        0,
        (totalPagesRef.current || totalPages || 1) - 1
      );
      actualPageIndex = Math.min(actualPageIndex, maxPageIndex);
    }

    const pageStartX = offsetX;
    const pageStartY = effectiveSafeMode
      ? 0
      : actualPageIndex * (displayH + pageSpacing);

    const pageX = untransformedX - pageStartX;
    const pageY = untransformedY - pageStartY;

    let normalizedX = pageX / displayW;
    let normalizedY = pageY / displayH;

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

  const pdfToScreenCoordinates = (normalizedX: number, normalizedY: number) => {
    const viewerWidth = containerSize.width || screenWidth;
    const viewerHeight = containerSize.height || screenHeight - 300;

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
    let actualPage = currentPageRef.current;
    if (currentPointsRef.current && currentPointsRef.current.length > 0) {
      const firstPoint = currentPointsRef.current[0];
      actualPage = getPageFromContentY(firstPoint.y);
      if (__DEV__) {
        console.log(
          `🖊️ Drawing on page ${actualPage} - First point Y: ${firstPoint.y.toFixed(
            2
          )}`
        );
      }
    }
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
    let actualPage = currentPageRef.current;
    if (currentPointsRef.current && currentPointsRef.current.length > 0) {
      const firstPoint = currentPointsRef.current[0];
      actualPage = getPageFromContentY(firstPoint.y);
      if (__DEV__) {
        console.log(
          `✨ Highlighting on page ${actualPage} - First point Y: ${firstPoint.y.toFixed(
            2
          )}`
        );
      }
    }
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

  const convertPathToNormalized = (
    path: string,
    targetPage?: number
  ): string => {
    const cleanPath = cleanPathFromPressure(path);

    const samplePathToPoints = (
      p: string,
      samplesPerSeg = 6
    ): { x: number; y: number }[] => {
      const pts: { x: number; y: number }[] = [];
      if (!p) return pts;

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
          const x1 = readNum();
          const y1 = readNum();
          const x = readNum();
          const y = readNum();
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

    let effectivePage: number;
    if (typeof targetPage === "number" && Number.isFinite(targetPage)) {
      effectivePage = targetPage;
    } else if (points.length > 0) {
      const pageWithSpacingHeight = displayH + pageSpacing;
      const calculatedPageIndex = Math.max(
        0,
        Math.floor(points[0].y / pageWithSpacingHeight)
      );
      const maxPageIndex = Math.max(
        0,
        (totalPagesRef.current || totalPages || 1) - 1
      );
      effectivePage = Math.min(calculatedPageIndex, maxPageIndex) + 1;
    } else {
      effectivePage = currentPageRef.current || 1;
    }

    const pageIndex = Math.max(0, effectivePage - 1);
    const pageStartY = effectiveSafeMode
      ? 0
      : pageIndex * (displayH + pageSpacing);

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

  const convertNormalizedPathToScreenForPage = useCallback(
    (path: string, page: number): string => {
      if (!path) return "";

      const { displayW, displayH, offsetX, pageSpacing } = getLayoutMetrics();
      const pageIndex = Math.max(0, (page || 1) - 1);
      const pageStartY = effectiveSafeMode
        ? 0
        : pageIndex * (displayH + pageSpacing);

      const cacheKey = `${path}|${page}|${displayW.toFixed(
        0
      )}|${displayH.toFixed(0)}|${currentZoom.toFixed(2)}`;

      if (pathConversionCache.current.has(cacheKey)) {
        return pathConversionCache.current.get(cacheKey)!;
      }

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

      if (pathConversionCache.current.size >= maxCacheSize) {
        const keysToDelete = Array.from(
          pathConversionCache.current.keys()
        ).slice(0, 100);
        keysToDelete.forEach((k) => pathConversionCache.current.delete(k));
      }
      pathConversionCache.current.set(cacheKey, svgPath);

      return svgPath;
    },
    [effectiveSafeMode, currentZoom]
  );

  const convertNormalizedPathToScreen = (
    path: string,
    page?: number
  ): string => {
    const targetPage =
      page && Number.isFinite(page) ? page : currentPageRef.current || 1;
    return convertNormalizedPathToScreenForPage(path, targetPage);
  };

  const scalePathForZoom = (path: string, scale: number): string => {
    return convertNormalizedPathToScreen(path);
  };

  const partialEraseAnnotations = (eraserPath: string) => {
    let actualErasePage = currentPageRef.current;
    if (currentPointsRef.current && currentPointsRef.current.length > 0) {
      const firstPoint = currentPointsRef.current[0];
      actualErasePage = getPageFromContentY(firstPoint.y);
    }
    const normalizedEraserPath = convertPathToNormalized(
      eraserPath,
      actualErasePage
    );
    const eraserPoints = getPathPoints(normalizedEraserPath);
    const eraseThreshold = Math.max(0.01, Math.min(0.15, eraserSize));

    const modifiedAnnotations = annotations
      .map((ann) => {
        if (ann.page !== actualErasePage) return ann; // Keep annotations from other pages
        if (!ann.path && !ann.x && !ann.y) return ann; // Keep annotations without position data

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

          if (remainingPoints.length > 1) {
            const newPath = reconstructPath(remainingPoints);
            return {
              ...ann,
              path: newPath,
              id: ann.id + "_modified_" + Date.now(), // Update ID to trigger re-render
            };
          } else {
            return null;
          }
        }

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

  const attemptToExtractTextFromPath = (path: string) => {
    setShowTextExtractionModal(true);
  };

  const getPathPoints = (path: string) => {
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
    const erased = annotations.filter((ann) => {
      if (ann.page !== currentPageRef.current) return true; // Keep annotations from other pages
      if (!ann.path && !ann.x && !ann.y) return true; // Keep annotations without position data

      if (ann.path) {
        return !isPathIntersecting(ann.path, eraserPath);
      }

      if (ann.x !== undefined && ann.y !== undefined) {
        return !isPointInEraserPath(ann.x, ann.y, eraserPath);
      }

      return true;
    });

    saveAnnotationsWithChanges(erased);
  };

  const isPathIntersecting = (path1: string, path2: string) => {
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

    if (actualPage < 1 || actualPage > (totalPagesRef.current || 1)) {
      console.error(
        `❌ Invalid page ${actualPage} for highlight (valid range: 1-${totalPagesRef.current})`
      );
      Alert.alert("Error", `Cannot add annotation: invalid page ${actualPage}`);
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

    if (actualPage < 1 || actualPage > (totalPagesRef.current || 1)) {
      console.error(
        `❌ Invalid page ${actualPage} for note (valid range: 1-${totalPagesRef.current})`
      );
      Alert.alert("Error", `Cannot add annotation: invalid page ${actualPage}`);
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

  const debugCoordinateConversion = () => {
    console.log("🧪 HORIZONTAL PAGING COORDINATE CONVERSION DEBUG TEST:");
    console.log("📊 Current state:", {
      totalPages,
      currentPage,
      containerSize,
      pdfPageDimensions,
      screenDimensions: { width: screenWidth, height: screenHeight },
    });

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

    const testPoints = [
      { x: 20, y: 20, desc: "top-left" },
      { x: screenWidth / 2, y: screenHeight / 4, desc: "top-center" },
      { x: screenWidth - 20, y: 20, desc: "top-right" },
      { x: screenWidth / 2, y: screenHeight / 2, desc: "center" },
      { x: 20, y: screenHeight - 100, desc: "bottom-left" },
      { x: screenWidth - 20, y: screenHeight - 100, desc: "bottom-right" },
    ];

    console.log(
      `🧪 Testing coordinate conversion on page ${currentPageRef.current}:`
    );
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

      const pdfAnnotations: PDFAnnotation[] = annotations.map((annotation) => ({
        ...annotation,
        type: annotation.type as PDFAnnotation["type"],
      }));

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

      debugCoordinateConversion();

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

      if (!result.savedPath) {
        throw new Error("Export completed but no file path was returned");
      }

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

        if (totalPages > 1) {
          console.log(
            `🔍 Multi-page export validation for ${totalPages} pages`
          );

          const minExpectedSize = totalPages * 5 * 1024; // 5KB minimum per page
          if (exportedSize < minExpectedSize) {
            console.warn(
              `⚠️ Multi-page PDF seems small: ${exportedSize} bytes for ${totalPages} pages`
            );
          }

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

      console.log("💾 Automatically saving exported PDF to Downloads");
      await onAfterExportSaved(result.savedPath);
    } catch (error) {
      console.error("Error exporting PDF to new file:", error);
      showErrorToast(
        `Export failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  };

  const exportToPDFDirect = async () => {
    try {
      showInfoToast("Updating original PDF...");

      const pdfAnnotations: PDFAnnotation[] = annotations.map((annotation) => ({
        ...annotation,
        type: annotation.type as PDFAnnotation["type"],
      }));

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

  const openInExternalApp = async (pdfPath: string) => {
    try {
      console.log("🌐 Attempting to open PDF in external app:", pdfPath);

      const fileInfo = await FileSystem.getInfoAsync(pdfPath);
      if (!fileInfo.exists) {
        Alert.alert("File Not Found", "The PDF file could not be found.");
        return;
      }

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

  const copyFilePathToClipboard = async (pdfPath: string) => {
    try {
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

  const trySaveToUserAccessibleLocation = async (
    sourcePath: string,
    fileName: string
  ) => {
    try {
      console.log("🔄 Attempting to save to user-accessible location...");

      const result = await savePDFToDownloads(sourcePath, fileName, false);

      if (result.success) {
        showSuccessToast("PDF saved to Downloads");
        return { success: true, location: "downloads" };
      } else {
        throw new Error(result.error || "Unknown error");
      }
    } catch (error) {
      console.warn("❌ Could not save to user-accessible location:", error);

      showErrorToast("Could not save to Downloads");

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

  const findExportedPDFs = async () => {
    return [];
  };

  const showExportedPDFs = async () => {
    Alert.alert("Export Function", "Only PDF export is available");
  };

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

  const deletePDF = async (pdf: any) => {
    try {
      await FileSystem.deleteAsync(pdf.path, { idempotent: true });
      Alert.alert("Deleted", `${pdf.name} has been deleted.`);
    } catch (error) {
      console.error("❌ Failed to delete PDF:", error);
      Alert.alert("Delete Failed", "Could not delete the PDF file.");
    }
  };

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

  const loadAnnotatedPDF = async (pdfPath: string) => {
    try {
      console.log("🔄 Loading annotated PDF into viewer:", pdfPath);

      const fileInfo = await FileSystem.getInfoAsync(pdfPath);
      if (!fileInfo.exists) {
        Alert.alert("File Not Found", "The PDF file could not be found.");
        return;
      }

      setCurrentSource({ uri: pdfPath });

      setAnnotations([]);
      await AsyncStorage.removeItem(`annotations_${pdfPath}`);

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
      const info = await FileSystem.getInfoAsync(pdfPath);
      if (!info.exists) {
        Alert.alert("File Not Found", "The annotated PDF could not be found.");
        return;
      }

      const originalName =
        pdfPath.split("/").pop() || fileName || "annotated.pdf";
      const ensuredName = /\.pdf$/i.test(originalName)
        ? originalName
        : `${originalName}.pdf`;
      const targetPath = `${FileSystem.cacheDirectory}${ensuredName}`;

      const existing = await FileSystem.getInfoAsync(targetPath);
      if (existing.exists) {
        try {
          await FileSystem.deleteAsync(targetPath, { idempotent: true });
        } catch {}
      }

      await FileSystem.copyAsync({ from: pdfPath, to: targetPath });

      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        Alert.alert(
          "Share Not Available",
          "Sharing is not available on this device."
        );
        return;
      }

      const shareOptions: any = {
        mimeType: "application/pdf",
        dialogTitle: "Share Annotated PDF",
      };

      if (Platform.OS === "ios") {
        shareOptions.UTI = "com.adobe.pdf";
      }

      await Sharing.shareAsync(targetPath, shareOptions);
    } catch (error) {
      console.error("Error sharing PDF:", error);
      Alert.alert(
        "Share Error",
        `Failed to share the PDF. ${
          error instanceof Error ? error.message : ""
        }`
      );
    }
  };

  const exportToJPEG = async () => {
    try {
      if (!pdfRef.current) {
        showErrorToast("Cannot access PDF document");
        return;
      }

      showInfoToast("Exporting current page...");

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

      const exportName = `${fileName.replace(/\.[^/.]+$/, "")}_page_${
        currentPageRef.current || 1
      }.jpg`;

      const result = await saveDrawingAsJPEG(captureUri, exportName, true);

      if (!result.success) {
        showErrorToast(result.error || "Could not export as JPEG");
      }
    } catch (err) {
      console.error("Error exporting to JPEG:", err);
      showErrorToast("Could not export to JPEG");
    }
  };

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

  const memoizedAnnotations = useMemo(() => {
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

    const { displayW, displayH, offsetX, pageSpacing, contentHeight } =
      getLayoutMetrics();

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
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          right: 0,
          height: contentHeight,
        }}
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
                  if (
                    !annotation.path &&
                    annotation.x === undefined &&
                    annotation.y === undefined
                  ) {
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
                            opacity={
                              typeof annotation.opacity === "number"
                                ? annotation.opacity
                                : Math.max(0.1, Math.min(1, highlightOpacity))
                            }
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
                            opacity={
                              typeof annotation.opacity === "number"
                                ? annotation.opacity
                                : Math.max(0.1, Math.min(1, highlightOpacity))
                            }
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
        {/* Drawing Strokes Layer (from drawing editor) */}
        {strokes &&
          Array.isArray(strokes) &&
          (() => {
            if (!strokes.length) return null;

            return strokes.map((stroke) => {
              const isNormalized = true;

              const displayPoints = (() => {
                const pg = Math.max(
                  1,
                  stroke.page || currentPageRef.current || 1
                );
                if (pg < startPage || pg > endPage)
                  return [] as { x: number; y: number }[];
                const pageIndex = Math.max(0, pg - 1);
                const stackedTop = pageIndex * (displayH + pageSpacing);
                const pageTop = effectiveSafeMode ? 0 : stackedTop;
                return (stroke.points || []).map((pt) => ({
                  x: (pt.x || 0) * displayW + offsetX,
                  y: (pt.y || 0) * displayH + pageTop,
                }));
              })();

              {
                /* Live in-progress stroke driven by Reanimated (always mounted) */
              }
              <>
                {/* Halo layers for better visibility */}
                <ReanimatedSvgPath animatedProps={liveHaloOuterProps as any} />
                <ReanimatedSvgPath animatedProps={liveHaloInnerProps as any} />
                {/* Main live path */}
                <ReanimatedSvgPath
                  animatedProps={livePathAnimatedProps as any}
                />
              </>;
              const simplified = simplifyPoints(displayPoints, 300);

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
              if (selectedTool === "highlight")
                liveOpacity = Math.max(0.1, Math.min(1, highlightOpacity));
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
          }
          return null;
        })()}

        {isDrawing &&
          currentPath &&
          (() => {
            const smoothedLivePath =
              pathCacheRef.current || currentPathRef.current || currentPath;
            const factor = scaleStrokesWithZoom ? currentZoom || 1 : 1;
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
      {/* AI action is available under the More (⋮) menu */}
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
                pdfScrollRef.current = ref as any;
              }}
            >
              {/* PDF and Annotation Transform Container (Reanimated host) */}
              <AnimatedRe.View
                style={[styles.pdfTransformContainer, { flex: 1 }]}
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
                        const { x, y, width, height } =
                          event.nativeEvent.layout;
                        if (width && height) {
                          setContainerSize({ width, height });
                          setPdfViewerBounds({ width, height });
                          setPdfContainerLayout({ x, y, width, height });
                          svContainerW.value = width;
                          svContainerH.value = height;
                          try {
                            requestAnimationFrame(() => {
                              (
                                transformContainerRef.current as any
                              )?.measureInWindow?.(
                                (
                                  absX: number,
                                  absY: number,
                                  w: number,
                                  h: number
                                ) => {
                                  containerWindowOffsetRef.current = {
                                    left: absX,
                                    top: absY,
                                    width: w,
                                    height: h,
                                  };
                                }
                              );
                            });
                          } catch {}
                        }
                      }}
                      style={[{ flex: 1 }, pdfAnimatedStyle]}
                    >
                      {(() => {
                        const { contentHeight, displayH, pageSpacing } =
                          getLayoutMetrics();
                        if (effectiveSafeMode) {
                          const pageToShow =
                            currentPageRef.current || displayCurrentPage || 1;
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
                                  <MaterialIcons
                                    name="description"
                                    size={64}
                                    color="#9CA3AF"
                                  />
                                  <Text style={styles.webPdfText}>
                                    PDF viewing not supported on web
                                  </Text>
                                  <Text style={styles.webPdfSubtext}>
                                    Please use the mobile app to view and
                                    annotate PDFs
                                  </Text>
                                </View>
                              )}
                              {/* Annotation Layer - current page only */}
                              <View
                                style={{
                                  position: "absolute",
                                  left: 0,
                                  top: 0,
                                  right: 0,
                                  height: displayH,
                                  zIndex: 10,
                                }}
                                pointerEvents="box-none"
                              >
                                {renderAnnotations()}
                              </View>
                              {/* Gesture capture overlay - only active when NOT drawing */}
                              {(!isEditMode || selectedTool === null) && (
                                <GestureDetector gesture={combinedGesture}>
                                  <View
                                    pointerEvents="auto"
                                    style={{
                                      position: "absolute",
                                      left: 0,
                                      top: 0,
                                      right: 0,
                                      height: displayH,
                                      zIndex: 9998,
                                      backgroundColor: "transparent",
                                    }}
                                    collapsable={false}
                                  />
                                </GestureDetector>
                              )}
                              {/* Drawing overlay - only active when drawing tool selected */}
                              {isEditMode && selectedTool !== null && (
                                <View
                                  pointerEvents="auto"
                                  style={{
                                    position: "absolute",
                                    left: 0,
                                    top: 0,
                                    right: 0,
                                    height: displayH,
                                    zIndex: 9999,
                                    backgroundColor: "transparent",
                                  }}
                                  collapsable={false}
                                  {...panResponder.panHandlers}
                                />
                              )}
                            </View>
                          );
                        }

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
                                ? !shouldCaptureGestures && !isPinching
                                : !shouldCaptureGestures &&
                                  !isPinching &&
                                  (selectedTool === null ||
                                    selectedTool === "selection")
                            }
                            onScroll={(e) => {
                              const y = e.nativeEvent.contentOffset.y;
                              if (pdfScrollOffset.y !== y)
                                setPdfScrollOffset({ x: 0, y });
                              const denom = displayH + pageSpacing;
                              const approx = Math.max(
                                1,
                                Math.min(
                                  totalPagesRef.current || totalPages || 1,
                                  Math.floor((y + displayH * 0.5) / denom) + 1
                                )
                              );
                              if (approx !== currentPageRef.current) {
                                currentPageRef.current = approx;
                                if (displayCurrentPage !== approx)
                                  setDisplayCurrentPage(approx);
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
                                    style={{
                                      width: "100%",
                                      height: contentHeight,
                                    }}
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
                                    onPageChanged={(
                                      page: number,
                                      pageCount: number
                                    ) => {
                                      currentPageRef.current = page;
                                      if (pageCount !== totalPagesRef.current) {
                                        totalPagesRef.current = pageCount;
                                        if (displayTotalPages !== pageCount)
                                          setDisplayTotalPages(pageCount);
                                      }
                                    }}
                                  />
                                </>
                              ) : (
                                <View style={styles.webPdfPlaceholder}>
                                  <MaterialIcons
                                    name="description"
                                    size={64}
                                    color="#9CA3AF"
                                  />
                                  <Text style={styles.webPdfText}>
                                    PDF viewing not supported on web
                                  </Text>
                                  <Text style={styles.webPdfSubtext}>
                                    Please use the mobile app to view and
                                    annotate PDFs
                                  </Text>
                                </View>
                              )}
                              <View
                                style={{
                                  position: "absolute",
                                  left: 0,
                                  top: 0,
                                  right: 0,
                                  height: contentHeight,
                                  zIndex: 10,
                                }}
                                pointerEvents="box-none"
                              >
                                {renderAnnotations()}
                              </View>
                              {/* Gesture capture overlay - only active when NOT drawing */}
                              {(!isEditMode || selectedTool === null) && (
                                <GestureDetector gesture={combinedGesture}>
                                  <View
                                    pointerEvents="auto"
                                    style={{
                                      position: "absolute",
                                      left: 0,
                                      top: 0,
                                      right: 0,
                                      height: contentHeight,
                                      zIndex: 9998,
                                      backgroundColor: "transparent",
                                    }}
                                    collapsable={false}
                                  />
                                </GestureDetector>
                              )}
                              {/* Drawing overlay - only active when drawing tool selected */}
                              {isEditMode && selectedTool !== null && (
                                <View
                                  pointerEvents="auto"
                                  style={{
                                    position: "absolute",
                                    left: 0,
                                    top: 0,
                                    right: 0,
                                    height: contentHeight,
                                    zIndex: 9999,
                                    backgroundColor: "transparent",
                                  }}
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
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
            >
              <TouchableOpacity
                style={styles.floatingPageButton}
                activeOpacity={0.7}
                onPress={() => {
                  const target = Math.max(1, (currentPageRef.current || 1) - 1);
                  currentPageRef.current = target;
                  setDisplayCurrentPage(target);
                  if (!effectiveSafeMode) {
                    const { displayH, pageSpacing } = getLayoutMetrics();
                    const y = Math.max(
                      0,
                      (target - 1) * (displayH + pageSpacing)
                    );
                    (pdfScrollRef.current as any)?.scrollTo?.({
                      y,
                      animated: true,
                    });
                  }
                }}
                disabled={(currentPageRef.current || 1) <= 1}
              >
                <MaterialIcons
                  name="chevron-left"
                  size={20}
                  color={
                    (currentPageRef.current || 1) <= 1 ? "#9CA3AF" : "#374151"
                  }
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
                      const y = Math.max(
                        0,
                        (num - 1) * (displayH + pageSpacing)
                      );
                      (pdfScrollRef.current as any)?.scrollTo?.({
                        y,
                        animated: true,
                      });
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
                    const y = Math.max(
                      0,
                      (target - 1) * (displayH + pageSpacing)
                    );
                    (pdfScrollRef.current as any)?.scrollTo?.({
                      y,
                      animated: true,
                    });
                  }
                }}
                disabled={
                  (displayTotalPages || 1) <= (currentPageRef.current || 1)
                }
              >
                <MaterialIcons
                  name="chevron-right"
                  size={20}
                  color={
                    (displayTotalPages || 1) <= (currentPageRef.current || 1)
                      ? "#9CA3AF"
                      : "#374151"
                  }
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
                  <MaterialIcons
                    name="check-circle"
                    size={20}
                    color="#8B5CF6"
                  />
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
                  <Text style={{ color: "#6B7280", marginTop: 8 }}>
                    Loading folders...
                  </Text>
                </View>
              ) : (
                (folders || [])
                  .filter((f: any) =>
                    folderFilter
                      ? f.name
                          ?.toLowerCase?.()
                          .includes(folderFilter.toLowerCase())
                      : true
                  )
                  .map((folder: any) => {
                    const selected =
                      selectedFolderId?.toString() === folder.id?.toString();
                    return (
                      <TouchableOpacity
                        key={folder.id}
                        style={[
                          styles.folderCard,
                          selected && styles.selectedFolderCard,
                        ]}
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
                          <Text style={styles.folderCardTitle}>
                            {folder.name}
                          </Text>
                          {!!folder.note_count && (
                            <Text style={styles.folderCardSubtitle}>
                              {folder.note_count}{" "}
                              {folder.note_count === 1 ? "item" : "items"}
                            </Text>
                          )}
                        </View>
                        {selected && (
                          <MaterialIcons
                            name="check-circle"
                            size={20}
                            color="#8B5CF6"
                          />
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
            {/* Ask Rina (New Chat) */}
            <TouchableOpacity
              style={styles.moreMenuItem}
              onPress={() => {
                setShowMoreMenu(false);
                Alert.alert(
                  "Summarize with AI?",
                  "You'll be redirected to the AI chatbot to summarize. You may need to upload the file again.",
                  [
                    { text: "Cancel", style: "cancel" },
                    {
                      text: "Proceed",
                      style: "default",
                      onPress: () => {
                        try {
                          navigation.navigate(
                            "RINA",
                            {
                              source: "pdf_annotation",
                              intent: "summarize",
                              newChat: true,
                              pdfUri: (currentSource?.uri || source?.uri),
                              pdfName: fileName,
                            } as any
                          );
                        } catch (e) {
                          setShowAIModal(true);
                          Animated.timing(aiModalAnimation, {
                            toValue: 1,
                            duration: 300,
                            useNativeDriver: true,
                          }).start();
                        }
                      },
                    },
                  ]
                );
              }}
              activeOpacity={0.8}
            >
              <MaterialIcons name="smart-toy" size={20} color="#8B5CF6" />
              <Text style={[styles.moreMenuText, { color: "#8B5CF6" }]}>Ask Rina (New Chat)</Text>
            </TouchableOpacity>
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
                  onPress={() => {
                    if (aiMessage.trim() === "") return;

                    const userMessage = aiMessage.trim();
                    setChatMessages((prev) => [
                      ...prev,
                      { type: "user", text: userMessage },
                    ]);

                    setAiMessage("");

                    setTimeout(() => {
                      const aiResponse = `I understand your query about "${userMessage.substring(
                        0,
                        20
                      )}${
                        userMessage.length > 20 ? "..." : ""
                      }". Let me analyze this document further.`;
                      setChatMessages((prev) => [
                        ...prev,
                        { type: "ai", text: aiResponse },
                      ]);
                    }, 1000);
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
                    (!rinaQuery.trim() || !selectedText.trim()) &&
                      styles.rinaModalSubmitButtonDisabled,
                  ]}
                  onPress={() => {
                    const fullQuery =
                      rinaQuery.trim() ||
                      `Explain this text: "${selectedText}"`;
                    console.log("Navigating to RINA with:", {
                      query: fullQuery,
                      selectedText,
                    });

                    navigation.navigate("RINA", {
                      initialQuery: fullQuery,
                      contextText: selectedText,
                      source: "pdf_annotation",
                      pdfUri: (currentSource?.uri || source?.uri),
                      pdfName: fileName,
                      newChat: true,
                    } as any);

                    handleRinaModalClose();
                  }}
                  disabled={!rinaQuery.trim() || !selectedText.trim()}
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
                    setShowTextPreviewModal(false);

                    setSelectedText(previewExtractedText);
                    setRinaQuery("Explain this text:");
                    setShowAskRinaModal(true);

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

  pdfScrollView: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  pdfScrollContent: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: "100%",
  },

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

  pdfCanvasContainer: {
    flex: 1,
    backgroundColor: "#F3F4F6", // subtle background behind PDF and annotations
    overflow: "hidden",
    width: "100%",
    height: "100%",
  },
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
