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
import { LinearGradient } from "expo-linear-gradient";
// Conditionally import PDF component only for native platforms
const Pdf = Platform.OS !== 'web' ? require("react-native-pdf").default : null;
import { ScrollView } from "react-native";
import { MaterialIcons, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import Svg, { Rect, Circle, Path, Text as SvgText } from "react-native-svg";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system";
import { getLocalPDFPathEnhanced } from '../utils/pdfUtils';
import { PDFDocument as PDFLibDocument, rgb as pdfLibRgb } from "pdf-lib";
import * as Sharing from "expo-sharing";
import { drawingAPI, PDFSaveOptions } from '../services/drawingAPI';
import { embedAnnotationsInPDF, saveAnnotationsDirectlyToPDF, createPDFBackup, PDFAnnotation } from '../utils/pdfUtils';
import { API_URL } from '@/constants/ApiConfig';

const { width: screenWidth, height: screenHeight } = Dimensions.get("window");

interface Annotation {
  id: string;
  type: "highlight" | "note" | "text" | "pen" | "brush" | "pencil";
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
}) => {
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [selectedTool, setSelectedTool] = useState<
    "highlight" | "note" | "text" | "eraser" | "pen" | "brush" | "pencil" | null
  >(null);
  const [strokeWidth, setStrokeWidth] = useState(3);
  const [selectedColor, setSelectedColor] = useState(ANNOTATION_COLORS[0]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentPath, setCurrentPath] = useState("");
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [notePosition, setNotePosition] = useState({ x: 0, y: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const fadeAnim = useState(new Animated.Value(0))[0];
  const slideAnim = useState(new Animated.Value(-50))[0];
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  
  // Single zoom state - simplified approach from DrawingEditor
  const [currentZoom, setCurrentZoom] = useState(1); // Track PDF zoom level
  
  // PDF transformation state with pan support
  const [pdfTransform, setPdfTransform] = useState({
    scale: 1,
    translateX: 0,
    translateY: 0,
  });
  // For kinetic (inertial) pan
  const panVelocityRef = useRef({ vx: 0, vy: 0 });
  const lastPanTimeRef = useRef<number | null>(null);
  const lastPanPosRef = useRef<{ x: number; y: number } | null>(null);
  const inertiaAnimRef = useRef<Animated.ValueXY | null>(null);
  
  // Canvas-like container dimensions
  const [containerSize, setContainerSize] = useState({ width: screenWidth, height: screenHeight - 300 });
  const pdfContainerRef = useRef<View>(null);
  const pdfScrollRef = useRef<ScrollView>(null);
  
  // Gesture handling refs - from DrawingEditor approach
  const gestureStartZoomRef = useRef(1);
  const gestureStartDistanceRef = useRef(0);
  const gestureStartCenterRef = useRef({ x: 0, y: 0 });
  const gestureStartTranslateRef = useRef({ x: 0, y: 0 });
  const gestureModeRef = useRef<"pinch" | "pan" | null>(null);

  // Viewport size for clamping (visible area of ScrollView)
  const [viewportSize, setViewportSize] = useState({ width: screenWidth, height: screenHeight - 300 });

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
  // Enhanced double-tap with focal zoom (toggle between fit and 2x); supply tap coordinates
  const handleDoubleTapAt = (x: number, y: number) => {
    const now = Date.now();
    const delta = now - lastTapRef.current;
    lastTapRef.current = now;
    if (delta < 280) { // double tap detected
      setPdfTransform(prev => {
        if (prev.scale !== 1) {
          setCurrentZoom(1);
          return { scale: 1, translateX: 0, translateY: 0 };
        }
        const targetScale = 2; // zoom in level
        // Compute focal translation so tapped point moves toward center
        const viewportW = viewportSize.width;
        const viewportH = viewportSize.height;
        // Current content dimensions
        const contentW = containerSize.width;
        const contentH = containerSize.height;
        // Relative position inside viewport
        const relX = x / viewportW; // 0..1
        const relY = y / viewportH; // 0..1
        // After scaling, desired content offset so that tapped point is centered
        const scaledW = contentW * targetScale;
        const scaledH = contentH * targetScale;
        // Ideal translations (negative moves content left/up) before clamping
        let translateX = -(relX * scaledW - viewportW / 2);
        let translateY = -(relY * scaledH - viewportH / 2);
        const clamped = clampTranslate(targetScale, translateX, translateY);
        setCurrentZoom(targetScale);
        return { scale: targetScale, translateX: clamped.translateX, translateY: clamped.translateY };
      });
    }
  };

  // Direct PDF annotation state
  const [isSavingToPDF, setIsSavingToPDF] = useState(false);
  const [lastSavedPath, setLastSavedPath] = useState<string | null>(null);
  const [saveMode, setSaveMode] = useState<'overlay' | 'direct'>('direct');
  const [showSaveModeModal, setShowSaveModeModal] = useState(false);

  // Folder and tag states for metadata
  const [folders, setFolders] = useState<any[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [folderName, setFolderName] = useState("PDF Documents");
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [tags, setTags] = useState<string[]>([]);
  const [showTagModal, setShowTagModal] = useState(false);
  const [newTag, setNewTag] = useState("");
  
  // Sync status state
  const [syncStatus, setSyncStatus] = useState<"saved" | "syncing" | "offline">("saved");

  // PDF viewport tracking
  const [pdfDimensions, setPdfDimensions] = useState({ width: screenWidth, height: screenHeight - 300 });
  const [scrollOffset, setScrollOffset] = useState({ x: 0, y: 0 });
  
  // Scroll tracking for annotation positioning
  const [pdfScrollOffset, setPdfScrollOffset] = useState({ x: 0, y: 0 });
  
  // Actual PDF page dimensions (from the PDF file itself)
  const [pdfPageDimensions, setPdfPageDimensions] = useState({ width: 595, height: 842 }); // Default A4 size in points
  const [pdfViewerBounds, setPdfViewerBounds] = useState({ width: screenWidth, height: screenHeight - 300 });

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
  const annotationStorageKey = `pdf_annotations_${fileName}`;
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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
              ann.y = Math.min(1, Math.max(0, ann.y / ((screenHeight - 300) || 600)));
            }
          }
          
          // Validate width/height are also in percentage range
          if (ann.width !== undefined && ann.width > 1) {
            ann.width = Math.min(1, ann.width / (screenWidth || 400));
          }
          if (ann.height !== undefined && ann.height > 1) {
            ann.height = Math.min(1, ann.height / ((screenHeight - 300) || 600));
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
        await Sharing.shareAsync("data:text/plain;base64," + btoa(shareContent), {
          mimeType: "text/plain",
          dialogTitle: "Share Annotations"
        });
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
    
    // Set actual PDF page dimensions if available
    if (width && height) {
      console.log("Setting PDF page dimensions:", { width, height });
      setPdfPageDimensions({ width, height });
    }
    
    // Update container size based on number of pages
    const viewerWidth = screenWidth;
    const estimatedPageHeight = (screenHeight - 300) * 0.8; // Estimate page height
    const totalHeight = Math.max(screenHeight - 300, numberOfPages * estimatedPageHeight + (numberOfPages - 1) * 10); // Add spacing between pages
    
    setContainerSize({ width: viewerWidth, height: totalHeight });
    
    // Update PDF viewer bounds for accurate coordinate conversion
    setPdfViewerBounds({ width: viewerWidth, height: totalHeight });
    
    console.log("PDF viewer bounds set for", numberOfPages, "pages:", { width: viewerWidth, height: totalHeight });
    console.log(
      "PDF loaded successfully:",
      numberOfPages,
      "pages from:",
      filePath
    );
    console.log("✅ Coordinate system ready - annotations will use percentage-based coordinates (0-1)");
  };

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

  const onPageChanged = (page: number, numberOfPages: number) => {
    setCurrentPage(page);
  };

  const onPdfScaleChanged = (scale: number) => {
    console.log('PDF internal scale changed:', scale);
    // Update our zoom states to stay synchronized with PDF component
    setCurrentZoom(scale);
    setPdfTransform(prev => ({ ...prev, scale }));
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

  // Zoom control functions - simplified DrawingEditor approach
  const handleZoomIn = () => {
    const newZoom = Math.min(currentZoom * 1.25, MAX_PDF_SCALE); // Max zoom 3x
    setCurrentZoom(newZoom);
    setPdfTransform(prev => {
      const { translateX, translateY } = clampTranslate(newZoom, prev.translateX, prev.translateY);
      return { ...prev, scale: newZoom, translateX, translateY };
    });
  };

  const handleZoomOut = () => {
    const newZoom = Math.max(currentZoom * 0.8, MIN_PDF_SCALE); // Min zoom 0.5x
    setCurrentZoom(newZoom);
    setPdfTransform(prev => {
      const { translateX, translateY } = clampTranslate(newZoom, prev.translateX, prev.translateY);
      return { ...prev, scale: newZoom, translateX, translateY };
    });
  };

  const resetZoom = () => {
    setCurrentZoom(1);
    setPdfTransform({ scale: 1, translateX: 0, translateY: 0 });
  };

  // Keep content within bounds when scaled/translated
  const clampTranslate = (scale: number, translateX: number, translateY: number) => {
    const contentWidth = containerSize.width || screenWidth;
    const contentHeight = containerSize.height || (screenHeight - 300);
    const viewportW = viewportSize.width;
    const viewportH = viewportSize.height;
    const scaledWidth = contentWidth * scale;
    const scaledHeight = contentHeight * scale;
    if (scaledWidth <= viewportW) {
      translateX = (viewportW - scaledWidth) / 2;
    } else {
      const minX = -(scaledWidth - viewportW);
      const maxX = 0;
      translateX = Math.min(Math.max(translateX, minX), maxX);
    }
    if (scaledHeight <= viewportH) {
      translateY = (viewportH - scaledHeight) / 2;
    } else {
      const minY = -(scaledHeight - viewportH);
      const maxY = 0;
      translateY = Math.min(Math.max(translateY, minY), maxY);
    }
    return { translateX, translateY };
  };

  // Re-clamp if sizes change
  useEffect(() => {
    setPdfTransform(prev => {
      const { translateX, translateY } = clampTranslate(prev.scale, prev.translateX, prev.translateY);
      return { ...prev, translateX, translateY };
    });
  }, [containerSize.width, containerSize.height, viewportSize.width, viewportSize.height]);

  // Enhanced pan responder: two-finger pinch OR pan; single finger only when drawing
  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: (evt) => {
      if (evt.nativeEvent.touches.length === 2) return true;
      return selectedTool !== null && evt.nativeEvent.touches.length === 1;
    },
    onMoveShouldSetPanResponder: (evt) => {
      if (evt.nativeEvent.touches.length === 2) return true;
      return selectedTool !== null && evt.nativeEvent.touches.length === 1;
    },
    onMoveShouldSetPanResponderCapture: (evt) => {
      return evt.nativeEvent.touches.length === 2 || (selectedTool !== null && evt.nativeEvent.touches.length === 1);
    },
    onPanResponderGrant: (evt) => {
      if (evt.nativeEvent.touches.length === 2) {
        const touches = evt.nativeEvent.touches;
        const t1 = touches[0];
        const t2 = touches[1];
        const centerX = (t1.pageX + t2.pageX) / 2;
        const centerY = (t1.pageY + t2.pageY) / 2;
        gestureStartZoomRef.current = currentZoom;
        gestureStartDistanceRef.current = getDistance(touches);
        gestureStartCenterRef.current = { x: centerX, y: centerY };
        gestureStartTranslateRef.current = { x: pdfTransform.translateX, y: pdfTransform.translateY };
        gestureModeRef.current = null;
      } else if (evt.nativeEvent.touches.length === 1 && selectedTool) {
        const touch = evt.nativeEvent.touches[0];
        const { locationX, locationY } = touch;
        if (selectedTool === 'note' || selectedTool === 'text') {
          const coords = screenToPDFCoordinates(locationX, locationY);
          setNotePosition({ x: coords.normalizedX, y: coords.normalizedY });
          setShowNoteModal(true);
        } else {
          setIsDrawing(true);
          setCurrentPath(`M${locationX},${locationY}`);
        }
      }
    },
    onPanResponderMove: (evt) => {
      if (evt.nativeEvent.touches.length === 2) {
        const touches = evt.nativeEvent.touches;
        const currentDistance = getDistance(touches);
        const startDistance = gestureStartDistanceRef.current;
        const t1 = touches[0];
        const t2 = touches[1];
        const centerX = (t1.pageX + t2.pageX) / 2;
        const centerY = (t1.pageY + t2.pageY) / 2;
        let nextScale = currentZoom;
        if (startDistance > 0) {
          const rawScale = currentDistance / startDistance;
          nextScale = Math.max(MIN_PDF_SCALE, Math.min(MAX_PDF_SCALE, gestureStartZoomRef.current * rawScale));
        }
        if (!gestureModeRef.current) {
          const scaleDelta = Math.abs(nextScale - gestureStartZoomRef.current);
          gestureModeRef.current = scaleDelta > 0.02 ? 'pinch' : 'pan';
        }
        if (gestureModeRef.current === 'pinch') {
          setCurrentZoom(nextScale);
          setPdfTransform(prev => {
            const { translateX, translateY } = clampTranslate(nextScale, prev.translateX, prev.translateY);
            return { ...prev, scale: nextScale, translateX, translateY };
          });
        } else {
          const deltaX = centerX - gestureStartCenterRef.current.x;
          const deltaY = centerY - gestureStartCenterRef.current.y;
          const proposedX = gestureStartTranslateRef.current.x + deltaX;
          const proposedY = gestureStartTranslateRef.current.y + deltaY;
          setPdfTransform(prev => {
            const { translateX, translateY } = clampTranslate(prev.scale, proposedX, proposedY);
            return { ...prev, translateX, translateY };
          });
        }
      } else if (evt.nativeEvent.touches.length === 1 && isDrawing && selectedTool) {
        const touch = evt.nativeEvent.touches[0];
        const { locationX, locationY } = touch;
        if (selectedTool === 'pen' || selectedTool === 'brush' || selectedTool === 'pencil' || selectedTool === 'highlight' || selectedTool === 'eraser') {
          setCurrentPath(prev => `${prev} L${locationX},${locationY}`);
        }
      }
    },
    onPanResponderRelease: (evt) => {
      if (evt.nativeEvent.touches.length === 0) {
        if (isDrawing && currentPath && selectedTool) {
          if (selectedTool === 'highlight') {
            addFreehandHighlight(currentPath);
          } else if (selectedTool === 'pen' || selectedTool === 'brush' || selectedTool === 'pencil') {
            addPenAnnotation(currentPath, selectedTool);
          } else if (selectedTool === 'eraser') {
            partialEraseAnnotations(currentPath);
          }
          setIsDrawing(false);
          setCurrentPath('');
        }
        gestureStartDistanceRef.current = 0;
        gestureModeRef.current = null;
      }
    },
    onPanResponderTerminate: () => {
      gestureStartDistanceRef.current = 0;
      gestureModeRef.current = null;
    }
  });

  // ---------------------------------------------------------------------------
  // Coordinate System Helpers
  // ---------------------------------------------------------------------------
  // Internally ALL annotations store geometry in normalized percentage space
  // relative to the underlying PDF page (0 - 1 for x/y/width/height and path points).
  // This makes annotations:
  //   • Resolution & device independent
  //   • Stable across orientation / layout changes
  //   • Easier to embed into PDFs (device pixels not required)
  // On interaction we convert screen -> % for storage. On render we convert
  // % -> screen using current pdfScale and the measured viewer bounds.
  // ---------------------------------------------------------------------------
  // Convert screen coordinates to PDF page coordinates (0-1 normalized percentages)
  const screenToPDFCoordinates = (screenX: number, screenY: number) => {
    // Get the current container dimensions
    const viewerWidth = containerSize.width || screenWidth;
    const viewerHeight = containerSize.height || (screenHeight - 300);
    
    // Account for current transform (scale and translation) and scroll offset
    const { scale, translateX, translateY } = pdfTransform;
    
    // Adjust for scroll offset to maintain annotation position during scroll
    const adjustedX = screenX + pdfScrollOffset.x;
    const adjustedY = screenY + pdfScrollOffset.y;
    
    // Since both PDF and annotations are in the same transform container,
    // we need to reverse the transform to get coordinates in the original container space
    const originalX = (adjustedX - translateX) / scale;
    const originalY = (adjustedY - translateY) / scale;
    
    // Convert to normalized coordinates (0-1) relative to PDF page
    // The original coordinates are already in the container space
    const normalizedX = Math.max(0, Math.min(1, originalX / viewerWidth));
    const normalizedY = Math.max(0, Math.min(1, originalY / viewerHeight));
    
    console.log("screenToPDF (unified transform + scroll):", {
      screen: { x: screenX, y: screenY },
      scroll: pdfScrollOffset,
      adjusted: { x: adjustedX, y: adjustedY },
      container: { width: viewerWidth, height: viewerHeight },
      transform: { scale, translateX, translateY },
      original: { x: originalX, y: originalY },
      normalized: { x: normalizedX, y: normalizedY }
    });
    
    return {
      normalizedX: normalizedX,
      normalizedY: normalizedY
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
    const parts = cleanPath.split(/([ML])/);
    let normalizedPath = '';
    
    // Get current container dimensions for conversion
    const containerWidth = containerSize.width || screenWidth;
    const containerHeight = containerSize.height || (screenHeight - 300);
    
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (part === 'M' || part === 'L') {
        normalizedPath += part;
      } else if (part && part.trim()) {
        // This is a coordinate pair
        // The path coordinates come from locationX/locationY in touch events,
        // which are relative to the container (already transformed)
        const coords = part.trim().split(',');
        if (coords.length === 2) {
          const containerX = parseFloat(coords[0]);
          const containerY = parseFloat(coords[1]);
          
          // Convert container coordinates to normalized (0-1) coordinates
          const normalizedX = containerX / containerWidth;
          const normalizedY = containerY / containerHeight;
          
          // Clamp to 0-1 range
          const clampedX = Math.max(0, Math.min(1, normalizedX));
          const clampedY = Math.max(0, Math.min(1, normalizedY));
          
          normalizedPath += `${clampedX.toFixed(6)},${clampedY.toFixed(6)}`;
        } else {
          normalizedPath += part;
        }
      }
    }
    
    return normalizedPath;
  };

  const convertNormalizedPathToScreen = (path: string): string => {
    if (!path) return '';
    
    // Get current container dimensions
    const containerWidth = containerSize.width || screenWidth;
    const containerHeight = containerSize.height || (screenHeight - 300);
    
    const parts = path.split(/([ML])/);
    let containerPath = '';
    
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (part === 'M' || part === 'L') {
        containerPath += part;
      } else if (part && part.trim()) {
        // This is a coordinate pair - convert normalized coordinates to container coordinates
        const coords = part.trim().split(',');
        if (coords.length === 2) {
          const normalizedX = parseFloat(coords[0]);
          const normalizedY = parseFloat(coords[1]);
          
          // Validate normalized coordinates are within expected range (0-1)
          if (normalizedX >= 0 && normalizedX <= 1 && normalizedY >= 0 && normalizedY <= 1) {
            // Convert normalized coordinates to container coordinates
            // Since annotations are in the same transform container as the PDF,
            // the transform will be applied at the container level, so we just need container coordinates
            const containerX = normalizedX * containerWidth;
            const containerY = normalizedY * containerHeight;
            
            containerPath += `${containerX.toFixed(2)},${containerY.toFixed(2)}`;
          } else {
            // If coordinates are out of range, keep them as is (might be legacy data)
            containerPath += part;
          }
        } else {
          containerPath += part;
        }
      }
    }
    
    return containerPath;
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

    const updated = [...annotations, newAnnotation];
    saveAnnotationsWithChanges(updated);
  };

  const addNoteAnnotation = () => {
    if (!noteText.trim()) return;

    // notePosition already contains PDF page percentages from pan responder
    const newAnnotation: Annotation = {
      id: Date.now().toString(),
      type: selectedTool === "text" ? "text" : "note",
      page: currentPage,
      x: notePosition.x, // Percentage of PDF page width (0-1)
      y: notePosition.y, // Percentage of PDF page height (0-1)
      color: selectedColor,
      text: noteText,
      timestamp: Date.now(),
    };

    const updated = [...annotations, newAnnotation];
    saveAnnotationsWithChanges(updated);
    setShowNoteModal(false);
    setNoteText("");
  };

  const deleteAnnotation = (id: string) => {
    const updated = annotations.filter((ann) => ann.id !== id);
    saveAnnotationsWithChanges(updated);
  };

  const exportAnnotatedPDF = async () => {
    try {
      if (annotations.length === 0) {
        Alert.alert("No Annotations", "There are no annotations to export.");
        return;
      }

      Alert.alert(
        "Export Options",
        "Choose how you'd like to export your annotated PDF:",
        [
          {
            text: "Cancel",
            style: "cancel"
          },
          {
            text: "New File",
            onPress: () => exportToPDFNewFile()
          },
          {
            text: "Update Original",
            onPress: () => exportToPDFDirect(),
            style: "destructive"
          }
        ]
      );

    } catch (error) {
      console.error("Error in export options:", error);
      Alert.alert("Error", "Failed to show export options.");
    }
  };

  const exportToPDFNewFile = async () => {
    try {
      Alert.alert("Info", "Creating new annotated PDF file...");

      // Convert UI annotations to PDF annotations format
      const pdfAnnotations: PDFAnnotation[] = annotations.map(annotation => ({
        ...annotation,
        type: annotation.type as PDFAnnotation['type']
      }));

      const saveOptions: PDFSaveOptions = {
        createBackup: false, // No need for backup when creating new file
        saveDirectly: false,
        outputFileName: `exported_${Date.now()}_${fileName}`
      };

      const result = await drawingAPI.savePDFAnnotations(source.uri, pdfAnnotations, saveOptions);
      setLastSavedPath(result.savedPath);
      
      Alert.alert(
        "Export Success",
        `Annotated PDF exported successfully!\n\nFile: ${result.savedPath.split('/').pop()}`,
        [
          { text: "OK" },
          {
            text: "Share",
            onPress: () => shareExportedPDF(result.savedPath)
          }
        ]
      );

    } catch (error) {
      console.error("Error exporting PDF to new file:", error);
      Alert.alert("Export Error", "Failed to export annotated PDF to new file.");
    }
  };

  const exportToPDFDirect = async () => {
    try {
      Alert.alert("Info", "Updating original PDF with embedded annotations...");

      // Convert UI annotations to PDF annotations format
      const pdfAnnotations: PDFAnnotation[] = annotations.map(annotation => ({
        ...annotation,
        type: annotation.type as PDFAnnotation['type']
      }));

      const saveOptions: PDFSaveOptions = {
        createBackup: true, // Create backup when modifying original
        saveDirectly: true
      };

      const result = await drawingAPI.savePDFAnnotations(source.uri, pdfAnnotations, saveOptions);
      
      Alert.alert(
        "Update Success",
        `Original PDF has been updated with embedded annotations!\n\n${result.backupPath ? `Backup created: ${result.backupPath.split('/').pop()}` : ''}`,
        [
          { text: "OK" },
        ]
      );

    } catch (error) {
      console.error("Error updating original PDF:", error);
      Alert.alert("Update Error", "Failed to update original PDF with annotations.");
    }
  };

  const shareExportedPDF = async (pdfPath: string) => {
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

    // Get current container dimensions for coordinate conversion
    const containerWidth = containerSize.width || screenWidth;
    const containerHeight = containerSize.height || (screenHeight - 300);

    return (
      <Svg
        style={StyleSheet.absoluteFillObject}
        width={containerWidth}
        height={containerHeight}
        viewBox={`0 0 ${containerWidth} ${containerHeight}`}
      >
        {pageAnnotations.map((annotation) => {
          const getPenStyle = (penType: string, baseWidth: number) => {
            switch (penType) {
              case "pen":
                return {
                  strokeWidth: baseWidth,
                  opacity: 1,
                  strokeLinecap: "round" as const,
                  strokeLinejoin: "round" as const,
                  strokeDasharray: "0"
                };
              case "brush":
                return {
                  strokeWidth: baseWidth * 1.8,
                  opacity: 0.9,
                  strokeLinecap: "round" as const,
                  strokeLinejoin: "round" as const,
                  strokeDasharray: "0"
                };
              case "pencil":
                return {
                  strokeWidth: baseWidth * 0.8,
                  opacity: 0.8,
                  strokeLinecap: "round" as const,
                  strokeLinejoin: "round" as const,
                  strokeDasharray: "0"
                };
              default:
                return {
                  strokeWidth: baseWidth,
                  opacity: 1,
                  strokeLinecap: "round" as const,
                  strokeLinejoin: "round" as const,
                  strokeDasharray: "0"
                };
            }
          };

          switch (annotation.type) {
            case "highlight":
              // Check if it's a freehand highlight (has path) or traditional highlight (rectangle)
              if (annotation.path) {
                const containerPath = convertNormalizedPathToScreen(annotation.path);
                // Don't scale stroke width since the transform container handles all scaling
                const highlightStrokeWidth = annotation.strokeWidth || 12;
                return (
                  <Path
                    key={annotation.id}
                    d={containerPath}
                    stroke={annotation.color}
                    strokeWidth={highlightStrokeWidth}
                    fill="none"
                    opacity={0.4}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    onPress={() => deleteAnnotation(annotation.id)}
                  />
                );
              } else {
                // Traditional rectangle highlight - convert percentage coordinates to container coordinates
                const containerX = annotation.x * containerWidth;
                const containerY = annotation.y * containerHeight;
                const containerWidth_rect = (annotation.width || 0.15) * containerWidth;
                const containerHeight_rect = (annotation.height || 0.025) * containerHeight;
                return (
                  <Rect
                    key={annotation.id}
                    x={containerX}
                    y={containerY}
                    width={containerWidth_rect}
                    height={containerHeight_rect}
                    fill={annotation.color}
                    opacity={0.4}
                    onPress={() => deleteAnnotation(annotation.id)}
                  />
                );
              }

            case "pen":
            case "brush":
            case "pencil":
              // Convert percentage-based path to container coordinates
              // Don't scale stroke width since the transform container handles all scaling
              const baseStroke = annotation.strokeWidth || 3;
              const penStyle = getPenStyle(annotation.type, baseStroke);
              const penContainerPath = convertNormalizedPathToScreen(annotation.path || "");
              return (
                <Path
                  key={annotation.id}
                  d={penContainerPath}
                  stroke={annotation.color}
                  strokeWidth={penStyle.strokeWidth}
                  strokeLinecap={penStyle.strokeLinecap}
                  strokeLinejoin={penStyle.strokeLinejoin}
                  strokeDasharray={penStyle.strokeDasharray}
                  fill="none"
                  opacity={penStyle.opacity}
                  onPress={() => deleteAnnotation(annotation.id)}
                />
              );

            case "note":
              // Convert percentage coordinates to container coordinates
              const noteContainerX = annotation.x * containerWidth;
              const noteContainerY = annotation.y * containerHeight;
              // Don't scale radius since the transform container handles all scaling
              const noteRadius = 12;
              return (
                <React.Fragment key={annotation.id}>
                  <Circle
                    cx={noteContainerX}
                    cy={noteContainerY}
                    r={noteRadius}
                    fill={annotation.color}
                    onPress={() => {
                      Alert.alert("Note", annotation.text, [
                        {
                          text: "Delete",
                          onPress: () => deleteAnnotation(annotation.id),
                        },
                        { text: "Close" },
                      ]);
                    }}
                  />
                  <SvgText
                    x={noteContainerX}
                    y={noteContainerY + 4}
                    textAnchor="middle"
                    fontSize={10}
                    fill="white"
                  >
                    📝
                  </SvgText>
                </React.Fragment>
              );

            case "text":
              // Convert percentage coordinates to container coordinates
              const textContainerX = annotation.x * containerWidth;
              const textContainerY = annotation.y * containerHeight;
              return (
                <SvgText
                  key={annotation.id}
                  x={textContainerX}
                  y={textContainerY}
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

        {/* Current drawing/highlight/eraser/pen path */}
        {isDrawing && currentPath && (
          (() => {
            const cleanPath = cleanPathFromPressure(currentPath);
            // Don't scale stroke width since the transform container handles all scaling
            const baseStrokeWidth = strokeWidth;
            
            switch (selectedTool) {
              case "highlight":
                return (
                  <Path
                    d={cleanPath}
                    stroke={selectedColor}
                    strokeWidth={baseStrokeWidth * 3}
                    fill="none"
                    opacity={0.4}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                );
              case "pen":
                return (
                  <Path
                    d={cleanPath}
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
                    d={cleanPath}
                    stroke={selectedColor}
                    strokeWidth={baseStrokeWidth * 1.8}
                    fill="none"
                    opacity={0.9}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                );
              case "pencil":
                return (
                  <Path
                    d={cleanPath}
                    stroke={selectedColor}
                    strokeWidth={baseStrokeWidth * 0.8}
                    fill="none"
                    opacity={0.8}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                );
              case "eraser":
                return (
                  <Path
                    d={cleanPath}
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
                    d={cleanPath}
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
      </Svg>
    );
  };

return (
      <View style={styles.container}>
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
        <Animated.View style={[styles.pageIndicator, { opacity: fadeAnim }]}>
          <Text style={styles.pageInfo}>
            Page {currentPage} of {totalPages}
          </Text>
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
            {/* Tools Section */}
            {(["pen", "brush", "pencil", "highlight", "note", "text", "eraser"] as const).map((tool) => (
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
                    tool === "pen"
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

            {/* Divider */}
            <View style={styles.toolbarDivider} />

            {/* Zoom Controls */}
            <TouchableOpacity
              style={styles.zoomButton}
              onPress={handleZoomOut}
              activeOpacity={0.8}
            >
              <MaterialIcons name="zoom-out" size={20} color="#64748b" />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.zoomResetButton}
              onPress={resetZoom}
              activeOpacity={0.8}
            >
              <Text style={styles.zoomText}>{Math.round(currentZoom * 100)}%</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.zoomButton}
              onPress={handleZoomIn}
              activeOpacity={0.8}
            >
              <MaterialIcons name="zoom-in" size={20} color="#64748b" />
            </TouchableOpacity>

            {/* Zoom Slider */}
            <View style={styles.zoomSliderContainer}>
              <View
                style={styles.zoomSliderTrack}
                onLayout={(e) => {
                  // store width if needed later
                }}
                {...PanResponder.create({
                  onStartShouldSetPanResponder: () => true,
                  onPanResponderMove: (evt, gesture) => {
                    const sliderWidth = 120; // fixed width
                    const locationX = Math.min(Math.max(0, gesture.dx + (gesture.x0 % sliderWidth)), sliderWidth);
                    const ratio = locationX / sliderWidth;
                    const newScale = MIN_PDF_SCALE + ratio * (MAX_PDF_SCALE - MIN_PDF_SCALE);
                    setCurrentZoom(newScale);
                    setPdfTransform(prev => {
                      const { translateX, translateY } = clampTranslate(newScale, prev.translateX, prev.translateY);
                      return { ...prev, scale: newScale, translateX, translateY };
                    });
                  },
                }).panHandlers}
              >
                <View
                  style={[
                    styles.zoomSliderThumb,
                    {
                      left: ((currentZoom - MIN_PDF_SCALE) / (MAX_PDF_SCALE - MIN_PDF_SCALE)) * 120 - 10,
                    },
                  ]}
                />
              </View>
            </View>

            {/* Divider */}
            <View style={styles.toolbarDivider} />

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

        {/* Compact Metadata Row */}
        <View style={styles.compactHeaderInfo}>
          <View style={styles.compactMetadata}>
            <View style={styles.folderSection}>
              <TouchableOpacity
                style={styles.compactFolderSelector}
                onPress={() => setShowFolderModal(true)}
                activeOpacity={0.8}
              >
                <MaterialIcons name="folder" size={16} color="#8B5CF6" />
                <Text style={styles.compactFolderText} numberOfLines={1}>
                  {folderName}
                </Text>
                <MaterialIcons name="keyboard-arrow-down" size={16} color="#8B5CF6" />
              </TouchableOpacity>
            </View>

            <View style={styles.tagSection}>
              <View style={styles.compactTagsSection}>
                <TouchableOpacity
                  style={styles.addTagButton}
                  onPress={() => setShowTagModal(true)}
                  activeOpacity={0.8}
                >
                  <MaterialIcons name="add" size={14} color="#8B5CF6" />
                  <Text style={styles.addTagText}>Tag</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* Tags Display */}
          {tags.length > 0 && (
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
                      <TouchableOpacity
                        onPress={() => removeTag(tag)}
                        activeOpacity={0.8}
                      >
                        <MaterialIcons name="close" size={12} color="#8B5CF6" />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              </ScrollView>
            </View>
          )}

          {/* Sync Status */}
          <View style={styles.compactSyncContainer}>
            <View style={styles.syncStatusContainer}>
              <MaterialIcons
                name={getSyncStatusIcon()}
                size={14}
                color={getSyncStatusColor()}
              />
              <Text style={[styles.syncStatusText, { color: getSyncStatusColor() }]}>
                {getSyncStatusText()}
              </Text>
            </View>
          </View>
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
            {/* PDF ScrollView Container */}
            <ScrollView
              style={styles.pdfCanvasContainer}
              contentContainerStyle={styles.pdfScrollViewContent}
              ref={pdfScrollRef}
              showsVerticalScrollIndicator={true}
              showsHorizontalScrollIndicator={true}
              bounces={true}
              bouncesZoom={true}
              directionalLockEnabled={false}
              canCancelContentTouches={false}
              scrollEnabled={false}
              nestedScrollEnabled={false}
              onScroll={() => {}}
              scrollEventThrottle={16}
              onLayout={(e) => {
                const { width, height } = e.nativeEvent.layout;
                setViewportSize({ width, height });
              }}
            >
              {/* PDF and Annotation Transform Container */}
              <Animated.View 
                style={[
                  styles.pdfTransformContainer,
                  {
                    width: containerSize.width,
                    height: containerSize.height,
                    transform: [
                      { scale: pdfTransform.scale },
                      { translateX: pdfTransform.translateX },
                      { translateY: pdfTransform.translateY },
                    ],
                  }
                ]}
                onLayout={(event) => {
                  const { width, height } = event.nativeEvent.layout;
                  setContainerSize({ width, height });
                  console.log('PDF container size:', { width, height });
                }}
              >
                {/* PDF Viewer */}
                {Platform.OS !== 'web' && Pdf ? (
                  <Pdf
                    ref={pdfRef}
                    source={currentSource}
                    style={[styles.pdf, { height: containerSize.height }]}
                    onLoadComplete={onPdfLoadComplete}
                    onPageChanged={onPageChanged}
                    onLoadProgress={onPdfLoadProgress}
                    onError={onPdfError}
                    onScaleChanged={(scale: number) => {
                      console.log('PDF internal scale changed:', scale);
                      // Update our zoom states to stay synchronized with PDF component
                      setCurrentZoom(scale);
                      setPdfTransform(prev => {
                        const { translateX, translateY } = clampTranslate(scale, prev.translateX, prev.translateY);
                        return { ...prev, scale, translateX, translateY };
                      });
                    }}
                    enablePaging={false}
                    horizontal={false}
                    fitPolicy={0}
                    spacing={10}
                    enableDoubleTapZoom={false}
                    enableRTL={false}
                    enableAnnotationRendering={true}
                    enableAntialiasing={true}
                    fitWidth={true}
                    maxScale={3.0}
                    minScale={0.5}
                  />
                ) : (
                  <View style={styles.webPdfPlaceholder}>
                    <MaterialIcons name="description" size={64} color="#9CA3AF" />
                    <Text style={styles.webPdfText}>PDF viewing not supported on web</Text>
                    <Text style={styles.webPdfSubtext}>Please use the mobile app to view and annotate PDFs</Text>
                  </View>
                )}
                
                {/* Annotation Layer - Now part of the same transform container with touch enabled */}
                <View
                  style={StyleSheet.absoluteFillObject}
                  pointerEvents={selectedTool ? 'auto' : 'box-none'}
                  onStartShouldSetResponder={(e) => {
                    // Allow capturing taps when no tool to support double-tap zoom
                    return selectedTool === null; 
                  }}
                  onResponderRelease={(e) => {
                    if (selectedTool === null) {
                      const { locationX, locationY } = e.nativeEvent;
                      handleDoubleTapAt(locationX, locationY);
                    }
                  }}
                  {...panResponder.panHandlers}
                >
                  {renderAnnotations()}
                </View>
              </Animated.View>

            </ScrollView>
          </View>
        )}

      </View> {/* Close Main Container */}

      {/* Folder Selection Modal */}
      <Modal
        visible={showFolderModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowFolderModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.noteModal}>
            <View style={styles.modalHeader}>
              <MaterialIcons name="folder" size={24} color="#667eea" />
              <Text style={styles.modalTitle}>Select Folder</Text>
            </View>

            <View style={styles.modalContent}>
              <TouchableOpacity
                style={[
                  styles.folderItem,
                  !selectedFolderId && styles.selectedFolderItem,
                ]}
                onPress={() => handleFolderSelect(null)}
                activeOpacity={0.8}
              >
                <View
                  style={[
                    styles.folderIcon,
                    { backgroundColor: "#F3F4F6" },
                  ]}
                >
                  <MaterialIcons name="folder-open" size={24} color="#8B5CF6" />
                </View>
                <Text style={styles.folderItemName}>PDF Documents</Text>
              </TouchableOpacity>

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={[styles.modalActionButton, styles.cancelButton]}
                  onPress={() => setShowFolderModal(false)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
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
          <View style={styles.noteModal}>
            <View style={styles.modalHeader}>
              <MaterialIcons name="local-offer" size={24} color="#667eea" />
              <Text style={styles.modalTitle}>Add Tag</Text>
            </View>

            <View style={styles.modalContent}>
              <TextInput
                style={styles.noteInput}
                placeholder="Enter tag name..."
                placeholderTextColor="#999"
                value={newTag}
                onChangeText={setNewTag}
                autoFocus
              />

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={[styles.modalActionButton, styles.cancelButton]}
                  onPress={() => {
                    setShowTagModal(false);
                    setNewTag("");
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.modalActionButton,
                    !newTag.trim() && { opacity: 0.5 },
                  ]}
                  onPress={addTag}
                  disabled={!newTag.trim()}
                  activeOpacity={0.8}
                >
                  <Text style={styles.modalActionText}>Add Tag</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>

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
              style={styles.moreMenuItem}
              onPress={() => {
                setShowMoreMenu(false);
                exportAnnotatedPDF();
              }}
              activeOpacity={0.8}
            >
              <MaterialIcons name="download" size={20} color="#334155" />
              <Text style={styles.moreMenuText}>Export PDF</Text>
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
                handleClearAllAnnotations();
              }}
              activeOpacity={0.8}
            >
              <MaterialIcons name="clear-all" size={20} color="#EF4444" />
              <Text style={[styles.moreMenuText, { color: "#EF4444" }]}>Clear All</Text>
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
    marginTop: 120, // Position it below the header
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
  exportButton: {
    flexDirection: "row",
    alignItems: "center",
    padding: 8,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  exportText: {
    fontSize: 12,
    color: "#ffffff",
    marginLeft: 4,
    fontWeight: "600",
  },
  pageIndicator: {
    alignItems: "center",
    paddingBottom: 12,
    marginTop: 4,
  },
  pageInfo: {
    fontSize: 14,
    color: "rgba(255,255,255,0.9)",
    fontWeight: "500",
    backgroundColor: "rgba(255,255,255,0.2)",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  pdf: {
    flex: 1,
    width: screenWidth,
    height: screenHeight * 3, // Increased to ensure multi-page support
    backgroundColor: "#F3F4F6", // subtle viewer background
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

  // Zoom control styles
  zoomButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#F3F4F6",
    justifyContent: "center",
    alignItems: "center",
    marginHorizontal: 4,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  zoomResetButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: "#F8FAFC",
    justifyContent: "center",
    alignItems: "center",
    marginHorizontal: 4,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    minWidth: 60,
  },
  zoomText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748b",
    fontFamily: "Inter-SemiBold",
  },
  zoomSliderContainer: {
    width: 140,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 8,
  },
  zoomSliderTrack: {
    width: 120,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#E5E7EB',
    position: 'relative',
    justifyContent: 'center',
  },
  zoomSliderThumb: {
    position: 'absolute',
    top: -7,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#667eea',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 3,
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
    borderBottomWidth: 1,
    borderBottomColor: "#F8FAFC",
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
  },
  pdfScrollViewContent: {
    flexGrow: 1,
    justifyContent: 'flex-start',
    alignItems: 'center',
    minHeight: screenHeight * 3, // Increased for multi-page support
    paddingVertical: 20,
  },
  pdfTransformContainer: {
    backgroundColor: '#F3F4F6', // keep transform container matching viewer background
  },
});

export default PDFAnnotationViewer;
