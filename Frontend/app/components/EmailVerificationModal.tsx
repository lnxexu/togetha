import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Animated,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

interface EmailVerificationModalProps {
  visible: boolean;
  email: string;
  username: string;
  onClose: () => void;
  onVerify: (code: string) => void;
  onResend: () => void;
  loading?: boolean;
  resendLoading?: boolean;
}

export default function EmailVerificationModal({
  visible,
  email,
  username,
  onClose,
  onVerify,
  onResend,
  loading = false,
  resendLoading = false,
}: EmailVerificationModalProps) {
  const [verificationCode, setVerificationCode] = useState('');
  const [timeLeft, setTimeLeft] = useState(600); // 10 minutes in seconds
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;

  useEffect(() => {
    if (visible) {
      // Reset timer when modal opens
      setTimeLeft(600);
      setVerificationCode('');
      
      // Animate in
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          tension: 50,
          friction: 7,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      // Animate out
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 0.8,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible]);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    
    if (visible && timeLeft > 0) {
      timer = setTimeout(() => {
        setTimeLeft(timeLeft - 1);
      }, 1000);
    }

    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [visible, timeLeft]);

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const handleVerify = () => {
    if (verificationCode.length !== 6) {
      Alert.alert('Invalid Code', 'Please enter a 6-digit verification code');
      return;
    }
    onVerify(verificationCode);
  };

  const handleResend = () => {
    if (timeLeft > 540) { // Can't resend within first 60 seconds
      Alert.alert('Please Wait', 'You can resend the code in a few seconds');
      return;
    }
    setTimeLeft(600);
    setVerificationCode('');
    onResend();
  };

  const maskEmail = (email: string) => {
    if (!email || !email.includes('@')) {
      return email;
    }
    
    const [username, domain] = email.split('@');
    if (!username || username.length < 2) {
      return email;
    }
    
    const maskedUsername = username.charAt(0) + '*'.repeat(Math.max(0, username.length - 2)) + username.charAt(username.length - 1);
    return `${maskedUsername}@${domain}`;
  };

  return (
    <Modal
      transparent
      visible={visible}
      animationType="none"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <Animated.View
          style={[
            styles.container,
            {
              opacity: fadeAnim,
              transform: [{ scale: scaleAnim }],
            },
          ]}
        >
          <LinearGradient
            colors={['#FFFFFF', '#F8FAFC']}
            style={styles.modalContent}
          >
            {/* Header */}
            <View style={styles.header}>
              <View style={styles.iconContainer}>
                <MaterialIcons name="mark-email-read" size={48} color="#8B5CF6" />
              </View>
              <Text style={styles.title}>Verify Your Email</Text>
              <Text style={styles.subtitle}>
                We've sent a 6-digit verification code to{'\n'}
                <Text style={styles.emailHighlight}>{maskEmail(email)}</Text>
              </Text>
            </View>

            {/* Code Input */}
            <View style={styles.codeSection}>
              <Text style={styles.codeLabel}>Enter Verification Code</Text>
              <TextInput
                style={styles.codeInput}
                value={verificationCode}
                onChangeText={setVerificationCode}
                placeholder="000000"
                placeholderTextColor="#9CA3AF"
                keyboardType="number-pad"
                maxLength={6}
                autoFocus
                editable={!loading}
              />
            </View>

            {/* Timer */}
            <View style={styles.timerContainer}>
              <MaterialIcons name="timer" size={16} color="#6B7280" />
              <Text style={styles.timerText}>
                Code expires in {formatTime(timeLeft)}
              </Text>
            </View>

            {/* Buttons */}
            <View style={styles.buttonContainer}>
              <TouchableOpacity
                style={styles.resendButton}
                onPress={handleResend}
                disabled={resendLoading || timeLeft > 540}
              >
                {resendLoading ? (
                  <ActivityIndicator size="small" color="#8B5CF6" />
                ) : (
                  <>
                    <MaterialIcons name="refresh" size={18} color="#8B5CF6" />
                    <Text style={styles.resendText}>Resend Code</Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.verifyButton,
                  (loading || verificationCode.length !== 6) && styles.disabledButton
                ]}
                onPress={handleVerify}
                disabled={loading || verificationCode.length !== 6}
              >
                {loading ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.verifyText}>Verify & Create Account</Text>
                )}
              </TouchableOpacity>
            </View>

            {/* Footer */}
            <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>

            {/* Help Text */}
            <Text style={styles.helpText}>
              Didn't receive the code? Check your spam folder or try resending.
            </Text>
          </LinearGradient>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  container: {
    width: '100%',
    maxWidth: 400,
  },
  modalContent: {
    borderRadius: 24,
    padding: 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.4,
    shadowRadius: 24,
    elevation: 20,
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.1)',
  },
  header: {
    alignItems: 'center',
    marginBottom: 28,
  },
  iconContainer: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontFamily: 'Inter-Bold',
    color: '#1F2937',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 24,
  },
  emailHighlight: {
    color: '#8B5CF6',
    fontFamily: 'Inter-Bold',
  },
  codeSection: {
    marginBottom: 20,
  },
  codeLabel: {
    fontSize: 16,
    fontFamily: 'Inter-Bold',
    color: '#374151',
    marginBottom: 12,
    textAlign: 'center',
  },
  codeInput: {
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    padding: 18,
    fontSize: 24,
    color: '#1F2937',
    fontFamily: 'Inter-Bold',
    textAlign: 'center',
    borderWidth: 2,
    borderColor: '#E2E8F0',
    letterSpacing: 8,
  },
  timerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  timerText: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    color: '#6B7280',
    marginLeft: 6,
  },
  buttonContainer: {
    gap: 12,
    marginBottom: 16,
  },
  resendButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 16,
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.2)',
  },
  resendText: {
    fontSize: 16,
    fontFamily: 'Inter-Bold',
    color: '#8B5CF6',
    marginLeft: 8,
  },
  verifyButton: {
    backgroundColor: '#8B5CF6',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 16,
    alignItems: 'center',
    shadowColor: '#8B5CF6',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  disabledButton: {
    backgroundColor: '#9CA3AF',
    shadowOpacity: 0.1,
  },
  verifyText: {
    fontSize: 16,
    fontFamily: 'Inter-Bold',
    color: '#FFFFFF',
  },
  cancelButton: {
    alignItems: 'center',
    paddingVertical: 12,
    marginBottom: 12,
  },
  cancelText: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
    color: '#6B7280',
  },
  helpText: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: '#9CA3AF',
    textAlign: 'center',
    lineHeight: 20,
  },
});
