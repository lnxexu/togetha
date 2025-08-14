import React, { useEffect, useState } from 'react';
import { 
  View, 
  Text, 
  FlatList, 
  StyleSheet, 
  ActivityIndicator, 
  TouchableOpacity, 
  ScrollView,
  Platform,
  RefreshControl
} from 'react-native';
import { API_URL } from '../../constants/ApiConfig';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import { RootStackParamList } from '../navigation/AppNavigator';
import Navbar from '../NavBar';

// Define log interface for better type safety
interface Log {
  id: number;
  message: string;
  action: string;
  level: string;
  timestamp: string;
  read: boolean;
  entity_type?: string;
  entity_id?: string;
}

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const Logs: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  useEffect(() => {
    loadLogs();
  }, [filter]);

  const loadLogs = async () => {
    setLoading(true);
    const endpoint = filter === 'all' ? '/logs/' : '/logs/unread/';
    
    try {
      const token = await AsyncStorage.getItem('authToken');
      const response = await fetch(`${API_URL}${endpoint}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Token ${token}`,
        },
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch logs: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('Fetched logs:', data);
      setLogs(data);
    } catch (error) {
      console.error('Error fetching logs:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadLogs();
  };

  const markAsRead = async (logId: number) => {
    try {
      const token = await AsyncStorage.getItem('authToken');
      await fetch(`${API_URL}/logs/${logId}/mark_read/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Token ${token}`,
        },
      });
      
      // Update the local state
      setLogs(logs.map(log => 
        log.id === logId ? { ...log, read: true } : log
      ));
    } catch (error) {
      console.error('Error marking log as read:', error);
    }
  };

  const markAllAsRead = async () => {
    try {
      const token = await AsyncStorage.getItem('authToken');
      await fetch(`${API_URL}/logs/mark_all_read/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Token ${token}`,
        },
      });
      
      // Update the local state
      setLogs(logs.map(log => ({ ...log, read: true })));
    } catch (error) {
      console.error('Error marking all logs as read:', error);
    }
  };

  // Format timestamp to a more readable format
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  // Get icon based on log level
  const getLogIcon = (level: string) => {
    switch (level.toUpperCase()) {
      case 'INFO':
        return <MaterialIcons name="info" size={24} color="#3B82F6" />;
      case 'WARNING':
        return <MaterialIcons name="warning" size={24} color="#F59E0B" />;
      case 'ERROR':
        return <MaterialIcons name="error" size={24} color="#EF4444" />;
      case 'SUCCESS':
        return <MaterialIcons name="check-circle" size={24} color="#10B981" />;
      default:
        return <MaterialIcons name="circle" size={24} color="#6B7280" />;
    }
  };

  const getLevelColor = (level: string) => {
    switch (level.toUpperCase()) {
      case 'INFO':
        return '#3B82F6';
      case 'WARNING':
        return '#F59E0B';
      case 'ERROR':
        return '#EF4444';
      case 'SUCCESS':
        return '#10B981';
      default:
        return '#6B7280';
    }
  };

  if (loading && !refreshing) {
    return (
      <View style={styles.container}>
        <LinearGradient
          colors={["#A855F7", "#8B5CF6", "#7C3AED"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.header}
        >
          <View style={styles.headerContent}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => navigation.goBack()}
            >
              <MaterialIcons name="arrow-back" size={24} color="#FFFFFF" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Activity Logs</Text>
            <View style={styles.placeholder} />
          </View>
        </LinearGradient>
        
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#6A009C" />
          <Text style={styles.loadingText}>Loading logs...</Text>
        </View>
        <Navbar activeRoute="Profile" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <LinearGradient
        colors={["#A855F7", "#8B5CF6", "#7C3AED"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.header}
      >
        <View style={styles.headerContent}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <MaterialIcons name="arrow-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Activity Logs</Text>
          <View style={styles.placeholder} />
        </View>
      </LinearGradient>

      {/* Content */}
      <View style={styles.content}>
        {/* Filter Section */}
        <View style={styles.filterSection}>
          <View style={styles.filterContainer}>
            <TouchableOpacity 
              style={[styles.filterButton, filter === 'all' && styles.activeFilter]} 
              onPress={() => setFilter('all')}
            >
              <Text style={[styles.filterText, filter === 'all' && styles.activeFilterText]}>
                All Logs
              </Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.filterButton, filter === 'unread' && styles.activeFilter]} 
              onPress={() => setFilter('unread')}
            >
              <Text style={[styles.filterText, filter === 'unread' && styles.activeFilterText]}>
                Unread Only
              </Text>
            </TouchableOpacity>
          </View>
          
          {logs.length > 0 && (
            <TouchableOpacity style={styles.markAllButton} onPress={markAllAsRead}>
              <MaterialIcons name="done-all" size={18} color="#6A009C" />
              <Text style={styles.markAllText}>Mark All Read</Text>
            </TouchableOpacity>
          )}
        </View>

        <FlatList
          data={logs}
          keyExtractor={item => item.id?.toString()}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={["#6A009C"]}
            />
          }
          renderItem={({ item }) => (
            <TouchableOpacity 
              style={[
                styles.logItem, 
                !item.read && styles.unreadItem
              ]}
              onPress={() => markAsRead(item.id)}
            >
              <View style={[
                styles.logIndicator,
                { backgroundColor: getLevelColor(item.level) }
              ]} />
              
              <View style={styles.logContent}>
                <View style={styles.logHeader}>
                  <View style={styles.logIconContainer}>
                    {getLogIcon(item.level)}
                  </View>
                  <View style={styles.logInfo}>
                    <Text style={styles.logMessage}>
                      {item.message || item.action}
                    </Text>
                    {item.entity_type && (
                      <Text style={styles.entityText}>
                        {item.entity_type}: {item.entity_id}
                      </Text>
                    )}
                  </View>
                  {!item.read && (
                    <View style={styles.unreadDot} />
                  )}
                </View>
                <Text style={styles.timestamp}>
                  {formatDate(item.timestamp)}
                </Text>
              </View>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIcon}>
                <MaterialIcons name="history" size={64} color="#D1D5DB" />
              </View>
              <Text style={styles.emptyTitle}>No Activity Logs</Text>
              <Text style={styles.emptyText}>
                {filter === 'unread' 
                  ? "All your logs have been read" 
                  : "Your activity will appear here"
                }
              </Text>
            </View>
          }
          contentContainerStyle={logs.length === 0 ? styles.emptyList : undefined}
        />
      </View>

      <Navbar activeRoute="Profile" />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8f9fa",
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: Platform.OS === "ios" ? 50 : 35,
    paddingBottom: 20,
    borderBottomLeftRadius: 25,
    borderBottomRightRadius: 25,
    shadowColor: "#1E293B",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  headerContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 24,
    color: "#FFFFFF",
    fontFamily: "Inter-Bold",
    textAlign: "center",
  },
  placeholder: {
    width: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    fontSize: 16,
    color: "#6A009C",
    fontFamily: "Inter-Medium",
    marginTop: 12,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 20,
    marginBottom: 100, // Space for navbar
  },
  filterSection: {
    marginBottom: 20,
  },
  filterContainer: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
    shadowColor: "#1E293B",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  filterButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: "center",
  },
  activeFilter: {
    backgroundColor: "#6A009C",
  },
  filterText: {
    fontSize: 14,
    color: "#6c757d",
    fontFamily: "Inter-Medium",
  },
  activeFilterText: {
    color: "#FFFFFF",
    fontFamily: "Inter-SemiBold",
  },
  markAllButton: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-end",
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#f0e6ff",
    borderRadius: 20,
    gap: 6,
  },
  markAllText: {
    fontSize: 14,
    color: "#6A009C",
    fontFamily: "Inter-Medium",
  },
  logItem: {
    backgroundColor: "#fff",
    borderRadius: 16,
    marginBottom: 12,
    overflow: "hidden",
    shadowColor: "#1E293B",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
    flexDirection: "row",
  },
  unreadItem: {
    shadowColor: "#6A009C",
    shadowOpacity: 0.15,
  },
  logIndicator: {
    width: 4,
    backgroundColor: "#6B7280",
  },
  logContent: {
    flex: 1,
    padding: 16,
  },
  logHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  logIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#f8f9fa",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  logInfo: {
    flex: 1,
  },
  logMessage: {
    fontSize: 16,
    color: "#1E293B",
    fontFamily: "Inter-Medium",
    marginBottom: 4,
    lineHeight: 22,
  },
  entityText: {
    fontSize: 14,
    color: "#6c757d",
    fontFamily: "Inter-Regular",
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#6A009C",
    marginLeft: 8,
  },
  timestamp: {
    fontSize: 12,
    color: "#adb5bd",
    fontFamily: "Inter-Regular",
    textAlign: "right",
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    paddingHorizontal: 40,
  },
  emptyList: {
    flexGrow: 1,
  },
  emptyIcon: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "#f8f9fa",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 20,
    color: "#1E293B",
    fontFamily: "Inter-SemiBold",
    marginBottom: 8,
    textAlign: "center",
  },
  emptyText: {
    fontSize: 14,
    color: "#6c757d",
    fontFamily: "Inter-Regular",
    textAlign: "center",
    lineHeight: 20,
  },
});

export default Logs;