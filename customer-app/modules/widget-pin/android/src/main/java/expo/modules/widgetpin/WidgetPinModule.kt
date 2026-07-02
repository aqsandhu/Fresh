package expo.modules.widgetpin

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Tiny bridge to Android's official "pin app widget" flow: shows the system
 * permission dialog and, on the user's approval, places the widget on the
 * home screen automatically (Android 8.0+ launchers that support pinning).
 */
class WidgetPinModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("WidgetPin")

    Function("isPinSupported") {
      val context = appContext.reactContext ?: return@Function false
      Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
        AppWidgetManager.getInstance(context).isRequestPinAppWidgetSupported
    }

    Function("requestPin") { providerClassName: String ->
      val context = appContext.reactContext ?: return@Function false
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return@Function false
      val manager = AppWidgetManager.getInstance(context)
      if (!manager.isRequestPinAppWidgetSupported) return@Function false
      manager.requestPinAppWidget(ComponentName(context, providerClassName), null, null)
    }
  }
}
