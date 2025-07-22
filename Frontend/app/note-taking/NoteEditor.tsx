import { MaterialIcons, Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Audio } from "expo-av";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  KeyboardEvent,
  LayoutAnimation,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

// Conditional imports for rich text editor
let RichEditor, RichToolbar;
if (Platform.OS === "web") {
  // Web implementation
  const WebEditor = ({
    initialContentHTML,
    onChange,
    placeholder,
    style,
  }: {
    initialContentHTML: string;
    onChange: (html: string) => void;
    placeholder: string;
    style: any;
  }) => {
    const [value, setValue] = useState(initialContentHTML || "");

    useEffect(() => {
      setValue(initialContentHTML || "");
    }, [initialContentHTML]);

    return (
      <textarea
        value={value}
        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => {
          setValue(e.target.value);
          onChange(e.target.value);
        }}
        style={{
          ...style,
          minHeight: 200,
          width: "100%",
          padding: 12,
          borderWidth: 1,
          borderColor: "#ddd",
          borderRadius: 8,
          fontSize: 16,
        }}
        placeholder={placeholder}
      />
    );
  };

  RichEditor = React.forwardRef((props: any, ref: any) => {
    return <WebEditor {...props} />;
  });

  RichToolbar = () => null;
} else {
  // Native implementation
  ({ RichEditor, RichToolbar } = require("react-native-pell-rich-editor"));
}

// Types
interface NoteEditorProps {
  route: {
    params: {
      noteId?: string;
      initialNote?: Note;
    };
  };
  navigation: any;
}

interface Note {
  id: string;
  title: string;
  content: string;
  subject?: string;
  linkedTask?: string;
  tags?: string[];
  attachments?: Attachment[];
  voiceRecordings?: VoiceRecording[];
  createdAt?: string;
  updatedAt?: string;
}

interface VoiceRecording {
  id: string;
  duration: number;
  timestamp: Date;
  transcription?: string;
  isTranscribing?: boolean;
  uri: string;
  isPlaying?: boolean;
}

interface Attachment {
  id: string;
  uri: string;
  name: string;
  type: "image" | "pdf";
  timestamp: Date;
}

type ColorChannel = "r" | "g" | "b";

// Constants
const subjects = [
  "Nursing",
  "Pharmacy",
  "MedTech",
  "Anatomy",
  "Pharmacology",
  "Biochemistry",
  "Pathology",
];

const mockTasks = [
  { id: "1", title: "Study Cardiovascular System", subject: "Anatomy" },
  { id: "2", title: "Pharmacokinetics Assignment", subject: "Pharmacology" },
  { id: "3", title: "Lab Report - Blood Analysis", subject: "MedTech" },
];

// Storage abstraction for web/native
const storage = {
  async setItem(key: string, value: string) {
    if (Platform.OS === "web") {
      localStorage.setItem(key, value);
    } else {
      await AsyncStorage.setItem(key, value);
    }
  },
  async getItem(key: string) {
    if (Platform.OS === "web") {
      return localStorage.getItem(key);
    } else {
      return await AsyncStorage.getItem(key);
    }
  },
  async removeItem(key: string) {
    if (Platform.OS === "web") {
      localStorage.removeItem(key);
    } else {
      await AsyncStorage.removeItem(key);
    }
  },
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
        <TouchableOpacity style={styles.previewCloseButton} onPress={onClose}>
          <MaterialIcons name="close" size={24} color="#fff" />
        </TouchableOpacity>

        {attachment.type === "image" ? (
          <Image
            source={{ uri: attachment.uri }}
            style={styles.previewImage}
            resizeMode="contain"
          />
        ) : (
          <View style={styles.previewDocument}>
            <MaterialIcons name="picture-as-pdf" size={80} color="#fff" />
            <Text style={styles.previewDocumentText}>{attachment.name}</Text>
            <TouchableOpacity
              style={styles.previewOpenButton}
              onPress={() => {
                if (Platform.OS === "web") {
                  window.open(attachment.uri, "_blank");
                } else {
                  Alert.alert("Open PDF", "Would you like to open this PDF?", [
                    { text: "Cancel" },
                    {
                      text: "Open",
                      onPress: () => Linking.openURL(attachment.uri),
                    },
                  ]);
                }
              }}
            >
              <Text style={styles.previewOpenButtonText}>Open</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </Modal>
  );
};

const NoteEditorScreen: React.FC<NoteEditorProps> = ({ route, navigation }) => {
  // Refs
  const richTextRef = useRef<any>(null);

  // State
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [title, setTitle] = useState(route.params?.initialNote?.title || "");
  const [content, setContent] = useState(
    route.params?.initialNote?.content || ""
  );
  const [subject, setSubject] = useState(
    route.params?.initialNote?.subject || ""
  );
  const [linkedTask, setLinkedTask] = useState(
    route.params?.initialNote?.linkedTask || ""
  );
  const [tags, setTags] = useState<string[]>(
    route.params?.initialNote?.tags || []
  );
  const [attachments, setAttachments] = useState<Attachment[]>(
    route.params?.initialNote?.attachments || []
  );
  const [recordings, setRecordings] = useState<VoiceRecording[]>(
    route.params?.initialNote?.voiceRecordings || []
  );
  const [isSaving, setIsSaving] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [showMoreOptions, setShowMoreOptions] = useState(false);
  const [showSubjectModal, setShowSubjectModal] = useState(false);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showTagModal, setShowTagModal] = useState(false);
  const [newTag, setNewTag] = useState("");
  const [syncStatus, setSyncStatus] = useState<"saved" | "syncing" | "offline">(
    "saved"
  );
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [recordingStatus, setRecordingStatus] =
    useState<Audio.RecordingStatus | null>(null);
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [recordingStartTime, setRecordingStartTime] = useState<number>(0);
  const [noteId] = useState(route.params?.noteId || `note_${Date.now()}`);
  const [previewAttachment, setPreviewAttachment] = useState<Attachment | null>(
    null
  );
  // Update your state to track RGB values
  const [textColor, setTextColor] = useState("black");
  const [bgColor, setBgColor] = useState("white");
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [currentColorAction, setCurrentColorAction] = useState<
    "text" | "background" | null
  >(null);

  // Effects
  useEffect(() => {
    if (Platform.OS !== "web") {
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
    }
  }, []);

  useEffect(() => {
    if (Platform.OS !== "web") {
      const setupAudio = async () => {
        try {
          await Audio.setAudioModeAsync({
            allowsRecordingIOS: true,
            playsInSilentModeIOS: true,
            shouldDuckAndroid: true,
            playThroughEarpieceAndroid: false,
            staysActiveInBackground: false,
          });
        } catch (error) {
          console.error("Failed to setup audio mode:", error);
        }
      };

      setupAudio();
    }

    const autoSaveInterval = setInterval(() => {
      if (
        title.trim() ||
        content.trim() ||
        recordings.length > 0 ||
        attachments.length > 0
      ) {
        handleAutoSave();
      }
    }, 30000);

    return () => {
      clearInterval(autoSaveInterval);
      if (recording) {
        recording.stopAndUnloadAsync();
      }
      if (sound) {
        sound.unloadAsync();
      }
    };
  }, [title, content, recordings, attachments]);

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
      subject,
      linkedTask,
      tags,
      attachments,
      voiceRecordings: recordings,
      createdAt:
        route.params?.initialNote?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  };

  const openColorPicker = (type: "text" | "background") => {
    setCurrentColorAction(type);
    setShowColorPicker(true);
  };

  const hexToRgb = (hex: string): number[] => {
    // Remove # if present
    hex = hex.replace('#', '');
    
    // Convert to RGB values
    return [
      parseInt(hex.substring(0, 2), 16),
      parseInt(hex.substring(2, 4), 16),
      parseInt(hex.substring(4, 6), 16)
    ];
  };

  // Then update the applyColor function
  const applyColor = (colorName: string, colorHex: string) => {
    if (currentColorAction === "text") {
      setTextColor(colorName);
      richTextRef.current?.setForeColor(hexToRgb(colorHex));
    } else if (currentColorAction === "background") {
      setBgColor(colorName);
      richTextRef.current?.setHiliteColor(hexToRgb(colorHex));
    }
    setShowColorPicker(false);
  };

  const formatDuration = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
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

  const requestPermissions = async () => {
    if (Platform.OS === "web") {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        stream.getTracks().forEach((track) => track.stop());
        return true;
      } catch (error) {
        console.error("Error requesting permissions:", error);
        return false;
      }
    } else {
      try {
        const { status } = await Audio.requestPermissionsAsync();
        if (status !== "granted") {
          Alert.alert(
            "Permission Required",
            "Please grant microphone permission to record audio notes.",
            [{ text: "OK" }]
          );
          return false;
        }
        return true;
      } catch (error) {
        console.error("Error requesting permissions:", error);
        return false;
      }
    }
  };

  const handleStartRecording = async () => {
    try {
      const hasPermission = await requestPermissions();
      if (!hasPermission) return;

      if (Platform.OS === "web") {
        Alert.alert(
          "Info",
          "Voice recording not implemented for web in this demo"
        );
        return;
      }

      // Stop any existing recording or playback
      if (recording) await recording.stopAndUnloadAsync();
      if (sound) await sound.unloadAsync();

      const newRecording = new Audio.Recording();
      await newRecording.prepareToRecordAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );

      setRecording(newRecording);
      setRecordingStartTime(Date.now());
      setIsRecording(true);
      await newRecording.startAsync();

      newRecording.setOnRecordingStatusUpdate(setRecordingStatus);
    } catch (error) {
      console.error("Failed to start recording:", error);
      Alert.alert("Error", "Failed to start recording. Please try again.");
      setIsRecording(false);
    }
  };

  const handleStopRecording = async () => {
    try {
      if (!recording) return;

      setIsRecording(false);
      await recording.stopAndUnloadAsync();

      const uri = recording.getURI();
      const duration = Math.floor((Date.now() - recordingStartTime) / 1000);

      if (uri) {
        setRecordings((prev) => [
          ...prev,
          {
            id: `rec_${Date.now()}`,
            duration,
            timestamp: new Date(),
            uri,
            isPlaying: false,
          },
        ]);
      }

      setRecording(null);
      setRecordingStatus(null);
      setRecordingStartTime(0);
    } catch (error) {
      console.error("Failed to stop recording:", error);
      Alert.alert("Error", "Failed to stop recording.");
    }
  };

  const handlePlayRecording = async (recordingItem: VoiceRecording) => {
    try {
      // Stop any current playback
      if (sound) await sound.unloadAsync();

      // Update UI state
      setRecordings((prev) =>
        prev.map((r) => ({
          ...r,
          isPlaying: r.id === recordingItem.id ? true : false,
        }))
      );

      if (Platform.OS === "web") {
        Alert.alert("Info", "Playback not implemented for web in this demo");
        return;
      }

      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri: recordingItem.uri },
        { shouldPlay: true }
      );

      setSound(newSound);

      newSound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          setRecordings((prev) =>
            prev.map((r) =>
              r.id === recordingItem.id ? { ...r, isPlaying: false } : r
            )
          );
        }
      });
    } catch (error) {
      console.error("Failed to play recording:", error);
      Alert.alert("Error", "Failed to play recording.");
      setRecordings((prev) =>
        prev.map((r) =>
          r.id === recordingItem.id ? { ...r, isPlaying: false } : r
        )
      );
    }
  };

  const handleStopPlayback = async (recordingItem: VoiceRecording) => {
    try {
      if (sound) await sound.unloadAsync();
      setRecordings((prev) =>
        prev.map((r) =>
          r.id === recordingItem.id ? { ...r, isPlaying: false } : r
        )
      );
    } catch (error) {
      console.error("Failed to stop playback:", error);
    }
  };

  const handleTranscribeRecording = async (recordingId: string) => {
    const recordingItem = recordings.find((r) => r.id === recordingId);
    if (!recordingItem) return;

    // Simulate network check
    const isOnline = true; // Replace with actual network check
    if (!isOnline) {
      Alert.alert("Offline", "Transcription requires an internet connection.", [
        { text: "OK" },
      ]);
      return;
    }

    setRecordings((prev) =>
      prev.map((r) =>
        r.id === recordingId ? { ...r, isTranscribing: true } : r
      )
    );

    try {
      // Simulate transcription API call
      await new Promise((resolve) => setTimeout(resolve, 3000));

      const mockTranscription = `Transcribed note from ${recordingItem.timestamp.toLocaleString()}. The audio discussed important concepts.`;

      setRecordings((prev) =>
        prev.map((r) =>
          r.id === recordingId
            ? { ...r, transcription: mockTranscription, isTranscribing: false }
            : r
        )
      );

      Alert.alert("Transcription Complete", "Audio has been transcribed.", [
        { text: "OK" },
      ]);
    } catch (error) {
      console.error("Transcription failed:", error);
      setRecordings((prev) =>
        prev.map((r) =>
          r.id === recordingId ? { ...r, isTranscribing: false } : r
        )
      );
      Alert.alert("Transcription Failed", "Failed to transcribe audio.", [
        { text: "OK" },
      ]);
    }
  };

  const insertTranscriptionToNote = (transcription: string) => {
    if (Platform.OS === "web") {
      setContent((prev) => prev + "\n" + transcription);
    } else {
      richTextRef.current?.insertHTML(`<p>${transcription}</p>`);
    }
  };

  const deleteRecording = async (recordingId: string) => {
    Alert.alert("Delete Recording", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          const recordingToDelete = recordings.find(
            (r) => r.id === recordingId
          );
          if (recordingToDelete) {
            try {
              if (Platform.OS !== "web") {
                await FileSystem.deleteAsync(recordingToDelete.uri, {
                  idempotent: true,
                });
              }
            } catch (e) {
              console.error("Failed to delete recording file:", e);
            }
          }
          setRecordings((prev) => prev.filter((r) => r.id !== recordingId));
        },
      },
    ]);
  };

  const handlePickImage = async () => {
    setShowMoreOptions(false);

    if (Platform.OS === "web") {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      input.onchange = (e: Event) => {
        const target = e.target as HTMLInputElement;
        const file = target.files?.[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (event) => {
            const uri = event.target?.result as string;
            setAttachments((prev) => [
              ...prev,
              {
                id: `img_${Date.now()}`,
                uri,
                name: file.name,
                type: "image",
                timestamp: new Date(),
              },
            ]);
            if (Platform.OS === "web") {
              setContent((prev) => prev + `\n[Image: ${file.name}]`);
            } else {
              richTextRef.current?.insertHTML(
                `<img src="${uri}" alt="Image" />`
              );
            }
          };
          reader.readAsDataURL(file);
        }
      };
      input.click();
      return;
    }

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        "Permission Required",
        "Please grant media library permission."
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 1,
    });

    if (!result.canceled && result.assets?.[0]) {
      const asset = result.assets[0];
      setAttachments((prev) => [
        ...prev,
        {
          id: `img_${Date.now()}`,
          uri: asset.uri,
          name: asset.fileName || `image_${Date.now()}.jpg`,
          type: "image",
          timestamp: new Date(),
        },
      ]);
      richTextRef.current?.insertHTML(`<img src="${asset.uri}" alt="Image" />`);
    }
  };

  const handlePickDocument = async () => {
    setShowMoreOptions(false);

    if (Platform.OS === "web") {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".pdf";
      input.onchange = (e: Event) => {
        const target = e.target as HTMLInputElement;
        const file = target.files?.[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (event) => {
            const uri = event.target?.result as string;
            setAttachments((prev) => [
              ...prev,
              {
                id: `doc_${Date.now()}`,
                uri,
                name: file.name,
                type: "pdf",
                timestamp: new Date(),
              },
            ]);
            if (Platform.OS === "web") {
              setContent((prev) => prev + `\n[PDF: ${file.name}]`);
            } else {
              richTextRef.current?.insertHTML(
                `<a href="${uri}">${file.name}</a>`
              );
            }
          };
          reader.readAsDataURL(file);
        }
      };
      input.click();
      return;
    }

    const result = await DocumentPicker.getDocumentAsync({
      type: "application/pdf",
      copyToCacheDirectory: true,
    });

    if (!result.canceled && result.assets?.[0]) {
      const asset = result.assets[0];
      setAttachments((prev) => [
        ...prev,
        {
          id: `doc_${Date.now()}`,
          uri: asset.uri,
          name: asset.name,
          type: "pdf",
          timestamp: new Date(),
        },
      ]);
      richTextRef.current?.insertHTML(
        `<a href="${asset.uri}">${asset.name}</a>`
      );
    }
  };

  const deleteAttachment = (attachmentId: string) => {
    Alert.alert("Delete Attachment", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          const attachmentToDelete = attachments.find(
            (a) => a.id === attachmentId
          );
          if (attachmentToDelete) {
            try {
              if (Platform.OS !== "web") {
                await FileSystem.deleteAsync(attachmentToDelete.uri, {
                  idempotent: true,
                });
              }
            } catch (e) {
              console.error("Failed to delete attachment file:", e);
            }
          }
          setAttachments((prev) => prev.filter((a) => a.id !== attachmentId));
        },
      },
    ]);
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
          <Ionicons name="chevron-back" size={24} color="#333" />
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
          {Platform.OS !== "web" && (
            <TouchableOpacity
              style={[
                styles.voiceButton,
                isRecording && styles.voiceButtonRecording,
              ]}
              onPress={isRecording ? handleStopRecording : handleStartRecording}
              disabled={isSaving}
            >
              <MaterialIcons
                name={isRecording ? "stop" : "mic"}
                size={20}
                color={isRecording ? "#fff" : "#6A009C"}
              />
              {isRecording && (
                <Text style={styles.recordingText}>
                  {recordingStatus?.durationMillis
                    ? formatDuration(
                        Math.floor(recordingStatus.durationMillis / 1000)
                      )
                    : "0:00"}
                </Text>
              )}
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
              color="#6A009C"
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.moreButton}
            onPress={() => setShowMoreOptions((prev) => !prev)}
          >
            <MaterialIcons name="more-vert" size={24} color="#6A009C" />
          </TouchableOpacity>

          {showMoreOptions && (
            <View style={styles.moreOptionsMenu}>
              <TouchableOpacity
                style={styles.optionItem}
                onPress={handlePickImage}
              >
                <MaterialIcons name="image" size={20} color="#666" />
                <Text style={styles.optionText}>Insert Image</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.optionItem}
                onPress={handlePickDocument}
              >
                <MaterialIcons name="attach-file" size={20} color="#666" />
                <Text style={styles.optionText}>Attach File</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.optionItem}
                onPress={() => setShowMoreOptions(false)}
              >
                <MaterialIcons name="keyboard-voice" size={20} color="#666" />
                <Text style={styles.optionText}>Voice Recording</Text>
              </TouchableOpacity>
              {attachments.length > 0 && (
                <TouchableOpacity
                  style={styles.optionItem}
                  onPress={() => {
                    setShowMoreOptions(false);
                  }}
                >
                  <MaterialIcons name="attachment" size={20} color="#666" />
                  <Text style={styles.optionText}>View Attachments</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.optionItem}>
                <MaterialIcons name="psychology" size={20} color="#9C27B0" />
                <Text style={styles.optionText}>AI Suggest</Text>
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

        {/* Metadata Section */}
        <View style={styles.metadataSection}>
          <TouchableOpacity
            style={styles.metadataItem}
            onPress={() => setShowSubjectModal(true)}
          >
            <MaterialIcons name="school" size={16} color="#666" />
            <Text style={styles.metadataText}>
              {subject || "Select Subject"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.metadataItem}
            onPress={() => setShowTaskModal(true)}
          >
            <MaterialIcons name="assignment" size={16} color="#666" />
            <Text style={styles.metadataText}>
              {linkedTask
                ? mockTasks.find((t) => t.id === linkedTask)?.title
                : "Link to Task"}
            </Text>
          </TouchableOpacity>
        </View>

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
          />
        </View>

        {/* Attachments Section */}
        {attachments.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Attachments</Text>
            {attachments.map((attachment) => (
              <View key={attachment.id} style={styles.attachmentItem}>
                <TouchableOpacity
                  style={styles.attachmentPreviewButton}
                  onPress={() => setPreviewAttachment(attachment)}
                >
                  <MaterialIcons
                    name={
                      attachment.type === "pdf" ? "picture-as-pdf" : "image"
                    }
                    size={24}
                    color="#666"
                  />
                  <Text style={styles.attachmentName}>{attachment.name}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => deleteAttachment(attachment.id)}
                >
                  <MaterialIcons name="delete" size={20} color="#FF3B30" />
                </TouchableOpacity>
              </View>
            ))}
          </>
        )}

        {/* Recordings Section */}
        {recordings.length > 0 && (
          <Text style={styles.sectionTitle}>Voice Recordings</Text>
        )}
        {recordings.map((item) => (
          <View key={item.id} style={styles.recordingItem}>
            <View style={styles.recordingInfo}>
              <MaterialIcons name="mic" size={20} color="#666" />
              <View style={styles.recordingDetails}>
                <Text style={styles.recordingText}>
                  {formatDuration(item.duration)} •{" "}
                  {item.timestamp.toLocaleTimeString()}
                </Text>
                {item.transcription && (
                  <Text style={styles.transcriptionPreview} numberOfLines={2}>
                    {item.transcription}
                  </Text>
                )}
              </View>
            </View>

            <View style={styles.recordingActions}>
              <TouchableOpacity
                style={styles.recordingButton}
                onPress={() =>
                  item.isPlaying
                    ? handleStopPlayback(item)
                    : handlePlayRecording(item)
                }
              >
                <MaterialIcons
                  name={item.isPlaying ? "pause" : "play-arrow"}
                  size={20}
                  color="#007AFF"
                />
              </TouchableOpacity>

              {!item.transcription && !item.isTranscribing && (
                <TouchableOpacity
                  style={styles.recordingButton}
                  onPress={() => handleTranscribeRecording(item.id)}
                >
                  <MaterialIcons name="text-format" size={20} color="#007AFF" />
                </TouchableOpacity>
              )}

              {item.isTranscribing && (
                <View style={styles.recordingButton}>
                  <MaterialIcons name="sync" size={20} color="#FF9500" />
                </View>
              )}

              {item.transcription && (
                <TouchableOpacity
                  style={styles.recordingButton}
                  onPress={() => insertTranscriptionToNote(item.transcription!)}
                >
                  <MaterialIcons name="add" size={20} color="#34C759" />
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={styles.recordingButton}
                onPress={() => deleteRecording(item.id)}
              >
                <MaterialIcons name="delete" size={20} color="#FF3B30" />
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </ScrollView>

      {/* Full-featured Rich Text Toolbar */}
      {Platform.OS !== "web" && (
        <RichToolbar
          style={[
            styles.floatingToolbarContainer,
            { bottom: keyboardHeight > 0 ? keyboardHeight + 20 : 20 },
          ]}
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
            underline: () => (
              <MaterialIcons name="format-underlined" size={20} />
            ),
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
            alignLeft: () => (
              <MaterialIcons name="format-align-left" size={20} />
            ),
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
      )}
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

      {/* Preview Modal */}
      <PreviewModal
        attachment={previewAttachment}
        onClose={() => setPreviewAttachment(null)}
      />

      {/* Modals */}
      <Modal visible={showSubjectModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Select Subject</Text>
            <FlatList
              data={subjects}
              keyExtractor={(item) => item}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.modalItem}
                  onPress={() => {
                    setSubject(item);
                    setShowSubjectModal(false);
                  }}
                >
                  <Text style={styles.modalItemText}>{item}</Text>
                </TouchableOpacity>
              )}
            />
            <TouchableOpacity
              style={styles.modalCloseButton}
              onPress={() => setShowSubjectModal(false)}
            >
              <Text style={styles.modalCloseText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={showTaskModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Link to Task</Text>
            <FlatList
              data={mockTasks}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.modalItem}
                  onPress={() => {
                    setLinkedTask(item.id);
                    setShowTaskModal(false);
                  }}
                >
                  <Text style={styles.modalItemText}>{item.title}</Text>
                  <Text style={styles.modalItemSubtext}>{item.subject}</Text>
                </TouchableOpacity>
              )}
            />
            <TouchableOpacity
              style={styles.modalCloseButton}
              onPress={() => setShowTaskModal(false)}
            >
              <Text style={styles.modalCloseText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

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
  attachmentName: {
    flex: 1,
    marginLeft: 12,
    color: "#333",
    fontSize: 14,
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
    backgroundColor: "rgba(0, 0, 0, 0.9)",
    justifyContent: "center",
    alignItems: "center",
  },
  previewCloseButton: {
    position: "absolute",
    top: 40,
    right: 20,
    zIndex: 1,
  },
  previewImage: {
    width: "100%",
    height: "80%",
  },
  previewDocument: {
    alignItems: "center",
    padding: 20,
  },
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
    fontFamily: "Inter-Regular",
    textAlign: "center",
  },
});

export default NoteEditorScreen;