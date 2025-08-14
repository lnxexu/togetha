import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { API_URL } from '@/constants/ApiConfig';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';

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

const Logs: React.FC = () => {
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);
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
    }
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
        return <Ionicons name="information-circle" size={24} color={'#fff'} />;
      case 'WARNING':
        return <Ionicons name="warning" size={24} color="#ffa500" />;
      case 'ERROR':
        return <Ionicons name="alert-circle" size={24} color="#ff0000" />;
      case 'SUCCESS':
        return <Ionicons name="checkmark-circle" size={24} color="#00cc00" />;
      default:
        return <Ionicons name="ellipse" size={24} color="#888" />;
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={'#fff'} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerContainer}>
        <Text style={styles.header}>Activity Logs</Text>
        <View style={styles.filterContainer}>
          <TouchableOpacity 
            style={[styles.filterButton, filter === 'all' && styles.activeFilter]} 
            onPress={() => setFilter('all')}>
            <Text style={filter === 'all' ? styles.activeFilterText : styles.filterText}>All</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.filterButton, filter === 'unread' && styles.activeFilter]} 
            onPress={() => setFilter('unread')}>
            <Text style={filter === 'unread' ? styles.activeFilterText : styles.filterText}>Unread</Text>
          </TouchableOpacity>
        </View>
        {logs.length > 0 && (
          <TouchableOpacity style={styles.markAllButton} onPress={markAllAsRead}>
            <Text style={styles.markAllText}>Mark All as Read</Text>
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={logs}
        keyExtractor={item => item.id?.toString()}
        renderItem={({ item }) => (
          <TouchableOpacity 
            style={[styles.logItem, !item.read && styles.unreadItem]}
            onPress={() => markAsRead(item.id)}
          >
            <View style={styles.logHeader}>
              {getLogIcon(item.level)}
              <View style={styles.logContent}>
                <Text style={styles.activity}>{item.message || item.action}</Text>
                {item.entity_type && (
                  <Text style={styles.entityText}>
                    {item.entity_type}: {item.entity_id}
                  </Text>
                )}
              </View>
            </View>
            <Text style={styles.timestamp}>{formatDate(item.timestamp)}</Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="documents-outline" size={64} color="#ccc" />
            <Text style={styles.emptyText}>No logs found</Text>
          </View>
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        padding: 16,
        backgroundColor: '#1E1E2C',
    },
    headerContainer: {
        marginBottom: 16,
    },
    header: {
        fontSize: 24,
        fontWeight: 'bold',
        marginBottom: 8,
        color: '#ECEDEE'
    },
    filterContainer: {
        flexDirection: 'row',
        marginBottom: 12,
    },
    filterButton: {
        paddingVertical: 6,
        paddingHorizontal: 12,
        marginRight: 8,
        borderRadius: 20,
        backgroundColor: '#f0f0f0',
    },
    activeFilter: {
        backgroundColor: '#fff',
    },
    filterText: {
        color: '#555',
    },
    activeFilterText: {
        color: 'white',
        fontWeight: '500',
    },
    markAllButton: {
        alignSelf: 'flex-end',
        padding: 8,
    },
    markAllText: {
        color: '#fff',
        fontWeight: '500',
    },
    logItem: {
        padding: 12,
        marginBottom: 8,
        borderRadius: 8,
        backgroundColor: '#f9f9f9',
        borderLeftWidth: 4,
        borderLeftColor: '#ddd',
    },
    unreadItem: {
        borderLeftColor: '#fff',
        backgroundColor: '#f0f7ff',
    },
    logHeader: {
        flexDirection: 'row',
        alignItems: 'flex-start',
    },
    logContent: {
        flex: 1,
        marginLeft: 8,
    },
    activity: {
        fontSize: 16,
        color: '#333',
        marginBottom: 4,
    },
    entityText: {
        fontSize: 14,
        color: '#666',
    },
    timestamp: {
        fontSize: 12,
        color: '#888',
        marginTop: 6,
        textAlign: 'right',
    },
    centered: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center'
    },
    emptyContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        padding: 40,
    },
    emptyText: {
        marginTop: 16,
        fontSize: 16,
        color: '#999',
    }
});

export default Logs;