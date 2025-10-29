// API Configuration for different environments
// This file can be committed as it contains no sensitive data

export interface EnvironmentConfig {
  apiUrl: string;
  environment: 'development' | 'staging' | 'production';
  debug: boolean;
}
//change ni sa IP address atm
export const DEFAULT_CONFIG: EnvironmentConfig = {
  apiUrl: 'http://192.168.1.187:8000',
  environment: 'development',
  debug: true,
};

// Platform-specific default URLs for development
export const PLATFORM_DEFAULTS = {
  android: {
    emulator: {
      apiUrl: 'http://10.0.2.2:8000',
    },
  },
  ios: {
    simulator: {
      apiUrl: 'http://localhost:8000',
    },
  },
  web: {
    apiUrl: 'http://localhost:8000',
  },
};
