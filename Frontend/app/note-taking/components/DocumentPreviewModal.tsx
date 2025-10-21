import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Alert,
  Dimensions,
  SafeAreaView,
} from 'react-native';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';

const { width, height } = Dimensions.get('window');

interface DocumentPreviewModalProps {
  visible: boolean;
  onClose: () => void;
  onConfirmImport: (document: any) => void;
}

interface DocumentInfo {
  name: string;
  uri: string;
  size: number;
  type: string;
  mimeType?: string;
}

export const DocumentPreviewModal: React.FC<DocumentPreviewModalProps> = ({
  visible,
  onClose,
  onConfirmImport,
}) => {
  const [selectedDocument, setSelectedDocument] = useState<DocumentInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const selectDocument = async () => {
    try {
      console.log('📁 Starting document picker...');
      setIsLoading(true);
      
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'application/pdf',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'text/plain',
          'text/rtf',
        ],
        copyToCacheDirectory: true,
      });

      console.log('📄 Document picker result:', result);

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const document = result.assets[0];
        console.log('✅ Document selected:', { name: document.name, uri: document.uri, mimeType: document.mimeType });
        
        // Get file info
        const fileInfo = await FileSystem.getInfoAsync(document.uri);
        console.log('📊 File info:', fileInfo);
        
        const documentInfo: DocumentInfo = {
          name: document.name,
          uri: document.uri,
          size: (fileInfo.exists && 'size' in fileInfo) ? fileInfo.size : (document.size || 0),
          type: getFileType(document.name),
          mimeType: document.mimeType,
        };

        console.log('💾 Document info prepared:', documentInfo);
        setSelectedDocument(documentInfo);
      } else {
        console.log('❌ Document picker canceled or no assets');
      }
    } catch (error) {
      console.error('❌ Error selecting document:', error);
      Alert.alert('Error', 'Failed to select document. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const getFileType = (filename: string): string => {
    const extension = filename.toLowerCase().split('.').pop();
    switch (extension) {
      case 'pdf':
        return 'PDF Document';
      case 'doc':
      case 'docx':
        return 'Word Document';
      case 'txt':
        return 'Text Document';
      case 'rtf':
        return 'Rich Text Document';
      default:
        return 'Document';
    }
  };

  const getFileIcon = (filename: string) => {
    const extension = filename.toLowerCase().split('.').pop();
    switch (extension) {
      case 'pdf':
        return <MaterialCommunityIcons name="file-pdf-box" size={48} color="#F40F02" />;
      case 'doc':
      case 'docx':
        return <MaterialCommunityIcons name="file-word-box" size={48} color="#2B579A" />;
      case 'txt':
        return <MaterialIcons name="description" size={48} color="#666666" />;
      case 'rtf':
        return <MaterialCommunityIcons name="file-document" size={48} color="#666666" />;
      default:
        return <MaterialIcons name="insert-drive-file" size={48} color="#666666" />;
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleImport = () => {
    if (selectedDocument) {
      console.log('🚀 Confirming document import...');
      
      // Ensure we pass a consistent shape including mimeType expected by the caller
      const inferMimeFromName = (name: string | undefined): string | undefined => {
        if (!name) return undefined;
        const ext = name.toLowerCase().split('.').pop();
        switch (ext) {
          case 'pdf': return 'application/pdf';
          case 'doc': return 'application/msword';
          case 'docx': return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
          case 'txt': return 'text/plain';
          case 'rtf': return 'application/rtf';
          default: return undefined;
        }
      };
      
      const payload = {
        name: selectedDocument.name,
        uri: selectedDocument.uri,
        size: selectedDocument.size,
        type: selectedDocument.type,
        mimeType: selectedDocument.mimeType || inferMimeFromName(selectedDocument.name),
      };
      
      console.log('📤 Sending document payload to import handler:', payload);
      onConfirmImport(payload);
      handleClose();
    } else {
      console.error('❌ No document selected for import');
    }
  };

  const handleClose = () => {
    setSelectedDocument(null);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="formSheet"
      onRequestClose={handleClose}
    >
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Import Document</Text>
          <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
            <MaterialIcons name="close" size={24} color="#666666" />
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
          <View style={styles.instructionCard}>
            <MaterialIcons name="info-outline" size={24} color="#3B82F6" />
            <Text style={styles.instructionText}>
              Select a PDF, Word document, or text file to import into your notes. 
              You'll be able to annotate and take notes on the document.
            </Text>
          </View>

          <TouchableOpacity
            style={styles.selectButton}
            onPress={selectDocument}
            disabled={isLoading}
          >
            <MaterialIcons name="upload-file" size={24} color="#FFFFFF" />
            <Text style={styles.selectButtonText}>
              {isLoading ? 'Selecting...' : 'Select Document'}
            </Text>
          </TouchableOpacity>

          {selectedDocument && (
            <View style={styles.previewCard}>
              <Text style={styles.previewTitle}>Document Preview</Text>
              
              <View style={styles.documentInfo}>
                <View style={styles.fileIcon}>
                  {getFileIcon(selectedDocument.name)}
                </View>
                
                <View style={styles.fileDetails}>
                  <Text style={styles.fileName} numberOfLines={2}>
                    {selectedDocument.name}
                  </Text>
                  <Text style={styles.fileType}>
                    {selectedDocument.type}
                  </Text>
                  <Text style={styles.fileSize}>
                    {formatFileSize(selectedDocument.size)}
                  </Text>
                </View>
              </View>

              <View style={styles.documentActions}>
                <TouchableOpacity
                  style={styles.changeButton}
                  onPress={selectDocument}
                >
                  <MaterialIcons name="swap-horiz" size={16} color="#6366F1" />
                  <Text style={styles.changeButtonText}>Change File</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.featuresList}>
                <Text style={styles.featuresTitle}>Available Features:</Text>
                <View style={styles.featureItem}>
                  <MaterialIcons name="highlight" size={16} color="#F59E0B" />
                  <Text style={styles.featureText}>Highlight important text</Text>
                </View>
                <View style={styles.featureItem}>
                  <MaterialIcons name="note-add" size={16} color="#3B82F6" />
                  <Text style={styles.featureText}>Add annotations and notes</Text>
                </View>
                <View style={styles.featureItem}>
                  <MaterialIcons name="search" size={16} color="#10B981" />
                  <Text style={styles.featureText}>Search through content</Text>
                </View>
              </View>
            </View>
          )}
        </ScrollView>

        {selectedDocument && (
          <View style={styles.footer}>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={handleClose}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={styles.importButton}
              onPress={handleImport}
            >
              <MaterialIcons name="file-download" size={20} color="#FFFFFF" />
              <Text style={styles.importButtonText}>Import Document</Text>
            </TouchableOpacity>
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: 'Inter-Bold',
    color: '#1F2937',
  },
  closeButton: {
    padding: 4,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
    paddingBottom: 100,
  },
  instructionCard: {
    flexDirection: 'row',
    backgroundColor: '#EBF4FF',
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
    alignItems: 'flex-start',
  },
  instructionText: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: '#1E40AF',
    marginLeft: 12,
    lineHeight: 20,
  },
  selectButton: {
    flexDirection: 'row',
    backgroundColor: '#6366F1',
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  selectButtonText: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
    color: '#FFFFFF',
    marginLeft: 8,
  },
  previewCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 2,
  },
  previewTitle: {
    fontSize: 18,
    fontFamily: 'Inter-Bold',
    color: '#1F2937',
    marginBottom: 16,
  },
  documentInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  fileIcon: {
    marginRight: 16,
  },
  fileDetails: {
    flex: 1,
  },
  fileName: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
    color: '#1F2937',
    marginBottom: 4,
  },
  fileType: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: '#6B7280',
    marginBottom: 2,
  },
  fileSize: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    color: '#9CA3AF',
  },
  documentActions: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  changeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#F8F9FF',
    borderWidth: 1,
    borderColor: '#E0E7FF',
  },
  changeButtonText: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    color: '#6366F1',
    marginLeft: 4,
  },
  featuresList: {
    marginTop: 8,
  },
  featuresTitle: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    color: '#374151',
    marginBottom: 12,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  featureText: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    color: '#6B7280',
    marginLeft: 8,
  },
  footer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  cancelButtonText: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
    color: '#374151',
  },
  importButton: {
    flex: 2,
    flexDirection: 'row',
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: '#10B981',
  },
  importButtonText: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
    color: '#FFFFFF',
    marginLeft: 6,
  },
});
