import AsyncStorage from '@react-native-async-storage/async-storage';
import { offlineQueue } from '../src/utils/offlineQueue';

const networkError = () => Object.assign(new Error('Network Error'), { response: undefined });
const clientError = (status: number) => Object.assign(new Error('Bad request'), { response: { status } });

describe('offlineQueue', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    await offlineQueue.clearQueue();
  });

  it('persists actions and reports size to subscribers', async () => {
    const sizes: number[] = [];
    const unsubscribe = offlineQueue.subscribe((n) => sizes.push(n));
    await offlineQueue.addAction('task_action', { action: 'pickup', taskId: 't1' });
    await offlineQueue.addAction('update_status', { status: 'offline' });
    expect(await offlineQueue.getQueueSize()).toBe(2);
    expect(sizes).toEqual([1, 2]);
    unsubscribe();
  });

  it('replays in order and removes successful actions', async () => {
    await offlineQueue.addAction('task_action', { action: 'pickup', taskId: 't1' });
    await offlineQueue.addAction('task_action', { action: 'deliver', taskId: 't1' });
    const seen: string[] = [];
    await offlineQueue.processQueue(async (a) => {
      seen.push(String(a.payload.action));
    });
    expect(seen).toEqual(['pickup', 'deliver']);
    expect(await offlineQueue.getQueueSize()).toBe(0);
  });

  it('drops 4xx failures immediately but keeps network failures for retry', async () => {
    await offlineQueue.addAction('task_action', { action: 'pickup', taskId: 'bad' });
    await offlineQueue.addAction('task_action', { action: 'pickup', taskId: 'offline' });
    await offlineQueue.processQueue(async (a) => {
      if (a.payload.taskId === 'bad') throw clientError(409);
      throw networkError();
    });
    const queue = await offlineQueue.getQueue();
    expect(queue.map((a) => a.payload.taskId)).toEqual(['offline']);
    expect(queue[0].retryCount).toBe(1);
  });

  it('stops replaying after the first network failure to preserve order', async () => {
    await offlineQueue.addAction('task_action', { action: 'pickup', taskId: 'a' });
    await offlineQueue.addAction('task_action', { action: 'deliver', taskId: 'a' });
    const attempts: string[] = [];
    await offlineQueue.processQueue(async (a) => {
      attempts.push(String(a.payload.action));
      throw networkError();
    });
    expect(attempts).toEqual(['pickup']);
    expect(await offlineQueue.getQueueSize()).toBe(2);
  });

  it('gives up after three network failures', async () => {
    await offlineQueue.addAction('task_action', { action: 'pickup', taskId: 'a' });
    for (let i = 0; i < 3; i++) {
      await offlineQueue.processQueue(async () => {
        throw networkError();
      });
    }
    expect(await offlineQueue.getQueueSize()).toBe(0);
  });
});
