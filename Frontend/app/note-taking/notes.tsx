import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useFocusEffect } from "@react-navigation/native";
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
  ToastAndroid,
  TouchableOpacity,
  View,
  useWindowDimensions,
  TouchableWithoutFeedback,
} from "react-native";
// Add Material Icons import
import { MaterialIcons } from "@expo/vector-icons";
// Note: This will need to be installed via npm install react-native-render-html
import RenderHtml from "react-native-render-html";
import Navbar from "../NavBar";
import { RootStackParamList } from "../navigation/AppNavigator";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { RefreshControl } from "react-native";

const { width } = Dimensions.get("window");

type NotesScreenNavigationProp = NativeStackNavigationProp<RootStackParamList>;

interface NotesScreenProps {
  navigation: NotesScreenNavigationProp;
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
  folder?: string; // This matches the backend response structure
  folderId?: string; // You can keep this for compatibility with existing code
  createdAt: Date;
  updatedAt: Date;
  type: "text" | "image";
  tags?: Array<string | TagObject>;
  linkedTaskId?: string;
  attachments?: Attachment[];
  is_archived?: boolean; // Add this to match backend response
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
  icon: keyof typeof MaterialIcons.glyphMap;
  color: string;
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

const FOLDER_ICONS: (keyof typeof MaterialIcons.glyphMap)[] = [
  "folder",
  "folder-open",
  "folder-shared",
  "folder-special",
  "folder-zip",
  "delete",
  "drive-file-move",
  "create-new-folder",
  "folder-off",
  "person",
  "star",
  "sync",
  "file-upload",
  "file-download",
  "search",
  "settings",
  "add",
  "remove",
  "archive",
  "history",
  "link",
  "note",
  "description",
];

export default function NotesScreen({ navigation }: NotesScreenProps) {
  const [notes, setNotes] = useState<Note[]>(INITIAL_NOTES);
  const [folders, setFolders] = useState<Folder[]>(DUMMY_FOLDERS);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFilter, setSelectedFilter] = useState("all");
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [showCreateFolderModal, setShowCreateFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [selectedFolderIcon, setSelectedFolderIcon] =
    useState<keyof typeof MaterialIcons.glyphMap>("folder");
  const [selectedFolderColor, setSelectedFolderColor] = useState("#667EEA");
  const [showOptionsDropdown, setShowOptionsDropdown] = useState(false);
  const [showSearchBar, setShowSearchBar] = useState(false);
  const [activeNoteOptions, setActiveNoteOptions] = useState<string | null>(
    null
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [selectedNotes, setSelectedNotes] = useState<string[]>([]);
  const [showSortNotesModal, setShowSortNotesModal] = useState(false);
  const [isSelectMode, setIsSelectMode] = useState(false);
  const { width: windowWidth } = useWindowDimensions();
  const [folderCounts, setFolderCounts] = useState<Record<string, number>>({});
  const [currentView, setCurrentView] = useState<"folders" | "notes">(
    "folders"
  );
  const [activeTab, setActiveTab] = useState<"folders" | "allNotes">("folders");
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [activeFolderName, setActiveFolderName] = useState<string>("");
  const [showUnorganizedNotes, setShowUnorganizedNotes] = useState(false);
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editingFolderName, setEditingFolderName] = useState("");
  const [showEditFolderModal, setShowEditFolderModal] = useState(false);
  const [lastFolderFetch, setLastFolderFetch] = useState<number>(0);
  const [lastNoteFetch, setLastNoteFetch] = useState<number>(0);
  const [showFolderSelectionModal, setShowFolderSelectionModal] =
    useState(false);
  const [newNoteFolder, setNewNoteFolder] = useState<string | null>(null);

  // Memoize HTML tag styles to prevent recreation on every render
  const htmlTagStyles = useMemo(
    () => ({
      p: {
        margin: 0,
        padding: 0,
        color: "#1E293B",
        fontSize: viewMode === "grid" ? 13 : 15,
        lineHeight: viewMode === "grid" ? 18 : 22,
        fontFamily: "Inter-Regular",
      },
      body: { margin: 0, padding: 0 },
      li: {
        fontSize: viewMode === "grid" ? 13 : 15,
        lineHeight: viewMode === "grid" ? 18 : 22,
        color: "#1E293B",
        fontFamily: "Inter-Regular",
      },
      h1: {
        fontSize: viewMode === "grid" ? 15 : 17,
        fontWeight: 700 as any, // Cast to avoid type error
        color: "#0F172A",
        marginVertical: 2,
        fontFamily: "Inter-Bold",
      },
      h2: {
        fontSize: viewMode === "grid" ? 14 : 16,
        fontWeight: 700 as any, // Cast to avoid type error
        color: "#0F172A",
        marginVertical: 2,
        fontFamily: "Inter-Bold",
      },
      h3: {
        fontSize: viewMode === "grid" ? 13 : 15,
        fontWeight: 700 as any, // Cast to avoid type error
        color: "#0F172A",
        marginVertical: 2,
        fontFamily: "Inter-Bold",
      },
      a: {
        color: "#6A009C",
        textDecorationLine: "underline" as "underline",
        fontWeight: 500 as any, // Cast to avoid type error
      },
      strong: {
        fontWeight: 700 as any, // Cast to avoid type error
        color: "#0F172A",
      },
      em: {
        fontStyle: "italic" as "italic", // Explicitly cast to the literal type
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
    [viewMode]
  ); // Only recreate when viewMode changes

  // Optimized API handler with improved error handling and caching
  const api = useMemo(() => {
    const API_URL = "http://10.0.2.2:8000";

    return {
      async get(endpoint: string) {
        try {
          const token = await AsyncStorage.getItem("authToken");
          if (!token) {
            navigation.navigate("Login");
            return { error: "No auth token" };
          }

          const controller = new AbortController();
          // Set timeout to avoid hanging requests
          const timeoutId = setTimeout(() => controller.abort(), 10000);

          const response = await fetch(`${API_URL}${endpoint}`, {
            method: "GET",
            headers: {
              Authorization: `Token ${token}`,
              "Content-Type": "application/json",
            },
            signal: controller.signal,
            cache: "default",
          });

          clearTimeout(timeoutId);

          if (!response.ok) {
            return {
              error: `Error ${response.status}: ${response.statusText}`,
            };
          }

          const data = await response.json();
          return { data };
        } catch (err) {
          const error = err as Error;
          return {
            error:
              error.name === "AbortError" ? "Request timed out" : error.message,
          };
        }
      },
    };
  }, [navigation]);

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

    // Count notes for each folder
    notes.forEach((note) => {
      if (note.folderId && counts[note.folderId] !== undefined) {
        counts[note.folderId]++;
      }
    });

    setFolderCounts(counts);
  }, [notes, folders]);

  useEffect(() => {
    calculateFolderCounts();
  }, [notes, folders, calculateFolderCounts]);

  // Then update the folder card rendering to use the actual count
  {
    folders.map((folder) => (
      <TouchableOpacity
        key={folder.id}
        style={styles.folderCard}
        activeOpacity={0.8}
      >
        <View style={[styles.folderIcon, { backgroundColor: folder.color }]}>
          <MaterialIcons name={folder.icon} size={24} color="#FFFFFF" />
        </View>
        <Text style={styles.folderName}>{folder.name}</Text>
        <Text style={styles.folderCount}>
          <Text>{folderCounts[folder.id] || 0}</Text> <Text>notes</Text>{" "}
          {/* Display actual count instead of random */}
        </Text>
      </TouchableOpacity>
    ));
  }

  // Set up auto-refresh for real-time editing with improved performance
  useEffect(() => {
    // Initial fetch
    fetchNotes();
    fetchFolders();

    // Set up an interval to refresh notes less frequently (30 seconds instead of 10)
    // This reduces network load while still keeping data reasonably fresh
    const refreshInterval = setInterval(() => {
      // Only fetch if the app is in the foreground using AppState
      if (AppState.currentState === "active") {
        fetchNotes(false); // Pass false to indicate this is a background refresh
      }
    }, 30000);

    return () => {
      clearInterval(refreshInterval); // Clean up interval on unmount
    };
  }, []);

  // Handle tab changes - fetch all notes when switching to "All Notes" tab
  useEffect(() => {
    if (currentView === "folders" && activeTab === "allNotes") {
      fetchNotes(false); // Fetch all notes without showing loading spinner
    }
  }, [activeTab, currentView]);

  // Add useFocusEffect to refresh notes when screen comes into focus (returning from editor)
  useFocusEffect(
    useCallback(() => {
      // Show a toast when returning from editor
      if (Platform.OS === "android") {
        ToastAndroid.show("Notes refreshed", ToastAndroid.SHORT);
      }

      // Force refresh notes when returning from editor (use true to show loading spinner)
      fetchNotes(true);
      fetchFolders();

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

      const API_URL = "http://10.0.2.2:8000";
      const response = await fetch(`${API_URL}/note_taking/folders/`, {
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
        icon: folder.icon as keyof typeof MaterialIcons.glyphMap,
        color: folder.color,
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
      // Optionally show an error message
    }
  };

  // Helper function to show toast notifications
  const showToast = (message: string) => {
    if (Platform.OS === "android") {
      ToastAndroid.show(message, ToastAndroid.SHORT);
    }
    // For iOS, you could implement a custom toast component
  };

  // Last fetch timestamp to implement throttling
  const fetchNotes = async (showLoading = true) => {
    // Implement fetch throttling - don't fetch if it's been less than 5 seconds since the last fetch
    // unless it's an explicit user-requested refresh (showLoading = true)
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

      const API_URL = "http://10.0.2.2:8000"; // For Android emulator

      // Add pagination parameters to reduce data load
      let endpoint = `${API_URL}/note_taking/notes/?limit=50`;

      // Only add filters if not fetching all notes for the "All Notes" tab
      if (currentView === "folders" && activeTab === "allNotes") {
        // For "All Notes" tab, fetch all notes without filters
        endpoint = `${API_URL}/note_taking/notes/`;
      } else {
        // Add filter for current folder if in folder view
        if (currentView === "notes" && activeFolderId) {
          endpoint += `&folder=${activeFolderId}`;
        } else if (showUnorganizedNotes) {
          endpoint += `&unorganized=true`;
        }
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
        folderId: note.folder || null, // Map the folder field from backend
        createdAt: new Date(note.created_at),
        updatedAt: new Date(note.updated_at),
        type: note.type || "text",
        is_archived: note.is_archived || false,
        tags: note.tags || [],
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

        // Only show toast for background refreshes when there are actual changes
        if (!showLoading && hasChanges) {
          showToast(
            currentView === "folders"
              ? "Folders and notes updated"
              : `Notes in ${activeFolderName} updated`
          );
        }
      }
    } catch (error) {
      console.error("Error fetching notes:", error);
      setError("Failed to load notes. Please try again.");
    } finally {
      if (showLoading) {
        setIsLoading(false);
      }
    }
  };

  const handleFilterChange = (filter: string) => {
    setSelectedFilter(filter);
    setSearchQuery(""); // Clear search query when changing filter
    setShowSearchBar(false); // Hide search bar when changing filter
    setActiveNoteOptions(null); // Close any active note options
    // Apply the filter logic here
    if (filter === "all") {
      // Fetch all notes
      fetchNotes();
    } else {
      // Fetch notes of the selected type
      fetchNotes(false); // Pass false to avoid showing loading spinner
    }
  };

  const handleAddToFolder = (noteId: string) => {
    setSelectedNotes([noteId]);
    setShowSortNotesModal(true);
    setActiveNoteOptions(null);
  };

  const handleRemoveFromFolder = async (noteId: string) => {
    try {
      setIsLoading(true);
      setActiveNoteOptions(null);

      const token = await AsyncStorage.getItem("authToken");
      if (!token) {
        navigation.navigate("Login");
        return;
      }

      const API_URL = "http://10.0.2.2:8000";

      // Send a request to remove the note from its folder
      const response = await fetch(
        `${API_URL}/note_taking/notes/${noteId}/remove-from-folder/`,
        {
          method: "POST",
          headers: {
            Authorization: `Token ${token}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (!response.ok) {
        throw new Error("Failed to remove note from folder");
      }

      // Update local state to reflect changes
      const updatedNotes = notes.map((note) =>
        note.id === noteId
          ? { ...note, folderId: undefined, folder: undefined }
          : note
      );

      setNotes(updatedNotes);
      showToast("Note moved to Unorganized Notes");

      // If we're viewing a specific folder, and this was the only note, we might need to refresh
      if (
        currentView === "notes" &&
        !showUnorganizedNotes &&
        updatedNotes.filter((note) => note.folderId === activeFolderId)
          .length === 0
      ) {
        fetchNotes();
      }
    } catch (error) {
      console.error("Error removing note from folder:", error);
      Alert.alert(
        "Error",
        "Failed to move note to Unorganized Notes. Please try again."
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteNote = (noteId: string) => {
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

              const API_URL = "http://10.0.2.2:8000";
              const response = await fetch(
                `${API_URL}/note_taking/notes/${noteId}/`,
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

              // Show success toast
              showToast("Note deleted successfully");
            } catch (error) {
              console.error("Error deleting note:", error);
              Alert.alert("Error", "Failed to delete note. Please try again.");
            } finally {
              setIsLoading(false); // Hide loading indicator
            }
          },
        },
      ]
    );
  };
  const handleNotePress = (note: Note) => {
    // Close any open options when navigating
    setActiveNoteOptions(null);
    // Convert tag objects to strings for the editor if needed
    const processedTags = note.tags?.map((tag) =>
      typeof tag === "object" && tag !== null && "name" in tag ? tag.name : tag
    );

    // Prepare note data for editor
    const noteForEditor = {
      title: note.title,
      content: note.content,
      formatted_content: note.formatted_content || note.content, // Use formatted content if available, otherwise plain content
      tags: processedTags || [],
      createdAt: note.createdAt?.toISOString(),
      updatedAt: note.updatedAt?.toISOString(),
    };

    navigation.navigate("NoteEditor", {
      noteId: note.id,
      initialNote: noteForEditor,
    });
  };

  const handleCreateNote = () => {
    // If we're in a folder view, pre-select that folder, otherwise show folder selection modal
    if (currentView === "notes" && activeFolderId) {
      // Navigate to editor with pre-selected folder
      const initialNoteData = {
        title: "",
        content: "",
        folderId: activeFolderId,
      };
      navigation.navigate("NoteEditor", {
        initialNote: initialNoteData,
      });
    } else {
      // Show folder selection modal first
      setShowFolderSelectionModal(true);
    }
  };

  const createNoteWithFolder = (folderId: string | null) => {
    // Show toast message
    showToast("Creating new note...");

    const initialNoteData = {
      title: "",
      content: "",
      folderId: folderId,
    };

    // Navigate to the editor
    navigation.navigate("NoteEditor", {
      initialNote: initialNoteData,
    });

    // Reset state
    setShowFolderSelectionModal(false);
    setNewNoteFolder(null);
  };

  const renderFolderSelectionModal = () => (
    <Modal
      visible={showFolderSelectionModal}
      transparent={true}
      animationType="slide"
      onRequestClose={() => setShowFolderSelectionModal(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Select Folder for New Note</Text>
            <TouchableOpacity
              onPress={() => setShowFolderSelectionModal(false)}
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
                newNoteFolder === null && styles.selectedFolderItem,
              ]}
              onPress={() => {
                setNewNoteFolder(null);
                createNoteWithFolder(null);
              }}
            >
              <View style={[styles.folderIcon, { backgroundColor: "#64748B" }]}>
                <MaterialIcons name="notes" size={20} color="#FFFFFF" />
              </View>
              <Text style={styles.folderName}>Unorganized Notes</Text>
              {newNoteFolder === null && (
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
                    { backgroundColor: folder.color || "#667EEA" },
                  ]}
                >
                  <MaterialIcons
                    name={
                      folder.icon && MaterialIcons.hasOwnProperty(folder.icon)
                        ? folder.icon
                        : "folder"
                    }
                    size={20}
                    color="#FFFFFF"
                  />
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
          </ScrollView>

          {/* Footer with Cancel button */}

          <View style={styles.modalFooter}>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => setShowFolderSelectionModal(false)}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.createNoteButton}
              onPress={() => {
                if (newNoteFolder) {
                  createNoteWithFolder(newNoteFolder);
                } else {
                  createNoteWithFolder(null); // Unorganized notes
                }
              }}
            >
              <Text style={styles.createNoteButtonText}>Create Note</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.modalFooter}>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => setShowFolderSelectionModal(false)}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );

  const assignNotesToFolder = async (folderID: string, noteIDs: string[]) => {
    try {
      setIsLoading(true);
      const token = await AsyncStorage.getItem("authToken");
      if (!token) {
        navigation.navigate("Login");
        return;
      }

      const API_URL = "http://10.0.2.2:8000";

      // Create the payload for the API request
      const payload = {
        folder_id: folderID,
        note_ids: noteIDs,
      };

      // Fix: Update the API endpoint to match the backend route
      const response = await fetch(
        `${API_URL}/note_taking/notes/${noteIDs.join(",")}/move-to-folder/`,
        {
          method: "POST",
          headers: {
            Authorization: `Token ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
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

      showToast("Notes assigned to folder successfully");
    } catch (error) {
      console.error("Error assigning notes to folder:", error);
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
      showToast("No notes selected");
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

              const API_URL = "http://10.0.2.2:8000";

              // Create an array of promises for each delete operation
              const deletePromises = selectedNotes.map((noteId) =>
                fetch(`${API_URL}/note_taking/notes/${noteId}/`, {
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

                // Exit select mode and clear selection
                setSelectedNotes([]);
                setIsSelectMode(false);

                // Show success message
                showToast(
                  `${selectedNotes.length} ${
                    selectedNotes.length === 1 ? "note" : "notes"
                  } deleted successfully`
                );
              } else {
                throw new Error("Some notes could not be deleted");
              }
            } catch (error) {
              console.error("Error deleting notes:", error);
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
  const toggleNoteSelection = (noteId: string) => {
    setSelectedNotes((prev) => {
      if (prev.includes(noteId)) {
        return prev.filter((id) => id !== noteId);
      } else {
        return [...prev, noteId];
      }
    });
  };

  // Function to handle editing folder name
  const handleEditFolderName = (folderId: string, currentName: string) => {
    // Don't allow editing of "Unorganized Notes"
    if (showUnorganizedNotes) {
      return;
    }

    // Alert.prompt is iOS only, so we need to handle Android differently
    if (Platform.OS === "android") {
      // For Android, we'll implement a custom modal with TextInput
      setEditingFolderId(folderId);
      setEditingFolderName(currentName);
      setShowEditFolderModal(true);
      return;
    }

    // iOS implementation
    Alert.prompt(
      "Edit Folder Name",
      "Please enter a new name for this folder:",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Save",
          onPress: async (newName?: string) => {
            if (newName && newName.trim() !== "" && newName !== currentName) {
              updateFolderName(folderId, newName.trim());
            }
          },
        },
      ],
      "plain-text",
      currentName
    );
  };

  // Add this helper function
  const updateFolderName = async (folderId: string, newName: string) => {
    try {
      const token = await AsyncStorage.getItem("authToken");
      if (!token) {
        navigation.navigate("Login");
        return;
      }

      const API_URL = "http://10.0.2.2:8000";
      const response = await fetch(
        `${API_URL}/note_taking/folders/${folderId}/`,
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

      // Update active folder name if it's the current folder
      if (activeFolderId === folderId) {
        setActiveFolderName(newName);
      }

      showToast("Folder name updated successfully");
    } catch (error) {
      console.error("Error updating folder name:", error);
      Alert.alert("Error", "Failed to update folder name. Please try again.");
    }
  };

  const handleCreateFolder = async () => {
    if (newFolderName.trim() === "") {
      Alert.alert("Error", "Please enter a folder name");
      return;
    }

    try {
      const token = await AsyncStorage.getItem("authToken");
      if (!token) {
        navigation.navigate("Login");
        return;
      }

      const API_URL = "http://10.0.2.2:8000";

      // Make sure we're using a valid icon from our predefined list
      const folderData = {
        name: newFolderName.trim(),
        icon: FOLDER_ICONS.includes(selectedFolderIcon)
          ? selectedFolderIcon
          : "folder",
        color: selectedFolderColor,
      };

      const response = await fetch(`${API_URL}/note_taking/folders/`, {
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

      // Close the create folder modal
      setShowCreateFolderModal(false);

      // Show toast notification about successful folder creation
      showToast(`Folder "${newFolderName}" created successfully`);
    } catch (error) {
      console.error("Error creating folder:", error);
      Alert.alert("Error", "Failed to create folder. Please try again.");
    }
  };

  const toggleSearch = () => {
    setShowSearchBar(!showSearchBar);
    if (showSearchBar) {
      setSearchQuery(""); // Clear search when closing
    }
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
    return showUnorganizedNotes
      ? filteredNotes.filter((note) => !note.folderId)
      : filteredNotes.filter((note) => note.folderId === activeFolderId);
  }, [filteredNotes, showUnorganizedNotes, activeFolderId]);

  // Pre-memoized separator component to avoid conditional hook rendering
  const NoteSeparatorComponent = useMemo(
    () => () => <View style={styles.noteSeparator} />,
    []
  );

  // Pre-memoized empty list component to avoid conditional hook rendering
  const NotesEmptyListComponent = useMemo(
    () => () =>
      (
        <View style={styles.emptyState}>
          <MaterialIcons
            name={showUnorganizedNotes ? "folder" : "description"}
            size={64}
            color="#CBD5E0"
          />
          <Text style={styles.emptyStateTitle}>
            {showUnorganizedNotes
              ? "No unorganized notes"
              : "No notes in this folder"}
          </Text>
          <Text style={styles.emptyStateSubtitle}>
            {searchQuery
              ? "Try adjusting your search terms"
              : isLoading
              ? "Loading your notes..."
              : showUnorganizedNotes
              ? "All your notes are organized in folders"
              : "Create a new note or add existing notes to this folder"}
          </Text>
          <TouchableOpacity
            style={styles.createButton}
            onPress={() => handleCreateNote()}
          >
            <Text style={styles.createButtonText}>Create Note</Text>
          </TouchableOpacity>

          {showUnorganizedNotes && (
            <Text style={styles.emptyStateHint}>
              Notes that are not assigned to any folder will appear here
            </Text>
          )}
        </View>
      ),
    [searchQuery, isLoading, showUnorganizedNotes, handleCreateNote]
  );

  // Memoize the note item renderer to prevent unnecessary re-renders
  // Memoize the note item renderer to prevent unnecessary re-renders
  const renderNoteItem = useCallback(
    ({ item }: { item: Note }) => (
      <TouchableOpacity
        style={[
          viewMode === "list" ? styles.noteItem : styles.gridNoteItem,
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
            styles.noteContent,
            viewMode === "grid" && styles.gridNoteContent,
          ]}
        >
          {/* Show folder badge if we're in a view that shows notes from multiple folders */}
          {currentView === "folders" && item.folderId && (
            <View style={styles.folderBadge}>
              <MaterialIcons name="folder" size={10} color="#6A009C" />
              <Text style={styles.folderBadgeText}>
                {folders.find((f) => f.id === item.folderId)?.name || "Folder"}
              </Text>
            </View>
          )}

          <View style={styles.noteHeader}>
            <View style={styles.noteTitleContainer}>
              <View
                style={[
                  styles.noteTypeIcon,
                  viewMode === "grid" && styles.gridNoteTypeIcon,
                  {
                    backgroundColor:
                      item.type === "image" ? "#FEF3C7" : "#F3E8FF",
                  },
                ]}
              >
                <MaterialIcons
                  name={item.type === "image" ? "image" : "text-snippet"}
                  size={viewMode === "grid" ? 16 : 22}
                  color={item.type === "image" ? "#D97706" : "#7E22CE"}
                />
              </View>
              <View style={styles.noteTitleSection}>
                <Text
                  style={[
                    styles.noteTitle,
                    viewMode === "grid" && styles.gridNoteTitle,
                  ]}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  {item.title || "Untitled Note"}
                </Text>

                {/* Show folder info with date in the note item */}
                <View style={styles.folderStatsRow}>
                  {item.folderId && (
                    <>
                      <View style={styles.folderBadgeInline}>
                        <Text style={styles.noteDate}>
                          {item.updatedAt.toLocaleDateString("en-US", {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          })}
                        </Text>
                      </View>
                    </>
                  )}
                </View>
              </View>
            </View>

            {!isSelectMode && (
              <TouchableWithoutFeedback
                onPress={(e) => {
                  // Completely prevent any event bubbling
                  e.stopPropagation();
                  setActiveNoteOptions(
                    activeNoteOptions === item.id ? null : item.id
                  );
                }}
              >
                <View
                  style={
                    viewMode === "grid"
                      ? styles.gridNoteOptionsButton
                      : styles.noteOptionsButton
                  }
                >
                  <MaterialIcons
                    name="more-vert"
                    size={viewMode === "grid" ? 16 : 20}
                    color="#9CA3AF"
                  />
                </View>
              </TouchableWithoutFeedback>
            )}

            {activeNoteOptions === item.id && (
              <View
                style={
                  viewMode === "grid"
                    ? styles.gridNoteOptionsDropdown
                    : styles.noteOptionsDropdown
                }
              >
                <TouchableWithoutFeedback
                  onPress={(e) => {
                    e.stopPropagation();
                    handleAddToFolder(item.id);
                  }}
                >
                  <View style={styles.noteOptionItem}>
                    <MaterialIcons name="folder" size={18} color="#6A009C" />
                    <Text style={styles.noteOptionText}>
                      {item.folderId ? "Move to Folder" : "Add to Folder"}
                    </Text>
                  </View>
                </TouchableWithoutFeedback>

                {item.folderId && (
                  <TouchableWithoutFeedback
                    onPress={(e) => {
                      e.stopPropagation();
                      handleRemoveFromFolder(item.id);
                    }}
                  >
                    <View style={styles.noteOptionItem}>
                      <MaterialIcons
                        name="folder-off"
                        size={18}
                        color="#6A009C"
                      />
                      <Text style={styles.noteOptionText}>
                        Remove from Folder
                      </Text>
                    </View>
                  </TouchableWithoutFeedback>
                )}

                <TouchableWithoutFeedback
                  onPress={(e) => {
                    e.stopPropagation();
                    handleDeleteNote(item.id);
                  }}
                >
                  <View style={styles.noteOptionItem}>
                    <MaterialIcons name="delete" size={18} color="#EF4444" />
                    <Text style={styles.noteOptionText}>Delete Note</Text>
                  </View>
                </TouchableWithoutFeedback>
              </View>
            )}
          </View>

          {/* Show tags */}
          {item.tags && item.tags.length > 0 && (
            <View
              style={[
                styles.tagsContainer,
                viewMode === "grid" && styles.gridTagsContainer,
              ]}
            >
              {item.tags
                .slice(0, viewMode === "grid" ? 1 : 3)
                .map((tag, idx) => (
                  <View
                    key={idx}
                    style={[styles.tag, viewMode === "grid" && styles.gridTag]}
                  >
                    <Text
                      style={[
                        styles.tagText,
                        viewMode === "grid" && styles.gridTagText,
                      ]}
                    >
                      {typeof tag === "string"
                        ? tag
                        : tag && typeof tag === "object" && "name" in tag
                        ? tag.name
                        : ""}
                    </Text>
                  </View>
                ))}
              {item.tags.length > (viewMode === "grid" ? 1 : 3) && (
                <View
                  style={[
                    styles.moreTagsIndicator,
                    viewMode === "grid" && styles.gridMoreTagsIndicator,
                  ]}
                >
                  <Text
                    style={[
                      styles.moreTagsText,
                      viewMode === "grid" && styles.gridMoreTagsText,
                    ]}
                  >
                    +{item.tags.length - (viewMode === "grid" ? 1 : 3)}
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* Note content preview */}
          {item.formatted_content ? (
            <View
              style={[
                styles.htmlPreviewContainer,
                viewMode === "grid" && styles.gridHtmlPreviewContainer,
              ]}
            >
              <RenderHtml
                contentWidth={windowWidth - (viewMode === "grid" ? 96 : 88)}
                source={{ html: item.formatted_content }}
              />
              <View style={styles.fadeOverlay} />
            </View>
          ) : (
            <Text
              style={[
                styles.notePreview,
                viewMode === "grid" && styles.gridNotePreview,
              ]}
              numberOfLines={viewMode === "grid" ? 2 : 3}
              ellipsizeMode="tail"
            >
              {item.content}
            </Text>
          )}
        </View>
      </TouchableOpacity>
    ),
    [
      viewMode,
      isSelectMode,
      selectedNotes,
      activeNoteOptions,
      folders,
      htmlTagStyles,
      currentView,
      windowWidth,
    ]
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
                  style={[styles.folderIcon, { backgroundColor: folder.color }]}
                >
                  <MaterialIcons name={folder.icon} size={20} color="#FFFFFF" />
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
      onRequestClose={() => setShowCreateFolderModal(false)}
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
          onPress={() => setShowCreateFolderModal(false)}
        >
          <View style={{ flex: 1 }} />
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Create New Folder</Text>
              <TouchableOpacity
                onPress={() => setShowCreateFolderModal(false)}
                style={styles.modalCloseButton}
              >
                <MaterialIcons name="close" size={24} color="#9CA3AF" />
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
                <Text style={styles.inputLabel}>Choose Icon</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.iconSelector}
                  keyboardShouldPersistTaps="always"
                >
                  {FOLDER_ICONS.map((iconName) => (
                    <TouchableOpacity
                      key={iconName}
                      style={[
                        styles.iconOption,
                        selectedFolderIcon === iconName &&
                          styles.selectedIconOption,
                      ]}
                      onPress={() => setSelectedFolderIcon(iconName)}
                    >
                      <MaterialIcons
                        name={iconName}
                        size={24}
                        color={
                          selectedFolderIcon === iconName
                            ? "#FFFFFF"
                            : "#6A009C"
                        }
                      />
                    </TouchableOpacity>
                  ))}
                </ScrollView>
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

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setShowCreateFolderModal(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.createButton}
                onPress={handleCreateFolder}
              >
                <Text style={styles.createButtonText}>Create Folder</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </Modal>
  );

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
                    updateFolderName(editingFolderId, editingFolderName.trim());
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
  </Modal>;

  return (
    <TouchableOpacity
      style={styles.container}
      activeOpacity={1}
      onPress={() => {
        if (activeNoteOptions) {
          // Add this condition
          setActiveNoteOptions(null); // Close any open kebab menus
        }
        setShowOptionsDropdown(false);
      }}
    >
      <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />
      {isSelectMode && (
        <View style={styles.selectionModeHeader}>
          <Text style={styles.selectionModeText}>
            {selectedNotes.length}{" "}
            <Text>{selectedNotes.length === 1 ? "note" : "notes"}</Text>{" "}
            <Text>selected</Text>
          </Text>
          <View style={styles.selectionModeActions}>
            <TouchableOpacity
              style={styles.selectionModeButton}
              onPress={() => {
                if (selectedFolder && selectedNotes.length > 0) {
                  // Assign selected notes to the selected folder
                  assignNotesToFolder(selectedFolder, selectedNotes);
                } else {
                  // Show folder selection modal if we have selected notes but no folder
                  if (selectedNotes.length > 0 && folders.length > 0) {
                    setShowSortNotesModal(true);
                  } else if (folders.length === 0) {
                    showToast("Create a folder first");
                  } else {
                    showToast("Select notes first");
                  }
                }
              }}
            >
              {/* icon for adding to folder */}
              <MaterialIcons name="folder" size={20} color="#FFFFFF" />
            </TouchableOpacity>

            {/* Add the delete button */}
            <TouchableOpacity
              style={[
                styles.selectionModeButton,
                { backgroundColor: "rgba(239, 68, 68, 0.7)" },
              ]}
              onPress={handleBulkDeleteNotes}
            >
              {/* icon for delete */}
              <MaterialIcons name="delete" size={20} color="#FFFFFF" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.selectionModeButton}
              onPress={() => {
                setIsSelectMode(false);
                setSelectedNotes([]);
              }}
            >
              {/* cancel icon */}
              <MaterialIcons name="cancel" size={20} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </View>
      )}
      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <View style={styles.headerTitleSection}>
            <Text style={styles.headerTitle}>
              {currentView === "folders" 
                ? (activeTab === "folders" ? "My Folders" : "All Notes")
                : activeFolderName
              }
            </Text>
            <Text style={styles.headerSubtitle}>
              {currentView === "folders"
                ? activeTab === "folders" 
                  ? `${folders.length} ${folders.length === 1 ? "folder" : "folders"}`
                  : `${filteredNotes.length} ${filteredNotes.length === 1 ? "note" : "notes"}`
                : `${
                    filteredNotes.filter(
                      (note) => note.folderId === activeFolderId
                    ).length
                  } ${
                    filteredNotes.filter(
                      (note) => note.folderId === activeFolderId
                    ).length === 1
                      ? "note"
                      : "notes"
                  }`}
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
              <MaterialIcons name="search" size={22} color="#6A009C" />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.headerActionButton}
              onPress={() => setShowOptionsDropdown(!showOptionsDropdown)}
            >
              <MaterialIcons name="more-vert" size={22} color="#6A009C" />
            </TouchableOpacity>

            {showOptionsDropdown && (
              <View style={styles.optionsDropdown}>
                <TouchableOpacity
                  style={styles.dropdownOption}
                  onPress={() => {
                    setShowCreateFolderModal(true);
                    setShowOptionsDropdown(false);
                  }}
                >
                  <MaterialIcons
                    name="create-new-folder"
                    size={20}
                    color="#6A009C"
                  />
                  <Text style={styles.dropdownOptionText}>Create Folder</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.dropdownOption}
                  onPress={() => {
                    setViewMode(viewMode === "list" ? "grid" : "list");
                    setShowOptionsDropdown(false);
                  }}
                >
                  <MaterialIcons
                    name={viewMode === "list" ? "grid-view" : "view-list"}
                    size={20}
                    color="#6A009C"
                  />
                  <Text style={styles.dropdownOptionText}>
                    {viewMode === "list" ? "Grid View" : "List View"}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.dropdownOption}
                  onPress={() => {
                    navigation.navigate("PDFs"); // Navigate to the ImportPDFPage
                    setShowOptionsDropdown(false); // Close the dropdown
                  }}
                >
                  <MaterialIcons
                    name="picture-as-pdf"
                    size={20}
                    color="#6A009C"
                  />
                  <Text style={styles.dropdownOptionText}>Import PDF</Text>
                </TouchableOpacity>
              </View>
            )}
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
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity
                  style={styles.clearSearchButton}
                  onPress={() => setSearchQuery("")}
                >
                  <MaterialIcons name="clear" size={18} color="#9CA3AF" />
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}
        
        {/* Tab Navigation - inside header when in folders view */}
        {currentView === "folders" && (
          <View style={styles.tabContainer}>
            <TouchableOpacity
              style={[
                styles.tabButton,
                activeTab === "folders" && styles.activeTabButton,
              ]}
              onPress={() => setActiveTab("folders")}
            >
              <Text
                style={[
                  styles.tabButtonText,
                  activeTab === "folders" && styles.activeTabButtonText,
                ]}
              >
                Folders
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.tabButton,
                activeTab === "allNotes" && styles.activeTabButton,
              ]}
              onPress={() => setActiveTab("allNotes")}
            >
              <Text
                style={[
                  styles.tabButtonText,
                  activeTab === "allNotes" && styles.activeTabButtonText,
                ]}
              >
                All Notes
              </Text>
            </TouchableOpacity>
          </View>
        )}
        
        {/* Path Navigation - inside header when viewing notes within a folder */}
        {currentView === "notes" && (activeFolderId || showUnorganizedNotes) && (
          <View style={styles.pathNavigationBar}>
            <TouchableOpacity
              style={styles.pathBackButton}
              onPress={() => {
                setCurrentView("folders");
                setActiveFolderId(null);
                setActiveFolderName("");
                setShowUnorganizedNotes(false);
                setActiveTab("folders"); // Reset to folders tab when going back
              }}
            >
              <MaterialIcons name="arrow-back" size={20} color="#6A009C" />
            </TouchableOpacity>
            <View style={styles.pathContainer}>
              <TouchableOpacity
                style={styles.pathSegment}
                onPress={() => {
                  setCurrentView("folders");
                  setActiveFolderId(null);
                  setActiveFolderName("");
                  setShowUnorganizedNotes(false);
                  setActiveTab("folders");
                }}
              >
                <Text style={styles.pathSegmentText}>Folders</Text>
              </TouchableOpacity>
              <MaterialIcons name="chevron-right" size={16} color="#64748B" />
              <View
                style={[
                  styles.pathCurrentSegment,
                  showUnorganizedNotes && styles.unorganizedPathSegment,
                ]}
              >
                <MaterialIcons
                  name={showUnorganizedNotes ? "notes" : "folder"}
                  size={16}
                  color={showUnorganizedNotes ? "#64748B" : "#6A009C"}
                  style={{ marginRight: 6 }}
                />
                <Text
                  style={[
                    styles.pathCurrentSegmentText,
                    showUnorganizedNotes && { color: "#64748B" },
                  ]}
                >
                  {activeFolderName || (showUnorganizedNotes ? "Unorganized Notes" : "")}
                </Text>
              </View>
            </View>
          </View>
        )}
      </View>
      
      {/* Show folders grid when in folders view and folders tab is active */}
      {currentView === "folders" && activeTab === "folders" && (
        <FlatList
          data={folders}
          // Performance optimizations
          removeClippedSubviews={true}
          maxToRenderPerBatch={8}
          initialNumToRender={8}
          windowSize={5}
          ListHeaderComponent={() => (
            <TouchableOpacity
              style={[styles.folderCardLarge, styles.unorganizedNotesCard]}
              activeOpacity={0.8}
              onPress={() => {
                setShowUnorganizedNotes(true);
                setCurrentView("notes");
                setActiveFolderName("Unorganized Notes");
                setActiveFolderId(null); // Make sure activeFolderId is null for unorganized notes
              }}
            >
              <View
                style={[
                  styles.folderIconLarge,
                  { backgroundColor: "#64748B" }, // Neutral color for unorganized
                ]}
              >
                <MaterialIcons name="notes" size={32} color="#FFFFFF" />
              </View>
              <View style={styles.folderCardContent}>
                <Text style={styles.folderNameLarge}>Unorganized Notes</Text>
              </View>

              <View style={styles.folderCountContainer}>
                <Text style={styles.folderCountText}>
                  {notes.filter((note) => !note.folderId).length}{" "}
                  {notes.filter((note) => !note.folderId).length === 1
                    ? "note"
                    : "notes"}
                </Text>
                <MaterialIcons
                  name="chevron-right"
                  size={24}
                  color="#9CA3AF"
                  style={styles.folderCardArrow}
                />
              </View>
            </TouchableOpacity>
          )}
          // In the FlatList renderItem for folders
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.folderCardLarge}
              activeOpacity={0.8}
              onPress={() => {
                setActiveFolderId(item.id);
                setActiveFolderName(item.name);
                setCurrentView("notes");
                setShowUnorganizedNotes(false);
              }}
            >
              <View
                style={[
                  styles.folderIconLarge,
                  { backgroundColor: item.color || "#667EEA" },
                ]}
              >
                <MaterialIcons
                  // Make sure the icon is valid by checking if it exists in MaterialIcons
                  name={
                    FOLDER_ICONS.includes(
                      item.icon as keyof typeof MaterialIcons.glyphMap
                    )
                      ? item.icon
                      : "folder"
                  }
                  size={32}
                  color="#FFFFFF"
                />
              </View>
              <View style={styles.folderCardContent}>
                <Text style={styles.folderNameLarge}>{item.name}</Text>
              </View>

              <View style={styles.folderCountContainer}>
                <Text style={styles.folderCountText}>
                  {folderCounts[item.id] || 0}{" "}
                  {folderCounts[item.id] === 1 ? "note" : "notes"}
                </Text>
                <MaterialIcons
                  name="chevron-right"
                  size={24}
                  color="#9CA3AF"
                  style={styles.folderCardArrow}
                />
              </View>
            </TouchableOpacity>
          )}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.folderGrid}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={styles.folderSeparator} />}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={["#6A009C"]}
            />
          }
          ListEmptyComponent={() => (
            <View style={styles.emptyState}>
              <MaterialIcons name="folder-off" size={64} color="#CBD5E0" />
              <Text style={styles.emptyStateTitle}>No folders yet</Text>
              <Text style={styles.emptyStateSubtitle}>
                {isLoading
                  ? "Loading your folders..."
                  : "Create your first folder to organize your notes"}
              </Text>
              <TouchableOpacity
                style={styles.createButton}
                onPress={() => setShowCreateFolderModal(true)}
              >
                <Text style={styles.createButtonText}>Create Folder</Text>
              </TouchableOpacity>
            </View>
          )}
        />
      )}
      
      {/* Show all notes when in folders view and all notes tab is active */}
      {currentView === "folders" && activeTab === "allNotes" && (
        <FlatList
          data={filteredNotes}
          renderItem={renderNoteItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.notesList}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={NoteSeparatorComponent}
          numColumns={viewMode === "grid" ? 2 : 1}
          key={`allNotes-${viewMode}`}
          // Performance optimizations
          removeClippedSubviews={true}
          maxToRenderPerBatch={10}
          windowSize={10}
          initialNumToRender={8}
          updateCellsBatchingPeriod={50}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={["#6A009C"]}
            />
          }
          ListEmptyComponent={() => (
            <View style={styles.emptyState}>
              <MaterialIcons name="note" size={64} color="#CBD5E0" />
              <Text style={styles.emptyStateTitle}>No notes yet</Text>
              <Text style={styles.emptyStateSubtitle}>
                {isLoading
                  ? "Loading your notes..."
                  : "Create your first note to get started"}
              </Text>
              <TouchableOpacity
                style={styles.createButton}
                onPress={handleCreateNote}
              >
                <Text style={styles.createButtonText}>Create Note</Text>
              </TouchableOpacity>
            </View>
          )}
        />
      )}
      
      {/* Show notes list when in notes view - with performance optimizations */}
      {currentView === "notes" && (
        <FlatList
          data={notesViewData}
          renderItem={renderNoteItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.notesList}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={NoteSeparatorComponent}
          numColumns={viewMode === "grid" ? 2 : 1}
          key={viewMode}
          // Performance optimizations
          removeClippedSubviews={true} // Detach views outside viewport
          maxToRenderPerBatch={10} // Render fewer items at a time
          windowSize={10} // Reduce window size for better memory usage
          initialNumToRender={8} // Start with fewer items
          updateCellsBatchingPeriod={50} // Batch render updates
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={["#6A009C"]}
            />
          }
          ListEmptyComponent={NotesEmptyListComponent}
        />
      )}
      <View style={styles.fabContainer}>
        {currentView === "folders" ? (
          activeTab === "folders" ? (
            <TouchableOpacity
              style={[styles.fabButton, styles.textFab]}
              onPress={() => setShowCreateFolderModal(true)}
              activeOpacity={0.8}
            >
              <MaterialIcons name="create-new-folder" size={28} color="#6A009C" />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.fabButton, styles.textFab]}
              onPress={handleCreateNote}
              activeOpacity={0.8}
            >
              <MaterialIcons name="note-add" size={28} color="#6A009C" />
            </TouchableOpacity>
          )
        ) : (
          <TouchableOpacity
            style={[styles.fabButton, styles.textFab]}
            onPress={handleCreateNote}
            activeOpacity={0.8}
          >
            <MaterialIcons name="note-add" size={28} color="#6A009C" />
          </TouchableOpacity>
        )}
      </View>
      <Navbar activeRoute="Notes" />
      {renderCreateFolderModal()}
      {renderSortNotesModal()}
      {renderFolderSelectionModal()} {/* Add this line */}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8fafc",
    paddingTop: Platform.OS === 'ios' ? 200 : 185, // Increased for path navigation in header
  },
  // Tab navigation styles
  tabContainer: {
    flexDirection: "row",
    backgroundColor: "#FFFFFF",
    marginHorizontal: 20,
    marginTop: 16,
    marginBottom: 8,
    borderRadius: 16,
    padding: 4,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 8,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
  },
  tabButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: 2,
    // Add subtle transition effect
    transform: [{ scale: 1 }],
  },
  activeTabButton: {
    backgroundColor: "#6A009C",
    shadowColor: "#6A009C",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
    // Add subtle gradient effect through border
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    transform: [{ scale: 1.02 }],
  },
  tabButtonText: {
    fontSize: 14,
    fontFamily: "Inter-SemiBold",
    color: "#64748B",
    letterSpacing: -0.2,
  },
  activeTabButtonText: {
    color: "#FFFFFF",
    fontFamily: "Inter-Bold",
    textShadowColor: "rgba(0, 0, 0, 0.1)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  // Path navigation styles
  pathNavigationBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingVertical: 8,
    marginTop: 12,
    backgroundColor: "rgba(255, 255, 255, 0.7)",
    borderRadius: 12,
    marginHorizontal: 24,
    borderWidth: 1,
    borderColor: "rgba(106, 0, 156, 0.1)",
  },
  pathBackButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
    backgroundColor: "rgba(106, 0, 156, 0.1)",
  },
  pathContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    overflow: "hidden",
  },
  pathSegment: {
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 6,
    backgroundColor: "rgba(106, 0, 156, 0.1)",
    marginRight: 8,
  },
  pathSegmentText: {
    fontSize: 12,
    fontFamily: "Inter-Medium",
    color: "#6A009C",
  },
  pathCurrentSegment: {
    flex: 1,
    paddingVertical: 2,
    paddingHorizontal: 6,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(106, 0, 156, 0.15)",
    borderRadius: 6,
    marginLeft: 8,
  },
  pathCurrentSegmentText: {
    fontSize: 12,
    fontFamily: "Inter-SemiBold",
    color: "#6A009C",
  },
  unorganizedPathSegment: {
    backgroundColor: "rgba(100, 116, 139, 0.1)",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "rgba(100, 116, 139, 0.2)",
  },
  editFolderNameButton: {
    padding: 4,
    marginRight: 6,
  },
  // Folder grid styles
  folderGrid: {
    paddingHorizontal: 24,
    paddingTop: 90, // Reduced since container now has proper padding for header
  },
  folderSeparator: {
    height: 16,
  },
  folderCardLarge: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 20,
    flexDirection: "row",
    alignItems: "center",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 8,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    // Add subtle gradient effect through background
    overflow: "hidden",
  },
  folderIconLarge: {
    width: 64,
    height: 64,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },

  folderCardContent: {
    flex: 1,
    marginLeft: 20,
  },

  folderNameLarge: {
    fontSize: 19,
    fontFamily: "Inter-SemiBold",
    color: "#1E293B",
    marginBottom: 4,
    letterSpacing: -0.2,
  },

  folderCountContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    paddingLeft: 16,
    paddingRight: 8,
    paddingVertical: 8,
    borderRadius: 14,
    marginLeft: 8,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },

  folderCountText: {
    fontSize: 13,
    color: "#64748B",
    fontFamily: "Inter-Medium",
    marginRight: 6,
  },

  folderCardArrow: {
    marginLeft: 2,
  },
  htmlContainer: {
    marginTop: 4,
  },
  htmlPreviewContainer: {
    marginTop: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#F8FAFC", // Slightly lighter background
    shadowColor: "#1E293B",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
    height: 60,
    overflow: "hidden",
    position: "relative",
    borderWidth: 1,
    borderColor: "#E2E8F0", // Added border
  },

  fadeOverlay: {
    position: "absolute",
    bottom: 0, // Changed from top:0 to bottom:0
    left: 0,
    right: 0,
    height: 30, // Only fade the bottom portion
    backgroundColor: "rgba(255, 255, 255, 0.95)", // More transparent
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
  },

  gridHtmlPreviewContainer: {
    padding: 8,
    borderRadius: 12,
    backgroundColor: "#F1F5F9",
    height: 80, // Smaller fixed height for grid mode
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 24,
    paddingTop: Platform.OS === 'ios' ? 70 : 55,
    paddingBottom: 30,
    backgroundColor: "#F5E1FD",
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    shadowColor: "#6A009C",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 10,
    zIndex: 1000,
    // Add subtle gradient overlay effect
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.2)",
  },
  headerTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  headerTitleSection: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 32,
    fontFamily: "Inter-Bold",
    color: "#6A009C",
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 16,
    fontFamily: "Inter-Medium",
    color: "#64748B",
  },
  headerActions: {
    flexDirection: "row",
    gap: 8,
    position: "relative",
  },
  headerActionButton: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#6A009C",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
  },
  activeSearchButton: {
    backgroundColor: "#6A009C",
    shadowColor: "#6A009C",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 8,
    transform: [{ scale: 1.05 }],
  },
  searchContainer: {
    marginTop: 16,
  },
  searchInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    shadowColor: "#1E293B",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  searchIcon: {
    marginRight: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    fontFamily: "Inter-Regular",
    color: "#1F2937",
  },
  folderItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    marginBottom: 8,
    shadowColor: "#1E293B",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  selectedFolderItem: {
    backgroundColor: "#E0F2FE",
  },
  unorganizedFolderItem: {
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderStyle: "dashed",
  },
  folderDivider: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    marginBottom: 8,
  },
  folderDividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "#E2E8F0",
  },
  folderDividerText: {
    fontSize: 14,
    fontFamily: "Inter-Medium",
    color: "#64748B",
    marginHorizontal: 8,
  },
  // Add to your StyleSheet
  folderBadgeInline: {
    flexDirection: "row",
    alignItems: "center",
    width: 130,
  },
  metaSeparator: {
    color: "#CBD5E0",
    fontSize: 12,
    marginHorizontal: 8,
  },
  folderIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  folderName: {
    fontSize: 16,
    fontFamily: "Inter-Medium",
    color: "#374151",
    marginLeft: 12,
  },
  clearSearchButton: {
    padding: 4,
    marginLeft: 8,
  },
  folderSection: {
    paddingHorizontal: 24,
    marginBottom: 16,
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
  folderDropdown: {
    marginTop: 16,
  },
  foldersScrollContent: {
    paddingHorizontal: 4,
  },
  folderCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    marginRight: 12,
    width: 100,
    alignItems: "center",
    shadowColor: "#1E293B",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  folderCount: {
    fontSize: 11,
    fontFamily: "Inter-Regular",
    color: "#9CA3AF",
  },
  notesList: {
    paddingHorizontal: 24,
    paddingBottom: 120,
    marginTop: 100,
  },
  noteItem: {
    marginVertical: 8,
  },
  gridNoteItem: {
    flex: 1,
    marginHorizontal: 6,
    maxWidth: (width - 72) / 2, // Account for padding and gap
  },
  noteContent: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 24,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 24,
    elevation: 10,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    // Add subtle backdrop blur effect
    overflow: "hidden",
  },
  gridNoteContent: {
    padding: 20,
    borderRadius: 20,
  },
  noteHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 16,
  },
  noteTitleContainer: {
    flexDirection: "row",
    flex: 1,
  },
  noteTypeIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 16,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
  gridNoteTypeIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    marginRight: 12,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
  },
  noteTitleSection: {
    flex: 1,
    justifyContent: "center",
  },
  folderStatsRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
    flexWrap: "wrap",
    gap: 8, // Add gap between items
  },
  folderStatsText: {
    fontSize: 13,
    fontFamily: "Inter-Regular",
    color: "#9CA3AF",
    marginLeft: 4,
    flex: 1,
    gap: 0,
  },
  noteTitle: {
    fontSize: 16,
    fontFamily: "Inter-Bold",
    color: "#1E293B",
    marginBottom: 4,
    lineHeight: 20,
    gap: 4,
  },
  gridNoteTitle: {
    fontSize: 15,
    lineHeight: 18,
  },
  noteOptionsContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginLeft: 12,
  },
  noteOptionsButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
  },

  noteOptionsDropdown: {
    position: "absolute",
    right: -8, // Move slightly to the right to avoid clipping
    top: 36, // Position below the kebab button
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    width: 170, // Make slightly wider
    paddingVertical: 4, // Add some padding
    shadowColor: "#1E293B",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 20, // Increased elevation for Android
    zIndex: 9999, // High z-index
  },

  gridNoteOptionsDropdown: {
    position: "absolute",
    right: -8, // Move slightly to the right to avoid clipping
    top: 32, // Position below the kebab button
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    width: 170, // Make slightly wider
    paddingVertical: 4, // Add some padding
    shadowColor: "#1E293B",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 20, // Increased elevation for Android
    zIndex: 9999, // High z-index
  },
  noteOptionItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
  },
  noteOptionText: {
    fontSize: 14,
    fontFamily: "Inter-Regular",
    color: "#1E293B",
    marginLeft: 8,
  },
  gridNoteOptionsButton: {
    position: "absolute",
    right: 8,
    top: 8,
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
  },
  notePreview: {
    fontSize: 15, // Increased from 14
    fontFamily: "Inter-Regular",
    color: "#1E293B", // Darker color than before
    lineHeight: 21,
    marginBottom: 12,
  },
  noteDate: {
    fontSize: 12,
    fontFamily: "Inter-Medium", // Changed from Regular to Medium
    color: "#64748B", // Slightly darker than before
  },
  gridNoteDate: {
    fontSize: 11,
  },
  gridNotePreview: {
    fontSize: 13, // Increased from 12
    lineHeight: 18,
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
    marginBottom: 5, // Change from marginTop to marginBottom
  },
  gridTagsContainer: {
    marginBottom: 8, // Change from marginTop to marginBottom
  },
  tag: {
    backgroundColor: "#EEF2FF",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    marginRight: 8,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: "#DDD6FE", // Light border for better definition
  },
  gridTag: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    marginRight: 6,
    marginBottom: 3,
  },
  tagText: {
    fontSize: 12, // Increased from 11
    fontFamily: "Inter-SemiBold", // Changed from Medium to SemiBold
    color: "#4F46E5", // Brighter color
  },
  gridTagText: {
    fontSize: 10, // Increased from 9
  },
  moreTagsIndicator: {
    backgroundColor: "#F1F5F9",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  noteMetaRow: {
    flexDirection: "row",
    alignItems: "center",
  },

  inlineFolderBadge: {
    flexDirection: "row",
    alignItems: "center",
    marginRight: 2,
  },

  inlineFolderText: {
    fontSize: 12, // Increased from 11
    color: "#6A009C",
    fontFamily: "Inter-SemiBold", // Changed from Medium
    marginLeft: 2,
  },

  gridMoreTagsIndicator: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
  },
  moreTagsText: {
    fontSize: 10,
    fontFamily: "Inter-Medium",
    color: "#64748B",
  },
  gridMoreTagsText: {
    fontSize: 8,
  },
  noteSeparator: {
    height: 8,
  },
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontFamily: "Inter-Bold",
    color: "#1E293B",
    marginTop: 16,
  },
  emptyStateSubtitle: {
    fontSize: 14,
    fontFamily: "Inter-Regular",
    color: "#9CA3AF",
    textAlign: "center",
    marginTop: 8,
  },
  emptyStateHint: {
    fontSize: 12,
    color: "#94A3B8",
    textAlign: "center",
    marginTop: 16,
    fontStyle: "italic",
    fontFamily: "Inter-Regular",
  },
  fabContainer: {
    position: "absolute",
    right: 24,
    bottom: 100,
    alignItems: "center",
  },
  fabButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.3,
    shadowRadius: 24,
    elevation: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
  },

  textFab: {
    backgroundColor: "#ffffff",
  },
  // Modal Styles
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
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingBottom: Platform.OS === "ios" ? 34 : 24,
    minHeight: Dimensions.get("window").height * 0.5,
    maxHeight: Dimensions.get("window").height * 0.9,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 20,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
    position: "relative",
  },
  modalTitle: {
    fontSize: 22,
    fontFamily: "Inter-Bold",
    color: "#1E293B",
    letterSpacing: -0.2,
  },
  modalCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#F8FAFC",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  unorganizedNotesCard: {
    marginBottom: 24,
    borderStyle: "dashed",
    borderWidth: 2,
    borderColor: "#CBD5E0",
    backgroundColor: "rgba(248, 250, 252, 0.6)",
    borderRadius: 20,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 12,
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
  inputLabel: {
    fontSize: 15,
    fontFamily: "Inter-Medium",
    color: "#374151",
    marginBottom: 10,
    letterSpacing: -0.1,
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
  iconSelector: {
    marginTop: 12,
    paddingBottom: 8,
  },
  iconOption: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: "#F8FAFC",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
    borderWidth: 2,
    borderColor: "#E2E8F0",
    shadowColor: "#64748B",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  selectedIconOption: {
    backgroundColor: "#6A009C",
    borderColor: "#6A009C",
    shadowColor: "#6A009C",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 4,
    transform: [{ scale: 1.05 }],
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
    flex: 1,
    backgroundColor: "#F8FAFC",
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 24,
    alignItems: "center",
    marginRight: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: "#64748B",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  cancelButtonText: {
    fontSize: 16,
    fontFamily: "Inter-Medium",
    color: "#64748B",
    letterSpacing: -0.1,
  },
  createButton: {
    flex: 1,
    backgroundColor: "#6A009C",
    borderRadius: 20,
    paddingVertical: 18,
    paddingHorizontal: 28,
    alignItems: "center",
    shadowColor: "#6A009C",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 10,
    // Add subtle gradient effect through border
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  createButtonText: {
    fontSize: 16,
    fontFamily: "Inter-Medium",
    color: "#FFFFFF",
    letterSpacing: -0.1,
  },
  optionsDropdown: {
    position: "absolute",
    top: 50,
    right: 0,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    paddingVertical: 8,
    width: 180,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
    zIndex: 100,
  },
  dropdownOption: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  dropdownOptionText: {
    fontSize: 14,
    fontFamily: "Inter-Medium",
    color: "#1E293B",
    marginLeft: 12,
  },

  loadingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.7)",
    zIndex: 1000,
  },
  errorContainer: {
    padding: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  errorText: {
    color: "#EF4444",
    fontSize: 16,
    marginBottom: 8,
    fontFamily: "Inter-Medium",
    textAlign: "center",
  },
  retryButton: {
    backgroundColor: "#6A009C",
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  retryButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontFamily: "Inter-Medium",
  },

  // New styles for note selection and sorting
  selectedNoteItem: {
    borderWidth: 2,
    borderColor: "#6A009C",
    shadowColor: "#6A009C",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
  selectionModeHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#6A009C",
    paddingVertical: 12,
    paddingHorizontal: 20,
    marginBottom: 10,
    borderRadius: 8,
  },
  selectionModeText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontFamily: "Inter-Bold",
  },
  selectionModeActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  selectionModeButton: {
    marginLeft: 12,
    padding: 8,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 8,
    minWidth: 50,
    alignItems: "center",
    justifyContent: "center",
  },
  folderBadge: {
    position: "absolute",
    left: -2,
    backgroundColor: "rgba(106, 0, 156, 0.1)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    zIndex: 5,
  },
  folderBadgeText: {
    fontSize: 10,
    color: "#6A009C",
    fontFamily: "Inter-Medium",
    marginLeft: 4,
  },

  headerBackButton: {
    marginBottom: 16,
    marginTop: -8,
  },
  backButtonContainer: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
  },
  backButtonText: {
    fontSize: 16,
    fontFamily: "Inter-Medium",
    color: "#6A009C",
  },
  createNoteButton: {
    backgroundColor: "#6A009C",
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,

    shadowColor: "#6A009C",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
  createNoteButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontFamily: "Inter-Medium",
  },
});
