import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Alert } from 'react-native';
import APITestUtility from './apiTest';

export default function APIDebugScreen() {
  const [testResults, setTestResults] = useState<any>(null);
  const [isRunning, setIsRunning] = useState(false);

  const runDiagnostic = async () => {
    setIsRunning(true);
    try {
      const results = await APITestUtility.runFullDiagnostic();
      setTestResults(results);
    } catch (error) {
      Alert.alert('Error', `Diagnostic failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsRunning(false);
    }
  };

  const renderTestResult = (title: string, result: any) => {
    const isSuccess = result?.success;
    const bgColor = isSuccess ? '#d4edda' : '#f8d7da';
    const textColor = isSuccess ? '#155724' : '#721c24';

    return (
      <View style={[styles.resultCard, { backgroundColor: bgColor }]}>
        <Text style={[styles.resultTitle, { color: textColor }]}>
          {isSuccess ? '✅' : '❌'} {title}
        </Text>
        {result?.error && (
          <Text style={[styles.resultError, { color: textColor }]}>
            Error: {result.error}
          </Text>
        )}
        {result?.details && (
          <Text style={[styles.resultDetails, { color: textColor }]}>
            Details: {JSON.stringify(result.details, null, 2)}
          </Text>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>API Debug Console</Text>
      <Text style={styles.subtitle}>
        This screen helps diagnose "Network request failed" and 403 errors
      </Text>

      <TouchableOpacity 
        style={[styles.button, isRunning && styles.buttonDisabled]} 
        onPress={runDiagnostic}
        disabled={isRunning}
      >
        <Text style={styles.buttonText}>
          {isRunning ? 'Running Diagnostic...' : 'Run Full Diagnostic'}
        </Text>
      </TouchableOpacity>

      {testResults && (
        <ScrollView style={styles.resultsContainer}>
          <Text style={styles.summaryTitle}>Summary</Text>
          <Text style={styles.summaryText}>{testResults.summary}</Text>

          {renderTestResult('Authentication Token', testResults.tokenCheck)}
          {renderTestResult('Basic Connectivity', testResults.connectivity)}
          {renderTestResult('Authenticated Request', testResults.authentication)}
          {renderTestResult('Dictionary Service', testResults.dictionary)}
          {renderTestResult('File Upload Endpoint', testResults.fileUpload)}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#f5f5f5',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 20,
  },
  button: {
    backgroundColor: '#007bff',
    padding: 15,
    borderRadius: 8,
    marginBottom: 20,
  },
  buttonDisabled: {
    backgroundColor: '#6c757d',
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  resultsContainer: {
    flex: 1,
  },
  summaryTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
  },
  summaryText: {
    fontSize: 14,
    color: '#333',
    backgroundColor: '#e9ecef',
    padding: 10,
    borderRadius: 5,
    marginBottom: 20,
    fontFamily: 'monospace',
  },
  resultCard: {
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#dee2e6',
  },
  resultTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  resultError: {
    fontSize: 14,
    marginBottom: 5,
  },
  resultDetails: {
    fontSize: 12,
    fontFamily: 'monospace',
  },
});