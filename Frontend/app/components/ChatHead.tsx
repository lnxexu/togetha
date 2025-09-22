import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Dimensions,
  Modal,
  PanResponder,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const CHAT_HEAD_SIZE = 60;
const SNAP_EDGE_THRESHOLD = 50;

interface ChatHeadProps {
  visible: boolean;
  onPress: () => void;
  onClose: () => void;
  unreadCount?: number;
}

export const ChatHead: React.FC<ChatHeadProps> = ({
  visible,
  onPress,
  onClose,
  unreadCount = 0,
}) => {
  const [position, setPosition] = useState({ x: SCREEN_WIDTH - 80, y: SCREEN_HEIGHT / 2 });
  const translateX = useRef(new Animated.Value(position.x)).current;
  const translateY = useRef(new Animated.Value(position.y)).current;
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(visible ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: visible ? 1 : 0,
      duration: 300,
      useNativeDriver: false, // Changed to false to fix animation error
    }).start();
  }, [visible]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (evt, gestureState) => {
        return Math.abs(gestureState.dx) > 2 || Math.abs(gestureState.dy) > 2;
      },
      onPanResponderGrant: () => {
        translateX.setOffset(position.x);
        translateY.setOffset(position.y);
        translateX.setValue(0);
        translateY.setValue(0);
        
        Animated.timing(scale, {
          toValue: 1.1,
          duration: 100,
          useNativeDriver: false,
        }).start();
      },
      onPanResponderMove: Animated.event(
        [null, { dx: translateX, dy: translateY }],
        { useNativeDriver: false }
      ),
      onPanResponderRelease: (evt, gestureState) => {
        translateX.flattenOffset();
        translateY.flattenOffset();

        const newX = position.x + gestureState.dx;
        const newY = position.y + gestureState.dy;

        // Snap to edges
        const snapX = newX < SCREEN_WIDTH / 2 ? SNAP_EDGE_THRESHOLD : SCREEN_WIDTH - CHAT_HEAD_SIZE - SNAP_EDGE_THRESHOLD;
        const boundedY = Math.max(50, Math.min(SCREEN_HEIGHT - CHAT_HEAD_SIZE - 50, newY));

        const finalPosition = { x: snapX, y: boundedY };

        Animated.parallel([
          Animated.spring(translateX, {
            toValue: finalPosition.x,
            useNativeDriver: false,
            tension: 100,
            friction: 8,
          }),
          Animated.spring(translateY, {
            toValue: finalPosition.y,
            useNativeDriver: false,
            tension: 100,
            friction: 8,
          }),
          Animated.spring(scale, {
            toValue: 1,
            useNativeDriver: false,
            tension: 100,
            friction: 8,
          }),
        ]).start();

        setPosition(finalPosition);
      },
    })
  ).current;

  const handlePress = () => {
    Animated.sequence([
      Animated.timing(scale, {
        toValue: 0.9,
        duration: 100,
        useNativeDriver: false,
      }),
      Animated.timing(scale, {
        toValue: 1,
        duration: 100,
        useNativeDriver: false,
      }),
    ]).start();

    onPress();
  };

  if (!visible) return null;

  return (
    <Modal
      transparent
      visible={visible}
      animationType="none"
      pointerEvents="box-none"
      statusBarTranslucent={true}
    >
      <View style={styles.container} pointerEvents="box-none">
        <Animated.View
          style={[
            styles.chatHead,
            {
              transform: [
                { translateX },
                { translateY },
                { scale },
              ],
              opacity,
            },
          ]}
          pointerEvents="box-none"
          {...panResponder.panHandlers}
        >
          <TouchableOpacity
            style={styles.chatHeadButton}
            onPress={handlePress}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={['#6A009C', '#8B5CF6', '#A855F7']}
              style={styles.gradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <MaterialIcons name="chat" size={28} color="#FFFFFF" />
              
              {unreadCount > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </Text>
                </View>
              )}
            </LinearGradient>
          </TouchableOpacity>

          {/* Close button - shows on long press */}
          <TouchableOpacity
            style={styles.closeButton}
            onPress={onClose}
            activeOpacity={0.8}
          >
            <MaterialIcons name="close" size={16} color="#FFFFFF" />
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'transparent',
  },
  chatHead: {
    position: 'absolute',
    width: CHAT_HEAD_SIZE,
    height: CHAT_HEAD_SIZE,
    zIndex: 9999,
    elevation: 10,
  },
  chatHeadButton: {
    width: CHAT_HEAD_SIZE,
    height: CHAT_HEAD_SIZE,
    borderRadius: CHAT_HEAD_SIZE / 2,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 4.65,
  },
  gradient: {
    width: '100%',
    height: '100%',
    borderRadius: CHAT_HEAD_SIZE / 2,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: -5,
    right: -5,
    backgroundColor: '#FF4444',
    borderRadius: 12,
    minWidth: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  closeButton: {
    position: 'absolute',
    top: -8,
    left: -8,
    width: 24,
    height: 24,
    backgroundColor: '#FF4444',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
});