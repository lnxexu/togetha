import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  TouchableOpacity,
  Dimensions,
  StatusBar,
  Platform,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

const { width } = Dimensions.get('window');

interface NotificationProps {
  id: string;
  type: 'status' | 'heads-up' | 'drawer';
  title: string;
  message: string;
  priority: 'high' | 'medium' | 'low';
  icon?: keyof typeof MaterialIcons.glyphMap;
  duration?: number;
  onPress?: () => void;
  onDismiss?: () => void;
  visible: boolean;
}

// Status Bar Notification (minimal, stays at top)
export const StatusNotification: React.FC<NotificationProps> = ({
  title,
  message,
  priority,
  icon = 'notifications',
  onPress,
  onDismiss,
  visible,
}) => {
  const [fadeAnim] = useState(new Animated.Value(0));
  const [slideAnim] = useState(new Animated.Value(-100));

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: -100,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible]);

  if (!visible) return null;

  const getStatusColor = (): [string, string] => {
    switch (priority) {
      case 'high': return ['#EF4444', '#DC2626'];
      case 'medium': return ['#F59E0B', '#D97706'];
      case 'low': return ['#10B981', '#059669'];
      default: return ['#6366F1', '#4F46E5'];
    }
  };

  return (
    <Animated.View
      style={[
        styles.statusContainer,
        {
          opacity: fadeAnim,
          transform: [{ translateY: slideAnim }],
        },
      ]}
    >
      <LinearGradient
        colors={getStatusColor() as any as [string, string]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.statusGradient}
      >
        <TouchableOpacity
          style={styles.statusContent}
          onPress={onPress}
          activeOpacity={0.8}
        >
          <MaterialIcons name={icon} size={16} color="#FFFFFF" />
          <Text style={styles.statusText} numberOfLines={1}>
            {title}: {message}
          </Text>
        </TouchableOpacity>
        
        {onDismiss && (
          <TouchableOpacity onPress={onDismiss} style={styles.statusDismiss}>
            <MaterialIcons name="close" size={16} color="#FFFFFF" />
          </TouchableOpacity>
        )}
      </LinearGradient>
    </Animated.View>
  );
};

// Heads-up Notification (prominent, overlays content)
export const HeadsUpNotification: React.FC<NotificationProps> = ({
  title,
  message,
  priority,
  icon = 'notifications',
  onPress,
  onDismiss,
  visible,
  duration = 5000,
}) => {
  const [fadeAnim] = useState(new Animated.Value(0));
  const [slideAnim] = useState(new Animated.Value(-200));
  const [progressAnim] = useState(new Animated.Value(0));

  useEffect(() => {
    if (visible) {
      // Show animation
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 400,
          useNativeDriver: true,
        }),
      ]).start();

      // Progress bar animation
      Animated.timing(progressAnim, {
        toValue: 1,
        duration: duration,
        useNativeDriver: false,
      }).start();

      // Auto dismiss
      const timer = setTimeout(() => {
        onDismiss?.();
      }, duration);

      return () => clearTimeout(timer);
    } else {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: -200,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible]);

  if (!visible) return null;

  const getHeadsUpColor = () => {
    switch (priority) {
      case 'high': return '#EF4444';
      case 'medium': return '#F59E0B';
      case 'low': return '#10B981';
      default: return '#6366F1';
    }
  };

  return (
    <Animated.View
      style={[
        styles.headsUpContainer,
        {
          opacity: fadeAnim,
          transform: [{ translateY: slideAnim }],
        },
      ]}
    >
      <TouchableOpacity
        style={styles.headsUpCard}
        onPress={onPress}
        activeOpacity={0.9}
      >
        <View style={styles.headsUpContent}>
          <View style={[styles.headsUpIcon, { backgroundColor: `${getHeadsUpColor()}20` }]}>
            <MaterialIcons name={icon} size={24} color={getHeadsUpColor()} />
          </View>
          
          <View style={styles.headsUpText}>
            <Text style={styles.headsUpTitle} numberOfLines={1}>
              {title}
            </Text>
            <Text style={styles.headsUpMessage} numberOfLines={2}>
              {message}
            </Text>
          </View>
          
          {onDismiss && (
            <TouchableOpacity onPress={onDismiss} style={styles.headsUpDismiss}>
              <MaterialIcons name="close" size={20} color="#9CA3AF" />
            </TouchableOpacity>
          )}
        </View>
        
        {/* Progress bar */}
        <View style={styles.progressContainer}>
          <Animated.View
            style={[
              styles.progressBar,
              {
                backgroundColor: getHeadsUpColor(),
                width: progressAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['0%', '100%'],
                }),
              },
            ]}
          />
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
};

// Drawer Notification (slides from side, persistent)
export const DrawerNotification: React.FC<NotificationProps> = ({
  title,
  message,
  priority,
  icon = 'notifications',
  onPress,
  onDismiss,
  visible,
}) => {
  const [slideAnim] = useState(new Animated.Value(width));
  const [fadeAnim] = useState(new Animated.Value(0));

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 400,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: width,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible]);

  if (!visible) return null;

  const getDrawerColor = () => {
    switch (priority) {
      case 'high': return '#EF4444';
      case 'medium': return '#F59E0B';
      case 'low': return '#10B981';
      default: return '#6366F1';
    }
  };

  return (
    <Animated.View
      style={[
        styles.drawerContainer,
        {
          opacity: fadeAnim,
          transform: [{ translateX: slideAnim }],
        },
      ]}
    >
      <View style={[styles.drawerCard, { borderLeftColor: getDrawerColor() }]}>
        <TouchableOpacity
          style={styles.drawerContent}
          onPress={onPress}
          activeOpacity={0.8}
        >
          <View style={[styles.drawerIcon, { backgroundColor: `${getDrawerColor()}20` }]}>
            <MaterialIcons name={icon} size={28} color={getDrawerColor()} />
          </View>
          
          <View style={styles.drawerText}>
            <Text style={styles.drawerTitle}>
              {title}
            </Text>
            <Text style={styles.drawerMessage}>
              {message}
            </Text>
            <Text style={styles.drawerTime}>
              {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Text>
          </View>
        </TouchableOpacity>
        
        {onDismiss && (
          <TouchableOpacity onPress={onDismiss} style={styles.drawerDismiss}>
            <MaterialIcons name="close" size={24} color="#9CA3AF" />
          </TouchableOpacity>
        )}
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  // Status Notification Styles
  statusContainer: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 44 : StatusBar.currentHeight || 0,
    left: 0,
    right: 0,
    zIndex: 1000,
  },
  statusGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  statusContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    flex: 1,
  },
  statusDismiss: {
    padding: 4,
  },

  // Heads-up Notification Styles
  headsUpContainer: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 80 : (StatusBar.currentHeight || 0) + 60,
    left: 16,
    right: 16,
    zIndex: 1000,
  },
  headsUpCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    overflow: 'hidden',
  },
  headsUpContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 16,
  },
  headsUpIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  headsUpText: {
    flex: 1,
  },
  headsUpTitle: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: '#1E293B',
    marginBottom: 4,
  },
  headsUpMessage: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: '#64748B',
    lineHeight: 20,
  },
  headsUpDismiss: {
    padding: 4,
    marginLeft: 8,
  },
  progressContainer: {
    height: 3,
    backgroundColor: '#E5E7EB',
  },
  progressBar: {
    height: '100%',
    borderRadius: 2,
  },

  // Drawer Notification Styles
  drawerContainer: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 120 : (StatusBar.currentHeight || 0) + 100,
    right: 16,
    width: width * 0.85,
    zIndex: 1000,
  },
  drawerCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 6,
    flexDirection: 'row',
    alignItems: 'center',
  },
  drawerContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 16,
  },
  drawerIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  drawerText: {
    flex: 1,
  },
  drawerTitle: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: '#1E293B',
    marginBottom: 4,
  },
  drawerMessage: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: '#64748B',
    lineHeight: 18,
    marginBottom: 4,
  },
  drawerTime: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    color: '#9CA3AF',
  },
  drawerDismiss: {
    padding: 12,
  },
});