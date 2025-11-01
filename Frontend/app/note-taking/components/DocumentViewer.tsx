import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  ScrollView,
  Alert,
  Modal,
  TextInput,
  ActivityIndicator,
  PanResponder,
  Animated,
  Platform,
  StatusBar,
  Linking,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_URL, API_ENDPOINTS, normalizeToHttps, toAbsoluteMediaUrl, getAlternateMediaUrls, joinUrl } from "@/constants/ApiConfig";
import Svg, { Rect, Circle, Path, Text as SvgText } from "react-native-svg";
import { WebView } from "react-native-webview";

const { width, height } = Dimensions.get("window");

interface Annotation {
  id: string;
  type: "highlight" | "note" | "underline" | "strikethrough" | "drawing";
  x: number;
  y: number;
  width?: number;
  height?: number;
  text?: string;
  note?: string;
  color: string;
  page: number;
  strokeData?: string; // For drawing annotations
  created_at: string;
}

interface DocumentViewerProps {
  documentUri: string;
  documentName: string;
  noteId: string;
  documentType: "pdf" | "word" | "document" | "image" | "doc" | "docx" | "txt";
  onClose: () => void;
}

const ANNOTATION_COLORS = [
  "#FFEB3B", // Yellow
  "#4CAF50", // Green
  "#2196F3", // Blue
  "#FF9800", // Orange
  "#E91E63", // Pink
  "#9C27B0", // Purple
  "#F44336", // Red
  "#795548", // Brown
];

export const DocumentViewer: React.FC<DocumentViewerProps> = ({
  documentUri,
  documentName,
  noteId,
  documentType,
  onClose,
}) => {
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [selectedTool, setSelectedTool] = useState<
    "highlight" | "note" | "underline" | "strikethrough" | "drawing"
  >("highlight");
  const [selectedColor, setSelectedColor] = useState(ANNOTATION_COLORS[0]);
  const [isAnnotating, setIsAnnotating] = useState(false);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [currentAnnotation, setCurrentAnnotation] =
    useState<Partial<Annotation> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [useAlternativeViewer, setUseAlternativeViewer] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [zoomScale, setZoomScale] = useState(1);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentStroke, setCurrentStroke] = useState<string>("");
  const [lastSaveTime, setLastSaveTime] = useState<number>(Date.now());
  const [authToken, setAuthToken] = useState<string>("");
  const [resolvedPdfUrl, setResolvedPdfUrl] = useState<string | null>(null);
  const [pdfAltTried, setPdfAltTried] = useState(false);

  const webViewRef = useRef<WebView>(null);
  const drawingPathRef = useRef<string>("");
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Load auth token
  useEffect(() => {
    const loadAuthToken = async () => {
      const token = await AsyncStorage.getItem("authToken");
      if (token) {
        setAuthToken(token);
      }
    };
    loadAuthToken();
  }, []);

  // Helper function to detect document type from URI
  const getActualDocumentType = (): typeof documentType => {
    if (documentType && documentType !== "document") {
      return documentType;
    }

    const uri = documentUri.toLowerCase();
    if (uri.match(/\.(jpg|jpeg|png|gif|bmp|webp|svg)$/)) {
      return "image";
    } else if (uri.match(/\.pdf$/)) {
      return "pdf";
    } else if (uri.match(/\.(doc|docx)$/)) {
      return "word";
    } else if (uri.match(/\.txt$/)) {
      return "txt";
    }

    return documentType;
  };

  const actualDocumentType = getActualDocumentType();

  // Helper to detect paths served by our backend (media, document endpoints, etc.)
  const isBackendDocumentUri = (uri: string) => {
    if (!uri) return false;
    const lc = uri.toLowerCase();
    return (
      lc.includes('/note_taking/documents/') ||
      lc.includes('/api/users/') ||
      lc.includes('/media/') ||
      lc.includes('/documents/') ||
      lc.startsWith('/')
    );
  };

  // Pre-resolve PDF URLs from media/documents with cache-busting and Railway host fallback
  useEffect(() => {
    const resolvePdf = async () => {
      try {
        setResolvedPdfUrl(null);
        setPdfAltTried(false);

        if (actualDocumentType !== 'pdf') return;

        // Only attempt to resolve for backend or media paths
        const needsResolve = isBackendDocumentUri(documentUri) || /\/media\/documents\//i.test(documentUri);
        if (!needsResolve) return;

        const absolute = toAbsoluteMediaUrl(documentUri, { cacheBust: true });

        // Try original first
        const ok = await tryFetchHead(absolute);
        if (ok) {
          setResolvedPdfUrl(absolute);
          return;
        }

        // Try alternates (e.g., without numeric Railway suffix)
        const alts = getAlternateMediaUrls(absolute);
        for (const alt of alts) {
          const altOk = await tryFetchHead(alt);
          if (altOk) {
            console.warn('PDF 404 on primary – using alternate host:', alt);
            setResolvedPdfUrl(alt);
            setPdfAltTried(true);
            return;
          }
        }

        // If all fail, still set the original so viewer can attempt
        setResolvedPdfUrl(absolute);
      } catch (e) {
        console.log('Error resolving PDF URL:', e);
        // Fallback to normalized absolute URL
        setResolvedPdfUrl(toAbsoluteMediaUrl(documentUri, { cacheBust: true }));
      }
    };

    // Helper: attempt a lightweight fetch to verify availability
    const tryFetchHead = async (url: string): Promise<boolean> => {
      try {
        const headers: any = {
          'Cache-Control': 'no-cache',
        };
        // If URL is under our API host and we have a token, include it
        try {
          const apiHost = new URL(API_URL).host;
          const u = new URL(url);
          if (authToken && u.host === apiHost) {
            headers['Authorization'] = `Token ${authToken}`;
          }
        } catch {}

        const resp = await fetch(url, { method: 'GET', headers });
        return resp.ok;
      } catch {
        return false;
      }
    };

    resolvePdf();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentUri, actualDocumentType, authToken]);

  // Auto-save functionality similar to drawing feature
  const autoSave = useCallback(async () => {
    try {
      if (!annotations || annotations.length === 0) return; // Nothing to save

      const token = await AsyncStorage.getItem("authToken");
      if (!token) return;

      // Use PUT to replace all annotations (backend contract)
      const response = await fetch(
        `${API_URL}${API_ENDPOINTS.DOCUMENT_ANNOTATIONS(noteId)}`,
        {
          method: "PUT",
          headers: {
            Authorization: `Token ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            annotations,
          }),
        }
      );

      if (response.ok) {
        setLastSaveTime(Date.now());
        console.log("Document annotations auto-saved (PUT)");
      } else {
        console.warn("Auto-save (PUT) failed with status:", response.status);
      }
    } catch (error) {
      console.error("Auto-save failed:", error);
    }
  }, [annotations, noteId]);

  // Auto-save every 10 seconds when there are changes
  useEffect(() => {
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }

    autoSaveTimeoutRef.current = setTimeout(() => {
      if (Date.now() - lastSaveTime > 5000) {
        // 5 seconds since last change
        autoSave();
      }
    }, 10000);

    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, [annotations, autoSave, lastSaveTime]);

  // Load existing annotations
  const loadAnnotations = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem("authToken");
      if (!token) return;

      const response = await fetch(
        `${API_URL}${API_ENDPOINTS.DOCUMENT_ANNOTATIONS(noteId)}`,
        {
          headers: {
            Authorization: `Token ${token}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        let loaded = Array.isArray(data.annotations) ? data.annotations : [];

        // Defensive normalization: if any item is a wrapper object like { annotations: [...] }
        // from a previous incorrect POST, flatten it.
        const wrapper = loaded.find(
          (ann: any) => ann && Array.isArray(ann.annotations)
        );
        if (wrapper && Array.isArray(wrapper.annotations)) {
          console.warn(
            "Flattening nested annotations payload from prior incorrect POST save"
          );
          loaded = wrapper.annotations;

          // Optional: attempt to repair backend data by PUT-ing the flattened list
          try {
            const token2 = await AsyncStorage.getItem("authToken");
            if (token2) {
              await fetch(
                `${API_URL}${API_ENDPOINTS.DOCUMENT_ANNOTATIONS(noteId)}`,
                {
                  method: "PUT",
                  headers: {
                    Authorization: `Token ${token2}`,
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({ annotations: loaded }),
                }
              );
            }
          } catch (repairErr) {
            console.warn(
              "Failed to repair annotations payload on server:",
              repairErr
            );
          }
        }

        setAnnotations(loaded);
      }
    } catch (error) {
      console.error("Error loading annotations:", error);
    }
  }, [noteId]);

  // Save annotation to backend
  const saveAnnotation = async (
    annotation: Omit<Annotation, "id" | "created_at">
  ) => {
    try {
      const token = await AsyncStorage.getItem("authToken");
      if (!token) return false;

      const response = await fetch(
        `${API_URL}${API_ENDPOINTS.DOCUMENT_ANNOTATIONS(noteId)}`,
        {
          method: "POST",
          headers: {
            Authorization: `Token ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(annotation),
        }
      );

      if (response.ok) {
        const data = await response.json();
        const newAnnotations = [...annotations, data.annotation];
        setAnnotations(newAnnotations);
        return true;
      }
      return false;
    } catch (error) {
      console.error("Error saving annotation:", error);
      return false;
    }
  };

  // Handle touch events for annotation
  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => isAnnotating,
    onMoveShouldSetPanResponder: () =>
      isAnnotating && selectedTool === "drawing",

    onPanResponderGrant: (evt) => {
      if (!isAnnotating) return;

      const { locationX, locationY } = evt.nativeEvent;

      if (selectedTool === "drawing") {
        setIsDrawing(true);
        drawingPathRef.current = `M${locationX},${locationY}`;
        setCurrentStroke(drawingPathRef.current);
      } else {
        // Start selection for other annotation types
        setCurrentAnnotation({
          type: selectedTool,
          x: locationX,
          y: locationY,
          color: selectedColor,
          page: currentPage,
        });
      }
    },

    onPanResponderMove: (evt) => {
      if (!isAnnotating) return;

      const { locationX, locationY } = evt.nativeEvent;

      if (selectedTool === "drawing" && isDrawing) {
        drawingPathRef.current += ` L${locationX},${locationY}`;
        setCurrentStroke(drawingPathRef.current);
      } else if (currentAnnotation) {
        // Update selection area
        setCurrentAnnotation({
          ...currentAnnotation,
          width: Math.abs(locationX - currentAnnotation.x!),
          height: Math.abs(locationY - currentAnnotation.y!),
        });
      }
    },

    onPanResponderRelease: (evt) => {
      if (!isAnnotating) return;

      if (selectedTool === "drawing" && isDrawing) {
        // Save drawing annotation
        const annotation: Omit<Annotation, "id" | "created_at"> = {
          type: "drawing",
          x: 0,
          y: 0,
          color: selectedColor,
          page: currentPage,
          strokeData: drawingPathRef.current,
        };

        saveAnnotation(annotation);
        setIsDrawing(false);
        setCurrentStroke("");
        drawingPathRef.current = "";
      } else if (currentAnnotation && selectedTool === "note") {
        // Show note modal for text input
        setShowNoteModal(true);
      } else if (currentAnnotation) {
        // Save other annotation types immediately
        const annotation: Omit<Annotation, "id" | "created_at"> = {
          type: selectedTool,
          x: currentAnnotation.x!,
          y: currentAnnotation.y!,
          width: currentAnnotation.width || 50,
          height: currentAnnotation.height || 20,
          color: selectedColor,
          page: currentPage,
        };

        saveAnnotation(annotation);
        setCurrentAnnotation(null);
      }
    },
  });

  // Handle note saving
  const handleSaveNote = async () => {
    if (!currentAnnotation || !noteText.trim()) return;

    const annotation: Omit<Annotation, "id" | "created_at"> = {
      type: "note",
      x: currentAnnotation.x!,
      y: currentAnnotation.y!,
      width: currentAnnotation.width || 100,
      height: currentAnnotation.height || 50,
      note: noteText,
      color: selectedColor,
      page: currentPage,
    };

    const success = await saveAnnotation(annotation);
    if (success) {
      setShowNoteModal(false);
      setNoteText("");
      setCurrentAnnotation(null);
    }
  };

  // Helper functions for document type styling
  const getDocumentTypeColor = () => {
    switch (actualDocumentType) {
      case "pdf":
        return "#EF4444";
      case "word":
      case "doc":
      case "docx":
        return "#2563EB";
      case "image":
        return "#059669";
      case "txt":
        return "#7C2D12";
      default:
        return "#6B7280";
    }
  };

  const getDocumentTypeIcon = () => {
    switch (actualDocumentType) {
      case "pdf":
        return "picture-as-pdf";
      case "word":
      case "doc":
      case "docx":
        return "description";
      case "image":
        return "image";
      case "txt":
        return "text-snippet";
      default:
        return "insert-drive-file";
    }
  };

  // Generate document URL for enhanced viewing with PDF.js support
  const getDocumentUrl = () => {
    console.log("Getting document URL for:", {
      actualDocumentType,
      useAlternativeViewer,
      Platform: Platform.OS,
      documentUri,
    });

    // If the documentUri is from our backend (starts with /note_taking/documents/), 
    // we need to add auth token
    const isBackendDocument = documentUri.includes('/note_taking/documents/') || 
                              documentUri.includes('/api/users/');
    
    if (isBackendDocument) {
      // For backend documents, normalize to absolute; if it's a PDF and we resolved, use that
      console.log("Using backend document from database:", documentUri);
      const fullUrl = documentUri.startsWith('http') ? documentUri : `${API_URL}${documentUri}`;
      const abs = normalizeToHttps(fullUrl);
      if (actualDocumentType === 'pdf' && resolvedPdfUrl) return resolvedPdfUrl;
      return abs;
    }

    if (actualDocumentType === "pdf") {
      // Only use remote (web-hosted) viewers for HTTP(S) URLs. If the
      // document is a local file (file://, content:// or app storage path),
      // return the local URI directly so the native PDF renderer or WebView
      // can open it without the remote PDF.js viewer (which will load a
      // default sample PDF if the `file` parameter is invalid).
      const source = resolvedPdfUrl || documentUri;
  const isRemote = typeof source === 'string' && (source.startsWith('http://') || source.startsWith('https://'));

      if (!isRemote) {
        console.log('PDF appears to be a local file, returning local URI for direct viewing:', documentUri);
        return documentUri;
      }

      // Normalize remote URIs to https and attach auth token when using backend
      let remotePdf = normalizeToHttps(source);
      try {
        const u = new URL(remotePdf);
        const apiHost = new URL(API_URL).host;
        // Prefer tokenized serve endpoint when noteId is available
        if (noteId && u.pathname.includes('/note_taking/documents/')) {
          const serve = joinUrl(API_URL, API_ENDPOINTS.SERVE_DOCUMENT(noteId));
          const serveUrl = new URL(serve);
          if (authToken) serveUrl.searchParams.set('token', authToken);
          serveUrl.searchParams.set('t', Date.now().toString());
          remotePdf = serveUrl.toString();
        } else if (authToken && (u.host === apiHost || u.pathname.startsWith('/'))) {
          // Append token for protected media when served from our API host
          u.searchParams.set('token', authToken);
          u.searchParams.set('t', Date.now().toString());
          remotePdf = u.toString();
        }
      } catch {}

      // For remote PDFs, use the selected web viewer
      if (useAlternativeViewer) {
        const encodedUri = encodeURIComponent(remotePdf);
        const googleDocsUrl = `https://docs.google.com/viewer?url=${encodedUri}&embedded=true`;
        console.log("Using Google Docs PDF viewer:", googleDocsUrl);
        return googleDocsUrl;
      } else {
        const encodedUri = encodeURIComponent(remotePdf);
        const pdfJsUrl = `https://mozilla.github.io/pdf.js/web/viewer.html?file=${encodedUri}`;
        console.log("Using PDF.js viewer:", pdfJsUrl);
        return pdfJsUrl;
      }
    } else if (actualDocumentType === "image") {
      // For images, display directly
      const imgUrl = documentUri.startsWith('http') ? normalizeToHttps(documentUri) : documentUri;
      console.log("Using direct image URL:", imgUrl);
      return imgUrl;
    } else if (
      actualDocumentType === "word" ||
      actualDocumentType === "doc" ||
      actualDocumentType === "docx"
    ) {
      // For Word documents, use Office Online viewer
      const encodedUri = encodeURIComponent(normalizeToHttps(documentUri));
      if (useAlternativeViewer) {
        // Alternative: Google Docs viewer
        const googleDocsUrl = `https://docs.google.com/viewer?url=${encodedUri}&embedded=true`;
        console.log("Using Google Docs for Word document:", googleDocsUrl);
        return googleDocsUrl;
      } else {
        // Primary: Office Online viewer
        const officeUrl = `https://view.officeapps.live.com/op/embed.aspx?src=${encodedUri}`;
        console.log("Using Office Online viewer:", officeUrl);
        return officeUrl;
      }
    } else {
      // For other document types, try generic viewers
      const encodedUri = encodeURIComponent(normalizeToHttps(documentUri));
      if (useAlternativeViewer) {
        const direct = documentUri.startsWith('http') ? normalizeToHttps(documentUri) : documentUri;
        console.log("Using direct access for other document:", direct);
        return direct;
      } else {
        const googleDocsUrl = `https://docs.google.com/viewer?url=${encodedUri}&embedded=true`;
        console.log("Using Google Docs for other document:", googleDocsUrl);
        return googleDocsUrl;
      }
    }
  };

  // Open document in external browser with platform-specific handling
  const openInExternalBrowser = async () => {
    try {
      // Build an external URL, adding token for backend documents when available
      let url = documentUri;
      const source = resolvedPdfUrl || documentUri;
      if (actualDocumentType === 'pdf' && noteId) {
        // Prefer serve endpoint with token
        const serve = joinUrl(API_URL, API_ENDPOINTS.SERVE_DOCUMENT(noteId));
        const serveUrl = new URL(serve);
        if (authToken) serveUrl.searchParams.set('token', authToken);
        serveUrl.searchParams.set('t', Date.now().toString());
        url = serveUrl.toString();
      } else if (isBackendDocumentUri(source)) {
        const base = source.startsWith('http') ? source : `${API_URL}${source}`;
        const full = new URL(normalizeToHttps(base));
        if (authToken) full.searchParams.set('token', authToken);
        full.searchParams.set('t', Date.now().toString());
        url = full.toString();
      } else if (url.startsWith('http://')) {
        url = normalizeToHttps(url);
      }
      console.log("Opening in external browser:", url);

      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
      } else {
        Alert.alert(
          "Error",
          "Cannot open this document in external browser. The URL might not be accessible from outside the app."
        );
      }
    } catch (error) {
      console.error("Error opening document in external browser:", error);
      Alert.alert("Error", "Failed to open document in external browser");
    }
  };

  // Render annotation overlay
  const renderAnnotationOverlay = () => {
    const pageAnnotations = annotations.filter(
      (ann) => ann.page === currentPage
    );

    // Normalize potentially malformed SVG path strings (e.g., "M,10,10 L,20,20")
    const sanitizeSvgPath = (raw: string): string => {
      if (!raw) return "";
      let path = raw
        .replace(/([ML])\s*[\.,]\s*/g, "$1 ")
        .replace(/\s+/g, " ")
        .trim();
      let out = "";
      let i = 0;
      const len = path.length;
      const readNumber = (): { num: number | null; next: number } => {
        let j = i;
        const m = /^-?\d*\.?\d+/.exec(path.slice(j));
        if (!m) return { num: null, next: j };
        const val = parseFloat(m[0]);
        return {
          num: Number.isFinite(val) ? val : null,
          next: j + m[0].length,
        };
      };

      while (i < len) {
        const ch = path[i];
        if (ch === "M" || ch === "L") {
          out += ch + " ";
          i++;
          while (i < len && /[\s,]/.test(path[i])) i++;
          let { num: x, next } = readNumber();
          if (x === null) continue;
          i = next;
          while (i < len && /[\s,]/.test(path[i])) i++;
          let { num: y, next: next2 } = readNumber();
          if (y === null) continue;
          i = next2;
          // Consume optional :pressure
          if (path[i] === ":") {
            let k = i + 1;
            const pm = /^-?\d*\.?\d+/.exec(path.slice(k));
            if (pm) i = k + pm[0].length;
            else i = k;
          }
          out += `${x},${y}`;
        } else {
          if (ch === "," || ch === "\\n" || ch === "\\r") {
            i++;
            continue;
          }
          if (ch === "Z" || ch === "z") out += ch;
          if (ch === " ") {
            if (out.length && out[out.length - 1] !== " ") out += " ";
            i++;
            continue;
          }
          // skip other tokens
          i++;
        }
        if (out.length && out[out.length - 1] !== " ") out += " ";
      }
      return out.trim();
    };

    return (
      <Svg style={StyleSheet.absoluteFillObject} pointerEvents="none">
        {pageAnnotations.map((annotation) => {
          if (annotation.type === "drawing" && annotation.strokeData) {
            return (
              <Path
                key={annotation.id}
                d={sanitizeSvgPath(annotation.strokeData)}
                stroke={annotation.color}
                strokeWidth={3}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            );
          } else if (annotation.type === "highlight") {
            return (
              <Rect
                key={annotation.id}
                x={annotation.x}
                y={annotation.y}
                width={annotation.width || 50}
                height={annotation.height || 20}
                fill={annotation.color}
                opacity={0.3}
              />
            );
          } else if (annotation.type === "note") {
            return (
              <React.Fragment key={annotation.id}>
                <Circle
                  cx={annotation.x}
                  cy={annotation.y}
                  r={12}
                  fill={annotation.color}
                />
                <SvgText
                  x={annotation.x}
                  y={annotation.y + 4}
                  textAnchor="middle"
                  fontSize={10}
                  fill="white"
                >
                  N
                </SvgText>
              </React.Fragment>
            );
          }
          return null;
        })}

        {/* Current stroke while drawing */}
        {isDrawing && currentStroke && (
          <Path
            d={sanitizeSvgPath(currentStroke)}
            stroke={selectedColor}
            strokeWidth={3}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {/* Current selection */}
        {currentAnnotation && selectedTool !== "drawing" && (
          <Rect
            x={currentAnnotation.x!}
            y={currentAnnotation.y!}
            width={currentAnnotation.width || 50}
            height={currentAnnotation.height || 20}
            fill={selectedColor}
            opacity={0.3}
            stroke={selectedColor}
            strokeWidth={2}
            strokeDasharray="5,5"
          />
        )}
      </Svg>
    );
  };

  useEffect(() => {
    console.log("DocumentViewer mounted with:", {
      documentUri,
      documentName,
      documentType,
      actualDocumentType,
      noteId,
    });
    loadAnnotations();
  }, [loadAnnotations]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
          <MaterialIcons name="arrow-back" size={24} color="#1F2937" />
        </TouchableOpacity>

        <Text style={styles.headerTitle} numberOfLines={1}>
          {documentName}
        </Text>

        <View style={styles.headerActions}>
          {/* Document Type Badge */}
          <View
            style={[
              styles.documentTypeBadge,
              { backgroundColor: getDocumentTypeColor() },
            ]}
          >
            <MaterialIcons
              name={getDocumentTypeIcon()}
              size={14}
              color="#FFFFFF"
            />
            <Text style={styles.documentTypeText}>
              {actualDocumentType.toUpperCase()}
            </Text>
          </View>

          <Text style={styles.pageInfo}>
            Page {currentPage}/{totalPages}
          </Text>

          {(actualDocumentType === "pdf" ||
            actualDocumentType === "word" ||
            actualDocumentType === "doc" ||
            actualDocumentType === "docx") && (
            <TouchableOpacity
              style={styles.switchViewerButton}
              onPress={() => {
                setUseAlternativeViewer(!useAlternativeViewer);
                setIsLoading(true);
                setHasError(false);
                // Force WebView to reload with new URL
                setTimeout(() => {
                  webViewRef.current?.reload();
                }, 100);
              }}
            >
              <MaterialIcons name="swap-horiz" size={16} color="#6366F1" />
              <Text style={styles.switchViewerText}>
                {actualDocumentType === "pdf"
                  ? useAlternativeViewer
                    ? "PDF.js"
                    : "Google Docs"
                  : useAlternativeViewer
                  ? "Office Online"
                  : "Google Docs"}
              </Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.externalButton}
            onPress={openInExternalBrowser}
          >
            <MaterialIcons name="open-in-new" size={20} color="#6366F1" />
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.annotateButton,
              isAnnotating && styles.annotateButtonActive,
            ]}
            onPress={() => setIsAnnotating(!isAnnotating)}
          >
            <MaterialIcons
              name={isAnnotating ? "edit-off" : "edit"}
              size={20}
              color={isAnnotating ? "#FFFFFF" : "#6366F1"}
            />
          </TouchableOpacity>
        </View>
      </View>

      {/* Annotation Toolbar */}
      {isAnnotating && (
        <View style={styles.toolbar}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {/* Tool Selection */}
            <View style={styles.toolGroup}>
              {(
                [
                  "highlight",
                  "note",
                  "underline",
                  "strikethrough",
                  "drawing",
                ] as const
              ).map((tool) => (
                <TouchableOpacity
                  key={tool}
                  style={[
                    styles.toolButton,
                    selectedTool === tool && styles.toolButtonActive,
                  ]}
                  onPress={() => setSelectedTool(tool)}
                >
                  <MaterialIcons
                    name={
                      tool === "highlight"
                        ? "highlight"
                        : tool === "note"
                        ? "note-add"
                        : tool === "underline"
                        ? "format-underlined"
                        : tool === "strikethrough"
                        ? "strikethrough-s"
                        : "brush"
                    }
                    size={18}
                    color={selectedTool === tool ? "#FFFFFF" : "#374151"}
                  />
                </TouchableOpacity>
              ))}
            </View>

            {/* Color Selection */}
            <View style={styles.colorGroup}>
              {ANNOTATION_COLORS.map((color) => (
                <TouchableOpacity
                  key={color}
                  style={[
                    styles.colorButton,
                    { backgroundColor: color },
                    selectedColor === color && styles.colorButtonActive,
                  ]}
                  onPress={() => setSelectedColor(color)}
                />
              ))}
            </View>
          </ScrollView>
        </View>
      )}

      {/* Document Viewer */}
      <View style={styles.documentContainer} {...panResponder.panHandlers}>
        <WebView
          ref={webViewRef}
          source={{
            uri: getDocumentUrl(),
            headers: isBackendDocumentUri(documentUri) && authToken
              ? {
                  Authorization: `Token ${authToken}`,
                  "Cache-Control": "no-cache, no-store, must-revalidate",
                  Pragma: "no-cache",
                  Expires: "0",
                }
              : actualDocumentType === "image"
              ? {
                  "Cache-Control": "no-cache, no-store, must-revalidate",
                  Pragma: "no-cache",
                  Expires: "0",
                }
              : undefined,
          }}
          style={styles.webView}
          onLoadStart={() => {
            setIsLoading(true);
            const currentUrl = getDocumentUrl();
            console.log("Loading document:", documentUri);
            console.log("Document type:", actualDocumentType);
            console.log("WebView URL:", currentUrl);
            console.log("useAlternativeViewer:", useAlternativeViewer);
            console.log("Platform:", Platform.OS);
          }}
          onLoadEnd={() => {
            setIsLoading(false);
            console.log("Document loaded successfully");
            console.log("Final loaded URL:", getDocumentUrl());

            // For images, set total pages to 1 immediately
            if (actualDocumentType === "image") {
              setTotalPages(1);
              setCurrentPage(1);
              return;
            }

            // Inject JavaScript to get document info and enable enhanced PDF features
            webViewRef.current?.injectJavaScript(`
              (function() {
                try {
                  console.log('WebView: Checking document info');
                  console.log('WebView: Current URL:', window.location.href);
                  console.log('WebView: Document title:', document.title);
                  
                  // Enhanced PDF.js detection and controls
                  if (window.PDFViewerApplication && window.PDFViewerApplication.pdfDocument) {
                    const numPages = window.PDFViewerApplication.pdfDocument.numPages;
                    const currentPage = window.PDFViewerApplication.page;
                    
                    // Add custom styling for better mobile experience
                    const style = document.createElement('style');
                    style.textContent = \`
                      #viewer { 
                        background-color: #f5f5f5 !important; 
                      }
                      .page { 
                        margin: 10px auto !important; 
                        box-shadow: 0 4px 8px rgba(0,0,0,0.1) !important; 
                        border-radius: 8px !important;
                      }
                      #toolbarContainer {
                        background-color: #ffffff !important;
                        border-bottom: 1px solid #e5e7eb !important;
                      }
                      .toolbar {
                        background-color: transparent !important;
                      }
                      #viewerContainer {
                        overflow: auto !important;
                        background-color: #f8fafc !important;
                      }
                    \`;
                    document.head.appendChild(style);
                    
                    // Send page info
                    window.ReactNativeWebView.postMessage(JSON.stringify({
                      type: 'documentInfo',
                      totalPages: numPages,
                      currentPage: currentPage,
                      documentType: 'pdf'
                    }));
                    
                    // Listen for page changes
                    if (window.PDFViewerApplication.eventBus) {
                      window.PDFViewerApplication.eventBus.on('pagechanging', function(evt) {
                        window.ReactNativeWebView.postMessage(JSON.stringify({
                          type: 'pageChanged',
                          currentPage: evt.pageNumber,
                          totalPages: numPages
                        }));
                      });
                    }
                    
                    console.log('WebView: Enhanced PDF.js detected, pages:', numPages);
                  }
                  // For Google Docs viewer
                  else if (window.location.href.includes('docs.google.com')) {
                    // Try to detect pages in Google Docs viewer
                    setTimeout(() => {
                      const pages = document.querySelectorAll('img[src*="page"]').length;
                      window.ReactNativeWebView.postMessage(JSON.stringify({
                        type: 'documentInfo',
                        totalPages: pages || 1,
                        currentPage: 1,
                        documentType: 'google_docs'
                      }));
                    }, 2000);
                  }
                  // For Office Online viewer
                  else if (window.location.href.includes('officeapps.live.com')) {
                    window.ReactNativeWebView.postMessage(JSON.stringify({
                      type: 'documentInfo',
                      totalPages: 1,
                      currentPage: 1,
                      documentType: 'office'
                    }));
                  }
                  // For other viewers, try to get page info
                  else if (document.querySelector('.page')) {
                    const pages = document.querySelectorAll('.page').length;
                    window.ReactNativeWebView.postMessage(JSON.stringify({
                      type: 'documentInfo',
                      totalPages: pages || 1,
                      currentPage: 1
                    }));
                    console.log('WebView: Pages detected:', pages);
                  }
                  // Default fallback
                  else {
                    window.ReactNativeWebView.postMessage(JSON.stringify({
                      type: 'documentInfo',
                      totalPages: 1,
                      currentPage: 1
                    }));
                    console.log('WebView: Fallback document info set');
                  }
                } catch (e) {
                  console.log('WebView: Error in JavaScript:', e.message);
                  window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: 'error',
                    message: 'JavaScript execution failed: ' + e.message
                  }));
                }
              })();
            `);
          }}
          onMessage={(event) => {
            try {
              const data = JSON.parse(event.nativeEvent.data);
              console.log("Message from WebView:", data);

              if (data.type === "documentInfo") {
                setTotalPages(data.totalPages || 1);
                setCurrentPage(data.currentPage || 1);
                console.log("Document info updated:", data);
              } else if (data.type === "pageChanged") {
                setCurrentPage(data.currentPage || 1);
                console.log("Page changed to:", data.currentPage);
              } else if (data.type === "error") {
                console.warn("WebView reported error:", data.message);
                // Set error state if the error seems critical
                if (
                  data.message
                    .toLowerCase()
                    .includes("preview not available") ||
                  data.message.toLowerCase().includes("not found")
                ) {
                  setHasError(true);
                }
              }
            } catch (e) {
              console.log("Failed to parse message:", e);
            }
          }}
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          javaScriptEnabled
          domStorageEnabled
          scalesPageToFit={actualDocumentType === "image"}
          startInLoadingState
          mixedContentMode="compatibility"
          allowFileAccess={true}
          allowFileAccessFromFileURLs={true}
          allowUniversalAccessFromFileURLs={true}
          renderLoading={() => (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#6366F1" />
              <Text style={styles.loadingText}>
                Loading {actualDocumentType}...
              </Text>
            </View>
          )}
          onError={(syntheticEvent) => {
            const { nativeEvent } = syntheticEvent;
            console.warn("WebView error: ", nativeEvent);
            setIsLoading(false);
            setHasError(true);

            // Try alternative viewer if not already tried
            if (!useAlternativeViewer && actualDocumentType === "pdf") {
              Alert.alert(
                "PDF Viewer Error",
                "The PDF failed to load with PDF.js. Would you like to try Google Docs viewer instead?",
                [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Try Google Docs",
                    onPress: () => {
                      setUseAlternativeViewer(true);
                      setHasError(false);
                      setIsLoading(true);
                      // Force WebView to reload with new URL
                      setTimeout(() => {
                        webViewRef.current?.reload();
                      }, 100);
                    },
                  },
                  { text: "Open in Browser", onPress: openInExternalBrowser },
                ]
              );
            } else {
              Alert.alert(
                "Document Loading Error",
                "Failed to load the document in any available viewer. This might happen if the document format is not supported or there are network connectivity issues.",
                [
                  { text: "OK", style: "cancel" },
                  { text: "Open in Browser", onPress: openInExternalBrowser },
                ]
              );
            }
          }}
          onHttpError={(syntheticEvent) => {
            const { nativeEvent } = syntheticEvent;
            console.warn("WebView HTTP error: ", nativeEvent);
            setIsLoading(false);
            if (nativeEvent.statusCode >= 400) {
              setHasError(true);
            }
          }}
        />

        {/* Annotation Overlay */}
        {renderAnnotationOverlay()}

        {/* Loading Indicator */}
        {isLoading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#6366F1" />
            <Text style={styles.loadingText}>Loading document...</Text>
          </View>
        )}

        {/* Error State */}
        {hasError && !isLoading && (
          <View style={styles.errorContainer}>
            <MaterialIcons name="error-outline" size={64} color="#EF4444" />
            <Text style={styles.errorTitle}>Failed to Load Document</Text>
            <Text style={styles.errorMessage}>
              The document viewer couldn't load this file. This might happen
              with certain file formats or corrupted files.
            </Text>
            <TouchableOpacity
              style={styles.retryButton}
              onPress={() => {
                setHasError(false);
                setIsLoading(true);
                webViewRef.current?.reload();
              }}
            >
              <Text style={styles.retryButtonText}>Try Again</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.openExternalButton}
              onPress={openInExternalBrowser}
            >
              <MaterialIcons name="open-in-new" size={20} color="#6366F1" />
              <Text style={styles.openExternalText}>Open in Browser</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Page Navigation */}
      <View style={styles.pageNavigation}>
        <TouchableOpacity
          style={[
            styles.navButton,
            currentPage === 1 && styles.navButtonDisabled,
          ]}
          onPress={() => {
            if (currentPage > 1) {
              const newPage = currentPage - 1;
              setCurrentPage(newPage);

              // Send command to PDF.js viewer to change page
              if (actualDocumentType === "pdf" && webViewRef.current) {
                webViewRef.current.injectJavaScript(`
                  if (window.PDFViewerApplication && window.PDFViewerApplication.pdfViewer) {
                    window.PDFViewerApplication.pdfViewer.currentPageNumber = ${newPage};
                  }
                `);
              }
            }
          }}
          disabled={currentPage === 1}
        >
          <MaterialIcons
            name="chevron-left"
            size={24}
            color={currentPage === 1 ? "#D1D5DB" : "#6366F1"}
          />
        </TouchableOpacity>

        <View style={styles.pageInfoContainer}>
          <Text style={styles.pageText}>
            {currentPage} / {totalPages}
          </Text>
          {actualDocumentType === "pdf" && !useAlternativeViewer && (
            <Text style={styles.viewerTypeText}>PDF.js</Text>
          )}
          {actualDocumentType === "pdf" && useAlternativeViewer && (
            <Text style={styles.viewerTypeText}>Google Docs</Text>
          )}
        </View>

        <TouchableOpacity
          style={[
            styles.navButton,
            currentPage === totalPages && styles.navButtonDisabled,
          ]}
          onPress={() => {
            if (currentPage < totalPages) {
              const newPage = currentPage + 1;
              setCurrentPage(newPage);

              // Send command to PDF.js viewer to change page
              if (actualDocumentType === "pdf" && webViewRef.current) {
                webViewRef.current.injectJavaScript(`
                  if (window.PDFViewerApplication && window.PDFViewerApplication.pdfViewer) {
                    window.PDFViewerApplication.pdfViewer.currentPageNumber = ${newPage};
                  }
                `);
              }
            }
          }}
          disabled={currentPage === totalPages}
        >
          <MaterialIcons
            name="chevron-right"
            size={24}
            color={currentPage === totalPages ? "#D1D5DB" : "#6366F1"}
          />
        </TouchableOpacity>
      </View>

      {/* Note Input Modal */}
      <Modal
        visible={showNoteModal}
        animationType="slide"
        presentationStyle="formSheet"
        onRequestClose={() => setShowNoteModal(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Add Note</Text>
            <TouchableOpacity
              onPress={() => setShowNoteModal(false)}
              style={styles.modalCloseButton}
            >
              <MaterialIcons name="close" size={24} color="#6B7280" />
            </TouchableOpacity>
          </View>

          <View style={styles.modalContent}>
            <TextInput
              style={styles.noteInput}
              value={noteText}
              onChangeText={setNoteText}
              placeholder="Enter your note here..."
              multiline
              numberOfLines={6}
              autoFocus
            />
          </View>

          <View style={styles.modalFooter}>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => setShowNoteModal(false)}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.saveButton,
                !noteText.trim() && styles.saveButtonDisabled,
              ]}
              onPress={handleSaveNote}
              disabled={!noteText.trim()}
            >
              <Text style={styles.saveButtonText}>Save Note</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
    paddingTop: Platform.OS === "ios" ? 50 : 20,
  },
  closeButton: {
    padding: 8,
    marginRight: 8,
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontFamily: "Inter-Bold",
    color: "#1F2937",
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  documentTypeBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  documentTypeText: {
    fontSize: 10,
    fontFamily: "Inter-Bold",
    color: "#FFFFFF",
  },
  pageInfo: {
    fontSize: 12,
    fontFamily: "Inter-Medium",
    color: "#6B7280",
  },
  annotateButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: "#EEF2FF",
    borderWidth: 1,
    borderColor: "#6366F1",
  },
  externalButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: "#F3F4F6",
    borderWidth: 1,
    borderColor: "#D1D5DB",
  },
  switchViewerButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 4,
    backgroundColor: "#EEF2FF",
    borderWidth: 1,
    borderColor: "#C7D2FE",
  },
  switchViewerText: {
    fontSize: 10,
    fontFamily: "Inter-Medium",
    color: "#6366F1",
    marginLeft: 4,
  },
  debugButton: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 4,
    backgroundColor: "#FEF3C7",
    borderWidth: 1,
    borderColor: "#F59E0B",
  },
  annotateButtonActive: {
    backgroundColor: "#6366F1",
  },
  toolbar: {
    backgroundColor: "#FFFFFF",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  toolGroup: {
    flexDirection: "row",
    marginRight: 20,
    gap: 8,
  },
  toolButton: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: "#F3F4F6",
    justifyContent: "center",
    alignItems: "center",
  },
  toolButtonActive: {
    backgroundColor: "#6366F1",
  },
  colorGroup: {
    flexDirection: "row",
    gap: 8,
  },
  colorButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: "transparent",
  },
  colorButtonActive: {
    borderColor: "#374151",
    borderWidth: 3,
  },
  documentContainer: {
    flex: 1,
    position: "relative",
  },
  webView: {
    flex: 1,
  },
  loadingContainer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255, 255, 255, 0.9)",
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    fontFamily: "Inter-Medium",
    color: "#6B7280",
  },
  pageNavigation: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    gap: 20,
  },
  pageInfoContainer: {
    alignItems: "center",
  },
  pageText: {
    fontSize: 16,
    fontFamily: "Inter-Medium",
    color: "#1F2937",
  },
  viewerTypeText: {
    fontSize: 10,
    fontFamily: "Inter-Regular",
    color: "#6B7280",
    marginTop: 2,
  },
  navButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#EEF2FF",
    justifyContent: "center",
    alignItems: "center",
  },
  navButtonDisabled: {
    backgroundColor: "#F3F4F6",
  },
  modalContainer: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
    paddingTop: Platform.OS === "ios" ? 50 : 20,
  },
  modalTitle: {
    fontSize: 18,
    fontFamily: "Inter-Bold",
    color: "#1F2937",
  },
  modalCloseButton: {
    padding: 4,
  },
  modalContent: {
    flex: 1,
    padding: 20,
  },
  noteInput: {
    flex: 1,
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 8,
    padding: 16,
    fontSize: 16,
    fontFamily: "Inter-Regular",
    textAlignVertical: "top",
    color: "#374151",
  },
  modalFooter: {
    flexDirection: "row",
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    alignItems: "center",
    borderRadius: 8,
    backgroundColor: "#F3F4F6",
  },
  cancelButtonText: {
    fontSize: 16,
    fontFamily: "Inter-Medium",
    color: "#374151",
  },
  saveButton: {
    flex: 2,
    paddingVertical: 14,
    alignItems: "center",
    borderRadius: 8,
    backgroundColor: "#6366F1",
  },
  saveButtonDisabled: {
    backgroundColor: "#D1D5DB",
  },
  saveButtonText: {
    fontSize: 16,
    fontFamily: "Inter-Medium",
    color: "#FFFFFF",
  },
  errorContainer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  errorTitle: {
    fontSize: 20,
    fontFamily: "Inter-Bold",
    color: "#1F2937",
    marginTop: 16,
    marginBottom: 8,
  },
  errorMessage: {
    fontSize: 16,
    fontFamily: "Inter-Regular",
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 24,
    marginBottom: 24,
  },
  retryButton: {
    backgroundColor: "#6366F1",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  retryButtonText: {
    fontSize: 16,
    fontFamily: "Inter-Medium",
    color: "#FFFFFF",
  },
  openExternalButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: "#F3F4F6",
  },
  openExternalText: {
    fontSize: 16,
    fontFamily: "Inter-Medium",
    color: "#6366F1",
    marginLeft: 8,
  },
});
