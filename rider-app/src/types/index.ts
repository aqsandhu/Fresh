export interface Rider {
  id: string;
  name: string;
  phone: string;
  email?: string;
  avatar?: string;
  isOnline: boolean;
  status?: 'online' | 'offline' | 'busy';
  totalDeliveries: number;
  totalEarnings: number;
  todayDeliveries: number;
  todayEarnings: number;
  rating?: number;
  vehicleType?: 'bike' | 'cycle' | 'van';
  vehicleNumber?: string;
  cnic?: string;
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
  type: 'delivery' | 'bonus' | 'incentive';
  description: string;
  orderId?: string;
}

export interface QueuedAction {
  id: string;
  type: 'task_action' | 'location_update' | 'status_update' | 'call_request';
  payload: any;
  timestamp: number;
  retryCount: number;
}

export interface Task {
  id: string;
  orderNumber?: string;
  orderId?: string;
  attaRequestId?: string;
  type: 'delivery' | 'pickup' | 'atta_pickup' | 'atta_delivery';
  status: 'pending' | 'assigned' | 'picked_up' | 'in_transit' | 'delivered' | 'cancelled';
  customerName?: string;
  customerPhone?: string;
  address?: string;
  customerAddress?: string;
  houseNumber?: string;
  area?: string;
  city?: string;
  landmark?: string;
  latitude?: number;
  longitude?: number;
  items?: OrderItem[];
  totalAmount?: number;
  deliveryFee?: number;
  createdAt?: string;
  estimatedTime?: string;
  notes?: string;
  specialInstructions?: string;
  timeWindow?: string;
  requestedDeliveryDate?: string;
  distance?: string;
  gateImage?: string;
  has_location?: boolean;
  location_added_by?: string | null;
  addressId?: string;
  paymentMethod?: string;
  paymentStatus?: string;
}

export interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  price: number;
}

export interface LoginCredentials {
  phone: string;
  password: string;
}

export interface LoginResponse {
  rider: Rider;
  token: string;
}

export interface LocationUpdate {
  latitude: number;
  longitude: number;
  accuracy?: number;
  timestamp: number;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

export type TaskStatus = 'pending' | 'assigned' | 'picked_up' | 'in_transit' | 'delivered' | 'cancelled';

// Navigation Param Lists
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
