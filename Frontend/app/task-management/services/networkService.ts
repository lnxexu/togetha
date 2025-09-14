import NetInfo, { NetInfoState } from '@react-native-community/netinfo';

export interface NetworkStatus {
  isConnected: boolean;
  isInternetReachable: boolean | null;
  connectionType: string;
}

class NetworkService {
  private static instance: NetworkService;
  private networkStatus: NetworkStatus = {
    isConnected: false,
    isInternetReachable: null,
    connectionType: 'unknown'
  };
  private listeners: Array<(status: NetworkStatus) => void> = [];

  constructor() {
    this.initializeNetworkListener();
  }

  static getInstance(): NetworkService {
    if (!NetworkService.instance) {
      NetworkService.instance = new NetworkService();
    }
    return NetworkService.instance;
  }

  private initializeNetworkListener(): void {
    NetInfo.addEventListener((state: NetInfoState) => {
      const newStatus: NetworkStatus = {
        isConnected: state.isConnected ?? false,
        isInternetReachable: state.isInternetReachable,
        connectionType: state.type
      };

      // Only update and notify if status actually changed
      if (this.hasStatusChanged(newStatus)) {
        this.networkStatus = newStatus;
        this.notifyListeners(newStatus);
      }
    });
  }

  private hasStatusChanged(newStatus: NetworkStatus): boolean {
    return (
      this.networkStatus.isConnected !== newStatus.isConnected ||
      this.networkStatus.isInternetReachable !== newStatus.isInternetReachable ||
      this.networkStatus.connectionType !== newStatus.connectionType
    );
  }

  private notifyListeners(status: NetworkStatus): void {
    this.listeners.forEach(listener => {
      try {
        listener(status);
      } catch (error) {
        console.error('Error notifying network status listener:', error);
      }
    });
  }

  // Get current network status
  async getCurrentNetworkStatus(): Promise<NetworkStatus> {
    try {
      const state = await NetInfo.fetch();
      const status: NetworkStatus = {
        isConnected: state.isConnected ?? false,
        isInternetReachable: state.isInternetReachable,
        connectionType: state.type
      };
      
      this.networkStatus = status;
      return status;
    } catch (error) {
      console.error('Error fetching network status:', error);
      return this.networkStatus;
    }
  }

  // Check if device is online (connected to internet)
  isOnline(): boolean {
    return this.networkStatus.isConnected && 
           (this.networkStatus.isInternetReachable === true || 
            this.networkStatus.isInternetReachable === null);
  }

  // Check if device is offline
  isOffline(): boolean {
    return !this.isOnline();
  }

  // Get detailed network status
  getNetworkStatus(): NetworkStatus {
    return { ...this.networkStatus };
  }

  // Add listener for network status changes
  addNetworkStatusListener(listener: (status: NetworkStatus) => void): () => void {
    this.listeners.push(listener);
    
    // Return unsubscribe function
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  // Remove all listeners
  removeAllListeners(): void {
    this.listeners = [];
  }

  // Wait for network to be available (with timeout)
  async waitForNetwork(timeoutMs: number = 10000): Promise<boolean> {
    if (this.isOnline()) {
      return true;
    }

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        unsubscribe();
        resolve(false);
      }, timeoutMs);

      const unsubscribe = this.addNetworkStatusListener((status) => {
        if (status.isConnected && 
            (status.isInternetReachable === true || status.isInternetReachable === null)) {
          clearTimeout(timeout);
          unsubscribe();
          resolve(true);
        }
      });
    });
  }

  // Test actual connectivity by making a simple request
  async testConnectivity(url: string = 'https://www.google.com', timeout: number = 5000): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      
      const response = await fetch(url, {
        method: 'HEAD',
        mode: 'no-cors',
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      return true;
    } catch (error) {
      console.log('Connectivity test failed:', error);
      return false;
    }
  }

  // Get connection quality indicator
  getConnectionQuality(): 'excellent' | 'good' | 'poor' | 'offline' {
    if (this.isOffline()) {
      return 'offline';
    }

    const { connectionType, isInternetReachable } = this.networkStatus;
    
    if (isInternetReachable === false) {
      return 'poor';
    }

    switch (connectionType) {
      case 'wifi':
        return 'excellent';
      case 'cellular':
        return 'good';
      case 'ethernet':
        return 'excellent';
      case 'bluetooth':
      case 'wimax':
        return 'good';
      case 'vpn':
        return 'good';
      default:
        return 'poor';
    }
  }
}

export default NetworkService.getInstance();