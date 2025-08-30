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
  PanResponder,
  Animated,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Svg, { Rect, Circle, Text as SvgText } from 'react-native-svg';
import { PanGestureHandler, State } from 'react-native-gesture-handler';
import Navbar from "../NavBar";
import { DocumentAnnotationTool, type Annotation } from "./components/DocumentAnnotationTool";

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

const ImportPDFPage = () => {
  const [pdfDocument, setPdfDocument] = useState<PDFDocument | null>(null);
  const [selectedAnnotationType, setSelectedAnnotationType] = useState<"highlight" | "note" | "underline" | "strikethrough">("highlight");
  const [selectedColor, setSelectedColor] = useState(HIGHLIGHT_COLORS[0]);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showNotesModal, setShowNotesModal] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [annotations, setAnnotations] = useState<PDFAnnotation[]>([]);
  const [pdfNotes, setPdfNotes] = useState("");
  const [selectionMode, setSelectionMode] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [pdfScale, setPdfScale] = useState(1);
  const [showAnnotationPanel, setShowAnnotationPanel] = useState(false);
  const [documentNoteId, setDocumentNoteId] = useState<string | null>(null);
  const [pdfOffset, setPdfOffset] = useState({ x: 0, y: 0 });
  const [selectionArea, setSelectionArea] = useState<SelectionArea | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const [tempSelection, setTempSelection] = useState<SelectionArea | null>(null);
  
  const pdfRef = useRef<any>(null);
  const richTextRef = useRef<any>(null);
  const selectionAnimatedValue = useRef(new Animated.Value(0)).current;

  // Load saved data on component mount
  useEffect(() => {
    loadSavedData();
  }, []);

  const loadSavedData = async () => {
    try {
      const savedDocument = await AsyncStorage.getItem("currentPdfDocument");
      if (savedDocument) {
        const parsedDocument = JSON.parse(savedDocument);
        setPdfDocument(parsedDocument);
        setAnnotations(parsedDocument.annotations || []);
        setPdfNotes(parsedDocument.notes || "");
        setTotalPages(parsedDocument.totalPages || 0);
        // Set a mock note ID for the annotation tool
        setDocumentNoteId(parsedDocument.noteId || `doc_${Date.now()}`);
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
          totalPages: 5, // Default for Expo Go demo
        };

        setPdfDocument(newDocument);
        setAnnotations([]);
        setPdfNotes("");
        setTotalPages(5); // Set default pages for demo
        // Generate a mock note ID for the annotation tool
        const mockNoteId = `doc_${Date.now()}`;
        setDocumentNoteId(mockNoteId);
        await saveData(newDocument);
      }
    } catch (error) {
      console.error("Error importing PDF:", error);
      Alert.alert("Error", "Failed to import PDF document");
    }
  };

  const handleAnnotation = (type: string) => {
    setSelectedAnnotationType(type as any);
    setSelectionMode(true);
    
    // Animate selection indicator
    Animated.sequence([
      Animated.timing(selectionAnimatedValue, {
        toValue: 1,
        duration: 300,
        useNativeDriver: false,
      }),
    ]).start();

    Alert.alert(
      "Annotation Mode",
      `${type.charAt(0).toUpperCase() + type.slice(1)} mode enabled. Drag to select text area in the PDF.`,
      [
        { 
          text: "Cancel", 
          onPress: () => {
            setSelectionMode(false);
            Animated.timing(selectionAnimatedValue, {
              toValue: 0,
              duration: 300,
              useNativeDriver: false,
            }).start();
          }
        },
        { text: "OK" }
      ]
    );
  };

  // Pan responder for selection
  const panResponder = PanResponder.create({
    onMoveShouldSetPanResponder: () => selectionMode,
    onPanResponderGrant: (evt) => {
      if (!selectionMode) return;
      
      const startX = evt.nativeEvent.locationX;
      const startY = evt.nativeEvent.locationY;
      
      setIsSelecting(true);
      setTempSelection({
        startX,
        startY,
        endX: startX,
        endY: startY,
        page: currentPage,
      });
    },
    onPanResponderMove: (evt) => {
      if (!selectionMode || !isSelecting) return;
      
      const endX = evt.nativeEvent.locationX;
      const endY = evt.nativeEvent.locationY;
      
      setTempSelection(prev => prev ? {
        ...prev,
        endX,
        endY,
      } : null);
    },
    onPanResponderRelease: (evt) => {
      if (!selectionMode || !tempSelection) return;
      
      const endX = evt.nativeEvent.locationX;
      const endY = evt.nativeEvent.locationY;
      
      const finalSelection = {
        ...tempSelection,
        endX,
        endY,
      };
      
      // Calculate selection bounds
      const x = Math.min(finalSelection.startX, finalSelection.endX);
      const y = Math.min(finalSelection.startY, finalSelection.endY);
      const width = Math.abs(finalSelection.endX - finalSelection.startX);
      const height = Math.abs(finalSelection.endY - finalSelection.startY);
      
      // Only create annotation if selection is meaningful
      if (width > 10 && height > 10) {
        if (selectedAnnotationType === 'note') {
          setNoteText("");
          setShowNotesModal(true);
          setSelectionArea(finalSelection);
        } else {
          createAnnotation(x, y, width, height);
        }
      }
      
      setIsSelecting(false);
      setTempSelection(null);
      setSelectionMode(false);
      
      Animated.timing(selectionAnimatedValue, {
        toValue: 0,
        duration: 300,
        useNativeDriver: false,
      }).start();
    },
  });

  const createAnnotation = async (x: number, y: number, width: number, height: number, noteContent?: string) => {
    const newAnnotation: PDFAnnotation = {
      id: Date.now().toString(),
      type: selectedAnnotationType,
      page: currentPage,
      x: x / pdfScale,
      y: y / pdfScale,
      width: width / pdfScale,
      height: height / pdfScale,
      color: selectedColor,
      text: `Selected text on page ${currentPage}`,
      note: noteContent,
    };

    const updatedAnnotations = [...annotations, newAnnotation];
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

  const saveNote = async () => {
    if (noteText.trim() && selectionArea) {
      const x = Math.min(selectionArea.startX, selectionArea.endX);
      const y = Math.min(selectionArea.startY, selectionArea.endY);
      const width = Math.abs(selectionArea.endX - selectionArea.startX);
      const height = Math.abs(selectionArea.endY - selectionArea.startY);
      
      await createAnnotation(x, y, width, height, noteText);
    }
    setShowNotesModal(false);
    setNoteText("");
    setSelectionArea(null);
  };

  const updatePDFNotes = async (notes: string) => {
    setPdfNotes(notes);
    if (pdfDocument) {
      const updatedDocument = {
        ...pdfDocument,
        notes,
      };
      setPdfDocument(updatedDocument);
      await saveData(updatedDocument);
    }
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

  const renderAnnotationOverlay = () => {
    const currentPageAnnotations = annotations.filter(ann => ann.page === currentPage);
    
    return (
      <View style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]}>
        <Svg height="100%" width="100%" style={StyleSheet.absoluteFill}>
          {currentPageAnnotations.map((annotation) => {
            const x = annotation.x * pdfScale;
            const y = annotation.y * pdfScale;
            const width = annotation.width * pdfScale;
            const height = annotation.height * pdfScale;

            switch (annotation.type) {
              case 'highlight':
                return (
                  <Rect
                    key={annotation.id}
                    x={x}
                    y={y}
                    width={width}
                    height={height}
                    fill={annotation.color}
                    opacity={0.4}
                    rx={2}
                  />
                );
              case 'underline':
                return (
                  <Rect
                    key={annotation.id}
                    x={x}
                    y={y + height - 2}
                    width={width}
                    height={2}
                    fill={annotation.color}
                  />
                );
              case 'strikethrough':
                return (
                  <Rect
                    key={annotation.id}
                    x={x}
                    y={y + height / 2}
                    width={width}
                    height={2}
                    fill={annotation.color}
                  />
                );
              case 'note':
                return (
                  <Circle
                    key={annotation.id}
                    cx={x + 10}
                    cy={y + 10}
                    r={10}
                    fill={annotation.color}
                    opacity={0.8}
                  />
                );
              default:
                return null;
            }
          })}
          
          {/* Temp selection overlay */}
          {tempSelection && isSelecting && (
            <Rect
              x={Math.min(tempSelection.startX, tempSelection.endX)}
              y={Math.min(tempSelection.startY, tempSelection.endY)}
              width={Math.abs(tempSelection.endX - tempSelection.startX)}
              height={Math.abs(tempSelection.endY - tempSelection.startY)}
              fill="#2196F3"
              opacity={0.3}
              stroke="#2196F3"
              strokeWidth={2}
              strokeDasharray="5,5"
            />
          )}
        </Svg>
      </View>
    );
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
            style={[styles.headerButton, showAnnotationPanel && styles.headerButtonActive]} 
            onPress={() => setShowAnnotationPanel(!showAnnotationPanel)}
          >
            <MaterialIcons name="comment" size={24} color={showAnnotationPanel ? "#FFFFFF" : "#6A009C"} />
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.headerButton} 
            onPress={() => setShowNotesModal(true)}
          >
            <MaterialIcons name="note-add" size={24} color="#6A009C" />
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={styles.headerButton} 
            onPress={handleImportPDF}
          >
            <MaterialIcons name="folder-open" size={24} color="#6A009C" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Selection Mode Indicator */}
      {selectionMode && (
        <Animated.View 
          style={[
            styles.selectionModeIndicator,
            {
              opacity: selectionAnimatedValue,
              transform: [{
                translateY: selectionAnimatedValue.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-50, 0],
                })
              }]
            }
          ]}
        >
          <Text style={styles.selectionModeText}>
            {selectedAnnotationType.toUpperCase()} MODE - Drag to select area
          </Text>
          <TouchableOpacity 
            style={styles.cancelSelectionButton}
            onPress={() => {
              setSelectionMode(false);
              setIsSelecting(false);
              setTempSelection(null);
              Animated.timing(selectionAnimatedValue, {
                toValue: 0,
                duration: 300,
                useNativeDriver: false,
              }).start();
            }}
          >
            <MaterialIcons name="close" size={16} color="#FFFFFF" />
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* PDF Viewer Placeholder (Expo Go Compatible) */}
      <View style={styles.pdfContainer} {...panResponder.panHandlers}>
        <View style={styles.pdfPlaceholder}>
          <MaterialIcons name="picture-as-pdf" size={80} color="#FF5722" />
          <Text style={styles.pdfPlaceholderTitle}>{pdfDocument.name}</Text>
          <Text style={styles.pdfPlaceholderText}>
            PDF preview not available in Expo Go
          </Text>
          <Text style={styles.pdfInstructionText}>
            Use a development build to view PDFs directly
          </Text>
          <Text style={styles.pdfInstructionText}>
            Tap and drag to simulate annotation selection
          </Text>
          
          {/* Simulate pages */}
          <View style={styles.simulatedPageContainer}>
            <Text style={styles.simulatedPageText}>
              Page {currentPage} of {totalPages || 5}
            </Text>
            <Text style={styles.simulatedPageContent}>
              This is simulated PDF content for demonstration.
              {'\n'}You can still test the annotation features.
              {'\n'}Drag to select areas for highlighting and notes.
            </Text>
          </View>
        </View>
        
        {/* Annotation Overlay */}
        {renderAnnotationOverlay()}
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
          <MaterialIcons name="chevron-left" size={24} color={currentPage === 1 ? "#CCC" : "#6A009C"} />
        </TouchableOpacity>
        
        <Text style={styles.pageInfo}>{currentPage} / {totalPages}</Text>
        
        <TouchableOpacity 
          style={[styles.navButton, currentPage === totalPages && styles.navButtonDisabled]}
          onPress={() => {
            if (currentPage < totalPages) {
              setCurrentPage(currentPage + 1);
            }
          }}
          disabled={currentPage === totalPages}
        >
          <MaterialIcons name="chevron-right" size={24} color={currentPage === totalPages ? "#CCC" : "#6A009C"} />
        </TouchableOpacity>
      </View>

      {/* Annotation Toolbar */}
      <View style={styles.annotationToolbar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <TouchableOpacity 
            style={[
              styles.toolButton, 
              selectedAnnotationType === 'highlight' && styles.activeToolButton,
              selectionMode && selectedAnnotationType === 'highlight' && styles.selectionActiveButton
            ]}
            onPress={() => handleAnnotation('highlight')}
          >
            <MaterialIcons 
              name="highlight" 
              size={24} 
              color={selectedAnnotationType === 'highlight' && (selectionMode || styles.activeToolButton) ? "#FFFFFF" : "#6A009C"} 
            />
            <Text style={[
              styles.toolButtonText, 
              selectedAnnotationType === 'highlight' && styles.activeToolButtonText,
              selectionMode && selectedAnnotationType === 'highlight' && styles.selectionActiveText
            ]}>
              Highlight
            </Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[
              styles.toolButton, 
              selectedAnnotationType === 'underline' && styles.activeToolButton,
              selectionMode && selectedAnnotationType === 'underline' && styles.selectionActiveButton
            ]}
            onPress={() => handleAnnotation('underline')}
          >
            <MaterialIcons 
              name="format-underlined" 
              size={24} 
              color={selectedAnnotationType === 'underline' && (selectionMode || styles.activeToolButton) ? "#FFFFFF" : "#6A009C"} 
            />
            <Text style={[
              styles.toolButtonText, 
              selectedAnnotationType === 'underline' && styles.activeToolButtonText,
              selectionMode && selectedAnnotationType === 'underline' && styles.selectionActiveText
            ]}>
              Underline
            </Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[
              styles.toolButton, 
              selectedAnnotationType === 'strikethrough' && styles.activeToolButton,
              selectionMode && selectedAnnotationType === 'strikethrough' && styles.selectionActiveButton
            ]}
            onPress={() => handleAnnotation('strikethrough')}
          >
            <MaterialIcons 
              name="strikethrough-s" 
              size={24} 
              color={selectedAnnotationType === 'strikethrough' && (selectionMode || styles.activeToolButton) ? "#FFFFFF" : "#6A009C"} 
            />
            <Text style={[
              styles.toolButtonText, 
              selectedAnnotationType === 'strikethrough' && styles.activeToolButtonText,
              selectionMode && selectedAnnotationType === 'strikethrough' && styles.selectionActiveText
            ]}>
              Strike
            </Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[
              styles.toolButton, 
              selectedAnnotationType === 'note' && styles.activeToolButton,
              selectionMode && selectedAnnotationType === 'note' && styles.selectionActiveButton
            ]}
            onPress={() => handleAnnotation('note')}
          >
            <MaterialIcons 
              name="note-add" 
              size={24} 
              color={selectedAnnotationType === 'note' && (selectionMode || styles.activeToolButton) ? "#FFFFFF" : "#6A009C"} 
            />
            <Text style={[
              styles.toolButtonText, 
              selectedAnnotationType === 'note' && styles.activeToolButtonText,
              selectionMode && selectedAnnotationType === 'note' && styles.selectionActiveText
            ]}>
              Note
            </Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.colorButton}
            onPress={() => setShowColorPicker(!showColorPicker)}
          >
            <View style={[styles.colorPreview, { backgroundColor: selectedColor }]} />
            <Text style={styles.toolButtonText}>Color</Text>
          </TouchableOpacity>
        </ScrollView>

        {/* Color Picker */}
        {showColorPicker && (
          <View style={styles.colorPicker}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {HIGHLIGHT_COLORS.map((color, index) => (
                <TouchableOpacity
                  key={index}
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
            </ScrollView>
          </View>
        )}
      </View>

      {/* Annotations List */}
      {annotations.filter(ann => ann.page === currentPage).length > 0 && (
        <View style={styles.annotationsList}>
          <Text style={styles.annotationsListTitle}>Page {currentPage} Annotations:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {annotations.filter(ann => ann.page === currentPage).map((annotation) => (
              <View key={annotation.id} style={[styles.annotationItem, { borderLeftColor: annotation.color }]}>
                <View style={styles.annotationHeader}>
                  <MaterialIcons 
                    name={
                      annotation.type === 'highlight' ? 'highlight' :
                      annotation.type === 'underline' ? 'format-underlined' :
                      annotation.type === 'strikethrough' ? 'strikethrough-s' : 'note'
                    } 
                    size={16} 
                    color={annotation.color} 
                  />
                  <TouchableOpacity 
                    style={styles.deleteAnnotationButton}
                    onPress={() => deleteAnnotation(annotation.id)}
                  >
                    <MaterialIcons name="close" size={14} color="#666" />
                  </TouchableOpacity>
                </View>
                {annotation.note && (
                  <Text style={styles.annotationNote} numberOfLines={2}>
                    {annotation.note}
                  </Text>
                )}
                <Text style={styles.annotationType}>
                  {annotation.type.charAt(0).toUpperCase() + annotation.type.slice(1)}
                </Text>
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Notes Modal */}
      <Modal
        visible={showNotesModal}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {selectionArea ? "Add Note" : "PDF Notes"}
            </Text>
            <TouchableOpacity 
              style={styles.closeButton}
              onPress={() => {
                setShowNotesModal(false);
                setNoteText("");
                setSelectionArea(null);
              }}
            >
              <MaterialIcons name="close" size={24} color="#666" />
            </TouchableOpacity>
          </View>

          <View style={styles.modalContent}>
            {selectionArea ? (
              <>
                <Text style={styles.noteInputLabel}>Add a note for the selected area:</Text>
                <TextInput
                  style={styles.noteInput}
                  value={noteText}
                  onChangeText={setNoteText}
                  placeholder="Enter your note here..."
                  multiline
                  textAlignVertical="top"
                />
                <TouchableOpacity style={styles.saveNoteButton} onPress={saveNote}>
                  <Text style={styles.saveNoteButtonText}>Save Note</Text>
                </TouchableOpacity>
              </>
            ) : (
              <RichEditor
                ref={richTextRef}
                style={styles.richEditor}
                initialContentHTML={pdfNotes}
                onChange={updatePDFNotes}
                placeholder="Take notes about this PDF document..."
              />
            )}
          </View>

          {!selectionArea && (
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
          )}
        </View>
      </Modal>

      {/* Document Annotation Panel */}
      {showAnnotationPanel && documentNoteId && pdfDocument && (
        <Modal
          visible={showAnnotationPanel}
          animationType="slide"
          presentationStyle="fullScreen"
          onRequestClose={() => setShowAnnotationPanel(false)}
        >
          <DocumentAnnotationTool
            noteId={documentNoteId}
            documentUri={pdfDocument.uri}
            documentName={pdfDocument.name}
            documentType="pdf"
            onClose={() => setShowAnnotationPanel(false)}
            onAnnotationsChange={(annotations: Annotation[]) => {
              // Update local annotations if needed
              console.log('Annotations updated:', annotations.length);
            }}
          />
        </Modal>
      )}

      <Navbar activeRoute="PDFs" />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8fafc",
    paddingTop: 130, // Space for the absolute positioned header
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingTop: Platform.OS === "ios" ? 70 : 55,
    paddingBottom: 30,
    backgroundColor: "#F5E1FD",
    borderBottomLeftRadius: 25,
    borderBottomRightRadius: 25,
    shadowColor: "#1E293B",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
    zIndex: 1000,
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
  headerButtonActive: {
    backgroundColor: "#6366F1",
    shadowColor: "#6366F1",
  },
  selectionModeIndicator: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#FF6B35",
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  selectionModeText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontFamily: "Inter-Medium",
    flex: 1,
  },
  cancelSelectionButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    justifyContent: "center",
    alignItems: "center",
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
  pdf: {
    flex: 1,
    width: Dimensions.get('window').width - 32,
    backgroundColor: "#FFFFFF",
  },
  pdfPlaceholder: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
    backgroundColor: "#FFFFFF",
  },
  pdfPlaceholderTitle: {
    fontSize: 18,
    fontFamily: "Inter-Bold",
    color: "#1E293B",
    marginTop: 16,
    marginBottom: 8,
    textAlign: "center",
  },
  pdfPlaceholderText: {
    fontSize: 16,
    fontFamily: "Inter-Medium",
    color: "#64748B",
    textAlign: "center",
    marginBottom: 4,
  },
  pdfInstructionText: {
    fontSize: 14,
    fontFamily: "Inter-Regular",
    color: "#94A3B8",
    textAlign: "center",
    marginBottom: 4,
  },
  simulatedPageContainer: {
    backgroundColor: "#F8FAFC",
    padding: 20,
    borderRadius: 8,
    marginTop: 20,
    width: '90%',
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  simulatedPageText: {
    fontSize: 14,
    fontFamily: "Inter-Medium",
    color: "#6A009C",
    textAlign: "center",
    marginBottom: 12,
  },
  simulatedPageContent: {
    fontSize: 16,
    fontFamily: "Inter-Regular",
    color: "#1E293B",
    lineHeight: 24,
    textAlign: "center",
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
  selectionActiveButton: {
    backgroundColor: "#FF6B35",
    borderColor: "#FF6B35",
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
  selectionActiveText: {
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
  noteInputLabel: {
    fontSize: 16,
    fontFamily: "Inter-Medium",
    color: "#1E293B",
    marginBottom: 12,
  },
  noteInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    fontFamily: "Inter-Regular",
    color: "#1E293B",
    backgroundColor: "#F8FAFC",
  },
  saveNoteButton: {
    backgroundColor: "#6A009C",
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 16,
  },
  saveNoteButtonText: {
    fontSize: 16,
    fontFamily: "Inter-Medium",
    color: "#FFFFFF",
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
  annotationPanel: {
    position: 'absolute',
    right: 0,
    top: 130,
    bottom: 80,
    width: width * 0.4,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: -2, height: 0 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 4,
    zIndex: 100,
  },
});

export default ImportPDFPage;