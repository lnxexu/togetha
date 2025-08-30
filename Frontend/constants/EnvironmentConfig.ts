// API Configuration for different environments
// This file can be committed as it contains no sensitive data

export interface EnvironmentConfig {
  apiUrl: string;
  ollamaApiUrl: string;
  environment: 'development' | 'staging' | 'production';
  debug: boolean;
}

export const DEFAULT_CONFIG: EnvironmentConfig = {
  apiUrl: 'http://localhost:8000',
  ollamaApiUrl: 'http://localhost:11434',
  environment: 'development',
  debug: true,
};

// Platform-specific default URLs for development
export const PLATFORM_DEFAULTS = {
  android: {
    emulator: {
      apiUrl: 'http://10.0.2.2:8000',
      ollamaApiUrl: 'http://10.0.2.2:11434',
    },
  },
  ios: {
    simulator: {
      apiUrl: 'http://localhost:8000',
      ollamaApiUrl: 'http://localhost:11434',
    },
  },
  web: {
    apiUrl: 'http://localhost:8000',
    ollamaApiUrl: 'http://localhost:11434',
  },
};
