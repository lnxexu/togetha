import { useSafeAreaInsets } from "react-native-safe-area-context";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useFocusEffect, useRoute, RouteProp } from "@react-navigation/native";
import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Alert,
  AppState,
  Dimensions,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
  TouchableWithoutFeedback,
  RefreshControl,
  ActivityIndicator,
  Share,
} from "react-native";
import {
  MaterialIcons,
  MaterialCommunityIcons,
  Ionicons,
} from "@expo/vector-icons";
import RenderHtml from "react-native-render-html";
import { SafeAreaWrapper } from "../components/SafeAreaWrapper";
import Navbar from "../NavBar";
import { RootStackParamList } from "../navigation/AppNavigator";
import AsyncStorage from "@react-native-async-storage/async-storage";
import TemplatePreview from "./components/TemplatePreview";
import { DocumentPreviewModal } from "./components/DocumentPreviewModal";
import { DocumentViewer } from "./components/DocumentViewer";
import PDFAnnotationViewer from "./components/PDFAnnotationViewer";
import DocumentPreview from "./components/DocumentPreview";
import { LinearGradient } from "expo-linear-gradient";
import { TemplateOverlay, TemplateType } from "./components/TemplateOverlay";
import { API_URL, API_ENDPOINTS } from "@/constants/ApiConfig";
import {
  showSuccessToast,
  showErrorToast,
  showWarningToast,
} from "../utils/ToastUtils";
import SkeletonLoader from "../components/SkeletonLoader";
import { folderCacheUtils } from "../utils/FolderCacheUtils";
import { getLocalPDFPath, isRemoteURL } from "./utils/pdfUtils";
import { parseServerDate, formatShortLocalDate } from "./utils/localDate";
import offlineNotesService from "./services/offlineNotesService";
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import ViewShot from "react-native-view-shot";
import { drawingAPI } from "./services/drawingAPI";

const { width } = Dimensions.get("window");

type NotesScreenNavigationProp = NativeStackNavigationProp<RootStackParamList>;
type NotesScreenRouteProp = RouteProp<RootStackParamList, "Notes">;

interface NotesScreenProps {
  navigation: NotesScreenNavigationProp;
  route: NotesScreenRouteProp;
}

interface TagObject {
  id: number;
  name: string;
}

interface Note {
  id: string;
  title: string;
  content: string;
  formatted_content?: string;
  folder?: string;
  folderId?: string;
  createdAt: Date;
  updatedAt: Date;
  lastAccessedAt?: Date;
  type: "text" | "image" | "drawing" | "document"; // Add "document" type for PDF/Word documents
  tags?: (string | TagObject)[];
  linkedTaskId?: string;
  attachments?: Attachment[];
  is_archived?: boolean;
  template?: string;
  document_file?: string; // URL or path to the document file
  document_url?: string; // Full URL to the document file
  document_annotations?: any; // JSON field for annotations
  // Enhanced drawing_data field to handle your specific stroke array format
  drawing_data?:
    | string // JSON string containing stroke array or drawing object
    | {
        // Direct array of stroke objects (your format)
        id: string;
        points: number[];
        color: string;
        width: number;
        tool: string;
        timestamp: number;
        opacity: number;
      }[]
    | {
        // Object containing strokes or other drawing data
        strokes?: {
          id: string;
          points: number[];
          color: string;
          width: number;
          tool: string;
          timestamp: number;
          opacity: number;
        }[];
        template?: string;
        type?: string;
        [key: string]: any;
      }
    | null;
}

interface Attachment {
  id: string;
  uri: string;
  name: string;
  type: "image" | "pdf";
  timestamp: Date;
}

interface Folder {
  id: string;
  name: string;
  color: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  notes_count?: number;
  description?: string;
  created_at?: string;
  updated_at?: string;
}

const DUMMY_FOLDERS: Folder[] = [];

const INITIAL_NOTES: Note[] = [];

const FOLDER_COLORS = [
  "#667EEA",
  "#F093FB",
  "#4FACFE",
  "#43E97B",
  "#FA8BFF",
  "#2BD2FF",
  "#FF6B6B",
  "#4ECDC4",
  "#45B7D1",
  "#96CEB4",
  "#FFEAA7",
  "#DDA0DD",
  "#98D8C8",
  "#F7DC6F",
  "#BB8FCE",
];

const DRAWING_SIZES = [
  { id: "small", name: "Small", landscape: "400×300", portrait: "300×400" },
  { id: "medium", name: "Medium", landscape: "800×600", portrait: "600×800" },
  { id: "large", name: "Large", landscape: "1200×900", portrait: "900×1200" },
  {
    id: "xl",
    name: "Extra Large",
    landscape: "1600×1200",
    portrait: "1200×1600",
  },
];

const DRAWING_TEMPLATES = [
  { id: "blank", name: "Blank Canvas", icon: "crop-din" },
  { id: "grid", name: "Grid", icon: "grid-on" },
  { id: "lines", name: "Lined Paper", icon: "format-align-justify" },
  { id: "dots", name: "Dot Grid", icon: "more-horiz" },
  { id: "sketch", name: "Sketch Pad", icon: "brush" },
  { id: "notes", name: "Note Taking", icon: "note-add" },
];

export default function NotesScreen({ navigation, route }: NotesScreenProps) {
  // Get folder parameters from navigation
  const { folderId, folderName } = route?.params || {};
  const [notes, setNotes] = useState<Note[]>(INITIAL_NOTES);
  const [folders, setFolders] = useState<Folder[]>(DUMMY_FOLDERS);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFilter, setSelectedFilter] = useState("all");
  // Removed list mode option - always using grid view for modern appearance
  const [showCreateFolderModal, setShowCreateFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [selectedFolderColor, setSelectedFolderColor] = useState("#667EEA");
  const [showMoreVertMenu, setShowMoreVertMenu] = useState(false);
  const [showStatsModal, setShowStatsModal] = useState(false);
  const [showSearchBar, setShowSearchBar] = useState(false);
  const [activeNoteOptions, setActiveNoteOptions] = useState<string | null>(
    null
  );
  const [dropdownPosition, setDropdownPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);

  const [isLoading, setIsLoading] = useState(false);

  // Fix 2: Either use error state or use _ to indicate unused variable
  const [errorState, setError] = useState<string | null>(null);

  const [refreshing, setRefreshing] = useState(false);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [selectedNotes, setSelectedNotes] = useState<string[]>([]);
  const [showSortNotesModal, setShowSortNotesModal] = useState(false);
  const [isSelectMode, setIsSelectMode] = useState(false);
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();

  // Fix 3: Either use folderCounts or use _ to indicate unused variable
  const [folderCounts, setFolderCounts] = useState<Record<string, number>>({});

  const [showFolderDropdown, setShowFolderDropdown] = useState(false);
  const [selectedFilterFolder, setSelectedFilterFolder] = useState<
    string | null
  >(null);
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editingFolderName, setEditingFolderName] = useState("");
  const [showEditFolderModal, setShowEditFolderModal] = useState(false);
  const [lastFolderFetch, setLastFolderFetch] = useState<number>(0);
  const [lastNoteFetch, setLastNoteFetch] = useState<number>(0);
  const [showFolderSelectionModal, setShowFolderSelectionModal] =
    useState(false);
  const [newNoteFolder, setNewNoteFolder] = useState<string | null>(null);
  const [showFolderOptionsModal, setShowFolderOptionsModal] = useState(false);
  const [selectedFolderForOptions, setSelectedFolderForOptions] = useState<
    string | null
  >(null);
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false);
  const [folderToDelete, setFolderToDelete] = useState<string | null>(null);
  const [showDocumentPreviewModal, setShowDocumentPreviewModal] =
    useState(false);
  const [isUploadingDocument, setIsUploadingDocument] = useState(false);
  const [showAddOptionsMenu, setShowAddOptionsMenu] = useState(false);
  const insets = useSafeAreaInsets();
  const [navbarHeight, setNavbarHeight] = useState<number>(0);

  // Compute FAB bottom dynamically to match ToDo screen positioning
  const isLandscape = windowWidth > windowHeight;
  const fabExtraOffset = 5; // keep same offset as ToDo
  const defaultNavbarHeight = isLandscape ? 48 : Platform.OS === "ios" ? 64 : 56;
  const fabBottom = Math.max(insets.bottom, 5) + (navbarHeight || defaultNavbarHeight) + fabExtraOffset;
  const [showDrawingSetupModal, setShowDrawingSetupModal] = useState(false);
  const [drawingTitle, setDrawingTitle] = useState("");
  const [selectedSize, setSelectedSize] = useState("medium");
  const [selectedOrientation, setSelectedOrientation] = useState("landscape");
  const [selectedTemplate, setSelectedTemplate] = useState("blank");

  // Document viewer state
  const [showDocumentViewer, setShowDocumentViewer] = useState(false);
  const [showPDFViewer, setShowPDFViewer] = useState(false);
  const [currentDocument, setCurrentDocument] = useState<{
    uri: string;
    name: string;
    noteId: string;
    type: "pdf" | "word" | "document" | "image" | "txt";
  } | null>(null);

  // Sharing helpers (for drawing capture)
  const shareCaptureRef = React.useRef<any>(null);
  const [shareTargetNote, setShareTargetNote] = useState<Note | null>(null);
  const [isSharing, setIsSharing] = useState(false);

  // Memoize HTML tag styles for grid view (now the only view)
  const htmlTagStyles = useMemo(
    () => ({
      p: {
        margin: 0,
        padding: 0,
        color: "#1E293B",
        fontSize: 13,
        lineHeight: 18,
        fontFamily: "Inter-Regular",
      },
      body: { margin: 0, padding: 0 },
      li: {
        fontSize: 13,
        lineHeight: 18,
        color: "#1E293B",
        fontFamily: "Inter-Regular",
      },
      h1: {
        fontSize: 15,
        fontWeight: "700",
        color: "#0F172A",
        marginVertical: 2,
        fontFamily: "Inter-Bold",
      },
      h2: {
        fontSize: 14,
        fontWeight: "700",
        color: "#0F172A",
        marginVertical: 2,
        fontFamily: "Inter-Bold",
      },
      h3: {
        fontSize: 13,
        fontWeight: "700",
        color: "#0F172A",
        marginVertical: 2,
        fontFamily: "Inter-Bold",
      },
      a: {
        color: "#6A009C",
        textDecorationLine: "underline",
        fontWeight: "500",
      },
      strong: {
        fontWeight: "700",
        color: "#0F172A",
      },
      em: {
        fontStyle: "italic",
        color: "#334155",
      },
      img: { maxWidth: "100%", height: "auto", marginVertical: 4 },
      blockquote: {
        borderLeftWidth: 3,
        borderLeftColor: "#94A3B8",
        paddingLeft: 12,
        marginLeft: 0,
        opacity: 0.9,
        backgroundColor: "#F8FAFC",
        borderRadius: 4,
        paddingVertical: 4,
      },
      code: {
        fontFamily: "monospace",
        backgroundColor: "#F1F5F9",
        padding: 4,
        borderRadius: 3,
        color: "#334155",
        fontWeight: "500",
      },
      pre: {
        backgroundColor: "#F1F5F9",
        padding: 12,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: "#E2E8F0",
      },
      table: { borderWidth: 1, borderColor: "#CBD5E0", marginVertical: 4 },
      th: {
        backgroundColor: "#F8FAFC",
        padding: 8,
        borderWidth: 1,
        borderColor: "#CBD5E0",
        fontWeight: "bold",
      },
      td: {
        padding: 8,
        borderWidth: 1,
        borderColor: "#E2E8F0",
      },
    }),
    []
  );

  // Create a separate preview tag styles with proper typings for RenderHtml
  const previewHtmlTagStyles = useMemo(
    () => ({
      p: {
        margin: 0,
        padding: 0,
        color: "#1E293B",
        fontSize: 10,
        lineHeight: 14,
        fontFamily: "Inter-Regular",
      },
      body: { margin: 0, padding: 0 },
      h1: {
        fontSize: 12,
        fontWeight: "700" as const,
        color: "#0F172A",
        marginVertical: 2,
        fontFamily: "Inter-Bold",
      },
      h2: {
        fontSize: 11,
        fontWeight: "700" as const,
        color: "#0F172A",
        marginVertical: 1,
        fontFamily: "Inter-Bold",
      },
      h3: {
        fontSize: 10,
        fontWeight: "700" as const,
        color: "#0F172A",
        marginVertical: 1,
        fontFamily: "Inter-Bold",
      },
      li: {
        fontSize: 10,
        lineHeight: 14,
        color: "#1E293B",
        fontFamily: "Inter-Regular",
      },
      strong: {
        fontWeight: "700" as const,
      },
      em: {
        fontStyle: "italic" as const,
      },
      a: {
        color: "#6A009C",
        textDecorationLine: "underline" as const,
      },
    }),
    []
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchNotes(true), fetchFolders()]);
    setRefreshing(false);
  };

  const calculateFolderCounts = useCallback(() => {
    const counts: Record<string, number> = {};

    // Initialize counts for all folders to zero
    folders.forEach((folder) => {
      counts[folder.id] = 0;
    });

    // Count notes for each folder (including both text and drawing notes)
    notes.forEach((note) => {
      if (note.folderId && counts.hasOwnProperty(note.folderId)) {
        counts[note.folderId]++;
      }
    });

    // Also count unorganized notes (notes without folderId)
    const unorganizedCount = notes.filter((note) => !note.folderId).length;
    counts["unorganized"] = unorganizedCount;

    setFolderCounts(counts);
  }, [notes, folders]);

  useEffect(() => {
    calculateFolderCounts();
  }, [notes, folders, calculateFolderCounts]);

  useEffect(() => {
    fetchNotes();
    fetchFolders();

    // Setup network status listener to sync when coming back online
    const removeNetworkListener = offlineNotesService.addNetworkStatusListener((status) => {
      if (status.isOnline) {
        console.log('Device is back online, attempting to sync notes...');
        offlineNotesService.syncWithServer().catch((error) => {
          console.error('Auto-sync failed after coming online:', error);
        });
      }
    });

    const refreshInterval = setInterval(() => {
      if (AppState.currentState === "active") {
        // Check if there are pending changes and try to sync
        offlineNotesService.hasPendingChanges().then((hasPending) => {
          if (hasPending && offlineNotesService.isOnline()) {
            offlineNotesService.syncWithServer().catch(console.error);
          }
        });
      }
    }, 30000);

    return () => {
      clearInterval(refreshInterval);
      removeNetworkListener();
    };
  }, []);

  // Helper: show an error toast that includes an error type label
  const showTypedErrorToast = (message: string, type: string) => {
    // Use existing toast utility but include the type so callers can display structured info
    try {
      // Only show the friendly message to the user — keep the error type out of the UI
      showErrorToast(message);
    } catch (e) {
      console.warn("Failed to show typed error toast", e);
    }
    // Also log for debug/telemetry
    // Log the message and type for developers, but don't surface the type in the UI
    console.warn(`Toast error: ${message}`, { errorType: type });
  };

  // Helper: check if a note title already exists (case-insensitive, trimmed)
  const isDuplicateNoteTitle = (title?: string) => {
    if (!title) return false;
    const normalized = title.trim().toLowerCase();
    return notes.some((n) => (n.title || "").trim().toLowerCase() === normalized);
  };

  useEffect(() => {
    fetchNotes(false);
  }, [selectedFilterFolder]);

  // Handle folder navigation from home screen
  useEffect(() => {
    if (folderId) {
      // Set the filter to show notes from the specific folder
      setSelectedFilterFolder(folderId);
    }
  }, [folderId]);

  useFocusEffect(
    useCallback(() => {
      fetchNotes(true);
      fetchFolders();

      // Invalidate folder cache when returning to notes screen
      // This ensures home screen gets updated counts when notes are modified
      folderCacheUtils.invalidateCache();

      // Try to sync when coming back to the screen if online and has pending changes
      if (offlineNotesService.isOnline()) {
        offlineNotesService.hasPendingChanges().then((hasPending) => {
          if (hasPending) {
            console.log('Syncing pending changes on focus...');
            offlineNotesService.syncWithServer()
              .then(() => {
                // Refresh notes after sync
                fetchNotes(true);
                fetchFolders();
              })
              .catch((error) => {
                console.error('Sync on focus failed:', error);
              });
          }
        });
      }

      return () => {
        // Clean up if needed when screen goes out of focus
      };
    }, [])
  );

  const fetchFolders = async () => {
    // Throttle to 10s if we already have folders
    const now = Date.now();
    if (now - lastFolderFetch < 10000 && folders.length > 0) return;
    setLastFolderFetch(now);

    try {
      const token = await AsyncStorage.getItem("authToken");
      if (!token) {
        navigation.navigate("Login");
        return;
      }

      // Use offlineNotesService to allow online-first with offline fallback and local caching
      const data = await offlineNotesService.getAllFolders();

      const fetchedFolders: Folder[] = (data || []).map((folder: any) => ({
        id: folder.id?.toString?.() ?? String(folder.id),
        name: folder.name,
        color: folder.color || "#667EEA",
        icon: "folder" as keyof typeof MaterialIcons.glyphMap,
        notes_count: folder.notes_count || folder.note_count || 0,
        description: folder.description,
        created_at: folder.created_at,
        updated_at: folder.updated_at,
      }));

      const currentFoldersJson = JSON.stringify(
        folders.map((f) => ({ id: f.id, name: f.name }))
      );
      const fetchedFoldersJson = JSON.stringify(
        fetchedFolders.map((f) => ({ id: f.id, name: f.name }))
      );

      if (currentFoldersJson !== fetchedFoldersJson) {
        setFolders(fetchedFolders);
      }
    } catch (error) {
      console.error("Error fetching folders:", error);
      showErrorToast("Failed to load folders");
    }
  };

  const isDrawingNote = React.useCallback((note: Note): boolean => {
    // Primary check: if type is explicitly set to drawing
    if (note.type === "drawing") {
      return true;
    }

    // Explicitly guard: documents should never be treated as drawings
    if (note.type === "document") {
      return false;
    }

    // Secondary check: if drawing_data exists and has content
    if (!note.drawing_data) {
      return false;
    }

    try {
      let parsedData = note.drawing_data;

      // If it's a string, parse it
      if (typeof note.drawing_data === "string") {
        try {
          parsedData = JSON.parse(note.drawing_data);
        } catch (parseError) {
          console.warn("Failed to parse drawing_data JSON:", parseError);
          return false;
        }
      }

      // Now check the parsed data structure
      if (Array.isArray(parsedData)) {
        // Direct array of strokes (your database format)
        return (
          parsedData.length > 0 &&
          parsedData.every(
            (stroke) =>
              stroke &&
              typeof stroke === "object" &&
              stroke.id &&
              stroke.points &&
              Array.isArray(stroke.points) &&
              stroke.points.length > 0 &&
              typeof stroke.tool === "string"
          )
        );
      }

      // Object with strokes array or other drawing indicators
      if (typeof parsedData === "object" && parsedData !== null) {
        return !!(
          (parsedData.strokes && Array.isArray(parsedData.strokes)) ||
          (parsedData.type && parsedData.type === "drawing") ||
          parsedData.drawing
        );
      }

      return false;
    } catch (error) {
      console.warn("Error in isDrawingNote:", error);
      return false;
    }
  }, []);

  const fetchNotes = React.useCallback(
    async (showLoading = true) => {
      const now = Date.now();
      if (!showLoading && now - lastNoteFetch < 5000) return;

      if (showLoading) setIsLoading(true);
      setError(null);
      setLastNoteFetch(now);

      try {
        const token = await AsyncStorage.getItem("authToken");
        if (!token) {
          navigation.navigate("Login");
          return;
        }

        // Use offline service so notes appear when offline and are cached when online
        let data = await offlineNotesService.getAllNotes();

        // Client-side filter by selected folder if provided
        if (selectedFilterFolder) {
          data = (data || []).filter((n: any) => {
            const fid = n.folderId || n.folder?.toString?.();
            return fid ? fid.toString() === selectedFilterFolder : false;
          });
        }

        // Normalize into local Note type where necessary
        const toDate = (val: any): Date | undefined => {
          if (!val) return undefined;
          if (val instanceof Date) return val;
          if (typeof val === 'string') return parseServerDate(val) || new Date(val);
          if (typeof val === 'number') return new Date(val);
          return undefined;
        };

        const fetchedNotes: Note[] = (data || []).map((n: any) => {
          const createdAt = toDate(n.createdAt) || toDate(n.created_at) || new Date(0);
          const updatedAt = toDate(n.updatedAt) || toDate(n.updated_at) || toDate(n.lastModified) || createdAt;
          const lastAccessedAt = toDate(n.lastAccessedAt) || toDate(n.last_accessed);
          return {
            id: n.id?.toString?.() ?? String(n.id),
            title: n.title || "",
            content: n.content || "",
            formatted_content: n.formatted_content || "",
            folder: n.folder || n.folder_name || null,
            folderId: n.folderId || (n.folder ? n.folder.toString() : null),
            createdAt,
            updatedAt,
            lastAccessedAt,
            type: n.type || "text",
            is_archived: n.is_archived || false,
            tags: n.tags || [],
            template: n.template || null,
            drawing_data: n.drawing_data || null,
            document_file: n.document_file || null,
            document_annotations: n.document_annotations || null,
          };
        });

        // Sort by latest access/update: always prioritize lastAccessedAt, then updatedAt, then createdAt
        fetchedNotes.sort((a, b) => {
          const getNum = (d?: Date) => {
            if (d instanceof Date) {
              const t = d.getTime();
              return isNaN(t) ? 0 : t;
            }
            return 0;
          };
          const aL = getNum(a.lastAccessedAt);
          const bL = getNum(b.lastAccessedAt);
          const aU = getNum(a.updatedAt);
          const bU = getNum(b.updatedAt);
          
          // ALWAYS prioritize by lastAccessedAt if either note has it (not just recent ones)
          if (aL > 0 || bL > 0) {
            // If both have lastAccessedAt, sort by most recent
            if (aL > 0 && bL > 0) {
              return bL - aL;
            }
            // If only one has lastAccessedAt, it goes first
            if (aL > 0) return -1;
            if (bL > 0) return 1;
          }
          
          // If neither has lastAccessedAt, sort by updatedAt (most recent first)
          if (aU !== bU) return bU - aU;
          
          // Final fallback to createdAt
          const aC = getNum(a.createdAt);
          const bC = getNum(b.createdAt);
          return bC - aC;
        });

        const currentNotesJson = JSON.stringify(
          notes.map((n) => ({ 
            id: n.id, 
            updatedAt: n.updatedAt?.getTime?.() || 0,
            lastAccessedAt: n.lastAccessedAt?.getTime?.() || 0 
          }))
        );
        const fetchedNotesJson = JSON.stringify(
          fetchedNotes.map((n) => ({ 
            id: n.id, 
            updatedAt: n.updatedAt?.getTime?.() || 0,
            lastAccessedAt: n.lastAccessedAt?.getTime?.() || 0 
          }))
        );
        const hasChanges = currentNotesJson !== fetchedNotesJson;

        if (hasChanges) {
          setNotes(fetchedNotes);
        }
      } catch (error) {
        console.error("Error fetching notes:", error);
        setError("Failed to load notes. Please try again.");
      } finally {
        if (showLoading) setIsLoading(false);
      }
    },
    [lastNoteFetch, navigation, notes, selectedFilterFolder]
  );

  const handleAddToFolder = useCallback((noteId: string) => {
    setSelectedNotes([noteId]);
    setShowSortNotesModal(true);
    setActiveNoteOptions(null);
    setDropdownPosition(null);
  }, []);

  const handleDuplicateDrawing = useCallback(
    async (note: Note) => {
      if (!isDrawingNote(note)) {
        showErrorToast("Only drawings can be duplicated");
        return;
      }

      try {
        setIsLoading(true);
        setActiveNoteOptions(null);
        setDropdownPosition(null);

        const token = await AsyncStorage.getItem("authToken");
        if (!token) {
          navigation.navigate("Login");
          return;
        }

        // Create duplicate with same drawing data but new title
        const duplicateTitle = `${note.title} - Copy`;
        const duplicateNote = {
          title: duplicateTitle,
          content: note.content,
          formatted_content: note.formatted_content,
          type: note.type,
          template: note.template,
          drawing_data: note.drawing_data, // Copy the drawing data
          folderId: note.folderId, // Keep same folder
        };

        const response = await fetch(`${API_URL}${API_ENDPOINTS.NOTES}`, {
          method: "POST",
          headers: {
            Authorization: `Token ${token}`,
            "Content-Type": "application/json",
            "X-Client-Timezone": Intl.DateTimeFormat().resolvedOptions().timeZone || "",
          },
          body: JSON.stringify(duplicateNote),
        });

        if (!response.ok) {
          throw new Error("Failed to duplicate drawing");
        }

        const newNote = await response.json();

        // Add the new note to the state
        setNotes((prev) => [
          {
            ...newNote,
            createdAt: parseServerDate(newNote.created_at) || new Date(),
            updatedAt: parseServerDate(newNote.updated_at) || new Date(),
          },
          ...prev,
        ]);

        showSuccessToast("Drawing duplicated successfully");
      } catch (error) {
        console.error("Error duplicating drawing:", error);
        showErrorToast("Failed to duplicate drawing");
      } finally {
        setIsLoading(false);
      }
    },
    [navigation, setIsLoading, setNotes]
  );

  const handleRemoveFromFolder = useCallback(
    async (noteId: string) => {
      try {
        setIsLoading(true);
        setActiveNoteOptions(null);
        setDropdownPosition(null);

        const token = await AsyncStorage.getItem("authToken");
        if (!token) {
          navigation.navigate("Login");
          return;
        }

        // alert before performing the deletion
        Alert.alert(
          "Remove from Folder",
          "Are you sure you want to remove this note from its folder?",
          [
            {
              text: "Cancel",
              style: "cancel",
            },
            {
              text: "Remove",
              onPress: async () => {
                try {
                  setIsLoading(true);

                  const response = await fetch(
                    `${API_URL}${API_ENDPOINTS.MANAGE_NOTE_FOLDERS}`,
                    {
                      method: "POST",
                      headers: {
                        Authorization: `Token ${token}`,
                        "Content-Type": "application/json",
                        "X-Client-Timezone": Intl.DateTimeFormat().resolvedOptions().timeZone || "",
                      },
                      body: JSON.stringify({
                        action: "remove",
                        note_ids: [noteId],
                      }),
                    }
                  );

                  if (!response.ok) {
                    throw new Error("Failed to remove note from folder");
                  } else {
                    showSuccessToast("Note removed from folder successfully");
                    // Update local state to reflect changes
                    const updatedNotes = notes.map((note) =>
                      note.id === noteId
                        ? { ...note, folderId: undefined, folder: undefined }
                        : note
                    );

                    setNotes(updatedNotes);
                  }
                } catch (error) {
                  console.error("Error removing note from folder:", error);
                  showErrorToast("Failed to move note to Unorganized Notes");
                  Alert.alert(
                    "Error",
                    "Failed to move note to Unorganized Notes. Please try again."
                  );
                } finally {
                  setIsLoading(false);
                }
              },
            },
          ]
        );

        // If we're filtering by a specific folder, we might need to refresh
        fetchNotes();
      } catch (error) {
        console.error("Error removing note from folder:", error);
        showErrorToast("Failed to move note to Unorganized Notes");
        Alert.alert(
          "Error",
          "Failed to move note to Unorganized Notes. Please try again."
        );
      } finally {
        setIsLoading(false);
      }
    },
    [notes, navigation, setIsLoading, setActiveNoteOptions, fetchNotes]
  );

  // Share handler
  const stripHtml = (html?: string) => {
    if (!html) return '';
    try {
      return html
        .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, '')
        .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(p|div|h1|h2|h3|h4|h5|h6)>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&');
    } catch {}
    return html;
  };

  const shareTextNote = async (note: Note) => {
    const title = note.title || 'Note';
    const raw = note.formatted_content && note.formatted_content.trim()
      ? note.formatted_content
      : (note.content || '');
    const message = `${title}\n\n${stripHtml(raw)}`.trim();
    try {
      await Share.share({ message, title });
    } catch (e) {
      showErrorToast('Failed to share note');
      console.error('Share text note failed:', e);
    }
  };

  const ensureLocalFile = async (uri: string, fileNameFallback = 'document') => {
    // If already local file
    if (uri.startsWith('file://')) return uri;
    try {
      const lower = uri.toLowerCase();
      // For PDFs, prefer existing helper
      if (lower.endsWith('.pdf') && isRemoteURL(uri)) {
        try {
          const local = await getLocalPDFPath(uri);
          return local;
        } catch (e) {
          console.warn('getLocalPDFPath failed, falling back to downloadAsync:', e);
        }
      }
      // Generic download
      const fileName = uri.split('/').pop() || fileNameFallback;
      const dest = `${FileSystem.cacheDirectory}${Date.now()}_${fileName}`;
      const res = await FileSystem.downloadAsync(uri, dest);
      return res.uri;
    } catch (e) {
      console.error('ensureLocalFile failed:', e);
      return uri; // fallback
    }
  };

  const shareDocumentNote = async (note: Note) => {
    try {
      const src = note.document_url || note.document_file;
      if (!src) {
        await Share.share({
          message: `${note.title || 'Document'}\n${note.content || ''}`.trim(),
          title: note.title || 'Document',
        });
        return;
      }
      let localUri = await ensureLocalFile(src, note.title || 'document');

      // If this is a PDF and we have annotations, embed them before sharing
      const isPdf = localUri.toLowerCase().endsWith('.pdf');
      const annotations = Array.isArray((note as any).document_annotations)
        ? (note as any).document_annotations
        : [];

      if (isPdf && annotations.length > 0) {
        try {
          const outputName = `shared_${(note.title || 'annotated').replace(/[^a-z0-9_\-\.]+/gi, '_')}.pdf`;
          const result = await drawingAPI.savePDFAnnotations(localUri, annotations, {
            saveDirectly: false,
            createBackup: false,
            outputFileName: outputName,
          });
          if (result?.savedPath) {
            localUri = result.savedPath;
          }
        } catch (embedErr) {
          console.warn('Failed to embed annotations for sharing, falling back to original PDF:', embedErr);
          // Fall back to sharing original PDF
        }
      }

      if (await Sharing.isAvailableAsync()) {
        const mime = (localUri.toLowerCase().endsWith('.pdf') ? 'application/pdf' : undefined);
        await Sharing.shareAsync(localUri, {
          mimeType: mime,
          dialogTitle: `Share ${note.title || 'Document'}`,
        });
      } else {
        // Fallback to RN Share with URL (may not attach file)
        await Share.share({ url: localUri, title: note.title || 'Document' });
      }
    } catch (e) {
      showErrorToast('Failed to share document');
      console.error('Share document failed:', e);
    }
  };

  const shareDrawingNote = async (note: Note) => {
    try {
      setIsSharing(true);
      setShareTargetNote(note);
      // Wait one frame so ViewShot mounts
      await new Promise((r) => setTimeout(r, 60));
      if (shareCaptureRef.current?.capture) {
        const uri: string = await shareCaptureRef.current.capture();
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(uri, {
            mimeType: 'image/png',
            dialogTitle: `Share ${note.title || 'Drawing'}`,
          });
        } else {
          await Share.share({ url: uri, title: note.title || 'Drawing' });
        }
      } else {
        // Fallback to sharing JSON strokes
        const data = typeof note.drawing_data === 'string' ? note.drawing_data : JSON.stringify(note.drawing_data || []);
        await Share.share({ message: data, title: note.title || 'Drawing' });
      }
    } catch (e) {
      showErrorToast('Failed to share drawing');
      console.error('Share drawing failed:', e);
    } finally {
      setIsSharing(false);
      setShareTargetNote(null);
    }
  };

  const handleShareNote = async (note: Note) => {
    const isDrawing = isDrawingNote(note);
    const isDocument = note.type === 'document' || !!note.document_file || !!note.document_url;
    if (isDocument) return shareDocumentNote(note);
    if (isDrawing) return shareDrawingNote(note);
    return shareTextNote(note);
  };

  const handleDeleteNote = useCallback(
    (noteId: string) => {
      // Close the dropdown menu first
      setActiveNoteOptions(null);

      Alert.alert(
        "Delete Note",
        "Are you sure you want to delete this note? This action cannot be undone.",
        [
          {
            text: "Cancel",
            style: "cancel",
          },
          {
            text: "Delete",
            style: "destructive",
            onPress: async () => {
              try {
                setIsLoading(true); // Show loading indicator
                console.log('🗑️ Deleting note:', noteId);

                // Use offlineNotesService for deletion (handles both online and offline)
                await offlineNotesService.deleteNote(noteId);

                // Update local state
                setNotes((prev) => prev.filter((note) => note.id !== noteId));

                // Invalidate folder cache to update counts in home screen
                await folderCacheUtils.invalidateCache();

                console.log('✅ Note deleted successfully:', noteId);
                // Show success toast
                showSuccessToast("Note deleted successfully");
              } catch (error) {
                console.error("❌ Error deleting note:", error);
                showErrorToast("Failed to delete note");
                Alert.alert(
                  "Error",
                  "Failed to delete note. Please try again."
                );
              } finally {
                setIsLoading(false); // Hide loading indicator
              }
            },
          },
        ]
      );
    },
    [setActiveNoteOptions, setIsLoading, setNotes, navigation]
  );

  // Function to move accessed note to top by updating lastAccessedAt
  const updateNoteAccessTime = useCallback(async (noteId: string) => {
    // Create a consistent timestamp to use everywhere
    const now = new Date();
    
    // Capture note data for offline cache before state update
    const base = notes.find(n => n.id === noteId);
    
    // Update local state FIRST for immediate UX feedback
    setNotes(prevNotes => {
      const updated = prevNotes.map(note => 
        note.id === noteId 
          ? { ...note, lastAccessedAt: now }
          : note
      );
      // Keep list locally sorted by last accessed
      return [...updated].sort((a, b) => {
        const aTime = (a.lastAccessedAt || a.updatedAt || a.createdAt)?.getTime?.() || 0;
        const bTime = (b.lastAccessedAt || b.updatedAt || b.createdAt)?.getTime?.() || 0;
        return bTime - aTime;
      });
    });
    
    // AWAIT the persist to offline storage to ensure it completes before navigation
    try {
      await offlineNotesService.touchNote(noteId, base);
      console.log(`✅ Successfully updated last_accessed for note ${noteId}`);
    } catch (e) {
      console.error('❌ Failed to update touchNote in offline storage:', e);
    }
  }, [notes]);

  const handleNotePress = useCallback(
    async (note: Note) => {
      // Close any open options when navigating
      setActiveNoteOptions(null);
      setDropdownPosition(null);
      
      // Try to get the most up-to-date note from offline storage to ensure we have the correct ID
      try {
        const latestNote = await offlineNotesService.getNoteById(note.id);
        if (latestNote && latestNote.id !== note.id) {
          // ID has changed (e.g., synced from local to server ID), use the new one
          note = {
            ...note,
            id: latestNote.id
          };
        }
      } catch (error) {
        console.warn('Failed to check for updated note ID:', error);
        // Continue with original note ID
      }
      
      // Update access time to move note to top - AWAIT this to ensure storage is updated
      await updateNoteAccessTime(note.id);

      // Check if it's a document type note
      if (note.type === "document") {
        // Open document in appropriate viewer for annotation
        const documentType = note.title?.toLowerCase().includes(".pdf")
          ? "pdf"
          : note.title?.toLowerCase().includes(".doc")
          ? "word"
          : "document";

        // Get document URL from note data - prioritize document_url over document_file
        const documentUrl = note.document_url || note.document_file;

        if (documentUrl) {
          let finalDocumentUri = documentUrl;

          // For PDF files, download to local storage if it's a remote URL
          if (documentType === "pdf" && isRemoteURL(documentUrl)) {
            try {
              finalDocumentUri = await getLocalPDFPath(documentUrl);
            } catch (error) {
              console.error("Failed to download PDF to local storage:", error);
              // Fall back to original URL - PDFAnnotationViewer will handle the error
              finalDocumentUri = documentUrl;
            }
          }

          setCurrentDocument({
            uri: finalDocumentUri,
            name: note.title || "Untitled Document",
            noteId: note.id,
            type: documentType,
          });

          // Use PDFAnnotationViewer for PDF files, DocumentViewer for others
          if (documentType === "pdf") {
            setShowPDFViewer(true);
          } else {
            setShowDocumentViewer(true);
          }
          return;
        } else {
          console.warn(
            "Document note found but no document URL available:",
            note
          );
          // Fall through to regular note editor as fallback
        }
      }

      // Use the enhanced drawing detection
      const isDrawing = isDrawingNote(note);

      if (isDrawing) {
        // Parse drawing data properly - handle the stroke array format
        let parsedDrawingData = null;
        let strokesArray = [];

        try {
          if (typeof note.drawing_data === "string") {
            // Parse the JSON string - this is the actual format from the database
            const parsed = JSON.parse(note.drawing_data);
            if (Array.isArray(parsed)) {
              // Direct array of strokes (this is your actual format)
              strokesArray = parsed;
              parsedDrawingData = {
                strokes: parsed,
                template: note.template || "blank",
                type: "drawing",
              };
            } else {
              parsedDrawingData = parsed;
              strokesArray = parsed.strokes || [];
            }
          } else if (Array.isArray(note.drawing_data)) {
            // Direct array of strokes
            strokesArray = note.drawing_data;
            parsedDrawingData = {
              strokes: note.drawing_data,
              template: note.template || "blank",
              type: "drawing",
            };
          } else if (
            note.drawing_data &&
            typeof note.drawing_data === "object"
          ) {
            // Object with strokes array
            parsedDrawingData = note.drawing_data;
            strokesArray = parsedDrawingData.strokes || [];
          }
        } catch (error) {
          console.error("Failed to parse drawing data:", error);
          console.error("Raw drawing_data:", note.drawing_data);
          // Fallback to empty drawing data
          parsedDrawingData = {
            strokes: [],
            template: "blank",
            type: "drawing",
          };
          strokesArray = [];
        }

        // If we couldn't derive strokes from the note payload, try fetching cached/server drawing
        if (!strokesArray || strokesArray.length === 0) {
          try {
            const dd = await offlineNotesService.getDrawing(note.id);
            if (dd?.strokes?.length) {
              strokesArray = dd.strokes;
            }
          } catch {}
        }

        // Prepare drawing data for editor - ensure proper format for importDrawing
        // IMPORTANT: Do not let parsedDrawingData.strokes overwrite our computed strokesArray
        const { strokes: _ignoredStrokes, ...restParsed } = (parsedDrawingData && typeof parsedDrawingData === 'object')
          ? (parsedDrawingData as any)
          : ({} as any);

        const drawingData = {
          id: note.id,
          title: note.title || "Untitled Drawing",
          // Spread other parsed fields first (without strokes)
          ...restParsed,
          // Then set the correct strokes explicitly so they win
          strokes: strokesArray,
          template: parsedDrawingData?.template || note.template || "blank",
          drawing_data: parsedDrawingData,
          createdAt: note.createdAt?.toISOString(),
          updatedAt: note.updatedAt?.toISOString(),
        };

        navigation.navigate("DrawingEditor", {
          noteId: note.id,
          initialDrawingData: {
            ...drawingData,
            folderId: note.folderId,
            folder_id: note.folderId, // Also provide snake_case version
            folderName: note.folder, // Include folder name
            folder: note.folder, // Include folder field as well
          },
          readOnly: false,
        });
      } else {
        // Convert tag objects to strings for the editor if needed
        const processedTags = note.tags?.map((tag) =>
          typeof tag === "object" && tag !== null && "name" in tag
            ? tag.name
            : tag
        );

        // Prepare note data for editor
        const noteForEditor = {
          title: note.title,
          content: note.content,
          formatted_content: note.formatted_content || note.content,
          tags: processedTags || [],
          folderId: note.folderId,
          createdAt: note.createdAt?.toISOString(),
          updatedAt: note.updatedAt?.toISOString(),
        };

        navigation.navigate("NoteEditor", {
          noteId: note.id,
          initialNote: noteForEditor,
        });
      }
    },
    [
      setActiveNoteOptions,
      isDrawingNote,
      navigation,
      getLocalPDFPath,
      isRemoteURL,
    ]
  );

  const handleCreateNote = useCallback(() => {
    const initialNoteData = {
      title: "",
      content: "",
      folderId: null,
    };

    // Navigate directly to the editor
    navigation.navigate("NoteEditor", {
      initialNote: initialNoteData,
    });
  }, [navigation]);

  // Show drawing setup modal
  const handleCreateDrawing = () => {
    setShowDrawingSetupModal(true);
  };

  // Show document import preview modal
  const handleImportDocument = () => {
    console.log('📂 Opening document import modal...');
    console.log('🌐 Network status - isOnline:', offlineNotesService.isOnline());
    console.log('🌐 Network details:', offlineNotesService.getNetworkStatus());
    setShowDocumentPreviewModal(true);
  };

  // Confirm and upload the selected document as a note
  const handleConfirmDocumentImport = async (documentInfo: any) => {
    try {
      setIsUploadingDocument(true);
      
      // Check for duplicate title before proceeding
      if (isDuplicateNoteTitle(documentInfo.name)) {
        showTypedErrorToast("A note with this title already exists.", "duplicate_name");
        setIsUploadingDocument(false);
        return;
      }

      const documentType =
        documentInfo.mimeType?.includes("pdf")
          ? "pdf"
          : documentInfo.mimeType?.includes("word") ||
            documentInfo.mimeType?.includes("document")
          ? "word"
          : documentInfo.mimeType?.includes("image") ||
            documentInfo.name?.match(/\.(jpg|jpeg|png|gif|bmp|webp|svg)$/i)
          ? "image"
          : documentInfo.name?.match(/\.txt$/i)
          ? "txt"
          : "document";

      // Try online upload first, but fallback to offline if network fails
      let uploadedOnline = false;
      
      console.log('🌐 Checking network status before import...');
      console.log('📊 isOnline():', offlineNotesService.isOnline());
      console.log('📊 Network details:', offlineNotesService.getNetworkStatus());
      
      if (offlineNotesService.isOnline()) {
        console.log('✅ Network detected as online, attempting server upload...');
        try {
          // Online: Upload document to server using FormData
          const token = await AsyncStorage.getItem("authToken");
          if (!token) {
            navigation.navigate("Login");
            setIsUploadingDocument(false);
            return;
          }

          const formData = new FormData();
          formData.append("title", documentInfo.name);
          formData.append("content", `Imported document: ${documentInfo.name}`);
          formData.append("type", "document");

          formData.append("document", {
            uri: documentInfo.uri,
            type: documentInfo.mimeType || "application/octet-stream",
            name: documentInfo.name,
          } as any);

          const response = await fetch(
            `${API_URL}${API_ENDPOINTS.DOCUMENT_UPLOAD}`,
            {
              method: "POST",
              headers: {
                Authorization: `Token ${token}`,
                "X-Client-Timezone": Intl.DateTimeFormat().resolvedOptions().timeZone || "",
              },
              body: formData,
            }
          );

          if (response.ok) {
            const result = await response.json();

            // Check for duplicate title returned from server
            const returnedTitle = result?.title?.trim();
            if (returnedTitle && isDuplicateNoteTitle(returnedTitle)) {
              showTypedErrorToast("A note with this title already exists.", "duplicate_name");
              fetchNotes(true);
              setIsUploadingDocument(false);
              return;
            }

            showSuccessToast("Document imported successfully!");
            fetchNotes(true);
            await folderCacheUtils.invalidateCache();

            const documentUrl = result.document_url || result.document_file || documentInfo.uri;
            let finalDocumentUri = documentUrl;

            if (documentType === "pdf" && isRemoteURL(documentUrl)) {
              try {
                finalDocumentUri = await getLocalPDFPath(documentUrl);
              } catch (error) {
                console.warn("Failed to download PDF, using remote URL", error);
                finalDocumentUri = documentUrl;
              }
            }

            setCurrentDocument({
              uri: finalDocumentUri,
              name: result.title || documentInfo.name,
              noteId: result.id,
              type: documentType,
            });

            if (documentType === "pdf") {
              setShowPDFViewer(true);
            } else {
              setShowDocumentViewer(true);
            }
            
            uploadedOnline = true;
          } else {
            const errorData = await response.json();
            throw new Error(errorData.error || "Failed to import document");
          }
        } catch (onlineError) {
          console.warn('❌ Online upload failed, falling back to offline mode:', onlineError);
          // Don't return - fall through to offline mode
        }
      }
      
      // Offline mode (or online upload failed)
      if (!uploadedOnline) {
        // Offline: Create a document note with local file reference
        console.log('📱 OFFLINE PDF IMPORT - Starting offline import process...');
        console.log('📄 Document info:', { name: documentInfo.name, uri: documentInfo.uri, mimeType: documentInfo.mimeType });
        
        // Ensure the file is copied to a permanent app directory
        let localUri = documentInfo.uri;
        try {
          const docDir = `${FileSystem.documentDirectory}pdf_documents/`;
          console.log('📁 Creating/checking directory:', docDir);
          
          const dirInfo = await FileSystem.getInfoAsync(docDir);
          if (!dirInfo.exists) {
            await FileSystem.makeDirectoryAsync(docDir, { intermediates: true });
            console.log('✅ Directory created');
          } else {
            console.log('✅ Directory already exists');
          }
          
          const safeName = `${Date.now()}_${documentInfo.name || 'document.pdf'}`;
          const destUri = `${docDir}${safeName}`;
          console.log('🔄 Copying file from', localUri, 'to', destUri);
          
          // Copy only if source exists and destination not same
          const srcInfo = await FileSystem.getInfoAsync(localUri);
          console.log('📊 Source file info:', srcInfo);
          
          if (srcInfo.exists && destUri !== localUri) {
            await FileSystem.copyAsync({ from: localUri, to: destUri });
            const copiedInfo = await FileSystem.getInfoAsync(destUri);
            console.log('📊 Copied file info:', copiedInfo);
            
            if (copiedInfo.exists) {
              localUri = destUri;
              console.log('✅ File copied successfully to permanent location');
            } else {
              console.error('❌ Copy completed but file not found at destination');
            }
          } else {
            console.log('ℹ️ Using original URI (source not found or same as dest)');
          }
        } catch (copyErr) {
          console.error('❌ Failed to persist PDF to app storage:', copyErr);
          console.warn('⚠️ Using original URI:', localUri);
        }

        console.log('💾 Creating offline note with document data...');
        const noteData = {
          title: documentInfo.name,
          content: `Imported document: ${documentInfo.name}`,
          type: "document" as const,
          document_file: localUri, // Store local file URI
          document_url: localUri, // Store local file URI
        };
        console.log('📝 Note data to create:', noteData);

        // Create note using offline service
        const result = await offlineNotesService.createNote(noteData);
        console.log('✅ Offline note created:', result);

        showSuccessToast("Document saved offline. Will upload when you're back online.");
        
        // Refresh notes list to show the new document
        await fetchNotes(true);
        await folderCacheUtils.invalidateCache();

        console.log('🎬 Opening document viewer with:', {
          uri: localUri,
          name: documentInfo.name,
          noteId: result.id,
          type: documentType
        });

        // Set current document to view it
        setCurrentDocument({
          uri: localUri,
          name: documentInfo.name,
          noteId: result.id,
          type: documentType,
        });

        if (documentType === "pdf") {
          console.log('📄 Opening PDF viewer...');
          setShowPDFViewer(true);
        } else {
          console.log('📄 Opening document viewer...');
          setShowDocumentViewer(true);
        }
        
        console.log('✅ OFFLINE PDF IMPORT - Process completed successfully');
      }
    } catch (error) {
      console.error("Error importing document:", error);
      showErrorToast(
        typeof error === "object" && error !== null && "message" in error
          ? (error as { message?: string }).message ||
              "Failed to import document. Please try again."
          : "Failed to import document. Please try again."
      );
    } finally {
      setIsUploadingDocument(false);
    }
  };


  const closeDrawingSetupModal = () => {
    setShowDrawingSetupModal(false);
    setDrawingTitle("");
    setSelectedSize("medium");
    setSelectedOrientation("landscape");
    setSelectedTemplate("blank");
  };

  const handleCreateDrawingWithSetup = () => {
    // Get selected size dimensions
    const sizeConfig = DRAWING_SIZES.find((size) => size.id === selectedSize);
    const dimensions =
      selectedOrientation === "landscape"
        ? sizeConfig?.landscape
        : sizeConfig?.portrait;

    const finalTitle = drawingTitle && drawingTitle.trim() !== "" ? drawingTitle.trim() : "Untitled Drawing";

    // Duplicate title check
    if (isDuplicateNoteTitle(finalTitle)) {
      showTypedErrorToast("A note with this title already exists.", "duplicate_name");
      return;
    }

    // Navigate to drawing editor with setup preferences
    navigation.navigate("DrawingEditor", {
      initialSetup: {
        title: finalTitle,
        size: selectedSize,
        orientation: selectedOrientation,
        template: selectedTemplate,
        dimensions: dimensions || "800×600",
      },
    });

    // Close the modal and reset state
    closeDrawingSetupModal();
  };

  const assignNotesToFolder = async (folderID: string, noteIDs: string[]) => {
    try {
      setIsLoading(true);
      const token = await AsyncStorage.getItem("authToken");
      if (!token) {
        navigation.navigate("Login");
        return;
      }

      const payload = {
        folder_id: folderID,
        note_ids: noteIDs,
      };

      const response = await fetch(
        `${API_URL}${API_ENDPOINTS.MANAGE_NOTE_FOLDERS}`,
        {
          method: "POST",
          headers: {
            Authorization: `Token ${token}`,
            "Content-Type": "application/json",
            "X-Client-Timezone": Intl.DateTimeFormat().resolvedOptions().timeZone || "",
          },
          body: JSON.stringify({
            action: "assign",
            folder_id: folderID,
            note_ids: noteIDs,
          }),
        }
      );
      if (!response.ok) {
        throw new Error("Failed to assign notes to folder");
      }

      // Update local state to reflect changes
      const updatedNotes = notes.map((note) =>
        noteIDs.includes(note.id) ? { ...note, folderId: folderID } : note
      );

      setNotes(updatedNotes);
      setSelectedNotes([]);
      setIsSelectMode(false);

      // Invalidate folder cache to update counts in home screen
      await folderCacheUtils.invalidateCache();

      showSuccessToast("Notes assigned to folder successfully");
    } catch (error) {
      console.error("Error assigning notes to folder:", error);
      showErrorToast("Failed to assign notes to folder");
      Alert.alert(
        "Error",
        "Failed to assign notes to folder. Please try again."
      );
    } finally {
      setIsLoading(false); // Make sure to set loading to false even when there's an error
    }
  };

  // Function to handle bulk deletion of notes
  const handleBulkDeleteNotes = async () => {
    if (selectedNotes.length === 0) {
      showWarningToast("No notes selected");
      return;
    }

    // Confirm before deleting
    Alert.alert(
      "Delete Notes",
      `Are you sure you want to delete ${selectedNotes.length} ${
        selectedNotes.length === 1 ? "note" : "notes"
      }? This action cannot be undone.`,
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              setIsLoading(true);
              console.log('🗑️ Bulk deleting notes:', selectedNotes);

              // Use offlineNotesService for each deletion (handles both online and offline)
              const deletePromises = selectedNotes.map((noteId) =>
                offlineNotesService.deleteNote(noteId)
              );

              // Wait for all delete operations to complete
              await Promise.all(deletePromises);

              // Update local state by removing deleted notes
              setNotes((prevNotes) =>
                prevNotes.filter((note) => !selectedNotes.includes(note.id))
              );

              // Invalidate folder cache to update counts in home screen
              await folderCacheUtils.invalidateCache();

              // Exit select mode and clear selection
              setSelectedNotes([]);
              setIsSelectMode(false);

              console.log('✅ Bulk delete successful');
              // Show success message
              showSuccessToast(
                `${selectedNotes.length} ${
                  selectedNotes.length === 1 ? "note" : "notes"
                } deleted successfully`
              );
            } catch (error) {
              console.error("❌ Error deleting notes:", error);
              showErrorToast("Failed to delete some notes");
              Alert.alert(
                "Error",
                "Failed to delete some notes. Please try again."
              );
            } finally {
              setIsLoading(false);
            }
          },
        },
      ]
    );
  };
  // Function to toggle note selection in select mode
  const toggleNoteSelection = useCallback((noteId: string) => {
    setSelectedNotes((prev) => {
      if (prev.includes(noteId)) {
        return prev.filter((id) => id !== noteId);
      } else {
        return [...prev, noteId];
      }
    });
  }, []);

  // Add this helper function
const updateFolderName = async (folderId: string, newName: string) => {
  // Check for duplicate folder name (excluding the current folder)
  const normalizedNewName = newName.trim().toLowerCase();
  const isDuplicate = folders.some(
    (folder) => 
      folder.id !== folderId && 
      folder.name.trim().toLowerCase() === normalizedNewName
  );

  if (isDuplicate) {
    showErrorToast("A folder with this name already exists");
    return;
  }

  try {
    // Use offline service to update folder (works both online and offline)
    await offlineNotesService.updateFolder(folderId, { name: newName });

    // Update folder in state
    setFolders(
      folders.map((folder) =>
        folder.id === folderId ? { ...folder, name: newName } : folder
      )
    );

    showSuccessToast("Folder name updated successfully");
  } catch (error) {
    console.error("Error updating folder name:", error);
    showErrorToast("Failed to update folder name");
    Alert.alert("Error", "Failed to update folder name. Please try again.");
  }
};
const handleCreateFolder = async () => {
  if (newFolderName.trim() === "") {
    Alert.alert("Error", "Please enter a folder name");
    return;
  }

  // Check for duplicate folder name (case-insensitive, trimmed)
  const normalizedNewName = newFolderName.trim().toLowerCase();
  const isDuplicate = folders.some(
    (folder) => folder.name.trim().toLowerCase() === normalizedNewName
  );

  if (isDuplicate) {
    showErrorToast("A folder with this name already exists");
    return;
  }

  try {
    const folderData = {
      name: newFolderName.trim(),
      color: selectedFolderColor,
    };

    // Use offline service to create folder (works both online and offline)
    const newFolder = await offlineNotesService.createFolder(folderData);

    // Transform to match your Folder interface
    const createdFolder: Folder = {
      id: newFolder.id.toString(),
      name: newFolder.name,
      icon: "folder" as keyof typeof MaterialIcons.glyphMap,
      color: newFolder.color,
    };

    setFolders((prev) => [...prev, createdFolder]);

    // Save the new folder's ID to use for sorting notes
    setSelectedFolder(createdFolder.id);

    // Close the create folder modal and reset state
    closeCreateFolderModal();

    // Show appropriate success message based on network status
    if (offlineNotesService.isOnline()) {
      showSuccessToast(`Folder "${newFolderName}" created successfully`);
    } else {
      showSuccessToast(`Folder "${newFolderName}" created offline. Will sync when you're back online.`);
    }

    // Invalidate cache
    await folderCacheUtils.invalidateCache();
  } catch (error) {
    console.error("Error creating folder:", error);
    showErrorToast("Failed to create folder");
    Alert.alert("Error", "Failed to create folder. Please try again.");
  }
};

  // Add new folder delete function
  const handleDeleteFolder = async (folderId: string) => {
    try {
      // First, check if folder has notes
      const notesInFolder = notes.filter((note) => note.folderId === folderId);
      if (notesInFolder.length > 0) {
        Alert.alert(
          "Folder Not Empty",
          `This folder contains ${notesInFolder.length} note(s). Move or delete all notes before deleting the folder.`,
          [{ text: "OK", style: "default" }]
        );
        return;
      }

      // Use offline service to delete folder (works both online and offline)
      await offlineNotesService.deleteFolder(folderId);

      // Remove folder from state
      setFolders(folders.filter((folder) => folder.id !== folderId));

      // Reset selected filter if deleted folder was selected
      if (selectedFilterFolder === folderId) {
        setSelectedFilterFolder(null);
      }

      showSuccessToast("Folder deleted successfully");
      setShowDeleteConfirmModal(false);
      setFolderToDelete(null);
    } catch (error) {
      console.error("Error deleting folder:", error);
      showErrorToast("Failed to delete folder");
      Alert.alert("Error", "Failed to delete folder. Please try again.");
    }
  };

  const renderFolderCard = (folder: Folder) => (
    <TouchableOpacity
      key={folder.id}
      style={[
        styles.folderCard,
        selectedFilterFolder === folder.id && styles.selectedFolderCard,
      ]}
      onPress={() => setSelectedFilterFolder(folder.id)}
      onLongPress={() => handleFolderLongPress(folder.id)}
    >
      <View style={styles.folderCardHeader}>
        <View
          style={[
            styles.folderIcon,
            {
              backgroundColor: Array.isArray(folder.color)
                ? folder.color[0]
                : folder.color,
            },
          ]}
        >
          <MaterialIcons
            name={folder.icon}
            size={20}
            color={selectedFilterFolder === folder.id ? "#FFFFFF" : "#FFFFFF"}
          />
        </View>
        <TouchableOpacity
          style={styles.folderOptionsButton}
          onPress={() => handleFolderLongPress(folder.id)}
        >
          <MaterialIcons name="more-vert" size={16} color="#9CA3AF" />
        </TouchableOpacity>
      </View>

      <Text
        style={[
          styles.folderName,
          selectedFilterFolder === folder.id && styles.activeFolderName,
        ]}
      >
        {folder.name}
      </Text>

      <View style={styles.folderStatsRow}>
        <Text
          style={[
            styles.folderCount,
            selectedFilterFolder === folder.id && styles.activeFolderName,
          ]}
        >
          {folderCounts[folder.id] || 0} notes
        </Text>
      </View>
    </TouchableOpacity>
  );

  // For unorganized folder:
  const renderUnorganizedFolder = () => (
    <TouchableOpacity
      style={[
        styles.unorganizedFolderCard,
        selectedFilterFolder === "unorganized" &&
          styles.selectedUnorganizedFolderCard,
      ]}
      onPress={() => setSelectedFilterFolder("unorganized")}
    >
      <View
        style={[
          styles.unorganizedFolderIcon,
          selectedFilterFolder === "unorganized" && {
            backgroundColor: "#FFFFFF",
          },
        ]}
      >
        <MaterialIcons
          name="folder-open"
          size={18}
          color={selectedFilterFolder === "unorganized" ? "#6A009C" : "#9CA3AF"}
        />
      </View>
      <Text
        style={[
          styles.unorganizedFolderName,
          selectedFilterFolder === "unorganized" &&
            styles.activeUnorganizedFolderName,
        ]}
      >
        Unorganized Notes
      </Text>
      <Text
        style={[
          styles.unorganizedFolderCount,
          selectedFilterFolder === "unorganized" &&
            styles.activeUnorganizedFolderName,
        ]}
      >
        {folderCounts["unorganized"] || 0}
      </Text>
    </TouchableOpacity>
  );
  // Add function to handle folder long press
  const handleFolderLongPress = (folderId: string) => {
    setSelectedFolderForOptions(folderId);
    setShowFolderOptionsModal(true);
  };

  // Add function to open edit modal for specific folder
  const openEditFolderModal = (folderId: string) => {
    const folder = folders.find((f) => f.id === folderId);
    if (folder) {
      setEditingFolderId(folderId);
      setEditingFolderName(folder.name);
      setShowEditFolderModal(true);
      setShowFolderOptionsModal(false);
    }
  };

  // Add function to confirm folder deletion
  const confirmDeleteFolder = (folderId: string) => {
    setFolderToDelete(folderId);
    setShowDeleteConfirmModal(true);
    setShowFolderOptionsModal(false);
  };

  const toggleSearch = () => {
    setShowSearchBar(!showSearchBar);
    if (showSearchBar) {
      setSearchQuery(""); // Clear search when closing
    }
  };

  const closeCreateFolderModal = () => {
    setShowCreateFolderModal(false);
    setNewFolderName("");
    setSelectedFolderColor("#667EEA");
  };

  // Memoize filtered notes to prevent recalculation on every render
  const filteredNotes = useMemo(
    () => {
      const filtered = notes.filter((note) => {
        // Filter by search query
        const matchesSearch =
          searchQuery === "" ||
          note.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (searchQuery.length > 2 &&
            note.content.toLowerCase().includes(searchQuery.toLowerCase())) || // Only search content if query is 3+ characters
          (note.tags &&
            note.tags.some((tag) => {
              if (typeof tag === "string") {
                return tag.toLowerCase().includes(searchQuery.toLowerCase());
              } else if (tag && typeof tag === "object" && "name" in tag) {
                return tag.name
                  .toLowerCase()
                  .includes(searchQuery.toLowerCase());
              }
              return false;
            }));

        // Filter by selected filter (note type)
        const matchesFilter =
          selectedFilter === "all" || note.type === selectedFilter;

        // Don't filter by folder here - we'll handle that in the FlatList renderItem
        // because we want to keep all notes in the state for folder counting

        // Exclude archived notes from regular view
        const notArchived = !note.is_archived;

        return matchesSearch && matchesFilter && notArchived;
      });
      
      // Sort by lastAccessedAt (most recent first), then by updatedAt
      return filtered.sort((a, b) => {
        // If both have lastAccessedAt, sort by most recent access
        if (a.lastAccessedAt && b.lastAccessedAt) {
          return b.lastAccessedAt.getTime() - a.lastAccessedAt.getTime();
        }
        // If only one has lastAccessedAt, prioritize it
        if (a.lastAccessedAt && !b.lastAccessedAt) {
          return -1;
        }
        if (!a.lastAccessedAt && b.lastAccessedAt) {
          return 1;
        }
        // If neither has lastAccessedAt, sort by updatedAt (most recent first)
        return b.updatedAt.getTime() - a.updatedAt.getTime();
      });
    },
    [notes, searchQuery, selectedFilter]
  ); // Only recalculate when these dependencies change

  // Pre-memoized data for notes view to avoid conditional hook rendering
  const notesViewData = useMemo(() => {
    // First apply existing folder filter logic
    let folderFilteredNotes = filteredNotes;

    if (selectedFilterFolder === "unorganized") {
      folderFilteredNotes = filteredNotes.filter((note) => !note.folderId);
    } else if (selectedFilterFolder) {
      folderFilteredNotes = filteredNotes.filter(
        (note) => note.folderId === selectedFilterFolder
      );
    }

    // Then apply route-based folder filtering (from home screen navigation)
    if (folderId) {
      folderFilteredNotes = folderFilteredNotes.filter(
        (note) => note.folderId === folderId
      );
    }

    // Deduplicate notes by ID to prevent React key warnings
    const uniqueNotes = new Map<string, Note>();
    folderFilteredNotes.forEach(note => {
      if (note.id && !uniqueNotes.has(note.id)) {
        uniqueNotes.set(note.id, note);
      }
    });

    return Array.from(uniqueNotes.values());
  }, [filteredNotes, selectedFilterFolder, folderId]);

  // No separator component needed for grid view

  // Pre-memoized empty list component to avoid conditional hook rendering
  const NotesEmptyListComponent = useMemo(
    () => (
      <View style={styles.emptyState}>
        <View style={styles.emptyStateIconContainer}>
          <MaterialIcons name="grid-view" size={36} color="#CBD5E0" />
          <MaterialIcons name="note-add" size={64} color="#CBD5E0" />
        </View>
        <Text style={styles.emptyStateTitle}>
          {selectedFilterFolder === "unorganized"
            ? "No unorganized notes"
            : selectedFilterFolder
            ? "No notes in this folder"
            : "No notes found"}
        </Text>
        <Text style={styles.emptyStateSubtitle}>
          {searchQuery
            ? "Try adjusting your search terms"
            : isLoading
            ? "Loading your notes..."
            : selectedFilterFolder === "unorganized"
            ? "All your notes are organized in folders"
            : "Create a note or drawing to get started"}
        </Text>

        <View style={styles.emptyStateButtons}>
          <TouchableOpacity
            style={[styles.createButton, styles.emptyStateNoteButton]}
            onPress={() => handleCreateNote()}
          >
            <MaterialIcons name="note-add" size={20} color="#FFFFFF" />
            <Text style={styles.createButtonText}>Create Note</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.createButton, styles.emptyStateDrawingButton]}
            onPress={() => setShowDrawingSetupModal(true)}
          >
            <MaterialIcons name="brush" size={20} color="#FFFFFF" />
            <Text style={styles.createButtonText}>Create Drawing</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.createButton, styles.emptyStateImportButton]}
            onPress={() => handleImportDocument()}
          >
            <MaterialIcons name="upload-file" size={20} color="#FFFFFF" />
            <Text style={styles.createButtonText}>Import Document</Text>
          </TouchableOpacity>
        </View>

        {selectedFilterFolder === "unorganized" && (
          <Text style={styles.emptyStateHint}>
            Notes that are not assigned to any folder will appear here
          </Text>
        )}
      </View>
    ),
    [
      searchQuery,
      isLoading,
      selectedFilterFolder,
      handleCreateNote,
      setShowDrawingSetupModal,
      handleImportDocument,
    ]
  );

  const renderNoteItem = useCallback(
    ({ item }: { item: Note }) => {
      // Use the enhanced drawing detection
      const isDrawing = isDrawingNote(item);

      // Document detection
      const isDocument =
        item.type === "document" ||
        (item.document_file && item.document_file.trim() !== "");

      // Enhanced stroke count calculation
      const getStrokeCount = () => {
        if (!item.drawing_data) return 0;

        try {
          let parsedData = item.drawing_data;

          // Parse if it's a string
          if (typeof item.drawing_data === "string") {
            parsedData = JSON.parse(item.drawing_data);
          }

          // Count based on data structure
          if (Array.isArray(parsedData)) {
            // Direct array of strokes
            return parsedData.filter(
              (stroke) =>
                stroke &&
                stroke.points &&
                Array.isArray(stroke.points) &&
                stroke.points.length > 0
            ).length;
          }

          if (parsedData && typeof parsedData === "object") {
            if (parsedData.strokes && Array.isArray(parsedData.strokes)) {
              return parsedData.strokes.length;
            }
            if (parsedData.drawing && Array.isArray(parsedData.drawing)) {
              return parsedData.drawing.length;
            }
          }

          return 0;
        } catch (error) {
          console.warn("Error calculating stroke count:", error);
          return 0;
        }
      };

      // Enhanced preview content with better visual differentiation
      const getPreviewContent = () => {
        if (isDrawing) {
          const strokeCount = getStrokeCount();

          return (
            <View style={styles.previewImageContainer}>
              <View style={styles.drawingPreview}>
                {/* Enhanced drawing preview with actual drawing */}
                <View style={styles.drawingPreviewHeader}>
                  <MaterialIcons
                    name="brush"
                    size={28}
                    color="#8B5CF6"
                    style={styles.drawingIcon}
                  />
                  <View style={styles.drawingBadge}>
                    <Text style={styles.drawingBadgeText}>Drawing</Text>
                  </View>
                </View>

                {strokeCount > 0 ? (
                  <TemplatePreview
                    note={item}
                    width={windowWidth / 2 - 64}
                    height={120}
                  />
                ) : (
                  <View style={styles.emptyDrawingContainer}>
                    <Text style={styles.emptyDrawingText}>Empty Drawing</Text>
                  </View>
                )}

                {/* Show stroke count */}
                <Text style={styles.drawingDataStatus}>
                  {strokeCount > 0 ? `${strokeCount} strokes` : "No strokes"}
                </Text>
              </View>
            </View>
          );
        } else if (isDocument) {
          // Document preview with enhanced PDF first-page + overlays (if PDF)
          const isPdf = (item.title?.toLowerCase().includes('.pdf') || item.document_file?.toLowerCase().includes('.pdf')) ?? false;
          const docUrl = item.document_url || item.document_file || '';
          return (
            <View style={styles.previewImageContainer}>
              {isPdf ? (
                <DocumentPreview
                  documentUrl={docUrl}
                  annotations={Array.isArray(item.document_annotations) ? item.document_annotations as any : []}
                  width={windowWidth / 2 - 64}
                  height={120}
                />
              ) : (
                <TemplatePreview
                  note={item}
                  width={windowWidth / 2 - 64}
                  height={120}
                />
              )}

              <TouchableOpacity
                style={styles.viewDocumentButton}
                onPress={async () => {
                  const documentType = item.title?.toLowerCase().includes('.pdf')
                    ? 'PDF'
                    : (item.title?.toLowerCase().includes('.doc') || item.document_file?.toLowerCase().includes('.doc'))
                      ? 'Word'
                      : 'Document';

                  const docType = documentType === 'PDF' ? 'pdf' : (documentType === 'Word' ? 'word' : 'document');

                  const documentUrl = docUrl;
                  let finalDocumentUri = documentUrl;

                  // For PDF files, download to local storage if it's a remote URL
                  if (docType === 'pdf' && isRemoteURL(documentUrl)) {
                    try {
                      finalDocumentUri = await getLocalPDFPath(documentUrl);
                    } catch (error) {
                      console.error('Failed to download PDF to local storage:', error);
                      // Fall back to original URL - PDFAnnotationViewer will handle the error
                      finalDocumentUri = documentUrl;
                    }
                  }

                  setCurrentDocument({
                    uri: finalDocumentUri,
                    name: item.title || 'Untitled Document',
                    noteId: item.id,
                    type: docType,
                  });

                  // Use PDFAnnotationViewer for PDF files, DocumentViewer for others
                  if (docType === 'pdf') {
                    setShowPDFViewer(true);
                  } else {
                    setShowDocumentViewer(true);
                  }
                }}
              >
                <MaterialIcons name="visibility" size={16} color="#FFFFFF" />
                <Text style={styles.viewDocumentButtonText}>View Document</Text>
              </TouchableOpacity>
            </View>
          );
        } else {
          // Enhanced text note preview
          return (
            <TemplatePreview
              note={item}
              width={windowWidth / 2 - 64}
              height={120}
            />
          );
        }
      };

      return (
        <TouchableOpacity
          style={[
            styles.gridNoteItem,
            // Unified note appearance - removed drawing differentiation
            isSelectMode &&
              selectedNotes.includes(item.id) &&
              styles.selectedNoteItem,
          ]}
          activeOpacity={0.8}
          onPress={() => {
            if (isSelectMode) {
              toggleNoteSelection(item.id);
            } else {
              handleNotePress(item);
            }
          }}
          onLongPress={() => {
            if (!isSelectMode) {
              setIsSelectMode(true);
              toggleNoteSelection(item.id);
            }
          }}
        >
          <View
            style={[
              styles.gridNoteContent,
              // Unified content styling for all note types
            ]}
          >
            {/* Preview Image Container */}
            {getPreviewContent()}

            {/* Enhanced Note Header with better type indication */}
            <View style={styles.noteHeader}>
              <View style={styles.noteTitleContainer}>
                <View
                  style={[
                    styles.gridNoteTypeIcon,
                    {
                      backgroundColor: isDrawing ? "#EDE9FE" : "#DBEAFE",
                    },
                  ]}
                >
                  <Ionicons
                    name={isDrawing ? "brush" : "document-text"}
                    size={16}
                    color={isDrawing ? "#8B5CF6" : "#3B82F6"}
                  />
                </View>
                <View style={styles.noteTitleSection}>
                  <Text
                    style={[
                      styles.gridNoteTitle,
                      // Unified title styling for all note types
                    ]}
                    numberOfLines={1}
                    ellipsizeMode="tail"
                  >
                    {item.title ||
                      (isDrawing ? "Untitled Drawing" : "Untitled Note")}
                  </Text>
                  {/* Add type indicator text */}
                  <Text
                    style={[
                      styles.noteTypeIndicator,
                      isDrawing && styles.drawingTypeIndicator,
                    ]}
                  >
                    {isDrawing 
                      ? "Drawing" 
                      : isDocument 
                        ? (item.title?.toLowerCase().includes('.pdf') || item.document_file?.toLowerCase().includes('.pdf') ? "PDF" : "Document")
                        : "Text Note"}
                  </Text>
                </View>
              </View>

              {!isSelectMode && (
                <TouchableWithoutFeedback
                  onPress={(e) => {
                    e.stopPropagation();
                    // Measure the kebab button position
                    if (activeNoteOptions === item.id) {
                      setActiveNoteOptions(null);
                      setDropdownPosition(null);
                    } else {
                      // Get the kebab button's position on screen
                      e.target.measure((x, y, width, height, pageX, pageY) => {
                        const screenWidth = Dimensions.get("window").width;
                        const dropdownWidth = 180; // Fixed dropdown width

                        let dropdownX;
                        // If button is on left half, align dropdown's right edge with button's right edge
                        if (pageX < screenWidth / 2) {
                          dropdownX = pageX + width - dropdownWidth;
                        } else {
                          // If button is on right half, align dropdown's left edge with button's left edge
                          dropdownX = pageX;
                        }

                        // Ensure dropdown stays within screen bounds
                        if (dropdownX < 10) {
                          dropdownX = 10;
                        }
                        if (dropdownX + dropdownWidth > screenWidth - 10) {
                          dropdownX = screenWidth - dropdownWidth - 10;
                        }

                        setDropdownPosition({
                          x: dropdownX,
                          y: pageY + height,
                        });
                        setActiveNoteOptions(item.id);
                      });
                    }
                  }}
                >
                  <View style={styles.gridNoteOptionsButton}>
                    <MaterialIcons name="more-vert" size={16} color="#9CA3AF" />
                  </View>
                </TouchableWithoutFeedback>
              )}
            </View>

            {/* Rest of the existing footer code... */}
            <View style={styles.noteFooter}>
              <Text style={styles.noteDate}>
                {formatShortLocalDate(item.updatedAt)}
              </Text>

              <View style={styles.metadataContainer}>
                {!selectedFilterFolder && item.folderId && (
                  <View style={styles.folderBadge}>
                    <MaterialIcons name="folder" size={10} color="#6A009C" />
                    <Text style={styles.folderBadgeText} numberOfLines={1}>
                      {folders.find((f) => f.id === item.folderId)?.name ||
                        "Folder"}
                    </Text>
                  </View>
                )}

                {/* Tags removed from UI per request */}
              </View>
            </View>

            {/* Options Dropdown as Modal */}
            {activeNoteOptions === item.id && dropdownPosition && (
              <Modal
                transparent
                animationType="fade"
                visible={true}
                onRequestClose={() => {
                  setActiveNoteOptions(null);
                  setDropdownPosition(null);
                }}
              >
                <TouchableWithoutFeedback
                  onPress={() => {
                    setActiveNoteOptions(null);
                    setDropdownPosition(null);
                  }}
                >
                  <View
                    style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.1)" }}
                  />
                </TouchableWithoutFeedback>
                <View
                  style={[
                    styles.gridNoteOptionsDropdown,
                    {
                      position: "absolute",
                      left: dropdownPosition.x,
                      top: dropdownPosition.y,
                      width: 180, // Fixed width for consistency
                      zIndex: 9999999,
                    },
                  ]}
                  pointerEvents="auto"
                >
                  {/* Add to Folder or Move to Folder option */}
                  {(!item.folderId || selectedFilterFolder !== null) && (
                    <TouchableOpacity
                      onPress={() => {
                        handleAddToFolder(item.id);
                        setActiveNoteOptions(null);
                        setDropdownPosition(null);
                      }}
                    >
                      <View style={styles.noteOptionItem}>
                        <Ionicons
                          name="folder-outline"
                          size={20}
                          color="#333"
                        />
                        <Text style={styles.noteOptionText}>
                          {!item.folderId ? "Add to Folder" : "Move to Folder"}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  )}

                  {/* Remove from Folder option - only show if note is in a folder */}
                  {item.folderId && (
                    <TouchableOpacity
                      onPress={() => {
                        handleRemoveFromFolder(item.id);
                        setActiveNoteOptions(null);
                        setDropdownPosition(null);
                      }}
                    >
                      <View style={styles.noteOptionItem}>
                        <Ionicons
                          name="remove-circle-outline"
                          size={18}
                          color="#EF4444"
                        />
                        <Text style={styles.noteOptionText}>
                          Remove from Folder
                        </Text>
                      </View>
                    </TouchableOpacity>
                  )}

                  {/* Duplicate Drawing option - only for drawings */}
                  {isDrawing && (
                    <TouchableOpacity
                      onPress={() => {
                        handleDuplicateDrawing(item);
                        setActiveNoteOptions(null);
                        setDropdownPosition(null);
                      }}
                    >
                      <View style={styles.noteOptionItem}>
                        <Ionicons
                          name="copy-outline"
                          size={20}
                          color="#6B7280"
                        />
                        <Text style={styles.noteOptionText}>
                          Duplicate Drawing
                        </Text>
                      </View>
                    </TouchableOpacity>
                  )}

                  {/* Share Note option */}
                  <TouchableOpacity
                    onPress={() => {
                      setActiveNoteOptions(null);
                      setDropdownPosition(null);
                      handleShareNote(item);
                    }}
                  >
                    <View style={styles.noteOptionItem}>
                      <Ionicons
                        name="share-outline"
                        size={20}
                        color="#10B981"
                      />
                      <Text style={styles.noteOptionText}>
                        Share {isDrawing ? "Drawing" : "Note"}
                      </Text>
                    </View>
                  </TouchableOpacity>

                  {/* Delete Note/Drawing option - remove border for last item */}
                  <TouchableOpacity
                    onPress={() => {
                      handleDeleteNote(item.id);
                      setActiveNoteOptions(null);
                      setDropdownPosition(null);
                    }}
                    style={[styles.noteOptionItem, { borderBottomWidth: 0 }]}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="trash-outline" size={20} color="#EF4444" />
                    <Text style={[styles.noteOptionText, { color: "#EF4444" }]}>
                      {isDrawing ? "Delete Drawing" : "Delete Note"}
                    </Text>
                  </TouchableOpacity>
                </View>
              </Modal>
            )}
          </View>
        </TouchableOpacity>
      );
    },
    [
      isSelectMode,
      selectedNotes,
      activeNoteOptions,
      dropdownPosition,
      folders,
      selectedFilterFolder,
      windowWidth,
      previewHtmlTagStyles,
      handleNotePress,
      toggleNoteSelection,
      handleAddToFolder,
      handleRemoveFromFolder,
      handleDeleteNote,
      handleDuplicateDrawing,
    ]
  );

  // Folder Options Modal
  const renderFolderOptionsModal = () => (
    <Modal
      visible={showFolderOptionsModal}
      transparent={true}
      animationType="fade"
      onRequestClose={() => setShowFolderOptionsModal(false)}
    >
      <TouchableOpacity
        style={styles.modalOverlay}
        activeOpacity={1}
        onPress={() => setShowFolderOptionsModal(false)}
      >
        <View style={styles.folderOptionsModalContent}>
          <Text style={styles.folderOptionsTitle}>
            {folders.find((f) => f.id === selectedFolderForOptions)?.name}
          </Text>

          <TouchableOpacity
            style={styles.folderOptionItem}
            onPress={() =>
              selectedFolderForOptions &&
              openEditFolderModal(selectedFolderForOptions)
            }
          >
            <MaterialIcons name="edit" size={20} color="#6A009C" />
            <Text style={styles.folderOptionText}>Edit Folder</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.folderOptionItem}
            onPress={() =>
              selectedFolderForOptions &&
              confirmDeleteFolder(selectedFolderForOptions)
            }
          >
            <MaterialIcons name="delete" size={20} color="#EF4444" />
            <Text style={[styles.folderOptionText, { color: "#EF4444" }]}>
              Delete Folder
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.folderOptionItem, styles.cancelOption]}
            onPress={() => setShowFolderOptionsModal(false)}
          >
            <MaterialIcons name="close" size={20} color="#6B7280" />
            <Text style={[styles.folderOptionText, { color: "#6B7280" }]}>
              Cancel
            </Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );

  // Delete Confirmation Modal
  const renderDeleteConfirmModal = () => (
    <Modal
      visible={showDeleteConfirmModal}
      transparent={true}
      animationType="fade"
      onRequestClose={() => setShowDeleteConfirmModal(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.deleteConfirmModalContent}>
          <View style={styles.deleteConfirmIcon}>
            <MaterialIcons name="warning" size={48} color="#EF4444" />
          </View>

          <Text style={styles.deleteConfirmTitle}>Delete Folder?</Text>
          <Text style={styles.deleteConfirmMessage}>
            Are you sure you want to delete &quot;
            {folders.find((f) => f.id === folderToDelete)?.name}&quot;? This
            action cannot be undone.
          </Text>

          <View style={styles.deleteConfirmButtons}>
            <TouchableOpacity
              style={styles.deleteConfirmCancelButton}
              onPress={() => {
                setShowDeleteConfirmModal(false);
                setFolderToDelete(null);
              }}
            >
              <Text style={styles.deleteConfirmCancelText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.deleteConfirmDeleteButton}
              onPress={() =>
                folderToDelete && handleDeleteFolder(folderToDelete)
              }
            >
              <Text style={styles.deleteConfirmDeleteText}>Delete</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );

  // Modal for selecting which folder to add notes to
  const renderSortNotesModal = () => (
    <Modal
      visible={showSortNotesModal}
      transparent={true}
      animationType="slide"
      onRequestClose={() => setShowSortNotesModal(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <View style={styles.modalTitleContainer}>
              <View style={styles.modalTitleRow}>
                <Text style={styles.modalTitle}>
                  Move to Folder
                </Text>
                <View style={styles.selectedCountBadge}>
                  <Text style={styles.selectedCountText}>
                    {selectedNotes.length}
                  </Text>
                </View>
              </View>
              <Text style={styles.modalSubtitle}>
                Choose a destination folder to organize your selected {selectedNotes.length === 1 ? 'note' : 'notes'}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => setShowSortNotesModal(false)}
              style={styles.modalCloseButton}
            >
              <MaterialIcons name="close" size={24} color="#9CA3AF" />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.modalBody}
            showsVerticalScrollIndicator={false}
          >
            {/* Option for unorganized notes */}
            <TouchableOpacity
              style={[
                styles.folderItem,
                styles.unorganizedFolderItem,
              ]}
              onPress={() => {
                // Close modal first for better UX
                setShowSortNotesModal(false);
                
                // For each selected note, remove from folder
                selectedNotes.forEach((noteId) => {
                  handleRemoveFromFolder(noteId);
                });
                
                // Provide feedback
                showSuccessToast(`${selectedNotes.length} ${selectedNotes.length === 1 ? 'note' : 'notes'} moved to unorganized`);
              }}
            >
              <View style={[styles.modalFolderIcon, { backgroundColor: "#64748B" }]}>
                <MaterialIcons name="notes" size={20} color="#FFFFFF" />
              </View>
              <Text style={styles.modalFolderName}>Unorganized Notes</Text>
              <View style={styles.folderArrow}>
                <MaterialIcons name="arrow-forward-ios" size={16} color="#9CA3AF" />
              </View>
            </TouchableOpacity>

            <View style={styles.folderDivider}>
              <View style={styles.folderDividerLine} />
              <Text style={styles.folderDividerText}>Folders</Text>
              <View style={styles.folderDividerLine} />
            </View>

            {folders.map((folder) => (
              <TouchableOpacity
                key={folder.id}
                style={[
                  styles.folderItem,
                  selectedFolder === folder.id && styles.selectedFolderItem,
                ]}
                onPress={() => {
                  // Show confirmation and assign notes to folder
                  setShowSortNotesModal(false);
                  setSelectedFolder(folder.id);
                  assignNotesToFolder(folder.id, selectedNotes);
                }}
              >
                <View
                  style={[
                    styles.modalFolderIcon,
                    {
                      backgroundColor: Array.isArray(folder.color)
                        ? folder.color[0]
                        : folder.color,
                    },
                  ]}
                >
                  <MaterialIcons name="folder" size={20} color="#FFFFFF" />
                </View>
                <Text style={styles.modalFolderName}>{folder.name}</Text>
                <View style={styles.folderArrow}>
                  <MaterialIcons name="arrow-forward-ios" size={16} color="#9CA3AF" />
                </View>
              </TouchableOpacity>
            ))}

            {folders.length === 0 && (
              <View style={styles.emptyState}>
                <MaterialIcons name="folder-off" size={40} color="#CBD5E0" />
                <Text style={styles.emptyStateTitle}>No folders yet</Text>
                <Text style={styles.emptyStateSubtitle}>
                  Create a folder first to organize your notes
                </Text>
                <TouchableOpacity
                  style={styles.createButton}
                  onPress={() => {
                    setShowSortNotesModal(false);
                    setShowCreateFolderModal(true);
                  }}
                >
                  <Text style={styles.createButtonText}>Create Folder</Text>
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>

          <View style={styles.modalFooter}>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => setShowSortNotesModal(false)}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );

  const renderCreateFolderModal = () => (
    <Modal
      visible={showCreateFolderModal}
      transparent={true}
      animationType="slide"
      onRequestClose={closeCreateFolderModal}
    >
      <KeyboardAvoidingView
        style={styles.modalContainer}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 60 : 20}
        enabled
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={closeCreateFolderModal}
        >
          <View style={{ flex: 1 }} />
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={closeCreateFolderModal}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle}>Create New Folder</Text>
              <TouchableOpacity
                style={styles.createButton}
                onPress={handleCreateFolder}
              >
                <Text style={styles.createButtonText}>Create</Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.modalBody}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Folder Name</Text>
                <TextInput
                  style={styles.textInput}
                  value={newFolderName}
                  onChangeText={setNewFolderName}
                  placeholder="Enter folder name"
                  placeholderTextColor="#9CA3AF"
                  autoFocus={true}
                  maxLength={20}
                  returnKeyType="done"
                  onSubmitEditing={handleCreateFolder}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Choose Color</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.colorSelector}
                  keyboardShouldPersistTaps="always"
                >
                  {FOLDER_COLORS.map((color) => (
                    <TouchableOpacity
                      key={color}
                      style={[
                        styles.colorOption,
                        { backgroundColor: color },
                        selectedFolderColor === color &&
                          styles.selectedColorOption,
                      ]}
                      onPress={() => setSelectedFolderColor(color)}
                    >
                      {selectedFolderColor === color && (
                        <MaterialIcons name="check" size={20} color="#FFFFFF" />
                      )}
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            </ScrollView>
          </View>
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </Modal>
  );

  const renderDrawingSetupModal = () => (
    <Modal
      visible={showDrawingSetupModal}
      transparent
      animationType="slide"
      presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : undefined}
      statusBarTranslucent
      onRequestClose={closeDrawingSetupModal}
    >
      <TouchableWithoutFeedback onPress={closeDrawingSetupModal}>
        <View style={styles.modalContainer}>
          <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
            <KeyboardAvoidingView
              style={styles.drawingModalViewContainer}
              behavior={Platform.OS === "ios" ? "padding" : "height"}
              keyboardVerticalOffset={Platform.OS === "ios" ? 60 : 20}
            >
          <View style={styles.modalContent}>
            {/* Header with drag handle, title and compact action buttons */}
            <View style={styles.drawingModalHeaderCompact}>
              <View style={[styles.drawingModalHandle, styles.drawingModalHandleCompact]} />
              
              {/* Three-section header layout */}
              <View style={styles.headerThreePartLayout}>
                {/* Left: Close button */}
                <View style={styles.headerLeftSection}>
                  <TouchableOpacity
                    style={styles.headerIconButton}
                    onPress={closeDrawingSetupModal}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="close" size={20} color="#6B7280" />
                  </TouchableOpacity>
                </View>

                {/* Middle: Title */}
                <View style={styles.headerCenterSection}>
                  <Text style={styles.drawingModalTitleCompact}>Create New Drawing</Text>
                </View>
                
                {/* Right: Create button */}
                <View style={styles.headerRightSection}>
                  <TouchableOpacity
                    style={styles.headerPrimaryButton}
                    onPress={handleCreateDrawingWithSetup}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    activeOpacity={0.9}
                  >
                    <Ionicons name="brush" size={16} color="#FFFFFF" />
                    <Text style={styles.headerPrimaryButtonText}>Create</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            <ScrollView
              style={styles.modalBody}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {/* Title Setup Section */}
              <View style={styles.drawingModalSection}>
                <Text style={styles.drawingModalSectionLabel}>
                  Drawing Title
                </Text>
                <View style={styles.drawingModalInputWrapper}>
                  <Ionicons name="pencil" size={20} color="#6B7280" style={styles.drawingModalInputIcon} />
                  <TextInput
                    style={styles.drawingModalTextInput}
                    value={drawingTitle}
                    onChangeText={setDrawingTitle}
                    placeholder="Enter a title for your drawing"
                    placeholderTextColor="#9CA3AF"
                    maxLength={50}
                    returnKeyType="done"
                    numberOfLines={1}
                  />
                </View>
              </View>

              {/* Templates Section */}
              <View style={styles.drawingModalSection}>
                <Text style={styles.drawingModalSectionLabel}>
                  Choose Template
                </Text>
                <Text style={styles.drawingModalDescription}>
                  Select a template to start with or use a blank canvas
                </Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.templateScrollRow}
                  decelerationRate="fast"
                  snapToInterval={140}
                  snapToAlignment="start"
                >
                  {DRAWING_TEMPLATES.map((template) => (
                    <TouchableOpacity
                      key={template.id}
                      style={[
                        styles.templateOption,
                        selectedTemplate === template.id &&
                          styles.selectedTemplateOption,
                      ]}
                      onPress={() => setSelectedTemplate(template.id)}
                      activeOpacity={0.8}
                    >
                      <View style={styles.templatePreviewWrapper}>
                        <TemplateOverlay
                          template={template.id as TemplateType}
                          canvasWidth={100}
                          canvasHeight={60}
                        />
                      </View>
                      <Text
                        style={[
                          styles.templateName,
                          selectedTemplate === template.id &&
                            styles.selectedTemplateName,
                        ]}
                        numberOfLines={1}
                        ellipsizeMode="tail"
                      >
                        {template.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            </ScrollView>
          </View>
            </KeyboardAvoidingView>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );

  const renderEditFolderModal = () => (
    <Modal
      visible={showEditFolderModal}
      transparent={true}
      animationType="slide"
      onRequestClose={() => setShowEditFolderModal(false)}
    >
      <TouchableWithoutFeedback onPress={() => setShowEditFolderModal(false)}>
        <View style={styles.modalOverlay}>
          <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Edit Folder Name</Text>
                <TouchableOpacity
                  onPress={() => setShowEditFolderModal(false)}
                  style={styles.modalCloseButton}
                >
                  <MaterialIcons name="close" size={24} color="#9CA3AF" />
                </TouchableOpacity>
              </View>

              <View style={styles.modalBody}>
                <TextInput
                  style={styles.textInput}
                  value={editingFolderName}
                  onChangeText={setEditingFolderName}
                  placeholder="Enter folder name"
                  placeholderTextColor="#9CA3AF"
                  autoFocus={true}
                  maxLength={20}
                />
              </View>

              <View style={styles.modalFooter}>
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={() => setShowEditFolderModal(false)}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.createButton}
                  onPress={() => {
                    if (editingFolderName.trim() !== "" && editingFolderId) {
                      updateFolderName(
                        editingFolderId,
                        editingFolderName.trim()
                      );
                      setShowEditFolderModal(false);
                    }
                  }}
                >
                  <Text style={styles.createButtonText}>Save</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );

  return (
  <SafeAreaWrapper disableTopSafeArea={true}>
      <View style={styles.rootContainer}> 
      {isUploadingDocument && (
        <View style={styles.uploadOverlay}>
          <View style={styles.uploadCard}>
            <ActivityIndicator size="large" color="#8B5CF6" />
            <Text style={styles.uploadText}>Uploading document…</Text>
          </View>
        </View>
      )}
    
      <StatusBar barStyle="light-content" backgroundColor="#7C3AED" />

      {/* Fixed Header - outside of content container */}
      <LinearGradient
        colors={["#A855F7", "#8B5CF6", "#7C3AED"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.header}
      >
        <View style={styles.headerTopRow}>
          <View style={styles.headerTitleSection}>
            <Text style={styles.headerTitle}>
              {folderName ? `${folderName} Notes` : "All Notes"}
            </Text>
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={[
                styles.headerActionButton,
                showSearchBar && styles.activeSearchButton,
              ]}
              onPress={toggleSearch}
            >
              <MaterialIcons name="search" size={22} color="#ffffffff"  />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.headerActionButton}
              onPress={() => setShowMoreVertMenu(!showMoreVertMenu)}
            >
              <MaterialIcons name="more-vert" size={22} color="#ffffffff" />
            </TouchableOpacity>
          </View>
        </View>

        {showSearchBar && (
          <View style={styles.searchContainer}>
            <View style={styles.searchInputContainer}>
              <MaterialIcons
                name="search"
                size={20}
                color="#9CA3AF"
                style={styles.searchIcon}
              />
              <TextInput
                style={styles.searchInput}
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search notes..."
                placeholderTextColor="#9CA3AF"
                autoFocus={true}
                returnKeyType="search"
                accessibilityLabel="Search notes"
                accessibilityHint="Type to search through your notes"
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity
                  style={styles.clearSearchButton}
                  onPress={() => setSearchQuery("")}
                  accessibilityLabel="Clear search"
                  accessibilityHint="Clear the search input"
                >
                  <MaterialIcons name="clear" size={18} color="#9CA3AF" />
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {/* Folder Section inside Header */}
        <View style={styles.folderSectionInHeader}>
          <TouchableOpacity
            style={styles.folderToggle}
            onPress={() => setShowFolderDropdown(!showFolderDropdown)}
            activeOpacity={0.7}
          >
            <View style={styles.folderToggleLeft}>
              <MaterialIcons name="folder" size={22} color="#FFDE21" />
              <Text style={styles.folderToggleText}>
                {selectedFilterFolder === "unorganized"
                  ? "Unorganized Notes"
                  : selectedFilterFolder
                  ? folders.find((f) => f.id === selectedFilterFolder)?.name ||
                    "Folders"
                  : "Folders"}
              </Text>
            </View>
            <MaterialIcons
              name={showFolderDropdown ? "expand-less" : "expand-more"}
              size={24}
              color="#9CA3AF"
            />
          </TouchableOpacity>

          {showFolderDropdown && (
            <View style={styles.folderDropdownContainer}>
              {/* Replace ScrollView with FlatList for horizontal folder list */}
              <FlatList
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.foldersScrollContent}
                data={[
                  ...folders,
                  {
                    id: "add-folder",
                    name: "Add Folder",
                    isAddButton: true,
                  },
                ]}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => {
                  // Type guard to check if item is the add button
                  if ("isAddButton" in item && item.isAddButton) {
                    return (
                      <TouchableOpacity
                        style={styles.addFolderCard}
                        onPress={() => {
                          setShowCreateFolderModal(true);
                          setShowFolderDropdown(false);
                        }}
                        activeOpacity={0.8}
                      >
                        <View style={styles.addFolderIcon}>
                          <MaterialIcons name="add" size={24} color="#6A009C" />
                        </View>
                        <Text style={styles.addFolderText}>New Folder</Text>
                      </TouchableOpacity>
                    );
                  }

                  return (
                    <TouchableOpacity
                      key={item.id}
                      style={[
                        styles.folderCard,
                        selectedFilterFolder === item.id &&
                          styles.selectedFolderCard,
                      ]}
                      activeOpacity={0.8}
                      onPress={() => {
                        setSelectedFilterFolder(
                          selectedFilterFolder === item.id ? null : item.id
                        );
                        setShowFolderDropdown(false);
                      }}
                      onLongPress={() => handleFolderLongPress(item.id)}
                      delayLongPress={500}
                    >
                      <View style={styles.folderCardHeader}>
                        <View
                          style={[
                            styles.folderIcon,
                            {
                              backgroundColor:
                                "color" in item
                                  ? Array.isArray(item.color)
                                    ? item.color[0]
                                    : item.color
                                  : "#E5E7EB",
                            },
                          ]}
                        >
                          <MaterialIcons
                            name="folder"
                            size={20}
                            color="#FFFFFF"
                          />
                        </View>
                        <TouchableOpacity
                          style={styles.folderOptionsButton}
                          onPress={() => handleFolderLongPress(item.id)}
                          hitSlop={{
                            top: 10,
                            bottom: 10,
                            left: 10,
                            right: 10,
                          }}
                        >
                          <MaterialIcons
                            name="more-vert"
                            size={16}
                            color="#9CA3AF"
                          />
                        </TouchableOpacity>
                      </View>
                      <Text
                        style={[
                          styles.folderName,
                          selectedFilterFolder === item.id &&
                            styles.activeFolderName,
                        ]}
                        numberOfLines={2}
                      >
                        {item.name}
                      </Text>
                      <Text style={styles.folderCount}>
                        {
                          notes.filter((note) => note.folderId === item.id)
                            .length
                        }{" "}
                        notes
                      </Text>
                    </TouchableOpacity>
                  );
                }}
              />

              {/* Unorganized folder outside scroll */}
              <TouchableOpacity
                style={[
                  styles.unorganizedFolderCard,
                  selectedFilterFolder === "unorganized" &&
                    styles.selectedUnorganizedFolderCard,
                ]}
                activeOpacity={0.8}
                onPress={() => {
                  setSelectedFilterFolder(
                    selectedFilterFolder === "unorganized"
                      ? null
                      : "unorganized"
                  );
                  setShowFolderDropdown(false);
                }}
              >
                <View style={styles.unorganizedFolderIcon}>
                  <MaterialIcons name="folder-open" size={20} color="#64748B" />
                </View>
                <Text
                  style={[
                    styles.unorganizedFolderName,
                    selectedFilterFolder === "unorganized" &&
                      styles.activeUnorganizedFolderName,
                  ]}
                >
                  Unorganized Notes
                </Text>
                <Text style={styles.unorganizedFolderCount}>
                  {notes.filter((note) => !note.folderId).length} notes
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </LinearGradient>

      {isSelectMode && (
        <View style={styles.selectionModeHeader}>
          <View style={styles.selectionModeInfo}>
            <View style={styles.selectionCountBadge}>
              <Text style={styles.selectionCountText}>
                {selectedNotes.length}
              </Text>
            </View>
            <Text style={styles.selectionModeText}>
              {selectedNotes.length === 1 ? "note" : "notes"} selected
            </Text>
          </View>
          <View style={styles.selectionModeActions}>
            <TouchableOpacity
              style={[styles.selectionModeButton, styles.folderButton]}
              onPress={() => {
                if (selectedNotes.length === 0) {
                  showWarningToast("Select notes first");
                  return;
                }
                
                if (folders.length === 0) {
                  showWarningToast("Create a folder first");
                  return;
                }
                
                // Always show folder selection modal for better UX
                setShowSortNotesModal(true);
              }}
            >
              <MaterialIcons name="folder" size={18} color="#FFFFFF" />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.selectionModeButton, styles.deleteButton]}
              onPress={handleBulkDeleteNotes}
            >
              <MaterialIcons name="delete" size={18} color="#FFFFFF" />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.selectionModeButton, styles.selectioncancelButton]}
              onPress={() => {
                setIsSelectMode(false);
                setSelectedNotes([]);
              }}
            >
              <MaterialIcons name="close" size={18} color="#64748B" />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Content Container - holds the notes list and other content */}
      <View style={styles.contentContainer}>
        {isLoading && notes.length === 0 ? (
          <SkeletonLoader type="notes" count={6} />
        ) : (
          <FlatList
            data={notesViewData}
            renderItem={renderNoteItem}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.notesList}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                colors={["#8B5CF6", "#6366F1"]}
                tintColor="#8B5CF6"
                title="Pull to refresh"
                titleColor="#6B7280"
                progressBackgroundColor="#FFFFFF"
              />
            }
            ListEmptyComponent={NotesEmptyListComponent}
            numColumns={2}
            columnWrapperStyle={styles.notesGridRow}
            initialNumToRender={8}
            maxToRenderPerBatch={10}
            windowSize={10}
            getItemLayout={(_, index) => {
              const length = 220;
              const offset = Math.floor(index / 2) * length;
              return {
                length,
                offset,
                index,
              };
            }}
          />
        )}
      </View>

      {/* Global overlay for dropdown - positioned absolutely over everything */}
      {activeNoteOptions && (
        <TouchableWithoutFeedback onPress={() => setActiveNoteOptions(null)}>
          <View style={styles.overlayForDropdown}></View>
        </TouchableWithoutFeedback>
      )}

      {/* More Vert Menu Modal */}
      {showMoreVertMenu && (
        <Modal
          visible={showMoreVertMenu}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setShowMoreVertMenu(false)}
        >
          <TouchableOpacity
            style={styles.moreVertOverlay}
            activeOpacity={1}
            onPress={() => setShowMoreVertMenu(false)}
          >
            <View style={styles.moreVertMenuContainer}>
              <TouchableOpacity
                style={styles.moreVertMenuItem}
                onPress={() => {
                  setShowMoreVertMenu(false);
                  setIsSelectMode(true);
                }}
              >
                <MaterialIcons name="checklist" size={20} color="#8B5CF6" />
                <Text style={styles.moreVertMenuText}>
                  Select Multiple Notes
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.moreVertMenuItem}
                onPress={() => {
                  setShowMoreVertMenu(false);
                  onRefresh();
                }}
              >
                <MaterialIcons name="refresh" size={20} color="#3B82F6" />
                <Text style={styles.moreVertMenuText}>Refresh Notes</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>
      )}

      {/* Add Options Menu */}
      {showAddOptionsMenu && (
        <View style={styles.addOptionsContainer}>
          <TouchableWithoutFeedback
            onPress={() => setShowAddOptionsMenu(false)}
          >
            <View style={styles.addOptionsOverlay} />
          </TouchableWithoutFeedback>
          <View style={styles.addOptionsMenu}>
            <View style={styles.addOptionsPointer} />
            <TouchableOpacity
              style={[styles.addOptionButton, styles.drawingOptionButton]}
              onPress={() => {
                setShowAddOptionsMenu(false);
                setShowDrawingSetupModal(true);
              }}
              activeOpacity={0.8}
            >
              <MaterialIcons name="brush" size={24} color="#8B5CF6" />
              <Text style={[styles.addOptionText, { color: "#8B5CF6" }]}>
                Drawing
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.addOptionButton, styles.textOptionButton]}
              onPress={() => {
                setShowAddOptionsMenu(false);
                handleCreateNote();
              }}
              activeOpacity={0.8}
            >
              <MaterialIcons name="note-add" size={24} color="#3B82F6" />
              <Text style={[styles.addOptionText, { color: "#3B82F6" }]}>
                Text Note
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.addOptionButton, styles.importOptionButton]}
              onPress={() => {
                setShowAddOptionsMenu(false);
                handleImportDocument();
              }}
              activeOpacity={0.8}
            >
              <MaterialIcons name="upload-file" size={24} color="#F59E0B" />
              <Text style={[styles.addOptionText, { color: "#F59E0B" }]}>
                Import Document
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Main Add Button */}
      {/* Main Add Button */}
      <TouchableOpacity
        style={[
          styles.fabButton,
          showAddOptionsMenu && styles.fabButtonRotated,
          { bottom: Math.max(insets.bottom, 0) + (navbarHeight || (Platform.OS === "ios" ? 64 : 56)) + 0 },
        ]}
        onPress={() => setShowAddOptionsMenu(!showAddOptionsMenu)}
        activeOpacity={0.8}
      >
        <MaterialIcons
          name={showAddOptionsMenu ? "close" : "add"}
          size={32}
          color="#fff"
        />
      </TouchableOpacity>
  <Navbar activeRoute="Notes" onLayoutHeight={(h) => setNavbarHeight(h)} />
      {renderCreateFolderModal()}
      {renderDrawingSetupModal()}
      {renderSortNotesModal()}
      {renderEditFolderModal()}
      {renderFolderOptionsModal()}
      {renderDeleteConfirmModal()}

      <DocumentPreviewModal
        visible={showDocumentPreviewModal}
        onClose={() => setShowDocumentPreviewModal(false)}
        onConfirmImport={handleConfirmDocumentImport}
      />

      {/* Document Viewer Modal */}
      {showDocumentViewer && currentDocument && (
        <Modal
          visible={showDocumentViewer}
          animationType="slide"
          presentationStyle="fullScreen"
          onRequestClose={() => setShowDocumentViewer(false)}
        >
          <DocumentViewer
            documentUri={currentDocument.uri}
            documentName={currentDocument.name}
            noteId={currentDocument.noteId}
            documentType={currentDocument.type}
            onClose={() => {
              setShowDocumentViewer(false);
              setCurrentDocument(null);
              // Refresh notes/folders after possible changes
              fetchNotes(true);
              fetchFolders();
            }}
          />
        </Modal>
      )}

      {/* PDF Annotation Viewer Modal */}
      {showPDFViewer && currentDocument && (
        <Modal
          visible={showPDFViewer}
          animationType="slide"
          presentationStyle="fullScreen"
          onRequestClose={() => setShowPDFViewer(false)}
        >
          <PDFAnnotationViewer
            source={{ uri: currentDocument.uri }}
            fileName={currentDocument.name}
            noteId={currentDocument.noteId}
            onClose={() => {
              setShowPDFViewer(false);
              setCurrentDocument(null);
              // Refresh notes/folders after possible changes
              fetchNotes(true);
              fetchFolders();
            }}
          />
        </Modal>
      )}

      {/* Hidden renderer for drawing share capture */}
      {!!shareTargetNote && isDrawingNote(shareTargetNote) && (
        <View style={{ position: 'absolute', left: -9999, top: -9999 }} pointerEvents="none">
          <ViewShot ref={shareCaptureRef} options={{ format: 'png', quality: 1 }}>
            <View style={{ backgroundColor: '#FFFFFF', padding: 12 }}>
              <TemplatePreview note={shareTargetNote} width={1024} height={768} />
              <Text style={{ position: 'absolute', left: -9999 }}>export</Text>
            </View>
          </ViewShot>
        </View>
      )}

      {/* Statistics Modal */}
      {showStatsModal && (
        <Modal
          visible={showStatsModal}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setShowStatsModal(false)}
        >
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => setShowStatsModal(false)}
          >
            <View style={styles.statsModalContent}>
              <View style={styles.statsHeader}>
                <Text style={styles.statsModalTitle}>Notes Statistics</Text>
                <Text style={styles.statsSubtitle}>
                  Quick overview of your notes and folders
                </Text>
              </View>

              <View style={styles.statsGrid}>
                <View style={styles.statCard}>
                  <View style={[styles.statIconContainer, { backgroundColor: "#F3E8FF" }]}>
                    <MaterialIcons name="note-alt" size={20} color="#7C3AED" />
                  </View>
                  <Text style={styles.statsValueLarge}>{notes.length}</Text>
                  <Text style={styles.statLabelSmall}>Total notes</Text>
                </View>

                <View style={styles.statCard}>
                  <View style={[styles.statIconContainer, { backgroundColor: "#E6F6FF" }]}>
                    <MaterialIcons name="folder" size={20} color="#0369A1" />
                  </View>
                  <Text style={styles.statsValueLarge}>{folders.length}</Text>
                  <Text style={styles.statLabelSmall}>Folders</Text>
                </View>

                <View style={styles.statCard}>
                  <View style={[styles.statIconContainer, { backgroundColor: "#FFF7ED" }]}>
                    <MaterialIcons name="filter-list" size={20} color="#D97706" />
                  </View>
                  <Text style={styles.statsValueLarge}>{notesViewData.length}</Text>
                  <Text style={styles.statLabelSmall}>Filtered notes</Text>
                </View>
              </View>

              <TouchableOpacity
                style={styles.statsCloseButton}
                onPress={() => setShowStatsModal(false)}
              >
                <Text style={styles.statsCloseButtonText}>Close</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>
      )}
    </View>
    </SafeAreaWrapper>
  );
}

const styles = StyleSheet.create({
  uploadOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
  },
  uploadCard: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
    minWidth: 200,
    gap: 10,
  },
  uploadText: {
    marginTop: 8,
    fontSize: 14,
    color: '#374151',
    fontFamily: 'Inter-Medium',
  },
    rootContainer: {
    flex: 1,
    backgroundColor: "#ffffffff",
  },
  header: {
    paddingTop: 40,
    paddingBottom: 50,
    paddingHorizontal: 24,
    borderBottomLeftRadius: 25,
    borderBottomRightRadius: 25,
    shadowColor: "#1E293B",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  headerInList: {
    paddingTop: Platform.OS === "ios" ? 50 : 35,
    paddingBottom: 24,
    paddingHorizontal: 24,
    borderBottomLeftRadius: 25,
    borderBottomRightRadius: 25,
    shadowColor: "#1E293B",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  contentContainer: {
    flex: 1,
    marginTop: 20, // To overlap with header's bottom curve
    backgroundColor: "#F8FAFC",
  },

  headerTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    // Remove paddingHorizontal from here - it should be at parent level
  },

  headerTitleSection: {
    flex: 1, // This ensures proper space allocation
  },
  headerTitle: {
    fontSize: 32,
    fontFamily: "Lexend",
    color: "#ffffffff",
    marginBottom: 4,
  },

  headerActions: {
    flexDirection: "row",
    gap: 8,
    position: "relative",
  },
  headerActionButton: {
    width: 44,
    height: 44,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    
    backgroundColor: "rgba(255, 255, 255, 0.2)",
  },
  activeSearchButton: {
    backgroundColor: "rgba(255, 255, 255, 0.3)",
  },
  searchContainer: {
    marginTop: 16,
  },
  searchInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 14,
    shadowColor: "#1E293B",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 3,
    borderWidth: 1,
    borderColor: "#F1F5F9",
  },
  searchIcon: {
    marginRight: 14,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    fontFamily: "Inter-Regular",
    color: "#1F2937",
    paddingVertical: 0, // Remove default padding
  },
  clearSearchButton: {
    padding: 6,
    marginLeft: 10,
    borderRadius: 12,
    backgroundColor: "#F8FAFC",
  },
  folderSectionInHeader: {
    marginTop: 16,
  },
  folderToggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    shadowColor: "#1E293B",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  folderToggleLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  folderToggleText: {
    fontSize: 16,
    fontFamily: "Inter-Medium",
    color: "#374151",
    marginLeft: 12,
  },
  folderDropdownContainer: {
    marginTop: 16,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    shadowColor: "#1E293B",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  foldersScrollContent: {
    paddingHorizontal: 4,
    paddingVertical: 8,
  },
  folderCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    marginRight: 12,
    minWidth: 120,
    maxWidth: 140,
    alignItems: "flex-start",
    shadowColor: "#1E293B",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
    borderWidth: 1,
    borderColor: "rgba(226, 232, 240, 0.5)",
  },
  selectedFolderCard: {
    backgroundColor: "#6A009C",
    shadowColor: "#6A009C",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 8,
    borderColor: "#6A009C",
    transform: [{ scale: 1.02 }],
  },
  folderIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  folderName: {
    fontSize: 14,
    fontFamily: "Inter-Medium",
    color: "#1F2937",
    textAlign: "left",
    marginBottom: 4,
    lineHeight: 18,
    width: "100%",
  },

  activeFolderName: {
    color: "#FFFFFF",
  },

  folderCount: {
    fontSize: 11,
    fontFamily: "Inter-Regular",
    color: "#9CA3AF",
  },
  notesList: {
    paddingBottom: 120, // Space for the navbar
    paddingHorizontal: 16,
    overflow: "visible",
  },
  notesGridRow: {
    justifyContent: "space-between",
    marginBottom: 16,
  },
  gridNoteItem: {
    width: (width - 40) / 2, // Adjust width to account for padding
    marginBottom: 12,
    overflow: "visible", // Allow dropdown to show above other items
    height: 230, // Fixed height for consistent grid
  },
  gridNoteContent: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 16,
    shadowColor: "#1E293B",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
    overflow: "visible", // Allow dropdown to show above other items
    zIndex: 1, // Lower zIndex than the dropdown
    position: "relative", // Ensure proper stacking context
    height: "100%", // Fill the gridNoteItem height
    display: "flex",
    flexDirection: "column",
    borderWidth: 1,
    borderColor: "#F1F5F9",
  },
  // Preview containers for notes
  previewImageContainer: {
    height: 100,
    backgroundColor: "#F9FAFB",
    borderRadius: 10,
    marginBottom: 12,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  previewDocumentContainer: {
    height: 100,
    backgroundColor: "#F9FAFB",
    borderRadius: 10,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
    marginBottom: 12,
    overflow: "hidden",
    padding: 12,
    justifyContent: "center",
  },
  // Preview for actual note content
  previewContentContainer: {
    height: 100,
    backgroundColor: "#F9FAFB",
    borderRadius: 10,
    marginBottom: 12,
    overflow: "hidden",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.8,
    shadowRadius: 5,
    padding: 12,
  },
  contentPreviewBaseStyle: {
    fontSize: 12,
    lineHeight: 16,
    color: "#333",
    padding: 0,
    margin: 0,
  },
  // Preview for plain text
  previewTextContainer: {
    height: 100,
    backgroundColor: "#F9FAFB",
    borderRadius: 10,
    marginBottom: 12,
    overflow: "hidden",
    padding: 12,
    justifyContent: "center",
  },
  previewTextContent: {
    fontSize: 12,
    lineHeight: 16,
    color: "#333",
    fontFamily: "Inter-Regular",
  },
  // Drawing preview elements
  drawingPreview: {
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    height: "100%",
  },
  drawingIcon: {
    marginBottom: 8,
    opacity: 0.7,
  },
  drawingPatterns: {
    width: "90%",
    alignItems: "flex-start",
  },
  drawingLine: {
    height: 3,
    backgroundColor: "#8B5CF6",
    marginVertical: 2,
    borderRadius: 2,
  },
  // Document preview elements
  documentLines: {
    width: "100%",
  },
  documentLine: {
    height: 6,
    backgroundColor: "#E2E8F0",
    marginVertical: 4,
    borderRadius: 3,
  },
  documentTitleLine: {
    height: 8,
    backgroundColor: "#CBD5E1",
    marginBottom: 10,
    width: "60%",
  },
  noteHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  noteFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: "auto", // Push to bottom
    paddingTop: 8,
    flexWrap: "wrap",
  },
  noteTitleContainer: {
    flexDirection: "row",
    flex: 1,
    alignItems: "center",
  },
  gridNoteTypeIcon: {
    width: 24,
    height: 24,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 8,
  },
  noteTitleSection: {
    flex: 1,
    justifyContent: "center",
  },
  gridNoteTitle: {
    fontSize: 14,
    fontFamily: "Inter-Medium",
    color: "#1E293B",
    lineHeight: 18,
  },
  gridNoteOptionsButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
  },
  gridNoteOptionsDropdown: {
    position: "absolute",
    right: 0,
    top: 40,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 12,
    zIndex: 9999999,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "rgba(148, 163, 184, 0.1)",
    minWidth: 180,
  },
  noteOptionItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#F8FAFC",
  },
  noteOptionText: {
    fontSize: 15,
    fontFamily: "Inter-Medium",
    color: "#334155",
    marginLeft: 12,
    fontWeight: "500",
  },

  notePreview: {
    fontSize: 14,
    fontFamily: "Inter-Regular",
    color: "#374151",
    lineHeight: 20,
    marginBottom: 12,
  },
  noteDate: {
    fontSize: 12,
    fontFamily: "Inter-Regular",
    color: "#9CA3AF",
    marginRight: 8,
  },
  gridNoteDate: {
    fontSize: 11,
  },
  gridNotePreview: {
    fontSize: 12,
    lineHeight: 16,
    marginBottom: 8,
  },
  attachmentsContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  attachmentCount: {
    fontSize: 12,
    fontFamily: "Inter-Regular",
    color: "#9CA3AF",
    marginLeft: 4,
  },
  tagsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
  },
  tag: {
    backgroundColor: "#EEF2FF",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    marginRight: 8,
    marginBottom: 4,
  },
  tagText: {
    fontSize: 11,
    fontFamily: "Inter-Medium",
    color: "#6366F1",
  },
  moreTagsIndicator: {
    backgroundColor: "#F1F5F9",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  moreTagsText: {
    fontSize: 10,
    fontFamily: "Inter-Medium",
    color: "#64748B",
  },
  noteSeparator: {
    height: 8,
  },
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingVertical: 40,
    width: "100%",
  },
  emptyStateIconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "#F8FAFC",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
    borderWidth: 2,
    borderColor: "#E2E8F0",
    borderStyle: "dashed",
    position: "relative",
  },
  emptyStateTitle: {
    fontSize: 18,
    fontFamily: "Inter-SemiBold",
    color: "#374151",
    marginBottom: 6,
    textAlign: "center",
  },
  emptyStateSubtitle: {
    fontSize: 14,
    fontFamily: "Inter-Regular",
    color: "#64748B",
    marginBottom: 24,
    textAlign: "center",
    lineHeight: 20,
    maxWidth: "90%",
  },
  emptyStateButtons: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 8,
    width: "100%",
  },
  emptyStateNoteButton: {
    backgroundColor: "#6A009C",
    flexDirection: "row",
    alignItems: "center",
    margin: 8,
    minWidth: 120,
    flexGrow: 1,
    maxWidth: 240,
  },
  emptyStateDrawingButton: {
    backgroundColor: "#8B5CF6",
    flexDirection: "row",
    alignItems: "center",
    margin: 8,
    minWidth: 120,
    flexGrow: 1,
    maxWidth: 240,
  },
  emptyStateImportButton: {
    backgroundColor: "#F59E0B",
    flexDirection: "row",
    alignItems: "center",
    margin: 8,
    minWidth: 120,
    flexGrow: 1,
    maxWidth: 240,
  },

  fabButton: {
    position: "absolute",
    right: 24,
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#8B5CF6",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#8B5CF6",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.3,
    shadowRadius: 24,
    elevation: 15,
    zIndex: 1000,
  },
  textFab: {
    backgroundColor: "#9C27B0",
  },
  drawingFab: {
    backgroundColor: "#2563EB",
    right: 24,
  },
  modalContainer: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0, 0, 0, 0.6)",
  },
  
  drawingModalOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "transparent",
  },
  
  drawingModalViewContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    maxHeight: "90%",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingBottom: Platform.OS === "ios" ? 34 : 24,
    minHeight: Dimensions.get("window").height * 0.5,
    maxHeight: Dimensions.get("window").height * 0.9,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.25,
    shadowRadius: 25,
    elevation: 25,
    paddingTop: 8,
    overflow: "hidden",
  },

  // Statistics modal styles
  statsModalContent: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 20,
    margin: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 20,
    alignItems: "stretch",
  },
  statsModalTitle: {
    fontSize: 20,
    fontFamily: "Inter-Bold",
    color: "#1F2937",
    marginBottom: 12,
    textAlign: "center",
  },
  statsHeader: {
    alignItems: "center",
    marginBottom: 12,
  },
  statsSubtitle: {
    fontSize: 13,
    color: "#6B7280",
    fontFamily: "Inter-Regular",
    textAlign: "center",
    marginTop: 4,
  },
  statsGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    marginTop: 8,
  },
  statCard: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    paddingVertical: 18,
    paddingHorizontal: 12,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 6,
  },
  statIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
  },
  statsValueLarge: {
    fontSize: 28,
    fontFamily: "Inter-Bold",
    color: "#0F172A",
    marginBottom: 4,
  },
  statLabelSmall: {
    fontSize: 12,
    color: "#9CA3AF",
    fontFamily: "Inter-Regular",
  },
  statsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  statsLabel: {
    fontSize: 16,
    color: "#4B5563",
    fontFamily: "Inter-Regular",
  },
  statsValue: {
    fontSize: 16,
    color: "#0F172A",
    fontFamily: "Inter-SemiBold",
  },
  statsCloseButton: {
    marginTop: 16,
    backgroundColor: "#8B5CF6",
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: "center",
  },
  statsCloseButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontFamily: "Inter-Medium",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
    position: "relative",
  },
  modalTitleContainer: {
    flex: 1,
    alignItems: "center",
  },
  modalTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  modalTitle: {
    fontSize: 20,
    fontFamily: "Inter-Bold",
    color: "#1E293B",
    letterSpacing: -0.3,
    textAlign: "center",
  },
  selectedCountBadge: {
    backgroundColor: "#6A009C",
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginLeft: 8,
    minWidth: 24,
    alignItems: "center",
  },
  selectedCountText: {
    fontSize: 12,
    fontFamily: "Inter-Bold",
    color: "#FFFFFF",
  },
  modalSubtitle: {
    fontSize: 14,
    fontFamily: "Inter-Medium",
    color: "#64748B",
    textAlign: "center",
    lineHeight: 18,
  },
  modalCloseButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#F8FAFC",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#64748B",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  modalBody: {
    flex: 1,
    paddingTop: 8,
    paddingBottom: 16,
  },
  modalFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 8,
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
    backgroundColor: "#FAFBFC",
  },
  inputGroup: {
    marginBottom: 28,
  },
  singleRowTitleContainer: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    gap: 8, // or use marginRight on label if gap is not supported
  },
  inputLabel: {
    minWidth: 100, // or your preferred width
    color: "#374151",
    fontFamily: "Inter-Regular",
    fontSize: 16,
    marginRight: 8,
  },
  templateScrollRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  textInputSingleRow: {
    flex: 1,
    minHeight: 40,
    maxHeight: 40,
    paddingHorizontal: 12,
    backgroundColor: "#F3F4F6",
    borderRadius: 8,
    color: "#111827",
    fontSize: 16,
  },
  textInput: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 16,
    fontSize: 16,
    fontFamily: "Inter-Regular",
    color: "#1F2937",
    borderWidth: 2,
    borderColor: "#E5E7EB",
    shadowColor: "#64748B",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  colorSelector: {
    marginTop: 12,
    paddingBottom: 8,
  },
  colorOption: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 14,
    borderWidth: 2,
    borderColor: "rgba(255, 255, 255, 0.3)",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  selectedColorOption: {
    borderWidth: 3,
    borderColor: "#FFFFFF",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
    transform: [{ scale: 1.1 }],
  },
  cancelButton: {
    backgroundColor: "#F8FAFC",
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: "#64748B",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  cancelButtonText: {
    fontSize: 14,
    fontFamily: "Inter-Medium",
    color: "#64748B",
    letterSpacing: -0.1,
  },
  createButton: {
    backgroundColor: "#8B5CF6",
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: "center",
    shadowColor: "#8B5CF6",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  createButtonText: {
    fontSize: 14,
    fontFamily: "Inter-Medium",
    color: "#FFFFFF",
    letterSpacing: -0.1,
  },
  selectionModeHeader: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    paddingHorizontal: 20,
    paddingVertical: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    zIndex: 1000,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  selectionModeInfo: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 50,
  },
  selectionCountBadge: {
    backgroundColor: "#6366F1",
    borderRadius: 12,
    minWidth: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  selectionCountText: {
    fontSize: 12,
    fontFamily: "Inter-Bold",
    color: "#FFFFFF",
  },
  selectionModeContent: {
    padding: 20,
  },
  selectionModeFooter: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
  },
  selectionModeText: {
    fontSize: 15,
    fontFamily: "Inter-Medium",
    color: "#374151",
  },
  selectionModeIcon: {
    width: 24,
    height: 24,
  },
  selectionModeCloseButton: {
    width: 24,
    height: 24,
  },

  selectionModeActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingTop: 50,
  },
  selectionModeButton: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  folderButton: {
    backgroundColor: "#10B981",
  },
  deleteButton: {
    backgroundColor: "#EF4444",
  },
  selectioncancelButton: {
    backgroundColor: "#F1F5F9",
    borderWidth: 1,
    borderColor: "#CBD5E1",
  },

  // Additional styles for folder selection modal
  folderItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginBottom: 8,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  unorganizedFolderItem: {
    backgroundColor: "#F8FAFC",
    borderColor: "#CBD5E1",
  },
  selectedFolderItem: {
    backgroundColor: "#6A009C",
    borderColor: "#6A009C",
  },
  folderArrow: {
    marginLeft: "auto",
    opacity: 0.6,
  },
  modalFolderName: {
    flex: 1,
    fontSize: 16,
    fontFamily: "Inter-Medium",
    color: "#1F2937",
    marginLeft: 12,
  },
  modalFolderIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
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
    elevation: 9999, // Extremely high elevation for Android
    zIndex: 9999999, // Extremely high z-index for iOS
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

  cancelOption: {
    backgroundColor: "#F3F4F6",
    marginTop: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },

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

  // Add Options Menu Styles - Enhanced
  addOptionsContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 5000,
    pointerEvents: "box-none",
  },

  addOptionsOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "transparent",
  },

  addOptionsMenu: {
    position: "absolute",
    bottom: 180,
    right: 28,
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 15,
    elevation: 12,
    paddingVertical: 12,
    paddingHorizontal: 6,
    width: 180,
    zIndex: 5000,
  },

  addOptionsPointer: {
    position: "absolute",
    bottom: -12,
    right: 24,
    width: 0,
    height: 0,
    borderLeftWidth: 12,
    borderRightWidth: 12,
    borderTopWidth: 12,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderTopColor: "#FFFFFF",
    zIndex: 5001,
  },

  addOptionButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderRadius: 12,
    marginVertical: 2,
    marginHorizontal: 6,
  },

  drawingOptionButton: {
    backgroundColor: "#F0F4FF",
  },

  textOptionButton: {
    backgroundColor: "#F0F9FF",
  },

  importOptionButton: {
    backgroundColor: "#FFFBEB",
  },

  addOptionText: {
    fontSize: 15,
    fontFamily: "Inter-Medium",
    marginLeft: 14,
    flex: 1,
  },

  fabButtonRotated: {
    transform: [{ rotate: "45deg" }],
  },

  // Drawing Setup Modal Styles - Enhanced
  drawingModalHeader: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
    alignItems: "center",
    position: "relative",
    backgroundColor: "#FCFCFC",
  },

  drawingModalHandle: {
    width: 40,
    height: 5,
    backgroundColor: "#E2E8F0",
    borderRadius: 3,
    marginBottom: 16,
    alignSelf: "center",
  },

  drawingModalTitle: {
    fontSize: 24,
    fontFamily: "Inter-Bold",
    color: "#1F2937",
    marginBottom: 20,
    textAlign: "center",
  },

  drawingModalActionButtons: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
    backgroundColor: "#FCFCFC",
    marginTop: 'auto',
  },

  drawingModalCancelButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },

  drawingModalCancelText: {
    fontSize: 16,
    fontFamily: "Inter-Medium",
    color: "#6B7280",
    marginLeft: 6,
  },

  drawingModalCreateButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#6366F1",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
    shadowColor: "#6366F1",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },

  drawingModalCreateText: {
    fontSize: 16,
    fontFamily: "Inter-SemiBold",
    color: "#FFFFFF",
    marginLeft: 8,
  },

  drawingModalDescription: {
    fontSize: 14,
    fontFamily: "Inter-Regular",
    color: "#64748B",
    marginBottom: 16,
    paddingHorizontal: 4,
    lineHeight: 20,
  },

  drawingModalInputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F9FAFB",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    shadowColor: "#64748B",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
    paddingHorizontal: 16,
    marginTop: 8,
  },

  drawingModalInputIcon: {
    marginRight: 12,
  },

  drawingModalSection: {
    marginBottom: 32,
    paddingHorizontal: 20,
  },

  drawingModalSectionLabel: {
    fontSize: 20,
    fontFamily: "Inter-Bold",
    color: "#1F2937",
    marginBottom: 12,
    paddingLeft: 4,
    letterSpacing: -0.2,
  },

  drawingModalSubLabel: {
    fontSize: 16,
    fontFamily: "Inter-Medium",
    color: "#374151",
    marginBottom: 14,
    paddingLeft: 4,
  },

  drawingModalTextInput: {
    flex: 1,
    paddingVertical: 16,
    fontSize: 16,
    fontFamily: "Inter-Regular",
    color: "#1F2937",
  },

  orientationSubSection: {
    marginTop: 24,
  },

  sizeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 14,
    marginBottom: 18,
  },

  sizeOption: {
    flex: 1,
    minWidth: "45%",
    backgroundColor: "#F8FAFC",
    borderRadius: 16,
    padding: 18,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#E5E7EB",
    shadowColor: "#64748B",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },

  selectedSizeOption: {
    backgroundColor: "#8B5CF6",
    borderColor: "#8B5CF6",
    shadowColor: "#8B5CF6",
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },

  sizeOptionName: {
    fontSize: 15,
    fontFamily: "Inter-Medium",
    color: "#374151",
    marginBottom: 6,
  },

  sizeOptionDimensions: {
    fontSize: 12,
    fontFamily: "Inter-Regular",
    color: "#6B7280",
  },

  selectedSizeOptionText: {
    color: "#FFFFFF",
  },

  orientationContainer: {
    marginTop: 20,
  },

  orientationLabel: {
    fontSize: 14,
    fontFamily: "Inter-Regular",
    color: "#374151",
    marginBottom: 10,
  },

  orientationToggle: {
    flexDirection: "row",
    backgroundColor: "#F1F5F9",
    borderRadius: 16,
    padding: 6,
    shadowColor: "#64748B",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },

  orientationButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 12,
    gap: 8,
  },

  selectedOrientationButton: {
    backgroundColor: "#8B5CF6",
    shadowColor: "#8B5CF6",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },

  orientationButtonText: {
    fontSize: 14,
    fontFamily: "Inter-Medium",
    color: "#6B7280",
  },

  emptyDrawingText: {
    fontSize: 12,
    fontFamily: "Inter-Regular",
    color: "#9CA3AF",
    textAlign: "center",
    fontStyle: "italic",
  },

  emptyDrawingContainer: {
    height: 120,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#FAFAFA",
    borderRadius: 12,
  },

  selectedOrientationButtonText: {
    color: "#FFFFFF",
  },

  templateGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-start",
    gap: 12,
  },

  templateOption: {
    marginRight: 16,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: "#E5E7EB",
    padding: 14,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    width: 130,
    shadowColor: "#64748B",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  selectedTemplateOption: {
    borderColor: "#8B5CF6",
    backgroundColor: "#F5F3FF",
    shadowColor: "#8B5CF6",
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 6,
    transform: [{ scale: 1.05 }],
  },
  templatePreviewWrapper: {
    width: 100,
    height: 60,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    marginBottom: 12,
    shadowColor: "#64748B",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  templateIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#E5E7EB",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },

  selectedTemplateIcon: {
    backgroundColor: "#FFFFFF",
  },

  templateName: {
    fontSize: 12,
    color: "#374151",
    textAlign: "center",
    marginTop: 4,
    fontFamily: "Inter-Regular",
    width: 100,
  },
  selectedTemplateName: {
    color: "#6A009C",
    fontFamily: "Inter-Medium",
  },
  drawingNoteItem: {
    // Removed border styling to unify note appearance
  },

  drawingNoteContent: {
    // Removed special background color for unified look
  },

  drawingNoteTitle: {
    // Removed special color styling for unified appearance
  },

  drawingPreviewHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    marginBottom: 8,
  },

  drawingBadge: {
    backgroundColor: "#8B5CF6",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },

  drawingBadgeText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontFamily: "Inter-Medium",
  },

  // Document preview styles
  documentPreview: {
    flex: 1,
    backgroundColor: "#F8F9FA",
    borderRadius: 12,
    padding: 16,
    minHeight: 140,
    justifyContent: "space-between",
  },

  documentPreviewHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },

  documentIcon: {
    marginBottom: 4,
  },

  documentBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },

  documentBadgeText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontFamily: "Inter-Medium",
  },

  documentInfo: {
    flex: 1,
    justifyContent: "center",
  },

  documentTitle: {
    fontSize: 14,
    fontFamily: "Inter-Bold",
    color: "#1F2937",
    marginBottom: 4,
  },

  documentDataStatus: {
    fontSize: 11,
    fontFamily: "Inter-Regular",
    color: "#6B7280",
    marginBottom: 12,
  },

  viewDocumentButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#6366F1",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    gap: 6,
  },

  viewDocumentButtonText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontFamily: "Inter-Medium",
  },

  noteTypeIndicator: {
    fontSize: 10,
    fontFamily: "Inter-Regular",
    color: "#9CA3AF",
    marginTop: 2,
  },

  drawingTypeIndicator: {
    color: "#8B5CF6",
  },

  drawingDataStatus: {
    fontSize: 9,
    fontFamily: "Inter-Regular",
    color: "#8B5CF6",
    textAlign: "center",
    marginTop: 4,
    opacity: 0.7,
  },

  // More Vert Menu styles (similar to task management)
  moreVertOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    justifyContent: "flex-start",
    alignItems: "flex-end",
    paddingTop: Platform.OS === "ios" ? 120 : 100,
    paddingRight: 20,
  },

  moreVertMenuContainer: {
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

  moreVertMenuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#F8FAFC",
  },

  moreVertMenuItemLast: {
    borderBottomWidth: 0,
  },

  moreVertMenuText: {
    fontSize: 15,
    fontFamily: "Inter-Medium",
    color: "#334155",
    marginLeft: 12,
    fontWeight: "500",
  },
  // Compact header for drawing modal with inline actions
  drawingModalHeaderCompact: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
    alignItems: "center",
    position: "relative",
    flexDirection: "column",
    justifyContent: "center",
  },
  headerThreePartLayout: {
    flexDirection: "row",
    width: "100%",
    alignItems: "center",
    paddingTop: 8,
    paddingBottom: 4,
  },
  headerLeftSection: {
    flex: 1,
    alignItems: "flex-start",
    justifyContent: "center",
  },
  headerCenterSection: {
    flex: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  headerRightSection: {
    flex: 1,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  headerIconButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
  },
  headerPrimaryButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: "#8B5CF6",
    shadowColor: "#8B5CF6",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
    marginLeft: 8,
  },
  headerPrimaryButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontFamily: "Inter-SemiBold",
    marginLeft: 8,
  },
  drawingModalTitleCompact: {
    fontSize: 18,
    fontFamily: "Inter-Bold",
    color: "#1F2937",
    marginBottom: 0,
    textAlign: "center",
    width: "100%",
  },
  drawingModalHandleCompact: {
    marginBottom: 8,
  },
});