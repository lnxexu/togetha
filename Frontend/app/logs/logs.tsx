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
  Platform,
  Modal,
  TextInput 
} from 'react-native';
import DatePicker from 'react-native-date-picker';
import { API_URL, API_ENDPOINTS } from '@/constants/ApiConfig';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/AppNavigator";
import { SafeAreaWrapper } from "../components/SafeAreaWrapper";

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
  
  // Filter states
  const [showFilters, setShowFilters] = useState(false);
  const [levelFilter, setLevelFilter] = useState<string>('all');
  const [actionFilter, setActionFilter] = useState<string>('');
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [showStartDatePicker, setShowStartDatePicker] = useState(false);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);
  const [allLogs, setAllLogs] = useState<Log[]>([]);
  const [selectedLog, setSelectedLog] = useState<Log | null>(null);
  const [showLogDetailModal, setShowLogDetailModal] = useState(false);

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
          'X-Client-Timezone': Intl.DateTimeFormat().resolvedOptions().timeZone || '',
        },
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch logs: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data && typeof data === 'object') {
        // Handle paginated response structure
        if (Array.isArray(data.results)) {
          setAllLogs(data.results);
          setLogs(data.results);
          setPagination({
            totalLogs: data.count || 0,
            totalPages: Math.ceil((data.count || 0) / LOGS_PER_PAGE),
            currentPage: pagination.currentPage
          });
        } else if (Array.isArray(data)) {
          // Fallback for non-paginated API response
          setAllLogs(data);
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
          'X-Client-Timezone': Intl.DateTimeFormat().resolvedOptions().timeZone || '',
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
          'X-Client-Timezone': Intl.DateTimeFormat().resolvedOptions().timeZone || '',
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
        return <Ionicons name="information-circle" size={24} color="#3B82F6" />;
      case 'WARNING':
        return <Ionicons name="warning" size={24} color="#F59E0B" />;
      case 'ERROR':
        return <Ionicons name="close-circle" size={24} color="#EF4444" />;
      case 'SUCCESS':
        return <Ionicons name="checkmark-circle" size={24} color="#10B981" />;
      case 'SECURITY':
        return <Ionicons name="shield-checkmark" size={24} color="#8B5CF6" />;
      case 'AUDIT':
        return <Ionicons name="document-text" size={24} color="#6366F1" />;
      default:
        return <Ionicons name="ellipse" size={24} color="#8B5CF6" />;
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

  // Filter functions
  const applyFilters = () => {
    let filtered = [...allLogs];
    
    // Level filter
    if (levelFilter !== 'all') {
      filtered = filtered.filter(log => log.level?.toLowerCase() === levelFilter.toLowerCase());
    }
    
    // Action filter
    if (actionFilter.trim()) {
      filtered = filtered.filter(log => 
        log.action?.toLowerCase().includes(actionFilter.toLowerCase()) ||
        log.message?.toLowerCase().includes(actionFilter.toLowerCase())
      );
    }
    
    // Date range filter
    if (startDate || endDate) {
      filtered = filtered.filter(log => {
        const logDate = new Date(log.timestamp);
        const start = startDate ? new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate()) : null;
        const end = endDate ? new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate(), 23, 59, 59) : null;
        
        if (start && end) {
          return logDate >= start && logDate <= end;
        } else if (start) {
          return logDate >= start;
        } else if (end) {
          return logDate <= end;
        }
        return true;
      });
    }
    
    setLogs(filtered);
  };
  
  const clearFilters = () => {
    setLevelFilter('all');
    setActionFilter('');
    setStartDate(null);
    setEndDate(null);
    setLogs(allLogs);
  };
  
  const formatDate = (date: Date | null) => {
    if (!date) return 'Select date';
    return date.toLocaleDateString();
  };
  
  const getLevelOptions = () => {
    const levels = [...new Set(allLogs.map(log => log.level).filter(Boolean))];
    return ['all', ...levels];
  };
  
  // Apply filters when filter values change
  useEffect(() => {
    if (allLogs.length > 0) {
      applyFilters();
    }
  }, [levelFilter, actionFilter, startDate, endDate, allLogs]);

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
    <SafeAreaWrapper backgroundColor="#F8FAFC" includeNavBar={false}>
      <StatusBar barStyle="light-content" backgroundColor="#7C3AED" />
      
      {/* Enhanced Header with Visual Improvements */}
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
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          
          <View style={styles.headerTitleContainer}>
            <View>
              <Text style={styles.headerTitle}>Security Audit Log</Text>
              <Text style={styles.headerSubtitle}>
                {logs.length} {logs.length === 1 ? 'entry' : 'entries'}
                {(levelFilter !== 'all' || actionFilter || startDate || endDate) && ' (filtered)'}
              </Text>
            </View>
            {unreadCount > 0 && (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadBadgeText}>{unreadCount}</Text>
              </View>
            )}
          </View>

          <View style={styles.headerActions}>
            <TouchableOpacity
              style={[
                styles.filterButton,
                (levelFilter !== 'all' || actionFilter || startDate || endDate) && styles.filterButtonActive
              ]}
              onPress={() => setShowFilters(true)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons 
                name={levelFilter !== 'all' || actionFilter || startDate || endDate ? "filter" : "filter-outline"} 
                size={22} 
                color="#FFFFFF" 
              />
              {(levelFilter !== 'all' || actionFilter || startDate || endDate) && (
                <View style={styles.filterIndicator} />
              )}
            </TouchableOpacity>
            
            {unreadCount > 0 && (
              <TouchableOpacity
                style={styles.markAllButton}
                onPress={markAllAsRead}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="checkmark-done" size={22} color="#FFFFFF" />
              </TouchableOpacity>
            )}
          </View>
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
            renderItem={({ item, index }) => (
              <TouchableOpacity 
                style={[
                  styles.logCard,
                  !item.read && styles.unreadLogCard,
                  { marginBottom: index === logs.length - 1 ? 20 : 12 }
                ]}
                onPress={() => {
                  if (!item.read) markAsRead(item.id);
                  setSelectedLog(item);
                  setShowLogDetailModal(true);
                }}
                activeOpacity={0.7}
                hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
              >
                <View style={styles.logContent}>
                  <View style={[
                    styles.logIconContainer,
                    getLogIconBackground(item.level),
                    !item.read && styles.unreadIconContainer
                  ]}>
                    {getLogIcon(item.level)}
                  </View>
                  
                  <View style={styles.logTextContent}>
                    <View style={styles.logHeader}>
                      <Text 
                        style={[
                          styles.logTitle,
                          !item.read && styles.unreadLogTitle
                        ]}
                        numberOfLines={1}
                      >
                        {item.action || item.level}
                      </Text>
                      {!item.read && <View style={styles.unreadDot} />}
                    </View>
                    
                    <Text 
                      style={[
                        styles.logMessage,
                        !item.read && styles.unreadLogMessage
                      ]} 
                      numberOfLines={2}
                    >
                      {item.message}
                    </Text>

                    <View style={styles.logFooter}>
                      <View style={styles.logMetadata}>
                        <Ionicons name="time-outline" size={14} color="#9CA3AF" />
                        <Text style={styles.logTime}>
                          {formatTimeAgo(item.timestamp)}
                        </Text>
                      </View>
                      
                      <View style={[
                        styles.levelBadge,
                        { backgroundColor: getLogColor(item.level) + '15' }
                      ]}>
                        <Text style={[
                          styles.levelBadgeText,
                          { color: getLogColor(item.level) }
                        ]}>
                          {item.level?.toUpperCase()}
                        </Text>
                      </View>
                    </View>
                  </View>
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
      
      {/* Filter Modal */}
      <Modal
        visible={showFilters}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowFilters(false)}
      >
        <View style={styles.filterModal}>
          <View style={styles.filterHeader}>
            <Text style={styles.filterTitle}>Filter Logs</Text>
            <TouchableOpacity
              onPress={() => setShowFilters(false)}
              style={styles.closeFilterButton}
            >
              <Ionicons name="close" size={24} color="#6B7280" />
            </TouchableOpacity>
          </View>
          
          <View style={styles.filterContent}>
            {/* Level Filter */}
            <View style={styles.filterSection}>
              <Text style={styles.filterLabel}>Log Level</Text>
              <View style={styles.levelFilterContainer}>
                {getLevelOptions().map((level) => (
                  <TouchableOpacity
                    key={level}
                    style={[
                      styles.levelFilterButton,
                      levelFilter === level && styles.activeLevelFilter
                    ]}
                    onPress={() => setLevelFilter(level)}
                  >
                    <Text style={[
                      styles.levelFilterText,
                      levelFilter === level && styles.activeLevelFilterText
                    ]}>
                      {level.toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            
            {/* Action/Message Filter */}
            <View style={styles.filterSection}>
              <Text style={styles.filterLabel}>Search Action/Message</Text>
              <TextInput
                style={styles.filterInput}
                placeholder="Type to search..."
                value={actionFilter}
                onChangeText={setActionFilter}
                placeholderTextColor="#9CA3AF"
              />
            </View>
            
            {/* Date Range Filter */}
            <View style={styles.filterSection}>
              <Text style={styles.filterLabel}>Date Range</Text>
              
              <View style={styles.dateFilterRow}>
                <TouchableOpacity
                  style={styles.dateButton}
                  onPress={() => setShowStartDatePicker(true)}
                >
                  <Ionicons name="calendar" size={20} color="#6A009C" />
                  <Text style={styles.dateButtonText}>
                    From: {formatDate(startDate)}
                  </Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={styles.dateButton}
                  onPress={() => setShowEndDatePicker(true)}
                >
                  <Ionicons name="calendar" size={20} color="#6A009C" />
                  <Text style={styles.dateButtonText}>
                    To: {formatDate(endDate)}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
            
            {/* Filter Actions */}
            <View style={styles.filterActions}>
              <TouchableOpacity
                style={styles.clearFiltersButton}
                onPress={clearFilters}
              >
                <Text style={styles.clearFiltersText}>Clear All</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={styles.applyFiltersButton}
                onPress={() => setShowFilters(false)}
              >
                <Text style={styles.applyFiltersText}>Apply Filters</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      
      {/* Log Detail Preview Modal */}
      <Modal
        visible={showLogDetailModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowLogDetailModal(false)}
      >
        <View style={styles.logDetailModal}>
          <View style={styles.logDetailHeader}>
            <Text style={styles.logDetailTitle}>Log Details</Text>
            <TouchableOpacity
              onPress={() => setShowLogDetailModal(false)}
              style={styles.closeLogDetailButton}
            >
              <Ionicons name="close" size={24} color="#6B7280" />
            </TouchableOpacity>
          </View>

          {selectedLog && (
            <View style={styles.logDetailContent}>
              {/* Log Level Badge */}
              <View style={styles.logDetailSection}>
                <View style={[
                  styles.logDetailLevelBadge,
                  { backgroundColor: getLogColor(selectedLog.level) + '15' }
                ]}>
                  <View style={[
                    styles.logDetailIconContainer,
                    getLogIconBackground(selectedLog.level)
                  ]}>
                    {getLogIcon(selectedLog.level)}
                  </View>
                  <View style={styles.logDetailLevelInfo}>
                    <Text style={[
                      styles.logDetailLevelText,
                      { color: getLogColor(selectedLog.level) }
                    ]}>
                      {selectedLog.level?.toUpperCase()}
                    </Text>
                    <Text style={styles.logDetailLevelSubtext}>Security Level</Text>
                  </View>
                </View>
              </View>

              {/* Action */}
              <View style={styles.logDetailSection}>
                <Text style={styles.logDetailLabel}>Action</Text>
                <View style={styles.logDetailValueContainer}>
                  <Ionicons name="flash-outline" size={18} color="#6B7280" />
                  <Text style={styles.logDetailValue}>{selectedLog.action || 'N/A'}</Text>
                </View>
              </View>

              {/* Message */}
              <View style={styles.logDetailSection}>
                <Text style={styles.logDetailLabel}>Message</Text>
                <View style={styles.logDetailMessageContainer}>
                  <Text style={styles.logDetailMessage}>{selectedLog.message}</Text>
                </View>
              </View>

              {/* Timestamp Details */}
              <View style={styles.logDetailSection}>
                <Text style={styles.logDetailLabel}>Timestamp</Text>
                <View style={styles.logDetailTimestampContainer}>
                  <View style={styles.logDetailTimestampRow}>
                    <Ionicons name="calendar-outline" size={18} color="#6B7280" />
                    <Text style={styles.logDetailTimestampText}>
                      {new Date(selectedLog.timestamp).toLocaleDateString('en-US', {
                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                      })}
                    </Text>
                  </View>
                  <View style={styles.logDetailTimestampRow}>
                    <Ionicons name="time-outline" size={18} color="#6B7280" />
                    <Text style={styles.logDetailTimestampText}>
                      {new Date(selectedLog.timestamp).toLocaleTimeString('en-US', {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                        hour12: true
                      })}
                    </Text>
                  </View>
                  <View style={styles.logDetailTimestampRow}>
                    <Ionicons name="hourglass-outline" size={18} color="#6B7280" />
                    <Text style={styles.logDetailTimestampText}>
                      {formatTimeAgo(selectedLog.timestamp)}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Entity Information */}
              {(selectedLog.entity_type || selectedLog.entity_id) && (
                <View style={styles.logDetailSection}>
                  <Text style={styles.logDetailLabel}>Related Entity</Text>
                  <View style={styles.logDetailEntityContainer}>
                    {selectedLog.entity_type && (
                      <View style={styles.logDetailEntityRow}>
                        <Ionicons name="pricetag-outline" size={18} color="#8B5CF6" />
                        <View style={styles.logDetailEntityInfo}>
                          <Text style={styles.logDetailEntityLabel}>Type</Text>
                          <Text style={styles.logDetailEntityValue}>
                            {selectedLog.entity_type}
                          </Text>
                        </View>
                      </View>
                    )}
                    {selectedLog.entity_id && (
                      <View style={styles.logDetailEntityRow}>
                        <Ionicons name="key-outline" size={18} color="#8B5CF6" />
                        <View style={styles.logDetailEntityInfo}>
                          <Text style={styles.logDetailEntityLabel}>ID</Text>
                          <Text style={styles.logDetailEntityValue}>
                            {selectedLog.entity_id}
                          </Text>
                        </View>
                      </View>
                    )}
                  </View>
                </View>
              )}

              {/* Status Information */}
              <View style={styles.logDetailSection}>
                <Text style={styles.logDetailLabel}>Status</Text>
                <View style={styles.logDetailStatusContainer}>
                  <View style={styles.logDetailStatusRow}>
                    <View style={[
                      styles.logDetailStatusDot,
                      { backgroundColor: selectedLog.read ? '#10B981' : '#F59E0B' }
                    ]} />
                    <Text style={styles.logDetailStatusText}>
                      {selectedLog.read ? 'Read' : 'Unread'}
                    </Text>
                  </View>
                  <View style={styles.logDetailStatusRow}>
                    <Ionicons name="finger-print-outline" size={18} color="#6B7280" />
                    <Text style={styles.logDetailStatusText}>ID: {selectedLog.id}</Text>
                  </View>
                </View>
              </View>
            </View>
          )}

          {/* Modal Footer */}
          <View style={styles.logDetailFooter}>
            <TouchableOpacity
              style={styles.logDetailCloseButton}
              onPress={() => setShowLogDetailModal(false)}
            >
              <Text style={styles.logDetailCloseButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Date Pickers */}
      <DatePicker
        modal
        open={showStartDatePicker}
        date={startDate || new Date()}
        mode="date"
        onConfirm={(date) => {
          setStartDate(date);
          setShowStartDatePicker(false);
        }}
        onCancel={() => setShowStartDatePicker(false)}
        title="Select Start Date"
      />
      
      <DatePicker
        modal
        open={showEndDatePicker}
        date={endDate || new Date()}
        mode="date"
        onConfirm={(date) => {
          setEndDate(date);
          setShowEndDatePicker(false);
        }}
        onCancel={() => setShowEndDatePicker(false)}
        title="Select End Date"
      />
    </SafeAreaWrapper>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  header: {
    paddingTop: Platform.OS === 'ios' ? 12 : 12,
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
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    borderRadius: 8,
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
    paddingBottom: 12,
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
    borderColor: "#E2E8F0",
  },
  unreadLogCard: {
    borderLeftWidth: 4,
    borderLeftColor: "#6A009C",
    backgroundColor: "#FEFEFE",
    shadowOpacity: 0.08,
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
  unreadIconContainer: {
    shadowColor: "#6A009C",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  logTextContent: {
    flex: 1,
  },
  logHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  logTitle: {
    fontSize: 15,
    fontFamily: "Inter-SemiBold",
    color: "#334155",
    flex: 1,
    textTransform: "capitalize",
    marginRight: 8,
  },
  unreadLogTitle: {
    fontFamily: "Inter-Bold",
    color: "#1E293B",
  },
  logTime: {
    fontSize: 12,
    fontFamily: "Inter-Regular",
    color: "#9CA3AF",
  },
  logMessage: {
    fontSize: 14,
    fontFamily: "Inter-Regular",
    color: "#64748B",
    marginBottom: 10,
    lineHeight: 20,
  },
  logMetadata: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#6A009C",
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
    position: "relative",
    marginTop: 12,
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
  },
  
  // Filter styles
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  filterButton: {
    padding: 8,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    borderRadius: 8,
  },
  filterModal: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  filterHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  filterTitle: {
    fontSize: 18,
    fontFamily: "Inter-Bold",
    color: "#1E293B",
  },
  closeFilterButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: "#F1F5F9",
  },
  filterContent: {
    flex: 1,
    padding: 20,
  },
  filterSection: {
    marginBottom: 24,
  },
  filterLabel: {
    fontSize: 16,
    fontFamily: "Inter-SemiBold",
    color: "#1E293B",
    marginBottom: 12,
  },
  levelFilterContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  levelFilterButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: "#F1F5F9",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  activeLevelFilter: {
    backgroundColor: "#6A009C",
    borderColor: "#6A009C",
  },
  levelFilterText: {
    fontSize: 14,
    fontFamily: "Inter-Medium",
    color: "#64748B",
  },
  activeLevelFilterText: {
    color: "#FFFFFF",
  },
  filterInput: {
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    fontFamily: "Inter-Regular",
    backgroundColor: "#FFFFFF",
    color: "#1E293B",
  },
  dateFilterRow: {
    flexDirection: "row",
    gap: 12,
  },
  dateButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    gap: 8,
  },
  dateButtonText: {
    fontSize: 14,
    fontFamily: "Inter-Medium",
    color: "#1E293B",
    flex: 1,
  },
  filterActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 32,
  },
  clearFiltersButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: "#F1F5F9",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    alignItems: "center",
  },
  clearFiltersText: {
    fontSize: 16,
    fontFamily: "Inter-Medium",
    color: "#64748B",
  },
  applyFiltersButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: "#6A009C",
    alignItems: "center",
  },
  applyFiltersText: {
    fontSize: 16,
    fontFamily: "Inter-Medium",
    color: "#FFFFFF",
  },
  
  // Enhanced UI styles
  headerSubtitle: {
    fontSize: 12,
    fontFamily: "Inter-Medium",
    color: "rgba(255, 255, 255, 0.8)",
    marginTop: 2,
  },
  filterButtonActive: {
    backgroundColor: "rgba(255, 255, 255, 0.3)",
  },
  filterIndicator: {
    position: "absolute",
    top: 2,
    right: 2,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#10B981",
  },

  // Log Detail Modal Styles
  logDetailModal: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  logDetailHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  logDetailTitle: {
    fontSize: 20,
    fontFamily: "Inter-Bold",
    color: "#1E293B",
  },
  closeLogDetailButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: "#F1F5F9",
  },
  logDetailContent: {
    flex: 1,
    padding: 20,
  },
  logDetailSection: {
    marginBottom: 24,
  },
  logDetailLabel: {
    fontSize: 12,
    fontFamily: "Inter-Bold",
    color: "#64748B",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  logDetailLevelBadge: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 12,
    backgroundColor: "#F8FAFC",
  },
  logDetailIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 16,
  },
  logDetailLevelInfo: {
    flex: 1,
  },
  logDetailLevelText: {
    fontSize: 24,
    fontFamily: "Inter-Bold",
    marginBottom: 4,
  },
  logDetailLevelSubtext: {
    fontSize: 14,
    fontFamily: "Inter-Regular",
    color: "#64748B",
  },
  logDetailValueContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    gap: 12,
  },
  logDetailValue: {
    fontSize: 16,
    fontFamily: "Inter-SemiBold",
    color: "#1E293B",
    flex: 1,
    textTransform: "capitalize",
  },
  logDetailMessageContainer: {
    backgroundColor: "#FFFFFF",
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  logDetailMessage: {
    fontSize: 15,
    fontFamily: "Inter-Regular",
    color: "#475569",
    lineHeight: 24,
  },
  logDetailTimestampContainer: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    overflow: "hidden",
  },
  logDetailTimestampRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  logDetailTimestampText: {
    fontSize: 15,
    fontFamily: "Inter-Medium",
    color: "#334155",
    flex: 1,
  },
  logDetailEntityContainer: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    overflow: "hidden",
  },
  logDetailEntityRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  logDetailEntityInfo: {
    flex: 1,
  },
  logDetailEntityLabel: {
    fontSize: 12,
    fontFamily: "Inter-Medium",
    color: "#64748B",
    marginBottom: 4,
  },
  logDetailEntityValue: {
    fontSize: 15,
    fontFamily: "Inter-SemiBold",
    color: "#1E293B",
    textTransform: "capitalize",
  },
  logDetailStatusContainer: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 16,
    gap: 12,
  },
  logDetailStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  logDetailStatusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  logDetailStatusText: {
    fontSize: 15,
    fontFamily: "Inter-Medium",
    color: "#334155",
  },
  logDetailFooter: {
    padding: 20,
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
  },
  logDetailCloseButton: {
    backgroundColor: "#6A009C",
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: "center",
  },
  logDetailCloseButtonText: {
    fontSize: 16,
    fontFamily: "Inter-SemiBold",
    color: "#FFFFFF",
  },

  levelBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  levelBadgeText: {
    fontSize: 10,
    fontFamily: "Inter-Bold",
    textTransform: "uppercase",
  },
  unreadLogMessage: {
    color: "#475569",
  },
  logFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

});

export default Logs;