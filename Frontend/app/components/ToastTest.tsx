import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { showSuccessToast, showErrorToast, showInfoToast, showWarningToast } from '../utils/ToastUtils';

const ToastTest: React.FC = () => {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Toast Notifications Test</Text>
      
      <TouchableOpacity 
        style={[styles.button, styles.successButton]} 
        onPress={() => showSuccessToast('This is a success message!')}
      >
        <Text style={styles.buttonText}>Show Success Toast</Text>
      </TouchableOpacity>

      <TouchableOpacity 
        style={[styles.button, styles.errorButton]} 
        onPress={() => showErrorToast('This is an error message!')}
      >
        <Text style={styles.buttonText}>Show Error Toast</Text>
      </TouchableOpacity>

      <TouchableOpacity 
        style={[styles.button, styles.warningButton]} 
        onPress={() => showWarningToast('This is a warning message!')}
      >
        <Text style={styles.buttonText}>Show Warning Toast</Text>
      </TouchableOpacity>

      <TouchableOpacity 
        style={[styles.button, styles.infoButton]} 
        onPress={() => showInfoToast('This is an info message!')}
      >
        <Text style={styles.buttonText}>Show Info Toast</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F1D3FF',
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#6A009C',
    marginBottom: 30,
    fontFamily: 'Inter-Bold',
  },
  button: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    marginBottom: 15,
    width: '100%',
    alignItems: 'center',
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
    fontFamily: 'Inter-Medium',
  },
  successButton: {
    backgroundColor: '#60A760',
  },
  errorButton: {
    backgroundColor: '#E74C3C',
  },
  warningButton: {
    backgroundColor: '#F39C12',
  },
  infoButton: {
    backgroundColor: '#3498DB',
  },
});

export default ToastTest;
