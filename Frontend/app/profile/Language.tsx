import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';

interface Language {
  code: string;
  name: string;
  nativeName: string;
  flag: string;
}

const languages: Language[] = [
  { code: 'en', name: 'English', nativeName: 'English', flag: '🇺🇸' },
  { code: 'es', name: 'Spanish', nativeName: 'Español', flag: '🇪🇸' },
  { code: 'fr', name: 'French', nativeName: 'Français', flag: '🇫🇷' },
  { code: 'de', name: 'German', nativeName: 'Deutsch', flag: '🇩🇪' },
  { code: 'it', name: 'Italian', nativeName: 'Italiano', flag: '🇮🇹' },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português', flag: '🇵🇹' },
  { code: 'ru', name: 'Russian', nativeName: 'Русский', flag: '🇷🇺' },
  { code: 'zh', name: 'Chinese', nativeName: '中文', flag: '🇨🇳' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語', flag: '🇯🇵' },
  { code: 'ko', name: 'Korean', nativeName: '한국어', flag: '🇰🇷' },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية', flag: '🇸🇦' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिंदी', flag: '🇮🇳' },
];

const LanguageSettings: React.FC = () => {
  const navigation = useNavigation();
  const [selectedLanguage, setSelectedLanguage] = useState<string>('en');
  const [isLoading, setIsLoading] = useState(false);
  const [autoDetect, setAutoDetect] = useState(false);

  useEffect(() => {
    loadLanguageSettings();
  }, []);

  const loadLanguageSettings = async () => {
    try {
      const savedLanguage = await AsyncStorage.getItem('selectedLanguage');
      const autoDetectSetting = await AsyncStorage.getItem('autoDetectLanguage');
      
      if (savedLanguage) {
        setSelectedLanguage(savedLanguage);
      }
      
      if (autoDetectSetting) {
        setAutoDetect(JSON.parse(autoDetectSetting));
      }
    } catch (error) {
      console.error('Failed to load language settings:', error);
    }
  };

  const changeLanguage = async (languageCode: string) => {
    try {
      setIsLoading(true);
      
      // Simulate language change process
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      await AsyncStorage.setItem('selectedLanguage', languageCode);
      setSelectedLanguage(languageCode);
      
      const language = languages.find(lang => lang.code === languageCode);
      Alert.alert(
        'Language Changed',
        `Language has been changed to ${language?.name}. The app will restart to apply changes.`,
        [
          {
            text: 'OK',
            onPress: () => {
              // In a real app, you would restart or reload the app here
              console.log('App would restart to apply language changes');
            }
          }
        ]
      );
    } catch (error) {
      Alert.alert('Error', 'Failed to change language. Please try again.');
      console.error('Failed to change language:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleAutoDetect = async () => {
    try {
      const newValue = !autoDetect;
      await AsyncStorage.setItem('autoDetectLanguage', JSON.stringify(newValue));
      setAutoDetect(newValue);
      
      if (newValue) {
        Alert.alert(
          'Auto-detect Enabled',
          'The app will now automatically detect your device language and adjust accordingly.'
        );
      }
    } catch (error) {
      console.error('Failed to toggle auto-detect:', error);
    }
  };

  const renderLanguageItem = (language: Language) => {
    const isSelected = selectedLanguage === language.code;
    
    return (
      <TouchableOpacity
        key={language.code}
        style={[styles.languageItem, isSelected && styles.selectedLanguageItem]}
        onPress={() => changeLanguage(language.code)}
        disabled={isLoading}
      >
        <View style={styles.languageLeft}>
          <Text style={styles.languageFlag}>{language.flag}</Text>
          <View style={styles.languageInfo}>
            <Text style={[styles.languageName, isSelected && styles.selectedText]}>
              {language.name}
            </Text>
            <Text style={[styles.languageNative, isSelected && styles.selectedSubText]}>
              {language.nativeName}
            </Text>
          </View>
        </View>
        
        {isSelected && (
          <MaterialIcons name="check-circle" size={24} color="#6366F1" />
        )}
        
        {isLoading && selectedLanguage === language.code && (
          <MaterialIcons name="hourglass-empty" size={24} color="#6366F1" />
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <LinearGradient
        colors={['#6366F1', '#8B5CF6']}
        style={styles.header}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <View style={styles.headerTop}>
          <TouchableOpacity 
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <MaterialIcons name="arrow-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Language</Text>
          <View style={styles.placeholder} />
        </View>
      </LinearGradient>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Auto-detect Option */}
        <View style={styles.section}>
          <TouchableOpacity style={styles.autoDetectItem} onPress={toggleAutoDetect}>
            <View style={styles.autoDetectLeft}>
              <MaterialIcons name="language" size={24} color="#6366F1" style={styles.autoDetectIcon} />
              <View style={styles.autoDetectInfo}>
                <Text style={styles.autoDetectTitle}>Auto-detect Language</Text>
                <Text style={styles.autoDetectSubtitle}>
                  Automatically use your device's language setting
                </Text>
              </View>
            </View>
            <View style={[styles.toggleContainer, autoDetect && styles.toggleContainerActive]}>
              <View style={[styles.toggleThumb, autoDetect && styles.toggleThumbActive]} />
            </View>
          </TouchableOpacity>
        </View>

        {/* Language Selection */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Select Language</Text>
          <Text style={styles.sectionSubtitle}>
            Choose your preferred language for the app interface
          </Text>
          
          <View style={styles.languageList}>
            {languages.map(renderLanguageItem)}
          </View>
        </View>

        {/* Regional Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Regional Settings</Text>
          
          <TouchableOpacity style={styles.settingItem}>
            <View style={styles.settingLeft}>
              <MaterialIcons name="schedule" size={24} color="#6366F1" style={styles.settingIcon} />
              <View style={styles.settingText}>
                <Text style={styles.settingTitle}>Time Format</Text>
                <Text style={styles.settingSubtitle}>24-hour</Text>
              </View>
            </View>
            <MaterialIcons name="chevron-right" size={24} color="#94A3B8" />
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.settingItem}>
            <View style={styles.settingLeft}>
              <MaterialIcons name="date-range" size={24} color="#6366F1" style={styles.settingIcon} />
              <View style={styles.settingText}>
                <Text style={styles.settingTitle}>Date Format</Text>
                <Text style={styles.settingSubtitle}>MM/DD/YYYY</Text>
              </View>
            </View>
            <MaterialIcons name="chevron-right" size={24} color="#94A3B8" />
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.settingItem}>
            <View style={styles.settingLeft}>
              <MaterialIcons name="attach-money" size={24} color="#6366F1" style={styles.settingIcon} />
              <View style={styles.settingText}>
                <Text style={styles.settingTitle}>Currency</Text>
                <Text style={styles.settingSubtitle}>USD ($)</Text>
              </View>
            </View>
            <MaterialIcons name="chevron-right" size={24} color="#94A3B8" />
          </TouchableOpacity>
        </View>

        <View style={styles.bottomPadding} />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 20,
    borderBottomLeftRadius: 25,
    borderBottomRightRadius: 25,
    shadowColor: '#1E293B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  backButton: {
    padding: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    fontFamily: 'Lexend',
  },
  placeholder: {
    width: 40,
  },
  content: {
    flex: 1,
    marginTop: 20,
  },
  section: {
    marginHorizontal: 20,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1E293B',
    marginBottom: 4,
    fontFamily: 'Inter-SemiBold',
  },
  sectionSubtitle: {
    fontSize: 14,
    color: '#64748B',
    marginBottom: 16,
    fontFamily: 'Inter-Regular',
  },
  autoDetectItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  autoDetectLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  autoDetectIcon: {
    marginRight: 12,
  },
  autoDetectInfo: {
    flex: 1,
  },
  autoDetectTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: 2,
    fontFamily: 'Inter-SemiBold',
  },
  autoDetectSubtitle: {
    fontSize: 14,
    color: '#64748B',
    fontFamily: 'Inter-Regular',
  },
  toggleContainer: {
    width: 50,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#E2E8F0',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  toggleContainerActive: {
    backgroundColor: '#6366F1',
  },
  toggleThumb: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  toggleThumbActive: {
    alignSelf: 'flex-end',
  },
  languageList: {
    gap: 8,
  },
  languageItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  selectedLanguageItem: {
    borderColor: '#6366F1',
    borderWidth: 2,
    backgroundColor: '#F8FAFF',
  },
  languageLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  languageFlag: {
    fontSize: 24,
    marginRight: 12,
  },
  languageInfo: {
    flex: 1,
  },
  languageName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: 2,
    fontFamily: 'Inter-SemiBold',
  },
  languageNative: {
    fontSize: 14,
    color: '#64748B',
    fontFamily: 'Inter-Regular',
  },
  selectedText: {
    color: '#6366F1',
  },
  selectedSubText: {
    color: '#6366F1',
    opacity: 0.8,
  },
  settingItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  settingIcon: {
    marginRight: 12,
  },
  settingText: {
    flex: 1,
  },
  settingTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: 2,
    fontFamily: 'Inter-SemiBold',
  },
  settingSubtitle: {
    fontSize: 14,
    color: '#64748B',
    fontFamily: 'Inter-Regular',
  },
  bottomPadding: {
    height: 40,
  },
});

export default LanguageSettings;