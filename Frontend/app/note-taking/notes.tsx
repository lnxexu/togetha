import { MaterialIcons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Audio } from 'expo-av';
import React, { useState, useEffect, useCallback } from 'react';
import Navbar from '../NavBar';
import { notesApi } from './services/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';

import {
  Animated,
  Dimensions,
  FlatList,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Alert,
  RefreshControl,
  ActivityIndicator
} from 'react-native';
import { RootStackParamList } from '../navigation/AppNavigator';

const { width } = Dimensions.get('window');

type NotesScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Notes'>;

interface NotesScreenProps {
  navigation: NotesScreenNavigationProp;
}

interface Note {
  id: string;
  title: string;
  content: string;
  folder: string;
  created_at?: Date;
  updated_at?: Date;
  createdAt?: Date; // For compatibility with both API and local format
  updatedAt?: Date; // For compatibility with both API and local format
  type: 'text' | 'voice' | 'image';
  audio_recordings?: Array<{
    id: string;
    audio_file: string;
    duration: number;
    transcribed: boolean;
  }>;
  audioUri?: string;
  tags?: string[];
  linkedTaskId?: string;
  _synced?: boolean; // Flag to track sync status
  _pendingAction?: 'create' | 'update' | 'delete'; // For offline changes tracking
}

// Interface for folders
interface Folder {
  id: string;
  name: string;
  description?: string;
  notes_count?: number;
  icon?: keyof typeof MaterialIcons.glyphMap; // For UI representation
  _synced?: boolean;
}

export default function NotesScreen() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState('all');
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [recordingAnimation] = useState(new Animated.Value(1));
  const [showFolderDropdown, setShowFolderDropdown] = useState(false);
  
  // New states for API integration and offline functionality
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);

  // Network connectivity listener
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      const online = !!state.isConnected;
      setIsOnline(online);
      
      // Trigger sync when coming back online
      if (online && !isOnline) {
        syncWithServer();
      }
    });

    return () => unsubscribe();
  }, [isOnline]);

  // Initial data loading
  useEffect(() => {
    loadData();
  }, [selectedFolder]);

  // Load data from API or local storage
  const loadData = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Try loading from local storage first (for immediate display)
      await loadFromLocalStorage();
      
      // If online, fetch fresh data from API
      if (isOnline) {
        await fetchFolders();
        await fetchNotes();
      }
    } catch (err) {
      console.error('Error loading data:', err);
      setError('Failed to load notes. Please try again.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  // Save data to local storage
  const saveToLocalStorage = async () => {
    try {
      await AsyncStorage.setItem('notes', JSON.stringify(notes));
      await AsyncStorage.setItem('folders', JSON.stringify(folders));
      await AsyncStorage.setItem('lastSyncTime', new Date().toISOString());
    } catch (err) {
      console.error('Error saving to local storage:', err);
    }
  };

  // Load data from local storage
  const loadFromLocalStorage = async () => {
    try {
      const storedNotes = await AsyncStorage.getItem('notes');
      const storedFolders = await AsyncStorage.getItem('folders');
      
      if (storedNotes) {
        setNotes(JSON.parse(storedNotes));
      }
      
      if (storedFolders) {
        setFolders(JSON.parse(storedFolders));
      }
    } catch (err) {
      console.error('Error loading from local storage:', err);
    }
  };

  // Count pending sync items
  useEffect(() => {
    const count = notes.filter(note => note._pendingAction).length;
    setPendingSyncCount(count);
  }, [notes]);

  // Auto-save changes to local storage
  useEffect(() => {
    if (notes.length > 0 || folders.length > 0) {
      saveToLocalStorage();
    }
  }, [notes, folders]);

  // Fetch folders from API
  const fetchFolders = async () => {
    try {
      const foldersData = await notesApi.getFolders();
      
      // Assign icons to folders for UI
      const processedFolders = foldersData.map((folder: Folder) => ({
        ...folder,
        icon: getIconForFolder(folder.name),
        _synced: true
      }));
      
      setFolders(processedFolders);
    } catch (err) {
      console.error('Error fetching folders:', err);
      if (isOnline) {
        setError('Failed to load folders from server');
      }
    }
  };

  // Assign icons based on folder name
  const getIconForFolder = (name: string): keyof typeof MaterialIcons.glyphMap => {
    const nameLC = name.toLowerCase();
    if (nameLC.includes('work')) return 'business-center';
    if (nameLC.includes('person')) return 'person';
    if (nameLC.includes('idea')) return 'lightbulb-outline';
    if (nameLC.includes('recipe')) return 'restaurant';
    if (nameLC.includes('travel')) return 'travel-explore';
    if (nameLC.includes('project')) return 'folder-open';
    if (nameLC.includes('financ')) return 'account-balance';
    if (nameLC.includes('health')) return 'favorite';
    return 'folder'; // Default icon
  };

  // Fetch notes from API
  const fetchNotes = async () => {
    try {
      let notesData;
      
      if (selectedFolder) {
        notesData = await notesApi.getNotesByFolder(selectedFolder);
      } else {
        notesData = await notesApi.getNotes();
      }
      
      // Process notes to add UI-specific properties
      const processedNotes = notesData.map((note: Note) => {
        // Determine note type based on whether it has audio recordings
        const noteType = note.audio_recordings && note.audio_recordings.length > 0
          ? 'voice'
          : 'text';
          
        // Extract tags from content (this is a placeholder - implement your tag extraction logic)
        const tags = extractTagsFromContent(note.content);
        
        return {
          ...note,
          type: noteType,
          tags,
          createdAt: new Date(note.created_at || Date.now()),
          updatedAt: new Date(note.updated_at || Date.now()),
          _synced: true
        };
      });
      
      // Merge with local notes that are pending sync
      const pendingNotes = notes.filter(note => note._pendingAction);
      if (pendingNotes.length > 0) {
        // Keep pending notes and add newly fetched ones that don't conflict
        const mergedNotes = [...pendingNotes];
        
        processedNotes.forEach((apiNote: Note) => {
          const pendingNote = pendingNotes.find(n => n.id === apiNote.id);
          if (!pendingNote) {
            mergedNotes.push(apiNote);
          }
        });
        
        setNotes(mergedNotes);
      } else {
        setNotes(processedNotes);
      }
    } catch (err) {
      console.error('Error fetching notes:', err);
      if (isOnline) {
        setError('Failed to load notes from server');
      }
    }
  };

  // Simple tag extraction function (placeholder - implement your own logic)
  const extractTagsFromContent = (content: string): string[] => {
    if (!content) return [];
    
    // Extract hashtags from content
    const matches = content.match(/#\w+/g);
    if (matches) {
      return matches.map(tag => tag.substring(1)); // Remove # prefix
    }
    return [];
  };

  // Create new note
  const createNote = async (noteData: Partial<Note>) => {
    // Create temporary local note with pending status
    const tempId = `temp_${Date.now()}`;
    const newNote: Note = {
      id: tempId,
      title: noteData.title || 'New Note',
      content: noteData.content || '',
      folder: selectedFolder || '',
      type: noteData.type || 'text',
      createdAt: new Date(),
      updatedAt: new Date(),
      _synced: false,
      _pendingAction: 'create'
    };
    
    // Add to local state immediately (optimistic update)
    setNotes(prev => [newNote, ...prev]);
    
    // If online, try to sync immediately
    if (isOnline) {
      try {
        const response = await notesApi.createNote({
          title: newNote.title,
          content: newNote.content,
          folder: newNote.folder
        });
        
        // Update local state with server response
        setNotes(prev => prev.map(note => 
          note.id === tempId ? { 
            ...response, 
            type: newNote.type,
            createdAt: new Date(response.created_at),
            updatedAt: new Date(response.updated_at),
            _synced: true 
          } : note
        ));
        
        // If it's a voice note and has audioUri, upload the recording
        if (newNote.type === 'voice' && newNote.audioUri) {
          await uploadAudioRecording(response.id, newNote.audioUri);
        }
      } catch (err) {
        console.error('Error creating note:', err);
        // Keep the note with pending status for later sync
      }
    }
  };

  // Delete note
  const deleteNote = async (noteId: string) => {
    // Check if it's a temp note that hasn't been synced yet
    const isTemp = noteId.startsWith('temp_');
    
    if (isTemp) {
      // If it's a temp note, just remove it from local state
      setNotes(prev => prev.filter(note => note.id !== noteId));
      return;
    }
    
    // Mark for deletion (optimistic update)
    setNotes(prev => prev.map(note => 
      note.id === noteId 
        ? { ...note, _pendingAction: 'delete', _synced: false } 
        : note
    ));
    
    // If online, try to delete from server
    if (isOnline) {
      try {
        await notesApi.deleteNote(noteId);
        // Remove from local state on success
        setNotes(prev => prev.filter(note => note.id !== noteId));
      } catch (err) {
        console.error('Error deleting note:', err);
        Alert.alert('Error', 'Failed to delete note. Will retry when online.');
      }
    }
  };

  // Upload audio recording
  const uploadAudioRecording = async (noteId: string, audioUri: string) => {
    if (!isOnline) {
      // Store info for later upload
      // For simplicity, we'll just keep the URI with the note
      return;
    }
    
    try {
      const response = await notesApi.uploadAudioRecording(noteId, audioUri);
      
      // Update note with audio recording info
      setNotes(prev => prev.map(note => 
        note.id === noteId 
          ? { 
              ...note, 
              audio_recordings: [...(note.audio_recordings || []), response]
            } 
          : note
      ));
      
      return response;
    } catch (err) {
      console.error('Error uploading audio:', err);
      throw err;
    }
  };

  // Sync pending changes with server
  const syncWithServer = async () => {
    if (!isOnline || isSyncing) return;
    
    setIsSyncing(true);
    
    try {
      // Process all pending actions
      const notesToSync = notes.filter(note => note._pendingAction);
      
      for (const note of notesToSync) {
        switch (note._pendingAction) {
          case 'create':
            try {
              const response = await notesApi.createNote({
                title: note.title,
                content: note.content,
                folder: note.folder
              });
              
              // If it's a voice note and has audioUri, upload the recording
              if (note.type === 'voice' && note.audioUri) {
                await uploadAudioRecording(response.id, note.audioUri);
              }
              
              // Update local state
              setNotes(prev => prev.map(n => 
                n.id === note.id 
                  ? { 
                      ...response, 
                      type: note.type,
                      createdAt: new Date(response.created_at),
                      updatedAt: new Date(response.updated_at),
                      _synced: true,
                      _pendingAction: undefined
                    } 
                  : n
              ));
            } catch (err) {
              console.error('Error syncing create:', err);
            }
            break;
            
          case 'update':
            try {
              const response = await notesApi.updateNote(note.id, {
                title: note.title,
                content: note.content,
                folder: note.folder
              });
              
              // Update local state
              setNotes(prev => prev.map(n => 
                n.id === note.id 
                  ? { 
                      ...response, 
                      type: note.type,
                      createdAt: new Date(response.created_at),
                      updatedAt: new Date(response.updated_at),
                      _synced: true,
                      _pendingAction: undefined
                    } 
                  : n
              ));
            } catch (err) {
              console.error('Error syncing update:', err);
            }
            break;
            
          case 'delete':
            try {
              await notesApi.deleteNote(note.id);
              // Remove from local state
              setNotes(prev => prev.filter(n => n.id !== note.id));
            } catch (err) {
              console.error('Error syncing delete:', err);
            }
            break;
        }
      }
      
      // After all syncing is done, refresh data from server
      await fetchNotes();
    } finally {
      setIsSyncing(false);
    }
  };

  // Start recording function with animation
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

      // Start pulsing animation
      Animated.loop(
        Animated.sequence([
          Animated.timing(recordingAnimation, {
            toValue: 1.2,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(recordingAnimation, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } catch (err) {
      console.error('Failed to start recording', err);
      Alert.alert('Error', 'Failed to start recording');
    }
  };

  // Stop recording function
  const stopRecording = async () => {
    if (!recording) return;

    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setRecording(null);
      setIsRecording(false);
      recordingAnimation.stopAnimation();
      recordingAnimation.setValue(1);

      // Create a new voice note with the recording
      if (uri) {
        await createNote({
          title: `Voice Note ${new Date().toLocaleString()}`,
          content: '',
          type: 'voice',
          audioUri: uri,
        });
      }
    } catch (err) {
      console.error('Failed to stop recording', err);
      Alert.alert('Error', 'Failed to save recording');
    }
  };

  const onRefresh = useCallback(() => {
    setIsRefreshing(true);
    loadData();
  }, []);

  const onFolderPress = (folderId: string) => {
    setSelectedFolder(folderId === selectedFolder ? null : folderId);
    setShowFolderDropdown(false);
  };

  const createTextNote = () => {
    // Navigate to create note screen or implement inline creation
    // For this example, we'll just create a basic note
    createNote({
      title: 'New Note',
      content: '',
      type: 'text'
    });
  };

  const filteredNotes = notes.filter(note => {
    // Don't show notes marked for deletion
    if (note._pendingAction === 'delete') return false;
    
    const matchesSearch = note.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          note.content.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = selectedFilter === 'all' || note.type === selectedFilter;
    const matchesFolder = !selectedFolder || note.folder === selectedFolder;
    
    return matchesSearch && matchesFilter && matchesFolder;
  });

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'voice':
        return 'mic';
      case 'image':
        return 'image';
      default:
        return 'note';
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'voice':
        return '#FF6B6B';
      case 'image':
        return '#4ECDC4';
      default:
        return '#45B7D1';
    }
  };

  const formatDate = (date: Date) => {
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 1) return 'Today';
    if (diffDays === 2) return 'Yesterday';
    if (diffDays <= 7) return `${diffDays - 1} days ago`;
    return date.toLocaleDateString();
  };

  const renderNoteItem = ({ item, index }: { item: Note; index: number }) => (
    <View style={styles.noteItem}>
      <TouchableOpacity 
        style={[
          styles.noteContent,
          !item._synced && styles.unsyncedNote
        ]} 
        activeOpacity={0.8}
        onLongPress={() => {
          Alert.alert(
            'Delete Note',
            'Are you sure you want to delete this note?',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Delete', onPress: () => deleteNote(item.id), style: 'destructive' }
            ]
          );
        }}
      >
        <View style={styles.noteHeader}>
          <View style={styles.noteTitleContainer}>
            <View style={[styles.typeIndicator, { backgroundColor: getTypeColor(item.type) }]}>
              <MaterialIcons name={getTypeIcon(item.type)} size={16} color="white" />
            </View>
            <Text style={styles.noteTitle} numberOfLines={1}>
              {item.title}
            </Text>
            {!item._synced && (
              <MaterialIcons name="sync" size={16} color="#9CA3AF" style={{ marginLeft: 8 }} />
            )}
          </View>
          <Text style={styles.noteDate}>
            {formatDate(new Date(item.updatedAt || item.updated_at || Date.now()))}
          </Text>
        </View>
        
        {item.type === 'voice' ? (
          <View style={styles.voiceNoteIndicator}>
            <View style={styles.waveform}>
              {[...Array(20)].map((_, i) => (
                <View
                  key={i}
                  style={[
                    styles.waveformBar,
                    { height: Math.random() * 20 + 8 }
                  ]}
                />
              ))}
            </View>
            <Text style={styles.voiceNoteDuration}>
              {item.audio_recordings && item.audio_recordings[0]?.duration 
                ? `${Math.floor(item.audio_recordings[0].duration / 60)}:${Math.floor(item.audio_recordings[0].duration % 60).toString().padStart(2, '0')}`
                : '0:00'}
            </Text>
          </View>
        ) : (
          <Text style={styles.notePreview} numberOfLines={2}>
            {item.content}
          </Text>
        )}
        
        {item.tags && item.tags.length > 0 && (
          <View style={styles.tagsContainer}>
            {item.tags.slice(0, 3).map((tag, tagIndex) => (
              <View key={tagIndex} style={styles.tag}>
                <Text style={styles.tagText}>#{tag}</Text>
              </View>
            ))}
          </View>
        )}
      </TouchableOpacity>
    </View>
  );

  const renderEmptyState = () => {
    if (isLoading) {
      return (
        <View style={styles.emptyState}>
          <ActivityIndicator size="large" color="#6A009C" />
          <Text style={styles.emptyStateSubtitle}>Loading notes...</Text>
        </View>
      );
    }
    
    return (
      <View style={styles.emptyState}>
        <MaterialIcons name="note-add" size={80} color="#E0E0E0" />
        <Text style={styles.emptyStateTitle}>No notes yet</Text>
        <Text style={styles.emptyStateSubtitle}>
          Tap the + button to create your first note
        </Text>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <Text style={styles.headerTitle}>
            {selectedFolder 
              ? folders.find(f => f.id === selectedFolder)?.name || 'Notes'
              : 'All Notes'}
          </Text>
          <View style={styles.headerIcons}>
            {!isOnline && (
              <MaterialIcons name="cloud-off" size={24} color="#F97316" style={styles.icon} />
            )}
            {pendingSyncCount > 0 && (
              <TouchableOpacity onPress={syncWithServer} disabled={!isOnline || isSyncing}>
                <MaterialIcons 
                  name={isSyncing ? "sync" : "sync-problem"} 
                  size={24} 
                  color={isSyncing ? "#9CA3AF" : "#F97316"} 
                  style={styles.icon} 
                />
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={() => {}}>
              <MaterialIcons name="search" size={24} color="#1F2937" style={styles.icon} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => {}}>
              <MaterialIcons name="more-vert" size={24} color="#1F2937" style={styles.rotatedToolbarIcon} />
            </TouchableOpacity>
          </View>
        </View>
        <Text style={styles.headerSubtitle}>
          {filteredNotes.length} {filteredNotes.length === 1 ? 'note' : 'notes'}
        </Text>
      </View>

      {/* Folder Container */}
      <View style={styles.folderContainer}>
        <TouchableOpacity
          style={styles.folderBar}
          onPress={() => setShowFolderDropdown(!showFolderDropdown)}
          activeOpacity={0.8}
        >
          <MaterialIcons name="folder" size={20} color="#9CA3AF" />
          <Text style={styles.folderText}>Folders</Text>
          <MaterialIcons
            name={showFolderDropdown ? 'keyboard-arrow-up' : 'keyboard-arrow-down'}
            size={20}
            color="#9CA3AF"
          />
        </TouchableOpacity>

        {showFolderDropdown && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.folderDropdown}>
            {folders.map((folder) => (
              <TouchableOpacity 
                key={folder.id} 
                style={[
                  styles.folderItem,
                  selectedFolder === folder.id && styles.selectedFolderItem
                ]} 
                activeOpacity={0.7}
                onPress={() => onFolderPress(folder.id)}
              >
                <MaterialIcons 
                  name={folder.icon || 'folder'} 
                  size={32} 
                  color={selectedFolder === folder.id ? "#FFFFFF" : "#6A009C"} 
                />
                <Text style={[
                  styles.folderItemText,
                  selectedFolder === folder.id && styles.selectedFolderText
                ]}>
                  {folder.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
      </View>

      {/* Notes List */}
      <FlatList
        data={filteredNotes}
        renderItem={renderNoteItem}
        keyExtractor={item => item.id}
        style={styles.notesList}
        contentContainerStyle={styles.notesListContainer}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={renderEmptyState}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            colors={["#6A009C"]}
            tintColor="#6A009C"
          />
        }
      />

      {/* Error message if needed */}
      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* Floating Action Buttons */}
      <View style={styles.fab}>
        <Animated.View style={{ transform: [{ scale: recordingAnimation }] }}>
          <TouchableOpacity
            style={[
              styles.fabButton,
              styles.voiceFabButton,
              isRecording && styles.recordingButton,
            ]}
            onPress={isRecording ? stopRecording : startRecording}
            activeOpacity={0.8}
          >
            <MaterialIcons
              name={isRecording ? 'stop' : 'mic'}
              size={30}
              color="#6A009C"
            />
          </TouchableOpacity>
        </Animated.View>
        
        <TouchableOpacity
          style={[styles.fabButton, styles.textFabButton]}
          onPress={createTextNote}
          activeOpacity={0.8}
        >
          <MaterialIcons name="note-add" size={30} color="#6A009C" />
        </TouchableOpacity>
      </View>
            
      <Navbar activeRoute="Notes" />

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fcfcfcff',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 50 : 20,
    paddingBottom: 20,
    backgroundColor: '#fcfcfcff',
  },
  headerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerIcons: {
    flexDirection: 'row',
    gap: 12, // For modern RN, or use margin if needed
  },
  icon: {
    marginRight: 12,
  },
  rotatedToolbarIcon: {
    transform: [{ rotate: '90deg' }],
  },
  headerTitle: {
    fontSize: 28,
    // fontFamily: 'Inter-Bold', // Commented out as custom fonts might not be loaded
    fontWeight: 'bold', // Using fontWeight as a fallback
    color: '#6A009C',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#6B7280',
  },
  // New Folder Container Styles
  folderContainer: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#fcfcfcff',
  },
  folderBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    justifyContent: 'space-between', // To push arrow to the right
  },
  folderText: {
    flex: 1, // Allows text to take available space
    marginLeft: 8,
    fontSize: 16,
    color: '#1F2937',
    fontWeight: '500',
  },
  folderDropdown: {
    marginTop: 12,
    paddingVertical: 8,
    // No fixed height, ScrollView will handle content size
  },
  folderItem: {
    alignItems: 'center',
    marginRight: 20, // Spacing between folder icons
    width: 70, // Fixed width for each folder item
  },
  folderItemText: {
    fontSize: 12,
    color: '#374151',
    marginTop: 4,
    textAlign: 'center',
  },
  // End of New Folder Container Styles

  notesList: {
    flex: 1,
  },
  notesListContainer: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 160,
  },
  noteItem: {
    marginBottom: 16,
  },
  noteContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  noteHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  noteTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  typeIndicator: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  noteTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    flex: 1,
  },
  noteDate: {
    fontSize: 12,
    color: '#9CA3AF',
    fontWeight: '500',
  },
  notePreview: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
    marginBottom: 12,
  },
  voiceNoteIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  waveform: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  waveformBar: {
    width: 3,
    backgroundColor: '#FF6B6B',
    marginRight: 2,
    borderRadius: 2,
  },
  voiceNoteDuration: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '500',
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  tag: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginRight: 8,
    marginBottom: 4,
  },
  tagText: {
    fontSize: 12,
    color: '#3B82F6',
    fontWeight: '500',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
  },
  emptyStateTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#9CA3AF',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyStateSubtitle: {
    fontSize: 14,
    color: '#D1D5DB',
    textAlign: 'center',
  },
  fab: {
    position: 'absolute',
    right: 20,
    // Adjust the bottom position to be above the Navbar
    bottom: 90, // Increased from 30 to 90 to account for Navbar height
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 1, // Ensure FAB stays on top
  },
  fabButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  voiceFabButton: {
    backgroundColor: '#ffffffff',
  },
  recordingButton: {
    backgroundColor: '#ffffffff',
  },
  textFabButton: {
    backgroundColor: '#ffffffff',
  },
  unsyncedNote: {
    borderLeftWidth: 4,
    borderLeftColor: '#F97316',
  },
  selectedFolderItem: {
    backgroundColor: '#6A009C',
    borderRadius: 12,
    padding: 8,
  },
  selectedFolderText: {
    color: '#FFFFFF',
  },
  errorContainer: {
    position: 'absolute',
    bottom: 140,
    left: 0,
    right: 0,
    backgroundColor: '#FFEBEE',
    padding: 8,
    alignItems: 'center',
  },
  errorText: {
    color: '#C62828',
    fontWeight: '500',
  },
});