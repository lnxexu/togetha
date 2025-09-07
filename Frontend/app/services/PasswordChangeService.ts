// Enhanced Password Change Service with Security Verification
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_BASE_URL = 'http://192.168.1.134:8000';

export interface PasswordChangeData {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export interface SecurityVerificationData {
  verificationCode: string;
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export const sendPasswordChangeVerification = async (): Promise<{
  success: boolean;
  message: string;
  email?: string;
}> => {
  try {
    const token = await AsyncStorage.getItem('access_token');
    
    if (!token) {
      throw new Error('Authentication token not found');
    }

    const response = await fetch(`${API_BASE_URL}/users/send-password-change-verification/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Failed to send verification code');
    }

    return {
      success: true,
      message: data.message,
      email: data.email,
    };
  } catch (error) {
    console.error('Send verification error:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Network error occurred',
    };
  }
};

export const verifyAndChangePassword = async (data: SecurityVerificationData): Promise<{
  success: boolean;
  message: string;
}> => {
  try {
    const token = await AsyncStorage.getItem('access_token');
    
    if (!token) {
      throw new Error('Authentication token not found');
    }

    const response = await fetch(`${API_BASE_URL}/users/verify-password-change/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        verification_code: data.verificationCode,
        current_password: data.currentPassword,
        new_password: data.newPassword,
        confirm_password: data.confirmPassword,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || 'Failed to change password');
    }

    return {
      success: true,
      message: result.message || 'Password changed successfully',
    };
  } catch (error) {
    console.error('Password change error:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Network error occurred',
    };
  }
};

export const validatePasswordStrength = (password: string) => {
  const requirements = {
    minLength: password.length >= 8,
    hasUppercase: /[A-Z]/.test(password),
    hasLowercase: /[a-z]/.test(password),
    hasNumbers: /\d/.test(password),
    hasSpecialChars: /[!@#$%^&*(),.?":{}|<>]/.test(password),
  };

  const score = Object.values(requirements).filter(Boolean).length;
  
  let strength: 'weak' | 'fair' | 'good' | 'strong' = 'weak';
  let color = '#EF4444'; // red
  
  if (score >= 5) {
    strength = 'strong';
    color = '#10B981'; // green
  } else if (score >= 4) {
    strength = 'good';
    color = '#F59E0B'; // yellow
  } else if (score >= 2) {
    strength = 'fair';
    color = '#F97316'; // orange
  }

  return {
    requirements,
    strength,
    color,
    score,
    width: (score / 5) * 100,
  };
};
