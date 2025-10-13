import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_URL, joinUrl } from "../../constants/ApiConfig";
import * as Device from 'expo-device';
import { AppState, AppStateStatus } from 'react-native';

export interface UsageStats {
  today: DailyUsage;
  this_week: WeeklyUsage;
  current_session: UserSession | null;
  recent_activities: Activity[];
  total_time_today_minutes: number;
  total_time_this_week_minutes: number;
  streak_days: number;
  average_daily_time_minutes: number;
  most_used_features: FeatureUsage[];
  productivity_trend: 'up' | 'down' | 'stable';
}

export interface DailyUsage {
  date: string;
  total_active_time_seconds: number;
  total_time_minutes: number;
  session_count: number;
  tasks_completed: number;
  notes_created: number;
  chat_messages: number;
  total_interactions: number;
  engagement_score: number;
}

export interface WeeklyUsage {
  week_start: string;
  week_end: string;
  total_active_time_seconds: number;
  days_active: number;
  productivity_score: number;
  consistency_score: number;
}

export interface UserSession {
  id: string;
  session_id: string;
  device_type: string;
  start_time: string;
  is_active: boolean;
  total_time_seconds: number;
  active_time_minutes: number;
}

export interface Activity {
  id: string;
  activity_type: string;
  screen_name: string;
  timestamp: string;
  details: any;
}

export interface FeatureUsage {
  feature: string;
  count: number;
}

class UsageTrackingService {
  private sessionId: string | null = null;
  private isTracking: boolean = false;
  private lastActivity: Date = new Date();
  private idleTimer: NodeJS.Timeout | null = null;
  private idleThreshold: number = 30000; // 30 seconds
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private appStateSubscription: any = null;
  private isIdle: boolean = false;
  private idleStartTime: Date | null = null;

  async getAuthToken(): Promise<string | null> {
    return await AsyncStorage.getItem("authToken");
  }

  async getAuthHeaders(): Promise<{ [key: string]: string }> {
    const token = await this.getAuthToken();
    return {
      'Authorization': `Token ${token}`,
      'Content-Type': 'application/json',
    };
  }

  async startSession(): Promise<string | null> {
    try {
      const headers = await this.getAuthHeaders();
      const deviceType = Device.deviceType === Device.DeviceType.PHONE ? 'mobile' : 
                        Device.deviceType === Device.DeviceType.TABLET ? 'tablet' : 'desktop';
      
  const response = await fetch(joinUrl(API_URL, '/usage/session/'), {
        method: 'POST',
        headers,
        body: JSON.stringify({
          action: 'start_session',
          device_id: Device.deviceName || 'unknown',
          device_type: deviceType,
          app_version: '1.0.0', // Get from app config
        }),
      });

      if (response.ok) {
        const data = await response.json();
        this.sessionId = data.session_id;
        this.isTracking = true;
        this.startIdleDetection();
        this.startHeartbeat();
        return this.sessionId;
      }
    } catch (error) {
      console.error('Error starting session:', error);
    }
    return null;
  }

  async endSession(): Promise<void> {
    if (!this.sessionId) return;

    try {
      const headers = await this.getAuthHeaders();
      
  await fetch(joinUrl(API_URL, '/usage/session/'), {
        method: 'POST',
        headers,
        body: JSON.stringify({
          action: 'end_session',
          session_id: this.sessionId,
        }),
      });

      this.stopTracking();
    } catch (error) {
      console.error('Error ending session:', error);
    }
  }

  private startIdleDetection(): void {
    // Monitor app state changes
    this.appStateSubscription = AppState.addEventListener('change', this.handleAppStateChange);
    
    // Reset idle timer on activity
    this.resetIdleTimer();
  }

  private handleAppStateChange = (nextAppState: AppStateStatus): void => {
    if (nextAppState === 'active') {
      this.handleUserActivity();
      if (this.isIdle) {
        this.endIdle();
      }
    } else if (nextAppState === 'background' || nextAppState === 'inactive') {
      this.startIdle();
    }
  };

  private resetIdleTimer(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
    }

    this.idleTimer = setTimeout(() => {
      this.startIdle();
    }, this.idleThreshold);
  }

  private async startIdle(): Promise<void> {
    if (this.isIdle || !this.sessionId) return;

    this.isIdle = true;
    this.idleStartTime = new Date();

    try {
      const headers = await this.getAuthHeaders();
  await fetch(joinUrl(API_URL, '/usage/idle/'), {
        method: 'POST',
        headers,
        body: JSON.stringify({
          session_id: this.sessionId,
          action: 'idle_start',
        }),
      });
    } catch (error) {
      console.error('Error logging idle start:', error);
    }
  }

  private async endIdle(): Promise<void> {
    if (!this.isIdle || !this.sessionId || !this.idleStartTime) return;

    const idleDuration = Math.floor((new Date().getTime() - this.idleStartTime.getTime()) / 1000);
    this.isIdle = false;
    this.idleStartTime = null;

    try {
      const headers = await this.getAuthHeaders();
  await fetch(joinUrl(API_URL, '/usage/idle/'), {
        method: 'POST',
        headers,
        body: JSON.stringify({
          session_id: this.sessionId,
          action: 'idle_end',
          idle_duration: idleDuration,
        }),
      });
    } catch (error) {
      console.error('Error logging idle end:', error);
    }

    this.resetIdleTimer();
  }

  handleUserActivity(): void {
    if (!this.isTracking) return;

    this.lastActivity = new Date();
    
    if (this.isIdle) {
      this.endIdle();
    } else {
      this.resetIdleTimer();
    }
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(async () => {
      if (this.sessionId && !this.isIdle) {
        try {
          const headers = await this.getAuthHeaders();
          await fetch(joinUrl(API_URL, '/usage/session/'), {
            method: 'POST',
            headers,
            body: JSON.stringify({
              action: 'heartbeat',
              session_id: this.sessionId,
            }),
          });
        } catch (error) {
          console.error('Heartbeat error:', error);
        }
      }
    }, 60000); // Every minute
  }

  async logActivity(
    activityType: string,
    screenName: string,
    details: any = {},
    durationMs?: number
  ): Promise<void> {
    if (!this.sessionId) return;

    this.handleUserActivity();

    try {
      const headers = await this.getAuthHeaders();
      await fetch(`${API_URL}/usage/session/`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          action: 'log_activity',
          session_id: this.sessionId,
          activity_type: activityType,
          screen_name: screenName,
          details,
          duration_ms: durationMs,
        }),
      });
    } catch (error) {
      console.error('Error logging activity:', error);
    }
  }

  async getUsageStats(period: 'today' | 'week' | 'month' | 'comprehensive' = 'comprehensive'): Promise<UsageStats | null> {
    try {
      const headers = await this.getAuthHeaders();
  const response = await fetch(joinUrl(API_URL, `/usage/stats/?period=${period}`), {
        method: 'GET',
        headers,
      });

      if (response.ok) {
        return await response.json();
      }
    } catch (error) {
      console.error('Error fetching usage stats:', error);
    }
    return null;
  }

  private stopTracking(): void {
    this.isTracking = false;
    this.sessionId = null;

    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }

    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    if (this.appStateSubscription) {
      this.appStateSubscription.remove();
      this.appStateSubscription = null;
    }
  }

  // Navigation tracking
  logNavigation(screenName: string, previousScreen?: string): void {
    this.logActivity('navigation', screenName, {
      previous_screen: previousScreen,
      timestamp: new Date().toISOString(),
    });
  }

  // Feature usage tracking
  logTaskCreated(taskId: string): void {
    this.logActivity('task_create', 'tasks', { task_id: taskId });
  }

  logTaskCompleted(taskId: string): void {
    this.logActivity('task_complete', 'tasks', { task_id: taskId });
  }

  logNoteCreated(noteId: string): void {
    this.logActivity('note_create', 'notes', { note_id: noteId });
  }

  logNoteEdited(noteId: string): void {
    this.logActivity('note_edit', 'notes', { note_id: noteId });
  }

  logChatMessage(messageId: string): void {
    this.logActivity('chat', 'chatbot', { message_id: messageId });
  }

  logFileUpload(fileId: string, fileType: string): void {
    this.logActivity('file_upload', 'chatbot', { 
      file_id: fileId, 
      file_type: fileType 
    });
  }

  // Cleanup
  destroy(): void {
    this.stopTracking();
  }
}

export default new UsageTrackingService();