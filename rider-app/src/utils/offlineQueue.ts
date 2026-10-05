import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueuedAction, QueuedActionType } from '../types';
import { STORAGE_KEYS } from '../utils/constants';
import { generateId } from './helpers';

const MAX_RETRIES = 3;
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

type Listener = (size: number) => void;

/**
 * Durable replay queue for duty-critical writes made while offline.
 * 4xx responses are deterministic → dropped immediately, never retried.
 */
class OfflineQueue {
  private static instance: OfflineQueue;
  private isProcessing = false;
  private listeners = new Set<Listener>();

  private constructor() {}

  static getInstance(): OfflineQueue {
    if (!OfflineQueue.instance) OfflineQueue.instance = new OfflineQueue();
    return OfflineQueue.instance;
  }

  /** Subscribe to queue-size changes (banners). Returns unsubscribe. */
  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private async notify(): Promise<void> {
    const size = await this.getQueueSize();
    this.listeners.forEach((l) => {
      try {
        l(size);
      } catch {
        /* listener errors never break the queue */
      }
    });
  }

  private async write(queue: QueuedAction[]): Promise<void> {
    await AsyncStorage.setItem(STORAGE_KEYS.OFFLINE_QUEUE, JSON.stringify(queue));
  }

  async addAction(type: QueuedActionType, payload: Record<string, unknown>): Promise<string> {
    const action: QueuedAction = { id: generateId(), type, payload, timestamp: Date.now(), retryCount: 0 };
    const queue = await this.getQueue();
    queue.push(action);
    await this.write(queue);
    await this.notify();
    return action.id;
  }

  async getQueue(): Promise<QueuedAction[]> {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEYS.OFFLINE_QUEUE);
      const parsed = data ? JSON.parse(data) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.error('[OfflineQueue] read failed:', error);
      return [];
    }
  }

  async removeAction(actionId: string): Promise<void> {
    const queue = await this.getQueue();
    await this.write(queue.filter((a) => a.id !== actionId));
    await this.notify();
  }

  async clearQueue(): Promise<void> {
    try {
      await AsyncStorage.removeItem(STORAGE_KEYS.OFFLINE_QUEUE);
    } catch (error) {
      console.error('[OfflineQueue] clear failed:', error);
    }
    await this.notify();
  }

  async getQueueSize(): Promise<number> {
    return (await this.getQueue()).length;
  }

  async hasPendingActions(): Promise<boolean> {
    return (await this.getQueueSize()) > 0;
  }

  /**
   * Replay every queued action in order. Stops on the first network failure
   * (we're evidently still offline) so ordering is preserved.
   */
  async processQueue<T>(
    processor: (action: QueuedAction) => Promise<T>,
    onSuccess?: (action: QueuedAction, result: T) => void,
    onError?: (action: QueuedAction, error: unknown) => void
  ): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;
    try {
      const now = Date.now();
      const queue = (await this.getQueue()).filter((a) => now - a.timestamp <= MAX_AGE_MS);
      await this.write(queue);

      for (const action of queue) {
        try {
          const result = await processor(action);
          await this.removeAction(action.id);
          onSuccess?.(action, result);
        } catch (error) {
          const status = (error as { response?: { status?: number } })?.response?.status;
          const isClient = typeof status === 'number' && status >= 400 && status < 500;
          if (isClient) {
            await this.removeAction(action.id);
            onError?.(action, error);
            continue;
          }
          action.retryCount += 1;
          if (action.retryCount >= MAX_RETRIES) {
            await this.removeAction(action.id);
          } else {
            const fresh = await this.getQueue();
            const target = fresh.find((a) => a.id === action.id);
            if (target) target.retryCount = action.retryCount;
            await this.write(fresh);
          }
          onError?.(action, error);
          // Still offline — stop and keep order; the next reconnect retries.
          if (!status) break;
        }
      }
    } finally {
      this.isProcessing = false;
      await this.notify();
    }
  }
}

export const offlineQueue = OfflineQueue.getInstance();
export default offlineQueue;
