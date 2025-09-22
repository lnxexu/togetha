import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_URL, API_ENDPOINTS } from "../../../constants/ApiConfig";
import usageTrackingService, { UsageStats } from "../../services/usageTrackingService";

export interface ProgressData {
  period: string;
  period_name: string;
  start_date: string;
  end_date: string;
  
  // Usage tracking stats
  total_time_minutes: number;
  total_time_this_week_minutes: number;
  streak_days: number;
  average_daily_time_minutes: number;
  engagement_score: number;
  productivity_score: number;
  consistency_score: number;
  
  // Period-specific stats
  tasks_completed: number;
  notes_created: number;
  chatbot_interactions: number;
  
  // Overall stats
  overall_tasks_completed: number;
  overall_notes_created: number;
  overall_chatbot_interactions: number;
  
  // Chart data
  daily_progress: DailyProgress[];
  weekly_progress: WeeklyProgress[];
  
  // User info
  username: string;
  email: string;
  date_joined: string | null;
  last_login: string | null;
  
  // New usage metrics
  most_used_features: FeatureUsage[];
  productivity_trend: 'up' | 'down' | 'stable';
  session_count: number;
  current_session_active: boolean;
}

export interface DailyProgress {
  date: string;
  day_name: string;
  tasks: number;
  notes: number;
  time_minutes: number;
  engagement_score: number;
}

export interface WeeklyProgress {
  week_start: string;
  week_label: string;
  tasks: number;
  notes: number;
  time_minutes: number;
  productivity_score: number;
}

export interface FeatureUsage {
  feature: string;
  count: number;
}

export interface ProgressSummary {
  title: string;
  value: number;
  icon: string;
  color: string;
  description: string;
  trend?: 'up' | 'down' | 'stable';
  change?: number;
  unit?: string;
}

class ProgressService {
  async getAuthToken(): Promise<string | null> {
    return await AsyncStorage.getItem("authToken");
  }

  async apiRequest<T>(
    endpoint: string,
    method: string = "GET",
    data?: any
  ): Promise<T> {
    const token = await this.getAuthToken();
    if (!token) {
      throw new Error("No authentication token found");
    }

    const headers: HeadersInit = {
      Authorization: `Token ${token}`,
      "Content-Type": "application/json",
    };

    const config: RequestInit = {
      method,
      headers,
      body: data ? JSON.stringify(data) : undefined,
    };

    const response = await fetch(`${API_URL}${endpoint}`, config);

    if (!response.ok) {
      const contentType = response.headers.get("content-type");
      console.error("Failed request:", {
        status: response.status,
        statusText: response.statusText,
        url: response.url,
        contentType,
      });

      const responseClone = response.clone();

      try {
        const errorData = await response.json();
        throw new Error(
          errorData.detail || `Request failed with status ${response.status}`
        );
      } catch (parseError) {
        const errorText = await responseClone.text();
        throw new Error(
          errorText || `Request failed with status ${response.status}`
        );
      }
    }

    const contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
      return (await response.json()) as T;
    } else {
      const text = await response.text();
      console.error("Unexpected response format:", text.substring(0, 200));
      throw new Error("Response was not in JSON format");
    }
  }

  async getProgressData(period: 'week' | 'month' | 'year' | 'overall' = 'month', refresh = false): Promise<ProgressData> {
    try {
      // Get usage tracking data
      const usageStats = await usageTrackingService.getUsageStats('comprehensive');
      
      // Get traditional progress data
      const endpoint = `${API_ENDPOINTS.USER_PROGRESS}?period=${period}&refresh=${refresh}`;
      const response = await this.apiRequest<any>(endpoint);

      // Combine both data sources
      const combinedData: ProgressData = {
        ...response,
        
        // Usage tracking metrics
        total_time_minutes: usageStats?.total_time_today_minutes || 0,
        total_time_this_week_minutes: usageStats?.total_time_this_week_minutes || 0,
        streak_days: usageStats?.streak_days || 0,
        average_daily_time_minutes: usageStats?.average_daily_time_minutes || 0,
        engagement_score: usageStats?.today?.engagement_score || 0,
        productivity_score: usageStats?.this_week?.productivity_score || 0,
        consistency_score: usageStats?.this_week?.consistency_score || 0,
        
        // Enhanced progress data
        most_used_features: usageStats?.most_used_features || [],
        productivity_trend: usageStats?.productivity_trend || 'stable',
        session_count: usageStats?.today?.session_count || 0,
        current_session_active: usageStats?.current_session?.is_active || false,
        
        // Enhanced chart data with time tracking
        daily_progress: response.daily_progress?.map((day: any) => ({
          ...day,
          time_minutes: Math.floor(Math.random() * 120), // This should come from actual usage data
          engagement_score: Math.floor(Math.random() * 100),
        })) || [],
        
        weekly_progress: response.weekly_progress?.map((week: any) => ({
          ...week,
          time_minutes: Math.floor(Math.random() * 500), // This should come from actual usage data
          productivity_score: Math.floor(Math.random() * 100),
        })) || [],
      };

      return combinedData;
    } catch (error) {
      console.error("Error fetching progress data:", error);
      throw error;
    }
  }

  async getProgressSummary(period: 'week' | 'month' | 'year' | 'overall' = 'month'): Promise<ProgressSummary[]> {
    try {
      const [progressData, usageStats] = await Promise.all([
        this.getProgressData(period),
        usageTrackingService.getUsageStats('comprehensive')
      ]);

      const summaryCards: ProgressSummary[] = [
        {
          title: "Daily Time",
          value: usageStats?.total_time_today_minutes || 0,
          icon: "access-time",
          color: "#3B82F6",
          description: "Active time today",
          unit: "min",
          trend: (usageStats?.total_time_today_minutes || 0) > (usageStats?.average_daily_time_minutes || 0) ? 'up' : 'down',
        },
        {
          title: "Streak Days",
          value: usageStats?.streak_days || 0,
          icon: "local-fire-department",
          color: "#F59E0B",
          description: "Consecutive active days",
          trend: 'stable',
        },
        {
          title: "Tasks Done",
          value: progressData.tasks_completed,
          icon: "task-alt",
          color: "#10B981",
          description: `Tasks completed this ${period}`,
          trend: 'up',
        },
        {
          title: "Notes Created",
          value: progressData.notes_created,
          icon: "note-add",
          color: "#8B5CF6",
          description: `Notes created this ${period}`,
          trend: 'up',
        },
        {
          title: "AI Interactions",
          value: progressData.chatbot_interactions,
          icon: "smart-toy",
          color: "#EC4899",
          description: `AI conversations this ${period}`,
          trend: 'up',
        },
        {
          title: "Engagement",
          value: usageStats?.today?.engagement_score || 0,
          icon: "trending-up",
          color: "#06B6D4",
          description: "Today's engagement level",
          trend: usageStats?.productivity_trend === 'up' ? 'up' : 
                usageStats?.productivity_trend === 'down' ? 'down' : 'stable',
        },
        {
          title: "Productivity",
          value: usageStats?.this_week?.productivity_score || 0,
          icon: "speed",
          color: "#84CC16",
          description: "This week's productivity",
          trend: usageStats?.productivity_trend === 'up' ? 'up' : 
                usageStats?.productivity_trend === 'down' ? 'down' : 'stable',
        },
        {
          title: "Consistency",
          value: usageStats?.this_week?.consistency_score || 0,
          icon: "timeline",
          color: "#F97316",
          description: "Usage consistency score",
          trend: 'stable',
        },
      ];

      return summaryCards;
    } catch (error) {
      console.error("Error fetching progress summary:", error);
      return this.getDefaultSummary();
    }
  }

  private calculateStreakDays(dailyProgress: DailyProgress[]): number {
    let streak = 0;
    // Count from the most recent day backwards
    for (let i = dailyProgress.length - 1; i >= 0; i--) {
      const day = dailyProgress[i];
      if (day.tasks > 0 || day.notes > 0) {
        streak++;
      } else {
        break;
      }
    }
    return streak;
  }

  private getDefaultSummary(): ProgressSummary[] {
    return [
      {
        title: "Tasks Completed",
        value: 0,
        icon: "check-circle",
        color: "#4CAF50",
        description: "No data available",
      },
      {
        title: "Notes Created",
        value: 0,
        icon: "note",
        color: "#2196F3",
        description: "No data available",
      },
      {
        title: "AI Interactions",
        value: 0,
        icon: "chat",
        color: "#FF9800",
        description: "No data available",
      },
      {
        title: "Study Streak",
        value: 0,
        icon: "local-fire-department",
        color: "#F44336",
        description: "No data available",
      },
    ];
  }

  // Data export functionality
  async exportUserData(): Promise<string> {
    try {
      const [progressData, monthlyData, yearlyData] = await Promise.all([
        this.getProgressData('overall'),
        this.getProgressData('month'),
        this.getProgressData('year')
      ]);

      const exportData = {
        export_timestamp: new Date().toISOString(),
        user_info: {
          username: progressData.username,
          email: progressData.email,
          date_joined: progressData.date_joined,
          last_login: progressData.last_login,
        },
        progress_summary: {
          overall: {
            tasks_completed: progressData.overall_tasks_completed,
            notes_created: progressData.overall_notes_created,
            chatbot_interactions: progressData.overall_chatbot_interactions,
          },
          this_month: {
            tasks_completed: monthlyData.tasks_completed,
            notes_created: monthlyData.notes_created,
            chatbot_interactions: monthlyData.chatbot_interactions,
          },
          this_year: {
            tasks_completed: yearlyData.tasks_completed,
            notes_created: yearlyData.notes_created,
            chatbot_interactions: yearlyData.chatbot_interactions,
          }
        },
        daily_activity: progressData.daily_progress,
        weekly_activity: progressData.weekly_progress,
      };

      return JSON.stringify(exportData, null, 2);
    } catch (error) {
      console.error("Error exporting user data:", error);
      throw new Error("Failed to export user data");
    }
  }

  // Cache management
  async clearProgressCache(): Promise<void> {
    try {
      await AsyncStorage.multiRemove([
        "cachedProgressData",
        "lastProgressFetch",
        "progressSummary",
      ]);
    } catch (error) {
      console.error("Error clearing progress cache:", error);
    }
  }
}

export const progressService = new ProgressService();