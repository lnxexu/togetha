import { MaterialIcons } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';

interface NoteEditorProps {
  route: {
    params: {
      noteId?: string;
      initialNote?: {
        title: string;
        content: string;
      };
    };
  };
  navigation: any;
}

export default function NoteEditorScreen({ route, navigation }: NoteEditorProps) {
  const [title, setTitle] = useState(route.params?.initialNote?.title || '');
  const [content, setContent] = useState(route.params?.initialNote?.content || '');
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // TODO: Implement save logic
      // If offline, save to local storage
      // If online, sync with backend
      navigation.goBack();
    } catch (error) {
      console.error('Error saving note:', error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={24} color="#007AFF" />
        </TouchableOpacity>
        <TouchableOpacity 
          style={styles.saveButton}
          onPress={handleSave}
          disabled={isSaving}>
          <MaterialIcons 
            name={isSaving ? 'sync' : 'check'} 
            size={24} 
            color="#007AFF" 
          />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.editorContainer}>
        <TextInput
          style={styles.titleInput}
          placeholder="Note Title"
          value={title}
          onChangeText={setTitle}
          maxLength={100}
        />
        <TextInput
          style={styles.contentInput}
          placeholder="Start typing..."
          value={content}
          onChangeText={setContent}
          multiline
          textAlignVertical="top"
        />
      </ScrollView>

      <View style={styles.toolbar}>
        <TouchableOpacity style={styles.toolbarButton}>
          <MaterialIcons name="format-bold" size={24} color="#666" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.toolbarButton}>
          <MaterialIcons name="format-italic" size={24} color="#666" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.toolbarButton}>
          <MaterialIcons name="format-list-bulleted" size={24} color="#666" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.toolbarButton}>
          <MaterialIcons name="attach-file" size={24} color="#666" />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  saveButton: {
    padding: 8,
  },
  editorContainer: {
    flex: 1,
    padding: 16,
  },
  titleInput: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  contentInput: {
    flex: 1,
    fontSize: 16,
    lineHeight: 24,
    minHeight: 200,
  },
  toolbar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#eee',
    padding: 8,
  },
  toolbarButton: {
    padding: 8,
    marginHorizontal: 4,
  },
});