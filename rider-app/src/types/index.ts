// ============================================================================
// Rider App Types — UI-facing shapes (maps from backend in services)
// ============================================================================

export type {
  ApiResponse,
  PaginatedResponse,
  LoginCredentials,
  NotificationType,
  TaskType,
} from '@freshbazar/shared-types';

/** Rider task states used in the rider mobile app UI */
export type TaskStatus =
  | 'pending'
  | 'assigned'
  | 'picked_up'
  | 'in_transit'
  | 'delivered'
  | 'cancelled'
  | 'in_progress'
  | 'completed'
  | 'failed';

export interface TaskItem {
  id: string;
  name: string;
  nameUrdu?: string;
  quantity: number;
  unit: string;
  price: number;
}

export interface QueuedAction {
  id: string;
  type: 'task_action' | 'update_status' | 'upload_proof' | 'pin_location' | 'report_issue';
  payload: Record<string, unknown>;
  timestamp: number;
  retryCount: number;
}

/** Full task shape mapped from backend rider task endpoints */
export interface Task {
  id: string;
  riderId?: string;
  orderNumber?: string;
  orderId?: string;
  attaRequestId?: string;
  type?: string;
  taskType?: string;
  status: TaskStatus;
  customerName?: string;
  customerPhone?: string;
  customerAddress?: string;
  houseNumber?: string;
  landmark?: string;
  area?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  totalAmount?: number;
  deliveryFee?: number;
  notes?: string;
  specialInstructions?: string;
  createdAt?: string;
  assignedAt?: string;
  timeWindow?: string;
  requestedDeliveryDate?: string;
  gateImage?: string;
  has_location?: boolean;
  location_added_by?: string;
  addressId?: string;
  paymentMethod?: string;
  paymentStatus?: string;
  items?: TaskItem[];
  distance?: number;
  estimatedTime?: number;
  pickupAddress?: string;
  deliveryAddress?: string;
}

/** Rider profile shape used in rider app screens/stores */
export interface Rider {
  id: string;
  userId?: string;
  name: string;
  fullName?: string;
  phone: string;
  email?: string;
  avatar?: string;
  avatarUrl?: string;
  vehicleType?: string;
  vehicleNumber?: string;
  isOnline: boolean;
  status: 'online' | 'offline' | 'available' | 'busy' | 'on_leave';
  totalDeliveries: number;
  totalEarnings: number;
  todayDeliveries: number;
  todayEarnings: number;
  rating?: number;
  cnic?: string;
  currentLocation?: { latitude: number; longitude: number };
}

export interface AppSettings {
  language: 'en' | 'ur';
  notificationsEnabled: boolean;
  soundEnabled: boolean;
  vibrationEnabled: boolean;
  autoAcceptTasks: boolean;
  darkMode: boolean;
}

export interface LocationCoords {
  latitude: number;
  longitude: number;
  accuracy?: number;
  altitude?: number;
  timestamp?: number;
}

export interface DailyStats {
  date: string;
  totalDeliveries: number;
  totalEarnings: number;
  totalDistance: number;
  avgDeliveryTime: number;
  onlineHours?: number;
}

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

export interface Earning {
  id: string;
  date: string;
  amount: number;
  type: 'delivery' | 'bonus' | 'incentive' | 'atta';
  description: string;
  orderId?: string;
}

export interface LoginResponse {
  rider: Rider;
  token: string;
  refreshToken?: string | null;
}

export type AuthStackParamList = {
  Login: undefined;
};

export type TasksStackParamList = {
  TasksList: { status?: TaskStatus } | undefined;
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
