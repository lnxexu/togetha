import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';

interface ZoomIndicatorProps {
  zoom: number;
}

const ZoomIndicator: React.FC<ZoomIndicatorProps> = ({ zoom }) => {
  // Format zoom as a percentage with no decimal places
  const zoomPercentage = Math.round(zoom * 100);
  
  // Animation refs for smooth transitions
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const prevZoom = useRef(zoom);
  
  // Animate when zoom changes
  useEffect(() => {
    // Only animate significant changes to avoid constant animations
    if (Math.abs(prevZoom.current - zoom) > 0.01) {
      // Show with pop-in animation
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 7,
          tension: 40,
          useNativeDriver: true,
        })
      ]).start();
      
      // Hide after delay
      const hideTimer = setTimeout(() => {
        Animated.parallel([
          Animated.timing(fadeAnim, {
            toValue: 0.5,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(scaleAnim, {
            toValue: 0.95,
            duration: 800,
            useNativeDriver: true,
          })
        ]).start();
      }, 1500);
      
      prevZoom.current = zoom;
      
      return () => clearTimeout(hideTimer);
    }
  }, [zoom, fadeAnim, scaleAnim]);
  
  // Determine color based on zoom level
  const getColor = () => {
    if (zoom < 0.8) return '#ffa726'; // orange for low zoom
    if (zoom > 2.0) return '#42a5f5'; // blue for high zoom
    return 'white'; // default
  };
  
  return (
    <Animated.View 
      style={[
        styles.container,
        {
          opacity: fadeAnim,
          transform: [{ scale: scaleAnim }]
        }
      ]}
    >
      <Text style={[styles.zoomText, { color: getColor() }]}>{zoomPercentage}%</Text>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    minWidth: 50,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 5,
  },
  zoomText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
  },
});

export default ZoomIndicator;
