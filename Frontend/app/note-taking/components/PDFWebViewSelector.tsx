import React, { useEffect, useRef, useState } from 'react';
import { Modal, StyleSheet, View, TouchableOpacity, Text, Platform, Alert } from 'react-native';
import WebView from 'react-native-webview';
import { MaterialIcons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system';
import { getLocalPDFPathEnhanced, isRemoteURL } from '../utils/pdfUtils';

interface PDFWebViewSelectorProps {
  pdfUri: string;  // URI to the PDF file (file://, http://, https://, content://)
  isVisible: boolean;
  onClose: () => void;
  onTextSelected: (text: string) => void;
}

const PDFWebViewSelector: React.FC<PDFWebViewSelectorProps> = ({
  pdfUri,
  isVisible,
  onClose,
  onTextSelected,
}) => {
  const webViewRef = useRef<WebView>(null);
  const [isReady, setIsReady] = useState(false);
  const [hasSelection, setHasSelection] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Process the PDF URI using the utility functions to ensure compatibility
  const [processedPdfUri, setProcessedPdfUri] = useState<string>('');
  
  useEffect(() => {
    if (!pdfUri || !isVisible) return;
    
    setIsLoading(true);
    setLoadError(null);
    
    console.log('Processing PDF URI for WebView compatibility:', pdfUri);
    
    // Use the utility function to handle both remote and local URIs
    (async () => {
      try {
        // If it's a remote URL, we need to download it first
        if (isRemoteURL(pdfUri)) {
          console.log('Remote PDF detected, downloading to local storage');
          
          // Get the local path to the PDF
          const result = await getLocalPDFPathEnhanced(pdfUri, undefined, (progress) => {
            console.log(`PDF download progress: ${progress.stage} - ${progress.progress}%`);
          });
          
          console.log('PDF downloaded successfully:', result.uri);
          setProcessedPdfUri(result.uri);
        } else {
          // For local files, just verify they exist
          const fileInfo = await FileSystem.getInfoAsync(pdfUri);
          if (!fileInfo.exists) {
            throw new Error(`File not found: ${pdfUri}`);
          }
          
          // Use the URI as is - it's already local
          setProcessedPdfUri(pdfUri);
        }
      } catch (error: any) {
        console.error('Error processing PDF file:', error);
        setLoadError(`Error preparing PDF: ${error?.message || 'Unknown error'}`);
      } finally {
        setIsLoading(false);
      }
    })();
  }, [pdfUri, isVisible]);
  
  // Create a file:// URL that will work with PDF.js
  // PDF.js in a WebView can handle file:// URLs on Android with the right flags
  const getPdfUrl = (): string => {
    if (!processedPdfUri) return '';
    
    // HTTP/HTTPS URLs can be used directly
    if (processedPdfUri.startsWith('http://') || processedPdfUri.startsWith('https://')) {
      return processedPdfUri;
    }
    
    // For Android, make sure we're using a file:// URL as our WebView has allowFileAccess set
    if (Platform.OS === 'android' && !processedPdfUri.startsWith('file://')) {
      return `file://${processedPdfUri}`;
    }
    
    return processedPdfUri;
  };

  // HTML content with PDF.js for text selection
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
      <script src="https://cdn.jsdelivr.net/npm/pdfjs-dist@3.4.120/build/pdf.min.js"></script>
      <style>
        body, html { margin: 0; padding: 0; height: 100%; overflow: hidden; }
        #viewerContainer { width: 100%; height: 100%; }
        #viewer { width: 100%; height: 100%; }
        .selectionMessage { 
          position: fixed; 
          top: 10px; 
          left: 50%; 
          transform: translateX(-50%); 
          background: rgba(0,0,0,0.7); 
          color: white; 
          padding: 8px 16px; 
          border-radius: 20px;
          font-size: 14px;
          z-index: 1000;
        }
        .confirmButton {
          position: fixed;
          bottom: 20px;
          right: 20px;
          background: #2196F3;
          color: white;
          padding: 10px 20px;
          border-radius: 20px;
          font-weight: bold;
          z-index: 1000;
          display: none;
        }
        .confirmButton.visible {
          display: block;
        }
      </style>
    </head>
    <body>
      <div class="selectionMessage">Select text in the PDF</div>
      <div id="viewerContainer">
        <div id="viewer" class="pdfViewer"></div>
      </div>
      <button id="confirmBtn" class="confirmButton">Use Selected Text</button>

      <script>
        let selectedText = '';
        
        // Initialize PDF.js
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.4.120/build/pdf.worker.min.js';
        
        const loadPdf = async () => {
          try {
            // Get direct PDF URL
            const pdfUrl = "${getPdfUrl()}";
            console.log('Attempting to load PDF directly from:', pdfUrl);
            
            if (!pdfUrl) {
              throw new Error('Invalid PDF URL: empty or undefined');
            }
            
            // Load the PDF document directly using its URL
            const loadingTask = pdfjsLib.getDocument({ url: pdfUrl });
            const pdf = await loadingTask.promise;
            
            // Load the first page
            for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
              const page = await pdf.getPage(pageNum);
              
              // Create a div for this page
              const pageDiv = document.createElement('div');
              pageDiv.className = 'page';
              pageDiv.style.position = 'relative';
              document.getElementById('viewer').appendChild(pageDiv);
              
              // Set scale and viewport
              const viewport = page.getViewport({ scale: 1.0 });
              
              // Create canvas for rendering
              const canvas = document.createElement('canvas');
              const context = canvas.getContext('2d');
              canvas.height = viewport.height;
              canvas.width = viewport.width;
              pageDiv.appendChild(canvas);
              
              // Render the page
              await page.render({
                canvasContext: context,
                viewport: viewport
              }).promise;
              
              // Create text layer
              const textLayerDiv = document.createElement('div');
              textLayerDiv.className = 'textLayer';
              textLayerDiv.style.position = 'absolute';
              textLayerDiv.style.top = '0';
              textLayerDiv.style.left = '0';
              textLayerDiv.style.height = \`\${viewport.height}px\`;
              textLayerDiv.style.width = \`\${viewport.width}px\`;
              pageDiv.appendChild(textLayerDiv);
              
              // Get text content and build text layer
              const textContent = await page.getTextContent();
              pdfjsLib.renderTextLayer({
                textContent: textContent,
                container: textLayerDiv,
                viewport: viewport,
                textDivs: []
              });
            }
            
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ready' }));
          } catch (error) {
            console.error('Error loading PDF:', error);
            const errorDetails = {
              type: 'error',
              message: error.message,
              pdfUrl: "${getPdfUrl()}",
              stack: error.stack
            };
            console.error('PDF loading error details:', JSON.stringify(errorDetails));
            window.ReactNativeWebView.postMessage(JSON.stringify(errorDetails));
          }
        };
        
        loadPdf();
        
        // Handle text selection
        document.addEventListener('selectionchange', () => {
          const selection = window.getSelection();
          selectedText = selection ? selection.toString() : '';
          
          const confirmBtn = document.getElementById('confirmBtn');
          if (selectedText.trim()) {
            confirmBtn.classList.add('visible');
          } else {
            confirmBtn.classList.remove('visible');
          }
          
          window.ReactNativeWebView.postMessage(JSON.stringify({ 
            type: 'selectionChange', 
            hasSelection: selectedText.trim().length > 0 
          }));
        });
        
        // Handle confirm button click
        document.getElementById('confirmBtn').addEventListener('click', () => {
          if (selectedText.trim()) {
            window.ReactNativeWebView.postMessage(JSON.stringify({ 
              type: 'textSelected', 
              text: selectedText 
            }));
          }
        });
      </script>
    </body>
    </html>
  `;

  // Handle messages from WebView
  const handleMessage = (event: any) => {
    try {
      const message = JSON.parse(event.nativeEvent.data);
      
      switch (message.type) {
        case 'ready':
          console.log('PDFWebViewSelector: PDF viewer ready');
          setIsReady(true);
          break;
        case 'selectionChange':
          setHasSelection(message.hasSelection);
          break;
        case 'textSelected':
          console.log('PDFWebViewSelector: Text selected', message.text?.substring(0, 20) + '...');
          onTextSelected(message.text);
          break;
        case 'error':
          console.error('WebView error:', message.message);
          console.error('PDF URL that caused error:', message.pdfUrl);
          setLoadError(message.message);
          break;
      }
    } catch (error) {
      console.error('Error parsing WebView message:', error);
    }
  };

  return (
    <Modal
      visible={isVisible}
      animationType="fade"
      transparent={false}
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <MaterialIcons name="close" size={24} color="#333" />
          </TouchableOpacity>
          <Text style={styles.title}>Select Text</Text>
          {isLoading && <Text style={styles.loadingText}>Loading PDF...</Text>}
          {hasSelection && (
            <TouchableOpacity
              style={styles.doneButton}
              onPress={() => {
                webViewRef.current?.injectJavaScript(`
                  const selectedText = window.getSelection().toString();
                  if (selectedText) {
                    window.ReactNativeWebView.postMessage(JSON.stringify({
                      type: 'textSelected',
                      text: selectedText
                    }));
                  }
                  true;
                `);
              }}
            >
              <Text style={styles.doneText}>Done</Text>
            </TouchableOpacity>
          )}
        </View>
        
        {loadError ? (
          <View style={styles.errorContainer}>
            <MaterialIcons name="error-outline" size={48} color="#d32f2f" />
            <Text style={styles.errorTitle}>Failed to load PDF</Text>
            <Text style={styles.errorMessage}>{loadError}</Text>
            <TouchableOpacity 
              style={styles.retryButton}
              onPress={() => {
                setLoadError(null);
                setIsLoading(true);
                
                // Simple reload - the WebView will re-render with the URL
                setTimeout(() => {
                  webViewRef.current?.reload();
                  setIsLoading(false);
                }, 500);
              }}
            >
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <WebView
            ref={webViewRef}
            originWhitelist={['*']}
            source={{ html: htmlContent }}
            onMessage={handleMessage}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            allowFileAccess={true}
            allowUniversalAccessFromFileURLs={true}
            allowFileAccessFromFileURLs={true}
            mixedContentMode="compatibility"
            cacheEnabled={true}
            style={styles.webView}
            onError={(e) => {
              console.error('WebView error:', e.nativeEvent);
              setLoadError(`WebView error: ${e.nativeEvent.description}`);
            }}
            renderLoading={() => (
              <View style={styles.centeredView}>
                <Text style={styles.loadingText}>Loading PDF viewer...</Text>
              </View>
            )}
            startInLoadingState={true}
          />
        )}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9f9f9',
  },
  webView: {
    flex: 1,
  },
  centeredView: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f9f9f9',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e1e1e1',
    backgroundColor: '#fff',
  },
  closeButton: {
    padding: 8,
  },
  title: {
    flex: 1,
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
    marginLeft: -32, // Offset for the close button to center the title
  },
  loadingText: {
    color: '#2196F3',
    fontSize: 14,
    marginRight: 10,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#d32f2f',
    marginTop: 16,
    marginBottom: 8,
  },
  errorMessage: {
    fontSize: 16,
    textAlign: 'center',
    color: '#555',
    marginBottom: 24,
  },
  retryButton: {
    backgroundColor: '#2196F3',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  doneButton: {
    padding: 8,
    backgroundColor: '#2196F3',
    borderRadius: 4,
  },
  doneText: {
    color: 'white',
    fontWeight: 'bold',
  },
});

export default PDFWebViewSelector;