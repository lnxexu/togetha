import { MaterialIcons } from "@expo/vector-icons";
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
  ToastAndroid,
  TouchableOpacity,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";


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

  // Calculate position to avoid overflow
  const buttonWidth = 120;
  const buttonHeight = 40;
  const windowWidth = Dimensions.get("window").width;
  let left = position.x - buttonWidth / 2;
  let top = position.y - buttonHeight - 10;
  if (left < 8) left = 8;
  if (left + buttonWidth > windowWidth - 8)
    left = windowWidth - buttonWidth - 8;
  if (top < 40) top = position.y + 24;

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
          size={18}
          color="#fff"
          style={{ marginRight: 6 }}
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

  // Update the useEffect hook that fetches folders to better handle the initial folder name
  useEffect(() => {
    fetchFolders();

    // Set initial folder name if we have a folder ID
    if (route.params?.initialNote?.folderId) {
      setSelectedFolderId(route.params.initialNote.folderId);
    }
  }, []);

  // Modify the fetchFolders function to ensure the folder name is updated
  const fetchFolders = async () => {
    try {
      const token = await AsyncStorage.getItem("authToken");
      if (!token) return;

      const API_URL = "http://10.0.2.2:8000";
      const response = await fetch(`${API_URL}/note_taking/folders/`, {
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
      console.error("Error fetching folders:", error);
    }
  };

  // Effects
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

  useEffect(() => {
    const autoSaveInterval = setInterval(() => {
      if (title.trim() || content.trim()) {
        handleAutoSave();
      }
    }, 30000);

    return () => {
      clearInterval(autoSaveInterval);
    };
  }, [title, content]);

  // Helper functions
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
    if (folder) {
      setSelectedFolderId(folder.id.toString());
      setFolderName(folder.name);
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
    } else if (currentColorAction === "background") {
      setBgColor(colorName);
      richTextRef.current?.setHiliteColor(colorHex);
    }
    setShowColorPicker(false);
  };

  // Storage functions
  const saveToLocalStorage = async (noteData: Note) => {
    try {
      await storage.setItem(`note-${noteData.id}`, JSON.stringify(noteData));
    } catch (e) {
      console.error("Failed to save note to storage", e);
      throw e;
    }
  };

  const syncToCloud = async (noteData: Note) => {
    try {
      const token = await AsyncStorage.getItem("authToken");
      if (!token) return;

      const API_URL = "http://10.0.2.2:8000"; // For Android emulator

      console.log("Saving note to server:", {
        id: noteData.id,
        title: noteData.title,
        content: noteData.content,
        formatted_content: noteData.formatted_content,
        tags: noteData.tags,
        folderId: noteData.folderId, // Make sure to include the folder ID
      });

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
        ? `${API_URL}/note_taking/notes/`
        : `${API_URL}/note_taking/notes/${
            route.params?.noteId || noteData.id
          }/`;

      const method = isNewNote ? "POST" : "PUT";

      console.log(`Sending ${method} request to ${url}`);

      const response = await fetch(url, {
        method: method,
        headers: {
          Authorization: `Token ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        console.error(
          "Server response not OK:",
          response.status,
          response.statusText
        );
        throw new Error("Failed to sync note");
      }

      const savedNote = await response.json();
      console.log("Note saved successfully:", savedNote);

      // If it was a new note, return the server note with its ID
      if (isNewNote) {
        return savedNote;
      }

      return null; // No need to return for existing notes
    } catch (error) {
      console.error("Error syncing note:", error);
      throw error;
    }
  };

  // Event handlers
  // Helper function to show toast notifications on both iOS and Android
  const showToast = (message: string) => {
    if (Platform.OS === "android") {
      ToastAndroid.show(message, ToastAndroid.SHORT);
    } else {
      // For iOS we'll use a temporary state and custom toast component
      // This is simplified - we're just showing the sync status in the header
      // You could implement a more sophisticated iOS toast if needed
      setSyncStatus("saved");
      setTimeout(() => {
        if (syncStatus === "saved") setSyncStatus("saved");
      }, 2000);
    }
  };

  const handleAutoSave = async () => {
    setSyncStatus("syncing");
    try {
      const currentNote = getCurrentNoteData();
      await saveToLocalStorage(currentNote);

      // Check network connectivity
      const isOnline = true; // Replace with actual network check like NetInfo.fetch()

      if (isOnline) {
        const savedNote = await syncToCloud(currentNote);

        // If we got a new ID from the server (for newly created notes)
        if (savedNote && savedNote.id && savedNote.id !== currentNote.id) {
          // We can't update noteId directly since it's coming from useState
          // But we can save the new note with the server ID
          await saveToLocalStorage({
            ...currentNote,
            id: savedNote.id,
          });

          // For the next time we save, we'll use this ID instead
          // Note: this is not perfect as the component won't rerender with the new ID
          // A better approach would be to use navigation.replace to reload the editor with the new ID
        }

        setSyncStatus("saved");
        showToast("Note auto-saved successfully");
      } else {
        setSyncStatus("offline");
        showToast("Auto-saved offline. Will sync when connected.");
      }
    } catch (error) {
      console.error("Auto-save failed:", error);
      setSyncStatus("offline");
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
        console.log("Note saved to cloud successfully");

        // If this was a new note and we received a server ID
        if (savedNote && savedNote.id && savedNote.id !== noteData.id) {
          // Save the note with the server ID before navigating back
          await saveToLocalStorage({
            ...noteData,
            id: savedNote.id,
          });
        }

        // Show toast notification instead of navigating back automatically
        showToast("Note saved successfully");

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
      console.error("Error saving note:", error);
      Alert.alert("Error", "Failed to save note. Please try again.");
    } finally {
      // Add a slight delay before enabling the save button again
      // This prevents rapid double-clicks even after save completes
      setTimeout(() => {
        setIsSaving(false);
      }, 1000);
    }
  };

  // Text selection handler
  const handleTextSelection = (
    text: string,
    position: { x: number; y: number }
  ) => {
    if (text.trim()) {
      console.log("Text selected:", text); // Debug log
      setSelectedText(text);
      setSelectionPosition(position);
      setShowRinaPopup(true);

      // Auto-hide the button after 8 seconds
      setTimeout(() => {
        setShowRinaPopup(false);
      }, 8000);
    }
  };

  const handleAskRina = (text: string) => {
    Alert.alert(
      "Ask RINA",
      `You selected: "${text}"\n\nThis would open RINA chat with the selected text.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Ask RINA",
          onPress: () => {
            // Here you would navigate to RINA chat or open a modal
            console.log("Opening RINA with text:", text);
          },
        },
      ]
    );
  };

  const addTag = () => {
    if (newTag.trim() && !tags.includes(newTag.trim())) {
      setTags((prev) => [...prev, newTag.trim()]);
      setNewTag("");
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
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => {
            // If content has changed, show confirmation dialog before exiting
            if (title.trim() || content.trim()) {
              Alert.alert(
                "Exit Editor",
                "Are you sure you want to exit the editor? Your changes have been saved.",
                [
                  { text: "Cancel", style: "cancel" },
                  { text: "Exit", onPress: () => navigation.goBack() },
                ]
              );
            } else {
              navigation.goBack();
            }
          }}
        >
          <MaterialIcons name="arrow-back" size={24} color="#007AFF" />
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <MaterialIcons
            name={getSyncStatusIcon()}
            size={16}
            color={getSyncStatusColor()}
          />
          <Text style={[styles.syncStatus, { color: getSyncStatusColor() }]}>
            {syncStatus === "syncing"
              ? "Syncing..."
              : syncStatus === "offline"
              ? "Offline"
              : "Saved"}
          </Text>
        </View>

        <View style={styles.headerActions}>
          {keyboardHeight > 0 && (
            <TouchableOpacity
              style={styles.keyboardDismissButton}
              onPress={() => {
                Keyboard.dismiss();
              }}
            >
              <MaterialIcons name="keyboard-hide" size={24} color="#007AFF" />
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[styles.saveButton, isSaving && styles.saveButtonDisabled]}
            onPress={handleSave}
            disabled={isSaving}
          >
            <MaterialIcons
              name={isSaving ? "sync" : "check"}
              size={24}
              color={isSaving ? "#A3A3A3" : "#007AFF"}
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.moreButton}
            onPress={() => setShowMoreOptions((prev) => !prev)}
          >
            <MaterialIcons name="more-vert" size={24} color="#007AFF" />
          </TouchableOpacity>

          {showMoreOptions && (
            <View style={styles.moreOptionsMenu}>
              <TouchableOpacity
                style={styles.optionItem}
                onPress={() => setShowMoreOptions(false)}
              >
                <MaterialIcons name="keyboard-voice" size={20} color="#666" />
                <Text style={styles.optionText}>Voice Recording</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.optionItem}>
                <MaterialIcons name="psychology" size={20} color="#9C27B0" />
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
                }}
              >
                <MaterialIcons name="psychology" size={20} color="#7C3AED" />
                <Text style={styles.optionText}>Demo RINA Selection</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>

      {/* Main Editor */}
      <ScrollView
        style={styles.editorContainer}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingBottom: keyboardHeight > 0 ? keyboardHeight + 60 : 100,
        }}
      >
        <TextInput
          style={styles.titleInput}
          placeholder="Note Title"
          placeholderTextColor="#A3A3A3"
          value={title}
          onChangeText={setTitle}
          maxLength={100}
        />

        {/* Tags */}
        <View style={styles.tagsSection}>
          <TouchableOpacity
            style={styles.addTagButton}
            onPress={() => setShowTagModal(true)}
          >
            <MaterialIcons name="add" size={16} color="#007AFF" />
            <Text style={styles.addTagText}>Add Tag</Text>
          </TouchableOpacity>

          <View style={styles.tagsContainer}>
            {tags.map((tag, index) => (
              <View key={index} style={styles.tag}>
                <Text style={styles.tagText}>{tag}</Text>
                <TouchableOpacity onPress={() => removeTag(tag)}>
                  <MaterialIcons name="close" size={14} color="#666" />
                </TouchableOpacity>
              </View>
            ))}
          </View>

          <View style={styles.folderSection}>
            <TouchableOpacity
              style={styles.folderSelector}
              onPress={() => setShowFolderModal(true)}
            >
              <MaterialIcons
                name="folder"
                size={18}
                color={selectedFolderId ? "#6A009C" : "#64748B"}
              />
              <Text
                style={[
                  styles.folderName,
                  { color: selectedFolderId ? "#6A009C" : "#64748B" },
                ]}
              >
                {folderName}
              </Text>
              <MaterialIcons name="chevron-right" size={18} color="#9CA3AF" />
            </TouchableOpacity>
          </View>
        </View>

        <Modal
          visible={showFolderModal}
          transparent
          animationType="slide"
          onRequestClose={() => setShowFolderModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Select Folder</Text>

              <ScrollView
                style={{ maxHeight: 300 }}
                showsVerticalScrollIndicator={false}
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
                      color="#6A009C"
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
                        color="#6A009C"
                      />
                    )}
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <TouchableOpacity
                style={[
                  styles.cancelButton,
                  { marginTop: 16, alignSelf: "center", paddingVertical: 12 },
                ]}
                onPress={() => setShowFolderModal(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* Rich Text Editor */}
        <View style={styles.editorWrapper}>
          <RichEditor
            ref={richTextRef}
            style={styles.customRichTextInput}
            initialContentHTML={
              route.params?.initialNote?.formatted_content || content
            }
            onChange={(html: string) => {
              // Update both content (plain text) and formattedContent (HTML)
              setContent(html.replace(/<[^>]*>/g, "")); // Strip HTML for plain text version
              setFormattedContent(html); // Store the full HTML for rich content
              console.log(
                "Editor content changed, formatted content:",
                html.substring(0, 50) + (html.length > 50 ? "..." : "")
              );
            }}
            placeholder="Start typing your notes here..."
            editorInitializedCallback={() => {
              console.log("Rich editor initialized - text selection enabled");
              // Log initial content for debugging
              if (route.params?.initialNote?.formatted_content) {
                console.log(
                  "Initializing with formatted content:",
                  route.params.initialNote.formatted_content.substring(0, 50) +
                    (route.params.initialNote.formatted_content.length > 50
                      ? "..."
                      : "")
                );
              }
            }}
            onCursorPosition={(scrollY: number) => {
              // This helps track cursor movement
            }}
            onMessage={(message: any) => {
              // Handle messages from the editor
              if (message.type === "selection" && message.text) {
                const text = message.text.trim();
                if (text.length > 0) {
                  handleTextSelection(text, {
                    x: message.x || 100,
                    y: message.y || 100,
                  });
                }
              }
            }}
            onSelectionChange={(data: any) => {
              // Handle text selection from the rich editor
              if (data && data.selection && data.selection.length > 0) {
                const selectedText = data.selection;
                // Get approximate position - you might need to adjust this based on your needs
                const position = { x: 150, y: 300 };
                handleTextSelection(selectedText, position);
              }
            }}
          />
        </View>
      </ScrollView>

      {/* Full-featured Rich Text Toolbar */}
      <RichToolbar
        style={styles.floatingToolbarContainer} // Removed the dynamic bottom calculation
        editor={richTextRef}
        selectedIconTint="#007AFF"
        disabledIconTint="#666"
        actions={[
          "bold",
          "italic",
          "underline",
          "strikethrough",
          "heading1",
          "heading2",
          "heading3",
          "heading4",
          "heading5",
          "heading6",
          "blockquote",
          "code",
          "line",
          "unorderedList",
          "orderedList",
          "alignLeft",
          "alignCenter",
          "alignRight",
          "alignFull",
          "undo",
          "redo",
          "insertLink",
          "insertImage",
          "foreColor",
          "hiliteColor",
          "removeFormat",
        ]}
        iconMap={{
          bold: () => <MaterialIcons name="format-bold" size={20} />,
          italic: () => <MaterialIcons name="format-italic" size={20} />,
          underline: () => <MaterialIcons name="format-underlined" size={20} />,
          strikethrough: () => (
            <MaterialIcons name="strikethrough-s" size={20} />
          ),
          heading1: () => <Text style={styles.headingText}>H1</Text>,
          heading2: () => <Text style={styles.headingText}>H2</Text>,
          heading3: () => <Text style={styles.headingText}>H3</Text>,
          heading4: () => <Text style={styles.headingText}>H4</Text>,
          heading5: () => <Text style={styles.headingText}>H5</Text>,
          heading6: () => <Text style={styles.headingText}>H6</Text>,
          blockquote: () => <MaterialIcons name="format-quote" size={20} />,
          code: () => <MaterialIcons name="code" size={20} />,
          line: () => <MaterialIcons name="horizontal-rule" size={20} />,
          unorderedList: () => (
            <MaterialIcons name="format-list-bulleted" size={20} />
          ),
          orderedList: () => (
            <MaterialIcons name="format-list-numbered" size={20} />
          ),
          alignLeft: () => <MaterialIcons name="format-align-left" size={20} />,
          alignCenter: () => (
            <MaterialIcons name="format-align-center" size={20} />
          ),
          alignRight: () => (
            <MaterialIcons name="format-align-right" size={20} />
          ),
          alignFull: () => (
            <MaterialIcons name="format-align-justify" size={20} />
          ),
          undo: () => <MaterialIcons name="undo" size={20} />,
          redo: () => <MaterialIcons name="redo" size={20} />,
          insertLink: () => <MaterialIcons name="link" size={20} />,
          insertImage: () => <MaterialIcons name="image" size={20} />,
          foreColor: () => (
            <TouchableOpacity onPress={() => openColorPicker("text")}>
              <MaterialIcons name="format-color-text" size={20} />
            </TouchableOpacity>
          ),
          hiliteColor: () => (
            <TouchableOpacity onPress={() => openColorPicker("background")}>
              <MaterialIcons name="format-color-fill" size={20} />
            </TouchableOpacity>
          ),
        }}
      />
      <Modal
        visible={showColorPicker}
        transparent={true}
        animationType="slide"
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
              style={[styles.colorPickerButton, styles.colorPickerCancelButton]}
              onPress={() => setShowColorPicker(false)}
            >
              <Text style={styles.colorPickerCancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* RINA Button for Text Selection */}
      <RinaButton
        visible={showRinaPopup}
        selectedText={selectedText}
        position={selectionPosition}
        onClose={() => setShowRinaPopup(false)}
        onAskRina={handleAskRina}
      />

      {/* Modals */}
      <Modal visible={showTagModal} transparent animationType="slide">
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
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8fafc",
    paddingBottom: 90,
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 70 : 55,
    paddingBottom: 20,
    backgroundColor: "#F5E1FD",
    borderBottomLeftRadius: 25,
    borderBottomRightRadius: 25,
    shadowColor: "#1E293B",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
    zIndex: 1000,
  },
  headerCenter: {
    flexDirection: "row",
    alignItems: "center",
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
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
    padding: 8,
  },
  keyboardDismissButton: {
    padding: 8,
    marginRight: 8,
  },
  editorContainer: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 130, // Space for the absolute positioned header
    paddingBottom: 100,
  },
  titleInput: {
    fontSize: 24,
    fontFamily: "Inter-Bold",
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
    paddingBottom: 8,
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
  tagsSection: {
    marginBottom: 16,
  },
  addTagButton: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  addTagText: {
    color: "#007AFF",
    marginLeft: 4,
    fontFamily: "Inter-Medium",
    fontSize: 14,
  },
  folderSection: {
    marginBottom: 16,
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
  folderIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  folderItemName: {
    fontSize: 16,
    fontFamily: "Inter-Medium",
    color: "#374151",
    marginLeft: 12,
    flex: 1,
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
  tagsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  tag: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#e3f2fd",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginRight: 8,
    marginBottom: 8,
  },
  tagText: {
    color: "#1976d2",
    fontSize: 12,
    marginRight: 6,
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
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 20,
    width: "80%",
    maxHeight: "70%",
  },
  modalTitle: {
    fontSize: 18,
    fontFamily: "Inter-Bold",
    marginBottom: 16,
    textAlign: "center",
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
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    fontFamily: "Inter-Regular",
    marginBottom: 16,
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "space-around",
  },
  modalActionButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: "#007AFF",
  },
  cancelButton: {
    backgroundColor: "#f5f5f5",
  },
  modalActionText: {
    color: "#fff",
    fontFamily: "Inter-Medium",
  },
  modalCancelText: {
    color: "#666",
    fontWeight: "600",
  },
  floatingToolbarContainer: {
    position: "absolute",
    left: 12,
    right: 12,
    zIndex: 1000,
    maxWidth: "100%",
    backgroundColor: "#fff",
    borderRadius: 28,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    bottom: 80, // Changed from dynamic calculation to fixed position
  },
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
  moreButton: {
    marginLeft: 10,
  },
  moreOptionsMenu: {
    position: "absolute",
    top: 50,
    right: 0,
    backgroundColor: "#fff",
    borderRadius: 6,
    paddingVertical: 4,
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    zIndex: 9999,
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
    backgroundColor: "#7C3AED",
    borderRadius: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  rinaButtonContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  rinaButtonText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 14,
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
});

export default NewNoteEditor;
