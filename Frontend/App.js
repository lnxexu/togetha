import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { ActivityIndicator, View, AppState, Platform, StatusBar } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import AppNavigator from "./app/navigation/AppNavigator";
import * as Notifications from 'expo-notifications';
import { navigationRef } from './app/navigation/navigationRef';
import Toast from "react-native-toast-message";
import { TaskProvider } from './app/contexts/TaskContext';
import { TaskNotificationChecker } from "./app/notifications/components/TaskNotificationChecker";
import { ChatHeadProvider } from './app/contexts/ChatHeadContext';
import { GlobalChatHead } from './app/components/GlobalChatHead';

// import { LogsProvider } from './app/logs/services/logProvider';

SplashScreen.preventAutoHideAsync();

export default function App() {
  const [fontsLoaded] = useFonts({
    "Inter-Medium": require("./assets/fonts/Inter_24pt-Medium.ttf"),
    "Inter-Regular": require("./assets/fonts/Inter_24pt-Regular.ttf"),
    "Inter-Bold": require("./assets/fonts/Inter_24pt-SemiBold.ttf"),
    "Lexend": require("./assets/fonts/Lexend-SemiBold.ttf"),
  });

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);
  // Navigate to TaskDetails when notification tapped with taskId
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      try {
        const data = response?.notification?.request?.content?.data;
        if (data?.action === 'open_task' && data?.taskId && navigationRef.isReady()) {
          navigationRef.navigate('TaskDetails', { taskId: String(data.taskId) });
        }
      } catch (e) {
        console.warn('Notification response handling error:', e);
      }
    });
    return () => sub?.remove();
  }, []);

  // Enhanced app state handling to prevent Android navigation bar transparency issues
  useEffect(() => {
    const handleAppStateChange = (nextAppState) => {
      if (Platform.OS === 'android') {
        if (nextAppState === 'active') {
          // When app becomes active, ensure consistent UI behavior
          StatusBar.setBarStyle('dark-content', true);
          StatusBar.setBackgroundColor('#ffffff', true);
          
          // Small delay to ensure system UI is properly set
          setTimeout(() => {
            // Force consistent navigation bar behavior
          }, 150);
        }
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    
    // Set initial status bar style
    if (Platform.OS === 'android') {
      StatusBar.setBarStyle('dark-content', true);
      StatusBar.setBackgroundColor('#ffffff', true);
    }
    
    return () => subscription?.remove();
  }, []);

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color="#6A009C" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <ChatHeadProvider>
        <TaskProvider>
          <AppNavigator />
          <TaskNotificationChecker />
          <GlobalChatHead />
          <Toast />
        </TaskProvider>
      </ChatHeadProvider>
    </SafeAreaProvider>
  );
}
