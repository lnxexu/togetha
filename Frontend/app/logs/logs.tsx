import React, { useEffect, useState } from 'react';
import { 
  View, 
  Text, 
  FlatList, 
  StyleSheet, 
  ActivityIndicator, 
  TouchableOpacity, 
  RefreshControl,
  StatusBar,
  Platform 
} from 'react-native';
import { API_URL, API_ENDPOINTS } from '@/constants/ApiConfig';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/AppNavigator";

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

interface PaginationData {
  totalPages: number;
  totalLogs: number;
  currentPage: number;
}

const LOGS_PER_PAGE = 20;

const Logs: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pagination, setPagination] = useState<PaginationData>({
    totalPages: 1,
    totalLogs: 0,
    currentPage: 1
  });

  useEffect(() => {
    loadLogs();
  }, [pagination.currentPage]);

  const loadLogs = async () => {
    setLoading(true);
    
    try {
      const token = await AsyncStorage.getItem('authToken');
      if (!token) {
        console.error('No auth token found');
        setLoading(false);
        setRefreshing(false);
        return;
      }
      
      const response = await fetch(`${API_URL}${API_ENDPOINTS.LOGS}?page=${pagination.currentPage}&limit=${LOGS_PER_PAGE}`, {
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
      
      if (data && typeof data === 'object') {
        // Handle paginated response structure
        if (Array.isArray(data.results)) {
          setLogs(data.results);
          setPagination({
            totalLogs: data.count || 0,
            totalPages: Math.ceil((data.count || 0) / LOGS_PER_PAGE),
            currentPage: pagination.currentPage
          });
        } else if (Array.isArray(data)) {
          // Fallback for non-paginated API response
          setLogs(data);
          setPagination({
            totalLogs: data.length,
            totalPages: Math.ceil(data.length / LOGS_PER_PAGE),
            currentPage: pagination.currentPage
          });
        } else {
          console.error('API response is not a valid format:', data);
          setLogs([]);
        }
      } else {
        console.error('API response is not valid:', data);
        setLogs([]);
      }
    } catch (error) {
      console.error('Error fetching logs:', error);
      setLogs([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    setPagination(prev => ({...prev, currentPage: 1}));
    await loadLogs();
  };

  const markAsRead = async (logId: number) => {
    try {
      const token = await AsyncStorage.getItem('authToken');
      if (!token) {
        console.error('No auth token found');
        return;
      }
      
      await fetch(`${API_URL}/logs/${logId}/mark_read/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Token ${token}`,
        },
      });
      
      // Update the local state
      setLogs(prevLogs => prevLogs.map(log => 
        log.id === logId ? { ...log, read: true } : log
      ));
    } catch (error) {
      console.error('Error marking log as read:', error);
    }
  };

  const markAllAsRead = async () => {
    try {
      const token = await AsyncStorage.getItem('authToken');
      if (!token) {
        console.error('No auth token found');
        return;
      }
      
      await fetch(`${API_URL}/logs/mark_all_read/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Token ${token}`,
        },
      });
      
      // Update the local state
      setLogs(prevLogs => prevLogs.map(log => ({ ...log, read: true })));
    } catch (error) {
      console.error('Error marking all logs as read:', error);
    }
  };

  const goToNextPage = () => {
    if (pagination.currentPage < pagination.totalPages) {
      setPagination(prev => ({...prev, currentPage: prev.currentPage + 1}));
    }
  };

  const goToPrevPage = () => {
    if (pagination.currentPage > 1) {
      setPagination(prev => ({...prev, currentPage: prev.currentPage - 1}));
    }
  };

  // Format timestamp to a more readable format
  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInMs = now.getTime() - date.getTime();
    
    const diffInMinutes = Math.floor(diffInMs / (1000 * 60));
    const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));
    const diffInDays = Math.floor(diffInHours / 24);

    if (diffInMinutes < 1) {
      return "Just now";
    } else if (diffInMinutes < 60) {
      return `${diffInMinutes}m ago`;
    } else if (diffInHours < 24) {
      return `${diffInHours}h ago`;
    } else {
      return `${diffInDays}d ago`;
    }
  };

  // Get icon based on log level
  const getLogIcon = (level: string) => {
    switch (level?.toUpperCase() || '') {
      case 'INFO':
        return <MaterialIcons name="info" size={24} color="#3B82F6" />;
      case 'WARNING':
        return <MaterialIcons name="warning" size={24} color="#F59E0B" />;
      case 'ERROR':
        return <MaterialIcons name="error" size={24} color="#EF4444" />;
      case 'SUCCESS':
        return <MaterialIcons name="check-circle" size={24} color="#10B981" />;
      case 'SECURITY':
        return <MaterialIcons name="security" size={24} color="#8B5CF6" />;
      case 'AUDIT':
        return <MaterialIcons name="description" size={24} color="#6366F1" />;
      default:
        return <MaterialIcons name="circle" size={24} color="#8B5CF6" />;
    }
  };

  // Get background color based on log level
  const getLogIconBackground = (level: string) => {
    switch (level?.toUpperCase() || '') {
      case 'INFO':
        return { backgroundColor: '#EFF6FF' }; // Light blue
      case 'WARNING':
        return { backgroundColor: '#FFFBEB' }; // Light yellow
      case 'ERROR':
        return { backgroundColor: '#FEF2F2' }; // Light red
      case 'SUCCESS':
        return { backgroundColor: '#ECFDF5' }; // Light green
      case 'SECURITY':
        return { backgroundColor: '#F5F3FF' }; // Light purple
      case 'AUDIT':
        return { backgroundColor: '#EEF2FF' }; // Light indigo
      default:
        return { backgroundColor: '#F5F3FF' }; // Light purple
    }
  };

  const getLogColor = (level: string) => {
    switch (level?.toUpperCase() || '') {
      case 'INFO':
        return '#3B82F6'; // Blue
      case 'WARNING':
        return '#F59E0B'; // Yellow/Orange
      case 'ERROR':
        return '#EF4444'; // Red
      case 'SUCCESS':
        return '#10B981'; // Green
      case 'SECURITY':
        return '#8B5CF6'; // Purple
      case 'AUDIT':
        return '#6366F1'; // Indigo
      default:
        return '#8B5CF6'; // Purple
    }
  };

  const unreadCount = logs?.filter(log => !log.read)?.length || 0;

  if (loading && !refreshing) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#6A009C" />
        <Text style={styles.loadingText}>Loading security logs...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#7C3AED" />
      
      {/* Header */}
      <LinearGradient
        colors={['#A855F7', '#8B5CF6', '#7C3AED']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.header}
      >
        <View style={styles.headerContent}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          
          <View style={styles.headerTitleContainer}>
            <Text style={styles.headerTitle}>Security Audit Log</Text>
            {unreadCount > 0 && (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadBadgeText}>{unreadCount}</Text>
              </View>
            )}
          </View>

          <TouchableOpacity
            style={styles.markAllButton}
            onPress={markAllAsRead}
            disabled={unreadCount === 0}
          >
            <Text style={[
              styles.markAllButtonText,
              { opacity: unreadCount === 0 ? 0.5 : 1 }
            ]}>
              Mark All
            </Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>

      {/* Pagination Info */}
      <View style={styles.paginationInfo}>
        <Text style={styles.paginationText}>
          Showing {((pagination.currentPage - 1) * LOGS_PER_PAGE) + 1} - {Math.min(pagination.currentPage * LOGS_PER_PAGE, pagination.totalLogs)} of {pagination.totalLogs} logs
        </Text>
      </View>

      {logs.length === 0 ? (
        <View style={styles.emptyContainer}>
          <MaterialIcons name="security" size={64} color="#CBD5E0" />
          <Text style={styles.emptyTitle}>No security logs available</Text>
          <Text style={styles.emptySubtitle}>
            Security and audit events will be recorded here as you use the app.
          </Text>
        </View>
      ) : (
        <>
          <FlatList
            data={logs}
            keyExtractor={item => item.id?.toString()}
            contentContainerStyle={styles.listContainer}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                colors={["#6A009C"]}
                tintColor="#6A009C"
              />
            }
            renderItem={({ item }) => (
              <TouchableOpacity 
                style={[
                  styles.logCard,
                  !item.read && styles.unreadLogCard
                ]}
                onPress={() => markAsRead(item.id)}
              >
                <View style={styles.logContent}>
                  <View style={[
                    styles.logIconContainer,
                    getLogIconBackground(item.level)
                  ]}>
                    {getLogIcon(item.level)}
                  </View>
                  
                  <View style={styles.logTextContent}>
                    <View style={styles.logHeader}>
                      <Text style={[
                        styles.logTitle,
                        !item.read && styles.unreadLogTitle
                      ]}>
                        {item.action || item.level}
                      </Text>
                      <Text style={styles.logTime}>
                        {formatTimeAgo(item.timestamp)}
                      </Text>
                    </View>
                    
                    <Text style={styles.logMessage}>{item.message}</Text>

                  </View>
                  
                  {!item.read && <View style={styles.unreadDot} />}
                </View>
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <MaterialIcons name="security" size={64} color="#CBD5E0" />
                <Text style={styles.emptyText}>No security logs available</Text>
                <Text style={styles.emptySubtext}>Security events will appear here as you use the app</Text>
              </View>
            }
          />
          
          {/* Pagination Controls */}
          <View style={styles.paginationContainer}>
            <TouchableOpacity 
              style={[styles.paginationButton, pagination.currentPage <= 1 && styles.disabledButton]}
              onPress={goToPrevPage}
              disabled={pagination.currentPage <= 1}
            >
              <Ionicons 
                name="chevron-back" 
                size={24} 
                color={pagination.currentPage <= 1 ? "#CBD5E0" : "#6A009C"} 
              />
              <Text style={[styles.paginationButtonText, pagination.currentPage <= 1 && styles.disabledButtonText]}>
                Previous
              </Text>
            </TouchableOpacity>
            
            <Text style={styles.pageIndicator}>
              {pagination.currentPage} of {pagination.totalPages}
            </Text>
            
            <TouchableOpacity 
              style={[styles.paginationButton, pagination.currentPage >= pagination.totalPages && styles.disabledButton]}
              onPress={goToNextPage}
              disabled={pagination.currentPage >= pagination.totalPages}
            >
              <Text style={[styles.paginationButtonText, pagination.currentPage >= pagination.totalPages && styles.disabledButtonText]}>
                Next
              </Text>
              <Ionicons 
                name="chevron-forward" 
                size={24} 
                color={pagination.currentPage >= pagination.totalPages ? "#CBD5E0" : "#6A009C"} 
              />
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  header: {
    paddingTop: Platform.OS === 'ios' ? 50 : 35,
    paddingBottom: 20,
    paddingHorizontal: 24,
  },
  headerContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backButton: {
    padding: 8,
  },
  headerTitleContainer: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 20,
    fontFamily: "Inter-Bold",
    color: "#FFFFFF",
  },
  unreadBadge: {
    backgroundColor: "#EF4444",
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginLeft: 8,
    minWidth: 24,
    alignItems: "center",
  },
  unreadBadgeText: {
    fontSize: 12,
    fontFamily: "Inter-Bold",
    color: "#FFFFFF",
  },
  markAllButton: {
    padding: 8,
  },
  markAllButtonText: {
    fontSize: 14,
    fontFamily: "Inter-Medium",
    color: "#FFFFFF",
  },
  paginationInfo: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: "#EFF6FF",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  paginationText: {
    fontSize: 14,
    fontFamily: "Inter-Regular",
    color: "#64748B",
    textAlign: "center",
  },
  listContainer: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 80, // Extra padding for pagination controls
  },
  logCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#1E293B",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: "rgba(226, 232, 240, 0.6)",
  },
  unreadLogCard: {
    borderLeftWidth: 4,
    borderLeftColor: "#6A009C",
    backgroundColor: "#FEFEFE",
  },
  logContent: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  logIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  logTextContent: {
    flex: 1,
  },
  logHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 4,
  },
  logTitle: {
    fontSize: 16,
    fontFamily: "Inter-SemiBold",
    color: "#1E293B",
    flex: 1,
    textTransform: "capitalize",
  },
  unreadLogTitle: {
    fontFamily: "Inter-Bold",
    color: "#0F172A",
  },
  logTime: {
    fontSize: 12,
    fontFamily: "Inter-Regular",
    color: "#9CA3AF",
    marginLeft: 8,
  },
  logMessage: {
    fontSize: 14,
    fontFamily: "Inter-Regular",
    color: "#64748B",
    marginBottom: 8,
    lineHeight: 18,
  },
  entityBadge: {
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: "flex-start",
  },
  entityBadgeText: {
    fontSize: 12,
    fontFamily: "Inter-Medium",
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#6A009C",
    marginLeft: 8,
    marginTop: 4,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
  },
  loadingText: {
    fontSize: 16,
    fontFamily: "Inter-Medium",
    color: "#64748B",
    marginTop: 16,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  emptyTitle: {
    marginTop: 16,
    fontSize: 20,
    fontFamily: "Inter-Bold",
    color: "#1E293B",
    textAlign: "center",
  },
  emptySubtitle: {
    marginTop: 8,
    fontSize: 14,
    fontFamily: "Inter-Regular",
    color: "#64748B",
    textAlign: "center",
    lineHeight: 20,
  },
  emptyText: {
    marginTop: 16,
    fontSize: 18,
    fontFamily: "Inter-SemiBold",
    color: "#1E293B",
  },
  emptySubtext: {
    marginTop: 8,
    fontSize: 14,
    color: "#64748B",
    textAlign: "center",
    fontFamily: "Inter-Regular",
  },
  paginationContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingVertical: 16,
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
  },
  paginationButton: {
    flexDirection: "row",
    alignItems: "center",
    padding: 8,
  },
  paginationButtonText: {
    fontSize: 14,
    fontFamily: "Inter-Medium",
    color: "#6A009C",
  },
  pageIndicator: {
    fontSize: 14,
    fontFamily: "Inter-Medium",
    color: "#1E293B",
  },
  disabledButton: {
    opacity: 0.5,
  },
  disabledButtonText: {
    color: "#94A3B8",
  }
});

export default Logs;