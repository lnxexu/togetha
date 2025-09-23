import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaWrapper } from '../components/SafeAreaWrapper';

interface PrivacySettings {
  dataCollection: boolean;
  profileVisibility: boolean;
  activityTracking: boolean;
  locationSharing: boolean;
  analyticsOptOut: boolean;
  marketing: boolean;
  biometricAuth: boolean;
  twoFactorAuth: boolean;
  autoLogout: boolean;
}

const PrivacySecurity: React.FC = () => {
  const navigation = useNavigation();
  
  const [settings, setSettings] = useState<PrivacySettings>({
    dataCollection: true,
    profileVisibility: true,
    activityTracking: true,
    locationSharing: false,
    analyticsOptOut: false,
    marketing: false,
    biometricAuth: false,
    twoFactorAuth: false,
    autoLogout: true,
  });

  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const savedSettings = await AsyncStorage.getItem('privacySettings');
      if (savedSettings) {
        setSettings(JSON.parse(savedSettings));
      }
    } catch (error) {
      console.error('Failed to load privacy settings:', error);
    }
  };

  const saveSettings = async (newSettings: PrivacySettings) => {
    try {
      setIsLoading(true);
      await AsyncStorage.setItem('privacySettings', JSON.stringify(newSettings));
      setSettings(newSettings);
      
      // Simulate API call
      setTimeout(() => {
        setIsLoading(false);
        Alert.alert('Success', 'Privacy settings updated successfully');
      }, 1000);
    } catch (error) {
      setIsLoading(false);
      console.error('Failed to save privacy settings:', error);
      Alert.alert('Error', 'Failed to update privacy settings');
    }
  };

  const toggleSetting = (key: keyof PrivacySettings) => {
    const newSettings = { ...settings, [key]: !settings[key] };
    saveSettings(newSettings);
  };

  const handleDataExport = () => {
    Alert.alert(
      'Export Data',
      'We will prepare your data for download and send you an email when ready.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Request Export', onPress: () => console.log('Data export requested') },
      ]
    );
  };

  const handleAccountDeletion = () => {
    Alert.alert(
      'Delete Account',
      'Are you sure you want to delete your account? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            Alert.alert('Account Deletion', 'Account deletion request submitted.');
          },
        },
      ]
    );
  };

  const renderSettingItem = (
    title: string,
    subtitle: string,
    key: keyof PrivacySettings,
    icon: string
  ) => (
    <View style={styles.settingItem}>
      <View style={styles.settingLeft}>
        <MaterialIcons name={icon as any} size={24} color="#6366F1" style={styles.settingIcon} />
        <View style={styles.settingText}>
          <Text style={styles.settingTitle}>{title}</Text>
          <Text style={styles.settingSubtitle}>{subtitle}</Text>
        </View>
      </View>
      <Switch
        value={settings[key]}
        onValueChange={() => toggleSetting(key)}
        trackColor={{ false: '#E2E8F0', true: '#6366F1' }}
        thumbColor={settings[key] ? '#FFFFFF' : '#FFFFFF'}
        disabled={isLoading}
      />
    </View>
  );

  const renderActionItem = (
    title: string,
    subtitle: string,
    icon: string,
    onPress: () => void,
    danger?: boolean
  ) => (
    <TouchableOpacity style={styles.actionItem} onPress={onPress}>
      <View style={styles.settingLeft}>
        <MaterialIcons 
          name={icon as any} 
          size={24} 
          color={danger ? "#EF4444" : "#6366F1"} 
          style={styles.settingIcon} 
        />
        <View style={styles.settingText}>
          <Text style={[styles.settingTitle, danger && styles.dangerText]}>{title}</Text>
          <Text style={styles.settingSubtitle}>{subtitle}</Text>
        </View>
      </View>
      <MaterialIcons name="chevron-right" size={24} color="#94A3B8" />
    </TouchableOpacity>
  );

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
          <Text style={styles.headerTitle}>Privacy & Security</Text>
          <View style={styles.placeholder} />
        </View>
      </LinearGradient>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Privacy Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Privacy Settings</Text>
          
          {renderSettingItem(
            'Data Collection',
            'Allow app to collect usage data for improvement',
            'dataCollection',
            'analytics'
          )}
          
          {renderSettingItem(
            'Profile Visibility',
            'Make your profile visible to other users',
            'profileVisibility',
            'visibility'
          )}
          
          {renderSettingItem(
            'Activity Tracking',
            'Track your app usage and productivity metrics',
            'activityTracking',
            'track-changes'
          )}
          
          {renderSettingItem(
            'Location Sharing',
            'Share location data for location-based features',
            'locationSharing',
            'location-on'
          )}
          
          {renderSettingItem(
            'Analytics Opt-out',
            'Opt out of analytics and tracking',
            'analyticsOptOut',
            'block'
          )}
          
          {renderSettingItem(
            'Marketing Communications',
            'Receive marketing emails and notifications',
            'marketing',
            'email'
          )}
        </View>

        {/* Security Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Security Settings</Text>
          
          {renderSettingItem(
            'Biometric Authentication',
            'Use fingerprint or face ID to unlock app',
            'biometricAuth',
            'fingerprint'
          )}
          
          {renderSettingItem(
            'Two-Factor Authentication',
            'Add an extra layer of security to your account',
            'twoFactorAuth',
            'security'
          )}
          
          {renderSettingItem(
            'Auto-logout',
            'Automatically log out after period of inactivity',
            'autoLogout',
            'logout'
          )}
        </View>

        {/* Data Management */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Data Management</Text>
          
          {renderActionItem(
            'Export Data',
            'Download a copy of your personal data',
            'download',
            handleDataExport
          )}
          
          {renderActionItem(
            'Delete Account',
            'Permanently delete your account and all data',
            'delete-forever',
            handleAccountDeletion,
            true
          )}
        </View>

        {/* Legal Information */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Legal</Text>
          
          {renderActionItem(
            'Privacy Policy',
            'Read our privacy policy and data practices',
            'policy',
            () => console.log('Privacy Policy')
          )}
          
          {renderActionItem(
            'Terms of Service',
            'View terms and conditions of use',
            'description',
            () => console.log('Terms of Service')
          )}
          
          {renderActionItem(
            'Cookie Policy',
            'Learn about our cookie usage',
            'cookie',
            () => console.log('Cookie Policy')
          )}
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
    marginBottom: 16,
    fontFamily: 'Inter-SemiBold',
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
  actionItem: {
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
  dangerText: {
    color: '#EF4444',
  },
  bottomPadding: {
    height: 40,
  },
});

export default PrivacySecurity;