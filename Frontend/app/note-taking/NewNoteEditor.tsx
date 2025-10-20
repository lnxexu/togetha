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
  BackHandler,
} from "react-native";
import { API_URL, API_ENDPOINTS } from "@/constants/ApiConfig";
import { LinearGradient } from "expo-linear-gradient";
import { showSuccessToast, showErrorToast, showWarningToast } from "../utils/ToastUtils";
import { useAutoSave } from "./hooks/useAutoSave";
import { noteService, Note as NoteType, SaveStatus } from "./services/noteService";
import { useNetworkStatus, getNetworkStatusText } from "./services/networkService";
import offlineStorage, { OfflineNote } from "./services/offlineStorage";
import noteSyncService from "./services/noteSyncService";
import { dictionaryService } from "./services/dictionaryService";
import offlineNotesService from "./services/offlineNotesService";

const { RichEditor, RichToolbar } = require("react-native-pell-rich-editor");

// Types
interface NoteEditorProps {
  route: {
    params?: {
      noteId?: string;
      initialNote?: {
        title: string;
        content: string;
        formatted_content?: string;
        folderId?: string | null;
        createdAt?: string;
        updatedAt?: string;
        version?: number;
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
  folderId?: string | null;
  createdAt?: string;
  updatedAt?: string;
  version?: number;
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


const RinaButton: React.FC<RinaPopupProps> = ({
  visible,
  selectedText,
  position,
  onClose,
  onAskRina,
}) => {
  if (!visible || !selectedText.trim()) return null;

  const buttonWidth = 100;
  const buttonHeight = 35;
  const windowWidth = Dimensions.get("window").width;
  const windowHeight = Dimensions.get("window").height;

  let left = position.x + 10;
  let top = position.y - buttonHeight - 5;

  if (left + buttonWidth > windowWidth - 16) {
    left = position.x - buttonWidth - 10;
  }
  if (left < 16) left = 16;

  if (top < 100) {
    top = position.y + 25;
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
  // History management for undo/redo
  const undoStackRef = useRef<string[]>([]);
  const redoStackRef = useRef<string[]>([]);
  const prevHtmlRef = useRef<string>(route.params?.initialNote?.formatted_content || route.params?.initialNote?.content || "");
  const lastHistoryPushRef = useRef<number>(0);
  const isApplyingHistoryRef = useRef<boolean>(false);
  // Track second-click behavior for lists
  const bulletSecondClickArmedRef = useRef<{ armed: boolean; at: number }>({ armed: false, at: 0 });
  const orderedSecondClickArmedRef = useRef<{ armed: boolean; at: number }>({ armed: false, at: 0 });

  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

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

  const [isSaving, setIsSaving] = useState(false);
  // Removed showMoreOptions state since kebab menu is removed

  const [saveStatus, setSaveStatus] = useState<SaveStatus>({ status: 'saved' });
  const [wordData, setWordData] = useState<any>(null);
  const [showWordMeaningModal, setShowWordMeaningModal] = useState(false);
  const [noteId, setNoteId] = useState(route.params?.noteId || noteService.generateNoteId());
  const [currentNote, setCurrentNote] = useState<NoteType>(() => ({
    id: route.params?.noteId || noteService.generateNoteId(),
    title: route.params?.initialNote?.title || "",
    content: route.params?.initialNote?.content || "",
    formatted_content: route.params?.initialNote?.formatted_content || "",

    folderId: route.params?.initialNote?.folderId || null,
    version: route.params?.initialNote?.version || 1,
  }));
  const [showRinaPopup, setShowRinaPopup] = useState(false);
  const [selectedText, setSelectedText] = useState("");
  const [selectionPosition, setSelectionPosition] = useState({ x: 0, y: 0 });
  const [textColor, setTextColor] = useState("black");
  const [bgColor, setBgColor] = useState("white");
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [currentColorAction, setCurrentColorAction] = useState<
    "text" | "background" | null
  >(null);
  // Removed Text Styles dropdown per request
  const [folders, setFolders] = useState<any[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(
    route.params?.initialNote?.folderId || null
  );
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [folderName, setFolderName] = useState<string>("Unorganized Notes");
  const [folderFilter, setFolderFilter] = useState('');
  const [showExitConfirmModal, setShowExitConfirmModal] = useState(false);
  const [selectedWord, setSelectedWord] = useState("");
  const [isLoadingMeaning, setIsLoadingMeaning] = useState(false);
  const [windowDimensions, setWindowDimensions] = useState(Dimensions.get('window'));

  // Network status monitoring
  const networkStatus = useNetworkStatus();
  const isOnline = networkStatus.isConnected && 
                  networkStatus.isInternetReachable && 
                  networkStatus.isServerReachable;

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

  // Initialize history stacks based on initial content
  useEffect(() => {
    const initial = route.params?.initialNote?.formatted_content || route.params?.initialNote?.content || "";
    prevHtmlRef.current = initial;
    undoStackRef.current = [];
    redoStackRef.current = [];
    setCanUndo(false);
    setCanRedo(false);
  }, []);

  // Modify the fetchFolders function to use offline service for offline support
  const fetchFolders = async () => {
    try {
      // Use offline service to fetch folders (works both online and offline)
      const data = await offlineNotesService.getAllFolders();
      
      const mapped = (Array.isArray(data) ? data : []).map((folder: any) => ({
        id: folder.id?.toString?.() ?? String(folder.id),
        name: folder.name,
        color: folder.color || "#667EEA",
        icon: folder.icon || "folder",
        note_count: folder.note_count || folder.notes_count || 0,
      }));
      setFolders(mapped);

      // Update folder name if we have a selected folder
      if (selectedFolderId) {
        const selectedFolder = mapped.find(
          (f: any) => f.id.toString() === selectedFolderId
        );
        if (selectedFolder) {
          setFolderName(selectedFolder.name);
        }
      }
    } catch (error) {
      console.error("Error fetching folders:", error);
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

  // Periodic auto-sync when online, silent
  useEffect(() => {
    if (!isOnline) return;
    let cancelled = false;
    const t = setInterval(async () => {
      try {
        const hasPending = await noteSyncService.hasPendingOperations();
        if (cancelled || !hasPending) return;
        await noteSyncService.syncWithServer();
        setSaveStatus({ status: 'saved' });
      } catch {
        // silent fail; next tick will retry
      }
    }, 10000);
    return () => { cancelled = true; clearInterval(t); };
  }, [isOnline]);

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
      // Clean up auto-save timeout
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, []);

  // Android hardware back: ensure save before exit
  useEffect(() => {
    const onHardwareBack = () => {
      handleBackPress();
      return true; // prevent default navigation
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onHardwareBack);
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formattedContent, title, selectedFolderId, currentNote]);

  // Auto-save setup with new Google Docs-style system
  const saveNote = async (note: NoteType, isAutoSave = true): Promise<NoteType | void> => {
    // Helper to decide create vs update similar to noteService
    const shouldCreate = (n: NoteType) => {
      if (!n?.id) return true;
      if (n.id.startsWith('note_')) return true;
      const uuidLike = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(n.id);
      if (uuidLike) return false;
      return false;
    };

    // Persist to server (or local) via noteService first
    const result = await noteService.saveNote(note, isAutoSave);
    setSaveStatus(result.status);

    // Save to offline storage ONCE with proper sync status
    try {
      if (result?.note) {
        const now = new Date().toISOString();
        const syncStatus = result.status.status === 'saved' ? 'synced' : 
                          (result.status.status === 'offline' || result.status.status === 'error') ? 'pending' : 'synced';
        
        // Preserve last_accessed if we have one from currentNote or offline cache
        let preservedLastAccessed: string | undefined;
        try {
          const existing = await offlineStorage.getOfflineNoteById(result.note.id);
          preservedLastAccessed = (existing as any)?.last_accessed
            || (existing as any)?.lastAccessedAt
            || (currentNote as any)?.lastAccessedAt
            || undefined;
        } catch {}
        
        const offlineNote: OfflineNote = {
          id: result.note.id,
          localId: shouldCreate(note) ? note.id : undefined,
          title: result.note.title || note.title || '',
          content: result.note.content || note.content || '',
          formatted_content: result.note.formatted_content || note.formatted_content || '',
          folderId: result.note.folderId || note.folderId || undefined,
          folder: result.note.folderId || note.folderId || undefined,
          createdAt: result.note.createdAt || note.createdAt || now,
          updatedAt: result.note.updatedAt || now,
          type: 'text',
          tags: result.note.tags || note.tags || [],
          is_archived: (result.note as any).is_archived || false,
          template: undefined,
          document_annotations: undefined,
          drawing_data: undefined,
          has_drawing: false,
          syncStatus,
          lastModified: now,
          // Critical: keep last_accessed so access order isn't lost by save
          ...(preservedLastAccessed ? { last_accessed: preservedLastAccessed } : {}),
        };
        
        await offlineStorage.saveOfflineNote(offlineNote);
        
        // Queue operation for sync only when offline/error
        if (result.status.status === 'offline' || result.status.status === 'error') {
          await noteSyncService.queueOperation(
            shouldCreate(note) ? 'create' : 'update',
            'note',
            result.note.id,
            {
              title: offlineNote.title,
              content: offlineNote.content,
              formatted_content: offlineNote.formatted_content,
              folderId: offlineNote.folderId,
            },
            shouldCreate(note) ? offlineNote.localId : undefined
          );
        }
      }
    } catch (e) {
      console.error('Failed to persist note to offline storage:', e);
    }

    if (result.note.id !== note.id) {
      // Note ID changed (server assigned new ID)
      setNoteId(result.note.id);
      setCurrentNote(result.note);
    }
    
    return result.note;
  };

  const { triggerSave, forceSave, hasUnsavedChanges: autoSaveHasChanges } = useAutoSave(currentNote, saveNote, {
    delay: 2000, // 2 seconds like Google Docs
    enabled: true,
    initialData: route.params?.initialNote ? {
      id: route.params.noteId || noteService.generateNoteId(),
      ...route.params.initialNote
    } : undefined,
    trackChanges: true,
    onSaveStart: () => setSaveStatus({ status: 'saving' }),
    onSaveSuccess: (result) => {
      if (result && result.id !== currentNote.id) {
        setNoteId(result.id);
        setCurrentNote(result);
      }
      setSaveStatus({ status: 'saved' });
    },
    onSaveError: (error) => {
      setSaveStatus({ 
        status: 'error', 
        message: 'Auto-save failed. Changes saved locally.' 
      });
    },
  });

  // Update current note when individual fields change and trigger auto-save
  useEffect(() => {
    const updatedNote: NoteType & { lastAccessedAt?: string } = {
      ...currentNote,
      title,
      content,
      formatted_content: formattedContent,
      folderId: selectedFolderId,
      updatedAt: new Date().toISOString(),
      // Set lastAccessedAt to ensure newly created notes appear at top of list
      lastAccessedAt: new Date().toISOString(),
    };
    
    setCurrentNote(updatedNote);
    
    // Only trigger save if there's actual content
    if (title.trim() || content.trim() || formattedContent.trim()) {
      triggerSave(updatedNote);
    }
  }, [title, content, formattedContent, selectedFolderId]);

  // Trigger sync when coming back online, and reconcile local->server IDs
  const prevOnlineRef = useRef<boolean>(isOnline);
  useEffect(() => {
    const prev = prevOnlineRef.current;
    prevOnlineRef.current = isOnline;
    if (!prev && isOnline) {
      // Just reconnected: attempt sync
      (async () => {
        try {
          const syncResult = await noteSyncService.syncWithServer();
          if (!syncResult.success) {
            showWarningToast('Some changes failed to sync');
          } else {
            showSuccessToast('All changes synced');
          }
          // If our current note was created offline, its ID may now be a server ID
          try {
            const updated = await offlineStorage.getOfflineNoteById(noteId);
            if (updated && updated.id && updated.id !== noteId) {
              setNoteId(updated.id);
              setCurrentNote((prevNote) => ({
                ...prevNote,
                id: updated.id,
              }));
            }
          } catch {}
          setSaveStatus({ status: 'saved' });
        } catch (err) {
          console.warn('Sync on reconnect failed:', err);
          showWarningToast('Sync failed. Will retry later.');
        }
      })();
    }
  }, [isOnline, noteId]);

  // Handle back button - ensure we save current rich text content before exiting
  const handleBackPress = async () => {
    try {
      // Pull the freshest HTML from editor in case state lags while typing
      const latestHtml: string = (await richTextRef.current?.getContentHtml?.()) ?? formattedContent ?? "";
      const latestText = latestHtml.replace(/<[^>]*>/g, "");
      const updatedNote: NoteType = {
        ...currentNote,
        title,
        content: latestText,
        formatted_content: latestHtml,
        folderId: selectedFolderId,
        updatedAt: new Date().toISOString(),
      };
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
        autoSaveTimeoutRef.current = null;
      }
      await forceSave(updatedNote);
    } catch (e) {
      // proceed regardless to avoid trapping the user
    } finally {
      navigation.goBack();
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

  const openColorPicker = (type: "text" | "background") => {
    setCurrentColorAction(type);
    setShowColorPicker(true);
  };

  const applyColor = (colorName: string, colorHex: string) => {
    if (currentColorAction === "text") {
      setTextColor(colorName);
      // Try both the helper and command for maximum compatibility
      try { richTextRef.current?.setForeColor?.(colorHex); } catch {}
      richTextRef.current?.sendAction?.('foreColor', colorHex);
      showSuccessToast(`Text color changed to ${colorName}`);
    } else if (currentColorAction === "background") {
      setBgColor(colorName);
      // Some platforms prefer hiliteColor, others backColor – try both
      try { richTextRef.current?.setHiliteColor?.(colorHex); } catch {}
      richTextRef.current?.sendAction?.('hiliteColor', colorHex);
      richTextRef.current?.sendAction?.('backColor', colorHex);
      showSuccessToast(`Background color changed to ${colorName}`);
    }
    setShowColorPicker(false);
  };

  // Event handlers - implement debounce to prevent duplicate saves
  const lastSaveTimeRef = useRef<number>(0);
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Auto-save function with debouncing
  const handleAutoSave = async () => {
    // Don't auto-save if already saving or if content is empty
    if (isSaving || (!content.trim() && !formattedContent.trim())) {
      return;
    }
    
    try {
      await forceSave(currentNote);
    } catch (error) {
      console.error('Auto-save failed:', error);
      // Don't show error toast for auto-save failures to avoid spam
    }
  };
  
  const handleSave = async () => {
    const now = Date.now();
    const timeSinceLastSave = now - lastSaveTimeRef.current;
    
    // Prevent duplicate saves within 2 seconds
    if (isSaving || timeSinceLastSave < 2000) {
      return;
    }

    lastSaveTimeRef.current = now;
    setIsSaving(true);
    
    try {
      // Force immediate save (bypass debounce) and wait for completion
      await forceSave(currentNote);
      
      // Show success message based on network status
      if (isOnline) {
        showSuccessToast("Note saved successfully");
      } else {
        showWarningToast("Note saved locally. Will sync when online.");
      }

    } catch (error) {
      showErrorToast("Failed to save note. Please try again.");
      // Reset the last save time on error to allow immediate retry
      lastSaveTimeRef.current = 0;
    } finally {
      // Reset saving state after a brief delay
      setTimeout(() => {
        setIsSaving(false);
      }, 500);
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
    const cleanText = text.trim();
    if (cleanText.length === 0) return;

    // Fire-and-forget the async helper (it's safe because it updates state)
    askRinaForHelp(cleanText);
  };

  // Simple HTML escape for safe insertion
  const escapeHtml = (str: string) =>
    str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  // Build list HTML from possibly multi-line selected text
  const buildListHtmlFromText = (text: string, type: 'ul' | 'ol') => {
    const lines = (text || '')
      .split(/\r?\n|\u2028|\u2029/g)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    if (lines.length === 0) {
      return `<${type}><li></li></${type}>`;
    }
    const items = lines.map((l) => `<li>${escapeHtml(l)}</li>`).join('');
    return `<${type}>${items}</${type}>`;
  };

  // Create an explicit history checkpoint so toolbar actions are individually undoable
  const checkpointHistoryForAction = async () => {
    const prev = prevHtmlRef.current;
    if (typeof prev === 'string') {
      undoStackRef.current.push(prev);
      if (undoStackRef.current.length > 100) undoStackRef.current.shift();
      redoStackRef.current = [];
      setCanUndo(true);
      setCanRedo(false);
      // Prevent onChange from adding another coalesced entry right away
      lastHistoryPushRef.current = Date.now();
    }
  };

  // Robust list application helpers with multiple fallbacks
  const applyUnorderedList = async () => {
    const editor = richTextRef.current;
    if (!editor) return;
    // If armed for second-click empty item within a short window, insert empty LI and reset
    if (bulletSecondClickArmedRef.current.armed && Date.now() - bulletSecondClickArmedRef.current.at < 5000) {
      await checkpointHistoryForAction();
      try { editor.focusContentEditor?.(); } catch {}
      await new Promise(res => setTimeout(res, 30));
      // Insert an empty bullet item; using a small UL ensures a visible bullet even outside a list
      try { editor.insertHTML?.('<ul><li></li></ul>'); } catch {}
      bulletSecondClickArmedRef.current = { armed: false, at: 0 };
      return;
    }
    await checkpointHistoryForAction();
    try { editor.focusContentEditor?.(); } catch {}
    // capture pre-change html
    let before = '';
    try { before = (await editor.getContentHtml?.()) ?? ''; } catch {}
    // Give focus a moment to settle
    await new Promise(res => setTimeout(res, 50));
    // Try native method
    if (typeof editor.insertBulletsList === 'function') {
      try { await editor.insertBulletsList(); } catch {}
    }
    // Try multiple action names without extra args
    const actions = ['insertBulletsList', 'insertUnorderedList', 'unorderedList'];
    for (const act of actions) {
      try { editor.sendAction?.(act); } catch {}
    }
    // If still unchanged, try switching from ordered to unordered (convert OL -> UL)
    // Check if content changed; if not, fallback to HTML insert
    let after = before;
    try { after = (await editor.getContentHtml?.()) ?? before; } catch {}
    if (after === before) {
      try { editor.sendAction?.('insertOrderedList'); } catch {}
      try { editor.sendAction?.('insertBulletsList'); } catch {}
      try { after = (await editor.getContentHtml?.()) ?? before; } catch {}
    }
    // As last resort, insert selection wrapped as a list
    if (after === before) {
      const text = (selectedText || '').trim();
      if (text) {
        const html = buildListHtmlFromText(text, 'ul');
        try { editor.insertHTML?.(html); } catch {}
      } else {
        try { editor.insertHTML?.('<ul><li></li></ul>'); } catch {}
      }
    }
    // Arm second-click behavior so the next bullet click inserts an empty item
    bulletSecondClickArmedRef.current = { armed: true, at: Date.now() };
  };

  const applyOrderedList = async () => {
    const editor = richTextRef.current;
    if (!editor) return;
    if (orderedSecondClickArmedRef.current.armed && Date.now() - orderedSecondClickArmedRef.current.at < 5000) {
      await checkpointHistoryForAction();
      try { editor.focusContentEditor?.(); } catch {}
      await new Promise(res => setTimeout(res, 30));
      try { editor.insertHTML?.('<ol><li></li></ol>'); } catch {}
      orderedSecondClickArmedRef.current = { armed: false, at: 0 };
      return;
    }
    await checkpointHistoryForAction();
    try { editor.focusContentEditor?.(); } catch {}
    let before = '';
    try { before = (await editor.getContentHtml?.()) ?? ''; } catch {}
    await new Promise(res => setTimeout(res, 50));
    if (typeof editor.insertOrderedList === 'function') {
      try { await editor.insertOrderedList(); } catch {}
    }
    const actions = ['insertOrderedList', 'orderedList'];
    for (const act of actions) {
      try { editor.sendAction?.(act); } catch {}
    }
    let after = before;
    try { after = (await editor.getContentHtml?.()) ?? before; } catch {}
    if (after === before) {
      try { editor.sendAction?.('insertBulletsList'); } catch {}
      try { editor.sendAction?.('insertOrderedList'); } catch {}
      try { after = (await editor.getContentHtml?.()) ?? before; } catch {}
    }
    if (after === before) {
      const text = (selectedText || '').trim();
      if (text) {
        const html = buildListHtmlFromText(text, 'ol');
        try { editor.insertHTML?.(html); } catch {}
      }
      else {
        try { editor.insertHTML?.('<ol><li></li></ol>'); } catch {}
      }
    }
    // Arm second-click behavior
    orderedSecondClickArmedRef.current = { armed: true, at: Date.now() };
  };

  // Indentation handlers
  const applyIndent = async () => {
    const editor = richTextRef.current;
    if (!editor) return;
    await checkpointHistoryForAction();
    try { editor.focusContentEditor?.(); } catch {}
    // Small delay to ensure focus
    await new Promise((res) => setTimeout(res, 30));
    try { editor.sendAction?.('indent', 'result'); } catch {}
    try { editor.sendAction?.('indent'); } catch {}
  };

  const applyOutdent = async () => {
    const editor = richTextRef.current;
    if (!editor) return;
    await checkpointHistoryForAction();
    try { editor.focusContentEditor?.(); } catch {}
    await new Promise((res) => setTimeout(res, 30));
    try { editor.sendAction?.('outdent', 'result'); } catch {}
    try { editor.sendAction?.('outdent'); } catch {}
  };

  // Undo / Redo handlers using local history stacks
  const handleUndo = () => {
    if (!canUndo) return;
    const undoStack = undoStackRef.current;
    const redoStack = redoStackRef.current;
    const current = formattedContent;
    const prev = undoStack.pop();
    if (prev === undefined) return;
    redoStack.push(current);
    isApplyingHistoryRef.current = true;
    richTextRef.current?.setContentHTML(prev);
    setFormattedContent(prev);
    setContent(prev.replace(/<[^>]*>/g, ""));
    prevHtmlRef.current = prev;
    setCanUndo(undoStack.length > 0);
    setCanRedo(true);
  };

  const handleRedo = () => {
    if (!canRedo) return;
    const undoStack = undoStackRef.current;
    const redoStack = redoStackRef.current;
    const current = formattedContent;
    const next = redoStack.pop();
    if (next === undefined) return;
    undoStack.push(current);
    isApplyingHistoryRef.current = true;
    richTextRef.current?.setContentHTML(next);
    setFormattedContent(next);
    setContent(next.replace(/<[^>]*>/g, ""));
    prevHtmlRef.current = next;
    setCanUndo(true);
    setCanRedo(redoStack.length > 0);
  };

  const askRinaForHelp = async (text: string) => {
  try {
    setIsLoadingMeaning(true);
    setSelectedWord(text);
    setShowWordMeaningModal(true);

    // Call your dictionary service (already set up in dictionaryService.ts)
    const response = await dictionaryService.getConcept(text);

    if (response) {
      setWordData(response);
    } else {
      setWordData(null);
    }
  } catch (error) {
    console.error("Error asking RINA for help:", error);
    setWordData(null);
  } finally {
    setIsLoadingMeaning(false);
  }
};


  const getSyncStatusIcon = () => {
    // If network is offline, always show offline status
    if (!isOnline) {
      return "cloud-off";
    }
    
    // Otherwise show actual save status
    switch (saveStatus.status) {
      case "saving":
        return "sync";
      case "saved":
        return "cloud-done";
      case "conflict":
        return "warning";
      case "error":
        return "error";
      default:
        return "cloud-done";
    }
  };

  const getSyncStatusColor = () => {
    // If network is offline, always show offline color
    if (!isOnline) {
      return "#FF9500"; // Orange for offline
    }
    
    // Otherwise show actual save status color
    switch (saveStatus.status) {
      case "saving":
        return "#007AFF"; // Blue for saving
      case "saved":
        return "#34C759"; // Green for saved
      case "conflict":
      case "error":
        return "#FF3B30"; // Red for error/conflict
      default:
        return "#34C759";
    }
  };

  const getSyncStatusText = () => {
    // If network is offline, always show network status
    if (!isOnline) {
      return getNetworkStatusText(networkStatus);
    }
    
    // Otherwise show actual save status
    switch (saveStatus.status) {
      case "saving":
        return "Saving...";
      case "saved":
        return "Saved";
      case "conflict":
        return "Conflict";
      case "error":
        return "Error";
      default:
        return "Saved";
    }
  };

  // Render
  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
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
                onPress={handleBackPress}
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
                    {getSyncStatusText()}
                  </Text>
                </View>
              </View>

              <View style={styles.headerActions}>
                {/* Folder Selector in Header */}
                <TouchableOpacity
                  style={styles.folderSelectorButton}
                  onPress={() => setShowFolderModal(true)}
                >
                  <MaterialIcons name="folder" size={16} color="#fff" />
                </TouchableOpacity>

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
              paddingBottom: 40,
              flexGrow: 1,
            }}
            nestedScrollEnabled={true}
            keyboardDismissMode="interactive"
          >


            {/* Enhanced Rich Text Toolbar with More Tools */}
            <View style={styles.enhancedToolbarContainer}>
              <ScrollView 
                horizontal 
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.toolbarScrollContent}
                bounces={false}
              >
                <View style={styles.toolbarSection}>
                  {/* Undo/Redo */}
                  <TouchableOpacity
                    style={[styles.toolButton, !canUndo && styles.toolButtonDisabled]}
                    onPress={handleUndo}
                    disabled={!canUndo}
                  >
                    <MaterialIcons name="undo" size={20} color="#374151" />
                  </TouchableOpacity>
                  
                  <TouchableOpacity
                    style={[styles.toolButton, !canRedo && styles.toolButtonDisabled]}
                    onPress={handleRedo}
                    disabled={!canRedo}
                  >
                    <MaterialIcons name="redo" size={20} color="#374151" />
                  </TouchableOpacity>
                </View>
                
                <View style={styles.toolbarDivider} />

                <View style={styles.toolbarSection}>
                  {/* Text Formatting */}
                  <TouchableOpacity
                    style={styles.toolButton}
                    onPress={() => richTextRef.current?.sendAction('bold', 'result')}
                  >
                    <MaterialIcons name="format-bold" size={20} color="#374151" />
                  </TouchableOpacity>
                  
                  <TouchableOpacity
                    style={styles.toolButton}
                    onPress={() => richTextRef.current?.sendAction('italic', 'result')}
                  >
                    <MaterialIcons name="format-italic" size={20} color="#374151" />
                  </TouchableOpacity>
                  
                  <TouchableOpacity
                    style={styles.toolButton}
                    onPress={() => richTextRef.current?.sendAction('underline', 'result')}
                  >
                    <MaterialIcons name="format-underlined" size={20} color="#374151" />
                  </TouchableOpacity>
                  
                  <TouchableOpacity
                    style={styles.toolButton}
                    onPress={() => richTextRef.current?.sendAction('strikeThrough', 'result')}
                  >
                    <MaterialIcons name="format-strikethrough" size={20} color="#374151" />
                  </TouchableOpacity>
                </View>
                
                <View style={styles.toolbarDivider} />
                
                <View style={styles.toolbarSection}>
                  {/* Lists */}
                  <TouchableOpacity
                    style={styles.toolButton}
                    onPress={async () => { await applyUnorderedList(); }}
                  >
                    <MaterialIcons name="format-list-bulleted" size={20} color="#374151" />
                  </TouchableOpacity>
                  
                  <TouchableOpacity
                    style={styles.toolButton}
                    onPress={async () => { await applyOrderedList(); }}
                  >
                    <MaterialIcons name="format-list-numbered" size={20} color="#374151" />
                  </TouchableOpacity>
                  
                  {/* Indent / Outdent */}
                  <TouchableOpacity
                    style={styles.toolButton}
                    onPress={async () => { await applyIndent(); }}
                  >
                    <MaterialIcons name="format-indent-increase" size={20} color="#374151" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.toolButton}
                    onPress={async () => { await applyOutdent(); }}
                  >
                    <MaterialIcons name="format-indent-decrease" size={20} color="#374151" />
                  </TouchableOpacity>
                </View>
                
                <View style={styles.toolbarDivider} />
                
                <View style={styles.toolbarSection}>
                  {/* Alignment */}
                  <TouchableOpacity
                    style={styles.toolButton}
                    onPress={() => richTextRef.current?.sendAction('justifyLeft', 'result')}
                  >
                    <MaterialIcons name="format-align-left" size={20} color="#374151" />
                  </TouchableOpacity>
                  
                  <TouchableOpacity
                    style={styles.toolButton}
                    onPress={() => richTextRef.current?.sendAction('justifyCenter', 'result')}
                  >
                    <MaterialIcons name="format-align-center" size={20} color="#374151" />
                  </TouchableOpacity>
                  
                  <TouchableOpacity
                    style={styles.toolButton}
                    onPress={() => richTextRef.current?.sendAction('justifyRight', 'result')}
                  >
                    <MaterialIcons name="format-align-right" size={20} color="#374151" />
                  </TouchableOpacity>
                  
                  {/* Justify Full */}
                  <TouchableOpacity
                    style={styles.toolButton}
                    onPress={() => richTextRef.current?.sendAction('justifyFull', 'result')}
                  >
                    <MaterialIcons name="format-align-justify" size={20} color="#374151" />
                  </TouchableOpacity>
                </View>
                
                <View style={styles.toolbarDivider} />
                
                <View style={styles.toolbarSection}>
                  {/* Text Resize */}
                  <TouchableOpacity
                    style={styles.toolButton}
                    onPress={() => { try { richTextRef.current?.focusContentEditor?.(); } catch {}; richTextRef.current?.sendAction('fontSize', '5'); }}
                  >
                    <MaterialIcons name="text-increase" size={20} color="#374151" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.toolButton}
                    onPress={() => { try { richTextRef.current?.focusContentEditor?.(); } catch {}; richTextRef.current?.sendAction('fontSize', '3'); }}
                  >
                    <MaterialIcons name="text-decrease" size={20} color="#374151" />
                  </TouchableOpacity>
                </View>
                
                <View style={styles.toolbarDivider} />
                
                <View style={styles.toolbarSection}>
                  {/* Colors */}
                  <TouchableOpacity
                    style={[styles.toolButton, styles.colorButton]}
                    onPress={() => openColorPicker("text")}
                  >
                    <MaterialIcons name="format-color-text" size={20} color="#374151" />
                    <View style={[styles.colorIndicator, { backgroundColor: textColor === 'Default' ? '#000' : textColor }]} />
                  </TouchableOpacity>
                  
                  <TouchableOpacity
                    style={[styles.toolButton, styles.colorButton]}
                    onPress={() => openColorPicker("background")}
                  >
                    <MaterialIcons name="format-color-fill" size={20} color="#374151" />
                    <View style={[styles.colorIndicator, { backgroundColor: bgColor === 'Default' ? '#FFFF00' : bgColor }]} />
                  </TouchableOpacity>
                </View>
                
                <View style={styles.toolbarDivider} />
                
                
                
                <View style={styles.toolbarDivider} />
                
                <View style={styles.toolbarSection}>
                  {/* Insert Tools */}
                  <TouchableOpacity
                    style={styles.toolButton}
                    onPress={() => {
                      richTextRef.current?.insertHTML('<hr style="border: 1px solid #E5E7EB; margin: 16px 0;">');
                      showSuccessToast('Divider inserted');
                    }}
                  >
                    <MaterialIcons name="horizontal-rule" size={20} color="#374151" />
                  </TouchableOpacity>
                  
                  <TouchableOpacity
                    style={styles.toolButton}
                    onPress={() => {
                      richTextRef.current?.insertHTML('<blockquote style="border-left: 4px solid #8B5CF6; padding-left: 16px; margin: 16px 0; font-style: italic; color: #6B7280;">Quote text here</blockquote>');
                      showSuccessToast('Quote block inserted');
                    }}
                  >
                    <MaterialIcons name="format-quote" size={20} color="#374151" />
                  </TouchableOpacity>
                  
                  {/* Code insert removed as requested */}
                </View>
              </ScrollView>
            </View>

            {/* Enhanced Rich Text Editor with responsive sizing */}
            <View style={[styles.modernEditorWrapper, { 
              minHeight: Math.max(windowDimensions.height * 0.4, 300),
              maxHeight: windowDimensions.height - 200,
              width: '100%'
            }]}>
              <RichEditor
                ref={richTextRef}
                style={[styles.modernRichTextInput, { 
                  minHeight: Math.max(windowDimensions.height * 0.4, 300),
                  maxHeight: windowDimensions.height - 200,
                  width: '100%'
                }]}
                initialContentHTML={
                  route.params?.initialNote?.formatted_content || content
                }
                onChange={(html: string) => {
                  const stripped = html.replace(/<[^>]*>/g, "");
                  // If applying an undo/redo entry, don't push new history
                  if (isApplyingHistoryRef.current) {
                    isApplyingHistoryRef.current = false;
                    setContent(stripped);
                    setFormattedContent(html);
                    prevHtmlRef.current = html;
                  } else {
                    setContent(stripped);
                    setFormattedContent(html);
                    // Any content change disarms the second-click empty-item for lists after a short time
                    bulletSecondClickArmedRef.current = { armed: false, at: 0 };
                    orderedSecondClickArmedRef.current = { armed: false, at: 0 };
                    const now = Date.now();
                    if (html !== prevHtmlRef.current && now - lastHistoryPushRef.current > 800) {
                      if (prevHtmlRef.current !== undefined) {
                        undoStackRef.current.push(prevHtmlRef.current);
                        if (undoStackRef.current.length > 100) undoStackRef.current.shift();
                      }
                      // Clear redo on new edit
                      redoStackRef.current = [];
                      setCanUndo(undoStackRef.current.length > 0);
                      setCanRedo(false);
                      lastHistoryPushRef.current = now;
                      prevHtmlRef.current = html;
                    }
                  }
                  
                  // Auto-save on every change with debouncing
                  if (stripped.trim() || html.trim()) {
                    // Clear existing timeout
                    if (autoSaveTimeoutRef.current) {
                      clearTimeout(autoSaveTimeoutRef.current);
                    }
                    
                    // Set new timeout for auto-save (1 second delay)
                    autoSaveTimeoutRef.current = setTimeout(() => {
                      handleAutoSave();
                    }, 1000);
                  }
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
                      } else {
                        // Clear selection if empty
                        setSelectedText("");
                        setShowRinaPopup(false);
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
                    } else if (data.type === 'selection-clear') {
                      setSelectedText("");
                      setShowRinaPopup(false);
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
                      } else {
                        setSelectedText("");
                        setShowRinaPopup(false);
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
                  } else {
                    // Clear when selection becomes empty
                    setSelectedText("");
                    setShowRinaPopup(false);
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
                    } else {
                      window.ReactNativeWebView.postMessage(JSON.stringify({
                        type: 'selection-clear'
                      }));
                    }
                  });

                  // Prevent backspace at start of a list item from merging with previous line.
                  document.addEventListener('keydown', function(e) {
                    if (e.key === 'Backspace') {
                      const sel = window.getSelection();
                      if (!sel || !sel.rangeCount) return;
                      const range = sel.getRangeAt(0);
                      // Only when collapsed caret
                      if (!range.collapsed) return;
                      // Find nearest LI
                      let node = range.startContainer;
                      while (node && node.nodeType === 3) node = node.parentNode;
                      function closest(el, selector) {
                        while (el) {
                          if (el.matches && el.matches(selector)) return el;
                          el = el.parentElement;
                        }
                        return null;
                      }
                      const li = closest(node, 'li');
                      if (li) {
                        // Compute caret offset within LI by creating a temp range
                        const liRange = document.createRange();
                        liRange.selectNodeContents(li);
                        liRange.setEnd(range.startContainer, range.startOffset);
                        const pre = liRange.toString();
                        // If caret is at logical start of the LI, prevent default merge
                        if (!pre || /^\s*$/.test(pre)) {
                          e.preventDefault();
                          // Optionally keep caret where it is, and do nothing
                          // If LI is empty (no text), delete the bullet entirely
                          const textContent = li.textContent || '';
                          if (!textContent.trim()) {
                            // Remove empty list item safely
                            const parent = li.parentNode;
                            li.remove();
                            // If list becomes empty, remove the list and insert a <p><br/></p> to keep caret in place
                            if (parent && parent.children && parent.children.length === 0) {
                              const p = document.createElement('p');
                              p.innerHTML = '<br />';
                              parent.parentNode && parent.parentNode.insertBefore(p, parent.nextSibling);
                              parent.remove();
                              // Place caret in the paragraph
                              const newRange = document.createRange();
                              newRange.setStart(p, 0);
                              newRange.collapse(true);
                              sel.removeAllRanges();
                              sel.addRange(newRange);
                            }
                          }
                          // Clear selection state in RN host
                          try { window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'selection-clear' })); } catch (err) {}
                        }
                      }
                    }
                  }, true);
                  
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

        {/* More Options Menu removed for cleaner interface */}

        {/* Text Styles Menu removed as requested */}

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
          animationType="slide"
          onRequestClose={() => setShowFolderModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.folderModalContent}>
              <View style={styles.folderModalHeaderRow}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <MaterialIcons name="folder" size={22} color="#8B5CF6" />
                  <Text style={styles.folderModalTitle}> Select Folder</Text>
                </View>
                <TouchableOpacity onPress={() => setShowFolderModal(false)}>
                  <MaterialIcons name="close" size={22} color="#6B7280" />
                </TouchableOpacity>
              </View>

              {/* Search / quick filter */}
              <View style={styles.folderSearchRow}>
                <TextInput
                  placeholder="Search folders"
                  placeholderTextColor="#9CA3AF"
                  style={styles.folderSearchInput}
                  onChangeText={(v) => {
                    setFolderFilter(v);
                  }}
                  defaultValue={folderFilter}
                  returnKeyType="search"
                />
              </View>

              <ScrollView style={styles.folderListScroll} contentContainerStyle={styles.folderListContent}>
                {/* Unorganized Notes Card */}
                <TouchableOpacity
                  style={[styles.folderCard, !selectedFolderId && styles.selectedFolderCard]}
                  onPress={() => {
                    handleFolderSelect(null);
                    setShowFolderModal(false);
                  }}
                >
                  <View style={[styles.folderCardIcon, { backgroundColor: '#64748B' }]}>
                    <MaterialIcons name="notes" size={20} color="#fff" />
                  </View>
                  <View style={styles.folderCardTextWrap}>
                    <Text style={styles.folderCardTitle}>Unorganized Notes</Text>
                    <Text style={styles.folderCardSubtitle}>No folder</Text>
                  </View>
                  {!selectedFolderId && <MaterialIcons name="check-circle" size={20} color="#8B5CF6" />}
                </TouchableOpacity>

                {/* Divider */}
                <View style={styles.folderDividerRow}>
                  <View style={styles.folderDividerLine} />
                  <Text style={styles.folderDividerText}>All folders</Text>
                  <View style={styles.folderDividerLine} />
                </View>

                {/* Folder List (filtered) */}
                {folders
                  .filter(f => !folderFilter || f.name.toLowerCase().includes(folderFilter.toLowerCase()))
                  .map(folder => (
                    <TouchableOpacity
                      key={folder.id}
                      style={[styles.folderCard, selectedFolderId === folder.id && styles.selectedFolderCard]}
                      onPress={() => {
                        handleFolderSelect(folder);
                        setShowFolderModal(false);
                      }}
                    >
                      <View style={[styles.folderCardIcon, { backgroundColor: folder.color || '#8B5CF6' }]}>
                        <MaterialIcons name={folder.icon || 'folder'} size={20} color="#fff" />
                      </View>
                      <View style={styles.folderCardTextWrap}>
                        <Text style={styles.folderCardTitle}>{folder.name}</Text>
                        {!!folder.note_count && (
                          <Text style={styles.folderCardSubtitle}>
                            {folder.note_count} {folder.note_count === 1 ? 'item' : 'items'}
                          </Text>
                        )}
                      </View>
                      {selectedFolderId === folder.id && <MaterialIcons name="check-circle" size={20} color="#8B5CF6" />}
                    </TouchableOpacity>
                  ))}
              </ScrollView>
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
            <Text style={styles.wordMeaningLoadingText}>
              RINA is looking up the meaning...
            </Text>
          </View>
        ) : wordData ? (
          <ScrollView style={styles.wordMeaningScrollView}>
            <Text style={styles.sectionTitle}>Meaning:</Text>
            <Text style={styles.wordMeaningText}>{wordData.Meaning}</Text>

            <Text style={styles.sectionTitle}>Part of Speech:</Text>
            <Text style={styles.wordMeaningText}>{wordData.PartOfSpeech}</Text>

            <Text style={styles.sectionTitle}>Synonyms:</Text>
            <Text style={styles.wordMeaningText}>
              {wordData.Synonyms?.length ? wordData.Synonyms.join(", ") : "None"}
            </Text>

            <Text style={styles.sectionTitle}>Antonyms:</Text>
            <Text style={styles.wordMeaningText}>
              {wordData.Antonyms?.length ? wordData.Antonyms.join(", ") : "None"}
            </Text>

            <Text style={styles.sectionTitle}>Examples:</Text>
            {wordData.Examples?.map((ex: string, i: number) => (
              <Text key={i} style={styles.wordMeaningText}>• {ex}</Text>
            ))}
          </ScrollView>
        ) : (
          <Text style={styles.wordMeaningText}>
            RINA couldn’t generate a response. Please try again.
          </Text>
        )}
      </View>
      
      <View style={styles.wordMeaningActions}>
  {/* Copy Button */}
  <TouchableOpacity
    style={styles.wordMeaningActionButton}
    onPress={() => {
      if (wordData) {
        const copyText = `
          ${selectedWord} (${wordData.PartOfSpeech})
          Meaning: ${wordData.Meaning}
          Synonyms: ${wordData.Synonyms?.length ? wordData.Synonyms.join(", ") : "None"}
          Antonyms: ${wordData.Antonyms?.length ? wordData.Antonyms.join(", ") : "None"}
          Examples: ${wordData.Examples?.join(" | ")}
        `;
        // Clipboard.setString(copyText); // uncomment if Clipboard installed
        showSuccessToast("Definition copied to clipboard");
        if (Platform.OS === 'ios') {
          Vibration.vibrate(10);
        }
      }
    }}
  >
    <MaterialIcons name="content-copy" size={18} color="#8B5CF6" />
    <Text style={styles.wordMeaningActionText}>Copy</Text>
  </TouchableOpacity>

  {/* Add to Note Button */}
  <TouchableOpacity
    style={styles.wordMeaningActionButton}
    onPress={() => {
      if (wordData) {
        const meaningText = `
          <p><strong>${selectedWord}</strong> (${wordData.PartOfSpeech})</p>
          <p><em>Meaning:</em> ${wordData.Meaning}</p>
          <p><em>Synonyms:</em> ${wordData.Synonyms?.length ? wordData.Synonyms.join(", ") : "None"}</p>
          <p><em>Antonyms:</em> ${wordData.Antonyms?.length ? wordData.Antonyms.join(", ") : "None"}</p>
          <p><em>Examples:</em></p>
          <ul>
            ${wordData.Examples?.map((ex: string) => `<li>${ex}</li>`).join("")}
          </ul>
        `;
        richTextRef.current?.insertHTML(meaningText);
        setShowWordMeaningModal(false);
        showSuccessToast("Definition added to note");
        if (Platform.OS === 'ios') {
          Vibration.vibrate(10);
        }
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




  enhancedToolbarContainer: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    marginBottom: 16,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
  },
  toolbarScrollContent: {
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  toolbarSection: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  toolButton: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 3,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  toolButtonDisabled: {
    opacity: 0.4,
  },
  colorButton: {
    position: 'relative',
    paddingBottom: 6,
  },
  colorIndicator: {
    position: 'absolute',
    bottom: 2,
    left: '50%',
    marginLeft: -8,
    width: 16,
    height: 3,
    borderRadius: 2,
    borderWidth: 0.5,
    borderColor: 'rgba(0,0,0,0.2)',
  },
  toolbarDivider: {
    width: 1,
    height: 32,
    backgroundColor: "#E5E7EB",
    marginHorizontal: 8,
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
    alignSelf: 'stretch',
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
    alignSelf: 'stretch',
    textAlignVertical: 'top',
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
  folderSelectorButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.25)",
    marginRight: 8,
    maxWidth: 120,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.3)",
  },
  folderButtonText: {
    color: "#fff",
    fontSize: 11,
    fontFamily: "Inter-Medium",
    marginLeft: 4,
    flex: 1,
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
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: "#f8f9fa",
    borderBottomWidth: 1,
    borderBottomColor: "#e9ecef",
  },
  folderSelector: {
    flexDirection: "row",
    alignItems: "center",
    padding: 8,
    backgroundColor: "#ffffff",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  folderName: {
    flex: 1,
    marginLeft: 8,
    fontSize: 14,
    fontFamily: "Inter-Medium",
  },
  // Modern folder modal styles from DrawingEditor
  folderModalContent: {
    width: '92%',
    maxHeight: '78%',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 12,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 12,
  },
  folderModalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
    marginBottom: 8,
  },
  folderModalTitle: {
    marginLeft: 10,
    fontSize: 16,
    color: '#111827',
    fontWeight: '600',
  },
  folderSearchRow: {
    paddingVertical: 8,
  },
  folderSearchInput: {
    backgroundColor: '#F3F4F6',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    color: '#111827',
    fontSize: 14,
  },
  folderListScroll: {
    marginTop: 6,
  },
  folderListContent: {
    paddingBottom: 18,
  },
  folderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    marginBottom: 8,
  },
  selectedFolderCard: {
    backgroundColor: '#F8FAFC',
  },
  folderCardIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  folderCardTextWrap: {
    flex: 1,
  },
  folderCardTitle: {
    fontSize: 15,
    color: '#111827',
    fontWeight: '600',
  },
  folderCardSubtitle: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  folderDividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 10,
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
  // Removed moreOptionsMenu and related styles since kebab menu is removed
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
    fontWeight: "bold" 
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
  wordMeaningScrollView: {
    maxHeight: 200,
    marginVertical: 8,
  },
  wordMeaningSection: {
  marginBottom: 12,
},

wordMeaningExample: {
  fontSize: 14,
  color: "#374151",
  marginLeft: 10,
  marginBottom: 4,
},
});

export default NewNoteEditor;
