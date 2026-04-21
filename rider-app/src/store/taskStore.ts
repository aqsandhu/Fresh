import { create } from 'zustand';
import { Task, TaskStatus, DailyStats, Earning, RiderStatsData } from '../types';
import { taskService } from '../services/task.service';
import { offlineQueue } from '../utils/offlineQueue';

interface TaskState {
  // State
  tasks: Task[];
  activeTasks: Task[];
  completedTasks: Task[];
  currentTask: Task | null;
  todayStats: DailyStats | null;
  myStats: RiderStatsData | null;
  earnings: Earning[];
  isLoading: boolean;
  error: string | null;
  hasMoreTasks: boolean;

  // Actions
  fetchTasks: (status?: TaskStatus) => Promise<void>;
  fetchActiveTasks: () => Promise<void>;
  fetchCompletedTasks: () => Promise<void>;
  fetchTaskById: (taskId: string) => Promise<Task>;
  setCurrentTask: (task: Task | null) => void;
  acceptTask: (taskId: string) => Promise<void>;
  markPickedUp: (taskId: string, notes?: string) => Promise<void>;
  markDelivered: (
    taskId: string,
    data: {
      signature?: string;
      photoProof?: string;
      notes?: string;
      customerName?: string;
    }
  ) => Promise<void>;
  cancelTask: (taskId: string, reason: string) => Promise<void>;
  requestCustomerCall: (taskId: string) => Promise<void>;
  fetchTodayStats: () => Promise<void>;
  fetchMyStats: () => Promise<void>;
  fetchEarnings: (startDate?: string, endDate?: string) => Promise<void>;
  uploadDeliveryProof: (taskId: string, imageUri: string) => Promise<string>;
  uploadDoorPicture: (taskId: string, imageUri: string) => Promise<string>;
  pinLocation: (taskId: string, latitude: number, longitude: number) => Promise<void>;
  reportIssue: (
    taskId: string,
    data: { issueType: string; description: string; photo?: string }
  ) => Promise<void>;
  clearError: () => void;
  refreshTasks: () => Promise<void>;
}

export const useTaskStore = create<TaskState>((set, get) => ({
  // Initial state
  tasks: [],
  activeTasks: [],
  completedTasks: [],
  currentTask: null,
  todayStats: null,
  myStats: null,
  earnings: [],
  isLoading: false,
  error: null,
  hasMoreTasks: true,

  // Fetch all tasks
  fetchTasks: async (status) => {
    set({ isLoading: true, error: null });
    try {
      const tasks = await taskService.getTasks(status);
      set({ tasks, isLoading: false });
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
    }
  },

  // Fetch active tasks
  fetchActiveTasks: async () => {
    set({ isLoading: true, error: null });
    try {
      const activeTasks = await taskService.getActiveTasks();
      set({ activeTasks, isLoading: false });
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
    }
  },

  // Fetch completed tasks
  fetchCompletedTasks: async () => {
    set({ isLoading: true, error: null });
    try {
      const completedTasks = await taskService.getCompletedTasks();
      set({ completedTasks, isLoading: false });
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
    }
  },

  // Fetch task by ID
  fetchTaskById: async (taskId) => {
    set({ isLoading: true, error: null });
    try {
      const task = await taskService.getTaskById(taskId);
      set({ currentTask: task, isLoading: false });
      return task;
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
      throw error;
    }
  },

  // Set current task
  setCurrentTask: (task) => {
    set({ currentTask: task });
  },

  // Accept task
  acceptTask: async (taskId) => {
    set({ isLoading: true, error: null });
    try {
      const updatedTask = await taskService.acceptTask(taskId);
      set((state) => ({
        activeTasks: [...state.activeTasks, updatedTask],
        tasks: state.tasks.filter((t) => t.id !== taskId),
        isLoading: false,
      }));
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
      throw error;
    }
  },

  // Mark task as picked up
  markPickedUp: async (taskId, notes) => {
    set({ isLoading: true, error: null });
    try {
      const updatedTask = await taskService.markPickedUp(taskId, notes);
      set((state) => ({
        activeTasks: state.activeTasks.map((t) => (t.id === taskId ? updatedTask : t)),
        currentTask: updatedTask,
        isLoading: false,
      }));
    } catch (error: any) {
      // Queue for offline
      await offlineQueue.addAction('task_action', {
        action: 'pickup',
        taskId,
        notes,
      });
      set({ error: error.message, isLoading: false });
      throw error;
    }
  },

  // Mark task as delivered
  markDelivered: async (taskId, data) => {
    set({ isLoading: true, error: null });
    try {
      const updatedTask = await taskService.markDelivered(taskId, data);
      set((state) => ({
        activeTasks: state.activeTasks.filter((t) => t.id !== taskId),
        completedTasks: [updatedTask, ...state.completedTasks],
        currentTask: updatedTask,
        isLoading: false,
      }));
      // Refresh stats
      get().fetchTodayStats();
    } catch (error: any) {
      // Queue for offline
      await offlineQueue.addAction('task_action', {
        action: 'deliver',
        taskId,
        data,
      });
      set({ error: error.message, isLoading: false });
      throw error;
    }
  },

  // Cancel task
  cancelTask: async (taskId, reason) => {
    set({ isLoading: true, error: null });
    try {
      const updatedTask = await taskService.cancelTask(taskId, reason);
      set((state) => ({
        activeTasks: state.activeTasks.filter((t) => t.id !== taskId),
        currentTask: updatedTask,
        isLoading: false,
      }));
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
      throw error;
    }
  },

  // Request customer call (privacy feature)
  requestCustomerCall: async (taskId) => {
    try {
      await taskService.requestCustomerCall(taskId);
    } catch (error: any) {
      // Queue for offline
      await offlineQueue.addAction('task_action', {
        action: 'call_request',
        taskId,
      });
      throw error;
    }
  },

  // Fetch today's stats
  fetchTodayStats: async () => {
    try {
      const todayStats = await taskService.getTodayStats();
      set({ todayStats });
    } catch (error: any) {
      console.error('Failed to fetch today stats:', error);
    }
  },

  // Fetch full rider stats (weekly/monthly + payments)
  fetchMyStats: async () => {
    try {
      const myStats = await taskService.getMyStats();
      set({ myStats });
    } catch (error: any) {
      console.error('Failed to fetch rider stats:', error);
    }
  },

  // Fetch earnings
  fetchEarnings: async (startDate, endDate) => {
    set({ isLoading: true, error: null });
    try {
      const earnings = await taskService.getEarnings(startDate, endDate);
      set({ earnings, isLoading: false });
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
    }
  },

  // Upload delivery proof
  uploadDeliveryProof: async (taskId, imageUri) => {
    try {
      const url = await taskService.uploadDeliveryProof(taskId, imageUri);
      return url;
    } catch (error: any) {
      throw error;
    }
  },

  // Upload door picture for address
  uploadDoorPicture: async (taskId, imageUri) => {
    try {
      const result = await taskService.uploadDoorPicture(taskId, imageUri);
      // Update the current task to reflect new door picture
      const currentTask = get().currentTask;
      if (currentTask && currentTask.id === taskId) {
        set({ currentTask: { ...currentTask, gateImage: result.url } });
      }
      return result.url;
    } catch (error: any) {
      set({ error: error.message });
      throw error;
    }
  },

  // Pin location for address
  pinLocation: async (taskId, latitude, longitude) => {
    try {
      await taskService.pinLocation(taskId, latitude, longitude);
      // Update the current task to reflect location was pinned
      const currentTask = get().currentTask;
      if (currentTask && currentTask.id === taskId) {
        set({ currentTask: { ...currentTask, has_location: true, location_added_by: 'rider' } });
      }
    } catch (error: any) {
      set({ error: error.message });
      throw error;
    }
  },

  // Report issue
  reportIssue: async (taskId, data) => {
    try {
      await taskService.reportIssue(taskId, data);
    } catch (error: any) {
      set({ error: error.message });
      throw error;
    }
  },

  // Clear error
  clearError: () => {
    set({ error: null });
  },

  // Refresh all tasks
  refreshTasks: async () => {
    await Promise.all([
      get().fetchActiveTasks(),
      get().fetchCompletedTasks(),
      get().fetchTodayStats(),
    ]);
  },
}));

export default useTaskStore;
