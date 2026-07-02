import React from 'react';
import type { WidgetTaskHandlerProps } from 'react-native-android-widget';
import { FreshBazarWidget } from './FreshBazarWidget';
import { getCachedWidgetConfig } from '@/lib/appWidget';

/**
 * Called by Android whenever a Fresh Bazar widget needs (re)drawing —
 * added, resized, or on the periodic update. Renders from the cached
 * admin-managed content (refreshed every time the app opens).
 */
export async function widgetTaskHandler(props: WidgetTaskHandlerProps) {
  switch (props.widgetAction) {
    case 'WIDGET_ADDED':
    case 'WIDGET_UPDATE':
    case 'WIDGET_RESIZED':
      props.renderWidget(<FreshBazarWidget config={await getCachedWidgetConfig()} />);
      break;
    default:
      break;
  }
}
