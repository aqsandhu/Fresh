import { useEffect, useCallback, useState } from 'react';
import { useTaskStore } from '../store/taskStore';
import { Task } from '../types';

export const useTasks = () => {
  const {
    tasks,
    activeTasks,
    completedTasks,
    currentTask,
    todayStats,
    earnings,
    isLoading,
    error,
    fetchTasks,
    fetchActiveTasks,
    fetchCompletedTasks,
    fetchTaskById,
    setCurrentTask,
    acceptTask,
    markPickedUp,
    markDelivered,
    cancelTask,
    requestCustomerCall,
    fetchTodayStats,
    fetchEarnings,
    uploadDeliveryProof,
    reportIssue,
    clearError,
    refreshTasks,
  } = useTaskStore();

  const [activeTab, setActiveTab] = useState<'active' | 'completed'>('active');

  // Load tasks on mount
  useEffect(() => {
    refreshTasks();
  }, []);

  // Get tasks based on active tab
  const getTasksByTab = useCallback(() => {
    return activeTab === 'active' ? activeTasks : completedTasks;
  }, [activeTab, activeTasks, completedTasks]);

  // Get task count
  const getTaskCount = useCallback(() => {
    return {
      active: activeTasks.length,
      completed: completedTasks.length,
      total: activeTasks.length + completedTasks.length,
    };
  }, [activeTasks.length, completedTasks.length]);

  // Handle task pickup
  const handlePickup = useCallback(
    async (taskId: string, notes?: string) => {
      await markPickedUp(taskId, notes);
    },
    [markPickedUp]
  );

  // Handle task delivery
  const handleDeliver = useCallback(
    async (
      taskId: string,
      data: {
        signature?: string;
        photoProof?: string;
        notes?: string;
        customerName?: string;
      }
    ) => {
      await markDelivered(taskId, data);
    },
    [markDelivered]
  );

  // Handle customer call request
  const handleCallCustomer = useCallback(
    async (taskId: string) => {
      await requestCustomerCall(taskId);
    },
    [requestCustomerCall]
  );

  // Get today's earnings
  const getTodayEarnings = useCallback(() => {
    return todayStats?.totalEarnings || 0;
  }, [todayStats]);

  // Get today's deliveries
  const getTodayDeliveries = useCallback(() => {
    return todayStats?.totalDeliveries || 0;
  }, [todayStats]);

  // Get today's distance
  const getTodayDistance = useCallback(() => {
    return todayStats?.totalDistance || 0;
  }, [todayStats]);

  // Check if has active tasks
  const hasActiveTasks = useCallback(() => {
    return activeTasks.length > 0;
  }, [activeTasks.length]);

  // Get next active task
  const getNextActiveTask = useCallback((): Task | null => {
    return activeTasks.length > 0 ? activeTasks[0] : null;
  }, [activeTasks]);

  return {
    // State
    tasks,
    activeTasks,
    completedTasks,
    currentTask,
    todayStats,
    earnings,
    isLoading,
    error,
    activeTab,

    // Actions
    fetchTasks,
    fetchActiveTasks,
    fetchCompletedTasks,
    fetchTaskById,
    setCurrentTask,
    acceptTask,
    markPickedUp: handlePickup,
    markDelivered: handleDeliver,
    cancelTask,
    requestCustomerCall: handleCallCustomer,
    fetchTodayStats,
    fetchEarnings,
    uploadDeliveryProof,
    reportIssue,
    clearError,
    refreshTasks,
    setActiveTab,

    // Helpers
    getTasksByTab,
    getTaskCount,
    getTodayEarnings,
    getTodayDeliveries,
    getTodayDistance,
    hasActiveTasks,
    getNextActiveTask,
  };
};

export default useTasks;
