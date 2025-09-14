import React from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

interface DocumentPreviewProps {
  documentFile?: string;
  documentAnnotations?: any;
  title: string;
  width: number;
  height: number;
}

const DocumentPreview: React.FC<DocumentPreviewProps> = ({
  documentFile,
  documentAnnotations,
  title,
  width,
  height,
}) => {
  const getDocumentType = () => {
    if (!documentFile) return { type: 'Document', icon: 'description', color: '#1976D2' };
    
    const lowerFile = documentFile.toLowerCase();
    if (lowerFile.includes('.pdf') || lowerFile.includes('pdf')) {
      return { type: 'PDF', icon: 'picture-as-pdf', color: '#FF5722' };
    } else if (lowerFile.includes('.doc') || lowerFile.includes('.docx')) {
      return { type: 'Word', icon: 'description', color: '#1976D2' };
    } else if (lowerFile.includes('.txt')) {
      return { type: 'Text', icon: 'text-snippet', color: '#757575' };
    } else if (lowerFile.includes('.xls') || lowerFile.includes('.xlsx')) {
      return { type: 'Excel', icon: 'table-chart', color: '#0F7B0F' };
    } else if (lowerFile.includes('.ppt') || lowerFile.includes('.pptx')) {
      return { type: 'PowerPoint', icon: 'slideshow', color: '#D24726' };
    }
    
    return { type: 'Document', icon: 'description', color: '#1976D2' };
  };

  const getAnnotationCount = () => {
    if (!documentAnnotations) return 0;
    
    if (Array.isArray(documentAnnotations)) {
      return documentAnnotations.length;
    } else if (typeof documentAnnotations === 'object') {
      return Object.keys(documentAnnotations).length;
    }
    
    return 0;
  };

  const docInfo = getDocumentType();
  const annotationCount = getAnnotationCount();

  return (
    <View style={[styles.container, { width, height }]}>
      {/* Document Icon */}
      <View style={[styles.iconContainer, { backgroundColor: `${docInfo.color}15` }]}>
        <MaterialIcons 
          name={docInfo.icon as any} 
          size={48} 
          color={docInfo.color} 
        />
      </View>
      
      {/* Document Type Badge */}
      <View style={[styles.typeBadge, { backgroundColor: docInfo.color }]}>
        <Text style={styles.typeBadgeText}>{docInfo.type}</Text>
      </View>
      
      {/* Document Info */}
      <View style={styles.infoContainer}>
        <Text style={styles.documentTitle} numberOfLines={2}>
          {title || 'Untitled Document'}
        </Text>
        
        <View style={styles.statsContainer}>
          {annotationCount > 0 ? (
            <View style={styles.statItem}>
              <MaterialIcons name="edit" size={12} color="#666" />
              <Text style={styles.statText}>
                {annotationCount} annotation{annotationCount !== 1 ? 's' : ''}
              </Text>
            </View>
          ) : (
            <Text style={styles.noAnnotationsText}>No annotations</Text>
          )}
        </View>
      </View>
      
      {/* Visual representation for PDF */}
      {docInfo.type === 'PDF' && (
        <View style={styles.pdfPreview}>
          <View style={styles.pdfPage}>
            <View style={styles.pdfContent}>
              <View style={[styles.pdfLine, { width: '80%' }]} />
              <View style={[styles.pdfLine, { width: '90%' }]} />
              <View style={[styles.pdfLine, { width: '75%' }]} />
              <View style={[styles.pdfLine, { width: '85%' }]} />
            </View>
            {annotationCount > 0 && (
              <View style={styles.annotationIndicator}>
                <View style={styles.highlightMark} />
                <View style={[styles.highlightMark, { top: 20, left: 10 }]} />
              </View>
            )}
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FAFAFA',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  iconContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 8,
  },
  typeBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  infoContainer: {
    alignItems: 'center',
    flex: 1,
  },
  documentTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
    marginBottom: 4,
  },
  statsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statText: {
    fontSize: 10,
    color: '#666',
    marginLeft: 2,
  },
  noAnnotationsText: {
    fontSize: 10,
    color: '#999',
    fontStyle: 'italic',
  },
  pdfPreview: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    width: 30,
    height: 40,
  },
  pdfPage: {
    width: '100%',
    height: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 2,
    borderWidth: 1,
    borderColor: '#DDD',
    padding: 4,
    position: 'relative',
  },
  pdfContent: {
    flex: 1,
  },
  pdfLine: {
    height: 2,
    backgroundColor: '#E0E0E0',
    marginBottom: 2,
    borderRadius: 1,
  },
  annotationIndicator: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  highlightMark: {
    position: 'absolute',
    top: 8,
    left: 2,
    width: 20,
    height: 3,
    backgroundColor: '#FFD700',
    opacity: 0.7,
    borderRadius: 1,
  },
});

export default DocumentPreview;