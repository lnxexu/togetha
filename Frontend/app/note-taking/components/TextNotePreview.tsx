import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import RenderHtml from 'react-native-render-html';

interface TextNotePreviewProps {
  content?: string;
  formattedContent?: string;
  width: number;
  height: number;
}

const TextNotePreview: React.FC<TextNotePreviewProps> = ({
  content,
  formattedContent,
  width,
  height,
}) => {
  // Enhanced HTML tag styles for better preview rendering
  const previewHtmlTagStyles = useMemo(() => ({
    body: {
      fontFamily: 'System',
      fontSize: 13,
      lineHeight: 18,
      color: '#333',
      margin: 0,
      padding: 0,
    },
    p: {
      marginTop: 0,
      marginBottom: 8,
      fontSize: 13,
      lineHeight: 18,
    },
    h1: {
      fontSize: 18,
      fontWeight: '700' as const,
      marginTop: 0,
      marginBottom: 8,
      color: '#1a1a1a',
    },
    h2: {
      fontSize: 16,
      fontWeight: '600' as const,
      marginTop: 0,
      marginBottom: 6,
      color: '#2a2a2a',
    },
    h3: {
      fontSize: 14,
      fontWeight: '600' as const,
      marginTop: 0,
      marginBottom: 4,
      color: '#3a3a3a',
    },
    strong: {
      fontWeight: '700' as const,
    },
    em: {
      fontStyle: 'italic' as const,
    },
    u: {
      textDecorationLine: 'underline' as const,
    },
    ul: {
      marginTop: 0,
      marginBottom: 8,
      paddingLeft: 16,
    },
    ol: {
      marginTop: 0,
      marginBottom: 8,
      paddingLeft: 16,
    },
    li: {
      marginBottom: 2,
      fontSize: 13,
      lineHeight: 18,
    },
    a: {
      color: '#007AFF',
      textDecorationLine: 'underline' as const,
    },
    blockquote: {
      marginLeft: 8,
      paddingLeft: 8,
      borderLeftWidth: 3,
      borderLeftColor: '#DDD',
      fontStyle: 'italic' as const,
      backgroundColor: '#F9F9F9',
    },
    code: {
      fontFamily: 'Courier',
      backgroundColor: '#F5F5F5',
      paddingHorizontal: 4,
      paddingVertical: 2,
      borderRadius: 3,
      fontSize: 12,
    },
    pre: {
      backgroundColor: '#F5F5F5',
      padding: 8,
      borderRadius: 6,
      overflow: 'hidden' as const,
      fontFamily: 'Courier',
      fontSize: 12,
    },
  }), []);

  const renderContent = () => {
    if (formattedContent) {
      // Clean up the HTML content for preview
      let cleanHtml = formattedContent;
      
      // Remove excessive whitespace and empty paragraphs
      cleanHtml = cleanHtml.replace(/<p><\/p>/g, '');
      cleanHtml = cleanHtml.replace(/<p>&nbsp;<\/p>/g, '');
      cleanHtml = cleanHtml.replace(/\s+/g, ' ');
      
      // Truncate very long content for preview
      if (cleanHtml.length > 500) {
        // Find a good breaking point
        const truncatePoint = cleanHtml.lastIndexOf(' ', 500);
        if (truncatePoint > 300) {
          cleanHtml = cleanHtml.substring(0, truncatePoint) + '...';
        } else {
          cleanHtml = cleanHtml.substring(0, 500) + '...';
        }
      }
      
      return (
        <View style={styles.htmlContainer}>
          <RenderHtml
            contentWidth={width - 16}
            source={{ html: cleanHtml }}
            tagsStyles={previewHtmlTagStyles}
            enableExperimentalMarginCollapsing={true}
            renderersProps={{
              img: {
                enableExperimentalPercentWidth: true,
              },
            }}
          />
        </View>
      );
    } else if (content) {
      // Plain text content
      const truncatedContent = content.length > 200 ? content.substring(0, 200) + '...' : content;
      
      return (
        <Text style={styles.plainTextContent} numberOfLines={6}>
          {truncatedContent}
        </Text>
      );
    } else {
      // Empty note placeholder
      return (
        <View style={styles.emptyContainer}>
          <View style={styles.documentLines}>
            <View style={[styles.documentLine, styles.documentTitleLine]} />
            <View style={[styles.documentLine, { width: '90%' }]} />
            <View style={[styles.documentLine, { width: '75%' }]} />
            <View style={[styles.documentLine, { width: '85%' }]} />
            <View style={[styles.documentLine, { width: '65%' }]} />
          </View>
          <Text style={styles.emptyText}>Empty note</Text>
        </View>
      );
    }
  };

  return (
    <View style={[styles.container, { width, height }]}>
      {renderContent()}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FAFAFA',
    borderRadius: 8,
    padding: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  htmlContainer: {
    flex: 1,
  },
  plainTextContent: {
    fontSize: 13,
    lineHeight: 18,
    color: '#333',
    fontFamily: 'System',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  documentLines: {
    width: '100%',
    marginBottom: 8,
  },
  documentLine: {
    height: 2,
    backgroundColor: '#E0E0E0',
    marginBottom: 4,
    borderRadius: 1,
  },
  documentTitleLine: {
    width: '60%',
    height: 3,
    backgroundColor: '#C0C0C0',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 11,
    color: '#999',
    fontStyle: 'italic',
  },
});

export default TextNotePreview;