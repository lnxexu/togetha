import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_URL, API_ENDPOINTS } from "../../../constants/ApiConfig";

export interface ProgressData {
  period: string;
  period_name: string;
  start_date: string;
  end_date: string;
  
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
}

export interface DailyProgress {
  date: string;
  day_name: string;
  tasks: number;
  notes: number;
}

export interface WeeklyProgress {
  week_start: string;
  week_label: string;
  tasks: number;
  notes: number;
}

export interface ProgressSummary {
  title: string;
  value: number;
  icon: string;
  color: string;
  description: string;
  trend?: 'up' | 'down' | 'stable';
  change?: number;
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
      const endpoint = `${API_ENDPOINTS.USER_PROGRESS}?period=${period}&refresh=${refresh}`;
      return await this.apiRequest<ProgressData>(endpoint);
    } catch (error) {
      console.error("Error fetching progress data:", error);
      throw error;
    }
  }

  async getProgressSummary(period: 'week' | 'month' | 'year' | 'overall' = 'month'): Promise<ProgressSummary[]> {
    try {
      const data = await this.getProgressData(period);
      
      return [
        {
          title: "Tasks Completed",
          value: data.tasks_completed,
          icon: "check-circle",
          color: "#4CAF50",
          description: `Tasks completed ${data.period_name.toLowerCase()}`,
        },
        {
          title: "Notes Created",
          value: data.notes_created,
          icon: "note",
          color: "#2196F3",
          description: `Notes created ${data.period_name.toLowerCase()}`,
        },
        {
          title: "AI Interactions",
          value: data.chatbot_interactions,
          icon: "chat",
          color: "#FF9800",
          description: `AI conversations ${data.period_name.toLowerCase()}`,
        },
        {
          title: "Study Streak",
          value: this.calculateStreakDays(data.daily_progress),
          icon: "local-fire-department",
          color: "#F44336",
          description: "Consecutive active days",
        },
      ];
    } catch (error) {
      console.error("Error getting progress summary:", error);
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