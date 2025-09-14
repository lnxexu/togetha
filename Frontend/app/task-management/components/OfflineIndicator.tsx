import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Animated,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import taskService from '../services/taskService';

interface OfflineIndicatorProps {
  style?: any;
}

const OfflineIndicator: React.FC<OfflineIndicatorProps> = ({ style }) => {
  const [isOnline, setIsOnline] = useState(true);
  const [hasPendingChanges, setHasPendingChanges] = useState(false);
  const [syncStatus, setSyncStatus] = useState({ isSyncing: false, pendingOperations: 0 });
  const [slideAnim] = useState(new Animated.Value(-100));
  
  useEffect(() => {
    // Initialize status
    updateStatus();
    
    // Add network status listener
    const unsubscribe = taskService.addNetworkStatusListener((status) => {
      setIsOnline(status.isConnected && status.isInternetReachable !== false);
      updateStatus();
    });

    // Check sync status periodically
    const syncInterval = setInterval(() => {
      updateSyncStatus();
    }, 2000);

    return () => {
      unsubscribe();
      clearInterval(syncInterval);
    };
  }, []);

  useEffect(() => {
    // Animate indicator appearance
    if (!isOnline || hasPendingChanges || syncStatus.isSyncing) {
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: -100,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }
  }, [isOnline, hasPendingChanges, syncStatus.isSyncing]);

  const updateStatus = async () => {
    try {
      const networkStatus = taskService.getNetworkStatus();
      setIsOnline(networkStatus.isConnected && networkStatus.isInternetReachable !== false);
      
      const pending = await taskService.hasPendingChanges();
      setHasPendingChanges(pending);
    } catch (error) {
      console.error('Error updating status:', error);
    }
  };

  const updateSyncStatus = () => {
    try {
      const status = taskService.getSyncStatus();
      setSyncStatus(status);
    } catch (error) {
      console.error('Error getting sync status:', error);
    }
  };

  const handleSyncPress = async () => {
    if (!isOnline) {
      Alert.alert(
        'Offline',
        'Cannot sync while offline. Please check your internet connection.',
        [{ text: 'OK' }]
      );
      return;
    }

    if (syncStatus.isSyncing) {
      Alert.alert(
        'Sync in Progress',
        'Synchronization is already in progress. Please wait...',
        [{ text: 'OK' }]
      );
      return;
    }

    try {
      await taskService.syncWithServer();
      Alert.alert(
        'Sync Complete',
        'Your tasks have been synchronized successfully.',
        [{ text: 'OK' }]
      );
      updateStatus();
    } catch (error) {
      console.error('Sync error:', error);
      Alert.alert(
        'Sync Failed',
        `Failed to synchronize tasks: ${error instanceof Error ? error.message : 'Unknown error'}`,
        [{ text: 'OK' }]
      );
    }
  };

  const getStatusText = () => {
    if (syncStatus.isSyncing) {
      return 'Syncing...';
    }
    if (!isOnline) {
      return 'Offline';
    }
    if (hasPendingChanges) {
      return 'Changes pending sync';
    }
    return 'Online';
  };

  const getStatusIcon = () => {
    if (syncStatus.isSyncing) {
      return 'sync';
    }
    if (!isOnline) {
      return 'cloud-off';
    }
    if (hasPendingChanges) {
      return 'cloud-upload';
    }
    return 'cloud-done';
  };

  const getStatusColor = () => {
    if (syncStatus.isSyncing) {
      return '#2196F3'; // Blue for syncing
    }
    if (!isOnline) {
      return '#F44336'; // Red for offline
    }
    if (hasPendingChanges) {
      return '#FF9800'; // Orange for pending changes
    }
    return '#4CAF50'; // Green for online and synced
  };

  return (
    <Animated.View
      style={[
        styles.container,
        { 
          transform: [{ translateY: slideAnim }],
          backgroundColor: getStatusColor(),
        },
        style
      ]}
    >
      <TouchableOpacity
        style={styles.content}
        onPress={handleSyncPress}
        disabled={!isOnline || syncStatus.isSyncing}
      >
        <MaterialIcons
          name={getStatusIcon()}
          size={16}
          color="white"
          style={syncStatus.isSyncing ? styles.rotating : undefined}
        />
        <Text style={styles.statusText}>{getStatusText()}</Text>
        {hasPendingChanges && syncStatus.pendingOperations > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{syncStatus.pendingOperations}</Text>
          </View>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingVertical: 8,
    zIndex: 1000,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '500',
    marginLeft: 8,
  },
  badge: {
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  badgeText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
  rotating: {
    // Note: For a proper rotating animation, you'd need to use Animated.createAnimatedComponent
    // and implement a rotation animation. This is a placeholder.
  },
});

export default OfflineIndicator;