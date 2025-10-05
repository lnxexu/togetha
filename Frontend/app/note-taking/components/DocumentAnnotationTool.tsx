import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  TextInput,  
  ScrollView,
  Dimensions,
  Alert,
  ActivityIndicator,
  StatusBar,
  Platform,
  Linking,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL, API_ENDPOINTS } from '@/constants/ApiConfig';
import * as WebBrowser from 'expo-web-browser';
import * as Sharing from 'expo-sharing';

const { width, height } = Dimensions.get('window');

export interface Annotation {
  id: string;
  type: 'highlight' | 'note' | 'bookmark' | 'underline' | 'strikethrough' | 'drawing';
  text: string;
  note?: string;
  page?: number;
  position: {
    x: number;
    y: number;
    width?: number;
    height?: number;
  };
  color: string;
  strokeData?: string; // For drawing annotations
  created_at: string;
}

interface DocumentAnnotationProps {
  noteId: string;
  documentUri: string;
  documentName: string;
  documentType: 'pdf' | 'doc' | 'docx' | 'txt' | 'image';
  note?: any; // Note data including document_metadata
  onClose?: () => void;
  onAnnotationsChange?: (annotations: Annotation[]) => void;
}

const ANNOTATION_COLORS = [
  '#FBBF24', // Yellow
  '#F87171', // Red
  '#34D399', // Green
  '#60A5FA', // Blue
  '#A78BFA', // Purple
  '#FB7185', // Pink
  '#38BDF8', // Light Blue
  '#FCD34D', // Amber
];

const DocumentAnnotationTool: React.FC<DocumentAnnotationProps> = ({
  noteId,
  documentUri,
  documentName,
  documentType,
  note,
  onClose,
  onAnnotationsChange,
}) => {
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [selectedAnnotationType, setSelectedAnnotationType] = useState<'highlight' | 'note' | 'bookmark' | 'underline' | 'strikethrough' | 'drawing'>('highlight');
  const [selectedColor, setSelectedColor] = useState(ANNOTATION_COLORS[0]);
  const [showAddNoteModal, setShowAddNoteModal] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [selectedText, setSelectedText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingAnnotations, setIsLoadingAnnotations] = useState(true);
  const [lastSaveTime, setLastSaveTime] = useState<number>(Date.now());
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-save functionality
  const autoSave = useCallback(async () => {
    if (annotations.length === 0) return;
    
    try {
      setSaveStatus('saving');
      
      const token = await AsyncStorage.getItem('authToken');
      if (!token) {
        console.log('Auto-save skipped: No auth token');
        return;
      }

      const response = await fetch(`${API_URL}${API_ENDPOINTS.DOCUMENT_ANNOTATIONS(noteId)}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Token ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          annotations: annotations,
        }),
      });

      if (response.ok) {
        setLastSaveTime(Date.now());
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 2000);
        console.log('Document annotations auto-saved successfully');
      } else {
        const errorData = await response.json();
        setSaveStatus('error');
        console.error('Auto-save failed:', errorData.error || 'Unknown error');
      }
    } catch (error) {
      setSaveStatus('error');
      console.error('Auto-save failed:', error);
    }
  }, [annotations, noteId]);

  // Auto-save every 10 seconds when there are changes
  useEffect(() => {
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }

    autoSaveTimeoutRef.current = setTimeout(() => {
      if (Date.now() - lastSaveTime > 5000) { // 5 seconds since last change
        autoSave();
      }
    }, 10000);

    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, [annotations, autoSave, lastSaveTime]);

  // Open document in native viewer
  const openDocumentInNativeViewer = async () => {
    try {
      setIsLoading(true);
      
      if (Platform.OS === 'android') {
        // For Android, try to open with system viewer
        const supported = await Linking.canOpenURL(documentUri);
        if (supported) {
          await Linking.openURL(documentUri);
        } else {
          // Fallback to web browser with Google Docs Viewer
          const googleDocsUrl = `https://docs.google.com/viewer?url=${encodeURIComponent(documentUri)}`;
          await WebBrowser.openBrowserAsync(googleDocsUrl);
        }
      } else if (Platform.OS === 'ios') {
        // For iOS, use system's document interaction controller
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(documentUri, {
            mimeType: documentType === 'pdf' ? 'application/pdf' : 'application/octet-stream',
            UTI: documentType === 'pdf' ? 'com.adobe.pdf' : 'public.data',
            dialogTitle: `View ${documentName}`,
          });
        } else {
          // Fallback to Safari with document
          await WebBrowser.openBrowserAsync(documentUri);
        }
      } else {
        // Web platform
        await WebBrowser.openBrowserAsync(documentUri);
      }
    } catch (error) {
      console.error('Error opening document:', error);
      Alert.alert(
        'Error',
        'Unable to open document. Please make sure you have a compatible app installed.',
        [{ text: 'OK' }]
      );
    } finally {
      setIsLoading(false);
    }
  };

  // Load annotations on component mount
  useEffect(() => {
    const loadAnnotations = async () => {
      try {
        setIsLoadingAnnotations(true);
        const token = await AsyncStorage.getItem('authToken');
        if (!token) {
          Alert.alert('Error', 'Authentication token not found. Please log in again.');
          return;
        }

        const response = await fetch(`${API_URL}${API_ENDPOINTS.DOCUMENT_ANNOTATIONS(noteId)}`, {
          method: 'GET',
          headers: {
            'Authorization': `Token ${token}`,
          },
        });

        if (response.ok) {
          const data = await response.json();
          setAnnotations(data.annotations || []);
        } else {
          const errorData = await response.json();
          console.error('Failed to load annotations:', errorData.error || 'Unknown error');
        }
      } catch (error) {
        console.error('Error loading annotations:', error);
        Alert.alert('Error', 'Failed to load annotations. Please refresh the page.');
      } finally {
        setIsLoadingAnnotations(false);
      }
    };

    loadAnnotations();
  }, [noteId]);

  // Helper function to get page count from document metadata
  const getPageCount = (): number => {
    if (note?.document_metadata?.page_count) {
      return note.document_metadata.page_count;
    }
    // Default to 1 for non-PDF files or when metadata is unavailable
    return 1;
  };

  // Helper function to get document info text
  const getDocumentInfoText = (): string => {
    const pageCount = getPageCount();
    if (documentType === 'pdf' && pageCount > 1) {
      return `${documentType.toUpperCase()} Document (${pageCount} pages)`;
    }
    return `${documentType.toUpperCase()} Document`;
  };

  // Save annotation to backend
  const saveAnnotation = async (annotation: Omit<Annotation, 'id' | 'created_at'>) => {
    try {
      setIsSaving(true);
      setSaveStatus('saving');
      
      const token = await AsyncStorage.getItem('authToken');
      if (!token) {
        Alert.alert('Error', 'Authentication token not found. Please log in again.');
        setSaveStatus('error');
        return;
      }

      const response = await fetch(`${API_URL}${API_ENDPOINTS.DOCUMENT_ANNOTATIONS(noteId)}`, {
        method: 'POST',
        headers: {
          'Authorization': `Token ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          note: noteId,
          ...annotation,
        }),
      });

      if (response.ok) {
        const responseData = await response.json();
        // Backend returns { message: '...', annotation: ... }
        const savedAnnotation = responseData.annotation;
        const newAnnotations = [...annotations, savedAnnotation];
        setAnnotations(newAnnotations);
        setLastSaveTime(Date.now());
        setSaveStatus('saved');
        
        // Reset status after 2 seconds
        setTimeout(() => setSaveStatus('idle'), 2000);
        
        if (onAnnotationsChange) {
          onAnnotationsChange(newAnnotations);
        }
        
        // Show success feedback (less intrusive than alert)
        console.log('Annotation saved successfully!');
      } else {
        const errorData = await response.json();
        setSaveStatus('error');
        throw new Error(errorData.error || 'Failed to save annotation');
      }
    } catch (error) {
      console.error('Error saving annotation:', error);
      setSaveStatus('error');
      Alert.alert('Error', 'Failed to save annotation. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  // Add note annotation
  const addNoteAnnotation = () => {
    if (!noteText) return;
    
    const annotation: Omit<Annotation, 'id' | 'created_at'> = {
      type: 'note',
      text: noteText,
      position: { x: 100, y: 100 }, // Default position
      color: selectedColor,
      page: 1,
    };
    
    saveAnnotation(annotation);
    setShowAddNoteModal(false);
    setNoteText('');
  };

  // Delete annotation
  const deleteAnnotation = async (annotationId: string) => {
    try {
      setIsSaving(true);
      setSaveStatus('saving');
      
      const token = await AsyncStorage.getItem('authToken');
      if (!token) {
        Alert.alert('Error', 'Authentication token not found. Please log in again.');
        setSaveStatus('error');
        return;
      }

      const response = await fetch(`${API_URL}${API_ENDPOINTS.DELETE_ANNOTATION(noteId, annotationId)}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Token ${token}`,
        },
      });

      if (response.ok) {
        const newAnnotations = annotations.filter(a => a.id !== annotationId);
        setAnnotations(newAnnotations);
        setLastSaveTime(Date.now());
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 2000);
        
        if (onAnnotationsChange) {
          onAnnotationsChange(newAnnotations);
        }
      } else {
        const errorData = await response.json();
        setSaveStatus('error');
        Alert.alert('Error', errorData.error || 'Failed to delete annotation');
      }
    } catch (error) {
      console.error('Error deleting annotation:', error);
      setSaveStatus('error');
      Alert.alert('Error', 'Failed to delete annotation. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  // Confirm delete annotation
  const confirmDeleteAnnotation = (annotation: Annotation) => {
    Alert.alert(
      'Delete Annotation',
      `Are you sure you want to delete this ${annotation.type}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteAnnotation(annotation.id),
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
          <MaterialIcons name="arrow-back" size={24} color="#1F2937" />
        </TouchableOpacity>
        
        <Text style={styles.headerTitle} numberOfLines={1}>
          {documentName}
        </Text>
        
        <View style={styles.headerActions}>
          {/* Save Status Indicator */}
          <View style={styles.saveStatusContainer}>
            {saveStatus === 'saving' && (
              <View style={styles.saveStatusItem}>
                <ActivityIndicator size="small" color="#6366F1" />
                <Text style={styles.saveStatusText}>Saving...</Text>
              </View>
            )}
            {saveStatus === 'saved' && (
              <View style={styles.saveStatusItem}>
                <MaterialIcons name="check-circle" size={16} color="#10B981" />
                <Text style={[styles.saveStatusText, { color: '#10B981' }]}>Saved</Text>
              </View>
            )}
            {saveStatus === 'error' && (
              <View style={styles.saveStatusItem}>
                <MaterialIcons name="error" size={16} color="#EF4444" />
                <Text style={[styles.saveStatusText, { color: '#EF4444' }]}>Error</Text>
              </View>
            )}
          </View>
          
          <TouchableOpacity
            style={styles.openDocumentButton}
            onPress={openDocumentInNativeViewer}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color="#6366F1" />
            ) : (
              <MaterialIcons name="open-in-new" size={20} color="#6366F1" />
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Document Info Card */}
      <View style={styles.documentInfo}>
        <View style={styles.documentIcon}>
          <MaterialIcons 
            name={
              documentType === 'pdf' ? 'picture-as-pdf' :
              documentType === 'doc' || documentType === 'docx' ? 'description' :
              documentType === 'image' ? 'image' :
              'insert-drive-file'
            }
            size={40}
            color="#6366F1"
          />
        </View>
        <View style={styles.documentDetails}>
          <Text style={styles.documentName}>{documentName}</Text>
          <Text style={styles.documentType}>{getDocumentInfoText()}</Text>
        </View>
        <TouchableOpacity
          style={styles.viewDocumentButton}
          onPress={openDocumentInNativeViewer}
          disabled={isLoading}
        >
          <Text style={styles.viewDocumentText}>
            {Platform.OS === 'android' ? 'View in Google' : 'View in Safari'}
          </Text>
          <MaterialIcons name="launch" size={16} color="#6366F1" />
        </TouchableOpacity>
      </View>

      {/* Annotation Toolbar */}
      <View style={styles.toolbar}>
        <Text style={styles.toolbarTitle}>Annotation Tools</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {/* Tool Selection */}
          <View style={styles.toolGroup}>
            {(['note', 'highlight', 'bookmark'] as const).map((tool) => (
              <TouchableOpacity
                key={tool}
                style={[
                  styles.typeButton,
                  selectedAnnotationType === tool && styles.typeButtonActive,
                ]}
                onPress={() => setSelectedAnnotationType(tool)}
              >
                <MaterialIcons
                  name={
                    tool === 'highlight' ? 'highlight' :
                    tool === 'note' ? 'note-add' :
                    'bookmark'
                  }
                  size={18}
                  color={selectedAnnotationType === tool ? "#FFFFFF" : "#374151"}
                />
                <Text style={[
                  styles.toolLabel,
                  selectedAnnotationType === tool && styles.toolLabelActive
                ]}>
                  {tool.charAt(0).toUpperCase() + tool.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Color Selection */}
          <View style={styles.colorSelector}>
            <Text style={styles.colorTitle}>Color:</Text>
            {ANNOTATION_COLORS.map((color) => (
              <TouchableOpacity
                key={color}
                style={[
                  styles.colorButton,
                  { backgroundColor: color },
                  selectedColor === color && styles.colorButtonActive,
                ]}
                onPress={() => setSelectedColor(color)}
              />
            ))}
          </View>
        </ScrollView>
      </View>

      {/* Add New Annotation Button */}
      <TouchableOpacity
        style={[
          styles.addAnnotationButton,
          (isSaving || isLoadingAnnotations) && styles.addAnnotationButtonDisabled
        ]}
        onPress={() => setShowAddNoteModal(true)}
        disabled={isSaving || isLoadingAnnotations}
      >
        {isSaving ? (
          <ActivityIndicator size="small" color="#FFFFFF" />
        ) : (
          <MaterialIcons name="add" size={24} color="#FFFFFF" />
        )}
        <Text style={styles.addAnnotationText}>
          {isSaving ? 'Saving...' : `Add ${selectedAnnotationType.charAt(0).toUpperCase() + selectedAnnotationType.slice(1)}`}
        </Text>
      </TouchableOpacity>

      {/* Annotations List */}
      <View style={styles.annotationsList}>
        <Text style={styles.annotationsTitle}>
          Annotations ({annotations.length})
        </Text>
        <ScrollView showsVerticalScrollIndicator={false}>
          {isLoadingAnnotations ? (
            <View style={styles.loadingState}>
              <ActivityIndicator size="large" color="#6366F1" />
              <Text style={styles.loadingText}>Loading annotations...</Text>
            </View>
          ) : annotations.length === 0 ? (
            <View style={styles.emptyState}>
              <MaterialIcons name="note-add" size={48} color="#D1D5DB" />
              <Text style={styles.emptyStateText}>No annotations yet</Text>
              <Text style={styles.emptyStateSubtext}>
                Open the document and add your first annotation
              </Text>
            </View>
          ) : (
            annotations.map((annotation) => (
              <View key={annotation.id} style={styles.annotationItem}>
                <View style={styles.annotationHeader}>
                  <View style={styles.annotationTypeIndicator}>
                    <View
                      style={[
                        styles.colorIndicator,
                        { backgroundColor: annotation.color }
                      ]}
                    />
                    <MaterialIcons
                      name={
                        annotation.type === 'highlight' ? 'highlight' :
                        annotation.type === 'note' ? 'note' :
                        'bookmark'
                      }
                      size={16}
                      color="#6B7280"
                    />
                    <Text style={styles.annotationType}>
                      {annotation.type.charAt(0).toUpperCase() + annotation.type.slice(1)}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => confirmDeleteAnnotation(annotation)}
                    style={styles.deleteButton}
                    disabled={isSaving}
                  >
                    <MaterialIcons 
                      name="delete-outline" 
                      size={20} 
                      color={isSaving ? "#D1D5DB" : "#EF4444"} 
                    />
                  </TouchableOpacity>
                </View>
                <Text style={styles.annotationText}>
                  {annotation.text}
                </Text>
                {annotation.note && (
                  <Text style={styles.annotationNote}>
                    {annotation.note}
                  </Text>
                )}
                <Text style={styles.annotationDate}>
                  {new Date(annotation.created_at).toLocaleDateString()}
                </Text>
              </View>
            ))
          )}
        </ScrollView>
      </View>

      {/* Add Note Modal */}
      <Modal
        visible={showAddNoteModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowAddNoteModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                Add {selectedAnnotationType.charAt(0).toUpperCase() + selectedAnnotationType.slice(1)}
              </Text>
              <TouchableOpacity
                onPress={() => setShowAddNoteModal(false)}
                style={styles.modalCloseButton}
              >
                <MaterialIcons name="close" size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>
            
            <TextInput
              style={styles.noteInput}
              placeholder="Enter your annotation text..."
              value={noteText}
              onChangeText={setNoteText}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
            
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setShowAddNoteModal(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveButton, !noteText && styles.saveButtonDisabled]}
                onPress={addNoteAnnotation}
                disabled={!noteText}
              >
                <Text style={styles.saveButtonText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  closeButton: {
    padding: 8,
    marginRight: 8,
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  openDocumentButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
  },
  documentInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginVertical: 8,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  documentIcon: {
    marginRight: 12,
  },
  documentDetails: {
    flex: 1,
  },
  documentName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 2,
  },
  documentType: {
    fontSize: 13,
    color: '#6B7280',
  },
  viewDocumentButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#EEF2FF',
    borderRadius: 6,
  },
  viewDocumentText: {
    fontSize: 13,
    color: '#6366F1',
    fontWeight: '500',
    marginRight: 4,
  },
  toolbar: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  toolbarTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 6,
  },
  toolGroup: {
    flexDirection: 'row',
    marginRight: 16,
  },
  typeButton: {
    flexDirection: 'column',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 6,
    marginRight: 6,
    borderRadius: 6,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  typeButtonActive: {
    backgroundColor: '#6366F1',
    borderColor: '#6366F1',
  },
  toolLabel: {
    fontSize: 11,
    color: '#374151',
    marginTop: 2,
  },
  toolLabelActive: {
    color: '#FFFFFF',
  },
  colorSelector: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  colorTitle: {
    fontSize: 13,
    color: '#374151',
    marginRight: 6,
  },
  colorButton: {
    width: 20,
    height: 20,
    borderRadius: 10,
    marginRight: 6,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  colorButtonActive: {
    borderColor: '#1F2937',
  },
  addAnnotationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 16,
    marginVertical: 8,
    paddingVertical: 12,
    backgroundColor: '#6366F1',
    borderRadius: 8,
  },
  addAnnotationText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  annotationsList: {
    flex: 1,
    paddingHorizontal: 16,
  },
  annotationsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 12,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  emptyStateText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#9CA3AF',
    marginTop: 12,
  },
  emptyStateSubtext: {
    fontSize: 13,
    color: '#9CA3AF',
    textAlign: 'center',
    marginTop: 6,
  },
  annotationItem: {
    backgroundColor: '#FFFFFF',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  annotationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  annotationTypeIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  colorIndicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 6,
  },
  annotationType: {
    fontSize: 11,
    color: '#6B7280',
    marginLeft: 3,
    textTransform: 'capitalize',
  },
  deleteButton: {
    padding: 3,
  },
  annotationText: {
    fontSize: 15,
    color: '#1F2937',
    lineHeight: 20,
  },
  annotationNote: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 6,
    lineHeight: 18,
  },
  annotationDate: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 6,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    width: width - 32,
    maxHeight: height * 0.8,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
  },
  modalCloseButton: {
    padding: 4,
  },
  noteInput: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#1F2937',
    minHeight: 100,
    marginBottom: 20,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  cancelButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginRight: 12,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
  },
  cancelButtonText: {
    fontSize: 16,
    color: '#6B7280',
    fontWeight: '500',
  },
  saveButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#6366F1',
  },
  saveButtonDisabled: {
    backgroundColor: '#9CA3AF',
  },
  saveButtonText: {
    fontSize: 16,
    color: '#FFFFFF',
    fontWeight: '500',
  },
  saveStatusContainer: {
    marginRight: 12,
    minWidth: 60,
  },
  saveStatusItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveStatusText: {
    fontSize: 12,
    color: '#6366F1',
    marginLeft: 4,
    fontWeight: '500',
  },
  loadingState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    fontSize: 16,
    color: '#6B7280',
    marginTop: 12,
  },
  addAnnotationButtonDisabled: {
    backgroundColor: '#9CA3AF',
    opacity: 0.6,
  },
});

export { DocumentAnnotationTool };
