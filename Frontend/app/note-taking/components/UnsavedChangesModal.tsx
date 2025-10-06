import React, { useState, useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

const { width } = Dimensions.get('window');

interface UnsavedChangesModalProps {
  visible: boolean;
  onSave: () => Promise<void> | void;
  onCancel: () => void;
  title?: string;
  message?: string;
  saveButtonText?: string;
  cancelButtonText?: string;
  isSaving?: boolean;
}

const UnsavedChangesModal: React.FC<UnsavedChangesModalProps> = ({
  visible,
  onSave,
  onCancel,
  title = "Unsaved Changes",
  message = "You have unsaved changes. What would you like to do?",
  saveButtonText = "Save Changes",
  cancelButtonText = "Cancel",
  isSaving = false,
}) => {
  const scaleValue = React.useRef(new Animated.Value(0)).current;
  const opacityValue = React.useRef(new Animated.Value(0)).current;
  const [isLocalSaving, setIsLocalSaving] = useState(false);

  const handleSave = useCallback(async () => {
    try {
      setIsLocalSaving(true);
      await onSave();
      // The modal should close automatically after successful save
    } catch (error) {
      console.error('Save failed:', error);
      // Keep modal open if save fails
    } finally {
      setIsLocalSaving(false);
    }
  }, [onSave]);

  const currentlySaving = isSaving || isLocalSaving;

  React.useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(scaleValue, {
          toValue: 1,
          useNativeDriver: true,
          tension: 100,
          friction: 8,
        }),
        Animated.timing(opacityValue, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.spring(scaleValue, {
          toValue: 0,
          useNativeDriver: true,
          tension: 100,
          friction: 8,
        }),
        Animated.timing(opacityValue, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, scaleValue, opacityValue]);

  if (!visible) return null;

  return (
    <Modal
      transparent
      visible={visible}
      animationType="none"
      statusBarTranslucent
    >
      <Animated.View 
        style={[
          styles.overlay,
          {
            opacity: opacityValue,
          }
        ]}
      >
        <Animated.View
          style={[
            styles.modalContainer,
            {
              transform: [{ scale: scaleValue }],
            },
          ]}
        >
          <LinearGradient
            colors={['#667eea', '#764ba2']}
            style={styles.gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            {/* Header */}
            <View style={styles.header}>
              <View style={styles.iconContainer}>
                <MaterialIcons name="warning" size={28} color="#FFF" />
              </View>
              <Text style={styles.title}>{title}</Text>
            </View>

            {/* Content */}
            <View style={styles.content}>
              <Text style={styles.message}>{message}</Text>
            </View>

            {/* Actions */}
            <View style={styles.actions}>
              {/* Action Row */}
              <View style={styles.actionRow}>
                {/* Save Button */}
                <TouchableOpacity
                  style={[
                    styles.button, 
                    styles.saveButton,
                    currentlySaving && styles.savingButton
                  ]}
                  onPress={handleSave}
                  activeOpacity={0.8}
                  disabled={currentlySaving}
                >
                  {currentlySaving ? (
                    <>
                      <ActivityIndicator size="small" color="#FFF" />
                      <Text style={styles.saveButtonText}>Saving...</Text>
                    </>
                  ) : (
                    <>
                      <MaterialIcons name="save" size={20} color="#FFF" />
                      <Text style={styles.saveButtonText}>{saveButtonText}</Text>
                    </>
                  )}
                </TouchableOpacity>

                {/* Cancel Button */}
                <TouchableOpacity
                  style={[
                    styles.button, 
                    styles.cancelButton,
                    currentlySaving && styles.disabledButton
                  ]}
                  onPress={onCancel}
                  activeOpacity={0.8}
                  disabled={currentlySaving}
                >
                  <MaterialIcons name="close" size={18} color={currentlySaving ? "#999" : "#667eea"} />
                  <Text style={[styles.cancelButtonText, currentlySaving && styles.disabledText]}>{cancelButtonText}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </LinearGradient>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContainer: {
    width: Math.min(width - 40, 360),
    borderRadius: 24,
    overflow: 'hidden',
    elevation: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
  },
  gradient: {
    padding: 0,
  },
  header: {
    alignItems: 'center',
    paddingTop: 28,
    paddingHorizontal: 24,
    paddingBottom: 20,
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FFF',
    textAlign: 'center',
  },
  content: {
    paddingHorizontal: 24,
    paddingBottom: 28,
  },
  message: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.9)',
    textAlign: 'center',
    lineHeight: 24,
  },
  actions: {
    backgroundColor: '#FFF',
    padding: 20,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 15,
    paddingHorizontal: 20,
    borderRadius: 14,
    flex: 1,
  },
  saveButton: {
    backgroundColor: '#34C759',
    elevation: 3,
    shadowColor: '#34C759',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    marginRight: 10,
  },
  savingButton: {
    backgroundColor: '#28A745',
    opacity: 0.8,
  },
  saveButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 0,
  },
  cancelButton: {
    backgroundColor: 'rgba(102, 126, 234, 0.1)',
    borderWidth: 1,
    borderColor: '#667eea',
    marginLeft: 10,
  },
  cancelButtonText: {
    color: '#667eea',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 6,
  },
  disabledButton: {
    opacity: 0.5,
    backgroundColor: 'rgba(128, 128, 128, 0.1)',
    borderColor: '#999',
  },
  disabledText: {
    color: '#999',
  },
});

export default UnsavedChangesModal;