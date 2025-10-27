// Team configuration templates
// This file can be safely committed as it contains no actual sensitive data
// Copy the appropriate template to your .env file

export const CONFIGURATION_TEMPLATES = {
  // Template for local development
  LOCAL_DEVELOPMENT: `# Local Development Configuration
EXPO_PUBLIC_API_URL=http://localhost:8000
EXPO_PUBLIC_ENVIRONMENT=development
EXPO_PUBLIC_DEBUG=true`,

  // Template for team development with real devices
  TEAM_DEVELOPMENT: `# Team Development Configuration
# Replace YOUR_LOCAL_IP with your actual IP address
EXPO_PUBLIC_API_URL=http://YOUR_LOCAL_IP:8000
EXPO_PUBLIC_ENVIRONMENT=development
EXPO_PUBLIC_DEBUG=true`,

  // Template for staging environment
  STAGING: `# Staging Environment Configuration
EXPO_PUBLIC_API_URL=https://your-staging-domain.com/api
EXPO_PUBLIC_ENVIRONMENT=staging
EXPO_PUBLIC_DEBUG=false`,

  // Template for production environment
  PRODUCTION: `# Production Environment Configuration
EXPO_PUBLIC_API_URL=https://your-production-domain.com/api
EXPO_PUBLIC_ENVIRONMENT=production
EXPO_PUBLIC_DEBUG=false`,
};

// Common IP address patterns for reference (DO NOT USE ACTUAL VALUES HERE)
export const IP_EXAMPLES = {
  ANDROID_EMULATOR: '10.0.2.2',
  IOS_SIMULATOR: 'localhost',
  COMMON_LOCAL_RANGES: [
    '192.168.x.x (Most home networks)',
    '10.x.x.x (Corporate networks)',
    '172.16.x.x to 172.31.x.x (Private networks)',
  ],
};
