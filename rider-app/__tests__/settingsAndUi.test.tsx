// Rider settings (with the v1 → v2 storage migration) and the shared UI pieces.
import React from 'react';
import { Text } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { useSettingsStore, defaultSettings } from '../src/store/settingsStore';
import { SegmentedControl, ScreenHeader, StatTile, Sheet, BottomActionBar } from '../src/components/ui';
import Skeleton from '../src/components/ui/Skeleton';

describe('settings', () => {
  beforeEach(() => useSettingsStore.getState().resetSettings());

  it('toggles and resets', () => {
    const s = useSettingsStore.getState();
    s.setLanguage('ur');
    s.toggleNotifications();
    s.toggleSound();
    s.toggleVibration();
    expect(useSettingsStore.getState()).toMatchObject({ language: 'ur', notificationsEnabled: false, soundEnabled: false, vibrationEnabled: false });
    useSettingsStore.getState().resetSettings();
    expect(useSettingsStore.getState()).toMatchObject(defaultSettings);
  });

  it('old saved settings are migrated (dead toggles dropped, unknown language → English)', () => {
    const opts = (useSettingsStore as unknown as { persist: { getOptions: () => { migrate: (p: unknown, v: number) => unknown } } }).persist.getOptions();
    expect(opts.migrate({ language: 'fr', soundEnabled: false, darkMode: true, autoAcceptTasks: true }, 1)).toEqual({
      language: 'en', notificationsEnabled: true, soundEnabled: false, vibrationEnabled: true,
    });
  });
});

describe('ui', () => {
  it('segmented control shows counts and reports the choice', () => {
    const onChange = jest.fn();
    const view = render(
      <SegmentedControl segments={[{ value: 'active', label: 'Active', count: 3 }, { value: 'done', label: 'Done' }]} value="active" onChange={onChange} />
    );
    fireEvent.press(view.getByText(/Done/));
    expect(onChange).toHaveBeenCalledWith('done');
    expect(view.getByText(/3/)).toBeTruthy();
  });

  it('header with back button, stat tile, sheet, bottom bar and skeleton render', () => {
    const onBack = jest.fn();
    const view = render(
      <>
        <ScreenHeader title="Earnings" subtitle="This week" onBack={onBack} variant="dark" right={<Text>R</Text>} />
        <StatTile label="Cash in hand" value="Rs 4,400" tone="warning" hint="Hand over today" emphasis />
        <Sheet visible title="Report a problem" onClose={jest.fn()} footer={<Text>Footer</Text>}>
          <Text>Body</Text>
        </Sheet>
        <BottomActionBar><Text>Deliver</Text></BottomActionBar>
        <Skeleton width={100} height={20} round />
      </>
    );
    expect(view.getByText('Earnings')).toBeTruthy();
    expect(view.getByText('Rs 4,400')).toBeTruthy();
    expect(view.getByText('Body')).toBeTruthy();
    expect(view.getByText('Deliver')).toBeTruthy();
    fireEvent.press(view.getByLabelText('Back'));
    expect(onBack).toHaveBeenCalled();
  });
});
