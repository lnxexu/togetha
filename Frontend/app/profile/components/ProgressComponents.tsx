import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { ProgressSummary, DailyProgress, WeeklyProgress } from '../services/progressService';
import { SimpleLineChart, SimpleBarChart } from './SimpleCharts';

interface ProgressCardProps {
  data: ProgressSummary;
  compact?: boolean;
}

export const ProgressCard: React.FC<ProgressCardProps> = ({ data, compact = false }) => {
  return (
    <View style={[styles.card, compact && styles.compactCard]}>
      <View style={styles.cardHeader}>
        <View style={[styles.iconContainer, { backgroundColor: `${data.color}15` }]}>
          <MaterialIcons name={data.icon as any} size={compact ? 20 : 24} color={data.color} />
        </View>
        <View style={styles.cardInfo}>
          <Text style={[styles.cardTitle, compact && styles.compactTitle]}>{data.title}</Text>
          {!compact && (
            <Text style={styles.cardDescription}>{data.description}</Text>
          )}
        </View>
      </View>
      
      <View style={styles.cardMetrics}>
        <View style={styles.valueSection}>
          <Text style={[styles.cardValue, { color: data.color }]}>{data.value}</Text>
          {data.trend && (
            <View style={styles.trendSection}>
              <MaterialIcons 
                name={
                  data.trend === 'up' ? 'trending-up' : 
                  data.trend === 'down' ? 'trending-down' : 
                  'trending-flat'
                } 
                size={18} 
                color={
                  data.trend === 'up' ? '#4CAF50' : 
                  data.trend === 'down' ? '#F44336' : 
                  '#757575'
                } 
              />
              {data.change && (
                <Text style={[styles.changeText, { 
                  color: data.trend === 'up' ? '#4CAF50' : 
                         data.trend === 'down' ? '#F44336' : '#757575'
                }]}>
                  {data.change > 0 ? '+' : ''}{data.change}%
                </Text>
              )}
            </View>
          )}
        </View>
        
        {!compact && (
          <View style={styles.progressIndicator}>
            <View style={[styles.progressBar, { backgroundColor: `${data.color}20` }]}>
              <View 
                style={[
                  styles.progressFill, 
                  { 
                    backgroundColor: data.color,
                    width: `${Math.min((typeof data.value === 'number' ? data.value : 0) * 10, 100)}%`
                  }
                ]} 
              />
            </View>
          </View>
        )}
      </View>
      
      {!compact && data.trend && (
        <View style={styles.cardFooter}>
          <Text style={styles.footerText}>
            {data.trend === 'up' ? 'Trending upward' : 
             data.trend === 'down' ? 'Needs attention' : 
             'Stable performance'}
          </Text>
        </View>
      )}
    </View>
  );
};

interface ProgressChartProps {
  dailyData: DailyProgress[];
  type: 'tasks' | 'notes';
  title: string;
  color: string;
}

export const ProgressChart: React.FC<ProgressChartProps> = ({ 
  dailyData, 
  type, 
  title, 
  color 
}) => {
  const chartData = {
    labels: dailyData.map(d => d.day_name),
    datasets: [
      {
        data: dailyData.map(d => type === 'tasks' ? d.tasks : d.notes),
        color: (opacity = 1) => color,
        strokeWidth: 3,
      },
    ],
  };

  const chartConfig = {
    backgroundGradientFrom: '#fff',
    backgroundGradientTo: '#fff',
    color: (opacity = 1) => color,
    strokeWidth: 2,
    barPercentage: 0.7,
    useShadowColorFromDataset: false,
    decimalPlaces: 0,
    propsForLabels: {
      fontSize: 12,
      fontFamily: 'Inter-Medium',
    },
    propsForVerticalLabels: {
      fontSize: 10,
      fontFamily: 'Inter-Regular',
    },
  };

  const maxValue = Math.max(...dailyData.map(d => type === 'tasks' ? d.tasks : d.notes));

  return (
    <View style={styles.chartCard}>
      <Text style={styles.chartTitle}>{title}</Text>
      <View style={styles.chartContainer}>
        {maxValue > 0 ? (
          <SimpleLineChart
            data={dailyData.map(d => type === 'tasks' ? d.tasks : d.notes)}
            labels={dailyData.map(d => d.day_name)}
            width={300}
            height={150}
            color={color}
            title={title}
          />
        ) : (
          <View style={styles.noDataContainer}>
            <MaterialIcons name="trending-up" size={48} color="#E0E0E0" />
            <Text style={styles.noDataText}>No activity this week</Text>
            <Text style={styles.noDataSubtext}>Complete some {type} to see your progress!</Text>
          </View>
        )}
      </View>
    </View>
  );
};

interface WeeklyProgressChartProps {
  weeklyData: WeeklyProgress[];
  title: string;
}

export const WeeklyProgressChart: React.FC<WeeklyProgressChartProps> = ({ 
  weeklyData, 
  title 
}) => {
  const chartData = {
    labels: weeklyData.map(w => w.week_label),
    datasets: [
      {
        data: weeklyData.map(w => w.tasks),
        color: (opacity = 1) => '#4CAF50',
        strokeWidth: 2,
      },
      {
        data: weeklyData.map(w => w.notes),
        color: (opacity = 1) => '#2196F3',
        strokeWidth: 2,
      },
    ],
  };

  const chartConfig = {
    backgroundGradientFrom: '#fff',
    backgroundGradientTo: '#fff',
    color: (opacity = 1) => '#757575',
    strokeWidth: 2,
    barPercentage: 0.6,
    useShadowColorFromDataset: false,
    decimalPlaces: 0,
    propsForLabels: {
      fontSize: 12,
      fontFamily: 'Inter-Medium',
    },
  };

  const hasData = weeklyData.some(w => w.tasks > 0 || w.notes > 0);

  return (
    <View style={styles.chartCard}>
      <Text style={styles.chartTitle}>{title}</Text>
      <View style={styles.chartContainer}>
        {hasData ? (
          <SimpleBarChart
            data={weeklyData.map(w => ({
              label: w.week_label,
              tasks: w.tasks,
              notes: w.notes
            }))}
            width={300}
            height={180}
            title={title}
          />
        ) : (
          <View style={styles.noDataContainer}>
            <MaterialIcons name="bar-chart" size={48} color="#E0E0E0" />
            <Text style={styles.noDataText}>No weekly activity</Text>
            <Text style={styles.noDataSubtext}>Start creating content to track your progress!</Text>
          </View>
        )}
      </View>
    </View>
  );
};

interface ProgressOverviewProps {
  summary: ProgressSummary[];
  dailyData: DailyProgress[];
  weeklyData: WeeklyProgress[];
  period: string;
}

export const ProgressOverview: React.FC<ProgressOverviewProps> = ({
  summary,
  dailyData,
  weeklyData,
  period,
}) => {
  return (
    <View style={styles.overviewContainer}>
      {/* Summary Cards */}
      <View style={styles.summaryGrid}>
        {summary.map((item, index) => (
          <ProgressCard key={index} data={item} compact />
        ))}
      </View>

      {/* Charts */}
      <View style={styles.chartsContainer}>
        <ProgressChart
          dailyData={dailyData}
          type="tasks"
          title="Daily Tasks Completed"
          color="#4CAF50"
        />
        
        <ProgressChart
          dailyData={dailyData}
          type="notes"
          title="Daily Notes Created"
          color="#2196F3"
        />

        {period === 'month' && (
          <WeeklyProgressChart
            weeklyData={weeklyData}
            title="Weekly Progress Overview"
          />
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 12,
    shadowColor: '#1E293B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  compactCard: {
    padding: 16,
    marginBottom: 8,
    flex: 1,
    marginHorizontal: 4,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  cardInfo: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 16,
    color: '#1E293B',
    fontFamily: 'Inter-SemiBold',
    marginBottom: 4,
  },
  cardDescription: {
    fontSize: 14,
    color: '#6c757d',
    fontFamily: 'Inter-Regular',
  },
  valueContainer: {
    alignItems: 'center',
  },
  cardValue: {
    fontSize: 28,
    fontFamily: 'Inter-Bold',
    marginBottom: 4,
  },
  chartCard: {
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
    fontSize: 18,
    color: '#1E293B',
    fontFamily: 'Inter-Bold',
    marginBottom: 16,
    textAlign: 'center',
  },
  chartContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  chart: {
    borderRadius: 8,
  },
  noDataContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  noDataText: {
    fontSize: 16,
    color: '#6c757d',
    fontFamily: 'Inter-Medium',
    marginTop: 12,
  },
  noDataSubtext: {
    fontSize: 14,
    color: '#9CA3AF',
    fontFamily: 'Inter-Regular',
    marginTop: 4,
    textAlign: 'center',
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 12,
    gap: 20,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  legendColor: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 8,
  },
  legendText: {
    fontSize: 14,
    color: '#6c757d',
    fontFamily: 'Inter-Medium',
  },
  overviewContainer: {
    flex: 1,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 20,
    gap: 8,
  },
  chartsContainer: {
    gap: 8,
  },
  chartPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#E5E7EB',
    borderStyle: 'dashed',
  },
  chartPlaceholderText: {
    fontSize: 16,
    color: '#6B7280',
    fontFamily: 'Inter-Medium',
    marginTop: 12,
    textAlign: 'center',
  },
  chartSubtext: {
    fontSize: 14,
    color: '#9CA3AF',
    fontFamily: 'Inter-Regular',
    marginTop: 4,
    textAlign: 'center',
  },
  compactTitle: {
    fontSize: 14,
    color: '#1E293B',
    fontFamily: 'Inter-SemiBold',
    marginBottom: 2,
  },
  cardMetrics: {
    marginTop: 12,
  },
  valueSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  trendSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  changeText: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    fontWeight: '600',
  },
  progressIndicator: {
    marginTop: 8,
  },
  progressBar: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  cardFooter: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  footerText: {
    fontSize: 12,
    color: '#64748B',
    fontFamily: 'Inter-Medium',
    textAlign: 'center',
  },
});