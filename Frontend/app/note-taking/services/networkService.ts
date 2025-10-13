import { useEffect, useState, useCallback } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { API_URL, joinUrl } from '@/constants/ApiConfig';

export interface NetworkStatus {
  isConnected: boolean;
  isInternetReachable: boolean;
  type: string;
  isServerReachable: boolean;
  lastChecked: Date;
}

class NetworkService {
  private listeners: Set<(status: NetworkStatus) => void> = new Set();
  private currentStatus: NetworkStatus = {
    isConnected: false,
    isInternetReachable: false,
    type: 'unknown',
    isServerReachable: false,
    lastChecked: new Date(),
  };
  private serverCheckInterval: NodeJS.Timeout | null = null;
  private lastServerCheck = 0;
  private readonly SERVER_CHECK_DEBOUNCE = 10000; // 10 seconds

  constructor() {
    this.initialize();
  }

  private async initialize() {
    // Listen for network changes
    NetInfo.addEventListener(this.handleNetworkChange);
    
    // Initial network check
    const initialState = await NetInfo.fetch();
    await this.handleNetworkChange(initialState);
    
    // Start periodic server checks when online
    this.startPeriodicServerCheck();
  }

  private handleNetworkChange = async (state: any) => {
    const newStatus: NetworkStatus = {
      isConnected: state.isConnected ?? false,
      isInternetReachable: state.isInternetReachable ?? false,
      type: state.type ?? 'unknown',
      isServerReachable: false,
      lastChecked: new Date(),
    };

    // If we have internet, check server reachability
    if (newStatus.isConnected && newStatus.isInternetReachable) {
      newStatus.isServerReachable = await this.checkServerReachability();
    }

    this.currentStatus = newStatus;
    this.notifyListeners(newStatus);
  };

  private async checkServerReachability(): Promise<boolean> {
    const now = Date.now();
    
    // Debounce server checks to avoid excessive requests
    if (now - this.lastServerCheck < this.SERVER_CHECK_DEBOUNCE) {
      return this.currentStatus.isServerReachable;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
  const response = await fetch(joinUrl(API_URL, '/health/'), {
        method: 'HEAD',
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      this.lastServerCheck = now;
      return response.ok;
    } catch (error) {
      this.lastServerCheck = now;
      return false;
    }
  }

  private startPeriodicServerCheck() {
    // Check server reachability every 30 seconds when connected
    this.serverCheckInterval = setInterval(async () => {
      if (this.currentStatus.isConnected && this.currentStatus.isInternetReachable) {
        const isServerReachable = await this.checkServerReachability();
        if (isServerReachable !== this.currentStatus.isServerReachable) {
          this.currentStatus = {
            ...this.currentStatus,
            isServerReachable,
            lastChecked: new Date(),
          };
          this.notifyListeners(this.currentStatus);
        }
      }
    }, 30000);
  }

  private notifyListeners(status: NetworkStatus) {
    this.listeners.forEach(listener => {
      try {
        listener(status);
      } catch (error) {
        console.error('Error in network status listener:', error);
      }
    });
  }

  public subscribe(listener: (status: NetworkStatus) => void): () => void {
    this.listeners.add(listener);
    
    // Immediately call with current status
    listener(this.currentStatus);
    
    // Return unsubscribe function
    return () => {
      this.listeners.delete(listener);
    };
  }

  public getCurrentStatus(): NetworkStatus {
    return { ...this.currentStatus };
  }

  public async forceServerCheck(): Promise<boolean> {
    if (!this.currentStatus.isConnected || !this.currentStatus.isInternetReachable) {
      return false;
    }
    
    const isServerReachable = await this.checkServerReachability();
    this.currentStatus = {
      ...this.currentStatus,
      isServerReachable,
      lastChecked: new Date(),
    };
    this.notifyListeners(this.currentStatus);
    return isServerReachable;
  }

  public destroy() {
    if (this.serverCheckInterval) {
      clearInterval(this.serverCheckInterval);
    }
    this.listeners.clear();
  }
}

// Singleton instance
export const networkService = new NetworkService();

/**
 * React hook for network status monitoring
 */
export function useNetworkStatus(): NetworkStatus {
  const [status, setStatus] = useState<NetworkStatus>(networkService.getCurrentStatus());

  useEffect(() => {
    const unsubscribe = networkService.subscribe(setStatus);
    return unsubscribe;
  }, []);

  return status;
}

/**
 * React hook for simple online/offline detection
 */
export function useIsOnline(): boolean {
  const status = useNetworkStatus();
  return status.isConnected && status.isInternetReachable && status.isServerReachable;
}

/**
 * Get network status text for UI display
 */
export function getNetworkStatusText(status: NetworkStatus): string {
  if (!status.isConnected) {
    return 'No Connection';
  }
  
  if (!status.isInternetReachable) {
    return 'No Internet';
  }
  
  if (!status.isServerReachable) {
    return 'Server Unreachable';
  }
  
  return 'Online';
}

/**
 * Get network status color for UI display
 */
export function getNetworkStatusColor(status: NetworkStatus): string {
  if (!status.isConnected || !status.isInternetReachable || !status.isServerReachable) {
    return '#FF3B30'; // Red for offline
  }
  
  return '#34C759'; // Green for online
}