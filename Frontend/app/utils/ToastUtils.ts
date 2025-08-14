import Toast from 'react-native-toast-message';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export const showToast = (message: string, type: ToastType = 'info') => {
  Toast.show({
    type: type,
    text1: getToastTitle(type),
    text2: message,
    position: 'top',
    visibilityTime: 3500, // Slightly shorter for better UX
    autoHide: true,
    topOffset: 60, // Better positioning
  });
};

const getToastTitle = (type: ToastType): string => {
  switch (type) {
    case 'success':
      return 'Success';
    case 'error':
      return 'Error';
    case 'warning':
      return 'Warning';
    case 'info':
    default:
      return 'Info';
  }
};

// Specific helper functions for common use cases
export const showSuccessToast = (message: string) => showToast(message, 'success');
export const showErrorToast = (message: string) => showToast(message, 'error');
export const showInfoToast = (message: string) => showToast(message, 'info');
export const showWarningToast = (message: string) => showToast(message, 'warning');
