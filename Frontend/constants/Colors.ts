/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

const tintColorLight = '#0a7ea4';
const tintColorDark = '#fff';

export const Colors = {
  light: {
    text: '#11181C',
    background: '#fff',
    tint: tintColorLight,
    icon: '#687076',
    tabIconDefault: '#687076',
    tabIconSelected: tintColorLight,
  },
  dark: {
    text: '#ECEDEE',
    background: '#151718',
    tint: tintColorDark,
    icon: '#9BA1A6',
    tabIconDefault: '#9BA1A6',
    tabIconSelected: tintColorDark,
  },
};

// Modern Purple Color Scheme for Onboarding
export const OnboardingColors = {
  // Primary purple palette
  primary: {
    main: '#8B5CF6', // Vibrant purple
    light: '#A78BFA', // Light purple
    dark: '#7C3AED', // Dark purple
    accent: '#C084FC', // Accent purple
  },
  
  // Background colors
  background: {
    primary: '#FAFAFA', // Very light gray
    secondary: '#F8FAFC', // Light gray-white
    purple: '#F3F4F6', // Light purple-gray
    gradient: ['#FAF5FF', '#F3E8FF'], // Purple gradient
  },
  
  // Text colors
  text: {
    primary: '#1F2937', // Dark gray
    secondary: '#6B7280', // Medium gray
    light: '#9CA3AF', // Light gray
    accent: '#7C3AED', // Purple accent
    white: '#FFFFFF',
  },
  
  // Input and form colors
  input: {
    background: '#FFFFFF',
    border: '#E5E7EB',
    focusBorder: '#8B5CF6',
    placeholder: '#9CA3AF',
    icon: '#6B7280',
  },
  
  // Button colors
  button: {
    primary: '#8B5CF6',
    primaryHover: '#7C3AED',
    secondary: '#FFFFFF',
    secondaryBorder: '#E5E7EB',
    google: '#FFFFFF',
    googleBorder: '#E5E7EB',
    googleHover: '#F9FAFB',
  },
  
  // Status colors
  status: {
    success: '#10B981',
    error: '#EF4444',
    warning: '#F59E0B',
    info: '#3B82F6',
  },
  
  // Shadow colors
  shadow: {
    light: 'rgba(0, 0, 0, 0.1)',
    medium: 'rgba(0, 0, 0, 0.15)',
    heavy: 'rgba(0, 0, 0, 0.25)',
    purple: 'rgba(139, 92, 246, 0.3)',
  },
};
