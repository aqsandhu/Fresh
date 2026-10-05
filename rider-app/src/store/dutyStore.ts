/**
 * Duty store — the ONLY owner of "on duty" state and the GPS lifecycle.
 *
 *   goOnDuty()  : disclosure → permissions → PUT /rider/status available →
 *                 foreground watcher (socket) + background task (REST)
 *   goOffDuty() : PUT /rider/status offline → stop both pipelines
 *   resume()    : on app start, if the rider was on duty, re-arm tracking
 *                 silently; if permission was revoked, go off duty.
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import authService from '../services/auth.service';
import socketService from '../services/socket.service';
import {
  requestLocationPermissions,
  hasForegroundPermission,
  hasBackgroundPermission,
  startForegroundWatch,
  stopForegroundWatch,
  startBackgroundTracking,
  stopBackgroundTracking,
  getLastKnownLocation,
} from '../services/location.service';
import { offlineQueue } from '../utils/offlineQueue';
import { useAuthStore } from './authStore';
import { STORAGE_KEYS } from '../utils/constants';
import { getApiErrorMessage, isNetworkError } from '../services/api';
import type { LocationFix } from '../types';

export type DutyOutcome = 'ok' | 'permission_denied' | 'error';

interface DutyState {
  /** Persisted: rider intends to be on duty. */
  isOnDuty: boolean;
  isSwitching: boolean;
  /** Foreground pipelines actually running. */
  isTracking: boolean;
  backgroundTracking: boolean;
  hasBackgroundPermission: boolean | null;
  /** Latest fix (any accuracy) for UI + distance estimates. */
  lastFix: LocationFix | null;
  /** Latest fix that passed the accuracy filter and was sent. */
  lastSentAt: number | null;
  error: string | null;

  goOnDuty: () => Promise<DutyOutcome>;
  goOffDuty: (opts?: { silent?: boolean }) => Promise<void>;
  resume: () => Promise<void>;
  refreshPermissions: () => Promise<void>;
  clearError: () => void;
  /** Called by authStore on logout — stops tracking without a server call. */
  teardown: () => Promise<void>;
}

const emitFix = (fix: LocationFix) => {
  const riderId = useAuthStore.getState().rider?.id;
  if (!riderId) return;
  socketService.emitLocation(riderId, fix.latitude, fix.longitude, fix.accuracy);
};

export const useDutyStore = create<DutyState>()(
  persist(
    (set, get) => ({
      isOnDuty: false,
      isSwitching: false,
      isTracking: false,
      backgroundTracking: false,
      hasBackgroundPermission: null,
      lastFix: null,
      lastSentAt: null,
      error: null,

      clearError: () => set({ error: null }),

      refreshPermissions: async () => {
        set({ hasBackgroundPermission: await hasBackgroundPermission() });
      },

      goOnDuty: async () => {
        if (get().isSwitching) return 'error';
        set({ isSwitching: true, error: null });
        try {
          const permission = await requestLocationPermissions();
          if (permission === 'denied') {
            set({ isSwitching: false });
            return 'permission_denied';
          }

          // Tell the backend first so dispatch can assign; if this fails we
          // never start tracking (nothing to track for).
          await authService.updateDutyStatus(true);

          socketService.connect();
          const fg = await startForegroundWatch(
            (fix) => {
              emitFix(fix);
              set({ lastSentAt: Date.now() });
            },
            (raw) => set({ lastFix: raw })
          );
          const bg = await startBackgroundTracking().catch((err) => {
            console.warn('[Duty] background tracking unavailable:', err);
            return false;
          });

          const seed = await getLastKnownLocation();
          set({
            isOnDuty: true,
            isTracking: fg,
            backgroundTracking: bg,
            hasBackgroundPermission: permission === 'granted',
            lastFix: seed ?? get().lastFix,
            isSwitching: false,
          });
          return 'ok';
        } catch (error) {
          set({ isSwitching: false, error: getApiErrorMessage(error) });
          return 'error';
        }
      },

      goOffDuty: async ({ silent } = {}) => {
        if (get().isSwitching && !silent) return;
        set({ isSwitching: true, error: null });
        try {
          try {
            await authService.updateDutyStatus(false);
          } catch (error) {
            // Offline: queue the status flip so the server learns about it.
            if (isNetworkError(error)) {
              await offlineQueue.addAction('update_status', { status: 'offline' });
            } else if (!silent) {
              throw error;
            }
          }
        } catch (error) {
          set({ isSwitching: false, error: getApiErrorMessage(error) });
          return;
        } finally {
          stopForegroundWatch();
          await stopBackgroundTracking();
        }
        set({ isOnDuty: false, isTracking: false, backgroundTracking: false, isSwitching: false });
      },

      resume: async () => {
        const state = get();
        set({ hasBackgroundPermission: await hasBackgroundPermission() });
        if (!state.isOnDuty) {
          // Make sure no orphaned background task keeps running.
          await stopBackgroundTracking();
          return;
        }
        if (!(await hasForegroundPermission())) {
          // Permission revoked while away — be honest and go off duty.
          await get().goOffDuty({ silent: true });
          set({ error: 'permission_revoked' });
          return;
        }
        socketService.connect();
        const fg = await startForegroundWatch(
          (fix) => {
            emitFix(fix);
            set({ lastSentAt: Date.now() });
          },
          (raw) => set({ lastFix: raw })
        );
        const bg = await startBackgroundTracking().catch(() => false);
        // Re-assert availability in case the server flipped us offline (e.g.
        // after a delivery the backend sets 'available' anyway; after a
        // restart nothing changes it) — best-effort.
        authService.updateDutyStatus(true).catch(() => {});
        const seed = await getLastKnownLocation();
        set({ isTracking: fg, backgroundTracking: bg, lastFix: seed ?? state.lastFix });
      },

      teardown: async () => {
        stopForegroundWatch();
        await stopBackgroundTracking();
        set({ isOnDuty: false, isTracking: false, backgroundTracking: false, isSwitching: false, error: null });
      },
    }),
    {
      name: STORAGE_KEYS.DUTY,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ isOnDuty: state.isOnDuty }),
    }
  )
);

export default useDutyStore;
