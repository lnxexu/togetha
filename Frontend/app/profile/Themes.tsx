import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Platform,
  Switch,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaWrapper } from '../components/SafeAreaWrapper';

interface Theme {
  id: string;
  name: string;
  description: string;
  primaryColor: string;
  secondaryColor: string;
  backgroundColor: string;
  cardColor: string;
  textColor: string;
  icon: string;
}

interface ColorScheme {
  id: string;
  name: string;
  colors: string[];
}

const themes: Theme[] = [
  {
    id: 'default',
    name: 'Default',
    description: 'Clean and modern purple gradient theme',
    primaryColor: '#6366F1',
    secondaryColor: '#8B5CF6',
    backgroundColor: '#F8F9FA',
    cardColor: '#FFFFFF',
    textColor: '#1E293B',
    icon: 'palette',
  },
  {
    id: 'ocean',
    name: 'Ocean',
    description: 'Calm blue ocean-inspired colors',
    primaryColor: '#0EA5E9',
    secondaryColor: '#06B6D4',
    backgroundColor: '#F0F9FF',
    cardColor: '#FFFFFF',
    textColor: '#0C4A6E',
    icon: 'waves',
  },
  {
    id: 'forest',
    name: 'Forest',
    description: 'Natural green forest theme',
    primaryColor: '#059669',
    secondaryColor: '#10B981',
    backgroundColor: '#F0FDF4',
    cardColor: '#FFFFFF',
    textColor: '#064E3B',
    icon: 'nature',
  },
  {
    id: 'sunset',
    name: 'Sunset',
    description: 'Warm orange and red sunset colors',
    primaryColor: '#EA580C',
    secondaryColor: '#F59E0B',
    backgroundColor: '#FFF7ED',
    cardColor: '#FFFFFF',
    textColor: '#9A3412',
    icon: 'wb-sunny',
  },
  {
    id: 'dark',
    name: 'Dark',
    description: 'Sleek dark theme for low-light usage',
    primaryColor: '#6366F1',
    secondaryColor: '#8B5CF6',
    backgroundColor: '#0F172A',
    cardColor: '#1E293B',
    textColor: '#F1F5F9',
    icon: 'dark-mode',
  },
];

const colorSchemes: ColorScheme[] = [
  { id: 'purple', name: 'Purple', colors: ['#6366F1', '#8B5CF6', '#A855F7'] },
  { id: 'blue', name: 'Blue', colors: ['#3B82F6', '#06B6D4', '#0EA5E9'] },
  { id: 'green', name: 'Green', colors: ['#10B981', '#059669', '#34D399'] },
  { id: 'orange', name: 'Orange', colors: ['#F59E0B', '#EA580C', '#FB923C'] },
  { id: 'pink', name: 'Pink', colors: ['#EC4899', '#F472B6', '#BE185D'] },
  { id: 'teal', name: 'Teal', colors: ['#14B8A6', '#0D9488', '#2DD4BF'] },
];

const Themes: React.FC = () => {
  const navigation = useNavigation();
  const [selectedTheme, setSelectedTheme] = useState<string>('default');
  const [customColorScheme, setCustomColorScheme] = useState<string>('purple');
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [autoTheme, setAutoTheme] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    loadThemeSettings();
  }, []);

  const loadThemeSettings = async () => {
    try {
      const savedTheme = await AsyncStorage.getItem('selectedTheme');
      const savedColorScheme = await AsyncStorage.getItem('customColorScheme');
      const savedDarkMode = await AsyncStorage.getItem('isDarkMode');
      const savedAutoTheme = await AsyncStorage.getItem('autoTheme');
      
      if (savedTheme) {
        setSelectedTheme(savedTheme);
      }
      if (savedColorScheme) {
        setCustomColorScheme(savedColorScheme);
      }
      if (savedDarkMode) {
        setIsDarkMode(JSON.parse(savedDarkMode));
      }
      if (savedAutoTheme) {
        setAutoTheme(JSON.parse(savedAutoTheme));
      }
    } catch (error) {
      console.error('Failed to load theme settings:', error);
    }
  };

  const applyTheme = async (themeId: string) => {
    try {
      setIsLoading(true);
      
      // Simulate theme application process
      await new Promise(resolve => setTimeout(resolve, 800));
      
      await AsyncStorage.setItem('selectedTheme', themeId);
      setSelectedTheme(themeId);
      
      const theme = themes.find(t => t.id === themeId);
      Alert.alert(
        'Theme Applied',
        `${theme?.name} theme has been applied successfully!`,
        [{ text: 'OK' }]
      );
    } catch (error) {
      Alert.alert('Error', 'Failed to apply theme. Please try again.');
      console.error('Failed to apply theme:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleDarkMode = async () => {
    try {
      const newValue = !isDarkMode;
      await AsyncStorage.setItem('isDarkMode', JSON.stringify(newValue));
      setIsDarkMode(newValue);
      
      Alert.alert(
        'Dark Mode',
        `Dark mode has been ${newValue ? 'enabled' : 'disabled'}.`,
        [{ text: 'OK' }]
      );
    } catch (error) {
      console.error('Failed to toggle dark mode:', error);
    }
  };

  const toggleAutoTheme = async () => {
    try {
      const newValue = !autoTheme;
      await AsyncStorage.setItem('autoTheme', JSON.stringify(newValue));
      setAutoTheme(newValue);
      
      if (newValue) {
        Alert.alert(
          'Auto Theme',
          'Theme will now automatically switch based on system settings.',
          [{ text: 'OK' }]
        );
      }
    } catch (error) {
      console.error('Failed to toggle auto theme:', error);
    }
  };

  const selectColorScheme = async (schemeId: string) => {
    try {
      await AsyncStorage.setItem('customColorScheme', schemeId);
      setCustomColorScheme(schemeId);
      
      const scheme = colorSchemes.find(s => s.id === schemeId);
      Alert.alert(
        'Color Scheme Updated',
        `${scheme?.name} color scheme has been applied.`,
        [{ text: 'OK' }]
      );
    } catch (error) {
      console.error('Failed to update color scheme:', error);
    }
  };

  const renderThemeItem = (theme: Theme) => {
    const isSelected = selectedTheme === theme.id;
    
    return (
      <TouchableOpacity
        key={theme.id}
        style={[styles.themeItem, isSelected && styles.selectedThemeItem]}
        onPress={() => applyTheme(theme.id)}
        disabled={isLoading}
      >
        <LinearGradient
          colors={[theme.primaryColor, theme.secondaryColor]}
          style={styles.themePreview}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <MaterialIcons name={theme.icon as any} size={32} color="#FFFFFF" />
        </LinearGradient>
        
        <View style={styles.themeInfo}>
          <Text style={[styles.themeName, isSelected && styles.selectedText]}>
            {theme.name}
          </Text>
          <Text style={[styles.themeDescription, isSelected && styles.selectedSubText]}>
            {theme.description}
          </Text>
        </View>
        
        {isSelected && (
          <MaterialIcons name="check-circle" size={24} color="#6366F1" />
        )}
        
        {isLoading && selectedTheme === theme.id && (
          <MaterialIcons name="hourglass-empty" size={24} color="#6366F1" />
        )}
      </TouchableOpacity>
    );
  };

  const renderColorScheme = (scheme: ColorScheme) => {
    const isSelected = customColorScheme === scheme.id;
    
    return (
      <TouchableOpacity
        key={scheme.id}
        style={[styles.colorSchemeItem, isSelected && styles.selectedColorScheme]}
        onPress={() => selectColorScheme(scheme.id)}
      >
        <View style={styles.colorPreview}>
          {scheme.colors.map((color, index) => (
            <View
              key={index}
              style={[styles.colorCircle, { backgroundColor: color }]}
            />
          ))}
        </View>
        <Text style={[styles.colorSchemeName, isSelected && styles.selectedText]}>
          {scheme.name}
        </Text>
        {isSelected && (
          <MaterialIcons name="check" size={18} color="#6366F1" style={styles.colorSchemeCheck} />
        )}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaWrapper>
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
          <Text style={styles.headerTitle}>Themes</Text>
          <View style={styles.placeholder} />
        </View>
      </LinearGradient>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Theme Options */}
        <View style={styles.section}>
          <View style={styles.settingItem}>
            <View style={styles.settingLeft}>
              <MaterialIcons name="brightness-auto" size={24} color="#6366F1" style={styles.settingIcon} />
              <View style={styles.settingText}>
                <Text style={styles.settingTitle}>Auto Theme</Text>
                <Text style={styles.settingSubtitle}>Follow system theme</Text>
              </View>
            </View>
            <Switch
              value={autoTheme}
              onValueChange={toggleAutoTheme}
              trackColor={{ false: '#E2E8F0', true: '#6366F1' }}
              thumbColor="#FFFFFF"
            />
          </View>

          <View style={styles.settingItem}>
            <View style={styles.settingLeft}>
              <MaterialIcons name="dark-mode" size={24} color="#6366F1" style={styles.settingIcon} />
              <View style={styles.settingText}>
                <Text style={styles.settingTitle}>Dark Mode</Text>
                <Text style={styles.settingSubtitle}>Use dark theme</Text>
              </View>
            </View>
            <Switch
              value={isDarkMode}
              onValueChange={toggleDarkMode}
              trackColor={{ false: '#E2E8F0', true: '#6366F1' }}
              thumbColor="#FFFFFF"
              disabled={autoTheme}
            />
          </View>
        </View>

        {/* Theme Selection */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Choose Theme</Text>
          <Text style={styles.sectionSubtitle}>
            Select a theme that matches your style
          </Text>
          
          <View style={styles.themeList}>
            {themes.map(renderThemeItem)}
          </View>
        </View>

        {/* Color Schemes */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Color Schemes</Text>
          <Text style={styles.sectionSubtitle}>
            Customize accent colors for your theme
          </Text>
          
          <View style={styles.colorSchemeGrid}>
            {colorSchemes.map(renderColorScheme)}
          </View>
        </View>

        {/* Advanced Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Advanced</Text>
          
          <TouchableOpacity style={styles.settingItem}>
            <View style={styles.settingLeft}>
              <MaterialIcons name="color-lens" size={24} color="#6366F1" style={styles.settingIcon} />
              <View style={styles.settingText}>
                <Text style={styles.settingTitle}>Custom Colors</Text>
                <Text style={styles.settingSubtitle}>Create your own color palette</Text>
              </View>
            </View>
            <MaterialIcons name="chevron-right" size={24} color="#94A3B8" />
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.settingItem}>
            <View style={styles.settingLeft}>
              <MaterialIcons name="wallpaper" size={24} color="#6366F1" style={styles.settingIcon} />
              <View style={styles.settingText}>
                <Text style={styles.settingTitle}>Background Patterns</Text>
                <Text style={styles.settingSubtitle}>Add subtle patterns to backgrounds</Text>
              </View>
            </View>
            <MaterialIcons name="chevron-right" size={24} color="#94A3B8" />
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.settingItem}>
            <View style={styles.settingLeft}>
              <MaterialIcons name="font-download" size={24} color="#6366F1" style={styles.settingIcon} />
              <View style={styles.settingText}>
                <Text style={styles.settingTitle}>Font Settings</Text>
                <Text style={styles.settingSubtitle}>Adjust font size and style</Text>
              </View>
            </View>
            <MaterialIcons name="chevron-right" size={24} color="#94A3B8" />
          </TouchableOpacity>
        </View>

        <View style={styles.bottomPadding} />
      </ScrollView>
    </View>
    </SafeAreaWrapper>
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
  themeList: {
    gap: 12,
  },
  themeItem: {
    flexDirection: 'row',
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
  selectedThemeItem: {
    borderColor: '#6366F1',
    borderWidth: 2,
    backgroundColor: '#F8FAFF',
  },
  themePreview: {
    width: 60,
    height: 60,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  themeInfo: {
    flex: 1,
  },
  themeName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: 2,
    fontFamily: 'Inter-SemiBold',
  },
  themeDescription: {
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
  colorSchemeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  colorSchemeItem: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 12,
    borderRadius: 12,
    minWidth: 80,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  selectedColorScheme: {
    borderColor: '#6366F1',
    borderWidth: 2,
    backgroundColor: '#F8FAFF',
  },
  colorPreview: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  colorCircle: {
    width: 16,
    height: 16,
    borderRadius: 8,
    marginHorizontal: 1,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  colorSchemeName: {
    fontSize: 12,
    fontWeight: '500',
    color: '#1E293B',
    textAlign: 'center',
    fontFamily: 'Inter-Medium',
  },
  colorSchemeCheck: {
    position: 'absolute',
    top: 4,
    right: 4,
  },
  bottomPadding: {
    height: 40,
  },
});

export default Themes;