// Email Verification Service for Multi-Factor Authentication
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from '../../constants/ApiConfig';

const API_BASE_URL = API_URL;

// Test connectivity to the backend server
export const testServerConnectivity = async (): Promise<{
  success: boolean;
  message: string;
  url: string;
}> => {
  try {
    console.log('Testing connectivity to:', API_BASE_URL);
    const response = await fetch(`${API_BASE_URL}/users/csrf-token/`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    return {
      success: response.ok,
      message: response.ok ? 'Server is accessible' : `Server responded with status ${response.status}`,
      url: API_BASE_URL,
    };
  } catch (error) {
    console.error('Connectivity test failed:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Connection test failed',
      url: API_BASE_URL,
    };
  }
};

export interface EmailVerificationData {
  email: string;
  username: string;
}

export interface SignupVerificationData {
  email: string;
  username: string;
  password: string;
  verificationCode: string;
}

export const sendEmailVerification = async (data: EmailVerificationData): Promise<{
  success: boolean;
  message: string;
  email?: string;
}> => {
  try {
    console.log('Attempting to send email verification to:', `${API_BASE_URL}/users/send-email-verification/`);
    console.log('Request data:', data);
    
    const response = await fetch(`${API_BASE_URL}/users/send-email-verification/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: data.email,
        username: data.username,
      }),
    });

    const result = await response.json();
    console.log('Response status:', response.status);
    console.log('Response data:', result);

    if (!response.ok) {
      throw new Error(result.message || 'Failed to send verification email');
    }

    return {
      success: true,
      message: result.message,
      email: result.email,
    };
  } catch (error) {
    console.error('Send verification error:', error);
    
    // Provide more detailed error information
    let errorMessage = 'Network error occurred';
    if (error instanceof Error) {
      if (error.message.includes('Network request failed')) {
        errorMessage = `Cannot connect to server at ${API_BASE_URL}. Please check if the backend server is running and accessible.`;
      } else {
        errorMessage = error.message;
      }
    }
    
    return {
      success: false,
      message: errorMessage,
    };
  }
};

export const verifyEmailAndSignup = async (data: SignupVerificationData): Promise<{
  success: boolean;
  message: string;
  user?: any;
}> => {
  try {
    const response = await fetch(`${API_BASE_URL}/users/verify-email-and-signup/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: data.email,
        username: data.username,
        password: data.password,
        verification_code: data.verificationCode,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || 'Failed to verify email and create account');
    }

    return {
      success: true,
      message: result.message,
      user: result.user,
    };
  } catch (error) {
    console.error('Email verification error:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Network error occurred',
    };
  }
};

export const validateEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

export const validateUsername = (username: string): boolean => {
  // Username should be 3-30 characters, alphanumeric and underscore only
  const usernameRegex = /^[a-zA-Z0-9_]{3,30}$/;
  return usernameRegex.test(username);
};

export const validatePassword = (password: string): {
  isValid: boolean;
  errors: string[];
} => {
  const errors: string[] = [];
  
  if (password.length < 8) {
    errors.push('Password must be at least 8 characters long');
  }
  
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }
  
  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }
  
  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number');
  }
  
  if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    errors.push('Password must contain at least one special character');
  }
  
  return {
    isValid: errors.length === 0,
    errors,
  };
};
