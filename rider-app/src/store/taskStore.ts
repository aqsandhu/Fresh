import { create } from 'zustand';
import { Task, DailyStats, RiderStatsData, QueuedAction } from '../types';
import { taskService } from '../services/task.service';
import { offlineQueue } from '../utils/offlineQueue';
import { isNetworkError, getApiErrorMessage } from '../services/api';
import authService from '../services/auth.service';

export class QueuedOfflineError extends Error {
  constructor() {
    super('queued_offline');
    this.name = 'QueuedOfflineError';
  }
}

interface TaskState {
  activeTasks: Task[];
  completedTasks: Task[];
  todayStats: DailyStats | null;
  myStats: RiderStatsData | null;

  isLoadingActive: boolean;
  isLoadingCompleted: boolean;
  hasLoadedActive: boolean;
  hasLoadedCompleted: boolean;
  /** Task ids with an in-flight mutation (button spinners stay local). */
  pendingTaskIds: string[];
  lastError: string | null;

  fetchActiveTasks: () => Promise<void>;
  fetchCompletedTasks: () => Promise<void>;
  fetchTaskById: (taskId: string) => Promise<Task>;
  fetchTodayStats: () => Promise<void>;
  fetchMyStats: () => Promise<void>;
  refreshAll: () => Promise<void>;

  markPickedUp: (taskId: string, notes?: string) => Promise<Task>;
  markDelivered: (taskId: string, notes?: string) => Promise<Task>;
  failTask: (taskId: string, reason: string) => Promise<Task>;
  requestCustomerCall: (orderId: string) => Promise<string | null>;
  pinLocation: (taskId: string, latitude: number, longitude: number) => Promise<void>;
  uploadDoorPicture: (taskId: string, imageUri: string) => Promise<string>;

  /** Merge a fresh task into the lists (used by detail screen + socket). */
  upsertTask: (task: Task) => void;
  removeTask: (taskId: string) => void;
  clearError: () => void;
  reset: () => void;
}

const sortActive = (tasks: Task[]): Task[] =>
  [...tasks].sort((a, b) => {
    if (a.status !== b.status) return a.status === 'in_progress' ? -1 : 1;
    if ((a.sequence ?? 0) !== (b.sequence ?? 0)) return (a.sequence ?? 0) - (b.sequence ?? 0);
    return (b.assignedAt || '').localeCompare(a.assignedAt || '');
  });

const initial = {
  activeTasks: [] as Task[],
  completedTasks: [] as Task[],
  todayStats: null as DailyStats | null,
  myStats: null as RiderStatsData | null,
  isLoadingActive: false,
  isLoadingCompleted: false,
  hasLoadedActive: false,
  hasLoadedCompleted: false,
  pendingTaskIds: [] as string[],
  lastError: null as string | null,
};

export const useTaskStore = create<TaskState>((set, get) => {
  const setPending = (taskId: string, pending: boolean) =>
    set((s) => ({
      pendingTaskIds: pending
        ? s.pendingTaskIds.includes(taskId)
          ? s.pendingTaskIds
          : [...s.pendingTaskIds, taskId]
        : s.pendingTaskIds.filter((id) => id !== taskId),
    }));

  const applyTask = (task: Task) => {
    set((s) => {
      const isActive = task.status === 'assigned' || task.status === 'in_progress';
      const active = s.activeTasks.filter((t) => t.id !== task.id);
      const completed = s.completedTasks.filter((t) => t.id !== task.id);
      if (isActive) active.push(task);
      else if (task.status === 'completed') completed.unshift(task);
      return { activeTasks: sortActive(active), completedTasks: completed };
    });
  };

  return {
    ...initial,

    fetchActiveTasks: async () => {
      set({ isLoadingActive: true });
      try {
        const activeTasks = await taskService.getActiveTasks();
        set({ activeTasks: sortActive(activeTasks), hasLoadedActive: true, lastError: null });
      } catch (error) {
        set({ lastError: getApiErrorMessage(error) });
      } finally {
        set({ isLoadingActive: false });
      }
    },

    fetchCompletedTasks: async () => {
      set({ isLoadingCompleted: true });
      try {
        const completedTasks = await taskService.getCompletedTasks();
        set({ completedTasks, hasLoadedCompleted: true, lastError: null });
      } catch (error) {
        set({ lastError: getApiErrorMessage(error) });
      } finally {
        set({ isLoadingCompleted: false });
      }
    },

    fetchTaskById: async (taskId) => {
      const task = await taskService.getTaskById(taskId);
      applyTask(task);
      return task;
    },

    fetchTodayStats: async () => {
      try {
        set({ todayStats: await taskService.getTodayStats() });
      } catch (error) {
        console.warn('[TaskStore] today stats:', getApiErrorMessage(error));
      }
    },

    fetchMyStats: async () => {
      try {
        set({ myStats: await taskService.getMyStats() });
      } catch (error) {
        console.warn('[TaskStore] stats:', getApiErrorMessage(error));
      }
    },

    refreshAll: async () => {
      await Promise.all([get().fetchActiveTasks(), get().fetchCompletedTasks(), get().fetchTodayStats(), get().fetchMyStats()]);
    },

    markPickedUp: async (taskId, notes) => {
      setPending(taskId, true);
      try {
        const task = await taskService.markPickedUp(taskId, notes);
        applyTask(task);
        return task;
      } catch (error) {
        if (isNetworkError(error)) {
          await offlineQueue.addAction('task_action', { action: 'pickup', taskId, notes });
          // Optimistic local flip so the rider can keep working.
          const local = get().activeTasks.find((t) => t.id === taskId);
          if (local) applyTask({ ...local, status: 'in_progress', startedAt: new Date().toISOString() });
          throw new QueuedOfflineError();
        }
        throw error;
      } finally {
        setPending(taskId, false);
      }
    },

    markDelivered: async (taskId, notes) => {
      setPending(taskId, true);
      try {
        const task = await taskService.markDelivered(taskId, notes);
        applyTask(task);
        get().fetchTodayStats();
        get().fetchMyStats();
        return task;
      } catch (error) {
        if (isNetworkError(error)) {
          await offlineQueue.addAction('task_action', { action: 'deliver', taskId, notes });
          const local = get().activeTasks.find((t) => t.id === taskId);
          if (local) applyTask({ ...local, status: 'completed', completedAt: new Date().toISOString() });
          throw new QueuedOfflineError();
        }
        throw error;
      } finally {
        setPending(taskId, false);
      }
    },

    failTask: async (taskId, reason) => {
      setPending(taskId, true);
      try {
        const task = await taskService.failTask(taskId, reason);
        applyTask(task);
        return task;
      } finally {
        setPending(taskId, false);
      }
    },

    requestCustomerCall: async (orderId) => {
      const result = await taskService.requestCustomerCall(orderId);
      return result.number;
    },

    pinLocation: async (taskId, latitude, longitude) => {
      await taskService.pinLocation(taskId, latitude, longitude);
      set((s) => {
        const patch = (t: Task) =>
          t.id === taskId ? { ...t, location: { latitude, longitude }, hasPin: true, pinnedBy: 'rider' } : t;
        return { activeTasks: s.activeTasks.map(patch), completedTasks: s.completedTasks.map(patch) };
      });
    },

    uploadDoorPicture: async (taskId, imageUri) => {
      const url = await taskService.uploadDoorPicture(taskId, imageUri);
      set((s) => {
        const patch = (t: Task) => (t.id === taskId ? { ...t, doorPictureUrl: url } : t);
        return { activeTasks: s.activeTasks.map(patch), completedTasks: s.completedTasks.map(patch) };
      });
      return url;
    },

    upsertTask: applyTask,

    removeTask: (taskId) =>
      set((s) => ({
        activeTasks: s.activeTasks.filter((t) => t.id !== taskId),
        completedTasks: s.completedTasks.filter((t) => t.id !== taskId),
      })),

    clearError: () => set({ lastError: null }),
    reset: () => set({ ...initial }),
  };
});

/**
 * Replay a queued offline action against the live API. Used by the
 * connectivity watcher in the navigator.
 */
export const processQueuedAction = async (action: QueuedAction): Promise<unknown> => {
  if (action.type === 'update_status') {
    const status = String(action.payload.status || 'offline');
    return authService.updateDutyStatus(status === 'available');
  }
  if (action.type === 'task_action') {
    const payload = action.payload as { action?: string; taskId?: string; notes?: string };
    if (!payload.taskId) throw Object.assign(new Error('Queued task action missing taskId'), { response: { status: 400 } });
    switch (payload.action) {
      case 'pickup':
        return taskService.markPickedUp(payload.taskId, payload.notes);
      case 'deliver':
        return taskService.markDelivered(payload.taskId, payload.notes);
      default:
        throw Object.assign(new Error(`Unknown queued action: ${payload.action}`), { response: { status: 400 } });
    }
  }
  throw Object.assign(new Error(`Unsupported queued action type: ${action.type}`), { response: { status: 400 } });
};

export default useTaskStore;
