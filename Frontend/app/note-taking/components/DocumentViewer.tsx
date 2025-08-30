import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  ScrollView,
  Alert,
  Modal,
  TextInput,
  ActivityIndicator,
  PanResponder,
  Animated,
  Platform,
  StatusBar,
  Linking,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL, API_ENDPOINTS } from '@/constants/ApiConfig';
import Svg, { Rect, Circle, Path, Text as SvgText } from 'react-native-svg';
import { WebView } from 'react-native-webview';

const { width, height } = Dimensions.get('window');

interface Annotation {
  id: string;
  type: 'highlight' | 'note' | 'underline' | 'strikethrough' | 'drawing';
  x: number;
  y: number;
  width?: number;
  height?: number;
  text?: string;
  note?: string;
  color: string;
  page: number;
  strokeData?: string; // For drawing annotations
  created_at: string;
}

interface DocumentViewerProps {
  documentUri: string;
  documentName: string;
  noteId: string;
  documentType: 'pdf' | 'word' | 'document' | 'image' | 'doc' | 'docx' | 'txt';
  onClose: () => void;
}

const ANNOTATION_COLORS = [
  '#FFEB3B', // Yellow
  '#4CAF50', // Green
  '#2196F3', // Blue
  '#FF9800', // Orange
  '#E91E63', // Pink
  '#9C27B0', // Purple
  '#F44336', // Red
  '#795548', // Brown
];

export const DocumentViewer: React.FC<DocumentViewerProps> = ({
  documentUri,
  documentName,
  noteId,
  documentType,
  onClose,
}) => {
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [selectedTool, setSelectedTool] = useState<'highlight' | 'note' | 'underline' | 'strikethrough' | 'drawing'>('highlight');
  const [selectedColor, setSelectedColor] = useState(ANNOTATION_COLORS[0]);
  const [isAnnotating, setIsAnnotating] = useState(false);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [currentAnnotation, setCurrentAnnotation] = useState<Partial<Annotation> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [useAlternativeViewer, setUseAlternativeViewer] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [zoomScale, setZoomScale] = useState(1);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentStroke, setCurrentStroke] = useState<string>('');
  const [lastSaveTime, setLastSaveTime] = useState<number>(Date.now());

  const webViewRef = useRef<WebView>(null);
  const drawingPathRef = useRef<string>('');
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Helper function to detect document type from URI
  const getActualDocumentType = (): typeof documentType => {
    if (documentType && documentType !== 'document') {
      return documentType;
    }
    
    const uri = documentUri.toLowerCase();
    if (uri.match(/\.(jpg|jpeg|png|gif|bmp|webp|svg)$/)) {
      return 'image';
    } else if (uri.match(/\.pdf$/)) {
      return 'pdf';
    } else if (uri.match(/\.(doc|docx)$/)) {
      return 'word';
    } else if (uri.match(/\.txt$/)) {
      return 'txt';
    }
    
    return documentType;
  };

  const actualDocumentType = getActualDocumentType();

  // Auto-save functionality similar to drawing feature
  const autoSave = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem('authToken');
      if (!token) return;

      const response = await fetch(`${API_URL}${API_ENDPOINTS.DOCUMENT_ANNOTATIONS(noteId)}`, {
        method: 'POST',
        headers: {
          'Authorization': `Token ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          annotations: annotations,
          last_updated: new Date().toISOString(),
        }),
      });

      if (response.ok) {
        setLastSaveTime(Date.now());
        console.log('Document annotations auto-saved');
      }
    } catch (error) {
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

  // Load existing annotations
  const loadAnnotations = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem('authToken');
      if (!token) return;

      const response = await fetch(`${API_URL}${API_ENDPOINTS.DOCUMENT_ANNOTATIONS(noteId)}`, {
        headers: {
          'Authorization': `Token ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        setAnnotations(data.annotations || []);
      }
    } catch (error) {
      console.error('Error loading annotations:', error);
    }
  }, [noteId]);

  // Save annotation to backend
  const saveAnnotation = async (annotation: Omit<Annotation, 'id' | 'created_at'>) => {
    try {
      const token = await AsyncStorage.getItem('authToken');
      if (!token) return false;

      const response = await fetch(`${API_URL}${API_ENDPOINTS.DOCUMENT_ANNOTATIONS(noteId)}`, {
        method: 'POST',
        headers: {
          'Authorization': `Token ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(annotation),
      });

      if (response.ok) {
        const data = await response.json();
        const newAnnotations = [...annotations, data.annotation];
        setAnnotations(newAnnotations);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error saving annotation:', error);
      return false;
    }
  };

  // Delete annotation
  const deleteAnnotation = async (annotationId: string) => {
    try {
      const token = await AsyncStorage.getItem('authToken');
      if (!token) return false;

      const response = await fetch(
        `${API_URL}${API_ENDPOINTS.DELETE_ANNOTATION(noteId, annotationId)}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Token ${token}`,
          },
        }
      );

      if (response.ok) {
        const newAnnotations = annotations.filter(ann => ann.id !== annotationId);
        setAnnotations(newAnnotations);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error deleting annotation:', error);
      return false;
    }
  };

  // Handle touch events for annotation
  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => isAnnotating,
    onMoveShouldSetPanResponder: () => isAnnotating && selectedTool === 'drawing',
    
    onPanResponderGrant: (evt) => {
      if (!isAnnotating) return;

      const { locationX, locationY } = evt.nativeEvent;
      
      if (selectedTool === 'drawing') {
        setIsDrawing(true);
        drawingPathRef.current = `M${locationX},${locationY}`;
        setCurrentStroke(drawingPathRef.current);
      } else {
        // Start selection for other annotation types
        setCurrentAnnotation({
          type: selectedTool,
          x: locationX,
          y: locationY,
          color: selectedColor,
          page: currentPage,
        });
      }
    },

    onPanResponderMove: (evt) => {
      if (!isAnnotating) return;

      const { locationX, locationY } = evt.nativeEvent;

      if (selectedTool === 'drawing' && isDrawing) {
        drawingPathRef.current += ` L${locationX},${locationY}`;
        setCurrentStroke(drawingPathRef.current);
      } else if (currentAnnotation) {
        // Update selection area
        setCurrentAnnotation({
          ...currentAnnotation,
          width: Math.abs(locationX - currentAnnotation.x!),
          height: Math.abs(locationY - currentAnnotation.y!),
        });
      }
    },

    onPanResponderRelease: (evt) => {
      if (!isAnnotating) return;

      if (selectedTool === 'drawing' && isDrawing) {
        // Save drawing annotation
        const annotation: Omit<Annotation, 'id' | 'created_at'> = {
          type: 'drawing',
          x: 0,
          y: 0,
          color: selectedColor,
          page: currentPage,
          strokeData: drawingPathRef.current,
        };
        
        saveAnnotation(annotation);
        setIsDrawing(false);
        setCurrentStroke('');
        drawingPathRef.current = '';
      } else if (currentAnnotation && selectedTool === 'note') {
        // Show note modal for text input
        setShowNoteModal(true);
      } else if (currentAnnotation) {
        // Save other annotation types immediately
        const annotation: Omit<Annotation, 'id' | 'created_at'> = {
          type: selectedTool,
          x: currentAnnotation.x!,
          y: currentAnnotation.y!,
          width: currentAnnotation.width || 50,
          height: currentAnnotation.height || 20,
          color: selectedColor,
          page: currentPage,
        };
        
        saveAnnotation(annotation);
        setCurrentAnnotation(null);
      }
    },
  });

  // Handle note saving
  const handleSaveNote = async () => {
    if (!currentAnnotation || !noteText.trim()) return;

    const annotation: Omit<Annotation, 'id' | 'created_at'> = {
      type: 'note',
      x: currentAnnotation.x!,
      y: currentAnnotation.y!,
      width: currentAnnotation.width || 100,
      height: currentAnnotation.height || 50,
      note: noteText,
      color: selectedColor,
      page: currentPage,
    };

    const success = await saveAnnotation(annotation);
    if (success) {
      setShowNoteModal(false);
      setNoteText('');
      setCurrentAnnotation(null);
    }
  };

  // Generate document URL for WebView with platform-specific handling
  const getDocumentUrl = () => {
    console.log('Getting document URL for:', { actualDocumentType, useAlternativeViewer, Platform: Platform.OS });
    
    if (actualDocumentType === 'pdf') {
      // For PDFs, try different approaches based on platform and environment
      if (useAlternativeViewer) {
        // Alternative viewer: Try direct PDF access first
        console.log('Using alternative viewer - direct PDF access:', documentUri);
        return documentUri;
      } else {
        // Primary viewer logic
        if (Platform.OS === 'android') {
          // Android: Direct PDF access works better than external viewers for local files
          console.log('Android - using direct PDF access:', documentUri);
          return documentUri;
        } else if (Platform.OS === 'ios') {
          // iOS: Direct PDF access works well on Safari WebView
          console.log('iOS - using direct PDF access:', documentUri);
          return documentUri;
        } else {
          // Web: Try backend proxy first, then fallback to direct
          const proxyUrl = `${API_URL}${API_ENDPOINTS.SERVE_DOCUMENT(noteId)}`;
          console.log('Web - trying backend proxy:', proxyUrl);
          // For now, let's try direct access as the proxy might have issues
          return documentUri;
        }
      }
    } else if (actualDocumentType === 'image') {
      // For images, return the direct URI for better display
      console.log('Image - using direct access:', documentUri);
      return documentUri;
    }
    
    // For other document types, use direct access
    console.log('Other document type - using direct access:', documentUri);
    return documentUri;
  };

  // Open document in external browser with platform-specific handling
  const openInExternalBrowser = async () => {
    try {
      const url = documentUri;
      console.log('Opening in external browser:', url);
      
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
      } else {
        Alert.alert('Error', 'Cannot open this document in external browser. The URL might not be accessible from outside the app.');
      }
    } catch (error) {
      console.error('Error opening document in external browser:', error);
      Alert.alert('Error', 'Failed to open document in external browser');
    }
  };

  // Render annotation overlay
  const renderAnnotationOverlay = () => {
    const pageAnnotations = annotations.filter(ann => ann.page === currentPage);
    
    return (
      <Svg style={StyleSheet.absoluteFillObject} pointerEvents="none">
        {pageAnnotations.map((annotation) => {
          if (annotation.type === 'drawing' && annotation.strokeData) {
            return (
              <Path
                key={annotation.id}
                d={annotation.strokeData}
                stroke={annotation.color}
                strokeWidth={3}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            );
          } else if (annotation.type === 'highlight') {
            return (
              <Rect
                key={annotation.id}
                x={annotation.x}
                y={annotation.y}
                width={annotation.width || 50}
                height={annotation.height || 20}
                fill={annotation.color}
                opacity={0.3}
              />
            );
          } else if (annotation.type === 'note') {
            return (
              <React.Fragment key={annotation.id}>
                <Circle
                  cx={annotation.x}
                  cy={annotation.y}
                  r={12}
                  fill={annotation.color}
                />
                <SvgText
                  x={annotation.x}
                  y={annotation.y + 4}
                  textAnchor="middle"
                  fontSize={10}
                  fill="white"
                >
                  N
                </SvgText>
              </React.Fragment>
            );
          }
          return null;
        })}
        
        {/* Current stroke while drawing */}
        {isDrawing && currentStroke && (
          <Path
            d={currentStroke}
            stroke={selectedColor}
            strokeWidth={3}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
        
        {/* Current selection */}
        {currentAnnotation && selectedTool !== 'drawing' && (
          <Rect
            x={currentAnnotation.x!}
            y={currentAnnotation.y!}
            width={currentAnnotation.width || 50}
            height={currentAnnotation.height || 20}
            fill={selectedColor}
            opacity={0.3}
            stroke={selectedColor}
            strokeWidth={2}
            strokeDasharray="5,5"
          />
        )}
      </Svg>
    );
  };

  useEffect(() => {
    console.log('DocumentViewer mounted with:', {
      documentUri,
      documentName,
      documentType,
      actualDocumentType,
      noteId
    });
    loadAnnotations();
  }, [loadAnnotations]);

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
          <Text style={styles.pageInfo}>
            Page {currentPage}/{totalPages}
          </Text>
          
          <TouchableOpacity
            style={styles.switchViewerButton}
            onPress={() => {
              setUseAlternativeViewer(!useAlternativeViewer);
              setIsLoading(true);
              setHasError(false);
              // Force WebView to reload with new URL
              setTimeout(() => {
                webViewRef.current?.reload();
              }, 100);
            }}
          >
            <MaterialIcons name="swap-horiz" size={16} color="#6366F1" />
            <Text style={styles.switchViewerText}>
              {useAlternativeViewer ? 'Primary' : 'Alt'}
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={styles.debugButton}
            onPress={() => {
              const currentUrl = getDocumentUrl();
              Alert.alert(
                'Debug Info',
                `Document URI: ${documentUri}\n\nWebView URL: ${currentUrl}\n\nDocument Type: ${actualDocumentType}\n\nPlatform: ${Platform.OS}\n\nAlternative Viewer: ${useAlternativeViewer}`,
                [
                  { text: 'OK', style: 'default' },
                  { 
                    text: 'Copy URL', 
                    onPress: () => {
                      console.log('URL copied to console:', currentUrl);
                    }
                  }
                ]
              );
            }}
          >
            <MaterialIcons name="info" size={16} color="#6366F1" />
          </TouchableOpacity>
          
          <TouchableOpacity
            style={styles.externalButton}
            onPress={openInExternalBrowser}
          >
            <MaterialIcons name="open-in-new" size={20} color="#6366F1" />
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[styles.annotateButton, isAnnotating && styles.annotateButtonActive]}
            onPress={() => setIsAnnotating(!isAnnotating)}
          >
            <MaterialIcons 
              name={isAnnotating ? "edit-off" : "edit"} 
              size={20} 
              color={isAnnotating ? "#FFFFFF" : "#6366F1"} 
            />
          </TouchableOpacity>
        </View>
      </View>

      {/* Annotation Toolbar */}
      {isAnnotating && (
        <View style={styles.toolbar}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {/* Tool Selection */}
            <View style={styles.toolGroup}>
              {(['highlight', 'note', 'underline', 'strikethrough', 'drawing'] as const).map((tool) => (
                <TouchableOpacity
                  key={tool}
                  style={[
                    styles.toolButton,
                    selectedTool === tool && styles.toolButtonActive,
                  ]}
                  onPress={() => setSelectedTool(tool)}
                >
                  <MaterialIcons
                    name={
                      tool === 'highlight' ? 'highlight' :
                      tool === 'note' ? 'note-add' :
                      tool === 'underline' ? 'format-underlined' :
                      tool === 'strikethrough' ? 'strikethrough-s' :
                      'brush'
                    }
                    size={18}
                    color={selectedTool === tool ? "#FFFFFF" : "#374151"}
                  />
                </TouchableOpacity>
              ))}
            </View>

            {/* Color Selection */}
            <View style={styles.colorGroup}>
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
      )}

      {/* Document Viewer */}
      <View style={styles.documentContainer} {...panResponder.panHandlers}>
        <WebView
          ref={webViewRef}
          source={{ 
            uri: getDocumentUrl(),
            headers: actualDocumentType === 'image' ? {
              'Cache-Control': 'no-cache, no-store, must-revalidate',
              'Pragma': 'no-cache',
              'Expires': '0'
            } : undefined
          }}
          style={styles.webView}
          onLoadStart={() => {
            setIsLoading(true);
            const currentUrl = getDocumentUrl();
            console.log('Loading document:', documentUri);
            console.log('Document type:', actualDocumentType);
            console.log('WebView URL:', currentUrl);
            console.log('useAlternativeViewer:', useAlternativeViewer);
            console.log('Platform:', Platform.OS);
          }}
          onLoadEnd={() => {
            setIsLoading(false);
            console.log('Document loaded successfully');
            console.log('Final loaded URL:', getDocumentUrl());
            
            // For images, set total pages to 1 immediately
            if (actualDocumentType === 'image') {
              setTotalPages(1);
              setCurrentPage(1);
              return;
            }
            
            // Inject JavaScript to get document info for other types
            webViewRef.current?.injectJavaScript(`
              (function() {
                try {
                  console.log('WebView: Checking document info');
                  console.log('WebView: Current URL:', window.location.href);
                  console.log('WebView: Document title:', document.title);
                  console.log('WebView: Document body:', document.body ? document.body.innerHTML.substring(0, 200) : 'No body');
                  
                  // For PDF.js viewer
                  if (window.PDFViewerApplication && window.PDFViewerApplication.pdfDocument) {
                    const numPages = window.PDFViewerApplication.pdfDocument.numPages;
                    const currentPage = window.PDFViewerApplication.page;
                    window.ReactNativeWebView.postMessage(JSON.stringify({
                      type: 'documentInfo',
                      totalPages: numPages,
                      currentPage: currentPage
                    }));
                    console.log('WebView: PDF.js detected, pages:', numPages);
                  }
                  // For other viewers, try to get page info
                  else if (document.querySelector('.page')) {
                    const pages = document.querySelectorAll('.page').length;
                    window.ReactNativeWebView.postMessage(JSON.stringify({
                      type: 'documentInfo',
                      totalPages: pages || 1,
                      currentPage: 1
                    }));
                    console.log('WebView: Pages detected:', pages);
                  }
                  // Check for error messages
                  else if (document.body && document.body.textContent) {
                    const content = document.body.textContent.toLowerCase();
                    if (content.includes('error') || content.includes('not found') || content.includes('preview not available')) {
                      window.ReactNativeWebView.postMessage(JSON.stringify({
                        type: 'error',
                        message: document.body.textContent.substring(0, 500)
                      }));
                      console.log('WebView: Error detected in content');
                    } else {
                      window.ReactNativeWebView.postMessage(JSON.stringify({
                        type: 'documentInfo',
                        totalPages: 1,
                        currentPage: 1
                      }));
                      console.log('WebView: Default document info set');
                    }
                  }
                  // Default fallback
                  else {
                    window.ReactNativeWebView.postMessage(JSON.stringify({
                      type: 'documentInfo',
                      totalPages: 1,
                      currentPage: 1
                    }));
                    console.log('WebView: Fallback document info set');
                  }
                } catch (e) {
                  console.log('WebView: Error in JavaScript:', e.message);
                  window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: 'error',
                    message: 'JavaScript execution failed: ' + e.message
                  }));
                }
              })();
            `);
          }}
          onMessage={(event) => {
            try {
              const data = JSON.parse(event.nativeEvent.data);
              console.log('Message from WebView:', data);
              
              if (data.type === 'documentInfo') {
                setTotalPages(data.totalPages || 1);
                setCurrentPage(data.currentPage || 1);
                console.log('Document info updated:', data);
              } else if (data.type === 'error') {
                console.warn('WebView reported error:', data.message);
                // Set error state if the error seems critical
                if (data.message.toLowerCase().includes('preview not available') || 
                    data.message.toLowerCase().includes('not found')) {
                  setHasError(true);
                }
              }
            } catch (e) {
              console.log('Failed to parse message:', e);
            }
          }}
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          javaScriptEnabled
          domStorageEnabled
          scalesPageToFit={actualDocumentType === 'image'}
          startInLoadingState
          mixedContentMode="compatibility"
          allowFileAccess={true}
          allowFileAccessFromFileURLs={true}
          allowUniversalAccessFromFileURLs={true}
          renderLoading={() => (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#6366F1" />
              <Text style={styles.loadingText}>Loading {actualDocumentType}...</Text>
            </View>
          )}
          onError={(syntheticEvent) => {
            const { nativeEvent } = syntheticEvent;
            console.warn('WebView error: ', nativeEvent);
            setIsLoading(false);
            setHasError(true);
            
            // Try alternative viewer if not already tried
            if (!useAlternativeViewer) {
              Alert.alert(
                'Document Viewer Error',
                'The document failed to load with the current viewer. Would you like to try an alternative viewer?',
                [
                  { text: 'Cancel', style: 'cancel' },
                  { 
                    text: 'Try Alternative Viewer', 
                    onPress: () => {
                      setUseAlternativeViewer(true);
                      setHasError(false);
                      setIsLoading(true);
                      // Force WebView to reload with new URL
                      setTimeout(() => {
                        webViewRef.current?.reload();
                      }, 100);
                    }
                  },
                  { text: 'Open in Browser', onPress: openInExternalBrowser }
                ]
              );
            } else {
              Alert.alert(
                'Document Loading Error',
                'Failed to load the document in any available viewer. This might happen if the document format is not supported or there are network connectivity issues.',
                [
                  { text: 'OK', style: 'cancel' },
                  { text: 'Open in Browser', onPress: openInExternalBrowser }
                ]
              );
            }
          }}
          onHttpError={(syntheticEvent) => {
            const { nativeEvent } = syntheticEvent;
            console.warn('WebView HTTP error: ', nativeEvent);
            setIsLoading(false);
            if (nativeEvent.statusCode >= 400) {
              setHasError(true);
            }
          }}
        />
        
        {/* Annotation Overlay */}
        {renderAnnotationOverlay()}
        
        {/* Loading Indicator */}
        {isLoading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#6366F1" />
            <Text style={styles.loadingText}>Loading document...</Text>
          </View>
        )}
        
        {/* Error State */}
        {hasError && !isLoading && (
          <View style={styles.errorContainer}>
            <MaterialIcons name="error-outline" size={64} color="#EF4444" />
            <Text style={styles.errorTitle}>Failed to Load Document</Text>
            <Text style={styles.errorMessage}>
              The document viewer couldn't load this file. This might happen with certain file formats or corrupted files.
            </Text>
            <TouchableOpacity
              style={styles.retryButton}
              onPress={() => {
                setHasError(false);
                setIsLoading(true);
                webViewRef.current?.reload();
              }}
            >
              <Text style={styles.retryButtonText}>Try Again</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.openExternalButton}
              onPress={openInExternalBrowser}
            >
              <MaterialIcons name="open-in-new" size={20} color="#6366F1" />
              <Text style={styles.openExternalText}>Open in Browser</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Page Navigation */}
      <View style={styles.pageNavigation}>
        <TouchableOpacity
          style={[styles.navButton, currentPage === 1 && styles.navButtonDisabled]}
          onPress={() => {
            if (currentPage > 1) {
              setCurrentPage(currentPage - 1);
            }
          }}
          disabled={currentPage === 1}
        >
          <MaterialIcons 
            name="chevron-left" 
            size={24} 
            color={currentPage === 1 ? "#D1D5DB" : "#6366F1"} 
          />
        </TouchableOpacity>

        <Text style={styles.pageText}>
          {currentPage} / {totalPages}
        </Text>

        <TouchableOpacity
          style={[styles.navButton, currentPage === totalPages && styles.navButtonDisabled]}
          onPress={() => {
            if (currentPage < totalPages) {
              setCurrentPage(currentPage + 1);
            }
          }}
          disabled={currentPage === totalPages}
        >
          <MaterialIcons 
            name="chevron-right" 
            size={24} 
            color={currentPage === totalPages ? "#D1D5DB" : "#6366F1"} 
          />
        </TouchableOpacity>
      </View>

      {/* Note Input Modal */}
      <Modal
        visible={showNoteModal}
        animationType="slide"
        presentationStyle="formSheet"
        onRequestClose={() => setShowNoteModal(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Add Note</Text>
            <TouchableOpacity
              onPress={() => setShowNoteModal(false)}
              style={styles.modalCloseButton}
            >
              <MaterialIcons name="close" size={24} color="#6B7280" />
            </TouchableOpacity>
          </View>
          
          <View style={styles.modalContent}>
            <TextInput
              style={styles.noteInput}
              value={noteText}
              onChangeText={setNoteText}
              placeholder="Enter your note here..."
              multiline
              numberOfLines={6}
              autoFocus
            />
          </View>
          
          <View style={styles.modalFooter}>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => setShowNoteModal(false)}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.saveButton, !noteText.trim() && styles.saveButtonDisabled]}
              onPress={handleSaveNote}
              disabled={!noteText.trim()}
            >
              <Text style={styles.saveButtonText}>Save Note</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    paddingTop: Platform.OS === 'ios' ? 50 : 20,
  },
  closeButton: {
    padding: 8,
    marginRight: 8,
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontFamily: 'Inter-Bold',
    color: '#1F2937',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  pageInfo: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    color: '#6B7280',
  },
  annotateButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#6366F1',
  },
  externalButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  switchViewerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 4,
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  switchViewerText: {
    fontSize: 10,
    fontFamily: 'Inter-Medium',
    color: '#6366F1',
    marginLeft: 4,
  },
  debugButton: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 4,
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#F59E0B',
  },
  annotateButtonActive: {
    backgroundColor: '#6366F1',
  },
  toolbar: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  toolGroup: {
    flexDirection: 'row',
    marginRight: 20,
    gap: 8,
  },
  toolButton: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  toolButtonActive: {
    backgroundColor: '#6366F1',
  },
  colorGroup: {
    flexDirection: 'row',
    gap: 8,
  },
  colorButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  colorButtonActive: {
    borderColor: '#374151',
    borderWidth: 3,
  },
  documentContainer: {
    flex: 1,
    position: 'relative',
  },
  webView: {
    flex: 1,
  },
  loadingContainer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    fontFamily: 'Inter-Medium',
    color: '#6B7280',
  },
  pageNavigation: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    gap: 20,
  },
  navButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  navButtonDisabled: {
    backgroundColor: '#F3F4F6',
  },
  pageText: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
    color: '#374151',
    minWidth: 80,
    textAlign: 'center',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    paddingTop: Platform.OS === 'ios' ? 50 : 20,
  },
  modalTitle: {
    fontSize: 18,
    fontFamily: 'Inter-Bold',
    color: '#1F2937',
  },
  modalCloseButton: {
    padding: 4,
  },
  modalContent: {
    flex: 1,
    padding: 20,
  },
  noteInput: {
    flex: 1,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    padding: 16,
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    textAlignVertical: 'top',
    color: '#374151',
  },
  modalFooter: {
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
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
  },
  cancelButtonText: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
    color: '#374151',
  },
  saveButton: {
    flex: 2,
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: '#6366F1',
  },
  saveButtonDisabled: {
    backgroundColor: '#D1D5DB',
  },
  saveButtonText: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
    color: '#FFFFFF',
  },
  errorContainer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  errorTitle: {
    fontSize: 20,
    fontFamily: 'Inter-Bold',
    color: '#1F2937',
    marginTop: 16,
    marginBottom: 8,
  },
  errorMessage: {
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 24,
  },
  retryButton: {
    backgroundColor: '#6366F1',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  retryButtonText: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
    color: '#FFFFFF',
  },
  openExternalButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
  },
  openExternalText: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
    color: '#6366F1',
    marginLeft: 8,
  },
});
