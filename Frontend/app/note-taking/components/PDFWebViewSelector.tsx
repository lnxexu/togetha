import React, { useEffect } from "react";
import { Alert } from "react-native";

interface PDFWebViewSelectorProps {
  pdfUri: string;
  isVisible: boolean;
  onClose: () => void;
  onTextSelected: (text: string) => void;
  initialPage?: number;
  autoExtract?: {
    page: number;
    bbox: { x: number; y: number; width: number; height: number };
  } | null;
  asPopout?: boolean;
}

/**
 * Minimalistic placeholder component that replaces the WebView text selection functionality
 * All WebView functionality has been completely removed from the application
 */
const PDFWebViewSelector: React.FC<PDFWebViewSelectorProps> = ({
  isVisible,
  onClose,
  onTextSelected,
}) => {
  useEffect(() => {
    if (isVisible) {
      // Show alert and close immediately when opened
      Alert.alert(
        "Feature Not Available",
        "Text selection functionality has been removed.",
        [
          { 
            text: "Cancel", 
            style: "cancel", 
            onPress: onClose 
          },
          { 
            text: "Use Sample Text", 
            onPress: () => {
              onTextSelected("Sample text selection (WebView functionality removed)");
              onClose();
            } 
          }
        ]
      );
    }
  }, [isVisible, onClose, onTextSelected]);

  // Return null as we don't render anything - just show an alert
  return null;
};

export default PDFWebViewSelector;