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

    console.log("Calculated folder counts:", counts); // ✅ Add logging to debug

    setFolderCounts(counts);
  }, [notes, folders]);

  useEffect(() => {
    calculateFolderCounts();
  }, [notes, folders, calculateFolderCounts]);

  useEffect(() => {
    fetchNotes();
    fetchFolders();

    const refreshInterval = setInterval(() => {
      if (AppState.currentState === "active") {
      }
    }, 30000);

    return () => {
      clearInterval(refreshInterval);
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

      return () => {
        // Clean up if needed when screen goes out of focus
      };
    }, [])
  );

  const fetchFolders = async () => {
    // Implement fetch throttling - don't fetch if it's been less than 10 seconds
    const now = Date.now();
    if (now - lastFolderFetch < 10000 && folders.length > 0) {
      return; // Skip this fetch if we already have folders and it's too soon
    }

    setLastFolderFetch(now);

    try {
      const token = await AsyncStorage.getItem("authToken");
      if (!token) {
        navigation.navigate("Login");
        return;
      }

      const response = await fetch(`${API_URL}${API_ENDPOINTS.NOTE_FOLDERS}`, {
        method: "GET",
        headers: {
          Authorization: `Token ${token}`,
          "Content-Type": "application/json",
        },
        // Improve caching behavior
        cache: "default",
      });

      if (!response.ok) {
        throw new Error("Failed to fetch folders");
      }

      const data = await response.json();

      // Transform the data to match your Folder interface
      const fetchedFolders: Folder[] = data.map((folder: any) => ({
        id: folder.id.toString(),
        name: folder.name,
        color: folder.color || "#667EEA", // Default color if not provided
        icon: "folder" as keyof typeof MaterialIcons.glyphMap, // Default icon
        notes_count: folder.notes_count || 0,
        description: folder.description,
        created_at: folder.created_at,
        updated_at: folder.updated_at,
      }));

      // Only update state if folders have actually changed
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
      if (!showLoading && now - lastNoteFetch < 5000) {
        return; // Skip this fetch
      }

      if (showLoading) {
        setIsLoading(true);
      }
      setError(null);
      setLastNoteFetch(now);

      try {
        const token = await AsyncStorage.getItem("authToken");
        if (!token) {
          // Navigate to login if no token
          navigation.navigate("Login");
          return;
        }

        // Add pagination parameters to reduce data load
        let endpoint = `${API_URL}${API_ENDPOINTS.NOTES}?limit=50`;

        // Add filter for selected folder if one is chosen
        if (selectedFilterFolder) {
          endpoint += `&folder=${selectedFilterFolder}`;
        }

        const response = await fetch(endpoint, {
          method: "GET",
          headers: {
            Authorization: `Token ${token}`,
            "Content-Type": "application/json",
          },
          // Improve caching with cache control headers
          cache: "default",
        });

        if (!response.ok) {
          throw new Error("Failed to fetch notes");
        }

        const data = await response.json();

        // Transform the data to match your Note interface with optimized processing
        const fetchedNotes: Note[] = data.map((note: any) => ({
          id: note.id.toString(),
          title: note.title || "",
          content: note.content || "",
          formatted_content: note.formatted_content || "",
          folder: note.folder_name || null, // Use folder_name from backend
          folderId: note.folder ? note.folder.toString() : null, // Map the folder ID
          createdAt: new Date(note.created_at),
          updatedAt: new Date(note.updated_at),
          type: note.type || "text",
          is_archived: note.is_archived || false,
          tags: note.tags || [],
          template: note.template || null,
          drawing_data: note.drawing_data || null,
          document_file: note.document_file || null, // Add document file URL
          document_annotations: note.document_annotations || null, // Add document annotations
        }));

        // Check if notes have changed before updating state - only compare relevant fields
        const currentNotesJson = JSON.stringify(
          notes.map((n) => ({ id: n.id, updatedAt: n.updatedAt }))
        );
        const fetchedNotesJson = JSON.stringify(
          fetchedNotes.map((n) => ({ id: n.id, updatedAt: n.updatedAt }))
        );
        const hasChanges = currentNotesJson !== fetchedNotesJson;

        if (hasChanges) {
          setNotes(fetchedNotes);
        }
      } catch (error) {
        console.error("Error fetching notes:", error);
        setError("Failed to load notes. Please try again.");
      } finally {
        if (showLoading) {
          setIsLoading(false);
        }
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
            createdAt: new Date(newNote.created_at),
            updatedAt: new Date(newNote.updated_at),
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
                const token = await AsyncStorage.getItem("authToken");
                if (!token) {
                  navigation.navigate("Login");
                  return;
                }
                const response = await fetch(
                  `${API_URL}${API_ENDPOINTS.NOTES}${noteId}/`,
                  {
                    method: "DELETE",
                    headers: {
                      Authorization: `Token ${token}`,
                    },
                  }
                );

                if (!response.ok) {
                  throw new Error("Failed to delete note");
                }

                // If successful, update local state
                setNotes((prev) => prev.filter((note) => note.id !== noteId));

                // Invalidate folder cache to update counts in home screen
                await folderCacheUtils.invalidateCache();

                // Show success toast
                showSuccessToast("Note deleted successfully");
              } catch (error) {
                console.error("Error deleting note:", error);
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

  const handleNotePress = useCallback(
    async (note: Note) => {
      // Close any open options when navigating
      setActiveNoteOptions(null);
      setDropdownPosition(null);

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
              console.log(
                "PDF is remote URL, downloading to local storage:",
                documentUrl
              );
              finalDocumentUri = await getLocalPDFPath(documentUrl);
              console.log("PDF downloaded to local path:", finalDocumentUri);
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

          console.log("Parsed drawing data successfully:", {
            originalType: typeof note.drawing_data,
            isString: typeof note.drawing_data === "string",
            parsedStrokesCount: strokesArray.length,
            firstStrokeSample: strokesArray[0],
          });
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

        // Prepare drawing data for editor - ensure proper format for importDrawing
        const drawingData = {
          id: note.id,
          title: note.title || "Untitled Drawing",
          strokes: strokesArray,
          template: parsedDrawingData?.template || note.template || "blank",
          drawing_data: parsedDrawingData,
          createdAt: note.createdAt?.toISOString(),
          updatedAt: note.updatedAt?.toISOString(),
          // Also include the strokes at root level for importDrawing compatibility
          ...parsedDrawingData,
        };

        console.log("Opening drawing note with data:", {
          noteId: note.id,
          title: drawingData.title,
          strokeCount: strokesArray.length,
          hasValidStrokes: strokesArray.length > 0,
          template: drawingData.template,
        });

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

        console.log("Opening text note with data:", {
          noteId: note.id,
          title: noteForEditor.title,
          hasContent: !!noteForEditor.content,
          hasFormattedContent: !!noteForEditor.formatted_content,
        });

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
    setShowDocumentPreviewModal(true);
  };

  // Confirm and upload the selected document as a note
  const handleConfirmDocumentImport = async (documentInfo: any) => {
    try {
      const token = await AsyncStorage.getItem("authToken");
      if (!token) {
        navigation.navigate("Login");
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
          return;
        }

        showSuccessToast("Document imported successfully!");
        fetchNotes(true);
        await folderCacheUtils.invalidateCache();

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
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to import document");
      }
    } catch (error) {
      console.error("Error importing document:", error);
      showErrorToast(
        typeof error === "object" && error !== null && "message" in error
          ? (error as { message?: string }).message ||
              "Failed to import document. Please try again."
          : "Failed to import document. Please try again."
      );
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
              const token = await AsyncStorage.getItem("authToken");
              if (!token) {
                navigation.navigate("Login");
                return;
              }

              // Create an array of promises for each delete operation
              const deletePromises = selectedNotes.map((noteId) =>
                fetch(`${API_URL}${API_ENDPOINTS.NOTES}${noteId}/`, {
                  method: "DELETE",
                  headers: {
                    Authorization: `Token ${token}`,
                  },
                })
              );

              // Wait for all delete operations to complete
              const results = await Promise.all(deletePromises);

              // Check if all operations were successful
              const allSuccessful = results.every((response) => response.ok);

              if (allSuccessful) {
                // Update local state by removing deleted notes
                setNotes((prevNotes) =>
                  prevNotes.filter((note) => !selectedNotes.includes(note.id))
                );

                // Invalidate folder cache to update counts in home screen
                await folderCacheUtils.invalidateCache();

                // Exit select mode and clear selection
                setSelectedNotes([]);
                setIsSelectMode(false);

                // Show success message
                showSuccessToast(
                  `${selectedNotes.length} ${
                    selectedNotes.length === 1 ? "note" : "notes"
                  } deleted successfully`
                );
              } else {
                throw new Error("Some notes could not be deleted");
              }
            } catch (error) {
              console.error("Error deleting notes:", error);
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
    const token = await AsyncStorage.getItem("authToken");
    if (!token) {
      navigation.navigate("Login");
      return;
    }

    const response = await fetch(
      `${API_URL}${API_ENDPOINTS.NOTE_FOLDERS}${folderId}/`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Token ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: newName }),
      }
    );

    if (!response.ok) {
      throw new Error("Failed to update folder name");
    }

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
    const token = await AsyncStorage.getItem("authToken");
    if (!token) {
      navigation.navigate("Login");
      return;
    }

    const folderData = {
      name: newFolderName.trim(),
      icon: "folder", // Use default folder icon
      color: selectedFolderColor,
    };

    const response = await fetch(`${API_URL}${API_ENDPOINTS.NOTE_FOLDERS}`, {
      method: "POST",
      headers: {
        Authorization: `Token ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(folderData),
    });

    if (!response.ok) {
      throw new Error("Failed to create folder");
    }

    const newFolder = await response.json();

    // Transform to match your Folder interface
    const createdFolder: Folder = {
      id: newFolder.id.toString(),
      name: newFolder.name,
      icon: newFolder.icon as keyof typeof MaterialIcons.glyphMap,
      color: newFolder.color,
    };

    setFolders((prev) => [...prev, createdFolder]);

    // Save the new folder's ID to use for sorting notes
    setSelectedFolder(createdFolder.id);

    // Close the create folder modal and reset state
    closeCreateFolderModal();

    // Show toast notification about successful folder creation
    showSuccessToast(`Folder "${newFolderName}" created successfully`);
  } catch (error) {
    console.error("Error creating folder:", error);
    showErrorToast("Failed to create folder");
    Alert.alert("Error", "Failed to create folder. Please try again.");
  }
};

  // Add new folder delete function
  const handleDeleteFolder = async (folderId: string) => {
    try {
      const token = await AsyncStorage.getItem("authToken");
      if (!token) {
        navigation.navigate("Login");
        return;
      }

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

      const response = await fetch(
        `${API_URL}${API_ENDPOINTS.NOTE_FOLDERS}${folderId}/`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Token ${token}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error("Failed to delete folder");
      }

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
    () =>
      notes.filter((note) => {
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
      }),
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

    return folderFilteredNotes;
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
          // Document preview with enhanced component
          return (
            <View style={styles.previewImageContainer}>
              <TemplatePreview
                note={item}
                width={windowWidth / 2 - 64}
                height={120}
              />

              <TouchableOpacity
                style={styles.viewDocumentButton}
                onPress={async () => {
                  const documentType = item.document_file
                    ?.toLowerCase()
                    .includes(".pdf")
                    ? "PDF"
                    : item.document_file?.toLowerCase().includes(".doc")
                    ? "Word"
                    : "Document";

                  const docType =
                    documentType === "PDF"
                      ? "pdf"
                      : documentType === "Word"
                      ? "word"
                      : "document";

                  const documentUrl =
                    item.document_url || item.document_file || "";
                  let finalDocumentUri = documentUrl;

                  // For PDF files, download to local storage if it's a remote URL
                  if (docType === "pdf" && isRemoteURL(documentUrl)) {
                    try {
                      console.log(
                        "PDF is remote URL, downloading to local storage:",
                        documentUrl
                      );
                      finalDocumentUri = await getLocalPDFPath(documentUrl);
                      console.log(
                        "PDF downloaded to local path:",
                        finalDocumentUri
                      );
                    } catch (error) {
                      console.error(
                        "Failed to download PDF to local storage:",
                        error
                      );
                      // Fall back to original URL - PDFAnnotationViewer will handle the error
                      finalDocumentUri = documentUrl;
                    }
                  }

                  setCurrentDocument({
                    uri: finalDocumentUri,
                    name: item.title || "Untitled Document",
                    noteId: item.id,
                    type: docType,
                  });

                  // Use PDFAnnotationViewer for PDF files, DocumentViewer for others
                  if (docType === "pdf") {
                    setShowPDFViewer(true);
                  } else {
                    setShowDocumentViewer(true);
                  }
                }}
              >
                <MaterialIcons name="visibility" size={16} color="#FFFFFF" />
                <Text style={styles.viewDocumentButtonText}>
                  View Document
                </Text>
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
            // Enhanced visual differentiation for drawing notes
            isDrawing && styles.drawingNoteItem,
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
              isDrawing && styles.drawingNoteContent,
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
                      isDrawing && styles.drawingNoteTitle,
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
                    {isDrawing ? "Drawing" : "Text Note"}
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
                {item.updatedAt.toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })}
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
                        console.log(
                          "Add to/Move to Folder pressed for note:",
                          item.id
                        );
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
                      Alert.alert(
                        "Share Note",
                        "Sharing functionality will be available in a future update."
                      );
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
                      console.log(
                        "Delete Note/Drawing pressed for note:",
                        item.id
                      );
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
            <Text style={styles.modalTitle}>Choose Folder</Text>
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
                selectedFolder === "unorganized" && styles.selectedFolderItem,
              ]}
              onPress={() => {
                // For each selected note, remove from folder
                selectedNotes.forEach((noteId) => {
                  handleRemoveFromFolder(noteId);
                });
                setShowSortNotesModal(false);
              }}
            >
              <View style={[styles.folderIcon, { backgroundColor: "#64748B" }]}>
                <MaterialIcons name="notes" size={20} color="#FFFFFF" />
              </View>
              <Text style={styles.folderName}>Unorganized Notes</Text>
              {selectedFolder === "unorganized" && (
                <MaterialIcons name="check-circle" size={22} color="#6A009C" />
              )}
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
                  setSelectedFolder(folder.id);
                  // Immediately assign selected notes to this folder
                  assignNotesToFolder(folder.id, selectedNotes);
                  setShowSortNotesModal(false);
                }}
              >
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
                  <MaterialIcons name="folder" size={20} color="#FFFFFF" />
                </View>
                <Text style={styles.folderName}>{folder.name}</Text>
                {selectedFolder === folder.id && (
                  <MaterialIcons
                    name="check-circle"
                    size={22}
                    color="#6A009C"
                  />
                )}
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
      transparent={true}
      animationType="slide"
      onRequestClose={closeDrawingSetupModal}
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
          onPress={closeDrawingSetupModal}
        >
          <View style={{ flex: 1 }} />
          <View style={styles.modalContent}>
            {/* Header with Cancel and Create buttons */}
            <View style={styles.modalHeader}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={closeDrawingSetupModal}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle}>Create New Drawing</Text>
              <TouchableOpacity
                style={styles.createButton}
                onPress={handleCreateDrawingWithSetup}
              >
                <Text style={styles.createButtonText}>Create</Text>
              </TouchableOpacity>
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
                <TextInput
                  style={styles.drawingModalTextInput}
                  value={drawingTitle}
                  onChangeText={setDrawingTitle}
                  placeholder="Enter drawing title"
                  placeholderTextColor="#9CA3AF"
                  maxLength={50}
                  returnKeyType="done"
                  numberOfLines={1}
                />
              </View>

              {/* Canvas size and orientation selection removed - using defaults */}

              {/* Templates Section */}
              <View style={styles.drawingModalSection}>
                <Text style={styles.drawingModalSectionLabel}>
                  Choose Template
                </Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.templateScrollRow}
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
        </TouchableOpacity>
      </KeyboardAvoidingView>
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
                if (selectedFolder && selectedNotes.length > 0) {
                  assignNotesToFolder(selectedFolder, selectedNotes);
                } else {
                  if (selectedNotes.length > 0 && folders.length > 0) {
                    setShowSortNotesModal(true);
                  } else if (folders.length === 0) {
                    showWarningToast("Create a folder first");
                  } else {
                    showWarningToast("Select notes first");
                  }
                }
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
                  // Clear all filters
                  setSelectedFilterFolder(null);
                  setSearchQuery("");
                  setSelectedFilter("all");
                }}
              >
                <MaterialIcons name="clear-all" size={20} color="#EF4444" />
                <Text style={styles.moreVertMenuText}>Clear All Filters</Text>
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

              <TouchableOpacity
                style={[styles.moreVertMenuItem, styles.moreVertMenuItemLast]}
                onPress={() => {
                  setShowMoreVertMenu(false);
                  setShowStatsModal(true);
                }}
              >
                <MaterialIcons name="analytics" size={20} color="#64748B" />
                <Text style={styles.moreVertMenuText}>View Statistics</Text>
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
            onClose={() => {
              setShowPDFViewer(false);
              setCurrentDocument(null);
            }}
          />
        </Modal>
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
  modalTitle: {
    fontSize: 22,
    fontFamily: "Inter-Bold",
    color: "#1E293B",
    letterSpacing: -0.3,
    flex: 1,
    textAlign: "center",
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
    paddingHorizontal: 24,
    paddingTop: 8,
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
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginBottom: 8,
  },
  unorganizedFolderItem: {
    backgroundColor: "#F8FAFC",
  },
  selectedFolderItem: {
    backgroundColor: "#6A009C",
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
  drawingModalSection: {
    marginBottom: 36,
  },

  drawingModalSectionLabel: {
    fontSize: 20,
    fontFamily: "Inter-Bold",
    color: "#1F2937",
    marginBottom: 18,
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
    backgroundColor: "#F9FAFB",
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 16,
    fontSize: 16,
    fontFamily: "Inter-Regular",
    color: "#1F2937",
    borderWidth: 2,
    borderColor: "#E5E7EB",
    shadowColor: "#64748B",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
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
    borderColor: "transparent",
    padding: 14,
    backgroundColor: "transparent",
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
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 4,
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
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
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
    borderWidth: 2,
    borderColor: "#E0E7FF",
  },

  drawingNoteContent: {
    backgroundColor: "#FEFBFF",
  },

  drawingNoteTitle: {
    color: "#7C3AED",
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
});