import { useEffect, useRef } from 'react';
import { Alert, AppState, AppStateStatus } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import AuthService from '../app/onboarding/service/AuthService';
import { RootStackParamList } from '../app/navigation/AppNavigator';
import { NativeStackNavigationProp } from "@react-navigation/native-stack";


export default function useSessionMonitor() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const appStateRef = useRef(AppState.currentState);
  const checkIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const authService = AuthService.getInstance();
    
    // Function to check session validity
    const checkSession = async () => {
      try {
        const isAuthenticated = await authService.isAuthenticated();
        if (!isAuthenticated) return; // Skip if not logged in
        
        const isValid = await authService.testToken();
        if (!isValid) {
          // Session is no longer valid, show message and redirect to login
          Alert.alert(
            "Session Expired",
            "Your account has been logged in on another device. Please log in again.",
            [
              { 
                text: "OK", 
                onPress: () => {
                  // Navigate to login screen
                  navigation.reset({
                    index: 0,
                    routes: [{ name: 'Login' as keyof RootStackParamList }],
                  });
                }
              }
            ]
          );
        }
      } catch (error) {
        console.error("Session check error:", error);
      }
    };
    
    // Set up app state change listener
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (
        appStateRef.current.match(/inactive|background/) && 
        nextAppState === 'active'
      ) {
        // App has come to the foreground
        console.log('App has come to the foreground!');
        checkSession();
      }
      appStateRef.current = nextAppState;
    });
    
    // Set up periodic check while app is open
    checkIntervalRef.current = setInterval(checkSession, 60000); // Check every minute
    
    // Initial check
    checkSession();
    
    // Cleanup
    return () => {
      subscription.remove();
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
      }
    };
  }, [navigation]);
}