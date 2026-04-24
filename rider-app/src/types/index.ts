// ============================================================================
// Rider App Types — Re-exports from @freshbazar/shared-types + RN-specific
// ============================================================================

// Re-export ALL shared types (single source of truth)
export * from '@freshbazar/shared-types';

// ============================================================================
// Rider-app-specific Types (NOT in shared-types — mobile only)
// ============================================================================

/** App settings stored locally on the rider's device */
export interface AppSettings {
  language: 'en' | 'ur';
  notificationsEnabled: boolean;
  soundEnabled: boolean;
  vibrationEnabled: boolean;
  autoAcceptTasks: boolean;
  darkMode: boolean;
}

/** Geographic coordinates with optional sensor metadata */
export interface LocationCoords {
  latitude: number;
  longitude: number;
  accuracy?: number;
  altitude?: number;
  timestamp?: number;
}

/** Daily performance summary for a rider */
export interface DailyStats {
  date: string;
  totalDeliveries: number;
  totalEarnings: number;
  totalDistance: number;
  avgDeliveryTime: number;
}

/** Comprehensive rider statistics payload */
export interface RiderStatsData {
  stats: {
    today: { orders: number; earnings: number };
    thisWeek: { orders: number; earnings: number };
    lastWeek: { orders: number; earnings: number };
    thisMonth: { orders: number; earnings: number };
    lastMonth: { orders: number; earnings: number };
  };
  payment: {
    totalCollected: number;
    totalEarned: number;
    paymentPending: number;
  };
}

/** Single earning record */
export interface Earning {
  id: string;
  date: string;
  amount: number;
  type: 'delivery' | 'bonus' | 'incentive';
  description: string;
  orderId?: string;
}

/** Login response payload (rider-specific shape) */
export interface LoginResponse {
  rider: import('@freshbazar/shared-types').Rider;
  token: string;
  refreshToken: string;
}

// ============================================================================
// React Navigation Param Lists (RN-specific)
// ============================================================================

export type AuthStackParamList = {
  Login: undefined;
};

export type TasksStackParamList = {
  TasksList: { status?: import('@freshbazar/shared-types').TaskStatus } | undefined;
  TaskDetail: { taskId: string };
};

export type ProfileStackParamList = {
  ProfileMain: undefined;
  Earnings: undefined;
  Settings: undefined;
};

export type RootStackParamList = {
  MainTabs: undefined;
  TaskDetail: { taskId: string };
};

export type MainTabParamList = {
  Dashboard: undefined;
  Tasks: undefined;
  Profile: undefined;
};
