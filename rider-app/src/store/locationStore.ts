import { create } from 'zustand';
import { LocationCoords } from '../types';
import { locationService } from '../services/location.service';

interface LocationState {
  // State
  currentLocation: LocationCoords | null;
  isTracking: boolean;
  isPermissionGranted: boolean;
  lastUpdated: number | null;
  error: string | null;

  // Actions
  initialize: () => Promise<void>;
  startTracking: (riderId: string) => Promise<boolean>;
  stopTracking: () => Promise<void>;
  updateLocation: (riderId: string) => Promise<void>;
  getCurrentLocation: () => Promise<LocationCoords | null>;
  requestPermissions: () => Promise<boolean>;
  clearError: () => void;
}

export const useLocationStore = create<LocationState>((set, get) => ({
  // Initial state
  currentLocation: null,
  isTracking: false,
  isPermissionGranted: false,
  lastUpdated: null,
  error: null,

  // Initialize location service
  initialize: async () => {
    try {
      const hasPermission = await locationService.hasPermissions();
      set({ isPermissionGranted: hasPermission });

      if (hasPermission) {
        // Get last known location
        const lastLocation = await locationService.getLastKnownLocation();
        if (lastLocation) {
          set({ currentLocation: lastLocation });
        }
      }
    } catch (error: any) {
      set({ error: error.message });
    }
  },

  // Start location tracking
  startTracking: async (riderId) => {
    set({ error: null });
    try {
      const success = await locationService.startTracking(riderId, (location) => {
        set({
          currentLocation: location,
          lastUpdated: Date.now(),
        });
      });

      if (success) {
        set({ isTracking: true, isPermissionGranted: true });
      }

      return success;
    } catch (error: any) {
      set({ error: error.message, isTracking: false });
      return false;
    }
  },

  // Stop location tracking
  stopTracking: async () => {
    try {
      await locationService.stopTracking();
      set({ isTracking: false });
    } catch (error: any) {
      set({ error: error.message });
    }
  },

  // Update location manually
  updateLocation: async (riderId) => {
    try {
      const location = await locationService.getCurrentLocation();
      if (location) {
        await locationService.updateLocation(riderId, location);
        set({
          currentLocation: location,
          lastUpdated: Date.now(),
        });
      }
    } catch (error: any) {
      set({ error: error.message });
    }
  },

  // Get current location
  getCurrentLocation: async () => {
    try {
      const location = await locationService.getCurrentLocation();
      if (location) {
        set({ currentLocation: location });
      }
      return location;
    } catch (error: any) {
      set({ error: error.message });
      return null;
    }
  },

  // Request permissions
  requestPermissions: async () => {
    try {
      const granted = await locationService.requestPermissions();
      set({ isPermissionGranted: granted });
      return granted;
    } catch (error: any) {
      set({ error: error.message, isPermissionGranted: false });
      return false;
    }
  },

  // Clear error
  clearError: () => {
    set({ error: null });
  },
}));

export default useLocationStore;
