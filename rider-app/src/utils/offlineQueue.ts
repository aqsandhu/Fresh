import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueuedAction } from '../types';
import { STORAGE_KEYS } from './constants';
import { generateId } from './helpers';

class OfflineQueue {
  private static instance: OfflineQueue;
  private isProcessing: boolean = false;

  private constructor() {}

  static getInstance(): OfflineQueue {
    if (!OfflineQueue.instance) {
      OfflineQueue.instance = new OfflineQueue();
    }
    return OfflineQueue.instance;
  }

  // Add action to queue
  async addAction(type: QueuedAction['type'], payload: any): Promise<string> {
    try {
      const action: QueuedAction = {
        id: generateId(),
        type,
        payload,
        timestamp: Date.now(),
        retryCount: 0,
      };

      const queue = await this.getQueue();
      queue.push(action);
      await AsyncStorage.setItem(STORAGE_KEYS.OFFLINE_QUEUE, JSON.stringify(queue));

      return action.id;
    } catch (error) {
      console.error('Failed to add action to queue:', error);
      throw error;
    }
  }

  // Get all queued actions
  async getQueue(): Promise<QueuedAction[]> {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEYS.OFFLINE_QUEUE);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('Failed to get queue:', error);
      return [];
    }
  }

  // Remove action from queue
  async removeAction(actionId: string): Promise<void> {
    try {
      const queue = await this.getQueue();
      const filtered = queue.filter((action) => action.id !== actionId);
      await AsyncStorage.setItem(STORAGE_KEYS.OFFLINE_QUEUE, JSON.stringify(filtered));
    } catch (error) {
      console.error('Failed to remove action from queue:', error);
    }
  }

  // Update action retry count
  async incrementRetryCount(actionId: string): Promise<void> {
    try {
      const queue = await this.getQueue();
      const action = queue.find((a) => a.id === actionId);
      if (action) {
        action.retryCount++;
        await AsyncStorage.setItem(STORAGE_KEYS.OFFLINE_QUEUE, JSON.stringify(queue));
      }
    } catch (error) {
      console.error('Failed to increment retry count:', error);
    }
  }

  // Clear all actions
  async clearQueue(): Promise<void> {
    try {
      await AsyncStorage.removeItem(STORAGE_KEYS.OFFLINE_QUEUE);
    } catch (error) {
      console.error('Failed to clear queue:', error);
    }
  }

  // Get queue size
  async getQueueSize(): Promise<number> {
    const queue = await this.getQueue();
    return queue.length;
  }

  // Check if queue has pending actions
  async hasPendingActions(): Promise<boolean> {
    const size = await this.getQueueSize();
    return size > 0;
  }

  // Process queue (to be called when online)
  async processQueue<T>(
    processor: (action: QueuedAction) => Promise<T>,
    onSuccess?: (action: QueuedAction, result: T) => void,
    onError?: (action: QueuedAction, error: any) => void
  ): Promise<void> {
    if (this.isProcessing) return;

    this.isProcessing = true;
    const queue = await this.getQueue();

    for (const action of queue) {
      try {
        const result = await processor(action);
        await this.removeAction(action.id);
        onSuccess?.(action, result);
      } catch (error) {
        await this.incrementRetryCount(action.id);
        onError?.(action, error);

        // Remove if max retries reached
        if (action.retryCount >= 3) {
          await this.removeAction(action.id);
        }
      }
    }

    this.isProcessing = false;
  }

  // Get stale actions (older than specified time)
  async getStaleActions(maxAgeMs: number = 24 * 60 * 60 * 1000): Promise<QueuedAction[]> {
    const queue = await this.getQueue();
    const now = Date.now();
    return queue.filter((action) => now - action.timestamp > maxAgeMs);
  }

  // Clean up stale actions
  async cleanupStaleActions(maxAgeMs: number = 24 * 60 * 60 * 1000): Promise<number> {
    try {
      const queue = await this.getQueue();
      const now = Date.now();
      const fresh = queue.filter((action) => now - action.timestamp <= maxAgeMs);
      await AsyncStorage.setItem(STORAGE_KEYS.OFFLINE_QUEUE, JSON.stringify(fresh));
      return queue.length - fresh.length;
    } catch (error) {
      console.error('Failed to cleanup stale actions:', error);
      return 0;
    }
  }
}

export const offlineQueue = OfflineQueue.getInstance();
export default offlineQueue;
