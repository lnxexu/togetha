import React, { useState, useEffect } from "react";
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
import Navbar from "../NavBar";
import PDFAnnotationViewer from "./components/PDFAnnotationViewer";
import { getLocalPDFPath, isRemoteURL } from "./utils/pdfUtils";

const { width, height } = Dimensions.get("window");

interface PDFDocument {
  id: string;
  name: string;
  uri: string;
  size: number;
  mimeType: string;
  lastModified: number;
  annotationCount: number;
}

const ImportPDFPage = () => {
  const [documents, setDocuments] = useState<PDFDocument[]>([]);
  const [selectedDocument, setSelectedDocument] = useState<PDFDocument | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const fadeAnim = useState(new Animated.Value(0))[0];
  const slideAnim = useState(new Animated.Value(50))[0];

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
      console.log('Selected file:', file);
      
      // Validate file
      if (!file.uri || !file.name) {
        throw new Error('Invalid file selected');
      }
      
      // Check if file is accessible
      const fileInfo = await FileSystem.getInfoAsync(file.uri);
      if (!fileInfo.exists) {
        throw new Error('Selected file is not accessible');
      }
      
      console.log('File info:', fileInfo);
      
      // Create document directory if it doesn't exist
      const docDir = `${FileSystem.documentDirectory}pdf_documents/`;
      const dirInfo = await FileSystem.getInfoAsync(docDir);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(docDir, { intermediates: true });
      }

      // Copy file to permanent location
      const fileName = `${Date.now()}_${file.name}`;
      const permanentUri = `${docDir}${fileName}`;
      
      console.log('Copying from:', file.uri, 'to:', permanentUri);
      
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
        id: Date.now().toString(),
        name: file.name,
        uri: permanentUri,
        size: file.size || copiedFileInfo.size || 0,
        mimeType: file.mimeType || "application/pdf",
        lastModified: Date.now(),
        annotationCount: 0,
      };

      const updatedDocs = [...documents, newDocument];
      await saveDocuments(updatedDocs);
      
      console.log('PDF imported successfully:', newDocument);
      Alert.alert("Success", "PDF imported successfully!");
      
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
      
      console.log('Opening PDF:', document.name, 'at URI:', document.uri);
      setSelectedDocument(document);
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
      
      <Navbar activeRoute="PDFs" />
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
    marginBottom: 32,
    paddingHorizontal: 4,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: "800",
    color: "#ffffff",
    marginBottom: 8,
    letterSpacing: -0.5,
    textShadowColor: "rgba(0,0,0,0.3)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  headerSubtitle: {
    fontSize: 17,
    color: "rgba(255,255,255,0.9)",
    lineHeight: 24,
    fontWeight: "400",
    textShadowColor: "rgba(0,0,0,0.2)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  importContainer: {
    alignItems: "center",
    paddingVertical: 48,
    paddingHorizontal: 24,
    backgroundColor: "rgba(255,255,255,0.95)",
    borderRadius: 24,
    marginBottom: 32,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.3)",
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
  },
  instructions: {
    fontSize: 17,
    color: "#475569",
    textAlign: "center",
    marginVertical: 20,
    lineHeight: 26,
    fontWeight: "500",
    maxWidth: width * 0.8,
  },
  importButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#667eea",
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 20,
    elevation: 6,
    shadowColor: "#667eea",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
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
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: 0.5,
    textShadowColor: "rgba(0,0,0,0.2)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  documentsList: {
    flex: 1,
    paddingBottom: 20,
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: "#ffffff",
    marginBottom: 20,
    paddingHorizontal: 4,
    letterSpacing: -0.3,
    textShadowColor: "rgba(0,0,0,0.3)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  documentItem: {
    flexDirection: "row",
    backgroundColor: "rgba(255,255,255,0.9)",
    borderRadius: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.4)",
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    overflow: "hidden",
  },
  documentContent: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    padding: 20,
  },
  documentIcon: {
    marginRight: 16,
    backgroundColor: "rgba(102, 126, 234, 0.1)",
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(102, 126, 234, 0.2)",
  },
  documentInfo: {
    flex: 1,
  },
  documentName: {
    fontSize: 17,
    fontWeight: "600",
    color: "#1e293b",
    marginBottom: 6,
    lineHeight: 22,
  },
  documentMeta: {
    fontSize: 14,
    color: "#64748b",
    marginBottom: 6,
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
});

export default ImportPDFPage;
