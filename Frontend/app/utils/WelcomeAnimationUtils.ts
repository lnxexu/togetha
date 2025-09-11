import { Animated } from 'react-native';

export class WelcomeAnimationUtils {
  private static fromLogin = false;

  static setFromLogin(value: boolean) {
    this.fromLogin = value;
  }

  static isFromLogin(): boolean {
    const value = this.fromLogin;
    this.fromLogin = false; // Reset after checking
    return value;
  }

  static createWelcomeAnimation(
    fadeAnim: Animated.Value,
    slideAnim: Animated.Value,
    headerSlideAnim: Animated.Value,
    contentFadeAnim: Animated.Value,
    fromLogin: boolean = false
  ) {
    if (fromLogin) {
      // Special welcome animation from login
      return Animated.sequence([
        // Brief delay to let loading screen finish
        Animated.delay(200),
        // Header slides down smoothly
        Animated.timing(headerSlideAnim, {
          toValue: 0,
          duration: 800,
          useNativeDriver: true,
        }),
        // Main content appears with welcome effect
        Animated.parallel([
          Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(slideAnim, {
            toValue: 0,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(contentFadeAnim, {
            toValue: 1,
            duration: 900,
            useNativeDriver: true,
          }),
        ]),
      ]);
    } else {
      // Standard animation for normal navigation
      return Animated.sequence([
        Animated.timing(headerSlideAnim, {
          toValue: 0,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.parallel([
          Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(slideAnim, {
            toValue: 0,
            duration: 600,
            useNativeDriver: true,
          }),
          Animated.timing(contentFadeAnim, {
            toValue: 1,
            duration: 700,
            useNativeDriver: true,
          }),
        ]),
      ]);
    }
  }

  static createStaggeredSectionAnimation(
    sections: Animated.Value[],
    delay: number = 100
  ) {
    return Animated.stagger(
      delay,
      sections.map(section =>
        Animated.timing(section, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        })
      )
    );
  }
}
