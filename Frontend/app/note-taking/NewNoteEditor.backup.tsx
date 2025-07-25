
import { MaterialIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  Dimensions,
  FlatList,
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
} from "react-native";

const { RichEditor, RichToolbar } = require("react-native-pell-rich-editor");

// Types
interface NoteEditorProps {
  route: {
    params?: {
      noteId?: string;
      initialNote?: {
        title: string;
        content: string;
        tags?: string[];
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
  tags?: string[];
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

type ColorChannel = "r" | "g" | "b";

// Constants

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

// PDF Annotation Toolbar Component
const PDFAnnotationToolbar = ({
  onHighlight,
  onNote,
  onUnderline,
  onStrikethrough,
  onClose,
  selectedColor,
  onColorChange,
}: {
  onHighlight: () => void;
  onNote: () => void;
  onUnderline: () => void;
  onStrikethrough: () => void;
  onClose: () => void;
  selectedColor: string;
  onColorChange: (color: string) => void;
}) => {
  const colors = [
    "#FFFF00",
    "#FF6B6B",
    "#4ECDC4",
    "#45B7D1",
    "#96CEB4",
    "#FFEAA7",
  ];

  return (
    <View style={styles.pdfToolbar}>
      <TouchableOpacity style={styles.pdfToolButton} onPress={onHighlight}>
        <MaterialIcons name="format-color-fill" size={20} color="#333" />
        <Text style={styles.pdfToolText}>Highlight</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.pdfToolButton} onPress={onNote}>
        <MaterialIcons name="sticky-note-2" size={20} color="#333" />
        <Text style={styles.pdfToolText}>Note</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.pdfToolButton} onPress={onUnderline}>
        <MaterialIcons name="format-underlined" size={20} color="#333" />
        <Text style={styles.pdfToolText}>Underline</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.pdfToolButton} onPress={onStrikethrough}>
        <MaterialIcons name="strikethrough-s" size={20} color="#333" />
        <Text style={styles.pdfToolText}>Strike</Text>
      </TouchableOpacity>

      <View style={styles.colorPalette}>
        {colors.map((color) => (
          <TouchableOpacity
            key={color}
            style={[
              styles.colorButton,
              { backgroundColor: color },
              selectedColor === color && styles.selectedColorButton,
            ]}
            onPress={() => onColorChange(color)}
          />
        ))}
      </View>

      <TouchableOpacity style={styles.pdfCloseButton} onPress={onClose}>
        <MaterialIcons name="close" size={20} color="#666" />
      </TouchableOpacity>
    </View>
  );
};

// Enhanced PDF Viewer with Annotation Support
const PDFViewerModal = ({
  attachment,
  onClose,
  onAnnotation,
}: {
  attachment: Attachment | null;
  onClose: () => void;
  onAnnotation: (annotation: PDFAnnotation) => void;
}) => {
  const [showToolbar, setShowToolbar] = useState(false);
  const [selectedText, setSelectedText] = useState("");
  const [selectionPosition, setSelectionPosition] = useState({ x: 0, y: 0 });
  const [annotationColor, setAnnotationColor] = useState("#FFFF00");
  const [annotations, setAnnotations] = useState<PDFAnnotation[]>(
    attachment?.annotations || []
  );
  const [showRinaPopup, setShowRinaPopup] = useState(false);

  if (!attachment || attachment.type !== "pdf") return null;

  const handleTextSelection = (
    text: string,
    position: { x: number; y: number }
  ) => {
    if (text.trim()) {
      setSelectedText(text);
      setSelectionPosition(position);
      setShowToolbar(true);
      setShowRinaPopup(true);
    }
  };

  const handleAnnotation = (type: PDFAnnotation["type"]) => {
    if (selectedText) {
      const annotation: PDFAnnotation = {
        id: `annotation_${Date.now()}`,
        type,
        page: 1, // This would need to be determined based on actual PDF page
        x: selectionPosition.x,
        y: selectionPosition.y,
        width: 100, // This would be calculated based on selection
        height: 20,
        color: annotationColor,
        text: selectedText,
      };

      setAnnotations((prev) => [...prev, annotation]);
      onAnnotation(annotation);
      setShowToolbar(false);
      setSelectedText("");
    }
  };

  const handleAskRina = (text: string) => {
    // Here you would integrate with your RINA AI service
    Alert.alert(
      "Ask RINA",
      `You selected: "${text}"\n\nThis would open RINA chat with the selected text.`
    );
  };

  return (
    <Modal visible={!!attachment} transparent animationType="fade">
      <View style={styles.pdfViewerContainer}>
        <View style={styles.pdfHeader}>
          <Text style={styles.pdfTitle}>{attachment.name}</Text>
          <TouchableOpacity onPress={onClose}>
            <MaterialIcons name="close" size={24} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* PDF Content Area */}
        <ScrollView style={styles.pdfContent}>
          <TouchableOpacity
            style={styles.pdfPlaceholder}
            onLongPress={(event) => {
              const { pageX, pageY } = event.nativeEvent;
              handleTextSelection("Sample selected text from PDF", {
                x: pageX,
                y: pageY,
              });
            }}
          >
            <MaterialIcons name="picture-as-pdf" size={80} color="#FF5722" />
            <Text style={styles.pdfPlaceholderText}>{attachment.name}</Text>
            <Text style={styles.pdfInstructionText}>
              PDF preview not available in Expo Go
            </Text>
            <Text style={styles.pdfInstructionText}>
              Long press to simulate text selection for annotations
            </Text>

            <TouchableOpacity
              style={styles.pdfOpenButton}
              onPress={() => {
                Linking.openURL(attachment.uri).catch(() => {
                  Alert.alert("Error", "Cannot open this PDF file");
                });
              }}
            >
              <MaterialIcons name="open-in-new" size={20} color="#fff" />
              <Text style={styles.pdfOpenButtonText}>Open in External App</Text>
            </TouchableOpacity>

            {/* Render annotations */}
            {annotations.map((annotation) => (
              <View
                key={annotation.id}
                style={[
                  styles.annotationOverlay,
                  {
                    backgroundColor: annotation.color,
                    left: annotation.x,
                    top: annotation.y,
                  },
                ]}
              >
                <Text style={styles.annotationText}>{annotation.text}</Text>
              </View>
            ))}
          </TouchableOpacity>
        </ScrollView>

        {/* Annotation Toolbar */}
        {showToolbar && (
          <PDFAnnotationToolbar
            onHighlight={() => handleAnnotation("highlight")}
            onNote={() => handleAnnotation("note")}
            onUnderline={() => handleAnnotation("underline")}
            onStrikethrough={() => handleAnnotation("strikethrough")}
            onClose={() => {
              setShowToolbar(false);
              setSelectedText("");
            }}
            selectedColor={annotationColor}
            onColorChange={setAnnotationColor}
          />
        )}

        {/* RINA Popup */}
        <RinaButton
          visible={showRinaPopup}
          selectedText={selectedText}
          position={selectionPosition}
          onClose={() => setShowRinaPopup(false)}
          onAskRina={handleAskRina}
        />
      </View>
    </Modal>
  );
};

const PreviewModal = ({
  attachment,
  onClose,
}: {
  attachment: Attachment | null;
  onClose: () => void;
}) => {
  if (!attachment) return null;

  return (
    <Modal visible={!!attachment} transparent animationType="fade">
      <View style={styles.previewOverlay}>
        {/* Header */}
        <View style={styles.previewHeader}>
          <View style={styles.previewHeaderLeft}>
            <MaterialIcons
              name={attachment.type === "pdf" ? "picture-as-pdf" : "image"}
              size={20}
              color="#fff"
            />
            <Text style={styles.previewHeaderTitle} numberOfLines={1}>
              {attachment.name}
            </Text>
          </View>
          <TouchableOpacity style={styles.previewCloseButton} onPress={onClose}>
            <MaterialIcons name="close" size={24} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Content */}
        <View style={styles.previewContent}>
          {attachment.type === "image" ? (
            <ScrollView
              contentContainerStyle={styles.imagePreviewContainer}
              maximumZoomScale={3}
              minimumZoomScale={1}
              showsVerticalScrollIndicator={false}
              showsHorizontalScrollIndicator={false}
            >
              <Image
                source={{ uri: attachment.uri }}
                style={styles.previewImage}
                resizeMode="contain"
              />
            </ScrollView>
          ) : (
            // PDF Preview (Expo Go Compatible)
            <View style={styles.previewDocument}>
              <View style={styles.pdfPreviewIcon}>
                <MaterialIcons
                  name="picture-as-pdf"
                  size={80}
                  color="#FF5722"
                />
              </View>
              <Text style={styles.previewDocumentTitle}>{attachment.name}</Text>
              <Text style={styles.previewDocumentInfo}>
                Created: {new Date(attachment.timestamp).toLocaleDateString()}
              </Text>
              <Text style={styles.previewDocumentInfo}>
                PDF preview not available in Expo Go
              </Text>
              {attachment.annotations && attachment.annotations.length > 0 && (
                <View style={styles.annotationsInfo}>
                  <MaterialIcons name="note" size={16} color="#fff" />
                  <Text style={styles.annotationsText}>
                    {attachment.annotations.length} annotation
                    {attachment.annotations.length !== 1 ? "s" : ""}
                  </Text>
                </View>
              )}
            </View>
          )}
        </View>

        {/* Footer Actions */}
        <View style={styles.previewFooter}>
          {attachment.type === "pdf" && (
            <TouchableOpacity
              style={styles.previewActionButton}
              onPress={() => {
                onClose();
                // The parent component will handle opening PDF viewer
              }}
            >
              <MaterialIcons name="edit" size={20} color="#fff" />
              <Text style={styles.previewActionText}>Annotate</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.previewActionButton}
            onPress={() => {
              Alert.alert("Download", "Would you like to save this file?", [
                { text: "Cancel" },
                {
                  text: "Save",
                  onPress: () => {
                    // In a real app, you'd implement file saving logic here
                    Alert.alert("Success", "File saved to device");
                  },
                },
              ]);
            }}
          >
            <MaterialIcons name="download" size={20} color="#fff" />
            <Text style={styles.previewActionText}>Save</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.previewActionButton}
            onPress={() => {
              Linking.openURL(attachment.uri).catch(() => {
                Alert.alert("Error", "Cannot open this file type");
              });
            }}
          >
            <MaterialIcons name="open-in-new" size={20} color="#fff" />
            <Text style={styles.previewActionText}>Open</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
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

  const getCurrentNoteData = (): Note => {
    return {
      id: noteId,
      title,
      content,
      tags,
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
    await new Promise((resolve) => setTimeout(resolve, 1500));
  };

  // Event handlers
  const handleAutoSave = async () => {
    setSyncStatus("syncing");
    try {
      await saveToLocalStorage(getCurrentNoteData());
      const isOnline = true; // Replace with actual network check
      if (isOnline) {
        await syncToCloud(getCurrentNoteData());
        setSyncStatus("saved");
      } else {
        setSyncStatus("offline");
      }
    } catch (error) {
      console.error("Auto-save failed:", error);
      setSyncStatus("offline");
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const noteData = getCurrentNoteData();
      await saveToLocalStorage(noteData);
      const isOnline = true; // Replace with actual network check
      if (isOnline) {
        await syncToCloud(noteData);
      }
      navigation.goBack();
    } catch (error) {
      console.error("Error saving note:", error);
      Alert.alert("Error", "Failed to save note. Please try again.");
    } finally {
      setIsSaving(false);
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
        <TouchableOpacity onPress={() => navigation.goBack()}>
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
            style={styles.saveButton}
            onPress={handleSave}
            disabled={isSaving}
          >
            <MaterialIcons
              name={isSaving ? "sync" : "check"}
              size={24}
              color="#007AFF"
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
        </View>

        {/* Rich Text Editor */}
        <View style={styles.editorWrapper}>
          <RichEditor
            ref={richTextRef}
            style={styles.customRichTextInput}
            initialContentHTML={content}
            onChange={setContent}
            placeholder="Start typing your notes here..."
            editorInitializedCallback={() => {
              console.log("Rich editor initialized - text selection enabled");
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
    backgroundColor: "#fff",
    paddingBottom: 90,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
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
    padding: 16,
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
  // Enhanced Attachment Styles
  attachmentsScrollView: {
    marginBottom: 16,
  },
  attachmentCard: {
    width: 160,
    marginRight: 12,
    backgroundColor: "#f8f9fa",
    borderRadius: 12,
    padding: 8,
    borderWidth: 1,
    borderColor: "#e9ecef",
  },
  attachmentPreviewContainer: {
    marginBottom: 8,
  },
  attachmentThumbnail: {
    width: "100%",
    height: 120,
    borderRadius: 8,
    marginBottom: 8,
    position: "relative",
    overflow: "hidden",
  },
  imageThumbnail: {
    width: "100%",
    height: "100%",
    borderRadius: 8,
  },
  pdfThumbnail: {
    width: "100%",
    height: "100%",
    backgroundColor: "#fff3e0",
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 8,
    borderWidth: 2,
    borderColor: "#ffcc80",
    borderStyle: "dashed",
  },
  pdfLabel: {
    fontSize: 12,
    color: "#FF5722",
    fontWeight: "bold",
    marginTop: 4,
  },
  fileTypeOverlay: {
    position: "absolute",
    top: 4,
    right: 4,
    backgroundColor: "rgba(0,0,0,0.7)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  fileTypeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "bold",
  },
  annotationBadgeOverlay: {
    position: "absolute",
    bottom: 4,
    right: 4,
    backgroundColor: "#FF6B6B",
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    flexDirection: "row",
    alignItems: "center",
  },
  attachmentInfo: {
    marginBottom: 8,
  },
  attachmentName: {
    fontSize: 12,
    fontWeight: "600",
    color: "#333",
    marginBottom: 2,
  },
  attachmentDate: {
    fontSize: 10,
    color: "#666",
  },
  attachmentActions: {
    flexDirection: "row",
    justifyContent: "space-around",
  },
  attachmentActionButton: {
    padding: 8,
    borderRadius: 6,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#ddd",
  },
  // Legacy styles (keeping for compatibility)
  attachmentItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
    marginBottom: 8,
  },
  attachmentPreviewButton: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
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
    position: 'absolute',
    left: 12,
    right: 12,
    zIndex: 1000,
    maxWidth: '100%',
    backgroundColor: '#fff',
    borderRadius: 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
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
  pdfPreviewIcon: {
    padding: 20,
    backgroundColor: "rgba(255,87,34,0.1)",
    borderRadius: 50,
    marginBottom: 20,
  },
  previewDocumentTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "600",
    textAlign: "center",
    marginBottom: 8,
  },
  previewDocumentInfo: {
    color: "#ccc",
    fontSize: 14,
    marginBottom: 16,
  },
  annotationsInfo: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,107,107,0.2)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  annotationsText: {
    color: "#fff",
    fontSize: 12,
    marginLeft: 4,
  },
  previewFooter: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingHorizontal: 20,
    paddingVertical: 20,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.1)",
  },
  previewActionButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.1)",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    minWidth: 80,
    justifyContent: "center",
  },
  previewActionText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
    marginLeft: 4,
  },
  // Legacy preview styles (keeping for compatibility)
  previewDocumentText: {
    color: "#fff",
    marginTop: 10,
    fontSize: 16,
  },
  previewOpenButton: {
    marginTop: 20,
    padding: 10,
    backgroundColor: "#007AFF",
    borderRadius: 5,
  },
  previewOpenButtonText: {
    color: "#fff",
    fontWeight: "bold",
  },
  annotationBadge: {
    backgroundColor: "#FF6B6B",
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginLeft: 8,
  },
  annotationBadgeText: {
    color: "white",
    fontSize: 10,
    fontWeight: "bold",
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
  // PDF Viewer Styles
  pdfViewerContainer: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  pdfHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#333",
    padding: 16,
    paddingTop: 50,
  },
  pdfTitle: {
    color: "white",
    fontSize: 18,
    fontWeight: "bold",
    flex: 1,
  },
  pdfContent: {
    flex: 1,
  },
  pdfPlaceholder: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 40,
    minHeight: 500,
    position: "relative",
  },
  pdfPlaceholderText: {
    fontSize: 18,
    color: "#666",
    marginTop: 16,
    textAlign: "center",
  },
  pdfInstructionText: {
    fontSize: 14,
    color: "#999",
    marginTop: 8,
    textAlign: "center",
  },
  pdfOpenButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FF5722",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 20,
  },
  pdfOpenButtonText: {
    color: "#fff",
    fontWeight: "600",
    marginLeft: 8,
  },
  // PDF Annotation Toolbar
  pdfToolbar: {
    flexDirection: "row",
    backgroundColor: "white",
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: "#ddd",
    alignItems: "center",
    flexWrap: "wrap",
  },
  pdfToolButton: {
    alignItems: "center",
    marginHorizontal: 8,
    marginVertical: 4,
  },
  pdfToolText: {
    fontSize: 10,
    color: "#333",
    marginTop: 2,
  },
  colorPalette: {
    flexDirection: "row",
    marginHorizontal: 8,
  },
  colorButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    marginHorizontal: 2,
    borderWidth: 1,
    borderColor: "#ddd",
  },
  selectedColorButton: {
    borderWidth: 2,
    borderColor: "#333",
  },
  pdfCloseButton: {
    marginLeft: "auto",
    padding: 4,
  },
  // Annotation Overlay
  annotationOverlay: {
    position: "absolute",
    padding: 4,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.3)",
  },
  annotationText: {
    fontSize: 12,
    color: "#333",
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
});

export default NewNoteEditor;
