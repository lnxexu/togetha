import React, { useState, useEffect } from "react";
import { Text, StyleSheet, Animated } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import networkService from "../../task-management/services/networkService";
import offlineStorage from "../services/offlineStorage";

interface OfflineIndicatorProps {
  style?: any;
  showSyncStatus?: boolean;
}

export const OfflineIndicator: React.FC<OfflineIndicatorProps> = ({
  style,
  showSyncStatus = true,
}) => {
  const [isOnline, setIsOnline] = useState(networkService.isOnline());
  const [pendingCount, setPendingCount] = useState(0);
  const fadeAnim = new Animated.Value(0);

  useEffect(() => {
    const unsubscribeNetwork = networkService.addNetworkStatusListener(
      (status: any) => {
        setIsOnline(status.isConnected);
        if (status.isConnected && showSyncStatus) {
          checkPendingOperations();
        }
      }
    );

    checkPendingOperations();
    const interval = setInterval(checkPendingOperations, 5000);

    return () => {
      unsubscribeNetwork();
      clearInterval(interval);
    };
  }, [showSyncStatus]);

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: !isOnline || pendingCount > 0 ? 1 : 0,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [isOnline, pendingCount]);

  const checkPendingOperations = async () => {
    try {
      const pendingOps = await offlineStorage.getPendingSyncOperations();
      setPendingCount(pendingOps.length);
    } catch (error) {
      console.error("Failed to check pending operations:", error);
    }
  };

  const getIndicatorContent = () => {
    if (!isOnline) {
      return {
        icon: "cloud-offline-outline" as const,
        text: "Offline",
        color: "#FF6B6B",
        backgroundColor: "#FFE5E5",
      };
    }

    if (pendingCount > 0) {
      return {
        icon: "cloud-upload-outline" as const,
        text: `${pendingCount} pending`,
        color: "#FFB74D",
        backgroundColor: "#FFF3E0",
      };
    }

    return null;
  };

  const content = getIndicatorContent();

  if (!content) {
    return null;
  }

  return (
    <Animated.View
      style={[
        styles.container,
        {
          backgroundColor: content.backgroundColor,
          opacity: fadeAnim,
        },
        style,
      ]}
    >
      <Ionicons name={content.icon} size={16} color={content.color} />
      <Text style={[styles.text, { color: content.color }]}>
        {content.text}
      </Text>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginHorizontal: 4,
  },
  text: {
    fontSize: 12,
    fontWeight: "500",
    marginLeft: 6,
  },
});

export default OfflineIndicator;
