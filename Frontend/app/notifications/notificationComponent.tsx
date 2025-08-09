import React, { useEffect, useState, useRef } from 'react';
import { 
  Animated, 
  StyleSheet, 
  Text, 
  TouchableOpacity, 
  View,
  Dimensions
} from 'react-native';
import { MaterialIcons } from "@expo/vector-icons";
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';

interface NotificationProps {
  id: string;
  title: string;
  message: string;
  type: 'task' | 'note' | 'reminder' | 'system';
  priority: 'high' | 'medium' | 'low';
  actionId?: string;
  onDismiss: () => void;
}

const { width } = Dimensions.get('window');

export const InAppNotification: React.FC<NotificationProps> = ({ 
  id, title, message, type, priority, actionId, onDismiss 
}) => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const translateY = useRef(new Animated.Value(-100)).current;
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Slide in
    Animated.timing(translateY, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start();

    // Auto dismiss after 5 seconds
    const timer = setTimeout(() => {
      dismiss();
    }, 5000);

    return () => clearTimeout(timer);
  }, []);

  const dismiss = () => {
    if (dismissed) return;
    setDismissed(true);
    
    Animated.timing(translateY, {
      toValue: -100,
      duration: 300,
      useNativeDriver: true,
    }).start(() => {
      onDismiss();
    });
  };

  const handlePress = () => {
    dismiss();
    
    // Navigate based on notification type
    switch (type) {
      case 'task':
        if (actionId) {
          navigation.navigate("Home"); // Navigate to task details in the future
        }
        break;
      case 'note':
        if (actionId) {
          navigation.navigate("Notes");
        }
        break;
      case 'reminder':
        navigation.navigate("Home");
        break;
      default:
        break;
    }
  };

  const getNotificationIcon = (): keyof typeof MaterialIcons.glyphMap => {
    switch (type) {
      case 'task':
        return 'assignment';
      case 'note':
        return 'note';
      case 'reminder':
        return 'alarm';
      case 'system':
        return 'info';
      default:
        return 'notifications';
    }
  };

  const getNotificationColor = () => {
    if (priority === 'high') return '#EF4444';
    
    switch (type) {
      case 'task':
        return '#3B82F6';
      case 'note':
        return '#10B981';
      case 'reminder':
        return '#F59E0B';
      case 'system':
        return '#8B5CF6';
      default:
        return '#6B7280';
    }
  };

  return (
    <Animated.View 
      style={[
        styles.container,
        { transform: [{ translateY }] }
      ]}
    >
      <TouchableOpacity 
        style={styles.content}
        onPress={handlePress}
        activeOpacity={0.9}
      >
        <View style={[
          styles.iconContainer, 
          { backgroundColor: `${getNotificationColor()}20` }
        ]}>
          <MaterialIcons 
            name={getNotificationIcon()} 
            size={24} 
            color={getNotificationColor()} 
          />
        </View>
        <View style={styles.textContainer}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message} numberOfLines={2}>
            {message}
          </Text>
        </View>
        <TouchableOpacity 
          onPress={dismiss}
          style={styles.closeButton}
          hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
        >
          <MaterialIcons name="close" size={20} color="#9CA3AF" />
        </TouchableOpacity>
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
    backgroundColor: 'transparent',
    paddingHorizontal: 16,
    paddingTop: 8,
    zIndex: 1000,
    elevation: 5,
  },
  content: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.6)',
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  textContainer: {
    flex: 1,
    paddingRight: 8,
  },
  title: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: '#1E293B',
    marginBottom: 2,
  },
  message: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: '#64748B',
  },
  closeButton: {
    padding: 4,
  },
});