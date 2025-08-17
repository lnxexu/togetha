import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import AppNavigator from "./app/navigation/AppNavigator";
import Toast from "react-native-toast-message";
import { TaskProvider } from './app/context/TaskContext';
import { TaskNotificationChecker } from "./app/notifications/components/TaskNotificationChecker";

// import { LogsProvider } from './app/logs/services/logProvider';

SplashScreen.preventAutoHideAsync();

export default function App() {
  const [fontsLoaded] = useFonts({
    "Inter-Medium": require("./assets/fonts/Inter_24pt-Medium.ttf"),
    "Inter-Regular": require("./assets/fonts/Inter_24pt-Regular.ttf"),
    "Inter-Bold": require("./assets/fonts/Inter_24pt-SemiBold.ttf"),
    Lexend: require("./assets/fonts/Lexend-SemiBold.ttf"),
  });

  // Remove this line - it's causing the error
  // useSessionMonitor();

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color="#6A009C" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
        <TaskProvider>
          <AppNavigator />
          <TaskNotificationChecker />
          <Toast />
        </TaskProvider>
    </SafeAreaProvider>
  );
}
