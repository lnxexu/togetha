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

interface StorageInfo {
  totalSpace: number;
  usedSpace: number;
  availableSpace: number;
  categories: {
    documents: number;
    media: number;
    cache: number;
    userdata: number;
    temp: number;
  };
}

const StorageData: React.FC = () => {
  const navigation = useNavigation();
  const [storageInfo, setStorageInfo] = useState<StorageInfo>({
    totalSpace: 1024, // MB
    usedSpace: 456,
    availableSpace: 568,
    categories: {
      documents: 120,
      media: 234,
      cache: 67,
      userdata: 25,
      temp: 10,
    }
  });
  
  const [autoSync, setAutoSync] = useState(true);
  const [autoBackup, setAutoBackup] = useState(false);
  const [wifiOnly, setWifiOnly] = useState(true);
  const [compressBackups, setCompressBackups] = useState(true);
  const [isClearing, setIsClearing] = useState(false);
  const [lastBackup, setLastBackup] = useState<Date>(new Date());
  const [lastSync, setLastSync] = useState<Date>(new Date());

  useEffect(() => {
    loadStorageSettings();
    calculateStorageUsage();
  }, []);

  const loadStorageSettings = async () => {
    try {
      const settings = await AsyncStorage.multiGet([
        'autoSync',
        'autoBackup', 
        'wifiOnly',
        'compressBackups',
        'lastBackup',
        'lastSync'
      ]);
      
      settings.forEach(([key, value]) => {
        if (value) {
          switch (key) {
            case 'autoSync':
              setAutoSync(JSON.parse(value));
              break;
            case 'autoBackup':
              setAutoBackup(JSON.parse(value));
              break;
            case 'wifiOnly':
              setWifiOnly(JSON.parse(value));
              break;
            case 'compressBackups':
              setCompressBackups(JSON.parse(value));
              break;
            case 'lastBackup':
              setLastBackup(new Date(value));
              break;
            case 'lastSync':
              setLastSync(new Date(value));
              break;
          }
        }
      });
    } catch (error) {
      console.error('Failed to load storage settings:', error);
    }
  };

  const calculateStorageUsage = async () => {
    try {
      // Simulate calculating storage usage
      const keys = await AsyncStorage.getAllKeys();
      let totalSize = 0;
      
      // In a real app, you would calculate actual storage sizes
      // This is a simulation
      const estimatedSizes = {
        documents: Math.random() * 200 + 50,
        media: Math.random() * 400 + 100,
        cache: Math.random() * 100 + 30,
        userdata: Math.random() * 50 + 10,
        temp: Math.random() * 20 + 5,
      };
      
      totalSize = Object.values(estimatedSizes).reduce((a, b) => a + b, 0);
      
      setStorageInfo(prev => ({
        ...prev,
        usedSpace: Math.round(totalSize),
        availableSpace: prev.totalSpace - Math.round(totalSize),
        categories: {
          documents: Math.round(estimatedSizes.documents),
          media: Math.round(estimatedSizes.media),
          cache: Math.round(estimatedSizes.cache),
          userdata: Math.round(estimatedSizes.userdata),
          temp: Math.round(estimatedSizes.temp),
        }
      }));
    } catch (error) {
      console.error('Failed to calculate storage usage:', error);
    }
  };

  const toggleSetting = async (key: string, value: boolean, setter: (value: boolean) => void) => {
    try {
      await AsyncStorage.setItem(key, JSON.stringify(value));
      setter(value);
    } catch (error) {
      console.error(`Failed to update ${key}:`, error);
    }
  };

  const clearCache = async () => {
    Alert.alert(
      'Clear Cache',
      'This will remove temporary files and cached data. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          onPress: async () => {
            setIsClearing(true);
            try {
              // Simulate cache clearing
              await new Promise(resolve => setTimeout(resolve, 2000));
              
              setStorageInfo(prev => ({
                ...prev,
                categories: { ...prev.categories, cache: 0, temp: 0 },
                usedSpace: prev.usedSpace - prev.categories.cache - prev.categories.temp,
                availableSpace: prev.availableSpace + prev.categories.cache + prev.categories.temp,
              }));
              
              Alert.alert('Success', 'Cache cleared successfully!');
            } catch (error) {
              Alert.alert('Error', 'Failed to clear cache');
            } finally {
              setIsClearing(false);
            }
          },
        },
      ]
    );
  };

  const manualBackup = async () => {
    Alert.alert(
      'Create Backup',
      'This will create a backup of all your data. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Backup',
          onPress: async () => {
            try {
              // Simulate backup process
              Alert.alert('Backup Started', 'Creating backup... You will be notified when complete.');
              setTimeout(() => {
                setLastBackup(new Date());
                AsyncStorage.setItem('lastBackup', new Date().toISOString());
                Alert.alert('Backup Complete', 'Your data has been backed up successfully!');
              }, 3000);
            } catch (error) {
              Alert.alert('Error', 'Failed to create backup');
            }
          },
        },
      ]
    );
  };

  const manualSync = async () => {
    try {
      Alert.alert('Sync Started', 'Syncing your data...');
      // Simulate sync process
      setTimeout(() => {
        setLastSync(new Date());
        AsyncStorage.setItem('lastSync', new Date().toISOString());
        Alert.alert('Sync Complete', 'Your data has been synchronized!');
      }, 2000);
    } catch (error) {
      Alert.alert('Error', 'Failed to sync data');
    }
  };

  const exportData = () => {
    Alert.alert(
      'Export Data',
      'Choose export format:',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'JSON', onPress: () => console.log('Export as JSON') },
        { text: 'CSV', onPress: () => console.log('Export as CSV') },
      ]
    );
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 MB';
    return `${bytes} MB`;
  };

  const formatDate = (date: Date): string => {
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const getStorageColor = (category: string): string => {
    switch (category) {
      case 'documents': return '#6366F1';
      case 'media': return '#10B981';
      case 'cache': return '#F59E0B';
      case 'userdata': return '#EF4444';
      case 'temp': return '#8B5CF6';
      default: return '#6B7280';
    }
  };

  const usagePercentage = (storageInfo.usedSpace / storageInfo.totalSpace) * 100;

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
          <Text style={styles.headerTitle}>Storage & Data</Text>
          <View style={styles.placeholder} />
        </View>
      </LinearGradient>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Storage Overview */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Storage Usage</Text>
          
          <View style={styles.storageCard}>
            <View style={styles.storageHeader}>
              <MaterialIcons name="storage" size={32} color="#6366F1" />
              <View style={styles.storageInfo}>
                <Text style={styles.storageUsed}>
                  {formatBytes(storageInfo.usedSpace)} used
                </Text>
                <Text style={styles.storageTotal}>
                  of {formatBytes(storageInfo.totalSpace)} total
                </Text>
              </View>
              <Text style={styles.storagePercentage}>
                {usagePercentage.toFixed(1)}%
              </Text>
            </View>
            
            <View style={styles.progressContainer}>
              <View style={styles.progressBar}>
                <View 
                  style={[
                    styles.progressFill, 
                    { width: `${usagePercentage}%` }
                  ]} 
                />
              </View>
            </View>
            
            <View style={styles.storageBreakdown}>
              {Object.entries(storageInfo.categories).map(([category, size]) => (
                <View key={category} style={styles.categoryItem}>
                  <View style={styles.categoryLeft}>
                    <View 
                      style={[
                        styles.categoryDot, 
                        { backgroundColor: getStorageColor(category) }
                      ]} 
                    />
                    <Text style={styles.categoryName}>
                      {category.charAt(0).toUpperCase() + category.slice(1)}
                    </Text>
                  </View>
                  <Text style={styles.categorySize}>{formatBytes(size)}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        {/* Sync Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Sync & Backup</Text>
          
          <View style={styles.settingItem}>
            <View style={styles.settingLeft}>
              <MaterialIcons name="sync" size={24} color="#6366F1" style={styles.settingIcon} />
              <View style={styles.settingText}>
                <Text style={styles.settingTitle}>Auto Sync</Text>
                <Text style={styles.settingSubtitle}>
                  Last sync: {formatDate(lastSync)}
                </Text>
              </View>
            </View>
            <Switch
              value={autoSync}
              onValueChange={(value) => toggleSetting('autoSync', value, setAutoSync)}
              trackColor={{ false: '#E2E8F0', true: '#6366F1' }}
              thumbColor="#FFFFFF"
            />
          </View>

          <View style={styles.settingItem}>
            <View style={styles.settingLeft}>
              <MaterialIcons name="backup" size={24} color="#6366F1" style={styles.settingIcon} />
              <View style={styles.settingText}>
                <Text style={styles.settingTitle}>Auto Backup</Text>
                <Text style={styles.settingSubtitle}>
                  Last backup: {formatDate(lastBackup)}
                </Text>
              </View>
            </View>
            <Switch
              value={autoBackup}
              onValueChange={(value) => toggleSetting('autoBackup', value, setAutoBackup)}
              trackColor={{ false: '#E2E8F0', true: '#6366F1' }}
              thumbColor="#FFFFFF"
            />
          </View>

          <View style={styles.settingItem}>
            <View style={styles.settingLeft}>
              <MaterialIcons name="wifi" size={24} color="#6366F1" style={styles.settingIcon} />
              <View style={styles.settingText}>
                <Text style={styles.settingTitle}>WiFi Only</Text>
                <Text style={styles.settingSubtitle}>Sync only when connected to WiFi</Text>
              </View>
            </View>
            <Switch
              value={wifiOnly}
              onValueChange={(value) => toggleSetting('wifiOnly', value, setWifiOnly)}
              trackColor={{ false: '#E2E8F0', true: '#6366F1' }}
              thumbColor="#FFFFFF"
            />
          </View>

          <View style={styles.settingItem}>
            <View style={styles.settingLeft}>
              <MaterialIcons name="compress" size={24} color="#6366F1" style={styles.settingIcon} />
              <View style={styles.settingText}>
                <Text style={styles.settingTitle}>Compress Backups</Text>
                <Text style={styles.settingSubtitle}>Reduce backup file size</Text>
              </View>
            </View>
            <Switch
              value={compressBackups}
              onValueChange={(value) => toggleSetting('compressBackups', value, setCompressBackups)}
              trackColor={{ false: '#E2E8F0', true: '#6366F1' }}
              thumbColor="#FFFFFF"
            />
          </View>
        </View>

        {/* Actions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Data Management</Text>
          
          <TouchableOpacity style={styles.actionItem} onPress={manualSync}>
            <View style={styles.settingLeft}>
              <MaterialIcons name="sync" size={24} color="#6366F1" style={styles.settingIcon} />
              <View style={styles.settingText}>
                <Text style={styles.settingTitle}>Sync Now</Text>
                <Text style={styles.settingSubtitle}>Manually sync your data</Text>
              </View>
            </View>
            <MaterialIcons name="chevron-right" size={24} color="#94A3B8" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionItem} onPress={manualBackup}>
            <View style={styles.settingLeft}>
              <MaterialIcons name="backup" size={24} color="#6366F1" style={styles.settingIcon} />
              <View style={styles.settingText}>
                <Text style={styles.settingTitle}>Create Backup</Text>
                <Text style={styles.settingSubtitle}>Manual backup of all data</Text>
              </View>
            </View>
            <MaterialIcons name="chevron-right" size={24} color="#94A3B8" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionItem} onPress={exportData}>
            <View style={styles.settingLeft}>
              <MaterialIcons name="file-download" size={24} color="#6366F1" style={styles.settingIcon} />
              <View style={styles.settingText}>
                <Text style={styles.settingTitle}>Export Data</Text>
                <Text style={styles.settingSubtitle}>Download your data in various formats</Text>
              </View>
            </View>
            <MaterialIcons name="chevron-right" size={24} color="#94A3B8" />
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.actionItem} 
            onPress={clearCache}
            disabled={isClearing}
          >
            <View style={styles.settingLeft}>
              <MaterialIcons 
                name={isClearing ? "hourglass-empty" : "delete-sweep"} 
                size={24} 
                color="#F59E0B" 
                style={styles.settingIcon} 
              />
              <View style={styles.settingText}>
                <Text style={[styles.settingTitle, { color: '#F59E0B' }]}>
                  {isClearing ? 'Clearing Cache...' : 'Clear Cache'}
                </Text>
                <Text style={styles.settingSubtitle}>
                  Free up {formatBytes(storageInfo.categories.cache + storageInfo.categories.temp)}
                </Text>
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
    marginBottom: 16,
    fontFamily: 'Inter-SemiBold',
  },
  storageCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  storageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  storageInfo: {
    flex: 1,
    marginLeft: 12,
  },
  storageUsed: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1E293B',
    fontFamily: 'Inter-Bold',
  },
  storageTotal: {
    fontSize: 14,
    color: '#64748B',
    fontFamily: 'Inter-Regular',
  },
  storagePercentage: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#6366F1',
    fontFamily: 'Inter-Bold',
  },
  progressContainer: {
    marginBottom: 20,
  },
  progressBar: {
    height: 8,
    backgroundColor: '#E2E8F0',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#6366F1',
    borderRadius: 4,
  },
  storageBreakdown: {
    gap: 8,
  },
  categoryItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  categoryLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  categoryDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 8,
  },
  categoryName: {
    fontSize: 14,
    color: '#64748B',
    fontFamily: 'Inter-Medium',
  },
  categorySize: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E293B',
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
  bottomPadding: {
    height: 40,
  },
});

export default StorageData;