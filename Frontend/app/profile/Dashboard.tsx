import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Platform,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';

import { RootStackParamList } from '../navigation/AppNavigator';
import { progressService, ProgressData, ProgressSummary } from './services/progressService';
import { ProgressCard } from './components/ProgressComponents';
import { SafeAreaWrapper } from '../components/SafeAreaWrapper';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const Dashboard: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const [selectedPeriod, setSelectedPeriod] = useState<'week' | 'month' | 'year' | 'overall'>('month');
  const [progressData, setProgressData] = useState<ProgressData | null>(null);
  const [progressSummary, setProgressSummary] = useState<ProgressSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const periodOptions = [
    { key: 'week', label: 'This Week', icon: 'date-range' },
    { key: 'month', label: 'This Month', icon: 'calendar-month' },
    { key: 'year', label: 'This Year', icon: 'calendar-today' },
    { key: 'overall', label: 'All Time', icon: 'history' },
  ] as const;

  // Load progress data when screen is focused or period changes
  useFocusEffect(
    React.useCallback(() => {
      loadProgressData();
      return () => {};
    }, [selectedPeriod])
  );

  const loadProgressData = async (refresh = false) => {
    try {
      if (refresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      const [data, summary] = await Promise.all([
        progressService.getProgressData(selectedPeriod, refresh),
        progressService.getProgressSummary(selectedPeriod),
      ]);

      setProgressData(data);
      setProgressSummary(summary);
    } catch (error) {
      console.error('Error loading progress data:', error);
      Alert.alert('Error', 'Failed to load progress data. Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    loadProgressData(true);
  };

  if (loading && !progressData) {
    return (
  <SafeAreaWrapper>
      <View style={styles.container}>
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
              <MaterialIcons name="arrow-back" size={24} color="#FFFFFF" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Progress Dashboard</Text>
            <View style={styles.placeholder} />
          </View>
        </LinearGradient>
        
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#6A009C" />
          <Text style={styles.loadingText}>Loading dashboard...</Text>
        </View>
      </View>
      </SafeAreaWrapper>
    );
  }

  return (
    <SafeAreaWrapper>
    <View style={styles.container}>
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
            <MaterialIcons name="arrow-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Progress Dashboard</Text>
          <View style={styles.placeholder} />
        </View>

        {/* Period Selector */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.periodSelector}
          contentContainerStyle={styles.periodSelectorContent}
        >
          {periodOptions.map((option) => (
            <TouchableOpacity
              key={option.key}
              style={[
                styles.periodButton,
                selectedPeriod === option.key && styles.periodButtonActive,
              ]}
              onPress={() => setSelectedPeriod(option.key)}
            >
              <MaterialIcons
                name={option.icon as any}
                size={20}
                color={selectedPeriod === option.key ? '#6A009C' : '#FFFFFF'}
              />
              <Text
                style={[
                  styles.periodButtonText,
                  selectedPeriod === option.key && styles.periodButtonTextActive,
                ]}
              >
                {option.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </LinearGradient>

      {/* Content */}
      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={['#6A009C']}
          />
        }
      >
        {/* Period Info */}
        {progressData && (
          <View style={styles.periodInfo}>
            <Text style={styles.periodTitle}>{progressData.period_name}</Text>
            <Text style={styles.periodSubtitle}>
              {new Date(progressData.start_date).toLocaleDateString()} -{' '}
              {new Date(progressData.end_date).toLocaleDateString()}
            </Text>
          </View>
        )}

        {/* All Progress Cards */}
        {progressSummary.length > 0 && (
          <View style={styles.allCardsSection}>
            <Text style={styles.sectionTitle}>Complete Progress Overview</Text>
            <Text style={styles.sectionSubtitle}>Detailed breakdown of your productivity metrics</Text>
            <View style={styles.cardsGrid}>
              {progressSummary.map((item, index) => (
                <ProgressCard key={index} data={item} />
              ))}
            </View>
          </View>
        )}

        {/* Progress Charts */}
        {progressData && progressData.daily_progress.length > 0 && (
          <View style={styles.chartsSection}>
            <Text style={styles.sectionTitle}>Weekly Activity Trends</Text>
            <Text style={styles.sectionSubtitle}>Visual breakdown of your daily activity patterns</Text>
            
            <View style={styles.chartContainer}>
              <Text style={styles.chartTitle}>Daily Activity Overview (Last 7 Days)</Text>
              <View style={styles.simpleChart}>
                {progressData.daily_progress.map((day, index) => {
                  const totalActivity = day.tasks + day.notes;
                  const maxTotal = Math.max(...progressData.daily_progress.map(d => d.tasks + d.notes), 1);
                  return (
                    <View key={index} style={styles.chartDay}>
                      <View style={styles.chartBarContainer}>
                        <View 
                          style={[
                            styles.chartBar, 
                            { 
                              height: Math.max((totalActivity / maxTotal) * 80, 2),
                              backgroundColor: '#9C27B0'
                            }
                          ]} 
                        />
                      </View>
                      <Text style={styles.chartLabel}>{day.day_name.slice(0, 3)}</Text>
                      <Text style={styles.chartValue}>{totalActivity}</Text>
                    </View>
                  );
                })}
              </View>
              <Text style={styles.chartNote}>Combined tasks and notes created per day</Text>
            </View>
          </View>
        )}

        {/* Achievement Insights */}
        {progressData && (
          <View style={styles.insightsSection}>
            <Text style={styles.sectionTitle}>Insights & Achievements</Text>
            
            <View style={styles.insightCard}>
              <MaterialIcons name="emoji-events" size={24} color="#FFD700" />
              <View style={styles.insightContent}>
                <Text style={styles.insightTitle}>
                  {getProductivityInsight(progressData)}
                </Text>
                <Text style={styles.insightDescription}>
                  {getProductivityDescription(progressData)}
                </Text>
              </View>
            </View>
          </View>
        )}

        <View style={styles.bottomPadding} />
      </ScrollView>
    </View>
    </SafeAreaWrapper>
  );
};

// Helper functions for insights
const getProductivityInsight = (data: ProgressData): string => {
  const totalActivity = data.tasks_completed + data.notes_created;
  
  if (totalActivity === 0) {
    return "Time to get started!";
  } else if (totalActivity < 5) {
    return "Building momentum!";
  } else if (totalActivity < 20) {
    return "Great progress!";
  } else {
    return "Productivity champion!";
  }
};

const getProductivityDescription = (data: ProgressData): string => {
  const activeDays = data.daily_progress.filter(d => d.tasks > 0 || d.notes > 0).length;
  const totalActivity = data.tasks_completed + data.notes_created;
  
  if (totalActivity === 0) {
    return "Start creating tasks and notes to track your productivity journey.";
  } else if (activeDays >= 5) {
    return `Amazing consistency! You've been active for ${activeDays} out of 7 days.`;
  } else if (totalActivity >= 10) {
    return `You've completed ${totalActivity} activities ${data.period_name.toLowerCase()}. Keep it up!`;
  } else {
    return `You're making progress with ${totalActivity} activities. Try to stay consistent!`;
  }
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
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
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 24,
    color: '#FFFFFF',
    fontFamily: 'Inter-Bold',
    textAlign: 'center',
    flex: 1,
  },
  placeholder: {
    width: 40,
  },
  periodSelector: {
    marginTop: 10,
  },
  periodSelectorContent: {
    paddingHorizontal: 4,
    gap: 8,
  },
  periodButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    gap: 6,
  },
  periodButtonActive: {
    backgroundColor: '#FFFFFF',
  },
  periodButtonText: {
    fontSize: 14,
    color: '#FFFFFF',
    fontFamily: 'Inter-Medium',
  },
  periodButtonTextActive: {
    color: '#6A009C',
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 18,
    color: '#6A009C',
    fontFamily: 'Inter-Medium',
    marginTop: 12,
  },
  periodInfo: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#1E293B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  periodTitle: {
    fontSize: 20,
    color: '#1E293B',
    fontFamily: 'Inter-Bold',
    marginBottom: 4,
  },
  periodSubtitle: {
    fontSize: 14,
    color: '#6c757d',
    fontFamily: 'Inter-Regular',
  },
  insightsSection: {
    marginBottom: 24,
  },
  insightCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'flex-start',
    shadowColor: '#1E293B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  insightContent: {
    flex: 1,
    marginLeft: 16,
  },
  insightTitle: {
    fontSize: 16,
    color: '#1E293B',
    fontFamily: 'Inter-Bold',
    marginBottom: 4,
  },
  insightDescription: {
    fontSize: 14,
    color: '#6c757d',
    fontFamily: 'Inter-Regular',
    lineHeight: 20,
  },
  allCardsSection: {
    marginBottom: 24,
  },
  overviewSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 20,
    color: '#1E293B',
    fontFamily: 'Inter-Bold',
    marginBottom: 16,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: '#6c757d',
    fontFamily: 'Inter-Regular',
    marginBottom: 16,
    marginTop: -8,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  cardsGrid: {
    flexDirection: 'column',
    gap: 16,
  },
  chartsSection: {
    marginBottom: 24,
  },
  chartContainer: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#1E293B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  chartTitle: {
    fontSize: 16,
    color: '#1E293B',
    fontFamily: 'Inter-SemiBold',
    marginBottom: 12,
  },
  simpleChart: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    height: 120,
    paddingHorizontal: 8,
  },
  chartDay: {
    flex: 1,
    alignItems: 'center',
    marginHorizontal: 2,
  },
  chartBarContainer: {
    height: 80,
    justifyContent: 'flex-end',
    width: 20,
    marginBottom: 8,
  },
  chartBar: {
    width: '100%',
    borderRadius: 4,
    minHeight: 2,
  },
  chartLabel: {
    fontSize: 10,
    color: '#6c757d',
    fontFamily: 'Inter-Medium',
    marginBottom: 2,
  },
  chartValue: {
    fontSize: 12,
    color: '#1E293B',
    fontFamily: 'Inter-Bold',
  },
  chartNote: {
    fontSize: 12,
    color: '#6c757d',
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
    marginTop: 8,
    fontStyle: 'italic',
  },
  bottomPadding: {
    height: 100,
  },
});

export default Dashboard;