// The rider's task store: ordering of the task list, what happens offline
// (queued + optimistic update, the rider keeps working), and replaying queued
// actions when the connection is back.
const mockService = {
  getActiveTasks: jest.fn(),
  getCompletedTasks: jest.fn(),
  getTaskById: jest.fn(),
  getTodayStats: jest.fn(),
  getMyStats: jest.fn(),
  markPickedUp: jest.fn(),
  markDelivered: jest.fn(),
  failTask: jest.fn(),
  requestCustomerCall: jest.fn(),
  markArrived: jest.fn(),
  uploadProof: jest.fn(),
  pinLocation: jest.fn(),
  uploadDoorPicture: jest.fn(),
};
// Getters: the mocks are read when used, not when the module is first loaded.
jest.mock('../src/services/task.service', () => ({ get taskService() { return mockService; } }));
const mockQueue = { addAction: jest.fn(async () => undefined) };
jest.mock('../src/utils/offlineQueue', () => ({ get offlineQueue() { return mockQueue; } }));
jest.mock('../src/services/api', () => ({
  isNetworkError: (e: { offline?: boolean }) => !!e?.offline,
  getApiErrorMessage: (e: { message?: string }) => e?.message || 'error',
}));
const mockAuth = { updateDutyStatus: jest.fn(async (on: boolean) => ({ on })) };
jest.mock('../src/services/auth.service', () => ({ __esModule: true, get default() { return mockAuth; } }));

import { useTaskStore, processQueuedAction, QueuedOfflineError } from '../src/store/taskStore';
import type { Task } from '../src/types';

const task = (id: string, over: Partial<Task> = {}): Task =>
  ({ id, orderId: `o-${id}`, status: 'assigned', sequence: 0, assignedAt: '2026-11-15T08:00:00Z', ...over } as unknown as Task);
const offline = Object.assign(new Error('Network Error'), { offline: true });
const store = () => useTaskStore.getState();

beforeEach(() => {
  // reset (not just clear): a rejection set up in one test must not leak into the next
  jest.resetAllMocks();
  store().reset();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

describe('loading', () => {
  it('puts the task in progress first, then by route order, then newest', async () => {
    mockService.getActiveTasks.mockResolvedValue([
      task('a', { sequence: 2 }),
      task('b', { status: 'in_progress', sequence: 9 }),
      task('c', { sequence: 1, assignedAt: '2026-11-15T07:00:00Z' }),
      task('d', { sequence: 1, assignedAt: '2026-11-15T09:00:00Z' }),
    ]);
    await store().fetchActiveTasks();
    expect(store().activeTasks.map((t) => t.id)).toEqual(['b', 'd', 'c', 'a']);
    expect(store().hasLoadedActive).toBe(true);
    expect(store().isLoadingActive).toBe(false);
  });

  it('keeps the error for the screen when loading fails', async () => {
    mockService.getActiveTasks.mockRejectedValue(new Error('Server down'));
    await store().fetchActiveTasks();
    expect(store().lastError).toBe('Server down');
    store().clearError();
    expect(store().lastError).toBeNull();
  });

  it('refreshAll loads lists and stats; a failing stat does not break it', async () => {
    mockService.getActiveTasks.mockResolvedValue([]);
    mockService.getCompletedTasks.mockResolvedValue([task('z', { status: 'completed' })]);
    mockService.getTodayStats.mockRejectedValue(new Error('x'));
    mockService.getMyStats.mockResolvedValue({ deliveries: 4 });
    await store().refreshAll();
    expect(store().completedTasks).toHaveLength(1);
    expect(store().myStats).toEqual({ deliveries: 4 });
    expect(store().todayStats).toBeNull();
  });
});

describe('pickup / delivery', () => {
  beforeEach(() => useTaskStore.setState({ activeTasks: [task('t1')] }));

  it('pickup online: the server answer replaces the task', async () => {
    mockService.markPickedUp.mockResolvedValue(task('t1', { status: 'in_progress' }));
    await store().markPickedUp('t1', 'ok');
    expect(store().activeTasks[0].status).toBe('in_progress');
    expect(store().pendingTaskIds).toEqual([]);
  });

  it('pickup offline: queued, shown as picked up, and the screen is told it was queued', async () => {
    mockService.markPickedUp.mockRejectedValue(offline);
    await expect(store().markPickedUp('t1')).rejects.toBeInstanceOf(QueuedOfflineError);
    expect(mockQueue.addAction).toHaveBeenCalledWith('task_action', { action: 'pickup', taskId: 't1', notes: undefined });
    expect(store().activeTasks[0].status).toBe('in_progress');
    expect(store().pendingTaskIds).toEqual([]);
  });

  it('a real server refusal is NOT queued', async () => {
    mockService.markPickedUp.mockRejectedValue(new Error('Not your task'));
    await expect(store().markPickedUp('t1')).rejects.toThrow('Not your task');
    expect(mockQueue.addAction).not.toHaveBeenCalled();
  });

  it('delivery online: moves to completed and refreshes the stats', async () => {
    mockService.markDelivered.mockResolvedValue(task('t1', { status: 'completed' }));
    mockService.getTodayStats.mockResolvedValue({ delivered: 1 });
    mockService.getMyStats.mockResolvedValue({});
    await store().markDelivered('t1');
    expect(store().activeTasks).toEqual([]);
    expect(store().completedTasks.map((t) => t.id)).toEqual(['t1']);
    expect(mockService.getTodayStats).toHaveBeenCalled();
  });

  it('delivery offline: queued and shown as delivered', async () => {
    mockService.markDelivered.mockRejectedValue(offline);
    await expect(store().markDelivered('t1', 'left at door')).rejects.toBeInstanceOf(QueuedOfflineError);
    expect(mockQueue.addAction).toHaveBeenCalledWith('task_action', { action: 'deliver', taskId: 't1', notes: 'left at door' });
    expect(store().completedTasks.map((t) => t.id)).toEqual(['t1']);
  });

  it('a failed task leaves both lists', async () => {
    mockService.failTask.mockResolvedValue(task('t1', { status: 'failed' }));
    await store().failTask('t1', 'customer not home');
    expect(store().activeTasks).toEqual([]);
    expect(store().completedTasks).toEqual([]);
  });
});

describe('at the door', () => {
  beforeEach(() => useTaskStore.setState({ activeTasks: [task('t1')], completedTasks: [task('t9', { status: 'completed' })] }));

  it('calling the customer marks arrival only when the customer was notified', async () => {
    mockService.requestCustomerCall.mockResolvedValueOnce({ number: null, notified: false });
    await store().requestCustomerCall('o-t1');
    expect(store().activeTasks[0].arrivedAt).toBeUndefined();
    mockService.requestCustomerCall.mockResolvedValueOnce({ number: '+92...', notified: true });
    expect(await store().requestCustomerCall('o-t1')).toEqual({ number: '+92...', notified: true });
    expect(store().activeTasks[0].arrivedAt).toBeTruthy();
  });

  it('arrival keeps the server time', async () => {
    mockService.markArrived.mockResolvedValue({ notified: true, arrivedAt: '2026-11-15T10:00:00Z' });
    await store().markArrived('t1');
    expect(store().activeTasks[0].arrivedAt).toBe('2026-11-15T10:00:00Z');
  });

  it('proofs, pin and door picture are stored on the task', async () => {
    mockService.uploadProof.mockResolvedValueOnce('https://cdn/p.jpg').mockResolvedValueOnce('https://cdn/d.jpg');
    await store().uploadProof('t1', 'file://p', 'pickup');
    await store().uploadProof('t9', 'file://d');
    mockService.pinLocation.mockResolvedValue(undefined);
    await store().pinLocation('t1', 32.5, 74.1);
    mockService.uploadDoorPicture.mockResolvedValue('https://cdn/door.jpg');
    await store().uploadDoorPicture('t1', 'file://door');
    const t1 = store().activeTasks[0] as Task & Record<string, unknown>;
    expect(t1.pickupProofImage).toBe('https://cdn/p.jpg');
    expect(t1.location).toEqual({ latitude: 32.5, longitude: 74.1 });
    expect(t1.pinnedBy).toBe('rider');
    expect(t1.doorPictureUrl).toBe('https://cdn/door.jpg');
    expect((store().completedTasks[0] as Task & Record<string, unknown>).deliveryProofImage).toBe('https://cdn/d.jpg');
  });

  it('a socket update upserts; a removal drops it; reset empties all', () => {
    store().upsertTask(task('t2', { status: 'in_progress' }));
    expect(store().activeTasks.map((t) => t.id)).toEqual(['t2', 't1']);
    store().removeTask('t1');
    expect(store().activeTasks.map((t) => t.id)).toEqual(['t2']);
    store().reset();
    expect(store().activeTasks).toEqual([]);
  });
});

describe('replaying queued actions', () => {
  it('duty status', async () => {
    await processQueuedAction({ type: 'update_status', payload: { status: 'available' } } as never);
    expect(mockAuth.updateDutyStatus).toHaveBeenCalledWith(true);
    await processQueuedAction({ type: 'update_status', payload: {} } as never);
    expect(mockAuth.updateDutyStatus).toHaveBeenLastCalledWith(false);
  });

  it('pickup and delivery', async () => {
    await processQueuedAction({ type: 'task_action', payload: { action: 'pickup', taskId: 't1' } } as never);
    await processQueuedAction({ type: 'task_action', payload: { action: 'deliver', taskId: 't1', notes: 'n' } } as never);
    expect(mockService.markPickedUp).toHaveBeenCalledWith('t1', undefined);
    expect(mockService.markDelivered).toHaveBeenCalledWith('t1', 'n');
  });

  it('a broken or unknown action is refused as a 400 (dropped, not retried for ever)', async () => {
    await expect(processQueuedAction({ type: 'task_action', payload: { action: 'pickup' } } as never)).rejects.toMatchObject({ response: { status: 400 } });
    await expect(processQueuedAction({ type: 'task_action', payload: { action: 'fly', taskId: 't' } } as never)).rejects.toMatchObject({ response: { status: 400 } });
    await expect(processQueuedAction({ type: 'mystery', payload: {} } as never)).rejects.toMatchObject({ response: { status: 400 } });
  });
});
