import React, { useState, useEffect } from "react";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
  Dimensions,
  SafeAreaView,
  StatusBar,
  Platform,
  Animated,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialIcons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import AsyncStorage from "@react-native-async-storage/async-storage";
import PDFAnnotationViewer from "./components/PDFAnnotationViewer";
import UnsavedChangesModal from "./components/UnsavedChangesModal";
import { getLocalPDFPath, isRemoteURL } from "./utils/pdfUtils";
import { useNetworkStatus, getNetworkStatusText, getNetworkStatusColor } from "./services/networkService";
import { API_URL, API_ENDPOINTS } from "@/constants/ApiConfig";
import { showSuccessToast, showErrorToast, showWarningToast, showInfoToast } from "../utils/ToastUtils";
import { uploadPDF } from "./services/ragService";

const { width, height } = Dimensions.get("window");

interface PDFDocument {
  id: string;
  name: string;
  uri: string;
  size: number;
  mimeType: string;
  lastModified: number;
  annotationCount: number;
  noteId?: string; // Link to backend note
  docId?: string; // RAG document id returned by backend
  annotations?: any[]; // Store annotations
  ragProcessed?: boolean; // Whether RAG processing completed
}

interface AnnotationSaveStatus {
  status: 'saved' | 'saving' | 'offline' | 'error';
  lastSaved?: Date;
  message?: string;
}

const ImportPDFPage = () => {
  const navigation = useNavigation();
  const [documents, setDocuments] = useState<PDFDocument[]>([]);
  const [selectedDocument, setSelectedDocument] = useState<PDFDocument | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [annotations, setAnnotations] = useState<any[]>([]);
  const [saveStatus, setSaveStatus] = useState<AnnotationSaveStatus>({ status: 'saved' });
  const fadeAnim = useState(new Animated.Value(0))[0];
  const slideAnim = useState(new Animated.Value(50))[0];

  // Unsaved changes modal state
  const [showUnsavedChangesModal, setShowUnsavedChangesModal] = useState(false);
  const [hasUnsavedAnnotations, setHasUnsavedAnnotations] = useState(false);

  // Network status monitoring
  const networkStatus = useNetworkStatus();
  const isOnline = networkStatus.isConnected && 
                  networkStatus.isInternetReachable && 
                  networkStatus.isServerReachable;

  useEffect(() => {
    loadDocuments();
    // Animate page entrance
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 800,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  // Navigation protection for unsaved annotations
  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e) => {
      if (!hasUnsavedAnnotations) {
        // No unsaved changes, allow navigation
        return;
      }

      // Prevent default behavior of leaving the screen
      e.preventDefault();

      // Show confirmation modal
      setShowUnsavedChangesModal(true);
    });

    return unsubscribe;
  }, [navigation, hasUnsavedAnnotations]);

  // Modal handlers for unsaved changes
  const handleSaveAndExit = async () => {
    setShowUnsavedChangesModal(false);
    if (selectedDocument && hasUnsavedAnnotations) {
      try {
        // Clear the timeout and save immediately
        clearTimeout((window as any).annotationSaveTimeout);
        await saveAnnotationsToBackend(selectedDocument.id, annotations);
        showSuccessToast("Annotations saved successfully");
      } catch (error) {
        showErrorToast("Failed to save annotations");
        console.error('Error saving annotations:', error);
        return; // Don't navigate if save failed
      }
    }
    
    // Navigate back after successful save
    navigation.goBack();
  };

  const handleContinueEditing = () => {
    setShowUnsavedChangesModal(false);
  };

  const loadDocuments = async () => {
    try {
      const stored = await AsyncStorage.getItem("pdf_documents");
      if (stored) {
        setDocuments(JSON.parse(stored));
      }
    } catch (error) {
      console.error("Error loading documents:", error);
    }
  };

  const saveDocuments = async (docs: PDFDocument[]) => {
    try {
      await AsyncStorage.setItem("pdf_documents", JSON.stringify(docs));
      setDocuments(docs);
    } catch (error) {
      console.error("Error saving documents:", error);
    }
  };

  const handleImportPDF = async () => {
    try {
      setIsLoading(true);
      
      const result = await DocumentPicker.getDocumentAsync({
        type: "application/pdf",
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (result.canceled) {
        setIsLoading(false);
        return;
      }

      const file = result.assets[0];
      
      // Validate file
      if (!file.uri || !file.name) {
        throw new Error('Invalid file selected');
      }
      
      // Check if file is accessible
      const fileInfo = await FileSystem.getInfoAsync(file.uri);
      if (!fileInfo.exists) {
        throw new Error('Selected file is not accessible');
      }

      // Upload to backend for RAG processing if online
      let ragProcessed = false;
      let documentId = Date.now().toString();
      
      if (isOnline) {
        try {
          showInfoToast('Uploading and processing PDF...');
          const uploadResult = await uploadPDF(file.uri, file.name);

          // backend may return `document_id` or `document_id` or `document_id` in different views
          const returnedId = uploadResult.document_id || uploadResult.documentId || uploadResult.document_id || uploadResult.documentId || uploadResult.document_id;
          documentId = returnedId || (uploadResult.document_id || uploadResult.documentId) || documentId;
          ragProcessed = true;
          showSuccessToast('PDF processed for AI chat');
        } catch (error) {
          console.warn('RAG processing failed, continuing with local storage:', error);
          showWarningToast('PDF saved locally. AI features limited.');
        }
      }
      
      // Create document directory if it doesn't exist
      const docDir = `${FileSystem.documentDirectory}pdf_documents/`;
      const dirInfo = await FileSystem.getInfoAsync(docDir);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(docDir, { intermediates: true });
      }

      // Copy file to permanent location
      const fileName = `${Date.now()}_${file.name}`;
      const permanentUri = `${docDir}${fileName}`;
      
      await FileSystem.copyAsync({
        from: file.uri,
        to: permanentUri,
      });

      // Verify the copied file exists
      const copiedFileInfo = await FileSystem.getInfoAsync(permanentUri);
      if (!copiedFileInfo.exists) {
        throw new Error('Failed to copy PDF file');
      }

      // Create document record
      const newDocument: PDFDocument = {
        id: documentId,
        name: file.name,
        uri: permanentUri,
        size: file.size || copiedFileInfo.size || 0,
        mimeType: file.mimeType || "application/pdf",
        lastModified: Date.now(),
        annotationCount: 0,
        ragProcessed,
        docId: documentId,
      };

      const updatedDocs = [...documents, newDocument];
      await saveDocuments(updatedDocs);
      
      // Navigate directly to PDFAnnotationViewer
      setSelectedDocument(newDocument);
      setAnnotations([]);
      
    } catch (error) {
      console.error("Error importing PDF:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
      Alert.alert("Error", `Failed to import PDF: ${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenDocument = async (document: PDFDocument) => {
    try {
      // Check if file exists before opening
      const fileInfo = await FileSystem.getInfoAsync(document.uri);
      if (!fileInfo.exists) {
        Alert.alert(
          "File Not Found", 
          "The PDF file could not be found. It may have been moved or deleted.",
          [
            { text: "Remove from List", onPress: () => handleDeleteDocument(document.id) },
            { text: "Cancel" }
          ]
        );
        return;
      }
      
      setSelectedDocument(document);
      
      // Load existing annotations for this document
      try {
        const loadedAnnotations = await loadAnnotations(document.id);
        setAnnotations(loadedAnnotations);
      } catch (error) {
        console.error('Failed to load annotations:', error);
        setAnnotations([]);
      }
      
    } catch (error) {
      console.error('Error checking file:', error);
      Alert.alert("Error", "Could not access the PDF file.");
    }
  };

  const handleCloseDocument = () => {
    setSelectedDocument(null);
    // Refresh document list to update annotation counts
    loadDocuments();
  };

  const handleDeleteDocument = (documentId: string) => {
    Alert.alert(
      "Delete Document",
      "Are you sure you want to delete this document?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              const document = documents.find(doc => doc.id === documentId);
              if (document) {
                // Delete physical file
                const fileInfo = await FileSystem.getInfoAsync(document.uri);
                if (fileInfo.exists) {
                  await FileSystem.deleteAsync(document.uri);
                }
                
                // Delete annotations
                await AsyncStorage.removeItem(`pdf_annotations_${document.name}`);
              }
              
              // Remove from list
              const updatedDocs = documents.filter(doc => doc.id !== documentId);
              await saveDocuments(updatedDocs);
              
            } catch (error) {
              console.error("Error deleting document:", error);
              Alert.alert("Error", "Failed to delete document");
            }
          },
        },
      ]
    );
  };

  // Annotation handling functions
  const saveAnnotationsToBackend = async (docId: string, annotations: any[]) => {
    if (!isOnline) {
      // Save locally when offline
      await saveAnnotationsLocally(docId, annotations);
      setSaveStatus({ 
        status: 'offline', 
        message: 'Annotations saved locally. Will sync when online.',
        lastSaved: new Date()
      });
      return;
    }

    try {
      setSaveStatus({ status: 'saving' });
      
      const token = await AsyncStorage.getItem('authToken');
      if (!token) {
        throw new Error('No auth token found');
      }

      const document = documents.find(doc => doc.id === docId);
      if (!document) {
        throw new Error('Document not found');
      }

      // Create or update note with document annotations
      const noteData = {
        title: `PDF: ${document.name}`,
        content: `PDF document with ${annotations.length} annotations`,
        type: 'document',
        document_annotations: annotations,
        document_file: document.uri,
      };

      const url = document.noteId 
        ? `${API_URL}${API_ENDPOINTS.NOTES}${document.noteId}/`
        : `${API_URL}${API_ENDPOINTS.NOTES}`;
      
      const method = document.noteId ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          Authorization: `Token ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(noteData),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const savedNote = await response.json();
      
      // Update document with note ID
      if (!document.noteId) {
        const updatedDocuments = documents.map(doc => 
          doc.id === docId 
            ? { ...doc, noteId: savedNote.id, annotations }
            : doc
        );
        setDocuments(updatedDocuments);
        await saveDocuments(updatedDocuments);
      }

      // Save locally as backup
      await saveAnnotationsLocally(docId, annotations);
      
      setSaveStatus({ 
        status: 'saved', 
        message: 'Annotations saved successfully',
        lastSaved: new Date()
      });
      setHasUnsavedAnnotations(false); // Clear unsaved state
      
      showSuccessToast('Annotations saved to cloud');
      
    } catch (error) {
      console.error('Failed to save annotations to backend:', error);
      
      // Fall back to local storage
      await saveAnnotationsLocally(docId, annotations);
      
      setSaveStatus({ 
        status: 'error', 
        message: 'Failed to save to server. Saved locally.',
        lastSaved: new Date()
      });
      
      showErrorToast('Failed to sync annotations. Saved locally.');
    }
  };

  const saveAnnotationsLocally = async (docId: string, annotations: any[]) => {
    try {
      await AsyncStorage.setItem(
        `pdf_annotations_${docId}`, 
        JSON.stringify({
          annotations,
          lastModified: new Date().toISOString(),
        })
      );
      
      // Update annotation count in document
      const updatedDocuments = documents.map(doc => 
        doc.id === docId 
          ? { ...doc, annotationCount: annotations.length, annotations }
          : doc
      );
      setDocuments(updatedDocuments);
      await saveDocuments(updatedDocuments);
      
    } catch (error) {
      console.error('Failed to save annotations locally:', error);
      throw error;
    }
  };

  const loadAnnotations = async (docId: string): Promise<any[]> => {
    try {
      const stored = await AsyncStorage.getItem(`pdf_annotations_${docId}`);
      if (stored) {
        const data = JSON.parse(stored);
        return data.annotations || [];
      }
      
      // Try to load from backend if available
      if (isOnline) {
        const document = documents.find(doc => doc.id === docId);
        if (document?.noteId) {
          const token = await AsyncStorage.getItem('authToken');
          if (token) {
            const response = await fetch(
              `${API_URL}${API_ENDPOINTS.NOTES}${document.noteId}/`,
              {
                headers: { Authorization: `Token ${token}` }
              }
            );
            
            if (response.ok) {
              const note = await response.json();
              if (note.document_annotations) {
                // Save locally for offline access
                await saveAnnotationsLocally(docId, note.document_annotations);
                return note.document_annotations;
              }
            }
          }
        }
      }
      
      return [];
    } catch (error) {
      console.error('Failed to load annotations:', error);
      return [];
    }
  };

  const handleAnnotationChange = async (newAnnotations: any[]) => {
    if (!selectedDocument) return;
    
    setAnnotations(newAnnotations);
    setHasUnsavedAnnotations(true); // Mark as having unsaved changes
    setSaveStatus({ status: 'saving', message: 'Saving annotations...' });
    
    // Debounced save to avoid excessive API calls
    clearTimeout((window as any).annotationSaveTimeout);
    (window as any).annotationSaveTimeout = setTimeout(() => {
      saveAnnotationsToBackend(selectedDocument.id, newAnnotations);
    }, 2000); // Save 2 seconds after user stops editing
  };

  const getSaveStatusIcon = () => {
    if (!isOnline) return "cloud-off";
    
    switch (saveStatus.status) {
      case 'saving': return "sync";
      case 'saved': return "cloud-done";
      case 'error': return "error";
      default: return "cloud-done";
    }
  };

  const getSaveStatusColor = () => {
    if (!isOnline) return "#FF9500"; // Orange for offline
    
    switch (saveStatus.status) {
      case 'saving': return "#007AFF";
      case 'saved': return "#34C759";
      case 'error': return "#FF3B30";
      default: return "#34C759";
    }
  };

  const getSaveStatusText = () => {
    if (!isOnline) return getNetworkStatusText(networkStatus);
    
    switch (saveStatus.status) {
      case 'saving': return "Saving...";
      case 'saved': return "Saved";
      case 'error': return "Error";
      default: return "Saved";
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString();
  };

  if (selectedDocument) {
    return (
      <PDFAnnotationViewer
        source={{ uri: selectedDocument.uri }}
        fileName={selectedDocument.name}
        onClose={handleCloseDocument}
        enableDirectSave={true}
        autoSave={true}
        annotations={annotations}
        onAnnotationChange={handleAnnotationChange}
        networkStatus={networkStatus}
        saveStatus={saveStatus}
        // pass backend doc id so viewer can query RAG status and ask RINA
        docId={selectedDocument.docId}
      />
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#667eea" />
      
      <LinearGradient
        colors={['#667eea', '#764ba2', '#f093fb']}
        style={styles.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <Animated.View 
          style={[
            styles.content,
            {
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>PDF Documents</Text>
            <Text style={styles.headerSubtitle}>Import and annotate PDF documents with embedded annotations</Text>
            
            {/* Network and Save Status */}
            <View style={styles.statusContainer}>
              <MaterialIcons 
                name={getSaveStatusIcon()} 
                size={16} 
                color={getSaveStatusColor()} 
              />
              <Text style={[styles.statusText, { color: getSaveStatusColor() }]}>
                {getSaveStatusText()}
              </Text>
              {saveStatus.lastSaved && (
                <Text style={styles.lastSavedText}>
                  Last saved: {saveStatus.lastSaved.toLocaleTimeString()}
                </Text>
              )}
            </View>
          </View>

          {/* Import Section */}
          <View style={styles.importContainer}>
            <MaterialIcons name="picture-as-pdf" size={48} color="#ffffff" />
            <Text style={styles.instructions}>
              {documents.length === 0 
                ? "Import a PDF to get started with true PDF annotation" 
                : "Import more PDFs or select one to view and annotate"
              }
            </Text>
          
          <TouchableOpacity 
            style={[styles.importButton, isLoading && styles.importButtonDisabled]} 
            onPress={handleImportPDF}
            disabled={isLoading}
          >
            <MaterialIcons 
              name="add" 
              size={20} 
              color="#fff" 
              style={styles.importButtonIcon} 
            />
            <Text style={styles.importButtonText}>
              {isLoading ? "Importing..." : "Import PDF"}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Documents List */}
        {documents.length > 0 && (
          <ScrollView style={styles.documentsList}>
            <Text style={styles.sectionTitle}>Your Documents</Text>
            
            {documents.map((document) => (
              <View key={document.id} style={styles.documentItem}>
                <TouchableOpacity 
                  style={styles.documentContent}
                  onPress={() => handleOpenDocument(document)}
                >
                  <View style={styles.documentIcon}>
                    <MaterialIcons name="picture-as-pdf" size={32} color="#d32f2f" />
                  </View>
                  
                  <View style={styles.documentInfo}>
                    <Text style={styles.documentName} numberOfLines={1}>
                      {document.name}
                    </Text>
                    <Text style={styles.documentMeta}>
                      {formatFileSize(document.size)} • {formatDate(document.lastModified)}
                    </Text>
                    <Text style={styles.annotationFeature}>
                      ✨ True PDF annotation support
                    </Text>
                  </View>
                  
                  <MaterialIcons name="chevron-right" size={24} color="#666" />
                </TouchableOpacity>
                
                <TouchableOpacity 
                  style={styles.deleteButton}
                  onPress={() => handleDeleteDocument(document.id)}
                >
                  <MaterialIcons name="delete" size={20} color="#d32f2f" />
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        )}
        </Animated.View>
      </LinearGradient>

      <UnsavedChangesModal
        visible={showUnsavedChangesModal}
        onSave={handleSaveAndExit}
        onCancel={handleContinueEditing}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  gradient: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  header: {
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: "#ffffff",
    marginBottom: 4,
    letterSpacing: -0.3,
    textShadowColor: "rgba(0,0,0,0.3)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  headerSubtitle: {
    fontSize: 14,
    color: "rgba(255,255,255,0.9)",
    lineHeight: 18,
    fontWeight: "400",
    textShadowColor: "rgba(0,0,0,0.2)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  importContainer: {
    alignItems: "center",
    paddingVertical: 20,
    paddingHorizontal: 16,
    backgroundColor: "rgba(255,255,255,0.95)",
    borderRadius: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.3)",
    elevation: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
  },
  instructions: {
    fontSize: 14,
    color: "#475569",
    textAlign: "center",
    marginVertical: 12,
    lineHeight: 20,
    fontWeight: "500",
    maxWidth: width * 0.85,
  },
  importButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#667eea",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 14,
    elevation: 4,
    shadowColor: "#667eea",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    transform: [{ scale: 1 }],
  },
  importButtonDisabled: {
    backgroundColor: "#94a3b8",
    elevation: 0,
    shadowOpacity: 0,
  },
  importButtonIcon: {
    marginRight: 10,
  },
  importButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "600",
    letterSpacing: 0.3,
    textShadowColor: "rgba(0,0,0,0.2)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  documentsList: {
    flex: 1,
    paddingBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#ffffff",
    marginBottom: 12,
    paddingHorizontal: 4,
    letterSpacing: -0.2,
    textShadowColor: "rgba(0,0,0,0.3)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  documentItem: {
    flexDirection: "row",
    backgroundColor: "rgba(255,255,255,0.9)",
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.4)",
    elevation: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    overflow: "hidden",
  },
  documentContent: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
  },
  documentIcon: {
    marginRight: 12,
    backgroundColor: "rgba(102, 126, 234, 0.1)",
    padding: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(102, 126, 234, 0.2)",
  },
  documentInfo: {
    flex: 1,
  },
  documentName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1e293b",
    marginBottom: 4,
    lineHeight: 20,
  },
  documentMeta: {
    fontSize: 12,
    color: "#64748b",
    marginBottom: 4,
    fontWeight: "400",
  },
  annotationFeature: {
    fontSize: 13,
    color: "#3b82f6",
    fontWeight: "600",
    backgroundColor: "#eff6ff",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: "#dbeafe",
  },
  deleteButton: {
    justifyContent: "center",
    alignItems: "center",
    width: 60,
    backgroundColor: "#fef2f2",
    borderLeftWidth: 1,
    borderLeftColor: "#fecaca",
  },
  statusContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
  },
  statusText: {
    fontSize: 14,
    fontWeight: "500",
    marginLeft: 6,
    textShadowColor: "rgba(0,0,0,0.1)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 1,
  },
  lastSavedText: {
    fontSize: 12,
    color: "rgba(255, 255, 255, 0.7)",
    marginLeft: 8,
    fontWeight: "400",
  },
});

export default ImportPDFPage;