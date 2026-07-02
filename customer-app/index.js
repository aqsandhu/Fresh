import { registerRootComponent } from 'expo';

import App from './App';

// Android home-screen widget: register the redraw handler. Feature-detected
// so app builds WITHOUT the widget native module (or iOS) start normally.
try {
  const { registerWidgetTaskHandler } = require('react-native-android-widget');
  const { widgetTaskHandler } = require('./src/widgets/widgetTaskHandler');
  registerWidgetTaskHandler(widgetTaskHandler);
} catch (e) {
  // Widget module not available in this build — ignore.
}

registerRootComponent(App);
