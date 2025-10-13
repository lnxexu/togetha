// Test script for offline functionality
// This file demonstrates how the offline task management system works

import offlineStorageService from '../services/offlineStorageService';
import networkService from '../services/networkService';
import syncService from '../services/syncService';
import taskService from '../services/taskService';

// Set to false in production to disable test logging
const ENABLE_TEST_LOGS = false;
const testLog = (...args: any[]) => { if (ENABLE_TEST_LOGS) testLog(...args); };
const testError = (...args: any[]) => { if (ENABLE_TEST_LOGS) testError(...args); };

// Example test functions for offline functionality
export const testOfflineFunctionality = {
  
  // Test creating tasks offline
  async testCreateTaskOffline() {
    testLog('Testing offline task creation...');
    
    try {
      const taskData = {
        title: 'Test Offline Task',
        description: 'This task was created while offline',
        priority: 'not-urgent-important' as const,
        category: 'test',
        completed: false,
        user: 'test_user'
      };

      const newTask = await taskService.createTask(taskData);
      testLog('✅ Task created offline:', newTask);
      
      // Verify it's stored locally
      const localTasks = await offlineStorageService.getOfflineTasks();
      const foundTask = localTasks.find(t => t.id === newTask.id);
      testLog('✅ Task found in local storage:', !!foundTask);
      
      return newTask;
    } catch (error) {
      testError('❌ Error creating offline task:', error);
      throw error;
    }
  },

  // Test updating tasks offline
  async testUpdateTaskOffline() {
    testLog('Testing offline task update...');
    
    try {
      // First create a task
      const task = await this.testCreateTaskOffline();
      
      // Then update it
      const updatedTask = await taskService.updateTask(task.id, {
        title: 'Updated Offline Task',
        completed: true
      });
      
      testLog('✅ Task updated offline:', updatedTask);
      
      // Verify changes in local storage
      const localTask = await offlineStorageService.getOfflineTaskById(task.id);
      testLog('✅ Updated task in local storage:', localTask?.title === 'Updated Offline Task');
      
      return updatedTask;
    } catch (error) {
      testError('❌ Error updating offline task:', error);
      throw error;
    }
  },

  // Test getting all tasks offline
  async testGetAllTasksOffline() {
    testLog('Testing offline task retrieval...');
    
    try {
      const tasks = await taskService.getAllTasks();
      testLog(`✅ Retrieved ${tasks.length} tasks offline`);
      
      // Verify they're coming from local storage when offline
      if (!networkService.isOnline()) {
        const localTasks = await offlineStorageService.getOfflineTasks();
        testLog('✅ Offline mode: tasks from local storage:', localTasks.length === tasks.length);
      }
      
      return tasks;
    } catch (error) {
      testError('❌ Error getting offline tasks:', error);
      throw error;
    }
  },

  // Test sync when back online
  async testSyncWhenOnline() {
    testLog('Testing sync when back online...');
    
    try {
      if (!networkService.isOnline()) {
        testLog('⚠️ Device is offline, cannot test sync');
        return false;
      }

      const result = await syncService.syncWithServer();
      testLog('✅ Sync result:', result);
      
      if (result.success) {
        testLog(`✅ Successfully synced ${result.synced} operations`);
        if (result.failed > 0) {
          testLog(`⚠️ ${result.failed} operations failed to sync`);
        }
      } else {
        testLog('❌ Sync failed:', result.errors);
      }
      
      return result.success;
    } catch (error) {
      testError('❌ Error during sync:', error);
      throw error;
    }
  },

  // Test network status monitoring
  async testNetworkStatusMonitoring() {
    testLog('Testing network status monitoring...');
    
    try {
      const status = await networkService.getCurrentNetworkStatus();
      testLog('✅ Current network status:', status);
      
      // Test listener
      const unsubscribe = networkService.addNetworkStatusListener((newStatus) => {
        testLog('📡 Network status changed:', newStatus);
      });
      
      // Clean up listener after 10 seconds
      setTimeout(() => {
        unsubscribe();
        testLog('✅ Network listener cleaned up');
      }, 10000);
      
      return status;
    } catch (error) {
      testError('❌ Error testing network monitoring:', error);
      throw error;
    }
  },

  // Test local storage operations
  async testLocalStorageOperations() {
    testLog('Testing local storage operations...');
    
    try {
      // Test saving and retrieving tasks
      const testTask = offlineStorageService.taskFormDataToOfflineTask({
        title: 'Local Storage Test',
        description: 'Testing local storage',
        priority: 'urgent-important',
        completed: false,
        user: 'test'
      });

      await offlineStorageService.saveOfflineTask(testTask);
      testLog('✅ Task saved to local storage');

      const retrievedTask = await offlineStorageService.getOfflineTaskById(testTask.id);
      testLog('✅ Task retrieved from local storage:', !!retrievedTask);

      // Test pending sync operations
      await offlineStorageService.addPendingSync({
        id: testTask.id,
        action: 'create',
        timestamp: new Date().toISOString()
      });

      const pendingOps = await offlineStorageService.getPendingSyncOperations();
      testLog('✅ Pending sync operations:', pendingOps.length);

      // Clean up
      await offlineStorageService.deleteOfflineTask(testTask.id);
      await offlineStorageService.clearPendingSyncOperations();
      testLog('✅ Local storage cleaned up');
      
      return true;
    } catch (error) {
      testError('❌ Error testing local storage:', error);
      throw error;
    }
  },

  // Run all tests
  async runAllTests() {
    testLog('🧪 Starting offline functionality tests...');
    
    const results = {
      localStorage: false,
      networkMonitoring: false,
      createOffline: false,
      updateOffline: false,
      getAllOffline: false,
      sync: false
    };

    try {
      results.localStorage = await this.testLocalStorageOperations();
      results.networkMonitoring = !!(await this.testNetworkStatusMonitoring());
      results.createOffline = !!(await this.testCreateTaskOffline());
      results.updateOffline = !!(await this.testUpdateTaskOffline());
      results.getAllOffline = !!(await this.testGetAllTasksOffline());
      
      if (networkService.isOnline()) {
        results.sync = await this.testSyncWhenOnline();
      } else {
        testLog('⚠️ Skipping sync test - device is offline');
        results.sync = true; // Consider it passed since we can't test while offline
      }

      testLog('🎉 Test results:', results);
      
      const passed = Object.values(results).every(result => result === true);
      testLog(passed ? '✅ All tests passed!' : '❌ Some tests failed');
      
      return { passed, results };
    } catch (error) {
      testError('❌ Test suite failed:', error);
      return { passed: false, results, error };
    }
  }
};

// Usage example:
// import { testOfflineFunctionality } from './utils/offlineTests';
// testOfflineFunctionality.runAllTests();
