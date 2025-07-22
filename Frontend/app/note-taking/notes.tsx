import { MaterialIcons } from "@expo/vector-icons";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Audio } from "expo-av";
import React, { useState } from "react";
import {
  Alert,
  Animated,
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
} from "react-native";
import Navbar from "../NavBar";
import { RootStackParamList } from "../navigation/AppNavigator";

const { width } = Dimensions.get("window");

type NotesScreenNavigationProp = NativeStackNavigationProp<RootStackParamList>;

interface NotesScreenProps {
  navigation: NotesScreenNavigationProp;
}

interface Note {
  id: string;
  title: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
  type: "text" | "voice" | "image";
  audioUri?: string;
  tags?: string[];
  linkedTaskId?: string;
}

interface Folder {
  id: string;
  name: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  color: string;
}

const DUMMY_FOLDERS: Folder[] = [
  { id: "f1", name: "Lectures", icon: "school", color: "#667EEA" },
  { id: "f2", name: "Labs", icon: "science", color: "#F093FB" },
  { id: "f3", name: "Clinical", icon: "medical-services", color: "#4FACFE" },
  { id: "f4", name: "Research", icon: "library-books", color: "#43E97B" },
  { id: "f5", name: "Homework", icon: "assignment", color: "#FA8BFF" },
  { id: "f6", name: "Projects", icon: "folder-special", color: "#2BD2FF" },
];

const INITIAL_NOTES: Note[] = [
  {
    id: "1",
    title: "Pharmacology Lecture Notes",
    content:
      "Drug classifications and mechanisms of action. Important points about drug interactions and contraindications.",
    createdAt: new Date(2024, 10, 15),
    updatedAt: new Date(2024, 10, 15),
    type: "text",
    tags: ["pharmacology", "lecture"],
  },
  {
    id: "2",
    title: "Clinical Assessment Recording",
    content: "",
    createdAt: new Date(2024, 10, 14),
    updatedAt: new Date(2024, 10, 14),
    type: "voice",
    audioUri: "sample_uri",
    tags: ["clinical", "assessment"],
  },
  {
    id: "3",
    title: "Anatomy Study Notes",
    content:
      "Detailed notes on the cardiovascular system including heart structure, blood flow, and common pathologies.",
    createdAt: new Date(2024, 10, 13),
    updatedAt: new Date(2024, 10, 13),
    type: "text",
    tags: ["anatomy", "cardiovascular"],
  },
];

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
  "school",
  "science",
  "medical-services",
  "library-books",
  "assignment",
  "folder-special",
  "work",
  "home",
  "favorite",
  "star",
  "lightbulb",
  "code",
  "music-note",
  "photo",
  "sports",
];

export default function NotesScreen({ navigation }: NotesScreenProps) {
  const [notes, setNotes] = useState<Note[]>(INITIAL_NOTES);
  const [folders, setFolders] = useState<Folder[]>(DUMMY_FOLDERS);
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFilter, setSelectedFilter] = useState("all");
  const [recordingAnimation] = useState(new Animated.Value(1));
  const [showFolderDropdown, setShowFolderDropdown] = useState(false);
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

  const startRecording = async () => {
    try {
      await Audio.requestPermissionsAsync();
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      setRecording(recording);
      setIsRecording(true);

      Animated.loop(
        Animated.sequence([
          Animated.timing(recordingAnimation, {
            toValue: 1.3,
            duration: 600,
            useNativeDriver: true,
          }),
          Animated.timing(recordingAnimation, {
            toValue: 1,
            duration: 600,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } catch (err) {
      console.error("Failed to start recording", err);
    }
  };

  const stopRecording = async () => {
    if (!recording) return;

    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setRecording(null);
      setIsRecording(false);
      recordingAnimation.stopAnimation();
      recordingAnimation.setValue(1);

      if (uri) {
        const newNote: Note = {
          id: Date.now().toString(),
          title: `Voice Note ${new Date().toLocaleString()}`,
          content: "",
          createdAt: new Date(),
          updatedAt: new Date(),
          type: "voice",
          audioUri: uri,
          tags: ["voice"],
        };
        setNotes((prev) => [newNote, ...prev]);
      }
    } catch (err) {
      console.error("Failed to stop recording", err);
    }
  };

  const handleDeleteNote = (noteId: string) => {
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
          onPress: () => {
            setNotes((prev) => prev.filter((note) => note.id !== noteId));
            setActiveNoteOptions(null);
          },
        },
      ]
    );
  };

  const handleNotePress = (note: Note) => {
    // Close any open options when navigating
    setActiveNoteOptions(null);
    navigation.navigate("NoteEditor", {
      noteId: note.id,
      initialNote: {
        title: note.title,
        content: note.content,
      },
    });
  };

  const handleCreateNote = () => {
    navigation.navigate("NoteEditor", {
      initialNote: {
        title: "",
        content: "",
      },
    });
  };

  const handleCreateFolder = () => {
    if (newFolderName.trim() === "") {
      Alert.alert("Error", "Please enter a folder name");
      return;
    }

    const newFolder: Folder = {
      id: `f_${Date.now()}`,
      name: newFolderName.trim(),
      icon: selectedFolderIcon,
      color: selectedFolderColor,
    };

    setFolders((prev) => [...prev, newFolder]);
    setNewFolderName("");
    setSelectedFolderIcon("folder");
    setSelectedFolderColor("#667EEA");
    setShowCreateFolderModal(false);
  };

  const toggleSearch = () => {
    setShowSearchBar(!showSearchBar);
    if (showSearchBar) {
      setSearchQuery(""); // Clear search when closing
    }
  };

  const filteredNotes = notes.filter((note) => {
    const matchesSearch =
      searchQuery === "" ||
      note.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      note.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (note.tags &&
        note.tags.some((tag) =>
          tag.toLowerCase().includes(searchQuery.toLowerCase())
        ));
    const matchesFilter =
      selectedFilter === "all" || note.type === selectedFilter;
    return matchesSearch && matchesFilter;
  });

  const renderNoteItem = ({ item }: { item: Note }) => (
    <TouchableOpacity
      style={[styles.noteItem, viewMode === "grid" && styles.gridNoteItem]}
      onPress={() => handleNotePress(item)}
      activeOpacity={0.8}
    >
      <View
        style={[
          styles.noteContent,
          item.type === "voice" && styles.voiceNoteContent,
          viewMode === "grid" && styles.gridNoteContent,
        ]}
      >
        <View style={styles.noteHeader}>
          <View style={styles.noteTitleContainer}>
            <View
              style={[
                styles.noteTypeIcon,
                viewMode === "grid" && styles.gridNoteTypeIcon,
                {
                  backgroundColor:
                    item.type === "voice" ? "#f2e5f8ff" : "#DBEAFE",
                },
              ]}
            >
              <MaterialIcons
                name={item.type === "voice" ? "mic" : "description"}
                size={viewMode === "grid" ? 16 : 20}
                color={item.type === "voice" ? "#6A009C" : "#3B82F6"}
              />
            </View>
            <View style={styles.noteTitleSection}>
              <Text
                style={[
                  styles.noteTitle,
                  viewMode === "grid" && styles.gridNoteTitle,
                ]}
                numberOfLines={viewMode === "grid" ? 2 : 1}
              >
                {item.title}
              </Text>
              <Text
                style={[
                  styles.noteDate,
                  viewMode === "grid" && styles.gridNoteDate,
                ]}
              >
                {item.updatedAt.toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  ...(viewMode === "list" && {
                    hour: "2-digit",
                    minute: "2-digit",
                  }),
                })}
              </Text>
            </View>
          </View>
          {viewMode === "list" && (
            <View style={styles.noteOptionsContainer}>
              <TouchableOpacity
                style={styles.noteOptionsButton}
                onPress={() =>
                  setActiveNoteOptions(
                    activeNoteOptions === item.id ? null : item.id
                  )
                }
              >
                <MaterialIcons name="more-vert" size={20} color="#9CA3AF" />
              </TouchableOpacity>

              {activeNoteOptions === item.id && (
                <View style={styles.noteOptionsDropdown}>
                  <TouchableOpacity
                    style={styles.noteOptionItem}
                    onPress={() => handleDeleteNote(item.id)}
                  >
                    <MaterialIcons name="delete" size={18} color="#EF4444" />
                    <Text style={styles.noteOptionText}>Delete</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}
          {viewMode === "grid" && (
            <TouchableOpacity
              style={styles.gridNoteOptionsButton}
              onPress={() => handleDeleteNote(item.id)}
            >
              <MaterialIcons name="delete" size={16} color="#9CA3AF" />
            </TouchableOpacity>
          )}
        </View>

        {item.type === "voice" ? (
          <View
            style={[
              styles.voiceNoteIndicator,
              viewMode === "grid" && styles.gridVoiceNoteIndicator,
            ]}
          >
            <View
              style={[
                styles.playButton,
                viewMode === "grid" && styles.gridPlayButton,
              ]}
            >
              <MaterialIcons
                name="play-arrow"
                size={viewMode === "grid" ? 20 : 24}
                color="#FFFFFF"
              />
            </View>
            {viewMode === "list" && (
              <>
                <View style={styles.waveform}>
                  {[...Array(25)].map((_, i) => (
                    <View
                      key={i}
                      style={[
                        styles.waveformBar,
                        {
                          height: Math.random() * 24 + 8,
                          backgroundColor: i < 8 ? "#6A009C" : "#aaaaaaff",
                        },
                      ]}
                    />
                  ))}
                </View>
                <Text style={styles.audioDuration}>2:34</Text>
              </>
            )}
            {viewMode === "grid" && (
              <Text style={styles.gridAudioDuration}>2:34</Text>
            )}
          </View>
        ) : (
          <Text
            style={[
              styles.notePreview,
              viewMode === "grid" && styles.gridNotePreview,
            ]}
            numberOfLines={viewMode === "grid" ? 4 : 3}
          >
            {item.content}
          </Text>
        )}

        {item.tags && item.tags.length > 0 && viewMode === "list" && (
          <View style={styles.tagsContainer}>
            {item.tags.slice(0, 3).map((tag, index) => (
              <View key={index} style={styles.tag}>
                <Text style={styles.tagText}>#{tag}</Text>
              </View>
            ))}
            {item.tags.length > 3 && (
              <View style={styles.moreTagsIndicator}>
                <Text style={styles.moreTagsText}>+{item.tags.length - 3}</Text>
              </View>
            )}
          </View>
        )}
      </View>
    </TouchableOpacity>
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
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowCreateFolderModal(false)}
        >
          <View style={{ flex: 1 }} />
          <TouchableOpacity
            style={styles.modalContent}
            activeOpacity={1}
            onPress={(e) => e.stopPropagation()}
          >
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
                        <MaterialIcons name="check" size={20} color="#9C27B0" />
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
          </TouchableOpacity>
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </Modal>
  );

  return (
    <TouchableOpacity
      style={styles.container}
      activeOpacity={1}
      onPress={() => {
        setActiveNoteOptions(null);
        setShowOptionsDropdown(false);
      }}
    >
      <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />

      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <View style={styles.headerTitleSection}>
            <Text style={styles.headerTitle}>All Notes</Text>
            <Text style={styles.headerSubtitle}>
              {filteredNotes.length}{" "}
              {filteredNotes.length === 1 ? "note" : "notes"}
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
      </View>

      <View style={styles.folderSection}>
        <TouchableOpacity
          style={styles.folderToggle}
          onPress={() => setShowFolderDropdown(!showFolderDropdown)}
          activeOpacity={0.7}
        >
          <View style={styles.folderToggleLeft}>
            <MaterialIcons name="folder" size={22} color="#FFDE21" />
            <Text style={styles.folderToggleText}>Folders</Text>
          </View>
          <MaterialIcons
            name={showFolderDropdown ? "expand-less" : "expand-more"}
            size={24}
            color="#9CA3AF"
          />
        </TouchableOpacity>

        {showFolderDropdown && (
          <View style={styles.folderDropdown}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.foldersScrollContent}
            >
              {folders.map((folder) => (
                <TouchableOpacity
                  key={folder.id}
                  style={styles.folderCard}
                  activeOpacity={0.8}
                >
                  <View
                    style={[
                      styles.folderIcon,
                      { backgroundColor: folder.color },
                    ]}
                  >
                    <MaterialIcons
                      name={folder.icon}
                      size={24}
                      color="#FFFFFF"
                    />
                  </View>
                  <Text style={styles.folderName}>{folder.name}</Text>
                  <Text style={styles.folderCount}>
                    {Math.floor(Math.random() * 12) + 1}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}
      </View>

      <FlatList
        data={filteredNotes}
        renderItem={renderNoteItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.notesList}
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <View style={styles.noteSeparator} />}
        numColumns={viewMode === "grid" ? 2 : 1}
        key={viewMode}
        ListEmptyComponent={() => (
          <View style={styles.emptyState}>
            <MaterialIcons name="search-off" size={64} color="#CBD5E0" />
            <Text style={styles.emptyStateTitle}>No notes found</Text>
            <Text style={styles.emptyStateSubtitle}>
              {searchQuery
                ? "Try adjusting your search terms"
                : "Create your first note to get started"}
            </Text>
          </View>
        )}
      />

      <View style={styles.fabContainer}>
        <TouchableOpacity
          style={[styles.fabButton, styles.textFab]}
          onPress={handleCreateNote}
          activeOpacity={0.8}
        >
          <MaterialIcons name="note-add" size={28} color="#9C27B0" />
        </TouchableOpacity>
      </View>

      <Navbar activeRoute="Notes" />
      {renderCreateFolderModal()}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: Platform.OS === "ios" ? 60 : 40,
    paddingBottom: 24,
    backgroundColor: "#F8FAFC",
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
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#6366F1",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 2,
  },
  activeSearchButton: {
    backgroundColor: "#6A009C",
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
    shadowOpacity: 0.04,
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
  folderIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
  },
  folderName: {
    fontSize: 13,
    fontFamily: "Inter-Medium",
    color: "#374151",
    textAlign: "center",
    marginBottom: 4,
  },
  folderCount: {
    fontSize: 11,
    fontFamily: "Inter-Regular",
    color: "#9CA3AF",
  },
  notesList: {
    paddingHorizontal: 24,
    paddingBottom: 120,
  },
  noteItem: {
    marginVertical: 6,
  },
  gridNoteItem: {
    flex: 1,
    marginHorizontal: 4,
    maxWidth: (width - 72) / 2, // Account for padding and gap
  },
  noteContent: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 20,
    shadowColor: "#1E293B",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  gridNoteContent: {
    padding: 16,
    borderRadius: 16,
  },
  voiceNoteContent: {
    borderLeftWidth: 4,
    borderLeftColor: "#6A009C",
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
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  gridNoteTypeIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    marginRight: 8,
  },
  noteTitleSection: {
    flex: 1,
    justifyContent: "center",
  },
  noteTitle: {
    fontSize: 16,
    fontFamily: "Inter-Bold",
    color: "#1E293B",
    marginBottom: 4,
    lineHeight: 20,
  },
  gridNoteTitle: {
    fontSize: 14,
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
    right: 0,
    top: 40,
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    shadowColor: "#1E293B",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
    zIndex: 10,
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
  },
  gridNoteDate: {
    fontSize: 11,
  },
  gridNotePreview: {
    fontSize: 12,
    lineHeight: 16,
    marginBottom: 8,
  },
  voiceNoteIndicator: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f2e5f8ff",
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  gridVoiceNoteIndicator: {
    padding: 12,
    marginBottom: 8,
    justifyContent: "center",
  },
  playButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#6A009C",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  gridPlayButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: 8,
  },
  waveform: {
    flexDirection: "row",
    alignItems: "center",

    flex: 1,
    height: 32,
    marginRight: 12,
  },
  waveformBar: {
    width: 2,
    borderRadius: 1,
    marginHorizontal: 1,
  },
  audioDuration: {
    fontSize: 12,
    fontFamily: "Inter-Medium",
    color: "#6A009C",
  },
  gridAudioDuration: {
    fontSize: 11,
    fontFamily: "Inter-Medium",
    color: "#6A009C",
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
  fabContainer: {
    position: "absolute",
    right: 24,
    bottom: 100,
    alignItems: "center",
  },
  fabButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.24,
    shadowRadius: 16,
    elevation: 8,
    marginBottom: 16,
  },

  textFab: {
    backgroundColor: "#ffffffff",
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
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 24,
    alignItems: "center",
    shadowColor: "#6A009C",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
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
});