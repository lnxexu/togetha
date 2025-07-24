import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  Modal,
  Alert,
  ScrollView,
  TextInput,
  Platform,
  StatusBar,
  Animated,
} from "react-native";
import { WebView } from 'react-native-webview';
import { MaterialIcons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Navbar from "../NavBar";

const { RichEditor, RichToolbar } = require("react-native-pell-rich-editor");

const { width, height } = Dimensions.get("window");

interface PDFAnnotation {
  id: string;
  type: "highlight" | "note" | "underline" | "strikethrough";
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  text?: string;
  note?: string;
}

interface PDFDocument {
  uri: string;
  name: string;
  annotations: PDFAnnotation[];
  notes: string;
  totalPages?: number;
}

interface SelectionArea {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  page: number;
}

const HIGHLIGHT_COLORS = [
  "#FFEB3B", // Yellow
  "#4CAF50", // Green
  "#2196F3", // Blue
  "#FF9800", // Orange
  "#E91E63", // Pink
  "#9C27B0", // Purple
];

const annotationColors = HIGHLIGHT_COLORS;

const ImportPDFPage = () => {
  const [pdfDocument, setPdfDocument] = useState<PDFDocument | null>(null);
  const [selectedAnnotationType, setSelectedAnnotationType] = useState<"highlight" | "note" | "underline" | "strikethrough">("highlight");
  const [selectedColor, setSelectedColor] = useState(HIGHLIGHT_COLORS[0]);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showNotesModal, setShowNotesModal] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [annotations, setAnnotations] = useState<PDFAnnotation[]>([]);
  const [pdfNotes, setPdfNotes] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [webViewHeight, setWebViewHeight] = useState(0);
  const [showFloatingToolbar, setShowFloatingToolbar] = useState(true);
  const [pendingAnnotation, setPendingAnnotation] = useState<Partial<PDFAnnotation> | null>(null);

  // Animation values for floating toolbar
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;

  // Animate floating toolbar
  useEffect(() => {
    if (showFloatingToolbar) {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: -50,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [showFloatingToolbar]);
  
  const webViewRef = useRef<WebView>(null);
  const richTextRef = useRef<any>(null);

  // Load saved data on component mount
  useEffect(() => {
    loadSavedData();
  }, []);

  // Load PDF when document changes
  useEffect(() => {
    if (pdfDocument && webViewRef.current) {
      loadPDFInWebView();
    }
  }, [pdfDocument]);

  const loadPDFInWebView = async () => {
    if (!pdfDocument || !webViewRef.current) return;
    
    try {
      // Read PDF file as base64
      const base64 = await FileSystem.readAsStringAsync(pdfDocument.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      
      // Create data URL
      const dataUrl = `data:application/pdf;base64,${base64}`;
      
      // Send to WebView
      webViewRef.current.postMessage(JSON.stringify({
        type: 'loadPDF',
        dataUrl: dataUrl
      }));
    } catch (error) {
      console.error('Error loading PDF in WebView:', error);
      Alert.alert('Error', 'Failed to load PDF in viewer');
    }
  };

  const loadSavedData = async () => {
    try {
      const savedDocument = await AsyncStorage.getItem("currentPdfDocument");
      if (savedDocument) {
        const parsedDocument = JSON.parse(savedDocument);
        setPdfDocument(parsedDocument);
        setAnnotations(parsedDocument.annotations || []);
        setPdfNotes(parsedDocument.notes || "");
        setTotalPages(parsedDocument.totalPages || 0);
      }
    } catch (error) {
      console.error("Error loading saved data:", error);
    }
  };

  const saveData = async (document: PDFDocument) => {
    try {
      await AsyncStorage.setItem("currentPdfDocument", JSON.stringify(document));
    } catch (error) {
      console.error("Error saving data:", error);
    }
  };

  const handleImportPDF = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "application/pdf",
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        
        // Copy to a permanent location
        const documentsDir = FileSystem.documentDirectory + 'pdfs/';
        await FileSystem.makeDirectoryAsync(documentsDir, { intermediates: true });
        const permanentUri = documentsDir + asset.name;
        await FileSystem.copyAsync({ from: asset.uri, to: permanentUri });
        
        // Create a new PDF document object
        const newDocument: PDFDocument = {
          uri: permanentUri,
          name: asset.name,
          annotations: [],
          notes: "",
        };

        setPdfDocument(newDocument);
        setAnnotations([]);
        setPdfNotes("");
        setCurrentPage(1);
        await saveData(newDocument);
      }
    } catch (error) {
      console.error("Error importing PDF:", error);
      Alert.alert("Error", "Failed to import PDF document");
    }
  };

  const handleAnnotation = (type: string) => {
    setSelectedAnnotationType(type as any);
    
    // Send message to WebView to enable annotation mode
    if (webViewRef.current) {
      webViewRef.current.postMessage(JSON.stringify({
        type: 'setAnnotationMode',
        annotationType: type,
        color: selectedColor
      }));
    }

    Alert.alert(
      "Annotation Mode",
      `${type.charAt(0).toUpperCase() + type.slice(1)} mode enabled. Drag to select text area in the PDF.`,
      [
        { text: "OK" }
      ]
    );
  };

  const createAnnotation = async (annotationData: PDFAnnotation) => {
    const updatedAnnotations = [...annotations, annotationData];
    setAnnotations(updatedAnnotations);

    if (pdfDocument) {
      const updatedDocument = {
        ...pdfDocument,
        annotations: updatedAnnotations,
      };
      setPdfDocument(updatedDocument);
      await saveData(updatedDocument);
    }
  };

  const onWebViewMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      
      switch (data.type) {
        case 'pdfLoaded':
          setTotalPages(data.totalPages);
          if (pdfDocument) {
            const updatedDocument = {
              ...pdfDocument,
              totalPages: data.totalPages,
            };
            setPdfDocument(updatedDocument);
            saveData(updatedDocument);
            
            // Send existing annotations to WebView
            webViewRef.current?.postMessage(JSON.stringify({
              type: 'loadAnnotations',
              annotations: annotations
            }));
          }
          break;
          
        case 'pageChanged':
          setCurrentPage(data.page);
          break;
          
        case 'annotationCreated':
          if (data.annotation.type === 'note') {
            // For notes, store temporarily and open modal
            setPendingAnnotation(data.annotation);
            setNoteText("");
            setShowNotesModal(true);
          } else {
            // For other annotations, create directly
            const newAnnotation: PDFAnnotation = {
              ...data.annotation,
              id: Date.now().toString() + Math.random().toString(36).substring(2),
              color: selectedColor,
            };
            createAnnotation(newAnnotation);
          }
          break;
          
        case 'selectionComplete':
          // Handle text selection completion
          console.log('Selection complete:', data);
          break;
      }
    } catch (error) {
      console.error('Error processing WebView message:', error);
    }
  };

  const saveNote = async () => {
    if (pendingAnnotation && noteText.trim()) {
      // Create the note annotation with the entered text
      const newAnnotation: PDFAnnotation = {
        ...pendingAnnotation as PDFAnnotation,
        id: Date.now().toString() + Math.random().toString(36).substring(2),
        color: selectedColor,
        note: noteText.trim(),
      };
      await createAnnotation(newAnnotation);
      setPendingAnnotation(null);
    }
    setShowNotesModal(false);
    setNoteText("");
  };

  const deleteAnnotation = async (annotationId: string) => {
    const updatedAnnotations = annotations.filter(ann => ann.id !== annotationId);
    setAnnotations(updatedAnnotations);

    if (pdfDocument) {
      const updatedDocument = {
        ...pdfDocument,
        annotations: updatedAnnotations,
      };
      setPdfDocument(updatedDocument);
      await saveData(updatedDocument);
    }
  };

  if (!pdfDocument) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />
        
        <View style={styles.header}>
          <Text style={styles.headerTitle}>PDF Viewer</Text>
          <Text style={styles.headerSubtitle}>Import and annotate PDF documents</Text>
        </View>

        <View style={styles.importContainer}>
          <MaterialIcons name="picture-as-pdf" size={80} color="#FF5722" />
          <Text style={styles.instructions}>Import a PDF to get started</Text>
          <Text style={styles.subInstructions}>
            You can highlight, annotate, and take notes on your PDF documents
          </Text>
          
          <TouchableOpacity style={styles.importButton} onPress={handleImportPDF}>
            <MaterialIcons name="cloud-upload" size={24} color="#FFFFFF" />
            <Text style={styles.importButtonText}>Import PDF</Text>
          </TouchableOpacity>
        </View>

        <Navbar activeRoute="PDFs" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />
      
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {pdfDocument.name}
          </Text>
          <Text style={styles.annotationCount}>
            {annotations.length} annotations • Page {currentPage} of {totalPages}
          </Text>
        </View>
        
        <View style={styles.headerActions}>
          <TouchableOpacity 
            style={styles.headerButton} 
            onPress={() => setShowNotesModal(true)}
          >
            <MaterialIcons name="note-add" size={24} color="#6A009C" />
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={styles.headerButton} 
            onPress={() => setShowFloatingToolbar(!showFloatingToolbar)}
          >
            <MaterialIcons name="edit" size={24} color="#6A009C" />
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={styles.headerButton} 
            onPress={handleImportPDF}
          >
            <MaterialIcons name="folder-open" size={24} color="#6A009C" />
          </TouchableOpacity>
        </View>
      </View>

      {/* PDF Viewer with WebView + PDF.js */}
      <View 
        style={styles.pdfContainer}
        onLayout={(event) => {
          setWebViewHeight(event.nativeEvent.layout.height);
        }}
      >
        <WebView
          ref={webViewRef}
          source={{
            html: `
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="UTF-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <title>PDF Viewer</title>
              <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
              <style>
                body { margin: 0; padding: 0; background: #f5f5f5; user-select: none; }
                #canvas-container { display: flex; justify-content: center; padding: 20px; position: relative; }
                #pdf-canvas { max-width: 100%; background: white; box-shadow: 0 4px 12px rgba(0,0,0,0.15); border-radius: 8px; cursor: crosshair; }
                #controls { position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); 
                           display: flex; gap: 12px; background: rgba(255,255,255,0.95); padding: 12px 16px; 
                           border-radius: 20px; box-shadow: 0 4px 16px rgba(0,0,0,0.1); z-index: 1000; }
                #controls button { background: #6A009C; color: white; border: none; border-radius: 8px; 
                                  padding: 8px 12px; cursor: pointer; font-size: 14px; }
                #controls button:disabled { background: #ccc; cursor: not-allowed; }
                #page-info { font-size: 14px; color: #333; font-weight: 500; min-width: 80px; text-align: center; 
                            display: flex; align-items: center; }
                .annotation-overlay { position: absolute; pointer-events: none; z-index: 10; border: 2px solid; border-radius: 3px; }
                .selection-box { position: absolute; border: 2px dashed #6A009C; background: rgba(106, 0, 156, 0.1); 
                               pointer-events: none; z-index: 5; border-radius: 3px; }
                .annotation-highlight { background-color: rgba(255, 235, 59, 0.4); }
                .annotation-underline { border-bottom: 3px solid; }
                .annotation-strikethrough { position: relative; }
                .annotation-strikethrough:after { content: ''; position: absolute; top: 50%; left: 0; right: 0; 
                                                 height: 2px; background-color: currentColor; }
                .annotation-note { background: rgba(33, 150, 243, 0.2); border: 2px solid #2196F3; }
                #annotation-tooltip { position: absolute; background: white; border: 1px solid #ccc; border-radius: 4px; 
                                    padding: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.15); z-index: 1001; 
                                    font-size: 12px; max-width: 200px; display: none; }
              </style>
            </head>
            <body>
              <div id="canvas-container">
                <canvas id="pdf-canvas"></canvas>
                <div id="annotation-tooltip"></div>
              </div>
              <div id="controls">
                <button id="prev-page">‹ Prev</button>
                <span id="page-info">1 / 1</span>
                <button id="next-page">Next ›</button>
              </div>
              <script>
                pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
                
                let pdfDoc = null;
                let pageNum = 1;
                let scale = 1.2;
                let canvas = document.getElementById('pdf-canvas');
                let ctx = canvas.getContext('2d');
                let annotations = [];
                let isSelecting = false;
                let selectionStart = null;
                let selectionEnd = null;
                let currentAnnotationType = 'highlight';
                let currentColor = '#FFEB3B';
                let selectionBox = null;
                
                function renderPage(num) {
                  if (!pdfDoc) return;
                  pdfDoc.getPage(num).then(function(page) {
                    const viewport = page.getViewport({ scale: scale });
                    canvas.height = viewport.height;
                    canvas.width = viewport.width;
                    
                    const renderContext = {
                      canvasContext: ctx,
                      viewport: viewport
                    };
                    
                    page.render(renderContext).promise.then(function() {
                      document.getElementById('page-info').textContent = num + ' / ' + pdfDoc.numPages;
                      document.getElementById('prev-page').disabled = (num <= 1);
                      document.getElementById('next-page').disabled = (num >= pdfDoc.numPages);
                      
                      // Re-render annotations for current page
                      renderAnnotations();
                      
                      if (window.ReactNativeWebView) {
                        window.ReactNativeWebView.postMessage(JSON.stringify({
                          type: 'pageChanged',
                          page: num,
                          totalPages: pdfDoc.numPages
                        }));
                      }
                    });
                  });
                }
                
                function renderAnnotations() {
                  // Clear existing annotation overlays
                  const existingOverlays = document.querySelectorAll('.annotation-overlay');
                  existingOverlays.forEach(overlay => overlay.remove());
                  
                  // Render annotations for current page
                  const pageAnnotations = annotations.filter(ann => ann.page === pageNum);
                  pageAnnotations.forEach(annotation => {
                    createAnnotationOverlay(annotation);
                  });
                }
                
                function createAnnotationOverlay(annotation) {
                  const overlay = document.createElement('div');
                  overlay.className = 'annotation-overlay annotation-' + annotation.type;
                  overlay.style.left = annotation.x + 'px';
                  overlay.style.top = annotation.y + 'px';
                  overlay.style.width = annotation.width + 'px';
                  overlay.style.height = annotation.height + 'px';
                  overlay.style.borderColor = annotation.color;
                  overlay.style.backgroundColor = annotation.type === 'highlight' ? annotation.color + '40' : 'transparent';
                  
                  if (annotation.note) {
                    overlay.title = annotation.note;
                    overlay.style.cursor = 'pointer';
                    overlay.onclick = function() {
                      showAnnotationTooltip(annotation, overlay);
                    };
                  }
                  
                  document.getElementById('canvas-container').appendChild(overlay);
                }
                
                function showAnnotationTooltip(annotation, element) {
                  const tooltip = document.getElementById('annotation-tooltip');
                  tooltip.innerHTML = '<strong>' + annotation.type.toUpperCase() + '</strong><br>' + (annotation.note || 'No note');
                  tooltip.style.display = 'block';
                  tooltip.style.left = (element.offsetLeft + element.offsetWidth + 5) + 'px';
                  tooltip.style.top = element.offsetTop + 'px';
                  
                  setTimeout(() => {
                    tooltip.style.display = 'none';
                  }, 3000);
                }
                
                // Mouse events for selection
                canvas.addEventListener('mousedown', function(e) {
                  if (!isSelecting) return;
                  
                  const rect = canvas.getBoundingClientRect();
                  selectionStart = {
                    x: e.clientX - rect.left,
                    y: e.clientY - rect.top
                  };
                  
                  // Create selection box
                  selectionBox = document.createElement('div');
                  selectionBox.className = 'selection-box';
                  selectionBox.style.left = selectionStart.x + 'px';
                  selectionBox.style.top = selectionStart.y + 'px';
                  selectionBox.style.width = '0px';
                  selectionBox.style.height = '0px';
                  document.getElementById('canvas-container').appendChild(selectionBox);
                });
                
                canvas.addEventListener('mousemove', function(e) {
                  if (!isSelecting || !selectionStart || !selectionBox) return;
                  
                  const rect = canvas.getBoundingClientRect();
                  const currentX = e.clientX - rect.left;
                  const currentY = e.clientY - rect.top;
                  
                  const left = Math.min(selectionStart.x, currentX);
                  const top = Math.min(selectionStart.y, currentY);
                  const width = Math.abs(currentX - selectionStart.x);
                  const height = Math.abs(currentY - selectionStart.y);
                  
                  selectionBox.style.left = left + 'px';
                  selectionBox.style.top = top + 'px';
                  selectionBox.style.width = width + 'px';
                  selectionBox.style.height = height + 'px';
                });
                
                canvas.addEventListener('mouseup', function(e) {
                  if (!isSelecting || !selectionStart || !selectionBox) return;
                  
                  const rect = canvas.getBoundingClientRect();
                  selectionEnd = {
                    x: e.clientX - rect.left,
                    y: e.clientY - rect.top
                  };
                  
                  // Calculate selection bounds
                  const left = Math.min(selectionStart.x, selectionEnd.x);
                  const top = Math.min(selectionStart.y, selectionEnd.y);
                  const width = Math.abs(selectionEnd.x - selectionStart.x);
                  const height = Math.abs(selectionEnd.y - selectionStart.y);
                  
                  // Only create annotation if selection is meaningful (> 5px in both dimensions)
                  if (width > 5 && height > 5) {
                    const annotation = {
                      type: currentAnnotationType,
                      page: pageNum,
                      x: left,
                      y: top,
                      width: width,
                      height: height,
                      color: currentColor,
                      timestamp: Date.now()
                    };
                    
                    if (window.ReactNativeWebView) {
                      window.ReactNativeWebView.postMessage(JSON.stringify({
                        type: 'annotationCreated',
                        annotation: annotation
                      }));
                    }
                  }
                  
                  // Clean up
                  if (selectionBox) {
                    selectionBox.remove();
                    selectionBox = null;
                  }
                  selectionStart = null;
                  selectionEnd = null;
                  isSelecting = false;
                  canvas.style.cursor = 'default';
                });
                
                function onPrevPage() {
                  if (pageNum <= 1) return;
                  pageNum--;
                  renderPage(pageNum);
                }
                
                function onNextPage() {
                  if (pageNum >= pdfDoc.numPages) return;
                  pageNum++;
                  renderPage(pageNum);
                }
                
                // Event listeners
                document.getElementById('prev-page').addEventListener('click', onPrevPage);
                document.getElementById('next-page').addEventListener('click', onNextPage);
                
                // Load PDF from data URL
                function loadPDF(dataUrl) {
                  pdfjsLib.getDocument(dataUrl).promise.then(function(pdfDoc_) {
                    pdfDoc = pdfDoc_;
                    
                    if (window.ReactNativeWebView) {
                      window.ReactNativeWebView.postMessage(JSON.stringify({
                        type: 'pdfLoaded',
                        totalPages: pdfDoc.numPages
                      }));
                    }
                    
                    renderPage(pageNum);
                  }).catch(function(error) {
                    console.error('Error loading PDF:', error);
                  });
                }
                
                // Listen for messages from React Native
                window.addEventListener('message', function(event) {
                  const data = JSON.parse(event.data);
                  
                  switch (data.type) {
                    case 'loadPDF':
                      loadPDF(data.dataUrl);
                      break;
                    case 'setAnnotationMode':
                      isSelecting = true;
                      currentAnnotationType = data.annotationType;
                      currentColor = data.color;
                      canvas.style.cursor = 'crosshair';
                      break;
                    case 'disableAnnotationMode':
                      isSelecting = false;
                      canvas.style.cursor = 'default';
                      break;
                    case 'goToPage':
                      pageNum = data.page;
                      renderPage(pageNum);
                      break;
                    case 'loadAnnotations':
                      annotations = data.annotations || [];
                      renderAnnotations();
                      break;
                  }
                });
              </script>
            </body>
            </html>
            `
          }}
          style={styles.webView}
          onMessage={onWebViewMessage}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          startInLoadingState={true}
          scalesPageToFit={false}
          showsVerticalScrollIndicator={false}
          showsHorizontalScrollIndicator={false}
          renderLoading={() => (
            <View style={styles.webViewLoading}>
              <MaterialIcons name="picture-as-pdf" size={60} color="#FF5722" />
              <Text style={styles.webViewLoadingText}>Loading PDF...</Text>
            </View>
          )}
        />

        {/* Floating Annotation Toolbar */}
        {showFloatingToolbar && (
          <Animated.View 
            style={[
              styles.floatingToolbar,
              { 
                opacity: fadeAnim,
                transform: [{ translateY: slideAnim }]
              }
            ]}
          >
            <ScrollView 
              horizontal 
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.floatingToolbarContent}
            >
              {/* Annotation Type Buttons */}
              <TouchableOpacity
                style={[
                  styles.floatingToolButton,
                  selectedAnnotationType === 'highlight' && styles.floatingToolButtonActive
                ]}
                onPress={() => handleAnnotation('highlight')}
              >
                <MaterialIcons 
                  name="highlight" 
                  size={18} 
                  color={selectedAnnotationType === 'highlight' ? '#FFF' : '#6A009C'} 
                />
                <Text style={[
                  styles.floatingToolButtonText,
                  selectedAnnotationType === 'highlight' && styles.floatingToolButtonTextActive
                ]}>Highlight</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.floatingToolButton,
                  selectedAnnotationType === 'underline' && styles.floatingToolButtonActive
                ]}
                onPress={() => handleAnnotation('underline')}
              >
                <MaterialIcons 
                  name="format-underlined" 
                  size={18} 
                  color={selectedAnnotationType === 'underline' ? '#FFF' : '#6A009C'} 
                />
                <Text style={[
                  styles.floatingToolButtonText,
                  selectedAnnotationType === 'underline' && styles.floatingToolButtonTextActive
                ]}>Underline</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.floatingToolButton,
                  selectedAnnotationType === 'strikethrough' && styles.floatingToolButtonActive
                ]}
                onPress={() => handleAnnotation('strikethrough')}
              >
                <MaterialIcons 
                  name="strikethrough-s" 
                  size={18} 
                  color={selectedAnnotationType === 'strikethrough' ? '#FFF' : '#6A009C'} 
                />
                <Text style={[
                  styles.floatingToolButtonText,
                  selectedAnnotationType === 'strikethrough' && styles.floatingToolButtonTextActive
                ]}>Strike</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.floatingToolButton,
                  selectedAnnotationType === 'note' && styles.floatingToolButtonActive
                ]}
                onPress={() => handleAnnotation('note')}
              >
                <MaterialIcons 
                  name="note-add" 
                  size={18} 
                  color={selectedAnnotationType === 'note' ? '#FFF' : '#6A009C'} 
                />
                <Text style={[
                  styles.floatingToolButtonText,
                  selectedAnnotationType === 'note' && styles.floatingToolButtonTextActive
                ]}>Note</Text>
              </TouchableOpacity>

              {/* Color Picker */}
              <TouchableOpacity 
                style={styles.floatingColorButton}
                onPress={() => setShowColorPicker(!showColorPicker)}
              >
                <View style={[styles.colorPreview, { backgroundColor: selectedColor }]} />
                <Text style={styles.floatingToolButtonText}>Color</Text>
              </TouchableOpacity>

              {/* Clear Button */}
              <TouchableOpacity
                style={styles.floatingClearButton}
                onPress={() => {
                  setAnnotations([]);
                  if (pdfDocument) {
                    const updatedDocument = { ...pdfDocument, annotations: [] };
                    setPdfDocument(updatedDocument);
                    saveData(updatedDocument);
                  }
                }}
              >
                <MaterialIcons name="clear-all" size={18} color="#FF5252" />
                <Text style={styles.floatingClearButtonText}>Clear</Text>
              </TouchableOpacity>
            </ScrollView>

            {/* Color Picker Overlay */}
            {showColorPicker && (
              <View style={styles.floatingColorPicker}>
                {annotationColors.map((color) => (
                  <TouchableOpacity
                    key={color}
                    style={[
                      styles.colorOption,
                      { backgroundColor: color },
                      selectedColor === color && styles.selectedColorOption
                    ]}
                    onPress={() => {
                      setSelectedColor(color);
                      setShowColorPicker(false);
                    }}
                  />
                ))}
              </View>
            )}
          </Animated.View>
        )}
      </View>

      {/* Page Navigation */}
      <View style={styles.pageNavigation}>
        <TouchableOpacity 
          style={[styles.navButton, currentPage === 1 && styles.navButtonDisabled]}
          onPress={() => {
            if (currentPage > 1 && webViewRef.current) {
              const newPage = currentPage - 1;
              webViewRef.current.postMessage(JSON.stringify({
                type: 'goToPage',
                page: newPage
              }));
            }
          }}
          disabled={currentPage === 1}
        >
          <MaterialIcons name="chevron-left" size={24} color={currentPage === 1 ? "#CCC" : "#6A009C"} />
        </TouchableOpacity>
        
        <Text style={styles.pageInfo}>{currentPage} / {totalPages}</Text>
        
        <TouchableOpacity 
          style={[styles.navButton, currentPage === totalPages && styles.navButtonDisabled]}
          onPress={() => {
            if (currentPage < totalPages && webViewRef.current) {
              const newPage = currentPage + 1;
              webViewRef.current.postMessage(JSON.stringify({
                type: 'goToPage',
                page: newPage
              }));
            }
          }}
          disabled={currentPage === totalPages}
        >
          <MaterialIcons name="chevron-right" size={24} color={currentPage === totalPages ? "#CCC" : "#6A009C"} />
        </TouchableOpacity>
      </View>

      {/* Notes Modal */}
      <Modal
        visible={showNotesModal}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>PDF Notes</Text>
            <TouchableOpacity 
              style={styles.closeButton}
              onPress={() => {
                setShowNotesModal(false);
                setNoteText("");
              }}
            >
              <MaterialIcons name="close" size={24} color="#666" />
            </TouchableOpacity>
          </View>

          <View style={styles.modalContent}>
            <RichEditor
              ref={richTextRef}
              style={styles.richEditor}
              initialContentHTML={pdfNotes}
              onChange={(notes: string) => {
                setPdfNotes(notes);
                if (pdfDocument) {
                  const updatedDocument = {
                    ...pdfDocument,
                    notes,
                  };
                  setPdfDocument(updatedDocument);
                  saveData(updatedDocument);
                }
              }}
              placeholder="Take notes about this PDF document..."
            />
          </View>

          <RichToolbar
            style={styles.richToolbar}
            editor={richTextRef}
            selectedIconTint="#6A009C"
            disabledIconTint="#666"
            actions={[
              "bold",
              "italic",
              "underline",
              "strikethrough",
              "heading1",
              "heading2",
              "unorderedList",
              "orderedList",
              "insertLink",
              "foreColor",
              "hiliteColor",
            ]}
            iconMap={{
              bold: () => <MaterialIcons name="format-bold" size={20} />,
              italic: () => <MaterialIcons name="format-italic" size={20} />,
              underline: () => <MaterialIcons name="format-underlined" size={20} />,
              strikethrough: () => <MaterialIcons name="strikethrough-s" size={20} />,
              heading1: () => <Text style={styles.headingText}>H1</Text>,
              heading2: () => <Text style={styles.headingText}>H2</Text>,
              unorderedList: () => <MaterialIcons name="format-list-bulleted" size={20} />,
              orderedList: () => <MaterialIcons name="format-list-numbered" size={20} />,
              insertLink: () => <MaterialIcons name="link" size={20} />,
              foreColor: () => <MaterialIcons name="format-color-text" size={20} />,
              hiliteColor: () => <MaterialIcons name="highlight" size={20} />,
            }}
          />
        </View>
      </Modal>

    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingTop: Platform.OS === "ios" ? 50 : 40,
    paddingBottom: 16,
    backgroundColor: "#F8FAFC",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  headerLeft: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontFamily: "Inter-Bold",
    color: "#1E293B",
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    fontFamily: "Inter-Regular",
    color: "#64748B",
  },
  annotationCount: {
    fontSize: 12,
    fontFamily: "Inter-Regular",
    color: "#6A009C",
  },
  headerActions: {
    flexDirection: "row",
    gap: 8,
  },
  headerButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  importContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
    paddingBottom: 100,
  },
  instructions: {
    fontSize: 24,
    fontFamily: "Inter-Bold",
    color: "#1E293B",
    marginTop: 24,
    marginBottom: 8,
    textAlign: "center",
  },
  subInstructions: {
    fontSize: 16,
    fontFamily: "Inter-Regular",
    color: "#64748B",
    textAlign: "center",
    marginBottom: 32,
    lineHeight: 24,
  },
  importButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#6A009C",
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderRadius: 16,
    shadowColor: "#6A009C",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  importButtonText: {
    fontSize: 16,
    fontFamily: "Inter-Medium",
    color: "#FFFFFF",
    marginLeft: 8,
  },
  pdfContainer: {
    flex: 1,
    margin: 16,
    marginBottom: 0,
    borderRadius: 12,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    backgroundColor: "#FFFFFF",
  },
  webView: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  webViewLoading: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
  },
  webViewLoadingText: {
    fontSize: 16,
    fontFamily: "Inter-Medium",
    color: "#64748B",
    marginTop: 12,
  },
  pdf: {
    flex: 1,
    width: Dimensions.get('window').width - 32,
    backgroundColor: "#FFFFFF",
  },
  pageNavigation: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingVertical: 8,
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
  },
  navButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#F8FAFC",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  navButtonDisabled: {
    backgroundColor: "#F1F5F9",
    borderColor: "#E2E8F0",
  },
  pageInfo: {
    fontSize: 16,
    fontFamily: "Inter-Medium",
    color: "#1E293B",
  },
  annotationToolbar: {
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 4,
  },
  toolButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginRight: 12,
    borderRadius: 12,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  activeToolButton: {
    backgroundColor: "#6A009C",
    borderColor: "#6A009C",
  },
  toolButtonText: {
    fontSize: 12,
    fontFamily: "Inter-Medium",
    color: "#6A009C",
    marginLeft: 4,
  },
  activeToolButtonText: {
    color: "#FFFFFF",
  },
  colorButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginRight: 12,
    borderRadius: 12,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  colorPreview: {
    width: 20,
    height: 20,
    borderRadius: 10,
    marginRight: 4,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  colorPicker: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
  },
  colorOption: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: 12,
    borderWidth: 2,
    borderColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  selectedColorOption: {
    borderWidth: 3,
    borderColor: "#6A009C",
    transform: [{ scale: 1.1 }],
  },
  annotationsList: {
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
    maxHeight: 120,
  },
  annotationsListTitle: {
    fontSize: 14,
    fontFamily: "Inter-Medium",
    color: "#1E293B",
    marginBottom: 8,
  },
  annotationItem: {
    backgroundColor: "#F8FAFC",
    padding: 12,
    marginRight: 12,
    borderRadius: 8,
    borderLeftWidth: 4,
    minWidth: 150,
    maxWidth: 200,
  },
  annotationHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  deleteAnnotationButton: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#E2E8F0",
    justifyContent: "center",
    alignItems: "center",
  },
  annotationNote: {
    fontSize: 12,
    fontFamily: "Inter-Regular",
    color: "#64748B",
    marginBottom: 4,
  },
  annotationType: {
    fontSize: 10,
    fontFamily: "Inter-Medium",
    color: "#94A3B8",
    textTransform: "uppercase",
  },
  modalContainer: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingTop: Platform.OS === "ios" ? 50 : 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  modalTitle: {
    fontSize: 20,
    fontFamily: "Inter-Bold",
    color: "#1E293B",
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#F8FAFC",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    flex: 1,
    padding: 16,
  },
  richEditor: {
    flex: 1,
    minHeight: 300,
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    fontSize: 16,
    color: "#333",
    fontFamily: "Inter-Regular",
  },
  richToolbar: {
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  headingText: {
    fontSize: 14,
    fontWeight: "bold",
  },
  
  // Floating Toolbar Styles
  floatingToolbar: {
    position: 'absolute',
    top: 80,
    left: 16,
    right: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 16,
    paddingVertical: 8,
    paddingHorizontal: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
    zIndex: 1000,
  },
  floatingToolbarContent: {
    paddingHorizontal: 8,
  },
  floatingToolButton: {
    flexDirection: 'column',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    minWidth: 60,
  },
  floatingToolButtonActive: {
    backgroundColor: '#6A009C',
    borderColor: '#6A009C',
  },
  floatingToolButtonText: {
    fontSize: 10,
    fontFamily: 'Inter-Medium',
    color: '#6A009C',
    marginTop: 2,
    textAlign: 'center',
  },
  floatingToolButtonTextActive: {
    color: '#FFFFFF',
  },
  floatingColorButton: {
    flexDirection: 'column',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    minWidth: 60,
  },
  floatingClearButton: {
    flexDirection: 'column',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8,
    borderRadius: 12,
    backgroundColor: '#FFEBEE',
    borderWidth: 1,
    borderColor: '#FFCDD2',
    minWidth: 60,
  },
  floatingClearButtonText: {
    fontSize: 10,
    fontFamily: 'Inter-Medium',
    color: '#FF5252',
    marginTop: 2,
    textAlign: 'center',
  },
  floatingColorPicker: {
    position: 'absolute',
    top: 60,
    left: 16,
    right: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
});

export default ImportPDFPage;