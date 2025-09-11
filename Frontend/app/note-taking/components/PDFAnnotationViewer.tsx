import React, { useState, useRef, useCallback } from "react";
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
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Pdf from "react-native-pdf";
import { ScrollView } from "react-native";
import { MaterialIcons, Ionicons } from "@expo/vector-icons";
import Svg, { Rect, Circle, Path, Text as SvgText } from "react-native-svg";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system";
import { PDFDocument as PDFLibDocument, rgb as pdfLibRgb } from "pdf-lib";
import * as Sharing from "expo-sharing";

const { width: screenWidth, height: screenHeight } = Dimensions.get("window");

interface Annotation {
  id: string;
  type: "highlight" | "note" | "text" | "pen" | "brush" | "pencil";
  page: number;
  x: number;
  y: number;
  width?: number;
  height?: number;
  color: string;
  text?: string;
  path?: string;
  strokeWidth?: number;
  pressure?: number[];
  timestamp: number;
}

interface PDFAnnotationViewerProps {
  source: { uri: string };
  fileName: string;
  onClose: () => void;
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

const PDFAnnotationViewer: React.FC<PDFAnnotationViewerProps> = ({
  source,
  fileName,
  onClose,
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
  const [pdfScale, setPdfScale] = useState(1);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const fadeAnim = useState(new Animated.Value(0))[0];
  const slideAnim = useState(new Animated.Value(-50))[0];
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

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

  // Create source object for PDF loading (now always local)
  const enhancedSource = React.useMemo(() => {
    return source;
  }, [source]);

  const pdfRef = useRef<Pdf>(null);
  const annotationStorageKey = `pdf_annotations_${fileName}`;
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Load annotations when component mounts
  React.useEffect(() => {
    loadAnnotations();
    console.log("PDFAnnotationViewer initialized with local source:", source);

    validatePDFSource();

    // Animate UI entrance
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
      console.log("Validating local PDF source:", source.uri);

      // For local files, check if file exists
      const fileInfo = await FileSystem.getInfoAsync(source.uri);
      console.log("PDF file info:", fileInfo);
      if (!fileInfo.exists) {
        console.error("PDF file not found at:", source.uri);
        setHasError(true);
        Alert.alert("File Not Found", `PDF file not found at: ${source.uri}`);
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
        setAnnotations(JSON.parse(stored));
      }
    } catch (error) {
      console.error("Error loading annotations:", error);
    }
  };

  const saveAnnotations = async (newAnnotations: Annotation[]) => {
    try {
      await AsyncStorage.setItem(
        annotationStorageKey,
        JSON.stringify(newAnnotations)
      );
      setAnnotations(newAnnotations);
    } catch (error) {
      console.error("Error saving annotations:", error);
    }
  };

  const saveAnnotationsWithChanges = async (newAnnotations: Annotation[]) => {
    try {
      setAnnotations(newAnnotations);
      setHasUnsavedChanges(true);
      
      // Auto-save after 2 seconds of no changes
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
      autoSaveTimeoutRef.current = setTimeout(() => {
        handleSaveAnnotations();
      }, 2000);
    } catch (error) {
      console.error("Error updating annotations:", error);
    }
  };

  const handleSaveAnnotations = async () => {
    if (!hasUnsavedChanges) return;
    
    try {
      // Save annotations to AsyncStorage
      await AsyncStorage.setItem(annotationStorageKey, JSON.stringify(annotations));
      setHasUnsavedChanges(false);
      
      // Optional: Show success feedback
      console.log("Annotations saved successfully!");
    } catch (error) {
      console.error("Error saving annotations:", error);
      Alert.alert("Error", "Failed to save annotations. Please try again.");
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
            setAnnotations([]);
            setHasUnsavedChanges(true);
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

  const onPdfLoadComplete = (numberOfPages: number, filePath: string) => {
    console.log("onPdfLoadComplete called with:", { numberOfPages, filePath });
    setTotalPages(numberOfPages);
    setIsLoading(false);
    setHasError(false);
    console.log(
      "PDF loaded successfully:",
      numberOfPages,
      "pages from:",
      filePath
    );
    console.log("Loading state set to false, hasError set to false");
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
    setPdfScale(scale);
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

  // Zoom control functions
  const handleZoomIn = () => {
    const newZoom = Math.min(zoomLevel + 0.25, 3); // Max zoom 3x
    setZoomLevel(newZoom);
  };

  const handleZoomOut = () => {
    const newZoom = Math.max(zoomLevel - 0.25, 0.5); // Min zoom 0.5x
    setZoomLevel(newZoom);
  };

  const resetZoom = () => {
    setZoomLevel(1);
  };

  // Pan responder for drawing and annotations
const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => selectedTool !== null,
    onMoveShouldSetPanResponder: () => selectedTool !== null,

    onPanResponderGrant: (evt) => {
      const { locationX, locationY } = evt.nativeEvent;
      const pressure = (evt.nativeEvent as any).force || 1;
      
      // Convert screen coordinates to normalized PDF coordinates (0-1 range)
      // This ensures annotations stay in the same relative position when zooming
      const normalizedX = locationX / screenWidth;
      const normalizedY = locationY / (screenHeight - 300); // Account for UI elements
      
      // Store as actual pixel coordinates for immediate use
      const pdfX = locationX;
      const pdfY = locationY;

      if (selectedTool === "note") {
        setNotePosition({ x: normalizedX, y: normalizedY });
        setShowNoteModal(true);
      } else if (selectedTool === "text") {
        setNotePosition({ x: normalizedX, y: normalizedY });
        setShowNoteModal(true);
      } else if (selectedTool === "highlight" || selectedTool === "eraser" || 
                 selectedTool === "pen" || selectedTool === "brush" || selectedTool === "pencil") {
        setIsDrawing(true);
        setCurrentPath(`M${pdfX},${pdfY}:${pressure}`);
      }
    },

    onPanResponderMove: (evt) => {
      if (isDrawing && (selectedTool === "highlight" || selectedTool === "eraser" || 
                        selectedTool === "pen" || selectedTool === "brush" || selectedTool === "pencil")) {
        const { locationX, locationY } = evt.nativeEvent;
        const pressure = (evt.nativeEvent as any).force || 1;
        
        // Use actual pixel coordinates for drawing
        const pdfX = locationX;
        const pdfY = locationY;
        setCurrentPath((prev) => `${prev} L${pdfX},${pdfY}:${pressure}`);
      }
    },

    onPanResponderRelease: (evt) => {
      if (isDrawing) {
        if (selectedTool === "highlight") {
          addFreehandHighlight(currentPath);
        } else if (selectedTool === "pen" || selectedTool === "brush" || selectedTool === "pencil") {
          addPenAnnotation(currentPath, selectedTool);
        } else if (selectedTool === "eraser") {
          partialEraseAnnotations(currentPath);
        }
        setIsDrawing(false);
        setCurrentPath("");
      }
    },
  });

  const addPenAnnotation = (path: string, penType: "pen" | "brush" | "pencil") => {
    // Convert path coordinates to normalized coordinates
    const normalizedPath = convertPathToNormalized(path);
    const pathWithPressure = path;
    const pressureData = extractPressureFromPath(path);
    
    const newAnnotation: Annotation = {
      id: Date.now().toString(),
      type: penType,
      page: currentPage,
      x: 0,
      y: 0,
      color: selectedColor,
      path: normalizedPath,
      strokeWidth,
      pressure: pressureData,
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
    
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (part === 'M' || part === 'L') {
        normalizedPath += part;
      } else if (part && part.trim()) {
        // This is a coordinate pair - normalize it
        const coords = part.trim().split(',');
        if (coords.length === 2) {
          const normalizedX = parseFloat(coords[0]) / screenWidth;
          const normalizedY = parseFloat(coords[1]) / (screenHeight - 300);
          normalizedPath += `${normalizedX},${normalizedY}`;
        } else {
          normalizedPath += part;
        }
      }
    }
    
    return normalizedPath;
  };

  const convertNormalizedPathToScreen = (path: string): string => {
    if (!path) return '';
    
    const parts = path.split(/([ML])/);
    let screenPath = '';
    
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (part === 'M' || part === 'L') {
        screenPath += part;
      } else if (part && part.trim()) {
        // This is a coordinate pair - convert back to screen coordinates
        const coords = part.trim().split(',');
        if (coords.length === 2) {
          const screenX = parseFloat(coords[0]) * screenWidth;
          const screenY = parseFloat(coords[1]) * (screenHeight - 300);
          screenPath += `${screenX},${screenY}`;
        } else {
          screenPath += part;
        }
      }
    }
    
    return screenPath;
  };

  const scalePathForZoom = (path: string, scale: number): string => {
    if (!path) return '';
    
    // Split the path into commands and coordinates
    const parts = path.split(/([ML])/);
    let scaledPath = '';
    
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (part === 'M' || part === 'L') {
        scaledPath += part;
      } else if (part && part.trim()) {
        // This is a coordinate pair
        const coords = part.trim().split(',');
        if (coords.length === 2) {
          const x = parseFloat(coords[0]) * scale;
          const y = parseFloat(coords[1]) * scale;
          scaledPath += `${x},${y}`;
        } else {
          scaledPath += part;
        }
      }
    }
    
    return scaledPath;
  };

  const addFreehandHighlight = (path: string) => {
    // Convert path coordinates to normalized coordinates
    const normalizedPath = convertPathToNormalized(path);
    
    const newAnnotation: Annotation = {
      id: Date.now().toString(),
      type: "highlight",
      page: currentPage,
      x: 0,
      y: 0,
      color: selectedColor,
      path: normalizedPath,
      strokeWidth,
      timestamp: Date.now(),
    };

    const updated = [...annotations, newAnnotation];
    saveAnnotationsWithChanges(updated);
  };

  const partialEraseAnnotations = (eraserPath: string) => {
    const normalizedEraserPath = convertPathToNormalized(eraserPath);
    const eraserPoints = getPathPoints(normalizedEraserPath);
    const eraseThreshold = 25 / screenWidth; // Normalize the threshold too
    
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
    
    saveAnnotations(erased);
  };

  // Simple path intersection detection (basic implementation)
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
    const threshold = 20; // pixels
    
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

  // Check if a point is close to the eraser path
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
    const threshold = 25; // pixels

    for (const point of eraserPoints) {
      const distance = Math.sqrt((x - point.x) ** 2 + (y - point.y) ** 2);
      if (distance < threshold) {
        return true;
      }
    }

    return false;
  };

  const addHighlightAnnotation = (x: number, y: number) => {
    const newAnnotation: Annotation = {
      id: Date.now().toString(),
      type: "highlight",
      page: currentPage,
      x,
      y,
      width: 100,
      height: 20,
      color: selectedColor,
      timestamp: Date.now(),
    };

    const updated = [...annotations, newAnnotation];
    saveAnnotations(updated);
  };

  const addNoteAnnotation = () => {
    if (!noteText.trim()) return;

    const newAnnotation: Annotation = {
      id: Date.now().toString(),
      type: selectedTool === "text" ? "text" : "note",
      page: currentPage,
      x: notePosition.x, // Already normalized from pan responder
      y: notePosition.y, // Already normalized from pan responder
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
      Alert.alert(
        "Info",
        "Creating annotated PDF with embedded annotations..."
      );

      // Check if it's a remote URL or local file
      const isRemoteUrl =
        source.uri.startsWith("http://") || source.uri.startsWith("https://");
      let pdfBytes: string;

      if (isRemoteUrl) {
        // For remote URLs, fetch the PDF first
        console.log("Downloading PDF from remote URL for annotation export...");
        const response = await fetch(source.uri);
        if (!response.ok) {
          throw new Error(
            `Failed to download PDF: ${response.status} ${response.statusText}`
          );
        }

        // In React Native, we need to use response.text() and convert to base64
        const responseText = await response.text();
        pdfBytes = btoa(responseText);
      } else {
        // For local files, read directly
        pdfBytes = await FileSystem.readAsStringAsync(source.uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
      }

      const pdfArrayBuffer = Uint8Array.from(atob(pdfBytes), (c) =>
        c.charCodeAt(0)
      ).buffer;

      // Load the existing PDF
      const pdfDoc = await PDFLibDocument.load(pdfArrayBuffer);
      const pages = pdfDoc.getPages();

      // Get all annotations grouped by page
      const annotationsByPage = annotations.reduce((acc, annotation) => {
        if (!acc[annotation.page]) {
          acc[annotation.page] = [];
        }
        acc[annotation.page].push(annotation);
        return acc;
      }, {} as Record<number, Annotation[]>);

      // Embed annotations into each page
      for (const [pageNum, pageAnnotations] of Object.entries(
        annotationsByPage
      )) {
        const pageIndex = parseInt(pageNum) - 1; // Convert to 0-based index
        if (pageIndex >= 0 && pageIndex < pages.length) {
          const page = pages[pageIndex];
          const { width, height } = page.getSize();

          for (const annotation of pageAnnotations) {
            const normalizedColor = hexToRgb(annotation.color);
            const pdfColor = pdfLibRgb(
              normalizedColor.r / 255,
              normalizedColor.g / 255,
              normalizedColor.b / 255
            );

            switch (annotation.type) {
              case "highlight":
                // Add highlight rectangle
                page.drawRectangle({
                  x: annotation.x,
                  y: height - annotation.y - (annotation.height || 20), // PDF coordinates are from bottom-left
                  width: annotation.width || 100,
                  height: annotation.height || 20,
                  color: pdfColor,
                  opacity: 0.4,
                });
                break;

              case "note":
                // Add note icon (circle) and text
                page.drawCircle({
                  x: annotation.x + 12,
                  y: height - annotation.y - 12,
                  size: 12,
                  color: pdfColor,
                });

                // Add note text below the icon
                if (annotation.text) {
                  page.drawText("📝", {
                    x: annotation.x + 8,
                    y: height - annotation.y - 16,
                    size: 10,
                    color: pdfLibRgb(1, 1, 1), // White color
                  });

                  // Add the note text nearby
                  page.drawText(annotation.text, {
                    x: annotation.x + 30,
                    y: height - annotation.y - 10,
                    size: 10,
                    color: pdfColor,
                  });
                }
                break;

              case "text":
                // Add text annotation directly
                if (annotation.text) {
                  page.drawText(annotation.text, {
                    x: annotation.x,
                    y: height - annotation.y,
                    size: 14,
                    color: pdfColor,
                  });
                }
                break;
            }
          }
        }
      }

      // Save the modified PDF
      const modifiedPdfBytes = await pdfDoc.save();
      const outputPath = `${
        FileSystem.documentDirectory
      }annotated_${Date.now()}_${fileName}`;

      // Convert Uint8Array to base64 for saving
      const base64String = btoa(
        String.fromCharCode(...Array.from(modifiedPdfBytes))
      );
      await FileSystem.writeAsStringAsync(outputPath, base64String, {
        encoding: FileSystem.EncodingType.Base64,
      });

      Alert.alert(
        "Success",
        `Annotated PDF with embedded annotations saved!\n\nFile: ${outputPath
          .split("/")
          .pop()}`,
        [
          { text: "OK" },
          {
            text: "Open Location",
            onPress: () => console.log("PDF saved at:", outputPath),
          },
        ]
      );
    } catch (error) {
      console.error("Error creating annotated PDF:", error);
      Alert.alert(
        "Error",
        "Failed to create annotated PDF with embedded annotations"
      );
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
    const pageAnnotations = annotations.filter(
      (ann) => ann.page === currentPage
    );

    return (
      <Svg
        style={[StyleSheet.absoluteFill, { zIndex: 10 }]}
        width={screenWidth}
        height={screenHeight - 200}
        viewBox={`0 0 ${screenWidth} ${screenHeight - 200}`}
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
                const screenPath = convertNormalizedPathToScreen(annotation.path);
                return (
                  <Path
                    key={annotation.id}
                    d={screenPath}
                    stroke={annotation.color}
                    strokeWidth={annotation.strokeWidth || 12}
                    fill="none"
                    opacity={0.4}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    onPress={() => deleteAnnotation(annotation.id)}
                  />
                );
              } else {
                // Traditional rectangle highlight - convert normalized coordinates to screen coordinates
                const screenX = annotation.x * screenWidth;
                const screenY = annotation.y * (screenHeight - 300);
                const screenWidth_rect = (annotation.width || 100) * screenWidth / 100; // Assume width was stored as percentage
                const screenHeight_rect = (annotation.height || 20);
                return (
                  <Rect
                    key={annotation.id}
                    x={screenX}
                    y={screenY}
                    width={screenWidth_rect}
                    height={screenHeight_rect}
                    fill={annotation.color}
                    opacity={0.4}
                    onPress={() => deleteAnnotation(annotation.id)}
                  />
                );
              }

            case "pen":
            case "brush":
            case "pencil":
              const penStyle = getPenStyle(annotation.type, annotation.strokeWidth || 3);
              const penScreenPath = convertNormalizedPathToScreen(annotation.path || "");
              return (
                <Path
                  key={annotation.id}
                  d={penScreenPath}
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
              const noteScreenX = annotation.x * screenWidth;
              const noteScreenY = annotation.y * (screenHeight - 300);
              return (
                <React.Fragment key={annotation.id}>
                  <Circle
                    cx={noteScreenX}
                    cy={noteScreenY}
                    r={12}
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
                    x={noteScreenX}
                    y={noteScreenY + 4}
                    textAnchor="middle"
                    fontSize={10}
                    fill="white"
                  >
                    📝
                  </SvgText>
                </React.Fragment>
              );

            case "text":
              const textScreenX = annotation.x * screenWidth;
              const textScreenY = annotation.y * (screenHeight - 300);
              return (
                <SvgText
                  key={annotation.id}
                  x={textScreenX}
                  y={textScreenY}
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
          </View>
          <View style={styles.headerRight}>
            {/* Save Button */}
            <TouchableOpacity
              onPress={handleSaveAnnotations}
              style={[styles.saveButton, hasUnsavedChanges && styles.saveButtonActive]}
              activeOpacity={0.8}
            >
              <MaterialIcons 
                name={hasUnsavedChanges ? "save" : "check"} 
                size={20} 
                color="#ffffff" 
              />
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
              <Text style={styles.zoomText}>{Math.round(zoomLevel * 100)}%</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={styles.zoomButton}
              onPress={handleZoomIn}
              activeOpacity={0.8}
            >
              <MaterialIcons name="zoom-in" size={20} color="#64748b" />
            </TouchableOpacity>

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

       {/* PDF Viewer with Scroll and Zoom */}
        <View style={styles.pdfContainer}>
          <ScrollView
            style={styles.pdfScrollView}
            contentContainerStyle={[
              styles.pdfScrollContent,
              {
                transform: [{ scale: zoomLevel }],
                width: screenWidth * zoomLevel,
                height: (screenHeight - 300) * zoomLevel,
              }
            ]}
            showsVerticalScrollIndicator={true}
            showsHorizontalScrollIndicator={true}
            maximumZoomScale={3}
            minimumZoomScale={0.5}
            bouncesZoom={true}
            // Remove panResponder from ScrollView
            scrollEnabled={selectedTool === null} // Disable scroll when annotation tool is selected
          >
            {!hasError && (
              <View style={styles.pdfWrapper} {...panResponder.panHandlers}>
                <Pdf
                  ref={pdfRef}
                  source={enhancedSource}
                  onLoadComplete={onPdfLoadComplete}
                  onPageChanged={onPageChanged}
                  onScaleChanged={onPdfScaleChanged}
                  style={{
                    width: screenWidth,
                    height: screenHeight - 300,
                    flex: 1,
                  }}
                  spacing={10}
                  enablePaging={true}
                  horizontal={false}
                />
                {!isLoading && !hasError && renderAnnotations()}
              </View>
            )}

            {/* Loading indicator */}
            {isLoading && (
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
            )}

            {/* Error state */}
            {hasError && (
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
            )}
          </ScrollView>
        </View>

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
  pdfContainer: {
    flex: 1,
    position: "relative",
    backgroundColor: "#ffffff",
    marginHorizontal: 8, // Add some margin for better visual separation
    borderRadius: 12,
    overflow: "hidden",
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  pdfWrapper: {
    flex: 1,
    position: 'relative',
  },

  pdf: {
    flex: 1,
    width: "100%",
    height: "100%",
    backgroundColor: "#ffffff",
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
});

export default PDFAnnotationViewer;
