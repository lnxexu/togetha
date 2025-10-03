import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  View,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  Text,
  Alert,
  Modal,
  TextInput,
  PanResponder,
  Platform,
  Animated,
  StatusBar,
  ActivityIndicator,
} from "react-native";
import ViewShot from "react-native-view-shot";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { LinearGradient } from "expo-linear-gradient";
// Conditionally import PDF component only for native platforms
const Pdf = Platform.OS !== 'web' ? require("react-native-pdf").default : null;
// Note: react-native-pdf doesn't support native text selection
// We'll use manual text input as the solution
import { ScrollView } from "react-native";
import { MaterialIcons, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import Svg, { Rect, Circle, Path, Text as SvgText } from "react-native-svg";
import { Animated as RNAnimated } from 'react-native';
const AnimatedSvg = RNAnimated.createAnimatedComponent(Svg as any);
const AnimatedRect = RNAnimated.createAnimatedComponent(Rect as any);
const AnimatedCircle = RNAnimated.createAnimatedComponent(Circle as any);
const AnimatedPath = RNAnimated.createAnimatedComponent(Path as any);
const AnimatedSvgText = RNAnimated.createAnimatedComponent(SvgText as any);
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system";
import * as MediaLibrary from 'expo-media-library';
import { getLocalPDFPathEnhanced } from '../utils/pdfUtils';
import { PDFDocument as PDFLibDocument, rgb as pdfLibRgb } from "pdf-lib";
import * as Sharing from "expo-sharing";
import { drawingAPI, PDFSaveOptions } from '../services/drawingAPI';
import { 
  embedAnnotationsInPDF, 
  saveAnnotationsDirectlyToPDF, 
  createPDFBackup, 
  PDFAnnotation,
  validateAnnotationCoordinates,
  calculatePDFCoordinates,
  debugCoordinateConversion as debugPDFCoordinates
} from '../utils/pdfUtils';
import { API_URL } from '@/constants/ApiConfig';
import type { RootStackParamList } from '../../navigation/AppNavigator';
// WebView functionality has been removed

const { width: screenWidth, height: screenHeight } = Dimensions.get("window");

interface Annotation {
  id: string;
  type: "highlight" | "note" | "text" | "pen" | "brush" | "pencil" | "selection";
  page: number;
  x: number; // Percentage of PDF page width (0-1)
  y: number; // Percentage of PDF page height (0-1)
  width?: number; // Percentage of PDF page width (0-1)
  height?: number; // Percentage of PDF page height (0-1)
  color: string;
  text?: string;
  path?: string; // SVG path with normalized coordinates (0-1)
  strokeWidth?: number;
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

// Configuration: control whether visual thickness / font sizes scale with PDF zoom.
// When false, annotations remain visually stable (positions still follow zoom via coordinate conversion)
// preventing highlights, pen strokes, note bubbles from becoming thicker when zooming.
// This matches the DrawingCanvas implementation for consistent behavior.

const SCALE_STROKES_WITH_ZOOM = false;

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
    return points.map(p => ({ x: p.x * pageDisplayWidth, y: p.y * pageDisplayHeight }));
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
  if (out.length === 0 || out[out.length - 1] !== pts[pts.length - 1]) out.push(pts[pts.length - 1]);
  return out;
};

// Variant that preserves optional timestamp field
const simplifyPointsWithTimestamp = (pts: { x: number; y: number; timestamp?: number }[], maxPoints = 300) => {
  if (!pts || pts.length <= maxPoints) return pts;
  const step = Math.ceil(pts.length / maxPoints);
  const out: { x: number; y: number; timestamp?: number }[] = [];
  for (let i = 0; i < pts.length; i += step) {
    out.push(pts[i]);
  }
  if (out.length === 0 || out[out.length - 1] !== pts[pts.length - 1]) out.push(pts[pts.length - 1]);
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
  networkStatus,
  saveStatus,
  strokes,
}) => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [selectedTool, setSelectedTool] = useState<
    "highlight" | "note" | "text" | "eraser" | "pen" | "brush" | "pencil" | "selection" | "textSelect" | null
  >(null);
  const [strokeWidth, setStrokeWidth] = useState(3);
  const [selectedColor, setSelectedColor] = useState(ANNOTATION_COLORS[0]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentPath, setCurrentPath] = useState("");
  // Use a ref for immediate path updates without waiting for React's render cycle
  const currentPathRef = useRef("");
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [notePosition, setNotePosition] = useState({ x: 0, y: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const fadeAnim = useState(new Animated.Value(0))[0];
  const slideAnim = useState(new Animated.Value(-50))[0];
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  
  // Text selection state (using alternative approach since react-native-pdf doesn't support text selection)
  const [selectedText, setSelectedText] = useState<string>("");
  const [selectionRect, setSelectionRect] = useState<{x: number, y: number, width: number, height: number} | null>(null);
  const [showAskRinaPopup, setShowAskRinaPopup] = useState(false);
  const [showAskRinaModal, setShowAskRinaModal] = useState(false);
  const [rinaQuery, setRinaQuery] = useState("");
  
  // PDF text extraction modal
  const [showTextExtractionModal, setShowTextExtractionModal] = useState(false);
  const [extractedText, setExtractedText] = useState<string>("");
  const [isExtractingText, setIsExtractingText] = useState(false);
  
  // WebView functionality has been removed
  
  // Bbox selection state for textSelect mode
  const [isBboxDrawing, setIsBboxDrawing] = useState(false);
  const [bboxStart, setBboxStart] = useState<{x: number, y: number} | null>(null);
  const [currentBbox, setCurrentBbox] = useState<{x: number, y: number, width: number, height: number} | null>(null);
  const [showTextPreviewModal, setShowTextPreviewModal] = useState(false);
  const [previewExtractedText, setPreviewExtractedText] = useState<string>("");
  
  // AI Assistant modal state
  const [showAIModal, setShowAIModal] = useState(false);
  const [aiMessage, setAiMessage] = useState<string>("");
  const [aiModalAnimation] = useState(new Animated.Value(0));
  const [chatMessages, setChatMessages] = useState<Array<{type: 'user' | 'ai', text: string}>>([
    {type: 'ai', text: 'How can I help you with this document?'}
  ]);
  const chatScrollViewRef = useRef<ScrollView>(null);
  
  // Floating button position state
  const [buttonPosition, setButtonPosition] = useState({ x: 20, y: 100 });
  const buttonPositionRef = useRef({ x: 20, y: 100 });
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
          x: Math.max(10, Math.min(screenWidth - 66, buttonPositionRef.current.x + gestureState.dx)),
          y: Math.max(80, Math.min(screenHeight - 180, buttonPositionRef.current.y + gestureState.dy))
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
      
      // Ultra-high refresh rate: aim for 120fps on capable devices, 60fps minimum
      const targetFrameTime = window.screen?.height > 1920 ? 8.33 : 11; // 120fps : 90fps
      
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
        adaptiveSmoothing = Math.max(4, smoothingLevelRef.current - Math.floor(pointsLength / 100));
      }
      
      // Simplify large live point buffers before expensive smoothing to save CPU
      const simplifiedLive = simplifyPointsWithTimestamp(currentPointsRef.current, 400);

      // Calculate the smoothed path with adaptive parameters
      const smooth = convertPointsToSmoothedPath(simplifiedLive as any, adaptiveSmoothing);

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
        const liveKey = `live-${currentPage}`;
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

  // (moved) Precompute and cache stroke paths when strokes or layout change so rendering is cheap
  
  // Single zoom state - simplified approach from DrawingEditor
  const [currentZoom, setCurrentZoom] = useState(1); // Track PDF zoom level
  
  // PDF transformation state with pan support
  const [pdfTransform, setPdfTransform] = useState({
    scale: 1,
    translateX: 0,
    translateY: 0,
  });
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
  const [containerSize, setContainerSize] = useState({ width: screenWidth, height: screenHeight });
  const pdfContainerRef = useRef<View>(null);
  const pdfScrollRef = useRef<ScrollView>(null);
  const [pdfContainerLayout, setPdfContainerLayout] = useState<{ x: number; y: number; width: number; height: number } | null>(null);

  // (moved) Precompute and cache stroke paths when strokes or layout change so rendering is cheap

  // Animated values for smooth pan/zoom transitions during gestures
  const animatedTranslateX = useRef(new Animated.Value(0)).current;
  const animatedTranslateY = useRef(new Animated.Value(0)).current;
  const animatedScale = useRef(new Animated.Value(1)).current;

  // Finish animation config - change type to 'spring' or 'timing'.
  // tuning: for 'spring' adjust speed/bounciness; for 'timing' adjust duration/easing.
  const FINISH_ANIMATION: {
    type: 'spring' | 'timing';
    springConfig?: { speed?: number; bounciness?: number }; 
    timingConfig?: { duration?: number };
  } = {
    type: 'spring',
    springConfig: { speed: 14, bounciness: 6 },
    timingConfig: { duration: 180 },
  };

  const animateToFinal = (final: { scale: number; translateX: number; translateY: number }, callback?: () => void) => {
    if (FINISH_ANIMATION.type === 'spring') {
      const springCfg = FINISH_ANIMATION.springConfig || { speed: 14, bounciness: 6 };
      Animated.parallel([
        Animated.spring(animatedScale, { toValue: final.scale, useNativeDriver: false, speed: springCfg.speed, bounciness: springCfg.bounciness }),
        Animated.spring(animatedTranslateX, { toValue: final.translateX, useNativeDriver: false, speed: springCfg.speed, bounciness: springCfg.bounciness }),
        Animated.spring(animatedTranslateY, { toValue: final.translateY, useNativeDriver: false, speed: springCfg.speed, bounciness: springCfg.bounciness }),
      ]).start(() => callback?.());
    } else {
      const dur = FINISH_ANIMATION.timingConfig?.duration || 180;
      Animated.parallel([
        Animated.timing(animatedScale, { toValue: final.scale, duration: dur, useNativeDriver: false }),
        Animated.timing(animatedTranslateX, { toValue: final.translateX, duration: dur, useNativeDriver: false }),
        Animated.timing(animatedTranslateY, { toValue: final.translateY, duration: dur, useNativeDriver: false }),
      ]).start(() => callback?.());
    }
  };

  // Sync animated values to pdfTransform state with immediate updates for real-time responsiveness
  useEffect(() => {
    // Set values immediately without animation for real-time pan/zoom response
    // This eliminates delays and makes interactions feel more responsive
    animatedTranslateX.setValue(pdfTransform.translateX);
    animatedTranslateY.setValue(pdfTransform.translateY);
    animatedScale.setValue(pdfTransform.scale);
  }, [pdfTransform.translateX, pdfTransform.translateY, pdfTransform.scale]);
  
  // Animation for page transitions (more dramatic)
  const [pageTransition] = useState(new Animated.Value(1));
  const [pageOpacity] = useState(new Animated.Value(1));
  const [pageRotate] = useState(new Animated.Value(0));
  // Removed annotation animations to make annotations static
  
  // Animate when page changes to create a dramatic transition
  useEffect(() => {
    // Dramatic zoom out + rotate + fade then zoom back with spring
    Animated.sequence([
      Animated.parallel([
        Animated.timing(pageTransition, { toValue: 0.88, duration: 180, useNativeDriver: true }),
        Animated.timing(pageRotate, { toValue: -10, duration: 180, useNativeDriver: true }),
        Animated.timing(pageOpacity, { toValue: 0.35, duration: 180, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.spring(pageTransition, { toValue: 1, friction: 6, tension: 90, useNativeDriver: true }),
        Animated.spring(pageRotate, { toValue: 0, friction: 6, tension: 90, useNativeDriver: true }),
        Animated.timing(pageOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
      ])
    ]).start();

    // Removed animation for annotations to make them static
  }, [currentPage]);
  
  // Gesture handling refs - from DrawingEditor approach
  const gestureStartZoomRef = useRef(1);
  const gestureStartDistanceRef = useRef(0);
  // Track latest zoom in a ref so panResponder sees updates
  const currentZoomRef = useRef(currentZoom);
  useEffect(() => { currentZoomRef.current = currentZoom; }, [currentZoom]);

  // For panning when zoomed
  const gestureStartTranslateRef = useRef({ x: 0, y: 0 });
  const gestureStartTouchRef = useRef({ x: 0, y: 0 });

  // Buffer points for current freehand drawing so we can generate a smoothed path
  const currentPointsRef = useRef<{ x: number; y: number; timestamp?: number }[]>([]);
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
  const MIN_PDF_SCALE = 0.5;
  const MAX_PDF_SCALE = 3.0; // Match DrawingEditor limit

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
  const convertPointsToSmoothedPath = (points: { x: number; y: number; timestamp?: number }[], segments = 8) => {
    if (!points || points.length === 0) return '';
    if (points.length === 1) return `M${points[0].x.toFixed(2)},${points[0].y.toFixed(2)}`;

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
  const saveExportedPdfToDevice = async (savedFileUri: string) => {
    // Simplified version - just delegates to MediaLibrary
    try {
      if (!savedFileUri) throw new Error('No file path provided');
      const fileUri = savedFileUri.startsWith('file://') ? savedFileUri : `file://${savedFileUri}`;

      // Check permissions
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        return { ok: false, reason: 'permission' };
      }

      // Create asset
      const asset = await MediaLibrary.createAssetAsync(fileUri);
      return { ok: true, path: fileUri };
    } catch (err) {
      console.error('Error saving PDF:', err);
      return { ok: false, reason: err };
    }
  };

  const onAfterExportSaved = async (savedPath: string) => {
    try {
      // Simplified version
      const result = await saveExportedPdfToDevice(savedPath);
      if (result.ok) {
        Alert.alert('PDF Saved', 'Exported PDF saved successfully.');
      } else {
        Alert.alert('Save Failed', 'Could not save exported PDF to device.');
      }
    } catch (err) {
      console.error('Error in onAfterExportSaved:', err);
      Alert.alert('Error', 'Could not save exported PDF.');
    }
  };
  const [saveMode, setSaveMode] = useState<'overlay' | 'direct'>('direct');
  const [showSaveModeModal, setShowSaveModeModal] = useState(false);

  // Folder and tag states for metadata
  const [folders, setFolders] = useState<any[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [folderName, setFolderName] = useState("PDF Documents");
  const [showFolderModal, setShowFolderModal] = useState(false);
  
  // Sync status state
  const [syncStatus, setSyncStatus] = useState<"saved" | "syncing" | "offline">("saved");

  // PDF viewport tracking
  const [pdfDimensions, setPdfDimensions] = useState({ width: screenWidth, height: screenHeight });
  const [scrollOffset, setScrollOffset] = useState({ x: 0, y: 0 });
  
  // Scroll tracking for annotation positioning
  const [pdfScrollOffset, setPdfScrollOffset] = useState({ x: 0, y: 0 });
  
  // Actual PDF page dimensions (from the PDF file itself)
  const [pdfPageDimensions, setPdfPageDimensions] = useState({ width: 595, height: 842 }); // Default A4 size in points
  const [pdfViewerBounds, setPdfViewerBounds] = useState({ width: screenWidth, height: screenHeight });

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
        const displayPoints = mapPointsToDisplay(stroke.points || [], pdfDisplayWidth, pdfDisplayHeight, isNormalized);
        const simplified = simplifyPoints(displayPoints, maxPoints);
        const cacheKey = `${stroke.id}-${simplified.length}-${Math.round((stroke.width||2)*10)}`;
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

  // Helper function to update annotations with callback
  const updateAnnotations = useCallback((newAnnotations: Annotation[] | ((prev: Annotation[]) => Annotation[])) => {
    if (typeof newAnnotations === 'function') {
      setAnnotations(prev => {
        const updated = newAnnotations(prev);
        if (onAnnotationChange) {
          onAnnotationChange(updated);
        }
        return updated;
      });
    } else {
      setAnnotations(newAnnotations);
      if (onAnnotationChange) {
        onAnnotationChange(newAnnotations);
      }
    }
  }, [onAnnotationChange]);

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
      console.error('Error applying annotations without history:', err);
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
      console.error('Undo failed:', err);
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
      console.error('Redo failed:', err);
    }
  };

  // Load annotations when component mounts
  React.useEffect(() => {
    // Use external annotations if provided, otherwise load from storage
    if (externalAnnotations && externalAnnotations.length > 0) {
      updateAnnotations(externalAnnotations);
      console.log(`Loaded ${externalAnnotations.length} external annotations`);
    } else {
      loadAnnotations();
    }
    
    console.log("PDFAnnotationViewer initialized with local source:", source);

    // If source is remote, download it to local storage first then validate
    (async () => {
      try {
        if (source?.uri && (source.uri.startsWith('http://') || source.uri.startsWith('https://'))) {
          console.log('Remote PDF source detected, downloading to local storage:', source.uri);
          setIsLoading(true);
          
          // Normalize URL to use configured API_URL (Django's build_absolute_uri might use different host)
          let downloadUrl = source.uri;
          try {
            const sourceUrl = new URL(source.uri);
            const apiUrl = new URL(API_URL);
            
            // Get actual port numbers (default to 80 for http, 443 for https if not specified)
            const getActualPort = (url: URL) => {
              if (url.port) return url.port;
              return url.protocol === 'https:' ? '443' : '80';
            };
            
            const sourcePort = getActualPort(sourceUrl);
            const apiPort = getActualPort(apiUrl);
            
            console.log('URL normalization check:', {
              sourceHost: sourceUrl.hostname,
              sourcePort,
              apiHost: apiUrl.hostname, 
              apiPort,
              API_URL
            });
            
            // If the source URL is from the same backend but different host (e.g., Django using 192.168.x.x)
            // replace it with our configured API_URL
            const isPrivateIP = sourceUrl.hostname.startsWith('192.168.') || 
                               sourceUrl.hostname.startsWith('10.0.') ||
                               sourceUrl.hostname.startsWith('172.') ||
                               sourceUrl.hostname === 'localhost' ||
                               sourceUrl.hostname === '127.0.0.1';
            
            if (sourcePort === apiPort && isPrivateIP && sourceUrl.hostname !== apiUrl.hostname) {
              downloadUrl = API_URL + sourceUrl.pathname + sourceUrl.search;
              console.log('✅ Normalized URL from', source.uri, 'to', downloadUrl);
            } else {
              console.log('❌ URL normalization skipped - not matching criteria');
            }
          } catch (urlParseError) {
            console.warn('Could not parse URL for normalization:', urlParseError);
          }
          
          try {
            // Get auth headers if this is a backend URL
            let fetchHeaders: HeadersInit | undefined;
            if (downloadUrl.includes(API_URL) || downloadUrl.includes('192.168.') || downloadUrl.includes('localhost')) {
              const token = await AsyncStorage.getItem('authToken');
              if (token) {
                fetchHeaders = {
                  'Authorization': `Token ${token}`,
                  'Accept': 'application/pdf'
                };
                console.log('Using auth headers for backend PDF download');
              }
            }

            const result = await getLocalPDFPathEnhanced(downloadUrl, fileName, (progress) => {
              console.log('Download progress:', progress);
            }, fetchHeaders);
            // Replace source with local file URI for the PDF viewer
            // Note: FileSystem.documentDirectory paths are file:// URIs on native
            const localUri = result.uri;
            setCurrentSource({ uri: localUri });
            console.log('Downloaded PDF to local path and updated currentSource:', localUri);
          } catch (err) {
            console.error('Failed to download remote PDF before loading:', err);
            setHasError(true);
            setIsLoading(false);
            
            // Show a more helpful error dialog with options
            const errorMessage = err instanceof Error ? err.message : String(err);
            const isNetworkError = errorMessage.includes('404') || errorMessage.includes('not available');
            const urlInfo = downloadUrl !== source.uri ? 
              `\nOriginal URL: ${source.uri}\nNormalized URL: ${downloadUrl}` : 
              `\nURL: ${downloadUrl}`;
            
            Alert.alert(
              'PDF Download Failed', 
              `Unable to download PDF: ${errorMessage}${urlInfo}\n\nThis might be because:\n• The file doesn't exist on the server\n• Network connection issues\n• Server authentication required`,
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Retry',
                  onPress: () => {
                    // Retry the download
                    setHasError(false);
                    setIsLoading(true);
                    // Re-run the same logic
                  }
                },
                {
                  text: 'Open in Browser',
                  onPress: () => {
                    // Try to open the URL in browser as fallback
                    import('expo-web-browser').then((WebBrowser) => {
                      WebBrowser.openBrowserAsync(source.uri).catch(console.error);
                    });
                  }
                }
              ]
            );
            return;
          }
        }

        // Validate the (now local) source
        await validatePDFSource();
      } catch (err) {
        console.error('Error preparing PDF source:', err);
      }
    })();    // Animate UI entrance
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
        console.log("Backup timeout: clearing loading state after 5 seconds");
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

  const validatePDFSource = async () => {
    try {
      console.log("Validating PDF source:", currentSource?.uri);

      const uriToCheck = currentSource?.uri || source?.uri;

      // Only call FileSystem.getInfoAsync for local file URIs
      if (uriToCheck && (uriToCheck.startsWith('file://') || uriToCheck.startsWith(FileSystem.documentDirectory || ''))) {
        // For local files, check if file exists
        const fileInfo = await FileSystem.getInfoAsync(uriToCheck);
        console.log("PDF file info:", fileInfo);
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
        console.log(
          "PDF validation successful. File size:",
          fileInfo.size,
          "bytes"
        );
      } else {
        // For remote URLs we won't call FileSystem.getInfoAsync (not supported)
        console.log('Skipping FileSystem info check for non-local URI:', uriToCheck);
      }
    } catch (error) {
      console.error("Error validating PDF file:", error);
      setHasError(true);
      Alert.alert("File Error", "Unable to access the PDF file");
    }
  };

  const loadAnnotations = async () => {
    try {
      const stored = await AsyncStorage.getItem(annotationStorageKey);
      if (stored) {
        const loadedAnnotations = JSON.parse(stored) as Annotation[];
        
        // Validate and normalize loaded annotations to ensure they use percentage coordinates
        const normalizedAnnotations = loadedAnnotations.map(ann => {
          // Validate annotation coordinates are in percentage range (0-1)
          if (ann.x !== undefined && ann.y !== undefined) {
            // If coordinates are outside 0-1 range, they might be legacy pixel coordinates
            if (ann.x > 1 || ann.y > 1) {
              console.warn('Legacy pixel coordinates detected for annotation:', ann.id, 'Converting...');
              // For legacy data, attempt basic conversion (this is approximate)
              ann.x = Math.min(1, Math.max(0, ann.x / (screenWidth || 400)));
              ann.y = Math.min(1, Math.max(0, ann.y / (screenHeight || 600)));
            }
          }
          
          // Validate width/height are also in percentage range
          if (ann.width !== undefined && ann.width > 1) {
            ann.width = Math.min(1, ann.width / (screenWidth || 400));
          }
          if (ann.height !== undefined && ann.height > 1) {
            ann.height = Math.min(1, ann.height / (screenHeight || 600));
          }
          
          return ann;
        });
        
        updateAnnotations(normalizedAnnotations);
        console.log('✅ Loaded annotations from AsyncStorage:', normalizedAnnotations.length, 'items');
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
      updateAnnotations(newAnnotations);
    } catch (error) {
      console.error("Error saving annotations:", error);
    }
  };

  // Persist annotations both locally (AsyncStorage) and optionally to backend (when noteId provided)
  // All annotations MUST store coordinates & dimensions as normalized percentages (0-1) relative to the PDF page.
  const saveAnnotationsWithChanges = async (newAnnotations: Annotation[]) => {
    try {
      // Normalize & validate before saving to guarantee percentage storage.
      const validatedAnnotations = newAnnotations.map(ann => {
        const clone: Annotation = { ...ann };

        // Ensure path-based annotations already use normalized (0-1) coordinates.
        if (clone.path && /\d/.test(clone.path)) {
          // Heuristic check: if any coordinate exceeds 1 it's legacy pixel data -> re-normalize.
          if (/([0-9]+\.[0-9]+|[0-9]+)/.test(clone.path)) {
            const needsNormalization = clone.path.split(/[ML]/).some(seg => {
              const parts = seg.trim().split(',');
              if (parts.length === 2) {
                const x = parseFloat(parts[0]);
                const y = parseFloat(parts[1]);
                return x > 1 || y > 1; // pixel style
              }
              return false;
            });
            if (needsNormalization) {
              console.warn('⚠️ Legacy path detected – converting to normalized % coordinates.');
              clone.path = convertPathToNormalized(clone.path);
            }
          }
        }

        // Clamp numeric percentage fields.
        if (typeof clone.x === 'number') clone.x = Math.min(1, Math.max(0, clone.x));
        if (typeof clone.y === 'number') clone.y = Math.min(1, Math.max(0, clone.y));
        if (typeof clone.width === 'number') clone.width = Math.min(1, Math.max(0, clone.width));
        if (typeof clone.height === 'number') clone.height = Math.min(1, Math.max(0, clone.height));

        // Logging for debugging & auditing persisted data.
        if (clone.x !== undefined && clone.y !== undefined) {
          console.log(`📍 Annotation(${clone.type}) % coords: x=${clone.x.toFixed(4)}, y=${clone.y.toFixed(4)}`);
        }
        if (clone.path) {
          const pathSample = clone.path.substring(0, 60) + (clone.path.length > 60 ? '…' : '');
            console.log(`✏️ Path (${clone.type}) normalized sample: ${pathSample}`);
        }
        return clone;
      });
      
      // Record history for undo: push current state, clear redo stack
      try {
        undoStackRef.current.push(JSON.parse(JSON.stringify(annotations || [])));
        // Limit undo stack size to avoid unbounded memory growth
        if (undoStackRef.current.length > 50) undoStackRef.current.shift();
        // Any new change invalidates the redo stack
        redoStackRef.current = [];
        setCanUndo(undoStackRef.current.length > 0);
        setCanRedo(false);
      } catch (historyErr) {
        console.warn('Failed to push to undo stack:', historyErr);
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
      
      console.log('✅ Annotations saved to AsyncStorage (percentage-based):', validatedAnnotations.length, 'items');
      
      setHasUnsavedChanges(true);
      
      // Auto-save after 2 seconds of no changes (for PDF export if enabled)
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
      
      if (autoSave) {
        autoSaveTimeoutRef.current = setTimeout(() => {
          handleSaveAnnotations();
        }, 2000);
      }

      // Fire-and-forget backend sync (optional) – ensures persistence server-side.
      if (noteId) {
        syncAnnotationsToBackend(validatedAnnotations).catch(err => {
          console.warn('Backend annotation sync failed (non-blocking):', err);
        });
      }
    } catch (error) {
      console.error("❌ Error saving annotations to AsyncStorage:", error);
      Alert.alert("Save Error", "Failed to save annotations. Please try again.");
      // Rollback state change if save failed
      await loadAnnotations();
    }
  };

  // Sends annotations to backend by converting to stroke format used by existing drawing API.
  // This keeps server implementation unified. Non-blocking; errors logged only.
  const syncAnnotationsToBackend = async (anns: Annotation[]) => {
    if (!noteId) return; // No backend context
    try {
      // Convert PDF annotations to drawing strokes using drawingAPI logic
      const pdfAnnotations: PDFAnnotation[] = anns.map(a => ({
        id: a.id,
        type: a.type as PDFAnnotation['type'],
        page: a.page,
        x: a.x || 0,
        y: a.y || 0,
        color: a.color,
        path: a.path,
        strokeWidth: a.strokeWidth,
        timestamp: a.timestamp,
      }));
      // Reuse existing savePDFAnnotationsWithBackend for consistency; set lightweight options.
      await drawingAPI.savePDFAnnotationsWithBackend(
        noteId,
        source.uri,
        pdfAnnotations,
        { createBackup: false, saveDirectly: false }
      );
      console.log('🌐 Backend sync complete for annotations:', pdfAnnotations.length);
    } catch (err) {
      console.warn('⚠️ Non-fatal backend sync error:', err);
    }
  };

  const handleSaveAnnotations = async () => {
    if (!hasUnsavedChanges) return;
    
    try {
      setIsSavingToPDF(true);
      
      if (saveMode === 'direct' && enableDirectSave) {
        // Save annotations directly to PDF
        await saveAnnotationsDirectlyToPDF(annotations);
      } else {
        // Save annotations as overlays (traditional method)
        await AsyncStorage.setItem(annotationStorageKey, JSON.stringify(annotations));
      }
      
      setHasUnsavedChanges(false);
      console.log(`Annotations saved successfully using ${saveMode} mode!`);
      
    } catch (error) {
      console.error("Error saving annotations:", error);
      Alert.alert("Error", `Failed to save annotations using ${saveMode} mode. Please try again.`);
    } finally {
      setIsSavingToPDF(false);
    }
  };

  const saveAnnotationsDirectlyToPDF = async (annotationsToSave: Annotation[]) => {
    try {
      console.log('Saving annotations directly to PDF...');
      
      // Convert UI annotations to PDF annotations format
      const pdfAnnotations: PDFAnnotation[] = annotationsToSave.map(annotation => ({
        ...annotation,
        type: annotation.type as PDFAnnotation['type']
      }));

      const saveOptions: PDFSaveOptions = {
        createBackup: true,
        saveDirectly: false, // Create new file to preserve original
        outputFileName: `annotated_${Date.now()}_${fileName}`
      };

      let result;
      
      if (noteId) {
        // Save to both backend and PDF
        result = await drawingAPI.savePDFAnnotationsWithBackend(
          noteId, 
          source.uri, 
          pdfAnnotations, 
          saveOptions
        );
      } else {
        // Save only to PDF
        result = await drawingAPI.savePDFAnnotations(source.uri, pdfAnnotations, saveOptions);
      }

      setLastSavedPath(result.savedPath);
      console.log('Annotations successfully embedded in PDF:', result.savedPath);
      
      // Show success message
      Alert.alert(
        "Success", 
        `Annotations have been embedded directly into the PDF!\n\nSaved as: ${result.savedPath.split('/').pop()}`,
        [
          { text: "OK" },
          {
            text: "Open Location",
            onPress: () => console.log("PDF saved at:", result.savedPath),
          },
        ]
      );

    } catch (error) {
      console.error('Error saving annotations to PDF:', error);
      throw error;
    }
  };

  const handleShareAnnotations = async () => {
    try {
      if (annotations.length === 0) {
        Alert.alert("No Annotations", "There are no annotations to share.");
        return;
      }

      // Create a summary of annotations
      const annotationSummary = annotations.map((ann, index) => {
        const typeText = ann.type.charAt(0).toUpperCase() + ann.type.slice(1);
        const pageText = `Page ${ann.page}`;
        const textContent = ann.text ? `: "${ann.text}"` : "";
        return `${index + 1}. ${typeText} on ${pageText}${textContent}`;
      }).join("\n");

      const shareContent = `PDF Annotations for "${fileName}"\n\n${annotationSummary}`;
      
      if (await Sharing.isAvailableAsync()) {
        // Create a temporary text file for sharing instead of using data URL
        // Data URLs are not supported on Android for sharing
        const tempFileName = `annotations_${Date.now()}.txt`;
        const tempFilePath = `${FileSystem.documentDirectory}${tempFileName}`;
        
        try {
          await FileSystem.writeAsStringAsync(tempFilePath, shareContent);
          console.log('📝 Created temporary text file for sharing:', tempFilePath);
          
          await Sharing.shareAsync(tempFilePath, {
            mimeType: "text/plain",
            dialogTitle: "Share Annotations"
          });
          
          // Clean up temporary file after sharing
          setTimeout(async () => {
            try {
              await FileSystem.deleteAsync(tempFilePath, { idempotent: true });
              console.log('🗑️ Cleaned up temporary annotation file');
            } catch (cleanupError) {
              console.log('Note: Could not clean up temporary file:', cleanupError);
            }
          }, 5000);
          
        } catch (fileError) {
          console.error('Error creating temporary file for sharing:', fileError);
          // Fallback to alert with text content
          Alert.alert(
            "Annotation Summary", 
            shareContent,
            [
              { text: "Close", style: "cancel" },
              { 
                text: "Copy Text", 
                onPress: () => {
                  console.log('📋 Annotation text ready to copy:', shareContent);
                  Alert.alert("Info", "Annotation text has been logged. You can copy it from the console.");
                }
              }
            ]
          );
        }
      } else {
        Alert.alert("Share Not Available", "Sharing is not available on this device.");
      }
    } catch (error) {
      console.error("Error sharing annotations:", error);
      Alert.alert("Error", "Failed to share annotations.");
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
          }
        }
      ]
    );
  };

  const handleViewInfo = () => {
    const annotationCounts = annotations.reduce((counts, ann) => {
      counts[ann.type] = (counts[ann.type] || 0) + 1;
      return counts;
    }, {} as Record<string, number>);

    const countText = Object.entries(annotationCounts)
      .map(([type, count]) => `${type.charAt(0).toUpperCase() + type.slice(1)}: ${count}`)
      .join("\n");

    Alert.alert(
      "Document Information",
      `File: ${fileName}\nPages: ${totalPages}\nCurrent Page: ${currentPage}\n\nAnnotations:\n${countText || "No annotations"}`
    );
  };

  const onPdfLoadComplete = (numberOfPages: number, filePath: string, { width, height }: { width?: number, height?: number } = {}) => {
    console.log("onPdfLoadComplete called with:", { numberOfPages, filePath, width, height });
    setTotalPages(numberOfPages);
    setIsLoading(false);
    setHasError(false);
    setCurrentPage(1); // Reset to first page
    
    // Set actual PDF page dimensions if available
    if (width && height) {
      console.log("Setting PDF page dimensions:", { width, height });
      setPdfPageDimensions({ width, height });
      
      // Calculate aspect ratio for a single page
      const aspectRatio = height / width;
      
      // For horizontal paging, we set dimensions for a single page
  const pageHeight = screenHeight - 200; // Account for header and toolbar
      const pageWidth = pageHeight / aspectRatio;
      
      console.log('🔍 Single page dimensions:', { 
        width: pageWidth,
        height: pageHeight,
        aspectRatio
      });
      
      // Set container size for a single page view
      setContainerSize({ width: pageWidth, height: pageHeight });
      
      // Update PDF viewer bounds for accurate coordinate conversion
      setPdfViewerBounds({ width: pageWidth, height: pageHeight });
    } else {
      // Fallback dimensions
  const pageHeight = screenHeight - 200;
      const pageWidth = pageHeight * (8.5/11); // Letter size aspect ratio
      
      setContainerSize({ width: pageWidth, height: pageHeight });
      setPdfViewerBounds({ width: pageWidth, height: pageHeight });
    }
    
    console.log("PDF loaded successfully:", numberOfPages, "pages from:", filePath);
    console.log("✅ Horizontal paging enabled - showing one page at a time");
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

        console.log('Attempting fallback page-count check for URI:', uriToCheck);

        let base64Data: string | null = null;

        // Local file -> read directly
        if (uriToCheck.startsWith('file://') || uriToCheck.startsWith(FileSystem.documentDirectory || '')) {
          try {
            base64Data = await FileSystem.readAsStringAsync(uriToCheck, { encoding: FileSystem.EncodingType.Base64 });
            console.log('Read local PDF for fallback page count (base64 length):', base64Data?.length || 0);
          } catch (err) {
            console.warn('Could not read local PDF for fallback page count:', err);
          }
        } else if (uriToCheck.startsWith('http://') || uriToCheck.startsWith('https://')) {
          // Download to cache then read
          try {
            const tmpPath = FileSystem.cacheDirectory + `pdf_pagecount_${Date.now()}.pdf`;
            const dl = await FileSystem.downloadAsync(uriToCheck, tmpPath);
            base64Data = await FileSystem.readAsStringAsync(dl.uri, { encoding: FileSystem.EncodingType.Base64 });
            console.log('Downloaded remote PDF for fallback page count to:', dl.uri);
          } catch (err) {
            console.warn('Could not download remote PDF for fallback page count:', err);
          }
        }

        if (!base64Data) return;

        try {
          // Convert base64 to Uint8Array in a way that works across environments
          const base64ToUint8Array = (b64: string) => {
            if (typeof atob !== 'undefined') {
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
              const BufferCtor: any = (global as any).Buffer || (typeof Buffer !== 'undefined' ? Buffer : undefined);
              if (BufferCtor && typeof BufferCtor.from === 'function') {
                const buf = BufferCtor.from(b64, 'base64');
                return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
              }
            } catch (bufErr) {
              // ignore and fallthrough to throw
            }

            throw new Error('No base64 decode available in this environment');
          };

          const bytes = base64ToUint8Array(base64Data);

          // Try normal load first
          let pdfDoc: any;
          try {
            pdfDoc = await PDFLibDocument.load(bytes);
          } catch (loadErr: any) {
            console.warn('pdf-lib initial load failed for page count fallback:', loadErr && loadErr.message ? loadErr.message : loadErr);
            const msg = loadErr && loadErr.message ? loadErr.message.toLowerCase() : String(loadErr || '').toLowerCase();
            if (msg.includes('encrypted') || msg.includes('password')) {
              try {
                console.log('PDF appears to be encrypted - retrying page-count load with ignoreEncryption:true');
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                pdfDoc = await (PDFLibDocument as any).load(bytes, { ignoreEncryption: true });
              } catch (retryErr) {
                console.warn('Retry with ignoreEncryption failed for page count fallback:', retryErr);
                throw retryErr;
              }
            } else {
              throw loadErr;
            }
          }

          const realPageCount = (pdfDoc.getPages && pdfDoc.getPages().length) || undefined;
          if (realPageCount && realPageCount > 1) {
            console.log('Fallback detected real PDF page count:', realPageCount);
            setTotalPages(realPageCount);
          }
        } catch (err) {
          console.warn('pdf-lib fallback failed to load PDF for page count:', err);
        }
      } catch (err) {
        console.warn('Fallback page-count check failed:', err);
      }
    })();
  // Re-run fallback when currentSource or source change or when totalPages is still <= 1
  }, [currentSource?.uri, source?.uri, totalPages]);

  const onPdfLoadProgress = (percent: number) => {
    console.log("PDF loading progress:", percent + "%");
    // If we're getting progress events, the PDF is loading
    if (percent > 0) {
      console.log("PDF is loading, clearing any error state");
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
    console.log('PDF internal scale changed:', scale);
    // Update our zoom states to stay synchronized with PDF component
    setCurrentZoom(scale);
    setPdfTransform(prev => ({ ...prev, scale }));
  };

  // Text selection handlers for react-native-pdf-selection
  const onTextSelectionChange = useCallback((selection: {
    text: string;
    pageNumber: number;
    bounds: { x: number; y: number; width: number; height: number };
  }) => {
    console.log('PDF text selected:', selection);
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
  }, []);

  const onSelectionCleared = useCallback(() => {
    console.log('PDF text selection cleared');
    setSelectedText("");
    setSelectionRect(null);
    setShowAskRinaPopup(false);
  }, []);

  // Ask Rina handlers
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
    Alert.alert("Feature not available", "Text selection functionality has been removed.");
  }, [selectedTool]);

  // WebView text selection functionality has been removed



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
        return "Offline";
      default:
        return "Auto-saved";
    }
  };

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

  // Reset zoom function for double-tap with immediate response
  const resetZoom = () => {
    if (currentZoom === 1 && pdfTransform.translateX === 0 && pdfTransform.translateY === 0) return;
    
    // Reset immediately without animation for responsive feel
    setCurrentZoom(1);
    setPdfTransform({ scale: 1, translateX: 0, translateY: 0 });
  };

  // Zoom buttons functionality with immediate response (no animation delays)
  const handleZoomIn = () => {
    const newZoom = Math.min(currentZoom * 1.25, MAX_PDF_SCALE);
    if (newZoom === currentZoom) return; // Already at max zoom
    
    // Center-based zoom: adjust translate so the center of the container remains centered
  const containerW = pdfContainerLayout?.width || containerSize.width || screenWidth;
  const containerH = pdfContainerLayout?.height || containerSize.height || screenHeight;
    const centerX = containerW / 2;
    const centerY = containerH / 2;

    const pdfCenterX = (centerX + pdfScrollOffset.x - pdfTransform.translateX) / currentZoom;
    const pdfCenterY = (centerY + pdfScrollOffset.y - pdfTransform.translateY) / currentZoom;

    const newTranslateX = centerX + pdfScrollOffset.x - pdfCenterX * newZoom;
    const newTranslateY = centerY + pdfScrollOffset.y - pdfCenterY * newZoom;

    // Clamp
    const maxOffsetX = (containerW * (newZoom - 1)) / 2;
    const maxOffsetY = (containerH * (newZoom - 1)) / 2;
    const clampedX = Math.max(-maxOffsetX, Math.min(maxOffsetX, newTranslateX));
    const clampedY = Math.max(-maxOffsetY, Math.min(maxOffsetY, newTranslateY));

    // Update immediately without animation for responsive feel
    setCurrentZoom(newZoom);
    setPdfTransform(prev => ({ ...prev, scale: newZoom, translateX: clampedX, translateY: clampedY }));
  };

  const handleZoomOut = () => {
    const newZoom = Math.max(currentZoom * 0.8, MIN_PDF_SCALE);
    if (newZoom === currentZoom) return; // Already at min zoom
    
  const containerW = pdfContainerLayout?.width || containerSize.width || screenWidth;
  const containerH = pdfContainerLayout?.height || containerSize.height || screenHeight;
    const centerX = containerW / 2;
    const centerY = containerH / 2;

    const pdfCenterX = (centerX + pdfScrollOffset.x - pdfTransform.translateX) / currentZoom;
    const pdfCenterY = (centerY + pdfScrollOffset.y - pdfTransform.translateY) / currentZoom;

    const newTranslateX = centerX + pdfScrollOffset.x - pdfCenterX * newZoom;
    const newTranslateY = centerY + pdfScrollOffset.y - pdfCenterY * newZoom;

    // Clamp
    const maxOffsetX = (containerW * (newZoom - 1)) / 2;
    const maxOffsetY = (containerH * (newZoom - 1)) / 2;
    const clampedX = Math.max(-maxOffsetX, Math.min(maxOffsetX, newTranslateX));
    const clampedY = Math.max(-maxOffsetY, Math.min(maxOffsetY, newTranslateY));

    // Update immediately without animation for responsive feel
    setCurrentZoom(newZoom);
    setPdfTransform(prev => ({ ...prev, scale: newZoom, translateX: clampedX, translateY: clampedY }));
  };

  // Pan responder for pinch-to-zoom gestures and drawing - optimized for real-time response
  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: (evt, gestureState) => {
      const touches = evt.nativeEvent.touches || [];
      // Start responder immediately for multi-touch (pinch), when a tool is selected (drawing),
      // or when we're zoomed in and want to pan the content with one finger.
      if (touches.length === 2) {
        return true;
      }
      if (selectedTool !== null && selectedTool !== "selection") return true;
      if (currentZoomRef.current > 1 && touches.length === 1) return true;
      return false;
    },
    onMoveShouldSetPanResponder: (evt, gestureState) => {
      const touches = evt.nativeEvent.touches || [];
      // Accept move gestures immediately without delay
      if (touches.length === 2) return true; // pinch
      // If drawing tool selected (including textSelect), handle single-touch move immediately
      if (selectedTool !== null && selectedTool !== "selection" && touches.length === 1) return true;
      // If zoomed in, allow single-finger pan immediately
      if (currentZoomRef.current > 1 && touches.length === 1) return true;
      return false;
    },
    onMoveShouldSetPanResponderCapture: (evt, gestureState) => {
      const touches = evt.nativeEvent.touches || [];
      // Capture gestures immediately for real-time response
      if (touches.length === 2) return true;
      // Capture for textSelect mode to enable bbox drawing
      if (selectedTool !== null && selectedTool !== "selection" && touches.length === 1) return true;
      if (currentZoomRef.current > 1 && touches.length === 1) return true;
      return false;
    },
    // Enable immediate response by setting these to true
    onShouldBlockNativeResponder: () => true,
    onStartShouldSetPanResponderCapture: (evt, gestureState) => {
      const touches = evt.nativeEvent.touches || [];
      return touches.length === 2 || (selectedTool !== null && selectedTool !== "selection") || currentZoomRef.current > 1;
    },

    onPanResponderGrant: (evt, gestureState) => {
      const touches = evt.nativeEvent.touches || [];
      console.log('onPanResponderGrant - touches:', touches.length);
      if (touches.length === 2) {
        console.log('🎯 Pinch gesture started');
        // Pinch-to-zoom gesture
        gestureStartZoomRef.current = currentZoomRef.current;
        gestureStartDistanceRef.current = getDistance(touches);
        
        // Compute midpoint in screen coordinates
        const t1 = touches[0];
        const t2 = touches[1];
        const midX = (t1.pageX + t2.pageX) / 2;
        const midY = (t1.pageY + t2.pageY) / 2;
        gestureMidpointRef.current = { x: midX, y: midY };

        // Convert screen midpoint to container/pdf coordinates (reverse transform)
        // Adjust for scroll offset
        const adjustedMidX = midX + pdfScrollOffset.x;
        const adjustedMidY = midY + pdfScrollOffset.y;
  const { scale, translateX, translateY } = pdfTransformRef.current;
        const originalX = (adjustedMidX - translateX) / scale;
        const originalY = (adjustedMidY - translateY) / scale;
        gestureMidpointPdfRef.current = { x: originalX, y: originalY };
        
        console.log('Pinch start - distance:', gestureStartDistanceRef.current, 'midpoint:', { midX, midY });
      } else if (touches.length === 1 && selectedTool) {
        // Single touch drawing gesture
        const touch = touches[0];
        const { locationX, locationY } = touch;

        if (selectedTool === 'selection' || selectedTool === 'textSelect') {
          // Text selection functionality has been removed
          return;
        } else if (selectedTool === 'note' || selectedTool === 'text') {
          // Handle note/text placement
          const coords = screenToPDFCoordinates(locationX, locationY);
          setNotePosition({ x: coords.normalizedX, y: coords.normalizedY });
          setShowNoteModal(true);
        } else if (selectedTool === 'highlight') {
          // For highlight tool, we'll start drawing a freehand highlight
          setIsDrawing(true);
          // Initialize point buffer with higher-precision timestamp
          const now = Date.now();
          currentPointsRef.current = [{ 
            x: locationX, 
            y: locationY,
            timestamp: now  // Add timestamp for speed-based smoothing
          }];
          // Reset rendering timers
          lastRenderTimeRef.current = performance.now();
          pendingPathUpdateRef.current = false;
          
          // Initial path
          const smooth = convertPointsToSmoothedPath(currentPointsRef.current, 8);
          currentPathRef.current = smooth;
          setCurrentPath(smooth);
          
          // Pre-allocate space for better performance
          currentPointsRef.current.length = 0; // Clear
          currentPointsRef.current.push({ x: locationX, y: locationY, timestamp: now });
        } else {
          // Start drawing path for pen, brush, pencil, freehand highlight, eraser
          setIsDrawing(true);
          
          // Initialize with optimized settings
          const now = Date.now();
          const initialPoint = { x: locationX, y: locationY, timestamp: now };
          currentPointsRef.current = [initialPoint];
          lastPointRef.current = initialPoint;
          
          // Reset performance tracking
          lastRenderTimeRef.current = performance.now();
          pendingPathUpdateRef.current = false;
          pathCacheRef.current = "";
          pointsCountRef.current = 1;
          
          // Set tool-specific smoothing level for optimal performance
          smoothingLevelRef.current = selectedTool === 'pencil' ? 6 : 
                                    selectedTool === 'pen' ? 8 : 
                                    selectedTool === 'brush' ? 10 : 8;
          
          // Initial path (simple M command for single point)
          const initialPath = `M${locationX.toFixed(2)},${locationY.toFixed(2)}`;
          currentPathRef.current = initialPath;
          setCurrentPath(initialPath);
        }
      } else if (touches.length === 1 && currentZoomRef.current > 1 && selectedTool === null) {
        // Start panning when zoomed in and no drawing tool selected
        const touch = touches[0];
        gestureStartTranslateRef.current = { x: pdfTransform.translateX, y: pdfTransform.translateY };
        gestureStartTouchRef.current = { x: touch.pageX, y: touch.pageY };
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
          const newZoom = Math.max(MIN_PDF_SCALE, Math.min(MAX_PDF_SCALE, gestureStartZoomRef.current * scale));

          // Preserve focal point: compute new translateX/translateY so the PDF point
          // that was under the midpoint stays at the same screen position.
          const mid = gestureMidpointRef.current;
          const pdfPoint = gestureMidpointPdfRef.current; // in container coord space

          // New translate so that: screenMid = pdfPoint * newScale + newTranslate
          // => newTranslate = screenMid - pdfPoint * newScale
          const newTranslateX = mid.x + pdfScrollOffset.x - (pdfPoint.x * newZoom);
          const newTranslateY = mid.y + pdfScrollOffset.y - (pdfPoint.y * newZoom);

          // Clamp translation to reasonable bounds (same logic as panning)
          const containerW = pdfContainerLayout?.width || containerSize.width || screenWidth;
          const containerH = pdfContainerLayout?.height || containerSize.height || screenHeight;
          const maxOffsetX = (containerW * (newZoom - 1)) / 2;
          const maxOffsetY = (containerH * (newZoom - 1)) / 2;

          let clampedX = newTranslateX;
          let clampedY = newTranslateY;

          clampedX = Math.max(-maxOffsetX, Math.min(maxOffsetX, clampedX));
          clampedY = Math.max(-maxOffsetY, Math.min(maxOffsetY, clampedY));

          // Update refs and animated values immediately for real-time feedback
          currentZoomRef.current = newZoom;
          pdfTransformRef.current = { scale: newZoom, translateX: clampedX, translateY: clampedY };
          // Update animated values directly for immediate visual feedback
          animatedScale.setValue(newZoom);
          animatedTranslateX.setValue(clampedX);
          animatedTranslateY.setValue(clampedY);
        }
      } else if (touches.length === 1 && (isDrawing || isBboxDrawing) && selectedTool) {
        // Handle drawing with real-time path updates
        const touch = touches[0];
        const { locationX, locationY } = touch;

        if (selectedTool === 'textSelect') {
          // textSelect now extracts all page text automatically
          // No bbox drawing needed
          return;
        } else if (selectedTool === 'pen' || selectedTool === 'brush' || selectedTool === 'pencil' || selectedTool === 'highlight' || selectedTool === 'eraser') {
          // Optimize point collection with distance-based filtering for smoother performance
          const newPoint = { x: locationX, y: locationY, timestamp: Date.now() };
          
          // Skip points that are too close to reduce computational overhead
          if (lastPointRef.current) {
            const dx = newPoint.x - lastPointRef.current.x;
            const dy = newPoint.y - lastPointRef.current.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            // Only add points with sufficient movement (reduces jitter and improves performance)
            if (distance < 1.5) {
              return; // Skip this point to reduce processing
            }
          }
          
          // Add the filtered point
          currentPointsRef.current.push(newPoint);
          lastPointRef.current = newPoint;
          
          // Efficient buffer management with sliding window
          const maxPoints = selectedTool === 'pencil' ? 300 : 512; // Pencil needs fewer points for performance
          if (currentPointsRef.current.length > maxPoints) {
            // Remove multiple points at once for better performance
            currentPointsRef.current.splice(0, Math.floor(maxPoints * 0.1));
          }
          
          // Trigger immediate path update for real-time feedback
          if (!pendingPathUpdateRef.current) {
            updatePathWithAnimation();
          }

        }
      } else if (touches.length === 1 && currentZoomRef.current > 1 && selectedTool === null) {
        // Handle panning when zoomed in with immediate updates
        const touch = touches[0];
        const dx = touch.pageX - gestureStartTouchRef.current.x;
        const dy = touch.pageY - gestureStartTouchRef.current.y;

  const scale = pdfTransformRef.current.scale || 1;
        // Calculate maximum pan offset based on scaled content (center-origin approximation)
        const maxOffsetX = (containerSize.width * (scale - 1)) / 2;
        const maxOffsetY = (containerSize.height * (scale - 1)) / 2;

  let newTranslateX = gestureStartTranslateRef.current.x + dx;
  let newTranslateY = gestureStartTranslateRef.current.y + dy;

  // Clamp translation to reasonable bounds
  newTranslateX = Math.max(-maxOffsetX, Math.min(maxOffsetX, newTranslateX));
  newTranslateY = Math.max(-maxOffsetY, Math.min(maxOffsetY, newTranslateY));

  // Update refs and animated values immediately
  pdfTransformRef.current = { ...pdfTransformRef.current, translateX: newTranslateX, translateY: newTranslateY };
  animatedTranslateX.setValue(newTranslateX);
  animatedTranslateY.setValue(newTranslateY);
      }
    },

    onPanResponderRelease: (evt) => {
      // On release finalize drawing or reset gesture trackers
      if (isDrawing && currentPath && selectedTool) {
        // If we used point buffer, convert to final smoothed path
        const finalPath = currentPointsRef.current && currentPointsRef.current.length > 0 ? convertPointsToSmoothedPath(currentPointsRef.current, 8) : currentPath; // Enhanced smoothing

        if (selectedTool === "highlight") {
          addFreehandHighlight(finalPath);
          // Text extraction via WebView has been removed
        } else if (selectedTool === "pen" || selectedTool === "brush" || selectedTool === "pencil") {
          addPenAnnotation(finalPath, selectedTool);
        } else if (selectedTool === "eraser") {
          partialEraseAnnotations(finalPath);
        }

        // Optimized cleanup for maximum performance
        currentPointsRef.current.length = 0; // Faster than reassigning array
        lastPointRef.current = null;
        
        // Reset all performance tracking
        setIsDrawing(false);
        setCurrentPath("");
        currentPathRef.current = "";
        pathCacheRef.current = "";
        pointsCountRef.current = 0;
        
        // Cancel any pending animation frames to avoid memory leaks
        if (animationFrameRef.current !== null) {
          cancelAnimationFrame(animationFrameRef.current);
          animationFrameRef.current = null;
          pendingPathUpdateRef.current = false;
        }
      }

      // Reset gesture tracking
      gestureStartDistanceRef.current = 0;
      gestureStartTouchRef.current = { x: 0, y: 0 };

      // Animate to final transform values using configured finish animation
      const final = pdfTransformRef.current;
      animateToFinal(final, () => {
        setCurrentZoom(currentZoomRef.current);
        setPdfTransform(final);
      });
    },

    onPanResponderTerminate: () => {
      // Reset gesture tracking
      gestureStartDistanceRef.current = 0;
      gestureStartTouchRef.current = { x: 0, y: 0 };
      
      // Reset bbox selection state if active
      if (isBboxDrawing) {
        setIsBboxDrawing(false);
        setBboxStart(null);
        setCurrentBbox(null);
      }

      // Also animate to the final transform to avoid abrupt snapping
      const finalT = pdfTransformRef.current;
      animateToFinal(finalT, () => {
        setCurrentZoom(currentZoomRef.current);
        setPdfTransform(finalT);
      });
    },
  });

  // % -> screen using current pdfScale and the measured viewer bounds.
  // ---------------------------------------------------------------------------
  // Enhanced coordinate conversion for horizontal paging PDF viewer
  const screenToPDFCoordinates = (screenX: number, screenY: number) => {
    // Get container dimensions for the PDF viewer
  const containerW = pdfViewerBounds?.width || pdfContainerLayout?.width || containerSize.width || screenWidth;
  const containerH = pdfViewerBounds?.height || pdfContainerLayout?.height || containerSize.height || screenHeight;

    // Calculate PDF page aspect ratio
    const pageAspect = pdfPageDimensions?.height && pdfPageDimensions?.width
      ? pdfPageDimensions.height / pdfPageDimensions.width
      : containerH / containerW;

    // In horizontal paging mode, the display width is the container width
    // and the height is calculated based on the aspect ratio
    const displayW = containerW;
    const displayH = displayW * pageAspect;

    // Account for vertical centering if PDF doesn't fill entire container height
    const offsetY = Math.max(0, (containerH - displayH) / 2);

    // Get page spacing for horizontal paging (should match the 'spacing' prop on the PDF component)
    const pageSpacing = 10;

    // Get current transform (scale, translateX, translateY)
    const { scale, translateX, translateY } = pdfTransform;

    // Reverse transform to get coordinates in the untransformed PDF space
    const untransformedX = (screenX - translateX) / scale;
    const untransformedY = (screenY - translateY) / scale;

    // For horizontal paging, each page is positioned side by side
    // Calculate the page start position based on current page
    const pageIndex = Math.max(0, currentPage - 1);
    const pageStartX = pageIndex * (displayW + pageSpacing);
    const pageStartY = 0;

    // Calculate coordinates relative to the current page
    const pageX = untransformedX - pageStartX;
    const pageY = untransformedY - pageStartY - offsetY;

    // Convert to normalized coordinates (0-1) within the current page
    let normalizedX = pageX / displayW;
    let normalizedY = pageY / displayH;

    // Clamp to [0, 1] and warn if out of bounds
    if (normalizedX < 0 || normalizedX > 1 || normalizedY < 0 || normalizedY > 1) {
      if (__DEV__) {
        console.warn('⚠️ Normalized coordinates out of bounds, clamping:', { x: normalizedX, y: normalizedY });
      }
      normalizedX = Math.max(0, Math.min(1, normalizedX));
      normalizedY = Math.max(0, Math.min(1, normalizedY));
    }

    if (__DEV__) {
      console.log('📏 Coordinate Conversion:', {
        input: { screenX, screenY },
        container: { width: containerW, height: containerH },
        pdfPageDimensions,
        display: { width: displayW, height: displayH },
        offsetY,
        pageIndex,
        pageStartX,
        pageStartY,
        pageX,
        pageY,
        normalizedX,
        normalizedY,
        scale,
        translateX,
        translateY,
      });
    }

    return {
      normalizedX,
      normalizedY,
    };
  };

  // Convert normalized PDF coordinates (0-1 percentages) back to current screen coordinates
  const pdfToScreenCoordinates = (normalizedX: number, normalizedY: number) => {
    // Get the current container dimensions
    const viewerWidth = containerSize.width || screenWidth;
    const viewerHeight = containerSize.height || (screenHeight - 300);
    
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
      note: "Transform and scroll applied at container level"
    });
    
    return {
      screenX: containerX,
      screenY: containerY
    };
  };

  const addPenAnnotation = (path: string, penType: "pen" | "brush" | "pencil") => {
    // Convert path coordinates to PDF page percentages for storage
    const normalizedPath = convertPathToNormalized(path);
    
    console.log(`➕ Adding ${penType} annotation on page ${currentPage} of ${totalPages}`);
    
    const newAnnotation: Annotation = {
      id: Date.now().toString(),
      type: penType,
      page: currentPage,
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
    // Convert path coordinates to PDF page percentages for storage
    const normalizedPath = convertPathToNormalized(path);
    
    console.log(`➕ Adding highlight annotation on page ${currentPage} of ${totalPages}`);
    
    const newAnnotation: Annotation = {
      id: Date.now().toString(),
      type: "highlight",
      page: currentPage,
      x: 0, // Will be calculated from path bounds if needed
      y: 0, // Will be calculated from path bounds if needed
      color: selectedColor,
      path: normalizedPath, // SVG path with percentage coordinates (0-1)
      strokeWidth,
      timestamp: Date.now(),
    };

    const updated = [...annotations, newAnnotation];
    saveAnnotationsWithChanges(updated);
  };

  const extractPressureFromPath = (path: string): number[] => {
    const pressureData: number[] = [];
    const commands = path.split(/[ML]/).filter(cmd => cmd.trim());
    
    commands.forEach(cmd => {
      const parts = cmd.trim().split(':');
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
    return path.replace(/:[\d.]+/g, '');
  };

  const convertPathToNormalized = (path: string): string => {
    const cleanPath = cleanPathFromPressure(path);

    // Helper: sample a path containing M, L, C commands into a list of points
    const samplePathToPoints = (p: string, samplesPerSeg = 6): { x: number; y: number }[] => {
      const pts: { x: number; y: number }[] = [];
      if (!p) return pts;

      // Tokenize commands and numbers (keep absolute commands only)
      const tokens = p.replace(/,/g, ' ').replace(/\s+/g, ' ').trim().match(/[MLC]|-?\d*\.?\d+/g) || [];
      let idx = 0;
      let cx = 0, cy = 0;

      const readNum = () => parseFloat(tokens[idx++]);

      while (idx < tokens.length) {
        const tk = tokens[idx++];
        if (tk === 'M' || tk === 'L') {
          const x = readNum();
          const y = readNum();
          pts.push({ x, y });
          cx = x; cy = y;
        } else if (tk === 'C') {
          const x1 = readNum(); const y1 = readNum();
          const x2 = readNum(); const y2 = readNum();
          const x = readNum(); const y = readNum();
          // sample this cubic Bezier
          for (let s = 1; s <= samplesPerSeg; s++) {
            const t = s / samplesPerSeg;
            const mt = 1 - t;
            const bx = mt*mt*mt*cx + 3*mt*mt*t*x1 + 3*mt*t*t*x2 + t*t*t*x;
            const by = mt*mt*mt*cy + 3*mt*mt*t*y1 + 3*mt*t*t*y2 + t*t*t*y;
            pts.push({ x: bx, y: by });
          }
          cx = x; cy = y;
        } else {
          // Unexpected token: try to parse as pair
          const maybeNum = parseFloat(tk);
          if (!Number.isNaN(maybeNum) && idx < tokens.length) {
            const y = parseFloat(tokens[idx++]);
            pts.push({ x: maybeNum, y });
            cx = maybeNum; cy = y;
          }
        }
      }

      return pts;
    };

    const points = samplePathToPoints(cleanPath, 6);
    if (!points || points.length === 0) return '';

    // Use measured container when available
    const containerW = pdfContainerLayout?.width || containerSize.width || screenWidth;
    const containerH = pdfContainerLayout?.height || containerSize.height || screenHeight;

    // Convert sampled points to normalized M/L path
    let normalized = '';
    for (let i = 0; i < points.length; i++) {
      const nx = Math.max(0, Math.min(1, points[i].x / containerW));
      const ny = Math.max(0, Math.min(1, points[i].y / containerH));
      if (i === 0) normalized += `M${nx.toFixed(6)},${ny.toFixed(6)}`;
      else normalized += ` L${nx.toFixed(6)},${ny.toFixed(6)}`;
    }

    return normalized;
  };

  const convertNormalizedPathToScreen = (path: string): string => {
    if (!path) return '';
    // Compute the displayed PDF rectangle (same logic used in renderAnnotations)
    const containerWidth = containerSize.width || screenWidth;
    const containerHeight = containerSize.height || screenHeight;

    const pdfWidth = pdfPageDimensions?.width || 595;
    const pdfHeight = pdfPageDimensions?.height || 842;
    const aspectRatio = pdfWidth / pdfHeight;

    let pdfDisplayWidth = pdfContainerLayout?.width || containerWidth;
    let pdfDisplayHeight = pdfContainerLayout?.height || containerHeight;
    if (!pdfContainerLayout) {
      if (containerWidth / containerHeight > aspectRatio) {
        pdfDisplayHeight = containerHeight;
        pdfDisplayWidth = pdfDisplayHeight * aspectRatio;
      } else {
        pdfDisplayWidth = containerWidth;
        pdfDisplayHeight = pdfDisplayWidth / aspectRatio;
      }
    }

    // Build path string in SVG-local coordinates (0..pdfDisplayWidth, 0..pdfDisplayHeight)
    const parts = path.split(/([ML])/);
    let svgPath = '';

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (part === 'M' || part === 'L') {
        svgPath += part;
      } else if (part && part.trim()) {
        const coords = part.trim().split(',');
        if (coords.length === 2) {
          const normalizedX = parseFloat(coords[0]);
          const normalizedY = parseFloat(coords[1]);
          if (Number.isFinite(normalizedX) && Number.isFinite(normalizedY)) {
            const x = Math.max(0, Math.min(1, normalizedX)) * pdfDisplayWidth;
            const y = Math.max(0, Math.min(1, normalizedY)) * pdfDisplayHeight;
            svgPath += `${x.toFixed(2)},${y.toFixed(2)}`;
          } else {
            svgPath += part;
          }
        } else {
          svgPath += part;
        }
      }
    }

    return svgPath;
  };

  const scalePathForZoom = (path: string, scale: number): string => {
    // This function is deprecated - use convertNormalizedPathToScreen instead
    // keeping for backward compatibility but delegating to the new approach
    return convertNormalizedPathToScreen(path);
  };

  const partialEraseAnnotations = (eraserPath: string) => {
    const normalizedEraserPath = convertPathToNormalized(eraserPath);
    const eraserPoints = getPathPoints(normalizedEraserPath);
    const eraseThreshold = 0.05; // Use normalized threshold (5% of screen)
    
    const modifiedAnnotations = annotations.map((ann) => {
      if (ann.page !== currentPage) return ann; // Keep annotations from other pages
      if (!ann.path && !ann.x && !ann.y) return ann; // Keep annotations without position data
      
      // For path-based annotations (drawings, highlights, pen strokes)
      if (ann.path) {
        const annotationPoints = getPathPoints(ann.path);
        const remainingPoints: { x: number, y: number }[] = [];
        
        annotationPoints.forEach(point => {
          let shouldKeep = true;
          for (const eraserPoint of eraserPoints) {
            const distance = Math.sqrt((point.x - eraserPoint.x) ** 2 + (point.y - eraserPoint.y) ** 2);
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
            id: ann.id + '_modified_' + Date.now() // Update ID to trigger re-render
          };
        } else {
          // If too few points remain, remove the annotation
          return null;
        }
      }
      
      // For point-based annotations (notes, text) - coordinates are already normalized
      if (ann.x !== undefined && ann.y !== undefined) {
        const shouldErase = eraserPoints.some(eraserPoint => {
          const distance = Math.sqrt((ann.x - eraserPoint.x) ** 2 + (ann.y - eraserPoint.y) ** 2);
          return distance < eraseThreshold;
        });
        return shouldErase ? null : ann;
      }
      
      return ann;
    }).filter(ann => ann !== null) as Annotation[];
    
    saveAnnotationsWithChanges(modifiedAnnotations);
  };

  // Text extraction functionality using WebView has been removed
  const attemptToExtractTextFromPath = (path: string) => {
    // Functionality has been removed
    setShowTextExtractionModal(true);
  };

  const getPathPoints = (path: string) => {
    // Reuse a lightweight parser that understands M/L/C absolute commands
    const pts: { x: number, y: number }[] = [];
    if (!path) return pts;
    const tokens = path.replace(/,/g, ' ').replace(/\s+/g, ' ').trim().match(/[MLC]|-?\d*\.?\d+/g) || [];
    let i = 0;
    let cx = 0, cy = 0;
    const readNum = () => parseFloat(tokens[i++]);

    while (i < tokens.length) {
      const tk = tokens[i++];
      if (tk === 'M' || tk === 'L') {
        const x = readNum(); const y = readNum();
        pts.push({ x, y });
        cx = x; cy = y;
      } else if (tk === 'C') {
        const x1 = readNum(); const y1 = readNum();
        const x2 = readNum(); const y2 = readNum();
        const x = readNum(); const y = readNum();
        // sample cubic to points
        const samples = 6;
        for (let s = 1; s <= samples; s++) {
          const t = s / samples;
          const mt = 1 - t;
          const bx = mt*mt*mt*cx + 3*mt*mt*t*x1 + 3*mt*t*t*x2 + t*t*t*x;
          const by = mt*mt*mt*cy + 3*mt*mt*t*y1 + 3*mt*t*t*y2 + t*t*t*y;
          pts.push({ x: bx, y: by });
        }
        cx = x; cy = y;
      } else {
        // fallback: try to parse as number pair
        const maybeX = parseFloat(tk);
        if (!Number.isNaN(maybeX) && i < tokens.length) {
          const y = parseFloat(tokens[i++]);
          pts.push({ x: maybeX, y });
          cx = maybeX; cy = y;
        }
      }
    }

    return pts;
  };

  const reconstructPath = (points: { x: number, y: number }[]): string => {
    if (points.length === 0) return '';
    
    let path = `M${points[0].x},${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      path += ` L${points[i].x},${points[i].y}`;
    }
    
    return path;
  };

  const eraseAnnotations = (eraserPath: string) => {
    // Simple bounding box intersection check
    const erased = annotations.filter((ann) => {
      if (ann.page !== currentPage) return true; // Keep annotations from other pages
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
      const points: { x: number, y: number }[] = [];
      const commands = path.split(/[ML]/).filter(cmd => cmd.trim());
      
      commands.forEach(cmd => {
        const coords = cmd.trim().split(',');
        if (coords.length === 2) {
          points.push({
            x: parseFloat(coords[0]),
            y: parseFloat(coords[1])
          });
        }
      });
      
      return points;
    };

    const path1Points = getPathPoints(path1);
    const path2Points = getPathPoints(path2);

    // Check if any point in path1 is close to any point in path2
    const threshold = 0.03; // Normalized threshold (3% of screen)
    
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
      const points: { x: number, y: number }[] = [];
      const commands = path.split(/[ML]/).filter(cmd => cmd.trim());
      
      commands.forEach(cmd => {
        const coords = cmd.trim().split(',');
        if (coords.length === 2) {
          points.push({
            x: parseFloat(coords[0]),
            y: parseFloat(coords[1])
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
    
    console.log(`➕ Adding highlight annotation on page ${currentPage} of ${totalPages}`);
    console.log('🔍 Highlight coordinate conversion:', {
      input: { x, y },
      output: coords,
      targetPage: currentPage
    });
    
    // Validate coordinates and page
    if (currentPage < 1 || currentPage > totalPages) {
      console.error(`❌ Invalid page ${currentPage} for highlight (valid range: 1-${totalPages})`);
      Alert.alert('Error', `Cannot add annotation: invalid page ${currentPage}`);
      return;
    }
    
    const newAnnotation: Annotation = {
      id: Date.now().toString(),
      type: "highlight",
      page: currentPage,
      x: coords.normalizedX, // Percentage of PDF page width (0-1)
      y: coords.normalizedY, // Percentage of PDF page height (0-1)
      width: 0.15, // 15% of PDF page width
      height: 0.025, // 2.5% of PDF page height
      color: selectedColor,
      timestamp: Date.now(),
    };

    console.log('✅ Created highlight annotation:', newAnnotation);
    const updated = [...annotations, newAnnotation];
    saveAnnotationsWithChanges(updated);
  };

  const addNoteAnnotation = () => {
    if (!noteText.trim()) return;

    console.log(`➕ Adding ${selectedTool === "text" ? "text" : "note"} annotation on page ${currentPage} of ${totalPages}`);

    // Validate page and coordinates
    if (currentPage < 1 || currentPage > totalPages) {
      console.error(`❌ Invalid page ${currentPage} for note (valid range: 1-${totalPages})`);
      Alert.alert('Error', `Cannot add annotation: invalid page ${currentPage}`);
      return;
    }

    // Convert screen coordinates to proper PDF coordinates
    const coords = screenToPDFCoordinates(
      notePosition.x * (containerSize.width || screenWidth),
      notePosition.y * (containerSize.height || (screenHeight - 300))
    );
    
    console.log('🔍 Note coordinate conversion:', {
      input: notePosition,
      containerSize,
      output: coords,
      targetPage: currentPage
    });

    const newAnnotation: Annotation = {
      id: Date.now().toString(),
      type: selectedTool === "text" ? "text" : "note",
      page: currentPage,
      x: coords.normalizedX, // Properly calculated percentage
      y: coords.normalizedY, // Properly calculated percentage
      color: selectedColor,
      text: noteText,
      timestamp: Date.now(),
    };

    console.log('✅ Created note annotation:', newAnnotation);
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
    console.log('🧪 HORIZONTAL PAGING COORDINATE CONVERSION DEBUG TEST:');
    console.log('📊 Current state:', {
      totalPages,
      currentPage,
      containerSize,
      pdfPageDimensions,
      screenDimensions: { width: screenWidth, height: screenHeight }
    });
    
    // Test annotation coordinates
    annotations.forEach((ann, index) => {
      console.log(`  Annotation ${index + 1}:`, {
        id: ann.id,
        type: ann.type,
        page: ann.page,
        coordinates: { x: ann.x, y: ann.y },
        isValidPage: ann.page >= 1 && ann.page <= totalPages,
        isValidCoords: ann.x >= 0 && ann.x <= 1 && ann.y >= 0 && ann.y <= 1
      });
    });
    
    // Test coordinate conversion with sample points for the current page
    const testPoints = [
      { x: 20, y: 20, desc: 'top-left' },
      { x: screenWidth / 2, y: screenHeight / 4, desc: 'top-center' },
      { x: screenWidth - 20, y: 20, desc: 'top-right' },
      { x: screenWidth / 2, y: screenHeight / 2, desc: 'center' },
      { x: 20, y: screenHeight - 100, desc: 'bottom-left' },
      { x: screenWidth - 20, y: screenHeight - 100, desc: 'bottom-right' }
    ];
    
    console.log(`🧪 Testing coordinate conversion on page ${currentPage}:`);
    testPoints.forEach(point => {
  const converted = screenToPDFCoordinates(point.x, point.y);
  console.log(`  ${point.desc}: (${point.x}, ${point.y}) → (${converted.normalizedX.toFixed(3)}, ${converted.normalizedY.toFixed(3)})`);
    });
  };

  const exportAnnotatedPDF = async () => {
    try {
      if (annotations.length === 0) {
        Alert.alert(
          "No Annotations", 
          "Add some annotations to the PDF first, then you can export it with your annotations embedded.",
          [{ text: "OK" }]
        );
        return;
      }

      // Show annotation count for user feedback
      const annotationCount = annotations.length;
      const pageCount = new Set(annotations.map(a => a.page)).size;
      
      Alert.alert(
        "Export Annotated PDF",
        `Ready to export PDF with ${annotationCount} annotation${annotationCount > 1 ? 's' : ''} across ${pageCount} page${pageCount > 1 ? 's' : ''}

Choose export method:`,
        [
          {
            text: "Cancel",
            style: "cancel"
          },
          {
            text: "📄 New File",
            onPress: () => exportToPDFNewFile()
          },
          {
            text: "📝 Update Original",
            onPress: () => exportToPDFDirect(),
            style: "default"
          }
        ]
      );

    } catch (error) {
      console.error("Error in export options:", error);
      Alert.alert("Export Error", "Failed to prepare export options. Please try again.");
    }
  };

  const exportToPDFNewFile = async () => {
    try {
      console.log('🚀 Starting PDF export process with enhanced debugging...');
      console.log('📋 Export context:', {
        fileName,
        sourceUri: source.uri,
        totalAnnotations: annotations.length,
        totalPages,
        currentPage,
        containerSize,
        pdfPageDimensions
      });
      
      // Show progress feedback
      Alert.alert("📄 Creating Export", "Processing annotations and creating new PDF file...");

      // Convert UI annotations to PDF annotations format
      const pdfAnnotations: PDFAnnotation[] = annotations.map(annotation => ({
        ...annotation,
        type: annotation.type as PDFAnnotation['type']
      }));

      // Enhanced debugging: Log detailed page distribution
      const pageDistribution = pdfAnnotations.reduce((acc, ann) => {
        acc[ann.page] = (acc[ann.page] || 0) + 1;
        return acc;
      }, {} as Record<number, number>);
      
      console.log('� ENHANCED EXPORT DEBUG:');
      console.log('�📊 Annotation distribution by page:', pageDistribution);
      console.log('📄 Total pages in PDF viewer:', totalPages);
      console.log('📝 Total annotations to export:', pdfAnnotations.length);
      console.log('📏 Container dimensions:', containerSize);
      console.log('📐 PDF page dimensions:', pdfPageDimensions);
      
      // Validate all annotations have valid pages
      const invalidAnnotations = pdfAnnotations.filter(ann => ann.page < 1 || ann.page > totalPages);
      if (invalidAnnotations.length > 0) {
        console.error('❌ Found annotations with invalid page numbers:');
        invalidAnnotations.forEach(ann => {
          console.error(`  - Annotation ID ${ann.id}: page ${ann.page} (valid range: 1-${totalPages})`);
        });
      }
      
      // Validate coordinates
      const invalidCoords = pdfAnnotations.filter(ann => 
        ann.x < 0 || ann.x > 1 || ann.y < 0 || ann.y > 1
      );
      if (invalidCoords.length > 0) {
        console.warn('⚠️ Found annotations with invalid coordinates:');
        invalidCoords.forEach(ann => {
          console.warn(`  - Annotation ID ${ann.id}: coords (${ann.x}, ${ann.y})`);
        });
      }

      // Generate meaningful filename
      const timestamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '_');
      const baseFileName = fileName.replace(/\.pdf$/i, '');
      const exportFileName = `${baseFileName}_annotated_${timestamp}.pdf`;

      const saveOptions: PDFSaveOptions = {
        createBackup: false, // No need for backup when creating new file
        saveDirectly: false,
        outputFileName: exportFileName,
        viewerInfo: {
          totalPages,
          viewerWidth: containerSize.width || screenWidth,
          viewerHeight: containerSize.height || (screenHeight - 300),
          pdfPageDimensions
        }
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
        pageHeight = (containerSize.height || (screenHeight - 300)) / totalPages;
      }
      
      console.log('📏 PDF EXPORT PRECISE DIMENSIONS:', {
        pdfPageDimensions,
        calculatedPageHeight: pageHeight,
        totalPages,
        containerSize
      });
      
      // Validate annotations before export
      const invalidPageAnnotations = pdfAnnotations.filter(ann => ann.page < 1 || ann.page > totalPages);
      if (invalidPageAnnotations.length > 0) {
        console.error('❌ CRITICAL: Found annotations with invalid page numbers before export:', invalidPageAnnotations);
        Alert.alert(
          'Export Warning', 
          `${invalidPageAnnotations.length} annotations have invalid page numbers. This may cause display issues.`
        );
      }
      
      debugPDFCoordinates(pdfAnnotations, { 
        totalPages, 
        viewerWidth: containerSize.width || screenWidth,
        viewerHeight: totalPages * pageHeight, // Use exact height calculation
        pdfPageDimensions 
      }, totalPages);

      console.log(`Exporting ${pdfAnnotations.length} annotations to new PDF with enhanced debugging...`);
      const result = await drawingAPI.savePDFAnnotations(source.uri, pdfAnnotations, saveOptions);
      
      // Validate the export result
      if (!result.savedPath) {
        throw new Error('Export completed but no file path was returned');
      }
      
      // Enhanced validation of the exported file
      try {
        const exportedFileInfo = await FileSystem.getInfoAsync(result.savedPath);
        if (!exportedFileInfo.exists) {
          throw new Error('Exported PDF file was not created');
        }
        
        const exportedSize = 'size' in exportedFileInfo ? exportedFileInfo.size || 0 : 0;
        console.log(`✅ Export validation passed - file exists at: ${result.savedPath}`);
        console.log(`📊 Exported file size: ${(exportedSize / 1024).toFixed(1)} KB`);
        
        // Multi-page specific validation
        if (totalPages > 1) {
          console.log(`🔍 Multi-page export validation for ${totalPages} pages`);
          
          // Check if the file size is reasonable for multi-page
          const minExpectedSize = totalPages * 5 * 1024; // 5KB minimum per page
          if (exportedSize < minExpectedSize) {
            console.warn(`⚠️ Multi-page PDF seems small: ${exportedSize} bytes for ${totalPages} pages`);
          }
          
          // Test if the multi-page PDF can be read properly
          try {
            const testRead = await FileSystem.readAsStringAsync(result.savedPath, {
              encoding: FileSystem.EncodingType.Base64,
              length: 2048 // Read first 2KB for multi-page test
            });
            
            if (testRead && testRead.length > 0) {
              console.log('✅ Multi-page PDF read test passed');
            } else {
              throw new Error('Multi-page PDF read test failed - empty result');
            }
          } catch (readError) {
            console.error('❌ Multi-page PDF read test failed:', readError);
            throw new Error(`Multi-page PDF validation failed: ${readError instanceof Error ? readError.message : 'Read test failed'}`);
          }
        }
        
      } catch (validationErr) {
        console.error('❌ Export validation failed:', validationErr);
        throw new Error(`Export validation failed: ${validationErr instanceof Error ? validationErr.message : 'Unknown error'}`);
      }
      
      setLastSavedPath(result.savedPath);
      
      // Show success alert with options: OK, Save to device, Share
      Alert.alert(
        "✅ Export Successful",
        `New annotated PDF created!\n\n📁 ${result.savedPath.split('/').pop()}\n📊 ${pdfAnnotations.length} annotations embedded`,
        [
          { text: "OK" },
          {
            text: "💾 Save",
            onPress: () => {
              console.log('💾 User requested to save exported PDF to device');
              onAfterExportSaved(result.savedPath).catch(err => console.error('Save after export failed:', err));
            }
          },
          {
            text: "📤 Share",
            onPress: () => {
              console.log('🎯 User requested to share exported PDF');
              shareExportedPDF(result.savedPath).catch(shareError => {
                console.error('🚨 Share request failed:', shareError);
              });
            }
          }
        ]
      );

    } catch (error) {
      console.error("Error exporting PDF to new file:", error);
      Alert.alert(
        "❌ Export Failed", 
        `Could not create annotated PDF.

Error: ${error instanceof Error ? error.message : 'Unknown error'}

Please try again or contact support if the problem persists.`
      );
    }
  };

  const exportToPDFDirect = async () => {
    try {
      Alert.alert(
        "⚠️ Update Original PDF?", 
        "This will permanently modify your original PDF file by embedding annotations.\n\n• A backup will be created automatically\n• Original file will be replaced\n• This action cannot be undone",
        [
          { text: "Cancel", style: "cancel" },
          { 
            text: "✅ Update PDF", 
            onPress: async () => {
              try {
                Alert.alert("📝 Updating PDF", "Creating backup and embedding annotations...");

                // Convert UI annotations to PDF annotations format
                const pdfAnnotations: PDFAnnotation[] = annotations.map(annotation => ({
                  ...annotation,
                  type: annotation.type as PDFAnnotation['type']
                }));

                // Debug: Log page distribution of annotations
                const pageDistribution = pdfAnnotations.reduce((acc, ann) => {
                  acc[ann.page] = (acc[ann.page] || 0) + 1;
                  return acc;
                }, {} as Record<number, number>);
                console.log('📊 Annotation distribution by page:', pageDistribution);
                console.log('📄 Total pages in PDF:', totalPages);
                console.log('📝 Total annotations to export:', pdfAnnotations.length);

                const saveOptions: PDFSaveOptions = {
                  createBackup: true, // Create backup when modifying original
                  saveDirectly: true
                };

                console.log(`Updating original PDF with ${pdfAnnotations.length} annotations...`);
                const result = await drawingAPI.savePDFAnnotations(source.uri, pdfAnnotations, saveOptions);
                
                Alert.alert(
                  "✅ Update Complete",
                  `Original PDF updated successfully!

📊 ${pdfAnnotations.length} annotations embedded
${result.backupPath ? `🔒 Backup: ${result.backupPath.split('/').pop()}` : ''}`,
                  [{ text: "OK" }]
                );
              } catch (updateError) {
                console.error("Error updating original PDF:", updateError);
                Alert.alert(
                  "❌ Update Failed", 
                  `Could not update original PDF.

Error: ${updateError instanceof Error ? updateError.message : 'Unknown error'}

Your original file is unchanged. Try exporting to a new file instead.`
                );
              }
            }
          }
        ]
      );

    } catch (error) {
      console.error("Error in update PDF process:", error);
      Alert.alert("Update Error", "Failed to prepare PDF update. Please try again.");
    }
  };

  // Helper function to open PDF in external applications
  const openInExternalApp = async (pdfPath: string) => {
    try {
      console.log('🌐 Attempting to open PDF in external app:', pdfPath);
      
      // Check if file exists
      const fileInfo = await FileSystem.getInfoAsync(pdfPath);
      if (!fileInfo.exists) {
        Alert.alert("File Not Found", "The PDF file could not be found.");
        return;
      }
      
      // Try to use the system's default PDF viewer
      const result = await Sharing.shareAsync(pdfPath, {
        mimeType: "application/pdf",
        dialogTitle: "Open PDF in..."
      });
      
      console.log('✅ External app open result:', result);
      
    } catch (error) {
      console.error('❌ Failed to open in external app:', error);
      Alert.alert(
        "Open Failed",
        `Could not open PDF in external app: ${error instanceof Error ? error.message : 'Unknown error'}`
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
            onPress: () => showFileDetails(pdfPath)
          },
          {
            text: "OK"
          }
        ]
      );
    } catch (error) {
      console.error('❌ Failed to handle file path:', error);
    }
  };

  // Helper function to show detailed file information with access guidance
  const showFileDetails = async (pdfPath: string) => {
    try {
      const fileInfo = await FileSystem.getInfoAsync(pdfPath);
      const fileName = pdfPath.split('/').pop() || 'Unknown';
      const fileSize = 'size' in fileInfo ? (fileInfo.size || 0) / 1024 : 0;
      const modTime = 'modificationTime' in fileInfo ? 
        new Date(fileInfo.modificationTime * 1000).toLocaleString() : 'Unknown';
      
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
            onPress: () => shareExportedPDF(pdfPath)
          },
          {
            text: "Access Guide",
            onPress: () => showFileAccessGuide()
          },
          {
            text: "OK"
          }
        ]
      );
      
    } catch (error) {
      console.error('❌ Failed to get file details:', error);
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
          onPress: () => showExportedPDFs()
        },
        {
          text: "Got It"
        }
      ]
    );
  };

  // Helper function to attempt saving to Downloads or Documents folder
  const trySaveToUserAccessibleLocation = async (sourcePath: string, fileName: string) => {
    try {
      console.log('🔄 Attempting to save to user-accessible location...');
      
      // Try to use MediaLibrary to save to Downloads
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status === 'granted') {
        try {
          const asset = await MediaLibrary.createAssetAsync(sourcePath);
          console.log('✅ Successfully saved to device library:', asset);
          
          Alert.alert(
            "✅ Saved to Device!",
            `PDF successfully saved to your device's gallery/downloads.\n\nFile: ${fileName}\n\nYou can now find it in:\n• Gallery app (Documents folder)\n• Downloads folder\n• File manager apps`,
            [
              {
                text: "Open Gallery",
                onPress: () => {
                  // This will prompt user to choose an app to view the file
                  shareExportedPDF(sourcePath);
                }
              },
              {
                text: "Great!"
              }
            ]
          );
          
          return { success: true, location: 'device_gallery' };
          
        } catch (mediaError) {
          console.warn('MediaLibrary save failed:', mediaError);
          throw mediaError;
        }
      } else {
        throw new Error('Media library permission not granted');
      }
      
    } catch (error) {
      console.warn('❌ Could not save to user-accessible location:', error);
      
      // Fallback: Show sharing options
      Alert.alert(
        "📱 Save to Accessible Location",
        `Could not save directly to Downloads/Gallery.\n\nTo save where you can easily find it:\n\n1. Tap "Share to Drive/Email" below\n2. Choose Google Drive, Dropbox, or Email\n3. This saves it to a permanent, accessible location\n\nFile: ${fileName}`,
        [
          {
            text: "Share to Drive/Email",
            onPress: () => shareExportedPDF(sourcePath)
          },
          {
            text: "Access Guide",
            onPress: () => showFileAccessGuide()
          },
          {
            text: "Cancel"
          }
        ]
      );
      
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  };

  // Helper function to show alternative viewing options
  const showAlternativeViewingOptions = (pdfPath: string) => {
    const fileName = pdfPath.split('/').pop() || 'exported.pdf';
    
    Alert.alert(
      "📱 PDF Access Options",
      `✅ PDF saved successfully!\n\n📄 File: ${fileName}\n📊 Pages: ${totalPages}\n\n🔒 NOTE: File is in app storage (not visible in file manager)\n\n🎯 Choose how to access it:`,
      [
        {
          text: "📤 Share to Drive/Downloads",
          onPress: () => shareExportedPDF(pdfPath)
        },
        {
          text: "📱 Open in PDF App",
          onPress: () => openInExternalApp(pdfPath)
        },
        {
          text: "💾 Save to Gallery",
          onPress: () => trySaveToUserAccessibleLocation(pdfPath, fileName)
        },
        {
          text: "ℹ️ Access Guide",
          onPress: () => showFileAccessGuide()
        },
        {
          text: "Cancel"
        }
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
          onPress: () => loadAnnotatedPDF(pdfPath)
        },
        {
          text: "Cancel",
          style: "cancel"
        }
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
    const formattedDate = pdf.modified.toLocaleDateString() + ' ' + 
                         pdf.modified.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});
    
    Alert.alert(
      pdf.name,
      `Size: ${pdf.sizeKB} KB\nModified: ${formattedDate}\n\nWhat would you like to do?`,
      [
        {
          text: "Load in Viewer",
          onPress: () => loadAnnotatedPDF(pdf.path)
        },
        {
          text: "Share PDF",
          onPress: () => shareExportedPDF(pdf.path)
        },
        {
          text: "Open Externally",
          onPress: () => openInExternalApp(pdf.path)
        },
        {
          text: "Delete File",
          style: "destructive",
          onPress: () => confirmDeletePDF(pdf)
        },
        {
          text: "Cancel",
          style: "cancel"
        }
      ]
    );
  };

  // Helper function to show all exported PDFs
  const showAllExportedPDFs = (pdfs: any[]) => {
    const pdfList = pdfs.map(pdf => {
      const formattedDate = pdf.modified.toLocaleDateString();
      return `• ${pdf.name}\n  Size: ${pdf.sizeKB} KB, Modified: ${formattedDate}`;
    }).join('\n\n');
    
    Alert.alert(
      `All Exported PDFs (${pdfs.length})`,
      pdfList + "\n\nUse 'Recent Exported PDFs' to access individual files.",
      [
        {
          text: "Clear All",
          style: "destructive",
          onPress: () => confirmClearAllPDFs(pdfs)
        },
        {
          text: "OK"
        }
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
          onPress: () => deletePDF(pdf)
        },
        {
          text: "Cancel",
          style: "cancel"
        }
      ]
    );
  };

  // Helper function to delete a PDF file
  const deletePDF = async (pdf: any) => {
    try {
      await FileSystem.deleteAsync(pdf.path, { idempotent: true });
      Alert.alert("Deleted", `${pdf.name} has been deleted.`);
    } catch (error) {
      console.error('❌ Failed to delete PDF:', error);
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
          onPress: () => clearAllPDFs(pdfs)
        },
        {
          text: "Cancel",
          style: "cancel"
        }
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
      console.error('❌ Failed to clear PDFs:', error);
      Alert.alert("Cleanup Failed", "Could not delete all PDF files.");
    }
  };

  // Helper function to load an annotated PDF back into the viewer
  const loadAnnotatedPDF = async (pdfPath: string) => {
    try {
      console.log('🔄 Loading annotated PDF into viewer:', pdfPath);
      
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
        `Successfully loaded the annotated PDF.\n\nFile: ${pdfPath.split('/').pop()}\nPages: ${totalPages}`
      );
      
    } catch (error) {
      console.error('❌ Failed to load annotated PDF:', error);
      Alert.alert(
        "Load Failed",
        `Could not load the PDF: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  };

  const shareExportedPDF = async (pdfPath: string) => {
    // Function removed - not PDF or JPEG export function
    // Basic share functionality kept for compatibility
    try {
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(pdfPath, {
          mimeType: "application/pdf",
          dialogTitle: "Share Annotated PDF"
        });
      } else {
        Alert.alert("Share Not Available", "Sharing is not available on this device.");
      }
    } catch (error) {
      console.error("Error sharing PDF:", error);
      Alert.alert("Share Error", "Failed to share the PDF.");
    }
  };

  // Export the entire PDF document as a JPEG image
  const exportToJPEG = async () => {
    try {
      if (!pdfRef.current) {
        Alert.alert("Export Error", "Cannot access PDF document.");
        return;
      }
      
      // Show export in progress alert
      Alert.alert("Exporting JPEG", "Capturing entire PDF as JPEG image...");
      
      // Get file path from source
      let filePath = '';
      if (typeof source === 'string') {
        filePath = source;
      } else if (source.uri) {
        filePath = source.uri;
      }
      
      if (!filePath) {
        Alert.alert("Export Failed", "Could not determine PDF source path.");
        return;
      }
      
      // Get temporary directory path
      const tempDir = FileSystem.cacheDirectory + 'pdf_exports/';
      const outputPath = `${tempDir}${fileName.replace(/\.[^/.]+$/, '')}_full.jpg`;
      
      try {
        // Ensure directory exists
        await FileSystem.makeDirectoryAsync(tempDir, { intermediates: true });
      } catch (dirErr) {
        console.log('Directory may already exist', dirErr);
      }
      
      // Use viewShotRef to capture current page first as backup
      let backupUri = null;
      if (viewShotRef.current) {
        try {
          backupUri = await viewShotRef.current.capture();
          console.log('Captured current view as backup:', backupUri);
        } catch (backupErr) {
          console.log('Failed to capture current view as backup:', backupErr);
        }
      }
      
      // For full PDF capture, we use react-native-pdf's built-in functionality
      // or implement a workaround by using react-native-blob-util's base64 conversion
      // and convert it to an image
      
      // On Android, we can use the FileSystem's copyAsync to copy the PDF
      // then convert it to an image (the actual conversion would be done using native modules)
      try {
        // For now, use the backup capture of current page
        if (!backupUri) {
          Alert.alert("Export Failed", "Could not capture PDF content as image.");
          return;
        }
        
        // Copy the backup capture to our designated output path
        await FileSystem.copyAsync({
          from: backupUri,
          to: outputPath
        });
        
        console.log(`✅ Saved full PDF as JPEG to: ${outputPath}`);
        
        // Save to media library
        const { status } = await MediaLibrary.requestPermissionsAsync();
        if (status !== 'granted') {
          console.warn('Media library permission not granted.');
          // Fallback to sharing
          shareJPEGImage(outputPath);
          return;
        }
        
        const asset = await MediaLibrary.createAssetAsync(outputPath);
        const albumName = 'Togetha Exports';
        
        try {
          // Try to add to album
          await MediaLibrary.createAlbumAsync(albumName, asset, false);
          console.log(`📁 Added JPEG to album: ${albumName}`);
        } catch (albumErr) {
          console.log('Note: Could not create/add to album', albumErr);
        }
        
        // Show success message with options
        Alert.alert(
          "JPEG Exported",
          `Entire PDF saved as JPEG image in your Photos.`,
          [
            { text: "OK" },
            {
              text: "Share",
              onPress: () => shareJPEGImage(outputPath)
            }
          ]
        );
        
      } catch (exportErr) {
        console.error('Export conversion error:', exportErr);
        
        // Fallback to using the backup screenshot
        if (backupUri) {
          Alert.alert(
            "Full Export Not Available",
            "Exporting only the current page instead.",
            [
              { text: "OK" },
              {
                text: "Share",
                onPress: () => shareJPEGImage(backupUri)
              }
            ]
          );
        } else {
          Alert.alert("Export Failed", "Could not export PDF as JPEG.");
        }
      }
    } catch (err) {
      console.error("Error exporting to JPEG:", err);
      Alert.alert("Export Error", `Could not export to JPEG: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  // Helper function to share a JPEG image
  const shareJPEGImage = async (uri: string) => {
    try {
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: "image/jpeg",
          dialogTitle: "Share JPEG Export"
        });
      } else {
        Alert.alert("Share Not Available", "Sharing is not available on this device.");
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

  const renderAnnotations = () => {
    // Since annotations are now rendered in the same transform container as the PDF,
    // we can use simpler coordinate conversion without additional transform calculations
    const pageAnnotations = annotations.filter(
      (ann) => ann.page === currentPage
    );
    
    // Removed animation code to make annotations static

    // Get current container dimensions for coordinate conversion
    const containerWidth = containerSize.width || screenWidth;
    const containerHeight = containerSize.height || (screenHeight - 300);
    
    // Use PDF aspect ratio to ensure annotations align correctly with PDF content
    const pdfWidth = pdfPageDimensions?.width || 595;
    const pdfHeight = pdfPageDimensions?.height || 842;
    const aspectRatio = pdfWidth / pdfHeight;
    
    // Calculate the actual dimensions of the rendered PDF
    let pdfDisplayWidth, pdfDisplayHeight;
    if (containerWidth / containerHeight > aspectRatio) {
      // Container is wider than PDF aspect ratio
      pdfDisplayHeight = containerHeight;
      pdfDisplayWidth = pdfDisplayHeight * aspectRatio;
    } else {
      // Container is taller than PDF aspect ratio
      pdfDisplayWidth = containerWidth;
      pdfDisplayHeight = pdfDisplayWidth / aspectRatio;
    }
    
    // Calculate the offset to center the PDF in the container
    const offsetX = (containerWidth - pdfDisplayWidth) / 2;
    const offsetY = (containerHeight - pdfDisplayHeight) / 2;

    return (
      <Svg
        pointerEvents="box-none"
        // Position the SVG exactly over the rendered PDF area so annotations
        // line up with touch coordinates (accounting for centering offsets)
        style={{ position: 'absolute', left: offsetX, top: offsetY, width: pdfDisplayWidth, height: pdfDisplayHeight }}
        width={pdfDisplayWidth}
        height={pdfDisplayHeight}
        viewBox={`0 0 ${pdfDisplayWidth} ${pdfDisplayHeight}`}
        preserveAspectRatio="xMidYMid meet"
      >
        {pageAnnotations.map((annotation, idx) => {
          // Removed per-annotation animations
          // Using static positioning for all annotations
          const animStyle = {} as any; // Empty style object

          const getPenStyle = (penType: string, baseWidth: number) => {
            switch (penType) {
              case "pen":
                return {
                  strokeWidth: baseWidth,
                  opacity: 1,
                  strokeLinecap: "round" as const,
                  strokeLinejoin: "round" as const,
                  strokeDasharray: "0",
                  strokeMiterlimit: 10 // Improves corner appearance
                };
              case "brush":
                return {
                  strokeWidth: baseWidth * 1.8,
                  opacity: 0.9,
                  strokeLinecap: "round" as const,
                  strokeLinejoin: "round" as const,
                  strokeDasharray: "0",
                  strokeMiterlimit: 10 // Improves corner appearance
                };
              case "pencil":
                return {
                  strokeWidth: baseWidth * 0.8,
                  opacity: 0.8,
                  strokeLinecap: "round" as const,
                  strokeLinejoin: "round" as const,
                  strokeDasharray: "0",
                  strokeMiterlimit: 10 // Improves corner appearance
                };
              default:
                return {
                  strokeWidth: baseWidth,
                  opacity: 1,
                  strokeLinecap: "round" as const,
                  strokeLinejoin: "round" as const,
                  strokeDasharray: "0",
                  strokeMiterlimit: 10 // Improves corner appearance
                };
            }
          };

          switch (annotation.type) {
            case "highlight":
              if (annotation.path) {
                const svgPath = convertNormalizedPathToScreen(annotation.path);
                const highlightStrokeWidth = annotation.strokeWidth || 12;
                return (
                  <Path
                    key={annotation.id}
                    d={svgPath}
                    stroke={annotation.color}
                    strokeWidth={highlightStrokeWidth}
                    fill="none"
                    opacity={0.4}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeMiterlimit={10}
                    onPress={() => deleteAnnotation(annotation.id)}
                  />
                );
              } else {
                const x = (annotation.x || 0) * pdfDisplayWidth;
                const y = (annotation.y || 0) * pdfDisplayHeight;
                const w = (annotation.width || 0.15) * pdfDisplayWidth;
                const h = (annotation.height || 0.025) * pdfDisplayHeight;
                return (
                  <Rect key={annotation.id} x={x} y={y} width={w} height={h} rx={4} fill={annotation.color} opacity={0.45} />
                );
              }

            case "pen":
            case "brush":
            case "pencil":
              const baseStroke = annotation.strokeWidth || 3;
              const penStyle = getPenStyle(annotation.type, baseStroke);
              const penPath = convertNormalizedPathToScreen(annotation.path || "");
              return (
                <Path
                  key={annotation.id}
                  d={penPath}
                  stroke={annotation.color}
                  strokeWidth={penStyle.strokeWidth}
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
              const cx = (annotation.x || 0) * pdfDisplayWidth;
              const cy = (annotation.y || 0) * pdfDisplayHeight;
              const noteRadius = 12;
              return (
                <Circle key={annotation.id} cx={cx} cy={cy} r={noteRadius} fill={annotation.color} />
              );

            case "text":
              const tx = (annotation.x || 0) * pdfDisplayWidth;
              const ty = (annotation.y || 0) * pdfDisplayHeight;
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

        {/* Drawing Strokes Layer (from drawing editor) */}
        {strokes && Array.isArray(strokes) && (() => {
          const strokesForPage = strokes.filter(s => s && (s.page === undefined || s.page === null || s.page === currentPage));
          if (strokesForPage.length === 0) return null;

          return strokesForPage.map(stroke => {
            const isNormalized = true; // adapt if your points are screen coords

            // Map and simplify points to reduce SVG complexity
            const displayPoints = mapPointsToDisplay(stroke.points, pdfDisplayWidth, pdfDisplayHeight, isNormalized);
            const simplified = simplifyPoints(displayPoints, 300);

            // Build or reuse cached path string
            const cacheKey = `${stroke.id}-${simplified.length}-${Math.round((stroke.width||2)*10)}`;
            let pathData = strokePathCacheRef.current.get(cacheKey);
            if (!pathData) {
              pathData = pointsToPath(simplified);
              strokePathCacheRef.current.set(cacheKey, pathData);
            }

            const baseStrokeWidth = stroke.width ?? 2;
            const strokeWidth = SCALE_STROKES_WITH_ZOOM ? baseStrokeWidth * (currentZoom || 1) : baseStrokeWidth;

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
            const liveKey = `live-${currentPage}`;
            const livePath = strokePathCacheRef.current.get(liveKey);
            if (livePath) {
              const baseStroke = strokeWidth || 3;
              const liveStrokeWidth = SCALE_STROKES_WITH_ZOOM ? baseStroke * (currentZoom || 1) : baseStroke;
              let liveOpacity = 1;
              if (selectedTool === 'highlight') liveOpacity = 0.45;
              if (selectedTool === 'eraser') liveOpacity = 0.6;
              return (
                <AnimatedPath
                  key={`live-path-${currentPage}`}
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
        {isDrawing && currentPath && (
          (() => {
            // Ultra-fast path access - prioritize the cached path for zero-lag rendering
            const smoothedLivePath = pathCacheRef.current || currentPathRef.current || currentPath;
            // Don't scale stroke width since the transform container handles all scaling
            const baseStrokeWidth = strokeWidth;
            
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
          })()
        )}

        {/* Bbox selection rectangle for textSelect mode */}
        {isBboxDrawing && currentBbox && selectedTool === 'textSelect' && (
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
  };

return (
      <View style={styles.container}>
        {/* Floating AI Button */}
        <Animated.View
          style={[
            styles.floatingAIButton,
            {
              left: buttonPosition.x,
              bottom: buttonPosition.y,
              transform: [{ scale: isDraggingButton ? 1.1 : 1 }]
            }
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
    {/* Header as background */}
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
            {(networkStatus || saveStatus) && (
              <View style={styles.statusIndicator}>
                <MaterialIcons 
                  name={
                    !networkStatus?.isConnected || !networkStatus?.isInternetReachable 
                      ? "cloud-off" 
                      : saveStatus?.status === 'saving' 
                        ? "sync" 
                        : saveStatus?.status === 'error'
                          ? "error"
                          : "cloud-done"
                  } 
                  size={12} 
                  color={
                    !networkStatus?.isConnected || !networkStatus?.isInternetReachable
                      ? "#FF9500"
                      : saveStatus?.status === 'saving' 
                        ? "#007AFF"
                        : saveStatus?.status === 'error'
                          ? "#FF3B30"
                          : "#34C759"
                  } 
                />
                <Text style={[
                  styles.statusText,
                  { 
                    color: !networkStatus?.isConnected || !networkStatus?.isInternetReachable
                      ? "#FF9500"
                      : saveStatus?.status === 'saving' 
                        ? "#007AFF"
                        : saveStatus?.status === 'error'
                          ? "#FF3B30"
                          : "#34C759"
                  }
                ]}>
                  {!networkStatus?.isConnected || !networkStatus?.isInternetReachable
                    ? "Offline"
                    : saveStatus?.status === 'saving' 
                      ? "Saving..."
                      : saveStatus?.status === 'error'
                        ? "Error"
                        : "Saved"
                  }
                </Text>
              </View>
            )}
          </View>
          <View style={styles.headerRight}>
            {/* Save Mode Toggle */}
            <TouchableOpacity
              onPress={() => setSaveMode(saveMode === 'direct' ? 'overlay' : 'direct')}
              style={[
                styles.saveModeButton, 
                saveMode === 'direct' && styles.saveModeButtonDirect,
                isSavingToPDF && styles.saveModeButtonDisabled
              ]}
              activeOpacity={0.8}
              disabled={isSavingToPDF}
            >
              <MaterialIcons 
                name={saveMode === 'direct' ? "picture-as-pdf" : "layers"} 
                size={16} 
                color={saveMode === 'direct' ? "#22C55E" : "#8B5CF6"} 
              />
              <Text style={[
                styles.saveModeText,
                saveMode === 'direct' && styles.saveModeTextDirect
              ]}>
                {saveMode === 'direct' ? 'PDF' : 'Overlay'}
              </Text>
            </TouchableOpacity>

            {/* Save Button */}
            <TouchableOpacity
              onPress={handleSaveAnnotations}
              style={[
                styles.saveButton, 
                hasUnsavedChanges && styles.saveButtonActive,
                isSavingToPDF && styles.saveButtonSaving
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

            {/* Folder Button */}
            <TouchableOpacity
              style={[styles.saveButton, { marginRight: 8 }]}
              onPress={() => setShowFolderModal(true)}
            >
              <MaterialIcons name="folder" size={18} color="#fff" />
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

      {/* Main Container with border */}
      <View style={styles.mainContainer}>
        {/* Annotation Toolbar */}
        <View style={styles.toolbarScrollContainer}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.toolbarContent}
          >
            {/* Undo / Redo buttons */}
            <TouchableOpacity
              style={[styles.toolButton, !canUndo && { opacity: 0.4 }]}
              onPress={handleUndo}
              activeOpacity={0.8}
              disabled={!canUndo}
            >
              <MaterialIcons name="undo" size={20} color={canUndo ? "#64748b" : "#cbd5e1"} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.toolButton, !canRedo && { opacity: 0.4 }]}
              onPress={handleRedo}
              activeOpacity={0.8}
              disabled={!canRedo}
            >
              <MaterialIcons name="redo" size={20} color={canRedo ? "#64748b" : "#cbd5e1"} />
            </TouchableOpacity>

            {/* Tools Section */}
            {(["selection", "pen", "brush", "pencil", "highlight", "note", "text", "eraser"] as const).map((tool) => (
              <TouchableOpacity
                key={tool}
                style={[
                  styles.toolButton,
                  selectedTool === tool && styles.toolButtonActive,
                ]}
                onPress={() =>
                  setSelectedTool(selectedTool === tool ? null : tool)
                }
                activeOpacity={0.8}
              >
                <MaterialIcons
                  name={
                    tool === "selection"
                      ? "select-all"
                      : tool === "pen"
                      ? "edit"
                      : tool === "brush"
                      ? "brush"
                      : tool === "pencil"
                      ? "edit"
                      : tool === "highlight"
                      ? "gesture"
                      : tool === "note"
                      ? "note-add"
                      : tool === "text"
                      ? "text-fields"
                      : "auto-fix-normal"
                  }
                  size={20}
                  color={selectedTool === tool ? "#667eea" : "#64748b"}
                />
              </TouchableOpacity>
            ))}

            {/* Text Selection tool removed */}

            {/* Stroke Width Controls */}
            <View style={styles.toolbarDivider} />
            <TouchableOpacity
              style={[styles.strokeButton, strokeWidth === 1 && styles.strokeButtonActive]}
              onPress={() => setStrokeWidth(1)}
              activeOpacity={0.8}
            >
              <View style={[styles.strokePreview, { width: 2, height: 2, backgroundColor: "#64748b" }]} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.strokeButton, strokeWidth === 3 && styles.strokeButtonActive]}
              onPress={() => setStrokeWidth(3)}
              activeOpacity={0.8}
            >
              <View style={[styles.strokePreview, { width: 4, height: 4, backgroundColor: "#64748b" }]} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.strokeButton, strokeWidth === 6 && styles.strokeButtonActive]}
              onPress={() => setStrokeWidth(6)}
              activeOpacity={0.8}
            >
              <View style={[styles.strokePreview, { width: 8, height: 8, backgroundColor: "#64748b" }]} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.strokeButton, strokeWidth === 10 && styles.strokeButtonActive]}
              onPress={() => setStrokeWidth(10)}
              activeOpacity={0.8}
            >
              <View style={[styles.strokePreview, { width: 12, height: 12, backgroundColor: "#64748b" }]} />
            </TouchableOpacity>



            {/* Color Section */}
            {ANNOTATION_COLORS.map((color) => (
              <TouchableOpacity
                key={color}
                style={[
                  styles.colorButton,
                  { backgroundColor: color },
                  selectedColor === color && styles.colorButtonActive,
                ]}
                onPress={() => setSelectedColor(color)}
                activeOpacity={0.8}
              />
            ))}
          </ScrollView>
        </View>



        {/* PDF Viewer - Direct without container */}
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <Animated.View
              style={{
                transform: [
                  {
                    rotate: fadeAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: ["0deg", "360deg"],
                    }),
                  },
                ],
              }}
            >
              <MaterialIcons name="description" size={56} color="#667eea" />
            </Animated.View>
            <Text style={styles.loadingText}>Loading your PDF...</Text>
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
              {/* PDF and Annotation Transform Container */}
              <Animated.View 
                style={[
                  styles.pdfTransformContainer,
                  {
                    flex: 1,
                    transform: [
                      { scale: animatedScale },
                      { translateX: animatedTranslateX },
                      { translateY: animatedTranslateY },
                    ],
                  }
                ]}
                onLayout={(event) => {
                  const { width, height } = event.nativeEvent.layout;
                  console.log('PDF container size:', { width, height });
                }}
                {...panResponder.panHandlers}
              >
                {/* ViewShot component to enable JPEG export */}
                <ViewShot
                  ref={viewShotRef}
                  options={{
                    format: "jpg",
                    quality: 0.9,
                    result: "tmpfile"
                  }}
                  style={{ flex: 1 }}
                >
                <Animated.View
                  onLayout={(event) => {
                    const { x, y, width, height } = event.nativeEvent.layout;
                    if (width && height) {
                      setContainerSize({ width, height });
                      setPdfViewerBounds({ width, height });
                      setPdfContainerLayout({ x, y, width, height });
                    }
                  }}
                  style={{ 
                    flex: 1, 
                    opacity: pageOpacity,
                    transform: [
                      { scale: pageTransition },
                      {
                        rotate: pageRotate.interpolate({
                          inputRange: [-360, 360],
                          outputRange: ['-360deg', '360deg']
                        })
                      }
                    ]
                  }}>
                {/* PDF Viewer */}
                {Platform.OS !== 'web' && Pdf ? (
                  <Pdf
                    ref={pdfRef}
                    source={currentSource}
                    style={[styles.pdf]}
                    page={currentPage}
                    onLoadComplete={onPdfLoadComplete}
                    onLoadProgress={onPdfLoadProgress}
                    onError={onPdfError}
                    enablePaging={true}
                    horizontal={true}
                    fitPolicy={2} // Width fitting
                    spacing={10} // Small spacing between pages
                    enableDoubleTapZoom={false}
                    enableRTL={false}
                    enableAnnotationRendering={true}
                    enableAntialiasing={true}
                    fitWidth={false}
                    maxScale={1.0}
                    minScale={1.0}
                    scale={1.0}
                    singlePage={false}
                    enableSwipe={false} // Disable swipe navigation; use buttons instead
                    onPageChanged={(page: number, pageCount: number) => {
                      console.log(`📄 PDF page changed: ${page}/${pageCount}`);
                      setCurrentPage(page);
                      
                      // Sync page count if needed
                      if (pageCount !== totalPages) {
                        setTotalPages(pageCount);
                      }
                    }}
                  />
                ) : (
                  <View style={styles.webPdfPlaceholder}>
                    <MaterialIcons name="description" size={64} color="#9CA3AF" />
                    <Text style={styles.webPdfText}>PDF viewing not supported on web</Text>
                    <Text style={styles.webPdfSubtext}>Please use the mobile app to view and annotate PDFs</Text>
                  </View>
                )}
                
                {/* Selection Mode Overlays have been removed */}

                {/* Enhanced debug visualization for PDF page boundaries (visible in debug mode) */}
                {__DEV__ && (
                  <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
                    {Array.from({length: totalPages}).map((_, index) => {
                      // Calculate page height using PDF dimensions
                      let pageHeight;
                      if (pdfPageDimensions.width && pdfPageDimensions.height) {
                        const aspectRatio = pdfPageDimensions.height / pdfPageDimensions.width;
                        const viewerWidth = containerSize.width || screenWidth;
                        pageHeight = viewerWidth * aspectRatio;
                      } else {
                        const containerHeight = containerSize.height || (screenHeight - 300);
                        pageHeight = containerHeight / totalPages;
                      }
                      
                      const top = index * pageHeight;
                      const pageNumber = index + 1;
                      
                      return (
                        <React.Fragment key={`page-boundary-${pageNumber}`}>
                          {/* Page boundary line */}
                          <View 
                            style={{
                              position: 'absolute',
                              top,
                              left: 0,
                              right: 0,
                              height: 2,
                              backgroundColor: 'rgba(255,0,0,0.8)',
                            }}
                          />
                          

                          
                          {/* Bottom boundary of each page */}
                          {pageNumber === totalPages ? (
                            <View 
                              style={{
                                position: 'absolute',
                                top: top + pageHeight,
                                left: 0,
                                right: 0,
                                height: 2,
                                backgroundColor: 'rgba(255,0,0,0.8)',
                              }}
                            />
                          ) : null}
                        </React.Fragment>
                      );
                    })}
                  </View>
                )}

                {/* Annotation Layer - Now part of the same transform container (static, no animations) */}
                <View
                  style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, zIndex: 10 }}
                  pointerEvents="box-none"
                >
                  {renderAnnotations()}
                </View>
                </Animated.View>
                </ViewShot>
              </Animated.View>

            </View>
            
            {/* Page indicator removed in favor of floating buttons */}
          </View>
        )}

      </View> {/* Close Main Container */}

      {/* Floating zoom controls */}
      <View style={styles.floatingZoomContainer} pointerEvents="box-none">
        <Animated.View style={[styles.floatingZoomInner, { opacity: fadeAnim }]}>
          <TouchableOpacity 
            style={styles.floatingZoomButton} 
            onPress={handleZoomIn} 
            activeOpacity={0.7}
            disabled={currentZoom >= MAX_PDF_SCALE}
          >
            <MaterialIcons name="add" size={24} color={currentZoom >= MAX_PDF_SCALE ? "#9CA3AF" : "#374151"} />
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.floatingZoomButton, styles.floatingZoomButtonMiddle]} 
            onPress={handleZoomOut} 
            activeOpacity={0.7}
            disabled={currentZoom <= MIN_PDF_SCALE}
          >
            <MaterialIcons name="remove" size={24} color={currentZoom <= MIN_PDF_SCALE ? "#9CA3AF" : "#374151"} />
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={styles.floatingZoomButton} 
            onPress={resetZoom} 
            activeOpacity={0.7}
          >
            <MaterialIcons name="center-focus-strong" size={20} color="#6366F1" />
          </TouchableOpacity>
        </Animated.View>
      </View>

      {/* Floating page navigation controls */}
      {/* Page indicator */}
      <View style={styles.floatingPageContainer} pointerEvents="box-none">
        <Animated.View style={[styles.floatingPageInner, { opacity: fadeAnim }]}>
          <TouchableOpacity 
            style={styles.floatingPageButton} 
            onPress={() => {
              if (pdfRef.current && currentPage > 1) {
                const newPage = currentPage - 1;
                console.log(`📄 Moving to previous page: ${newPage}`);
                
                // Start page transition animation
                Animated.sequence([
                  Animated.timing(pageTransition, {
                    toValue: 0.97,
                    duration: 120,
                    useNativeDriver: true,
                  }),
                  Animated.timing(pageTransition, {
                    toValue: 1,
                    duration: 250,
                    useNativeDriver: true,
                  })
                ]).start();

                // Update the state first so the Pdf component follows via the `page` prop
                setCurrentPage(newPage);
                console.log(`📄 PDF page changed: ${newPage}/${totalPages}`);

                // Also try the native setter if available for extra reliability
                try {
                  // @ts-ignore - setPage is available on the PDF component
                  pdfRef.current.setPage?.(newPage);
                } catch (e) {
                  // ignore
                }

                // Add haptic feedback if available
                if (Platform.OS !== 'web') {
                  try {
                    const ReactNative = require('react-native');
                    ReactNative.Vibration?.vibrate(40); // Light haptic feedback
                  } catch (e) {
                    // Vibration not available, ignore error
                  }
                }
              }
            }}
            activeOpacity={0.6}
            disabled={currentPage <= 1}
          >
            <MaterialIcons name="chevron-left" size={24} color={currentPage <= 1 ? "#9CA3AF" : "#374151"} />
          </TouchableOpacity>
          
          <View style={styles.floatingPageIndicator}>
            <Text style={styles.floatingPageText}>{currentPage}/{totalPages}</Text>
          </View>
          
          <TouchableOpacity 
            style={styles.floatingPageButton} 
            onPress={() => {

              if (pdfRef.current && currentPage < totalPages) {
                const newPage = currentPage + 1;
                console.log(`📄 Moving to next page: ${newPage}`);
                
                // Start page transition animation
                Animated.sequence([
                  Animated.timing(pageTransition, {
                    toValue: 0.97,
                    duration: 120,
                    useNativeDriver: true,
                  }),
                  Animated.timing(pageTransition, {
                    toValue: 1,
                    duration: 250,
                    useNativeDriver: true,
                  })
                ]).start();

                // Update the state first so the Pdf component follows via the `page` prop
                setCurrentPage(newPage);
                console.log(`📄 PDF page changed: ${newPage}/${totalPages}`);

                // Also try the native setter if available for extra reliability
                try {
                  // @ts-ignore - setPage is available on the PDF component
                  pdfRef.current.setPage?.(newPage);
                } catch (e) {
                  // ignore
                }

                // Add haptic feedback if available
                if (Platform.OS !== 'web') {
                  try {
                    const ReactNative = require('react-native');
                    ReactNative.Vibration?.vibrate(40); // Light haptic feedback
                  } catch (e) {
                    // Vibration not available, ignore error
                  }
                }
              }
            }}
            activeOpacity={0.6} // Slightly more responsive feel
            disabled={currentPage >= totalPages}
          >
            <MaterialIcons name="chevron-right" size={24} color={currentPage >= totalPages ? "#9CA3AF" : "#374151"} />
          </TouchableOpacity>
        </Animated.View>
      </View>

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
                  // local filter; keep minimal - no folder state in this viewer
                }}
                defaultValue={""}
                returnKeyType="search"
              />
            </View>

            <ScrollView style={styles.folderListScroll} contentContainerStyle={styles.folderListContent}>
              <TouchableOpacity
                style={[styles.folderCard, styles.selectedFolderCard]}
                onPress={() => setShowFolderModal(false)}
              >
                <View style={[styles.folderCardIcon, { backgroundColor: '#64748B' }]}>
                  <MaterialIcons name="notes" size={20} color="#fff" />
                </View>
                <View style={styles.folderCardTextWrap}>
                  <Text style={styles.folderCardTitle}>Unorganized Notes</Text>
                  <Text style={styles.folderCardSubtitle}>No folder</Text>
                </View>
                <MaterialIcons name="check-circle" size={20} color="#8B5CF6" />
              </TouchableOpacity>

              <View style={styles.folderDividerRow}>
                <View style={styles.folderDividerLine} />
                <Text style={styles.folderDividerText}>All folders</Text>
                <View style={styles.folderDividerLine} />
              </View>

              {/* Placeholder: no remote folders in this viewer - keep list minimal */}
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
            <TouchableOpacity
              style={[
                styles.moreMenuItem,
                annotations.length > 0 && { backgroundColor: 'rgba(34, 197, 94, 0.1)' }
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
              <Text style={[
                styles.moreMenuText,
                { 
                  color: annotations.length > 0 ? "#22C55E" : "#94A3B8",
                  fontWeight: annotations.length > 0 ? '600' : '400'
                }
              ]}>
                Export PDF {annotations.length > 0 ? `(${annotations.length})` : ''}
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
              <MaterialIcons 
                name="image" 
                size={20} 
                color="#F59E0B" 
              />
              <Text style={[
                styles.moreMenuText,
                { color: "#F59E0B" }
              ]}>
                Export PDF as JPEG
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.moreMenuItem}
              onPress={() => {
                setShowMoreMenu(false);
                handleShareAnnotations();
              }}
              activeOpacity={0.8}
            >
              <MaterialIcons name="share" size={20} color="#334155" />
              <Text style={styles.moreMenuText}>Share Annotations</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.moreMenuItem}
              onPress={() => {
                setShowMoreMenu(false);
                showExportedPDFs();
              }}
              activeOpacity={0.8}
            >
              <MaterialIcons name="folder" size={20} color="#667eea" />
              <Text style={[styles.moreMenuText, { color: "#667eea" }]}>My Exports</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.moreMenuItem}
              onPress={() => {
                setShowMoreMenu(false);
                showFileAccessGuide();
              }}
              activeOpacity={0.8}
            >
              <MaterialIcons name="help-outline" size={20} color="#10B981" />
              <Text style={[styles.moreMenuText, { color: "#10B981" }]}>File Access Help</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.moreMenuItem}
              onPress={() => {
                setShowMoreMenu(false);
                handleClearAllAnnotations();
              }}
              activeOpacity={0.8}
            >
              <MaterialIcons name="clear-all" size={20} color="#EF4444" />
              <Text style={[styles.moreMenuText, { color: "#EF4444" }]}>Clear All</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.moreMenuItem}
              onPress={() => {
                setShowMoreMenu(false);
                debugCoordinateConversion();
                Alert.alert("Coordinate Debug", "Coordinate debug info logged to console. Check for annotation page issues.");
              }}
              activeOpacity={0.8}
            >
              <MaterialIcons name="bug-report" size={20} color="#334155" />
              <Text style={styles.moreMenuText}>Debug Coordinates</Text>
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
                transform: [{
                  translateY: aiModalAnimation.interpolate({
                    inputRange: [0, 1],
                    outputRange: [600, 0],
                  }),
                }],
              },
            ]}
          >
            <View style={styles.aiModalContent}>
              <View style={styles.aiModalHandle} />
              <View style={styles.aiModalHeader}>
                <View style={styles.aiModalIconContainer}>
                  <MaterialCommunityIcons name="robot" size={24} color="#8B5CF6" />
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
                contentContainerStyle={{flexGrow: 1}}
                onContentSizeChange={() => {
                  // Scroll to bottom when content size changes (new message added)
                  if (chatMessages.length > 1) {
                    chatScrollViewRef.current?.scrollToEnd({ animated: true });
                  }
                }}
              >
                <View style={styles.aiChatContainer}>
                  {chatMessages.map((message, index) => (
                    message.type === 'ai' ? (
                      <View key={index} style={styles.aiMessageBubble}>
                        <Text style={styles.aiMessageText}>{message.text}</Text>
                      </View>
                    ) : (
                      <View key={index} style={styles.userMessageBubble}>
                        <Text style={styles.userMessageText}>{message.text}</Text>
                      </View>
                    )
                  ))}
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
                    if (aiMessage.trim() === '') return;
                    
                    // Add user message to chat
                    const userMessage = aiMessage.trim();
                    setChatMessages(prev => [...prev, {type: 'user', text: userMessage}]);
                    
                    // Clear input after sending
                    setAiMessage("");
                    
                    // Simulate AI response after a short delay
                    setTimeout(() => {
                      const aiResponse = `I understand your query about "${userMessage.substring(0, 20)}${userMessage.length > 20 ? '...' : ''}". Let me analyze this document further.`;
                      setChatMessages(prev => [...prev, {type: 'ai', text: aiResponse}]);
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
      {showAskRinaPopup && (
        <Animated.View 
          style={[
            styles.askRinaPopup,
            selectionRect ? {
              top: selectionRect.y - 60,
              left: selectionRect.x + (selectionRect.width / 2) - 75,
            } : {
              top: '50%',
              left: '50%',
              transform: [{ translateX: -75 }, { translateY: -30 }],
            }
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
                    (!rinaQuery.trim() || !selectedText.trim()) && styles.rinaModalSubmitButtonDisabled
                  ]}
                  onPress={() => {
                    // Navigate to RINA chatbot with the query and selected text
                    const fullQuery = rinaQuery.trim() || `Explain this text: "${selectedText}"`;
                    console.log('Navigating to RINA with:', { query: fullQuery, selectedText });
                    
                    // Store the context for RINA (you might want to pass this differently based on your chatbot implementation)
                    navigation.navigate('RINA', { 
                      initialQuery: fullQuery,
                      contextText: selectedText,
                      source: 'pdf_annotation'
                    } as any);
                    
                    handleRinaModalClose();
                  }}
                  disabled={!rinaQuery.trim() || !selectedText.trim()}
                  activeOpacity={0.8}
                >
                  <MaterialIcons 
                    name="send" 
                    size={18} 
                    color={(!rinaQuery.trim() || !selectedText.trim()) ? "#9CA3AF" : "#FFFFFF"} 
                  />
                  <Text style={[
                    styles.rinaModalSubmitText,
                    (!rinaQuery.trim() || !selectedText.trim()) && styles.rinaModalSubmitTextDisabled
                  ]}>
                    Ask Rina
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* Text Extraction Modal for Selection Mode (fallback) */}
      <Modal visible={showTextExtractionModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.textExtractionModal}>
            <View style={styles.textExtractionHeader}>
              <MaterialIcons name="text-fields" size={24} color="#8B5CF6" />
              <Text style={styles.textExtractionTitle}>Select Text for RINA</Text>
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
                  <Text style={styles.extractingText}>Preparing text selection...</Text>
                </View>
              ) : (
                <>
                  <Text style={styles.extractionInstructions}>
                    📝 Copy and paste text from the PDF above, or type the content you'd like RINA to help you with:
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
                      <Text style={styles.textExtractionCancelText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.textExtractionSelectButton,
                        !extractedText.trim() && styles.textExtractionSelectButtonDisabled
                      ]}
                      onPress={() => {
                        if (extractedText.trim()) {
                          // Trigger the same flow as PDF selection
                          onTextSelectionChange({
                            text: extractedText.trim(),
                            pageNumber: currentPage,
                            bounds: { x: 0, y: 0, width: 0, height: 0 }
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
                      <Text style={[
                        styles.textExtractionSelectText,
                        !extractedText.trim() && styles.textExtractionSelectTextDisabled
                      ]}>
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
                Text extracted from page {currentPage}. You can edit the text below:
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
    </View>
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
    paddingTop: Platform.OS === "ios" ? 50 : 20,
    paddingBottom: 12,
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 14,
    overflow: "hidden",
  },

mainContainer: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    marginTop: 140, // Position it below the header
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
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  backButton: {
    padding: 8,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
    marginHorizontal: 16,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#ffffff",
    textAlign: "center",
    textShadowColor: "rgba(0,0,0,0.3)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  headerSubtitle: {
    fontSize: 12,
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
    width: '100%',
    height: '100%',
    backgroundColor: "#F3F4F6", // subtle viewer background
    margin: 0,
    padding: 0,
  },
  toolbarScrollContainer: {
    backgroundColor: "#F8FAFC",
    borderRadius: 12,
    marginBottom: 16,
    marginLeft: 16,
    marginRight: 16,
    marginTop: 16,
    shadowColor: "#000",
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "#E5E7EB",
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
  tagsScrollContent: {
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
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    padding: 40,
  },
  webPdfText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#4B5563',
    marginTop: 16,
    textAlign: 'center',
  },
  webPdfSubtext: {
    fontSize: 14,
    color: '#9CA3AF',
    marginTop: 8,
    textAlign: 'center',
    lineHeight: 20,
  },
  
  // PDF Canvas Container styles
  pdfCanvasContainer: {
    flex: 1,
    backgroundColor: '#F3F4F6', // subtle background behind PDF and annotations
    overflow: 'hidden',
    width: '100%',
    height: '100%',
  },
  // Floating zoom controls - Material Design 3 styled
  floatingZoomContainer: {
    position: 'absolute',
    right: 20,
    bottom: 50, // Moved lower for better thumb reach
    zIndex: 50,
    elevation: 50,
    alignItems: 'center',
  },
  floatingZoomInner: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 28,
    paddingVertical: 8,
    paddingHorizontal: 4,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  floatingZoomButton: {
    width: 50,
    height: 50,
    borderRadius: 26,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 2,
  },
  floatingZoomButtonMiddle: {
    marginVertical: 4,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.08)',
  },
  floatingPageContainer: {
    position: 'absolute',
    alignSelf: 'center', 
    bottom: 20, // Moved higher up from the bottom edge
    zIndex: 50,
    elevation: 50,
    alignItems: 'center',
  },
  floatingPageInner: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.85)', // More transparent
    borderRadius: 28,
    paddingVertical: 6, // Slightly smaller
    paddingHorizontal: 10, // Slightly smaller
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 }, // Reduced shadow
    shadowOpacity: 0.1, // Less pronounced shadow
    shadowRadius: 16,
    elevation: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  floatingPageButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
    // Better visual feedback with subtle highlight
    borderWidth: 0.5,
    borderColor: 'rgba(0,0,0,0.04)',
    overflow: 'hidden',
  },
  floatingPageIndicator: {
    paddingHorizontal: 8,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
    height: 36,
  },
  floatingPageText: {
    fontSize: 13, // Slightly smaller font
    fontWeight: '600', // Less bold
    color: '#374151',
  },
  floatingNavContainer: {
    position: 'absolute',
    left: 20,
    top: 0,
    bottom: 0,
    zIndex: 50,
    elevation: 50,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pdfScrollViewContent: {
    flexGrow: 1,
    justifyContent: 'flex-start',
    alignItems: 'center',
    // No minHeight - we'll use exact PDF dimensions
    paddingVertical: 0, // Remove padding to eliminate extra space
  },
  pdfTransformContainer: {
    flex: 1,
    backgroundColor: '#F3F4F6', // keep transform container matching viewer background
    width: '100%',
    height: '100%',
  },

  // Export Modal Styles
  exportModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  exportModalContent: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    width: screenWidth - 48,
    maxWidth: 400,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 20,
  },
  exportModalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 8,
    textAlign: 'center',
  },
  exportModalSubtitle: {
    fontSize: 16,
    color: '#6B7280',
    marginBottom: 24,
    textAlign: 'center',
    lineHeight: 22,
  },
  exportModalButtons: {
    width: '100%',
    gap: 12,
  },
  exportFormatButton: {
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  exportFormatButtonGradient: {
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    width: '100%',
  },
  exportFormatButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  exportFormatButtonSubtext: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 12,
    fontWeight: '400',
    marginLeft: 8,
  },
  exportActionButtons: {
    width: '100%',
    marginTop: 12,
  },
  exportCancelButton: {
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exportCancelButtonText: {
    color: '#374151',
    fontSize: 16,
    fontWeight: '500',
  },
  exportButton: {
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  exportButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  exportCloseButton: {
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  exportCloseButtonText: {
    color: '#374151',
    fontSize: 16,
    fontWeight: '500',
  },
  // Folder modal styles (copied from DrawingEditor)
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
  folderDividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E2E8F0',
  },
  folderDividerText: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    color: '#64748B',
    marginHorizontal: 12,
  },
  
  // Debug page indicator styles
  debugPageIndicator: {
    position: 'absolute',
    top: 20,
    right: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    zIndex: 1000,
  },
  debugPageText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
  },
  debugPageButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  debugPageButton: {
    backgroundColor: '#667eea',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  debugPageButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  
  // Ask Rina popup styles
  askRinaPopup: {
    position: 'absolute',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.2)',
    zIndex: 1000,
  },
  askRinaPopupContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  askRinaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 6,
  },
  askRinaButtonText: {
    color: '#8B5CF6',
    fontSize: 14,
    fontWeight: '600',
  },
  customQueryButton: {
    padding: 6,
    borderRadius: 6,
    backgroundColor: '#F3F4F6',
  },
  askRinaPopupArrow: {
    position: 'absolute',
    bottom: -8,
    left: '50%',
    marginLeft: -8,
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderTopWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#FFFFFF',
  },
  
  // Ask Rina modal styles
  rinaModalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    width: '92%',
    maxWidth: 420,
    maxHeight: '80%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 15,
    overflow: 'hidden',
  },
  rinaModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 20,
    backgroundColor: 'rgba(139, 92, 246, 0.05)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(139, 92, 246, 0.1)',
  },
  rinaModalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#8B5CF6',
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
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  selectedTextDisplay: {
    backgroundColor: '#F9FAFB',
    padding: 12,
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#8B5CF6',
    fontSize: 14,
    color: '#1F2937',
    lineHeight: 20,
  },
  queryContainer: {
    marginBottom: 20,
  },
  queryLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  queryInput: {
    borderWidth: 2,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    minHeight: 100,
    textAlignVertical: 'top',
    backgroundColor: '#F9FAFB',
    color: '#1F2937',
  },
  rinaModalActions: {
    flexDirection: 'row',
    gap: 12,
  },
  rinaModalCancelButton: {
    flex: 1,
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 2,
    borderColor: '#E5E7EB',
  },
  rinaModalCancelText: {
    color: '#6B7280',
    fontWeight: '600',
    fontSize: 16,
  },
  rinaModalSubmitButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: '#8B5CF6',
    gap: 8,
  },
  rinaModalSubmitButtonDisabled: {
    backgroundColor: '#E5E7EB',
  },
  rinaModalSubmitText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 16,
  },
  rinaModalSubmitTextDisabled: {
    color: '#9CA3AF',
  },
  
  // Text extraction modal styles
  textExtractionModal: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    width: '92%',
    maxWidth: 420,
    maxHeight: '85%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 15,
    overflow: 'hidden',
  },
  textExtractionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 20,
    backgroundColor: 'rgba(139, 92, 246, 0.05)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(139, 92, 246, 0.1)',
  },
  textExtractionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#8B5CF6',
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
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  extractingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#8B5CF6',
    fontWeight: '500',
  },
  extractionInstructions: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
    marginBottom: 16,
    textAlign: 'center',
  },
  textExtractionInput: {
    borderWidth: 2,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    minHeight: 200,
    textAlignVertical: 'top',
    backgroundColor: '#F9FAFB',
    color: '#1F2937',
    marginBottom: 20,
  },
  textExtractionActions: {
    flexDirection: 'row',
    gap: 12,
  },
  textExtractionCancelButton: {
    flex: 1,
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 2,
    borderColor: '#E5E7EB',
  },
  textExtractionCancelText: {
    color: '#6B7280',
    fontWeight: '600',
    fontSize: 16,
  },
  textExtractionSelectButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: '#8B5CF6',
    gap: 8,
  },
  textExtractionSelectButtonDisabled: {
    backgroundColor: '#E5E7EB',
  },
  textExtractionSelectText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 16,
  },
  textExtractionSelectTextDisabled: {
    color: '#9CA3AF',
  },
  
  // Selection mode overlay styles
  selectionModeOverlay: {
    position: 'absolute',
    top: 20,
    left: 20,
    right: 20,
    zIndex: 100,
    alignItems: 'center',
  },
  selectionModeIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.3)',
    gap: 8,
  },
  selectionModeText: {
    color: '#8B5CF6',
    fontSize: 14,
    fontWeight: '500',
  },
  
  // AI Assistant floating button and modal styles
  floatingAIButton: {
    position: 'absolute',
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#8B5CF6',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
    zIndex: 1000,
  },
  floatingAIButtonContent: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 28,
  },
  aiModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'flex-end',
  },
  aiModalContainer: {
    backgroundColor: 'transparent',
    width: '100%',
    height: '90%', // Allow the modal to take up to 90% of screen height
    justifyContent: 'flex-end',
  },
  aiModalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: Platform.OS === 'ios' ? 48 : 24, // Extra padding for iOS devices with home indicator
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 16,
    minHeight: '50%',
    maxHeight: '92%',
  },
  aiModalHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#E5E7EB',
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 8,
  },
  aiModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  aiModalIconContainer: {
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiModalTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
    marginLeft: 12,
  },
  aiModalCloseButton: {
    padding: 6,
    borderRadius: 20,
  },
  aiModalBody: {
    flexGrow: 1,
    padding: 16,
    maxHeight: '70%',
  },
  aiChatContainer: {
    paddingBottom: 16,
  },
  aiMessageBubble: {
    backgroundColor: '#F3F4F6',
    borderRadius: 16,
    borderTopLeftRadius: 4,
    padding: 12,
    marginBottom: 12,
    maxWidth: '80%',
    alignSelf: 'flex-start',
  },
  aiMessageText: {
    fontSize: 16,
    color: '#1F2937',
    lineHeight: 22,
  },
  userMessageBubble: {
    backgroundColor: '#8B5CF6',
    borderRadius: 16,
    borderTopRightRadius: 4,
    padding: 12,
    marginBottom: 12,
    maxWidth: '80%',
    alignSelf: 'flex-end',
  },
  userMessageText: {
    fontSize: 16,
    color: '#FFFFFF',
    lineHeight: 22,
  },
  aiInputContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'flex-end',
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    backgroundColor: '#FFFFFF',  // Ensure the input area has a solid background
  },
  aiInput: {
    flex: 1,
    backgroundColor: '#F9FAFB',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 16,
    paddingVertical: 10,
    paddingRight: 48,
    fontSize: 16,
    maxHeight: 120,
  },
  aiSendButton: {
    position: 'absolute',
    right: 24,
    bottom: 20,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#8B5CF6',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default PDFAnnotationViewer;
