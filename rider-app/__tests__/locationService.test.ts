// GPS plumbing: our own disclosure BEFORE the system prompt (Google Play
// policy), fixes that are too inaccurate are never sent, the background task
// sends only its best fix, and "pin this house" waits for an accurate lock.
const mockLoc = {
  getForegroundPermissionsAsync: jest.fn(),
  getBackgroundPermissionsAsync: jest.fn(),
  requestForegroundPermissionsAsync: jest.fn(),
  requestBackgroundPermissionsAsync: jest.fn(),
  hasStartedLocationUpdatesAsync: jest.fn(),
  startLocationUpdatesAsync: jest.fn(async () => undefined),
  stopLocationUpdatesAsync: jest.fn(async () => undefined),
  watchPositionAsync: jest.fn(),
  getLastKnownPositionAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  Accuracy: { High: 4, BestForNavigation: 6 },
};
// A Proxy: the module is read lazily (mockLoc does not exist yet when the factory runs).
jest.mock('expo-location', () => new Proxy({}, { get: (_t, key) => (key === '__esModule' ? true : (mockLoc as Record<string | symbol, unknown>)[key]) }));
// defineTask runs while the module loads — read its handler from the mock's calls.
jest.mock('expo-task-manager', () => ({ __esModule: true, defineTask: jest.fn(), isTaskDefined: jest.fn(() => true) }));
const mockAuth = { updateLocation: jest.fn(async () => undefined) };
jest.mock('../src/services/auth.service', () => ({ __esModule: true, get default() { return mockAuth; } }));

import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as loc from '../src/services/location.service';
import { MAX_ACCURACY_FOR_TRACKING } from '../src/utils/constants';

const taskManager = jest.requireMock('expo-task-manager') as { defineTask: jest.Mock; isTaskDefined: jest.Mock };
const backgroundTask = taskManager.defineTask.mock.calls[0][1] as (a: { data?: unknown; error?: unknown }) => Promise<void>;

const position = (accuracy: number, lat = 32.5) => ({ coords: { latitude: lat, longitude: 74.1, accuracy }, timestamp: 1 });
const granted = { status: 'granted' };

beforeEach(async () => {
  jest.clearAllMocks();
  mockLoc.getForegroundPermissionsAsync.mockResolvedValue(granted);
  mockLoc.getBackgroundPermissionsAsync.mockResolvedValue(granted);
  await AsyncStorage.clear();
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('permissions', () => {
  it('already allowed: no disclosure, foreground + background asked', async () => {
    mockLoc.requestForegroundPermissionsAsync.mockResolvedValue(granted);
    mockLoc.requestBackgroundPermissionsAsync.mockResolvedValue(granted);
    const alert = jest.spyOn(Alert, 'alert');
    expect(await loc.requestLocationPermissions()).toBe('granted');
    expect(alert).not.toHaveBeenCalled();
  });

  it('first time: our disclosure first; declining it means no system prompt at all', async () => {
    mockLoc.getForegroundPermissionsAsync.mockResolvedValue({ status: 'undetermined' });
    jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => buttons?.[0].onPress?.());
    expect(await loc.requestLocationPermissions()).toBe('denied');
    expect(mockLoc.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
  });

  it('accepting the disclosure is remembered; background refused = foreground only', async () => {
    mockLoc.getForegroundPermissionsAsync.mockResolvedValue({ status: 'undetermined' });
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => { void buttons?.[1].onPress?.(); });
    mockLoc.requestForegroundPermissionsAsync.mockResolvedValue(granted);
    mockLoc.requestBackgroundPermissionsAsync.mockResolvedValue({ status: 'denied' });
    expect(await loc.requestLocationPermissions()).toBe('foreground_only');
    alert.mockClear();
    expect(await loc.showLocationDisclosure()).toBe(true);
    expect(alert).not.toHaveBeenCalled();
  });

  it('system prompt refused = denied', async () => {
    mockLoc.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'denied' });
    expect(await loc.requestLocationPermissions()).toBe('denied');
  });

  it('a permission check that throws counts as "no"', async () => {
    mockLoc.getBackgroundPermissionsAsync.mockRejectedValue(new Error('x'));
    expect(await loc.hasBackgroundPermission()).toBe(false);
  });
});

describe('background', () => {
  it('starts only with permission and a defined task, never twice', async () => {
    mockLoc.hasStartedLocationUpdatesAsync.mockResolvedValue(false);
    expect(await loc.startBackgroundTracking()).toBe(true);
    expect(mockLoc.startLocationUpdatesAsync).toHaveBeenCalledTimes(1);
    mockLoc.hasStartedLocationUpdatesAsync.mockResolvedValue(true);
    expect(await loc.startBackgroundTracking()).toBe(true);
    expect(mockLoc.startLocationUpdatesAsync).toHaveBeenCalledTimes(1);
    taskManager.isTaskDefined.mockReturnValueOnce(false);
    expect(await loc.startBackgroundTracking()).toBe(false);
    mockLoc.getBackgroundPermissionsAsync.mockResolvedValue({ status: 'denied' });
    expect(await loc.startBackgroundTracking()).toBe(false);
  });

  it('stops only when running', async () => {
    mockLoc.hasStartedLocationUpdatesAsync.mockResolvedValue(true);
    await loc.stopBackgroundTracking();
    expect(mockLoc.stopLocationUpdatesAsync).toHaveBeenCalled();
    mockLoc.hasStartedLocationUpdatesAsync.mockRejectedValue(new Error('x'));
    expect(await loc.isBackgroundTrackingRunning()).toBe(false);
  });

  it('the background task sends its MOST accurate fix, and nothing when all are too rough', async () => {
    await backgroundTask({ data: { locations: [position(80, 1), position(15, 2), position(40, 3)] } });
    expect(mockAuth.updateLocation).toHaveBeenCalledWith(2, 74.1, 15);
    mockAuth.updateLocation.mockClear();
    await backgroundTask({ data: { locations: [position(MAX_ACCURACY_FOR_TRACKING + 1)] } });
    await backgroundTask({ data: { locations: [] } });
    await backgroundTask({ error: new Error('gps off') });
    expect(mockAuth.updateLocation).not.toHaveBeenCalled();
    mockAuth.updateLocation.mockRejectedValueOnce(new Error('offline'));
    await expect(backgroundTask({ data: { locations: [position(10)] } })).resolves.toBeUndefined();
  });
});

describe('foreground', () => {
  it('passes every fix to the screen but only accurate ones to be sent', async () => {
    let cb: ((l: ReturnType<typeof position>) => void) | undefined;
    const remove = jest.fn();
    mockLoc.watchPositionAsync.mockImplementation(async (_o: unknown, f: typeof cb) => { cb = f; return { remove }; });
    const onFix = jest.fn();
    const onRaw = jest.fn();
    expect(await loc.startForegroundWatch(onFix, onRaw)).toBe(true);
    cb!(position(10));
    cb!(position(MAX_ACCURACY_FOR_TRACKING + 50));
    expect(onRaw).toHaveBeenCalledTimes(2);
    expect(onFix).toHaveBeenCalledTimes(1);
    loc.stopForegroundWatch();
    expect(remove).toHaveBeenCalled();
  });

  it('no permission, no watcher', async () => {
    mockLoc.getForegroundPermissionsAsync.mockResolvedValue({ status: 'denied' });
    expect(await loc.startForegroundWatch(jest.fn())).toBe(false);
    expect(await loc.getCurrentLocation()).toBeNull();
    expect(await loc.getAccurateLocation()).toBeNull();
  });

  it('one-shot fixes', async () => {
    mockLoc.getLastKnownPositionAsync.mockResolvedValueOnce(position(30)).mockResolvedValueOnce(null).mockRejectedValueOnce(new Error('x'));
    expect(await loc.getLastKnownLocation()).toMatchObject({ latitude: 32.5, accuracy: 30 });
    expect(await loc.getLastKnownLocation()).toBeNull();
    expect(await loc.getLastKnownLocation()).toBeNull();
    mockLoc.getCurrentPositionAsync.mockResolvedValueOnce(position(5)).mockRejectedValueOnce(new Error('x'));
    expect(await loc.getCurrentLocation()).toMatchObject({ accuracy: 5 });
    expect(await loc.getCurrentLocation()).toBeNull();
  });
});

describe('pinning a house: wait for an accurate lock', () => {
  it('returns as soon as a fix is accurate enough', async () => {
    const remove = jest.fn();
    mockLoc.watchPositionAsync.mockImplementation(async (_o: unknown, f: (l: unknown) => void) => {
      setTimeout(() => { f(position(60)); f(position(8)); }, 0);
      return { remove };
    });
    expect(await loc.getAccurateLocation(10, 5000)).toMatchObject({ accuracy: 8 });
    expect(remove).toHaveBeenCalled();
  });

  it('gives up (null) when nothing is accurate enough in time', async () => {
    mockLoc.watchPositionAsync.mockImplementation(async (_o: unknown, f: (l: unknown) => void) => {
      f(position(60));
      return { remove: jest.fn() };
    });
    expect(await loc.getAccurateLocation(10, 30)).toBeNull();
  });
});
