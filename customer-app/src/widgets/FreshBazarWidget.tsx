import React from 'react';
import { FlexWidget, TextWidget } from 'react-native-android-widget';
import type { AppWidgetConfig } from '@/lib/appWidget';

/**
 * The Android home-screen widget. Content is admin-managed (Settings > App
 * Widget in the admin panel) and cached on the device; tapping opens the app.
 */
export function FreshBazarWidget({ config }: { config: AppWidgetConfig }) {
  return (
    <FlexWidget
      clickAction="OPEN_APP"
      style={{
        height: 'match_parent',
        width: 'match_parent',
        flexDirection: 'column',
        backgroundColor: '#15803d',
        borderRadius: 24,
        padding: 14,
      }}
    >
      <FlexWidget style={{ flexDirection: 'row', alignItems: 'center' }}>
        <TextWidget text="🥬" style={{ fontSize: 16 }} />
        <TextWidget
          text={config.title}
          style={{ fontSize: 15, fontWeight: 'bold', color: '#ffffff', marginLeft: 6 }}
        />
      </FlexWidget>
      <TextWidget
        text={config.message}
        maxLines={2}
        style={{ fontSize: 12, color: '#dcfce7', marginTop: 6 }}
      />
      <TextWidget
        text={config.messageUr}
        maxLines={1}
        style={{ fontSize: 12, color: '#bbf7d0', marginTop: 2 }}
      />
      <FlexWidget
        style={{
          marginTop: 8,
          backgroundColor: '#ffffff',
          borderRadius: 999,
          paddingHorizontal: 12,
          paddingVertical: 5,
        }}
      >
        <TextWidget
          text="Shop Now →"
          style={{ fontSize: 11, fontWeight: 'bold', color: '#15803d' }}
        />
      </FlexWidget>
    </FlexWidget>
  );
}
