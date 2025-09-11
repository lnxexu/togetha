import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  Dimensions,
  Keyboard,
  KeyboardAvoidingView,
  KeyboardEvent,
  LayoutAnimation,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Vibration,
  Animated,
} from "react-native";
import { API_URL, API_ENDPOINTS } from "@/constants/ApiConfig";
import { LinearGradient } from "expo-linear-gradient";
import { showSuccessToast, showErrorToast, showWarningToast } from "../utils/ToastUtils";


const { RichEditor, RichToolbar } = require("react-native-pell-rich-editor");

// Types
interface NoteEditorProps {
  route: {
    params?: {
      noteId?: string;
      initialNote?: {
        title: string;
        content: string;
        formatted_content?: string; // Added formatted_content field
        tags?: string[];
        folderId?: string | null;
        createdAt?: string;
        updatedAt?: string;
      };
    };
  };
  navigation: any;
}

interface Note {
  id: string;
  title: string;
  content: string;
  formatted_content?: string;
  tags?: string[];
  folderId?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

interface RinaPopupProps {
  visible: boolean;
  selectedText: string;
  position: { x: number; y: number };
  onClose: () => void;
  onAskRina: (text: string) => void;
}

// Storage utility
const storage = {
  async setItem(key: string, value: string): Promise<void> {
    await AsyncStorage.setItem(key, value);
  },
  async getItem(key: string): Promise<string | null> {
    return await AsyncStorage.getItem(key);
  },
  async removeItem(key: string): Promise<void> {
    await AsyncStorage.removeItem(key);
  },
};

// RINA Button Component
const RinaButton: React.FC<RinaPopupProps> = ({
  visible,
  selectedText,
  position,
  onClose,
  onAskRina,
}) => {
  if (!visible || !selectedText.trim()) return null;

  // Calculate position to appear close to selected word
  const buttonWidth = 100;
  const buttonHeight = 35;
  const windowWidth = Dimensions.get("window").width;
  const windowHeight = Dimensions.get("window").height;
  
  // Position the button slightly above and to the right of the selection
  let left = position.x + 10; // 10px to the right of selection
  let top = position.y - buttonHeight - 5; // 5px above the selection
  
  // Boundary checks
  if (left + buttonWidth > windowWidth - 16) {
    left = position.x - buttonWidth - 10; // Place to the left instead
  }
  if (left < 16) left = 16;
  
  if (top < 100) { // Avoid header area
    top = position.y + 25; // Place below selection instead
  }
  if (top + buttonHeight > windowHeight - 100) {
    top = windowHeight - buttonHeight - 100;
  }

  return (
    <View
      style={[
        styles.rinaFloatingButton,
        { top, left, width: buttonWidth, height: buttonHeight },
      ]}
    >
      <TouchableOpacity
        style={styles.rinaButtonContainer}
        onPress={() => {
          onAskRina(selectedText);
          onClose();
        }}
      >
        <MaterialIcons
          name="psychology"
          size={16}
          color="#fff"
          style={{ marginRight: 4 }}
        />
        <Text style={styles.rinaButtonText}>Ask RINA</Text>
      </TouchableOpacity>
    </View>
  );
};

const NewNoteEditor: React.FC<NoteEditorProps> = ({ route, navigation }) => {
  // Refs
  const richTextRef = useRef<any>(null);

  // State
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [title, setTitle] = useState(route.params?.initialNote?.title || "");
  const [editingTitle, setEditingTitle] = useState(false);
  const [content, setContent] = useState(
    route.params?.initialNote?.content || ""
  );
  const [formattedContent, setFormattedContent] = useState(
    route.params?.initialNote?.formatted_content || ""
  );
  const [tags, setTags] = useState<string[]>(
    route.params?.initialNote?.tags || []
  );
  const [isSaving, setIsSaving] = useState(false);
  const [showMoreOptions, setShowMoreOptions] = useState(false);
  const [showTagModal, setShowTagModal] = useState(false);
  const [newTag, setNewTag] = useState("");
  const [syncStatus, setSyncStatus] = useState<"saved" | "syncing" | "offline">(
    "saved"
  );
  const [noteId] = useState(route.params?.noteId || `note_${Date.now()}`);
  const [showRinaPopup, setShowRinaPopup] = useState(false);
  const [selectedText, setSelectedText] = useState("");
  const [selectionPosition, setSelectionPosition] = useState({ x: 0, y: 0 });
  const [textColor, setTextColor] = useState("black");
  const [bgColor, setBgColor] = useState("white");
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [currentColorAction, setCurrentColorAction] = useState<
    "text" | "background" | null
  >(null);
  const [folders, setFolders] = useState<any[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(
    route.params?.initialNote?.folderId || null
  );
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [folderName, setFolderName] = useState<string>("Unorganized Notes");
  const [showExitConfirmModal, setShowExitConfirmModal] = useState(false);
  const [showWordMeaningModal, setShowWordMeaningModal] = useState(false);
  const [selectedWord, setSelectedWord] = useState("");
  const [wordMeaning, setWordMeaning] = useState("");
  const [isLoadingMeaning, setIsLoadingMeaning] = useState(false);
  const [windowDimensions, setWindowDimensions] = useState(Dimensions.get('window'));

  // Animation states
  const fadeAnim = useState(new Animated.Value(0))[0];
  const slideAnim = useState(new Animated.Value(-50))[0];

  // Update the useEffect hook that fetches folders to better handle the initial folder name
  useEffect(() => {
    fetchFolders();

    // Set initial folder name if we have a folder ID
    if (route.params?.initialNote?.folderId) {
      setSelectedFolderId(route.params.initialNote.folderId);
    }

    // Animate entrance
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
  }, []);

  // Modify the fetchFolders function to ensure the folder name is updated
  const fetchFolders = async () => {
    try {
      const token = await AsyncStorage.getItem("authToken");
      if (!token) {
        showErrorToast("Authentication required. Please log in again.");
        return;
      }

      const response = await fetch(`${API_URL}${API_ENDPOINTS.NOTE_FOLDERS}`, {
        method: "GET",
        headers: {
          Authorization: `Token ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error("Failed to fetch folders");
      }

      const data = await response.json();
      setFolders(data);

      // Update folder name if we have a selected folder
      if (selectedFolderId) {
        const selectedFolder = data.find(
          (f: any) => f.id.toString() === selectedFolderId
        );
        if (selectedFolder) {
          setFolderName(selectedFolder.name);
        }
      }
    } catch (error) {
      showErrorToast("Failed to load folders. Please try again.");
    }
  };

  // Effects
  useEffect(() => {
    const subscription = Dimensions.addEventListener('change', ({ window }) => {
      setWindowDimensions(window);
    });

    return () => subscription?.remove();
  }, []);

  useEffect(() => {
    const keyboardDidShowListener = Keyboard.addListener(
      "keyboardDidShow",
      (e: KeyboardEvent) => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setKeyboardHeight(e.endCoordinates.height);
      }
    );
    const keyboardDidHideListener = Keyboard.addListener(
      "keyboardDidHide",
      () => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setKeyboardHeight(0);
      }
    );

    return () => {
      keyboardDidShowListener.remove();
      keyboardDidHideListener.remove();
    };
  }, []);

  // Auto-save logic similar to DrawingEditor - debounced after 1 second
  useEffect(() => {
    if (title.trim() || content.trim() || formattedContent.trim()) {
      setSyncStatus("syncing");
      
      const timeoutId = setTimeout(() => {
        handleAutoSave();
      }, 1000); // 1 second auto-save like drawing editor

      return () => {
        clearTimeout(timeoutId);
      };
    }
  }, [title, content, formattedContent, selectedFolderId, tags]);

  // Helper functions
  const getWordMeaning = async (word: string) => {
    setIsLoadingMeaning(true);
    try {
      // You can integrate with the existing chatbot service here
      // For now, using a mock implementation
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Mock response - replace with actual API call
      const mockMeanings: { [key: string]: string } = {
        "hello": "A greeting; an expression or gesture of greeting — used interjectionally in greeting, in answering the telephone, or to express surprise.",
        "world": "The earth with its inhabitants and all things upon it; the universe; a particular group of living things.",
        "example": "A thing characteristic of its kind or illustrating a general rule; a person or thing regarded in terms of their fitness to be imitated.",
        "technology": "The application of scientific knowledge for practical purposes, especially in industry.",
        "innovation": "The action or process of innovating; a new method, idea, product, etc.",
        "collaborate": "To work jointly on an activity, especially to produce or create something.",
      };
      
      const meaning = mockMeanings[word.toLowerCase()] || 
        `${word}: A word or term that may have various meanings depending on context. This is a placeholder definition - integrate with a real dictionary API for accurate meanings.`;
      
      setWordMeaning(meaning);
      
      // TODO: Replace with actual RINA/Dictionary API integration
      // Example of how you might integrate with existing chatbot service:
      /*
      const prompt = `Define the word "${word}" in a concise and clear way. Provide the meaning, pronunciation if relevant, and a simple example of usage.`;
      const response = await chatbotService.sendMessage(prompt);
      setWordMeaning(response);
      */
      
    } catch (error) {
      setWordMeaning("Sorry, couldn't fetch the meaning of this word. Please try again.");
    } finally {
      setIsLoadingMeaning(false);
    }
  };

  const handleLongPressWord = (word: string) => {
    const cleanWord = word.replace(/[^\w]/g, '').toLowerCase();
    if (cleanWord.length > 0) {
      setSelectedWord(cleanWord);
      setShowWordMeaningModal(true);
      getWordMeaning(cleanWord);
    }
  };

  const isTablet = windowDimensions.width >= 768;
  const isSmallPhone = windowDimensions.width < 375;

  const basicColors = [
    { name: "black", hex: "#000000" },
    { name: "white", hex: "#FFFFFF" },
    { name: "red", hex: "#FF0000" },
    { name: "green", hex: "#00FF00" },
    { name: "blue", hex: "#0000FF" },
    { name: "yellow", hex: "#FFFF00" },
    { name: "orange", hex: "#FFA500" },
    { name: "purple", hex: "#800080" },
    { name: "gray", hex: "#808080" },
    { name: "brown", hex: "#A52A2A" },
    { name: "pink", hex: "#FFC0CB" },
    { name: "cyan", hex: "#00FFFF" },
  ];

  const handleFolderSelect = (folder: any | null) => {
    // Add haptic feedback for better UX
    if (Platform.OS === 'ios') {
      Vibration.vibrate(10);
    }
    
    if (folder) {
      setSelectedFolderId(folder.id.toString());
      setFolderName(folder.name);
      showSuccessToast(`Moved to folder "${folder.name}"`);
    } else {
      setSelectedFolderId(null);
      setFolderName("Unorganized Notes");
    }
    setShowFolderModal(false);
  };

  const getCurrentNoteData = (): Note => {
    return {
      id: noteId,
      title,
      content,
      formatted_content: formattedContent,
      tags,
      folderId: selectedFolderId, // Include the selected folder ID
      createdAt:
        route.params?.initialNote?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  };

  const openColorPicker = (type: "text" | "background") => {
    setCurrentColorAction(type);
    setShowColorPicker(true);
  };

  const applyColor = (colorName: string, colorHex: string) => {
    if (currentColorAction === "text") {
      setTextColor(colorName);
      richTextRef.current?.setForeColor(colorHex);
      showSuccessToast(`Text color changed to ${colorName}`);
    } else if (currentColorAction === "background") {
      setBgColor(colorName);
      richTextRef.current?.setHiliteColor(colorHex);
      showSuccessToast(`Background color changed to ${colorName}`);
    }
    setShowColorPicker(false);
  };

  // Storage functions
  const saveToLocalStorage = async (noteData: Note) => {
    try {
      await storage.setItem(`note-${noteData.id}`, JSON.stringify(noteData));
    } catch (e) {
      showErrorToast("Failed to save note locally");
      throw e;
    }
  };

  const syncToCloud = async (noteData: Note) => {
    try {
      const token = await AsyncStorage.getItem("authToken");
      if (!token) return;
      // Prepare the request body
      const requestBody = {
        title: noteData.title,
        content: noteData.content,
        formatted_content: noteData.formatted_content,
        tag_names: noteData.tags || [],
        folder: noteData.folderId, // Send folder ID to the backend
      };

      // Check if this is a new note or an existing note
      const isNewNote =
        !route.params?.noteId || noteData.id.startsWith("note_");

      const url = isNewNote
        ? `${API_URL}${API_ENDPOINTS.NOTES}`
        : `${API_URL}${API_ENDPOINTS.NOTES}${route.params?.noteId || noteData.id}/`;

      const method = isNewNote ? "POST" : "PUT";

      const response = await fetch(url, {
        method: method,
        headers: {
          Authorization: `Token ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        throw new Error("Failed to sync note");
      }

      const savedNote = await response.json();

      // If it was a new note, return the server note with its ID
      if (isNewNote) {
        return savedNote;
      }

      return null; // No need to return for existing notes
    } catch (error) {
      showErrorToast("Failed to sync note to cloud");
      throw error;
    }
  };

  // Event handlers
  const handleAutoSave = async () => {
    if (!title.trim() && !content.trim() && !formattedContent.trim()) {
      setSyncStatus("saved");
      return;
    }

    try {
      const currentNote = getCurrentNoteData();
      await saveToLocalStorage(currentNote);

      // Check network connectivity
      const isOnline = true; // Replace with actual network check like NetInfo.fetch()

      if (isOnline) {
        const savedNote = await syncToCloud(currentNote);

        // If we got a new ID from the server (for newly created notes)
        if (savedNote && savedNote.id && savedNote.id !== currentNote.id) {
          await saveToLocalStorage({
            ...currentNote,
            id: savedNote.id,
          });
        }

        setSyncStatus("saved");
        // Only show toast when leaving the editor, not during auto-save
        // showSuccessToast("Note auto-saved successfully");
      } else {
        setSyncStatus("offline");
        // showWarningToast("Auto-saved offline. Will sync when connected.");
      }
    } catch (error) {
      setSyncStatus("offline");
      // showErrorToast("Auto-save failed. Please check your connection.");
    }
  };

  const handleSave = async () => {
    // Prevent duplicate saves by checking if already saving
    if (isSaving) {
      return;
    }

    setIsSaving(true);
    try {
      const noteData = getCurrentNoteData();
      await saveToLocalStorage(noteData);

      // Check network connectivity
      const isOnline = true; // Replace with actual network check like NetInfo.fetch()

      if (isOnline) {
        const savedNote = await syncToCloud(noteData);
        // Note saved to cloud successfully

        // If this was a new note and we received a server ID
        if (savedNote && savedNote.id && savedNote.id !== noteData.id) {
          // Save the note with the server ID before navigating back
          await saveToLocalStorage({
            ...noteData,
            id: savedNote.id,
          });
        }

        // Show toast notification instead of navigating back automatically
        showSuccessToast("Note saved successfully");

        // Update sync status in header
        setSyncStatus("saved");
      } else {
        Alert.alert(
          "Offline",
          "Note saved locally. It will sync when you're back online."
        );
        setSyncStatus("offline");
      }

      // Don't automatically navigate back - let the user continue editing
      // navigation.goBack();
    } catch (error) {
      showErrorToast("Failed to save note. Please try again.");
    } finally {
      // Add a slight delay before enabling the save button again
      // This prevents rapid double-clicks even after save completes
      setTimeout(() => {
        setIsSaving(false);
      }, 1000);
    }
  };

  // Text selection handler - now only stores selection, doesn't show popup
  const handleTextSelection = (
    text: string,
    position: { x: number; y: number }
  ) => {
    if (text.trim()) {
      setSelectedText(text);
      setSelectionPosition(position);
      // Don't show popup automatically - only show "Ask Rina" floating button
      setShowRinaPopup(true);

      // Auto-hide the button after 8 seconds
      setTimeout(() => {
        setShowRinaPopup(false);
      }, 8000);
    }
  };

  const handleAskRina = (text: string) => {
    // Show word meaning modal instead of alert
    const cleanWord = text.replace(/[^\w]/g, '').toLowerCase();
    if (cleanWord.length > 0) {
      setSelectedWord(cleanWord);
      setShowWordMeaningModal(true);
      getWordMeaning(cleanWord);
      // Add haptic feedback
      if (Platform.OS === 'ios') {
        Vibration.vibrate(10);
      }
    }
  };

  const addTag = () => {
    if (newTag.trim() && !tags.includes(newTag.trim())) {
      // Add haptic feedback
      if (Platform.OS === 'ios') {
        Vibration.vibrate(10);
      }
      setTags((prev) => [...prev, newTag.trim()]);
      setNewTag("");
      showSuccessToast(`Tag "${newTag.trim()}" added successfully`);
    } else if (tags.includes(newTag.trim())) {
      showWarningToast("Tag already exists");
    } else {
      showErrorToast("Please enter a valid tag name");
    }
  };

  const removeTag = (tagToRemove: string) => {
    setTags((prev) => prev.filter((tag) => tag !== tagToRemove));
  };

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
        return "#FF9500";
      case "offline":
        return "#FF3B30";
      default:
        return "#34C759";
    }
  };

  // Render
  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <Animated.View 
        style={[
          styles.rootContainer,
          {
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }],
          },
        ]}
      >
        {/* Header with LinearGradient positioned behind content */}
        <LinearGradient
          colors={["#A855F7", "#8B5CF6", "#7C3AED"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.header}
        >
          <View style={styles.headerContent}>
            <View style={styles.headerTopRow}>
              <TouchableOpacity
                style={styles.backButton}
                onPress={() => {
                  // If content has changed, show toast and exit
                  if (title.trim() || content.trim()) {
                    showSuccessToast("Note saved automatically");
                    // Add haptic feedback
                    if (Platform.OS === 'ios') {
                      Vibration.vibrate(10);
                    }
                  }
                  navigation.goBack();
                }}
              >
                <Ionicons name="chevron-back" size={24} color="#fff" />
              </TouchableOpacity>

              <View style={styles.headerTitleSection}>
                {editingTitle ? (
                  <TextInput
                    style={styles.modernTitleInput}
                    value={title}
                    onChangeText={setTitle}
                    onBlur={() => setEditingTitle(false)}
                    onSubmitEditing={() => setEditingTitle(false)}
                    placeholder="Enter note title"
                    placeholderTextColor="rgba(255,255,255,0.6)"
                    maxLength={50}
                    autoFocus
                    returnKeyType="done"
                  />
                ) : (
                  <TouchableOpacity
                    style={styles.titleTouchable}
                    onPress={() => setEditingTitle(true)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.headerTitle}>{title || "Untitled Note"}</Text>
                    <MaterialIcons
                      name="edit"
                      size={16}
                      color="rgba(255,255,255,0.8)"
                      style={styles.editIcon}
                    />
                  </TouchableOpacity>
                )}
                
                {/* Save Status under title */}
                <View style={styles.headerCenter}>
                  <MaterialIcons
                    name={getSyncStatusIcon()}
                    size={16}
                    color={getSyncStatusColor()}
                  />
                  <Text
                    style={[styles.syncStatus, { color: getSyncStatusColor() }]}
                  >
                    {syncStatus === "syncing"
                      ? "Syncing..."
                      : syncStatus === "offline"
                      ? "Offline"
                      : "Saved"}
                  </Text>
                </View>
              </View>

              <View style={styles.headerActions}>
                {keyboardHeight > 0 && (
                  <TouchableOpacity
                    style={styles.keyboardDismissButton}
                    onPress={() => {
                      Keyboard.dismiss();
                      // Add haptic feedback
                      if (Platform.OS === 'ios') {
                        Vibration.vibrate(10);
                      }
                    }}
                  >
                    <MaterialIcons
                      name="keyboard-hide"
                      size={20}
                      color="#fff"
                    />
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={[
                    styles.saveButton,
                    isSaving && styles.saveButtonDisabled,
                  ]}
                  onPress={handleSave}
                  disabled={isSaving}
                >
                  <MaterialIcons
                    name={isSaving ? "sync" : "check"}
                    size={20}
                    color="#fff"
                  />
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.moreButton}
                  onPress={() => setShowMoreOptions((prev) => !prev)}
                >
                  <MaterialIcons name="more-vert" size={20} color="#fff" />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </LinearGradient>

        {/* Main Content Container positioned above header */}
        <View style={styles.mainContentContainer}>
          <ScrollView
            style={styles.content}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{
              paddingBottom: keyboardHeight > 0 ? keyboardHeight + 40 : 40,
              flexGrow: 1,
            }}
          >
            {/* Modern Compact Header */}
            <View style={styles.compactHeaderInfo}>
              {/* Folder and Add Tag Row */}
              <View style={styles.compactMetadata}>
                <View style={styles.folderSection}>
                  <TouchableOpacity
                    style={styles.compactFolderSelector}
                    onPress={() => setShowFolderModal(true)}
                  >
                    <MaterialIcons name="folder" size={16} color="#8B5CF6" />
                    <Text style={styles.compactFolderText}>{folderName}</Text>
                    <MaterialIcons name="keyboard-arrow-down" size={16} color="#8B5CF6" />
                  </TouchableOpacity>
                </View>

                <View style={styles.tagSection}>
                  <TouchableOpacity
                    style={styles.addTagButton}
                    onPress={() => setShowTagModal(true)}
                  >
                    <MaterialIcons name="add" size={14} color="#8B5CF6" />
                    <Text style={styles.addTagText}>Tag</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Tags Display Row - Separate row to prevent congestion */}
              {tags.length > 0 && (
                <View style={styles.tagsDisplayContainer}>
                  <ScrollView 
                    horizontal 
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.tagsScrollContent}
                  >
                    {tags.map((tag, index) => (
                      <View key={index} style={styles.compactTag}>
                        <Text style={styles.compactTagText}>{tag}</Text>
                        <TouchableOpacity onPress={() => removeTag(tag)}>
                          <MaterialIcons name="close" size={12} color="#8B5CF6" />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </ScrollView>
                </View>
              )}
            </View>

            {/* Compact Rich Text Toolbar */}
            <View style={styles.compactToolbarContainer}>
              <View style={styles.toolbarContentWrapper}>
                <RichToolbar
                  style={styles.compactRichTextToolbar}
                  editor={richTextRef}
                  selectedIconTint="#8B5CF6"
                  disabledIconTint="#9CA3AF"
                  actions={[
                    "bold",
                    "italic",
                    "underline",
                    "unorderedList",
                    "orderedList",
                    "alignLeft",
                    "alignCenter",
                    "alignRight",
                    "undo",
                    "redo",
                    "foreColor",
                    "hiliteColor",
                  ]}
                  iconMap={{
                    bold: () => <MaterialIcons name="format-bold" size={18} color="#6B7280" />,
                    italic: () => <MaterialIcons name="format-italic" size={18} color="#6B7280" />,
                    underline: () => <MaterialIcons name="format-underlined" size={18} color="#6B7280" />,
                    unorderedList: () => <MaterialIcons name="format-list-bulleted" size={18} color="#6B7280" />,
                    orderedList: () => <MaterialIcons name="format-list-numbered" size={18} color="#6B7280" />,
                    alignLeft: () => <MaterialIcons name="format-align-left" size={18} color="#6B7280" />,
                    alignCenter: () => <MaterialIcons name="format-align-center" size={18} color="#6B7280" />,
                    alignRight: () => <MaterialIcons name="format-align-right" size={18} color="#6B7280" />,
                    undo: () => <MaterialIcons name="undo" size={18} color="#6B7280" />,
                    redo: () => <MaterialIcons name="redo" size={18} color="#6B7280" />,
                    foreColor: () => (
                      <TouchableOpacity onPress={() => openColorPicker("text")}>
                        <MaterialIcons name="format-color-text" size={18} color="#6B7280" />
                      </TouchableOpacity>
                    ),
                    hiliteColor: () => (
                      <TouchableOpacity onPress={() => openColorPicker("background")}>
                        <MaterialIcons name="format-color-fill" size={18} color="#6B7280" />
                      </TouchableOpacity>
                    ),
                  }}
                />
              </View>
            </View>

            {/* Enhanced Rich Text Editor with more space */}
            <View style={[styles.modernEditorWrapper, { 
              minHeight: isTablet ? 600 : isSmallPhone ? 400 : 500,
              maxHeight: windowDimensions.height - 350 // Prevent uncontrolled resizing
            }]}>
              <RichEditor
                ref={richTextRef}
                style={[styles.modernRichTextInput, { 
                  minHeight: isTablet ? 600 : isSmallPhone ? 400 : 500,
                  maxHeight: windowDimensions.height - 350
                }]}
                initialContentHTML={
                  route.params?.initialNote?.formatted_content || content
                }
                onChange={(html: string) => {
                  setContent(html.replace(/<[^>]*>/g, ""));
                  setFormattedContent(html);
                }}
                placeholder="Start writing your note here..."
                editorInitializedCallback={() => {
                  // Rich editor initialized
                }}
                onMessage={(message: any) => {
                  try {
                    const data = typeof message === 'string' ? JSON.parse(message) : message;
                    
                    if (data.type === "selection" && data.text) {
                      const text = data.text.trim();
                      if (text.length > 0) {
                        handleTextSelection(text, {
                          x: data.x || 100,
                          y: data.y || 100,
                        });
                      }
                    } else if (data.type === "longpress" && data.word) {
                      const word = data.word.trim();
                      if (word.length > 0) {
                        // Add haptic feedback
                        if (Platform.OS === 'ios') {
                          Vibration.vibrate([10, 100, 10]);
                        }
                        
                        // Only store selected word and show Ask Rina button, don't show word meaning modal
                        setSelectedText(word);
                        setSelectionPosition({
                          x: data.x || 100,
                          y: data.y || 100,
                        });
                        setShowRinaPopup(true);

                        // Auto-hide the button after 8 seconds
                        setTimeout(() => {
                          setShowRinaPopup(false);
                        }, 8000);
                      }
                    }
                  } catch (error) {
                    // Fallback to original message handling
                    if (message.type === "selection" && message.text) {
                      const text = message.text.trim();
                      if (text.length > 0) {
                        handleTextSelection(text, {
                          x: message.x || 100,
                          y: message.y || 100,
                        });
                      }
                    }
                  }
                }}
                onSelectionChange={(data: any) => {
                  if (data && data.selection && data.selection.length > 0) {
                    const selectedText = data.selection;
                    const position = { x: 150, y: 300 };
                    // Only store selection, don't show popup automatically
                    setSelectedText(selectedText);
                    setSelectionPosition(position);
                    setShowRinaPopup(true);

                    // Auto-hide the button after 8 seconds
                    setTimeout(() => {
                      setShowRinaPopup(false);
                    }, 8000);
                  }
                }}
                // Enhanced text interaction handling
                onCursorPositionChange={(data: any) => {
                  // Handle cursor position changes if needed
                }}
                onFocus={() => {
                  // Editor focused
                }}
                onBlur={() => {
                  // Editor lost focus
                }}
                // Custom script injection for better text selection handling
                injectedJavaScript={`
                  // Enhanced text selection and long press handling
                  document.addEventListener('selectionchange', function() {
                    const selection = window.getSelection();
                    if (selection && selection.toString().trim()) {
                      const selectedText = selection.toString().trim();
                      const range = selection.getRangeAt(0);
                      const rect = range.getBoundingClientRect();
                      window.ReactNativeWebView.postMessage(JSON.stringify({
                        type: 'selection',
                        text: selectedText,
                        x: rect.left + rect.width / 2,
                        y: rect.top
                      }));
                    }
                  });
                  
                  // Enhanced long press detection for mobile
                  let pressTimer;
                  let touchStarted = false;
                  
                  document.addEventListener('touchstart', function(e) {
                    touchStarted = true;
                    pressTimer = window.setTimeout(function() {
                      if (touchStarted) {
                        const touch = e.touches[0];
                        const word = getWordAtPosition(touch.target, touch.clientX, touch.clientY);
                        if (word) {
                          window.ReactNativeWebView.postMessage(JSON.stringify({
                            type: 'longpress',
                            word: word,
                            x: touch.clientX,
                            y: touch.clientY
                          }));
                        }
                      }
                    }, 500);
                  });
                  
                  document.addEventListener('touchend', function(e) {
                    touchStarted = false;
                    clearTimeout(pressTimer);
                  });
                  
                  document.addEventListener('touchmove', function(e) {
                    touchStarted = false;
                    clearTimeout(pressTimer);
                  });
                  
                  // Fallback for desktop
                  document.addEventListener('mousedown', function(e) {
                    pressTimer = window.setTimeout(function() {
                      const word = getWordAtPosition(e.target, e.clientX, e.clientY);
                      if (word) {
                        window.ReactNativeWebView.postMessage(JSON.stringify({
                          type: 'longpress',
                          word: word,
                          x: e.clientX,
                          y: e.clientY
                        }));
                      }
                    }, 500);
                  });
                  
                  document.addEventListener('mouseup', function(e) {
                    clearTimeout(pressTimer);
                  });
                  
                  function getWordAtPosition(element, x, y) {
                    if (document.caretRangeFromPoint) {
                      const range = document.caretRangeFromPoint(x, y);
                      if (range) {
                        const textNode = range.startContainer;
                        if (textNode.nodeType === Node.TEXT_NODE) {
                          const text = textNode.textContent;
                          const offset = range.startOffset;
                          
                          // Find word boundaries
                          let start = offset;
                          let end = offset;
                          
                          while (start > 0 && /\\w/.test(text[start - 1])) {
                            start--;
                          }
                          
                          while (end < text.length && /\\w/.test(text[end])) {
                            end++;
                          }
                          
                          return text.substring(start, end);
                        }
                      }
                    }
                    return null;
                  }
                  
                  true; // Return true to indicate script executed successfully
                `}
              />
            </View>
          </ScrollView>
        </View>

        {/* More Options Menu - Moved to root level for proper z-index */}
        {showMoreOptions && (
          <View style={styles.moreOptionsMenu}>
            <TouchableOpacity
              style={styles.optionItem}
              onPress={() => setShowMoreOptions(false)}
            >
              <MaterialIcons name="keyboard-voice" size={20} color="#8B5CF6" />
              <Text style={styles.optionText}>Voice Recording</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.optionItem}>
              <MaterialIcons name="psychology" size={20} color="#8B5CF6" />
              <Text style={styles.optionText}>AI Suggest</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.optionItem}
              onPress={() => {
                setShowMoreOptions(false);
                // Get current content and simulate text selection
                if (content.trim()) {
                  // Extract first 50 characters as "selected" text for demo
                  const textContent = content.replace(/<[^>]*>/g, "").trim(); // Remove HTML tags
                  const selectedText =
                    textContent.slice(0, 50) +
                    (textContent.length > 50 ? "..." : "");
                  handleTextSelection(selectedText, { x: 150, y: 200 });
                } else {
                  handleTextSelection(
                    "Demo: Select text in the editor to see Ask RINA button",
                    { x: 150, y: 200 }
                  );
                }
                // Add haptic feedback
                if (Platform.OS === 'ios') {
                  Vibration.vibrate(10);
                }
              }}
            >
              <MaterialIcons name="psychology" size={20} color="#8B5CF6" />
              <Text style={styles.optionText}>Demo RINA Selection</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* RINA Button for Text Selection */}
        <RinaButton
          visible={showRinaPopup}
          selectedText={selectedText}
          position={selectionPosition}
          onClose={() => setShowRinaPopup(false)}
          onAskRina={handleAskRina}
        />

        {/* Modals remain the same... */}
        <Modal
          visible={showFolderModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowFolderModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <MaterialIcons name="folder" size={28} color="#8B5CF6" />
                <Text style={[styles.modalTitle, { marginBottom: 0, marginLeft: 12 }]}>Select Folder</Text>
              </View>

              <View
                style={{ maxHeight: 400, paddingBottom: 10 }}
              >
                {/* Unorganized Notes Option */}
                <TouchableOpacity
                  style={[
                    styles.folderItem,
                    !selectedFolderId && styles.selectedFolderItem,
                  ]}
                  onPress={() => handleFolderSelect(null)}
                >
                  <View
                    style={[styles.folderIcon, { backgroundColor: "#64748B" }]}
                  >
                    <MaterialIcons name="notes" size={20} color="#FFFFFF" />
                  </View>
                  <Text style={styles.folderItemName}>Unorganized Notes</Text>
                  {!selectedFolderId && (
                    <MaterialIcons
                      name="check-circle"
                      size={22}
                      color="#8B5CF6"
                    />
                  )}
                </TouchableOpacity>

                <View style={styles.folderDivider}>
                  <View style={styles.folderDividerLine} />
                  <Text style={styles.folderDividerText}>Folders</Text>
                  <View style={styles.folderDividerLine} />
                </View>

                {/* Folder List */}
                {folders.map((folder) => (
                  <TouchableOpacity
                    key={folder.id}
                    style={[
                      styles.folderItem,
                      selectedFolderId === folder.id.toString() &&
                        styles.selectedFolderItem,
                    ]}
                    onPress={() => handleFolderSelect(folder)}
                  >
                    <View
                      style={[
                        styles.folderIcon,
                        { backgroundColor: folder.color || "#6A009C" },
                      ]}
                    >
                      <MaterialIcons
                        name={folder.icon || "folder"}
                        size={20}
                        color="#FFFFFF"
                      />
                    </View>
                    <Text style={styles.folderItemName}>{folder.name}</Text>
                    {selectedFolderId === folder.id.toString() && (
                      <MaterialIcons
                        name="check-circle"
                        size={22}
                        color="#8B5CF6"
                      />
                    )}
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity
                style={[
                  styles.cancelButton,
                  { marginTop: 20, alignSelf: "stretch" },
                ]}
                onPress={() => setShowFolderModal(false)}
              >
                <Text style={[styles.modalCancelText, { textAlign: "center" }]}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        <Modal
          visible={showColorPicker}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setShowColorPicker(false)}
        >
          <View style={styles.colorPickerModal}>
            <View style={styles.colorPickerContainer}>
              <Text style={styles.colorPickerTitle}>
                Select {currentColorAction === "text" ? "Text" : "Background"}{" "}
                Color
              </Text>

              <View style={styles.colorGrid}>
                {basicColors.map((color) => (
                  <TouchableOpacity
                    key={color.name}
                    style={[styles.colorSwatch, { backgroundColor: color.hex }]}
                    onPress={() => applyColor(color.name, color.hex)}
                  >
                    <Text
                      style={[
                        styles.colorName,
                        { color: color.name === "black" ? "white" : "black" },
                      ]}
                    >
                      {color.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity
                style={[
                  styles.colorPickerButton,
                  styles.colorPickerCancelButton,
                ]}
                onPress={() => setShowColorPicker(false)}
              >
                <Text style={styles.colorPickerCancelButtonText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        <Modal visible={showTagModal} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Add Tag</Text>
              <TextInput
                style={styles.tagInput}
                placeholder="Enter tag name"
                value={newTag}
                onChangeText={setNewTag}
                autoFocus
              />
              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={styles.modalActionButton}
                  onPress={() => {
                    addTag();
                    setShowTagModal(false);
                  }}
                >
                  <Text style={styles.modalActionText}>Add</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalActionButton, styles.cancelButton]}
                  onPress={() => {
                    setNewTag("");
                    setShowTagModal(false);
                  }}
                >
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Word Meaning Modal */}
        <Modal
          visible={showWordMeaningModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowWordMeaningModal(false)}
        >
          <View style={styles.wordMeaningOverlay}>
            <View style={[styles.wordMeaningModal, { 
              width: isTablet ? '60%' : '90%',
              maxWidth: isTablet ? 500 : 350
            }]}>
              <View style={styles.wordMeaningHeader}>
                <MaterialIcons name="psychology" size={28} color="#8B5CF6" />
                <Text style={styles.wordMeaningTitle}>RINA Dictionary</Text>
                <TouchableOpacity
                  style={styles.wordMeaningCloseButton}
                  onPress={() => setShowWordMeaningModal(false)}
                >
                  <MaterialIcons name="close" size={24} color="#6B7280" />
                </TouchableOpacity>
              </View>
              
              <View style={styles.wordMeaningContent}>
                <Text style={styles.wordMeaningWord}>{selectedWord}</Text>
                
                {isLoadingMeaning ? (
                  <View style={styles.wordMeaningLoading}>
                    <MaterialIcons name="sync" size={24} color="#8B5CF6" />
                    <Text style={styles.wordMeaningLoadingText}>Looking up meaning...</Text>
                  </View>
                ) : (
                  <Text style={styles.wordMeaningText}>{wordMeaning}</Text>
                )}
              </View>
              
              <View style={styles.wordMeaningActions}>
                <TouchableOpacity
                  style={styles.wordMeaningActionButton}
                  onPress={() => {
                    // Add to clipboard functionality - you can import Clipboard from @react-native-clipboard/clipboard
                    // Clipboard.setString(wordMeaning);
                    showSuccessToast("Meaning copied to clipboard");
                    // Add haptic feedback
                    if (Platform.OS === 'ios') {
                      Vibration.vibrate(10);
                    }
                  }}
                >
                  <MaterialIcons name="content-copy" size={18} color="#8B5CF6" />
                  <Text style={styles.wordMeaningActionText}>Copy</Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={styles.wordMeaningActionButton}
                  onPress={() => {
                    // Insert meaning into note
                    const meaningText = `\n\n**${selectedWord}**: ${wordMeaning}\n\n`;
                    richTextRef.current?.insertHTML(meaningText);
                    setShowWordMeaningModal(false);
                    showSuccessToast("Meaning added to note");
                    // Add haptic feedback
                    if (Platform.OS === 'ios') {
                      Vibration.vibrate(10);
                    }
                  }}
                >
                  <MaterialIcons name="note-add" size={18} color="#8B5CF6" />
                  <Text style={styles.wordMeaningActionText}>Add to Note</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </Animated.View>
    </KeyboardAvoidingView>
  );
};

// Update the styles section with these changes:
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  rootContainer: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  header: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 24,
    paddingTop: Platform.OS === "ios" ? 50 : 50,
    paddingBottom: "100%",
    zIndex: 1,
  },
  headerContent: {
    flex: 1,
  },
  mainContentContainer: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    marginTop: 120, // Position it below the header
    shadowColor: "#1E293B",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 10,
    zIndex: 1000,
    overflow: "hidden",
  },
  headerTopRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.2)",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },

  headerTitleSection: {
    flex: 1,
  },
  titleTouchable: {
    alignItems: "center",
    flexDirection: "row",
  },
  editIcon: {
    marginLeft: 8,
  },
  headerTitle: {
    fontSize: 24,
    color: "#FFFFFF",
    fontFamily: "Inter-Bold",
    lineHeight: 28,
  },
  headerCenter: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 2,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  content: {
    flex: 1,
    paddingTop: 20,
    paddingHorizontal: Platform.select({ ios: 16, android: 12 }),
    paddingBottom: 20,
  },
  
  // Modern compact styles
  compactHeaderInfo: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: Platform.select({ ios: 20, android: 16 }),
    marginBottom: 16,
    shadowColor: "#8B5CF6",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    borderColor: "#F3F4F6",
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
  tagsDisplayContainer: {
    marginTop: 8,
    maxHeight: 60,
  },
  tagsScrollContent: {
    paddingRight: 16,
  },
  equalSpaceSection: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    flexWrap: "wrap",
    justifyContent: "center",
  },
  leftMetadataSection: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    flexWrap: "wrap",
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
    minWidth: 60, // Minimum width for readability
    maxWidth: 100, // Prevent tags from taking too much space
  },
  compactTagText: {
    color: "#8B5CF6",
    fontSize: 12,
    fontFamily: "Inter-Medium",
    marginRight: 4,
    flexShrink: 1,
  },
  compactToolbarContainer: {
    backgroundColor: "#F8FAFC",
    borderRadius: 12,
    marginBottom: 16,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  toolbarContentWrapper: {
    paddingHorizontal: 8,
  },
  compactRichTextToolbar: {
    backgroundColor: "transparent",
    borderRadius: 0,
    shadowColor: "transparent",
    elevation: 0,
    borderWidth: 0,
    minHeight: 40,
  },
  modernEditorWrapper: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    shadowColor: "#8B5CF6",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
    overflow: "hidden",
  },
  modernRichTextInput: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    fontSize: Platform.select({ ios: 16, android: 15 }),
    color: "#1F2937",
    fontFamily: "Inter-Regular",
    padding: Platform.select({ ios: 20, android: 16 }),
    lineHeight: Platform.select({ ios: 24, android: 22 }),
    borderWidth: 0,
  },
  voiceButton: {
    padding: 10,
    borderRadius: 20,
    marginRight: 8,
    flexDirection: "row",
    alignItems: "center",
  },
  voiceButtonRecording: {
    backgroundColor: "#FF3B30",
  },
  syncStatus: {
    fontSize: 12,
    marginLeft: 4,
    fontWeight: "500",
  },
  saveButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    justifyContent: "center",
    alignItems: "center",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
  },
  keyboardDismissButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    justifyContent: "center",
    alignItems: "center",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  moreButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    justifyContent: "center",
    alignItems: "center",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
  },
  editorContainer: {
     flex: 1,
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    paddingHorizontal: 16,
    paddingTop: 50, // Reduced space since header is behind
    paddingBottom: 100,
    marginTop: 120, // Position it below the header
    shadowColor: "#1E293B",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 10,
    zIndex: 1000,
    overflow: "hidden",
  },

  metadataSection: {
    flexDirection: "row",
    marginBottom: 16,
  },
  metadataItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f5f5f5",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    marginRight: 12,
  },
  metadataText: {
    marginLeft: 6,
    color: "#666",
    fontSize: 14,
    fontFamily: "Inter-Regular",
  },
  folderModalSection: {
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
    paddingBottom: 16,
  },
  folderSelector: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  folderName: {
    flex: 1,
    marginLeft: 8,
    fontFamily: "Inter-Medium",
    fontSize: 14,
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
  folderDivider: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    marginVertical: 16,
  },
  folderDividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "#E5E7EB",
  },
  folderDividerText: {
    fontSize: 15,
    fontFamily: "Inter-SemiBold",
    color: "#6B7280",
    marginHorizontal: 16,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 12,
    color: "#333",
  },
  customRichTextInput: {
    flex: 1,
    minHeight: 300,
    backgroundColor: "#fff",
    borderRadius: 8,
    fontSize: 16,
    color: "#333",
    fontFamily: "Inter-Regular",
    borderWidth: 0,
    width: "100%",
  },
  recordingItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  recordingInfo: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  recordingDetails: {
    marginLeft: 8,
    flex: 1,
  },
  transcriptionPreview: {
    color: "#666",
    fontSize: 12,
    marginTop: 4,
  },
  recordingText: {
    marginLeft: 8,
    color: "#666",
    fontSize: 14,
  },
  recordingActions: {
    flexDirection: "row",
    alignItems: "center",
  },
  recordingButton: {
    padding: 8,
    marginLeft: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.65)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
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
  modalTitle: {
    fontSize: 24,
    fontFamily: "Inter-Bold",
    color: "#1F2937",
    marginBottom: 24,
    textAlign: "center",
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
  modalItem: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  modalItemText: {
    fontSize: 16,
    color: "#333",
    fontFamily: "Inter-Regular",
  },
  modalItemSubtext: {
    fontSize: 14,
    fontFamily: "Inter-Regular",
    color: "#666",
    marginTop: 4,
  },
  modalCloseButton: {
    marginTop: 16,
    alignItems: "center",
  },
  modalCloseText: {
    color: "#007AFF",
    fontSize: 16,
    fontFamily: "Inter-Medium",
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
  modalActionText: {
    color: "#fff",
    fontFamily: "Inter-SemiBold",
    fontSize: 17,
  },
  modalCancelText: {
    color: "#6B7280",
    fontFamily: "Inter-SemiBold",
    fontSize: 17,
  },
  // Rich Text Toolbar Styles (similar to Drawing Toolbar)

  headingText: {
    fontSize: 14,
    fontWeight: "bold",
  },
  editorWrapper: {
    flex: 1,
    marginBottom: 20,
    borderWidth: 0,
    backgroundColor: "#fff",
    borderRadius: 8,
    minHeight: 300,
    width: "100%",
  },
  moreOptionsMenu: {
    position: "absolute",
    top: Platform.OS === "ios" ? 120 : 105, // Adjust for header height
    right: 24, // Match header padding
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 4,
    minWidth: 200,
    elevation: 25, // Very high elevation for Android
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    zIndex: 999999, // Extremely high z-index
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
  },
  optionItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  optionText: {
    marginLeft: 10,
    fontSize: 14,
    fontFamily: "Inter-Regular",
    color: "#333",
  },
  previewOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.95)",
  },
  previewHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 50,
    paddingHorizontal: 20,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.1)",
  },
  previewHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  previewHeaderTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
    marginLeft: 8,
    flex: 1,
  },
  previewCloseButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  previewContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  imagePreviewContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    minHeight: "100%",
  },
  previewImage: {
    width: "100%",
    height: "100%",
    maxWidth: "90%",
    maxHeight: "80%",
  },
  previewDocument: {
    alignItems: "center",
    padding: 40,
  },
  // RINA Button Styles
  rinaFloatingButton: {
    position: "absolute",
    zIndex: 9999,
    backgroundColor: "#8B5CF6",
    borderRadius: 18,
    shadowColor: "#8B5CF6",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 6,
  },
  rinaButtonContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  rinaButtonText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 12,
  },
  colorPickerModal: {
    flex: 1,
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
    padding: 20,
  },
  colorPickerContainer: {
    backgroundColor: "white",
    borderRadius: 8,
    padding: 20,
  },
  colorPickerTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 16,
    textAlign: "center",
  },
  colorPreview: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  colorPreviewBox: {
    width: 50,
    height: 50,
    borderRadius: 8,
    marginRight: 10,
    borderWidth: 1,
    borderColor: "#ddd",
  },
  colorHexText: {
    fontSize: 16,
    fontFamily: "monospace",
  },
  colorChannelLabel: {
    fontSize: 14,
    marginTop: 10,
  },
  colorSlider: {
    width: "100%",
    height: 40,
  },
  colorPickerActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 20,
  },
  colorPickerButton: {
    backgroundColor: "#007AFF",
    padding: 12,
    borderRadius: 8,
    flex: 1,
    marginHorizontal: 8,
    alignItems: "center",
  },
  colorPickerButtonText: {
    color: "white",
    fontWeight: "bold",
  },
  colorPickerCancelButton: {
    backgroundColor: "#f5f5f5",
  },
  colorPickerCancelButtonText: {
    color: "#666",
    fontWeight: "bold",
  },
  colorGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    marginBottom: 20,
  },
  colorSwatch: {
    width: 80,
    height: 80,
    margin: 8,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#ddd",
  },
  colorName: {
    fontSize: 12,
    fontWeight: "bold",
    textAlign: "center",
  },
  saveButtonDisabled: {
    backgroundColor: "#f5f5f5",
    opacity: 0.6,
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
  
  // Word Meaning Modal Styles
  wordMeaningOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  wordMeaningModal: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 24,
    maxHeight: "70%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 10,
  },
  wordMeaningHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  wordMeaningTitle: {
    fontSize: 20,
    fontFamily: "Inter-Bold",
    color: "#1F2937",
    flex: 1,
    marginLeft: 12,
  },
  wordMeaningCloseButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#F3F4F6",
    justifyContent: "center",
    alignItems: "center",
  },
  wordMeaningContent: {
    marginBottom: 20,
  },
  wordMeaningWord: {
    fontSize: 24,
    fontFamily: "Inter-Bold",
    color: "#8B5CF6",
    marginBottom: 12,
    textAlign: "center",
  },
  wordMeaningLoading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  wordMeaningLoadingText: {
    fontSize: 16,
    fontFamily: "Inter-Medium",
    color: "#6B7280",
    marginLeft: 12,
  },
  wordMeaningText: {
    fontSize: 16,
    fontFamily: "Inter-Regular",
    color: "#374151",
    lineHeight: 24,
    textAlign: "justify",
  },
  wordMeaningActions: {
    flexDirection: "row",
    gap: 12,
  },
  wordMeaningActionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: "#F8FAFC",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  wordMeaningActionText: {
    fontSize: 14,
    fontFamily: "Inter-Medium",
    color: "#8B5CF6",
    marginLeft: 8,
  },
});

export default NewNoteEditor;
