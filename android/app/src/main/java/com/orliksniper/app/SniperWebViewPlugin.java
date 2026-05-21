package com.orliksniper.app;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Bitmap;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Button;
import android.graphics.Color;
import android.view.Gravity;
import android.widget.Toast;
import android.os.PowerManager;
import android.content.Context;
import android.app.AlarmManager;
import android.app.PendingIntent;
import android.app.NotificationManager;
import android.app.NotificationChannel;
import androidx.core.app.NotificationCompat;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONException;

/**
 * SniperWebViewPlugin — Native Android WebView with:
 * - Full JavaScript injection support
 * - Cookie persistence for Facebook sessions
 * - Bi-directional communication with Capacitor JS layer
 * - DOM-ready detection for timing-critical operations
 *
 * This plugin creates an overlay WebView that loads messenger.com,
 * allowing the sniper to inject monitoring scripts and send messages.
 */
@CapacitorPlugin(name = "SniperWebView")
public class SniperWebViewPlugin extends Plugin {

    public SniperWebViewPlugin() {
        super();
    }

    private static final String TAG = "SniperWebView";
    private static final String MESSENGER_URL = "https://www.messenger.com/";
    private static final String MESSENGER_LOGIN_URL = "https://www.messenger.com/login/";

    private WebView sniperWebView;
    private FrameLayout containerLayout;
    private Handler mainHandler;
    private boolean isWebViewVisible = false;
    private boolean isPageLoaded = false;
    private String currentUrl = "";
    private PowerManager.WakeLock wakeLock;

    private String autoTargetTime;
    private String autoStrategy;
    private String autoMessengerPin;
    private boolean isAutoSnipeActive = false;

    private static SniperWebViewPlugin instance;

    public static SniperWebViewPlugin getInstance() {
        return instance;
    }

    public static void logNative(String message, String level) {
        if (instance != null) {
            JSObject data = new JSObject();
            data.put("event", "log");
            data.put("message", "[NATIVE] " + message);
            data.put("level", level);
            instance.notifyListeners("sniperEvent", data);
        }
        Log.i("SniperNative", "[" + level + "] " + message);
    }

    @Override
    public void load() {
        super.load();
        instance = this;
        mainHandler = new Handler(Looper.getMainLooper());

        // Enable cookie persistence globally
        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);

        Log.i(TAG, "SniperWebView plugin loaded");

        // Check if we were launched for auto-sniping
        Activity activity = getActivity();
        if (activity != null && activity.getIntent() != null) {
            Intent intent = activity.getIntent();
            if (intent.getBooleanExtra("auto_snipe", false)) {
                String chatUrl = intent.getStringExtra("chatUrl");
                String targetTime = intent.getStringExtra("targetTime");
                String strategy = intent.getStringExtra("strategy");
                String messengerPin = intent.getStringExtra("messengerPin");
                
                Log.i(TAG, "Auto-snipe extra detected on load, triggering workflow...");
                triggerWorkflowNative(chatUrl, targetTime, strategy, messengerPin);
            }
        }
    }

    // ======================================================
    // PUBLIC PLUGIN METHODS (callable from JS)
    // ======================================================

    /**
     * Open the WebView with a given URL (defaults to messenger.com).
     * If visible=true, shows it as an overlay for manual login.
     * If visible=false, keeps it hidden for automated sniping.
     *
     * JS call: SniperWebView.open({ url: '...', visible: true })
     */
    @PluginMethod()
    public void open(PluginCall call) {
        String url = call.getString("url", MESSENGER_URL);
        boolean visible = call.getBoolean("visible", true);

        mainHandler.post(() -> {
            try {
                createWebView(url, visible);
                JSObject ret = new JSObject();
                ret.put("success", true);
                ret.put("url", url);
                ret.put("visible", visible);
                call.resolve(ret);
            } catch (Exception e) {
                Log.e(TAG, "Failed to open WebView", e);
                call.reject("Failed to open WebView: " + e.getMessage());
            }
        });
    }

    /**
     * Schedule a native Android alarm.
     */
    @PluginMethod()
    public void scheduleNativeAlarm(PluginCall call) {
        String targetTime = call.getString("targetTime");
        String chatUrl = call.getString("chatUrl");
        String strategy = call.getString("strategy", "dynamic");
        String messengerPin = call.getString("messengerPin", "");
        
        if (targetTime == null || chatUrl == null) {
            call.reject("Missing required parameters");
            return;
        }

        try {
            long currentTimeMs = System.currentTimeMillis();
            long triggerAtMillis = AlarmTimeCalculator.calculateTriggerTime(targetTime, currentTimeMs);

            Context context = getContext();
            AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
            Intent intent = new Intent(context, SniperAlarmReceiver.class);
            intent.putExtra("chatUrl", chatUrl);
            intent.putExtra("targetTime", targetTime);
            intent.putExtra("strategy", strategy);
            intent.putExtra("messengerPin", messengerPin);
            intent.addFlags(Intent.FLAG_RECEIVER_FOREGROUND);

            PendingIntent pendingIntent = PendingIntent.getBroadcast(
                context, 
                101, 
                intent, 
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );

            // Use AlarmClock for maximum reliability (shows icon in status bar)
            AlarmManager.AlarmClockInfo alarmClockInfo = new AlarmManager.AlarmClockInfo(triggerAtMillis, pendingIntent);
            alarmManager.setAlarmClock(alarmClockInfo, pendingIntent);

            Log.i(TAG, "Native Alarm Clock scheduled for: " + triggerAtMillis + " (Target: " + targetTime + ")");
            call.resolve();
        } catch (Exception e) {
            call.reject("Failed to schedule alarm: " + e.getMessage());
        }
    }

    /**
     * Cancel the native alarm.
     */
    @PluginMethod()
    public void cancelNativeAlarm(PluginCall call) {
        android.app.AlarmManager alarmManager = (android.app.AlarmManager) getContext().getSystemService(Context.ALARM_SERVICE);
        android.content.Intent intent = new android.content.Intent(getContext(), SniperAlarmReceiver.class);
        android.app.PendingIntent pendingIntent = android.app.PendingIntent.getBroadcast(
            getContext(), 101, intent, 
            android.app.PendingIntent.FLAG_UPDATE_CURRENT | android.app.PendingIntent.FLAG_IMMUTABLE
        );
        alarmManager.cancel(pendingIntent);
        call.resolve();
    }

    /**
     * Trigger the sniper workflow directly from Java (called by ForegroundService).
     */
    public void triggerWorkflowNative(String chatUrl, String targetTime, String strategy, String messengerPin) {
        mainHandler.post(() -> {
            Log.i(TAG, "Triggering native workflow for: " + chatUrl);
            try {
                this.autoTargetTime = targetTime;
                this.autoStrategy = strategy;
                this.autoMessengerPin = messengerPin;
                this.isAutoSnipeActive = true;

                // Reuse existing open logic to create/load the WebView.
                // We use false to keep it invisible in the background. 
                // createWebView handles View.INVISIBLE internally to maintain DOM capabilities.
                createWebView(chatUrl, false);
            } catch (Exception e) {
                Log.e(TAG, "Native workflow failed", e);
            }
        });
    }

    /**
     * Close and destroy the WebView.
     *
     * JS call: SniperWebView.close()
     */
    @PluginMethod()
    public void close(PluginCall call) {
        mainHandler.post(() -> {
            destroyWebView();
            clearKeepScreenOn();
            JSObject ret = new JSObject();
            ret.put("success", true);
            call.resolve(ret);
        });
    }

    @PluginMethod()
    public void checkPermissions(PluginCall call) {
        JSObject ret = new JSObject();
        Context context = getContext();
        
        boolean canScheduleExact = true;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
            canScheduleExact = alarmManager.canScheduleExactAlarms();
        }
        
        PowerManager powerManager = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
        boolean isIgnoringBattery = true;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            isIgnoringBattery = powerManager.isIgnoringBatteryOptimizations(context.getPackageName());
        }
        
        boolean canDrawOverlays = true;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            canDrawOverlays = android.provider.Settings.canDrawOverlays(context);
        }
        
        ret.put("exactAlarm", canScheduleExact);
        ret.put("batteryExempt", isIgnoringBattery);
        ret.put("drawOverlays", canDrawOverlays);
        call.resolve(ret);
    }

    @PluginMethod()
    public void requestPermissions(PluginCall call) {
        Context context = getContext();
        
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
            if (!alarmManager.canScheduleExactAlarms()) {
                Intent intent = new Intent();
                intent.setAction(android.provider.Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM);
                intent.setData(android.net.Uri.parse("package:" + context.getPackageName()));
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                context.startActivity(intent);
                call.resolve();
                return;
            }
        }
        
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            PowerManager powerManager = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
            if (!powerManager.isIgnoringBatteryOptimizations(context.getPackageName())) {
                Intent intent = new Intent();
                intent.setAction(android.provider.Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
                intent.setData(android.net.Uri.parse("package:" + context.getPackageName()));
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                context.startActivity(intent);
                call.resolve();
                return;
            }
        }
        
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            if (!android.provider.Settings.canDrawOverlays(context)) {
                Intent intent = new Intent(android.provider.Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                        android.net.Uri.parse("package:" + context.getPackageName()));
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                context.startActivity(intent);
            }
        }
        
        call.resolve();
    }

    @PluginMethod()
    public void getUrl(PluginCall call) {
        mainHandler.post(() -> {
            if (sniperWebView == null) {
                call.reject("WebView not initialized");
                return;
            }
            JSObject ret = new JSObject();
            ret.put("url", sniperWebView.getUrl());
            call.resolve(ret);
        });
    }

    /**
     * Navigate the WebView to a specific URL.
     *
     * JS call: SniperWebView.navigate({ url: 'https://messenger.com/t/12345' })
     */
    @PluginMethod()
    public void navigate(PluginCall call) {
        String url = call.getString("url");
        if (url == null || url.isEmpty()) {
            call.reject("URL is required");
            return;
        }

        mainHandler.post(() -> {
            if (sniperWebView == null) {
                call.reject("WebView not initialized. Call open() first.");
                return;
            }
            sniperWebView.loadUrl(url);
            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("url", url);
            call.resolve(ret);
        });
    }

    /**
     * Show or hide the WebView overlay.
     *
     * JS call: SniperWebView.setVisible({ visible: false })
     */
    @PluginMethod()
    public void setVisible(PluginCall call) {
        boolean visible = call.getBoolean("visible", true);

        mainHandler.post(() -> {
            if (sniperWebView == null) {
                call.reject("WebView not initialized");
                return;
            }
            if (containerLayout != null) {
                containerLayout.setVisibility(visible ? View.VISIBLE : View.INVISIBLE);
            } else {
                sniperWebView.setVisibility(visible ? View.VISIBLE : View.INVISIBLE);
            }
            isWebViewVisible = visible;

            JSObject ret = new JSObject();
            ret.put("visible", visible);
            call.resolve(ret);
        });
    }

    /**
     * Inject and execute JavaScript in the WebView.
     * This is the core method for sniper script injection.
     *
     * JS call: SniperWebView.executeScript({ script: 'document.title' })
     * Returns: { result: '...' }
     */
    @PluginMethod()
    public void executeScript(PluginCall call) {
        String script = call.getString("script");
        if (script == null || script.isEmpty()) {
            call.reject("Script is required");
            return;
        }

        mainHandler.post(() -> {
            if (sniperWebView == null) {
                call.reject("WebView not initialized");
                return;
            }

            sniperWebView.evaluateJavascript(script, value -> {
                JSObject ret = new JSObject();
                ret.put("result", value);
                call.resolve(ret);
            });
        });
    }

    /**
     * Get current cookies for the WebView domain.
     * Used to check if the user is logged in to Facebook.
     *
     * JS call: SniperWebView.getCookies({ url: 'https://www.messenger.com' })
     */
    @PluginMethod()
    public void getCookies(PluginCall call) {
        String url = call.getString("url", MESSENGER_URL);

        CookieManager cookieManager = CookieManager.getInstance();
        String cookies = cookieManager.getCookie(url);

        JSObject ret = new JSObject();
        ret.put("cookies", cookies != null ? cookies : "");
        ret.put("hasSession", cookies != null && cookies.contains("c_user"));
        call.resolve(ret);
    }

    /**
     * Clear all cookies (for logout).
     *
     * JS call: SniperWebView.clearCookies()
     */
    @PluginMethod()
    public void clearCookies(PluginCall call) {
        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.removeAllCookies(value -> {
            cookieManager.flush();
            JSObject ret = new JSObject();
            ret.put("success", true);
            call.resolve(ret);
        });
    }

    /**
     * Flush cookies to persistent storage.
     * Call this after successful login to ensure session survives app restart.
     *
     * JS call: SniperWebView.persistCookies()
     */
    @PluginMethod()
    public void persistCookies(PluginCall call) {
        CookieManager.getInstance().flush();
        JSObject ret = new JSObject();
        ret.put("success", true);
        call.resolve(ret);
    }

    /**
     * Get current WebView state.
     *
     * JS call: SniperWebView.getState()
     */
    @PluginMethod()
    public void getState(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("isOpen", sniperWebView != null);
        ret.put("isVisible", isWebViewVisible);
        ret.put("isPageLoaded", isPageLoaded);
        ret.put("currentUrl", currentUrl);

        // Check session
        CookieManager cookieManager = CookieManager.getInstance();
        String cookies = cookieManager.getCookie(MESSENGER_URL);
        ret.put("hasSession", cookies != null && cookies.contains("c_user"));

        call.resolve(ret);
    }

    /**
     * Inject the sniper monitoring script and start watching for numbers.
     * This is a convenience method that combines executeScript with the
     * standard sniper monitoring code.
     *
     * JS call: SniperWebView.injectSniper({ strategy: 'dynamic' })
     */
    @PluginMethod()
    public void injectSniper(PluginCall call) {
        String strategy = call.getString("strategy", "dynamic");
        String targetTimeRaw = call.getString("targetTime");
        String messengerPin = call.getString("messengerPin", "");
        
        mainHandler.post(() -> {
            if (sniperWebView == null) {
                call.reject("WebView not initialized");
                return;
            }
            injectSniperInternal(targetTimeRaw, strategy, messengerPin);
            JSObject ret = new JSObject();
            ret.put("success", true);
            call.resolve(ret);
        });
    }

    private void injectSniperInternal(String targetTimeRaw, String strategy, String messengerPin) {
        if (sniperWebView == null) return;

        // Prepare the script with the target time
        String targetTimeVal = "Date.now()";
        if (targetTimeRaw != null) {
            try {
                targetTimeVal = String.valueOf(java.time.OffsetDateTime.parse(targetTimeRaw).toInstant().toEpochMilli());
            } catch (Exception e) {
                targetTimeVal = "new Date('" + targetTimeRaw + "').getTime()";
            }
        }

        final String finalTargetTime = targetTimeVal;

        sniperWebView.evaluateJavascript(getSniperMonitorScript(), value -> {
                String script = "(function() {" +
                    "  const targetTime = " + finalTargetTime + ";" +
                    "  const strategy = '" + strategy + "';" +
                    "  const messengerPin = '" + messengerPin + "';" +
                    "  const targetPos = Math.floor(Math.random() * 4) + 2;" +
                    "  " +
                    "  // Reset state for new run\n" +
                    "  if (window.__SNIPER_STATE__) {\n" +
                    "    window.__SNIPER_STATE__.fired = false;\n" +
                    "    window.__SNIPER_STATE__.status = 'monitoring';\n" +
                    "  }\n" +
                    "  " +
                    "  window.__SNIPER_CONFIG__ = { targetTime, strategy, targetPos };" +
                    "  " +
                    "  if (window.AndroidSniper) {" +
                    "    let msg = 'Cel: ' + new Date(targetTime).toLocaleTimeString();" +
                    "    if (strategy === 'wait') msg += ' (Poz: ' + targetPos + ')';" +
                    "    window.AndroidSniper.log(msg, 'info');" +
                    "  }" +
                    "  " +
                    "  if (window.__SNIPER_TICKER__) clearInterval(window.__SNIPER_TICKER__);" +
                    "  window.__SNIPER_TICKER__ = setInterval(() => {" +
                    "    try {" +
                    "      const now = Date.now();" +
                    "      " +
                    "      // Handle PIN if present\n" +
                    "      if (messengerPin) {\n" +
                    "        const pinInp = document.querySelector('input[type=\"password\"], input[inputmode=\"numeric\"]');\n" +
                    "        if (pinInp && !window.__PIN_DONE__) {\n" +
                    "          window.AndroidSniper.log('Wpisuję PIN...', 'warn');\n" +
                    "          pinInp.focus(); pinInp.value = messengerPin;\n" +
                    "          pinInp.dispatchEvent(new Event('input', { bubbles: true }));\n" +
                    "          window.__PIN_DONE__ = true;\n" +
                    "          setTimeout(() => {\n" +
                    "            const btn = document.querySelector('button[type=\"submit\"], [role=\"button\"][tabindex=\"0\"]');\n" +
                    "            if (btn) btn.click();\n" +
                    "          }, 500);\n" +
                    "        }\n" +
                    "      }\n" +
                    "      " +
                    "      if (now < targetTime) return;" +
                    "      " +
                    "      const currentNum = window.__SNIPER_STATE__ ? (window.__SNIPER_STATE__.lastNumber || 0) : 0;" +
                    "      let shouldFire = false;" +
                    "      " +
                    "      if (strategy !== 'wait') {" +
                    "        shouldFire = true;" +
                    "      } else if (currentNum + 1 >= targetPos || now >= targetTime + 60000) {" +
                    "        if (now >= targetTime + 60000 && (!window.__SNIPER_STATE__ || !window.__SNIPER_STATE__.fired)) {" +
                    "          window.AndroidSniper.log('Timeout (60s)!', 'warn');" +
                    "        }" +
                    "        shouldFire = true;" +
                    "      }" +
                    "      " +
                    "      if (shouldFire && window.__SNIPER_STATE__ && !window.__SNIPER_STATE__.fired) {" +
                    "        clearInterval(window.__SNIPER_TICKER__);" +
                    "        window.__SNIPER_FIRE__(strategy);" +
                    "      }" +
                    "    } catch(e) { console.error(e); }" +
                    "  }, 20);" +
                    "})();";

            sniperWebView.evaluateJavascript(script, null);
        });
    }


    /**
     * Fire the sniper — send the incremented number message.
     *
     * JS call: SniperWebView.fire({ strategy: 'dynamic' })
     */
    @PluginMethod()
    public void fire(PluginCall call) {
        String strategy = call.getString("strategy", "dynamic");

        mainHandler.post(() -> {
            if (sniperWebView == null) {
                call.reject("WebView not initialized");
                return;
            }

            String fireScript = "window.__SNIPER_FIRE__('" + strategy + "')";
            sniperWebView.evaluateJavascript(fireScript, value -> {
                Log.i(TAG, "Sniper fired: " + value);

                JSObject ret = new JSObject();
                ret.put("success", !"false".equals(value) && !"null".equals(value));
                ret.put("result", value);
                call.resolve(ret);
            });
        });
    }

    /**
     * Poll the sniper state from the injected script.
     *
     * JS call: SniperWebView.getSniperState()
     */
    @PluginMethod()
    public void getSniperState(PluginCall call) {
        mainHandler.post(() -> {
            if (sniperWebView == null) {
                call.reject("WebView not initialized");
                return;
            }

            sniperWebView.evaluateJavascript(
                "JSON.stringify(window.__SNIPER_STATE__ || {})",
                value -> {
                    JSObject ret = new JSObject();
                    ret.put("state", value);
                    call.resolve(ret);
                }
            );
        });
    }

    /**
     * Acquire a WakeLock to keep the CPU running.
     * Call this before starting background work.
     */
    @PluginMethod()
    public void acquireWakeLock(PluginCall call) {
        mainHandler.post(() -> {
            try {
                if (wakeLock != null && wakeLock.isHeld()) {
                    call.resolve();
                    return;
                }

                PowerManager powerManager = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
                wakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Sniper:BackgroundWakeLock");
                wakeLock.acquire(10 * 60 * 1000L); // 10 minutes max timeout

                Log.i(TAG, "WakeLock acquired");
                call.resolve();
            } catch (Exception e) {
                Log.e(TAG, "Failed to acquire WakeLock", e);
                call.reject("Failed to acquire WakeLock: " + e.getMessage());
            }
        });
    }

    @Override
    public void handleOnDestroy() {
        super.handleOnDestroy();
        stopForegroundService();
    }

    /**
     * Start the foreground service to keep app alive.
     */
    @PluginMethod()
    public void startForegroundService(PluginCall call) {
        mainHandler.post(() -> {
            try {
                Intent intent = new Intent(getContext(), SniperForegroundService.class);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    getContext().startForegroundService(intent);
                } else {
                    getContext().startService(intent);
                }
                call.resolve();
            } catch (Exception e) {
                call.reject("Failed to start foreground service: " + e.getMessage());
            }
        });
    }

    /**
     * Stop the foreground service.
     */
    @PluginMethod()
    public void stopForegroundService(PluginCall call) {
        mainHandler.post(() -> {
            stopForegroundService();
            if (call != null) call.resolve();
        });
    }

    private void stopForegroundService() {
        try {
            Intent intent = new Intent(getContext(), SniperForegroundService.class);
            intent.setAction("STOP");
            getContext().startService(intent);
        } catch (Exception e) {
            Log.e(TAG, "Failed to stop foreground service", e);
        }
    }

    /**
     * Release the current WakeLock.
     */
    @PluginMethod()
    public void releaseWakeLock(PluginCall call) {
        mainHandler.post(() -> {
            try {
                if (wakeLock != null && wakeLock.isHeld()) {
                    wakeLock.release();
                    Log.i(TAG, "WakeLock released");
                }
                wakeLock = null;
                call.resolve();
            } catch (Exception e) {
                Log.e(TAG, "Failed to release WakeLock", e);
                call.reject("Failed to release WakeLock: " + e.getMessage());
            }
        });
    }

    // ======================================================
    // PRIVATE — WebView creation and management
    // ======================================================

    /**
     * Create the native WebView as an overlay on top of Capacitor's WebView.
     */
    private void createWebView(String url, boolean visible) {
        Activity activity = getActivity();
        if (activity == null) {
            Log.e(TAG, "Activity is null");
            return;
        }

        // Destroy existing WebView if any
        if (sniperWebView != null) {
            destroyWebView();
        }

        sniperWebView = new WebView(activity);
        configureWebView(sniperWebView);

        // Create Container Layout for WebView + Close Button
        containerLayout = new FrameLayout(activity);
        containerLayout.setLayoutParams(new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ));

        // Add WebView to container
        containerLayout.addView(sniperWebView, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ));

        // Better Button Styling Utility
        android.graphics.drawable.GradientDrawable closeShape = new android.graphics.drawable.GradientDrawable();
        closeShape.setCornerRadius(30);
        closeShape.setColor(Color.parseColor("#FF5252")); // Soft red
        
        android.graphics.drawable.GradientDrawable setShape = new android.graphics.drawable.GradientDrawable();
        setShape.setCornerRadius(30);
        setShape.setColor(Color.parseColor("#4CAF50")); // Material green

        // Add Close Button (X)
        Button closeButton = new Button(activity);
        closeButton.setText("X");
        closeButton.setTextSize(18);
        closeButton.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        closeButton.setTextColor(Color.WHITE);
        closeButton.setBackground(closeShape);
        closeButton.setElevation(15);
        
        FrameLayout.LayoutParams btnParams = new FrameLayout.LayoutParams(150, 150);
        btnParams.gravity = Gravity.TOP | Gravity.RIGHT;
        btnParams.topMargin = 280; // Lowered to avoid header
        btnParams.rightMargin = 40;
        closeButton.setLayoutParams(btnParams);
        
        closeButton.setOnClickListener(v -> {
            mainHandler.post(() -> {
                if (containerLayout != null) {
                    containerLayout.setVisibility(View.INVISIBLE);
                }
                isWebViewVisible = false;
            });
        });

        // Add Set Chat Button (🎯)
        Button setChatButton = new Button(activity);
        setChatButton.setText("🎯 USTAW CZAT");
        setChatButton.setTextSize(12);
        setChatButton.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        setChatButton.setTextColor(Color.WHITE);
        setChatButton.setBackground(setShape);
        setChatButton.setElevation(15);
        
        FrameLayout.LayoutParams setParams = new FrameLayout.LayoutParams(450, 150);
        setParams.gravity = Gravity.TOP | Gravity.LEFT;
        setParams.topMargin = 280; // Lowered to avoid header
        setParams.leftMargin = 40;
        setChatButton.setLayoutParams(setParams);
        
        setChatButton.setOnClickListener(v -> {
            String currentChatUrl = sniperWebView.getUrl();
            JSObject event = new JSObject();
            event.put("event", "chatSelected");
            event.put("url", currentChatUrl);
            notifyListeners("webViewEvent", event);
            
            mainHandler.post(() -> {
                Toast.makeText(getContext(), "✅ Czat został ustawiony!", Toast.LENGTH_SHORT).show();
            });
        });

        containerLayout.addView(setChatButton);
        containerLayout.addView(closeButton);

        // Add container to the absolute root (DecorView)
        ViewGroup rootView = (ViewGroup) activity.getWindow().getDecorView();
        rootView.addView(containerLayout, new ViewGroup.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ));

        // Set visibility
        // CRITICAL: Use INVISIBLE (not GONE) for background sniping!
        // GONE removes the view from layout, which prevents DOM interactions
        // (focus, typing, clicking) from working in the WebView.
        // INVISIBLE keeps layout space and allows full JS/DOM interaction.
        containerLayout.setVisibility(visible ? View.VISIBLE : View.INVISIBLE);
        containerLayout.setBackgroundColor(Color.parseColor("#1c1c1c")); // Darker bg to match Messenger
        isWebViewVisible = visible;
        isPageLoaded = false;

        // Load URL
        sniperWebView.loadUrl(url);
        currentUrl = url;

        Log.i(TAG, "WebView created: " + url + " (visible: " + visible + ")");
    }

    /**
     * Configure WebView settings for Messenger compatibility.
     */
    private void configureWebView(WebView webView) {
        WebSettings settings = webView.getSettings();

        // Essential for Messenger
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);

        // Cookie support
        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            cookieManager.setAcceptThirdPartyCookies(webView, true);
        }

        // Modern web support
        settings.setJavaScriptCanOpenWindowsAutomatically(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);

        // User-agent: Use DESKTOP Chrome UA so Messenger serves web version
        // instead of redirecting to app install page
        settings.setUserAgentString(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
            "AppleWebKit/537.36 (KHTML, like Gecko) " +
            "Chrome/125.0.0.0 Safari/537.36"
        );

        // Mixed content (some Messenger assets load over HTTP)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        }

        // Cache
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);

        // WebView client — intercept page load events
        webView.setWebViewClient(new SniperWebViewClient());

        // Chrome client — handle JS dialogs, progress
        webView.setWebChromeClient(new SniperChromeClient());

        // Add JS interface for native communication
        webView.addJavascriptInterface(new SniperJSInterface(), "AndroidSniper");

        // Background color
        webView.setBackgroundColor(0xFF000000);
    }

    /**
     * Destroy and remove the WebView.
     */
    private void destroyWebView() {
        if (sniperWebView == null) return;

        Activity activity = getActivity();
        if (activity != null && containerLayout != null) {
            ViewGroup rootView = (ViewGroup) activity.getWindow().getDecorView()
                .findViewById(android.R.id.content);
            rootView.removeView(containerLayout);
        }
        containerLayout = null;

        sniperWebView.stopLoading();
        sniperWebView.clearHistory();
        sniperWebView.removeAllViews();
        sniperWebView.destroy();
        sniperWebView = null;
        isWebViewVisible = false;
        isPageLoaded = false;
        currentUrl = "";

        Log.i(TAG, "WebView destroyed");
    }

    // ======================================================
    // INNER CLASSES
    // ======================================================

    /**
     * WebViewClient — monitors page loading events and detects login state.
     */
    private class SniperWebViewClient extends WebViewClient {

        @Override
        public void onPageStarted(WebView view, String url, Bitmap favicon) {
            super.onPageStarted(view, url, favicon);
            isPageLoaded = false;
            currentUrl = url;

            // Notify JS layer
            JSObject data = new JSObject();
            data.put("event", "pageStarted");
            data.put("url", url);
            notifyListeners("webViewEvent", data);

            Log.d(TAG, "Page started: " + url);
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            super.onPageFinished(view, url);
            isPageLoaded = true;
            currentUrl = url;

            // Persist cookies after page load
            CookieManager.getInstance().flush();

            // Check if user is logged in
            CookieManager cm = CookieManager.getInstance();
            String cookies = cm.getCookie(url);
            boolean loggedIn = cookies != null && cookies.contains("c_user");

            Log.d(TAG, "Page finished: " + url + " (loggedIn: " + loggedIn + ")");

            // Notify JS layer
            JSObject data = new JSObject();
            data.put("event", "pageFinished");
            data.put("url", url);
            data.put("loggedIn", loggedIn);
            notifyListeners("webViewEvent", data);

            if (isAutoSnipeActive && loggedIn && url.contains("/t/")) {
                isAutoSnipeActive = false; // <-- Zabezpieczenie przed wielokrotnym onPageFinished
                Log.i(TAG, "Auto-snipe active, waiting 5s for Messenger React hydration...");
                logNative("Strona załadowana, czekam 5s na React...", "info");
                // Delay injection by 5 seconds to let Messenger's React app hydrate.
                // onPageFinished fires when HTML is loaded, but React needs more time
                // to mount components and make the input field interactive.
                mainHandler.postDelayed(() -> {
                    Log.i(TAG, "Injecting sniper after hydration delay");
                    logNative("React gotowy, wstrzykuję snajpera!", "success");
                    injectSniperInternal(autoTargetTime, autoStrategy, autoMessengerPin);
                }, 5000);
            }
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            String url = request.getUrl().toString();

            // Stay within Messenger/Facebook domains
            if (url.contains("messenger.com") ||
                url.contains("facebook.com") ||
                url.contains("fbcdn.net") ||
                url.contains("fb.com")) {
                return false; // Let WebView handle it
            }

            // Block external navigation
            Log.w(TAG, "Blocked external navigation: " + url);
            return true;
        }
    }

    /**
     * WebChromeClient — handles JS console, progress, etc.
     */
    private class SniperChromeClient extends WebChromeClient {

        @Override
        public void onProgressChanged(WebView view, int newProgress) {
            super.onProgressChanged(view, newProgress);

            if (newProgress % 25 == 0) { // Notify at 25%, 50%, 75%, 100%
                JSObject data = new JSObject();
                data.put("event", "progress");
                data.put("progress", newProgress);
                notifyListeners("webViewEvent", data);
            }
        }

        @Override
        public void onReceivedTitle(WebView view, String title) {
            super.onReceivedTitle(view, title);
            JSObject data = new JSObject();
            data.put("event", "titleChanged");
            data.put("title", title);
            notifyListeners("webViewEvent", data);
        }
    }

    /**
     * JavaScript Interface — allows the injected sniper script to call native code.
     * Accessible in WebView JS as: window.AndroidSniper.methodName()
     */
    private class SniperJSInterface {

        /**
         * Called by the injected script when a new number is detected.
         */
        @JavascriptInterface
        public void onNumberDetected(int number) {
            Log.i(TAG, "Number detected in chat: " + number);

            JSObject data = new JSObject();
            data.put("event", "numberDetected");
            data.put("number", number);
            notifyListeners("sniperEvent", data);
        }

        /**
         * Called by the injected script when a message is sent.
         */
        @JavascriptInterface
        public void onMessageSent(String message, double elapsedMs) {
            Log.i(TAG, "Message sent: " + message + " in " + elapsedMs + "ms");

            JSObject data = new JSObject();
            data.put("event", "messageSent");
            data.put("message", message);
            data.put("elapsedMs", elapsedMs);
            notifyListeners("sniperEvent", data);

            // Auto-release WakeLock and stop ForegroundService after successful fire
            mainHandler.postDelayed(() -> {
                Log.i(TAG, "Auto-releasing WakeLock and stopping ForegroundService after fire");
                clearKeepScreenOn();
                try {
                    if (wakeLock != null && wakeLock.isHeld()) {
                        wakeLock.release();
                        wakeLock = null;
                        Log.i(TAG, "WakeLock released after fire");
                    }
                } catch (Exception e) {
                    Log.e(TAG, "Error releasing WakeLock after fire", e);
                }
                stopForegroundService();
            }, 5000); // 5s delay to ensure message delivery completes
        }

        /**
         * Paste text into the currently focused WebView element using the
         * Android system clipboard + Ctrl+V simulation.
         *
         * This is the nuclear option: we put text on the REAL system clipboard,
         * then simulate Ctrl+V which the WebView processes as a genuine paste.
         * This generates a fully trusted ClipboardEvent that Lexical CANNOT reject.
         *
         * Called from JS as: window.AndroidSniper.pasteText("+1")
         * Returns true if paste was dispatched successfully.
         */
        @JavascriptInterface
        public boolean pasteText(final String text) {
            if (text == null || text.isEmpty()) return false;
            Log.i(TAG, "Native pasteText called: \"" + text + "\"");

            final boolean[] result = {false};
            final java.util.concurrent.CountDownLatch latch = new java.util.concurrent.CountDownLatch(1);

            mainHandler.post(() -> {
                try {
                    if (sniperWebView == null) {
                        Log.e(TAG, "pasteText: WebView is null");
                        latch.countDown();
                        return;
                    }

                    // Ensure WebView has native Android focus
                    sniperWebView.requestFocus();

                    // STEP 1: Put text on the REAL Android system clipboard
                    android.content.ClipboardManager clipboard =
                        (android.content.ClipboardManager) getContext().getSystemService(Context.CLIPBOARD_SERVICE);
                    android.content.ClipData clip = android.content.ClipData.newPlainText("sniper_msg", text);
                    clipboard.setPrimaryClip(clip);
                    Log.i(TAG, "pasteText: clipboard set to \"" + text + "\"");

                    // STEP 2: Try InputConnection paste first (most reliable)
                    android.view.inputmethod.EditorInfo editorInfo = new android.view.inputmethod.EditorInfo();
                    android.view.inputmethod.InputConnection ic = sniperWebView.onCreateInputConnection(editorInfo);
                    if (ic != null) {
                        boolean pasted = ic.performContextMenuAction(android.R.id.paste);
                        Log.i(TAG, "pasteText: IC.performContextMenuAction(paste) = " + pasted);
                        if (pasted) {
                            result[0] = true;
                            latch.countDown();
                            return;
                        }
                    }

                    // STEP 3: Simulate Ctrl+V key combination
                    // This is what happens when user presses Ctrl+V on a hardware keyboard
                    long time = android.os.SystemClock.uptimeMillis();
                    int metaState = android.view.KeyEvent.META_CTRL_LEFT_ON | android.view.KeyEvent.META_CTRL_ON;

                    android.view.KeyEvent ctrlVDown = new android.view.KeyEvent(
                        time, time,
                        android.view.KeyEvent.ACTION_DOWN,
                        android.view.KeyEvent.KEYCODE_V,
                        0, metaState
                    );
                    android.view.KeyEvent ctrlVUp = new android.view.KeyEvent(
                        time, time,
                        android.view.KeyEvent.ACTION_UP,
                        android.view.KeyEvent.KEYCODE_V,
                        0, metaState
                    );

                    sniperWebView.dispatchKeyEvent(ctrlVDown);
                    sniperWebView.dispatchKeyEvent(ctrlVUp);
                    Log.i(TAG, "pasteText: Ctrl+V dispatched");

                    result[0] = true;
                } catch (Exception e) {
                    Log.e(TAG, "pasteText failed", e);
                }
                latch.countDown();
            });

            try {
                latch.await(5, java.util.concurrent.TimeUnit.SECONDS);
            } catch (InterruptedException e) {
                Log.e(TAG, "pasteText: interrupted", e);
            }
            return result[0];
        }

        /**
         * Type text into the currently focused WebView element using Android's
         * native InputConnection. This is exactly how the soft keyboard types
         * text into WebView contenteditable elements.
         *
         * Strategy:
         * 1. requestFocus() on WebView to ensure native Android focus
         * 2. Get the REAL InputConnection via WebView.onCreateInputConnection()
         * 3. Use commitText() — the same API the Android keyboard uses
         * 4. Fallback to dispatchKeyEvent per-character if IC is null
         *
         * Called from JS as: window.AndroidSniper.typeText("+1")
         * Returns true if text was dispatched successfully.
         */
        @JavascriptInterface
        public boolean typeText(final String text) {
            if (text == null || text.isEmpty()) return false;
            Log.i(TAG, "Native typeText called: \"" + text + "\"");

            final boolean[] result = {false};
            final java.util.concurrent.CountDownLatch latch = new java.util.concurrent.CountDownLatch(1);

            mainHandler.post(() -> {
                try {
                    if (sniperWebView == null) {
                        Log.e(TAG, "typeText: WebView is null");
                        latch.countDown();
                        return;
                    }

                    // CRITICAL: Ensure WebView has native Android focus.
                    // Without this, InputConnection won't target the contenteditable.
                    sniperWebView.requestFocus();

                    // Strategy 1: Use the WebView's REAL InputConnection
                    // This is how the Android soft keyboard actually types into WebViews.
                    android.view.inputmethod.EditorInfo editorInfo = new android.view.inputmethod.EditorInfo();
                    android.view.inputmethod.InputConnection ic = sniperWebView.onCreateInputConnection(editorInfo);

                    if (ic != null) {
                        // commitText is the standard IME method — generates trusted input
                        boolean committed = ic.commitText(text, 1);
                        Log.i(TAG, "typeText: commitText(\"" + text + "\") = " + committed);

                        if (committed) {
                            result[0] = true;
                            latch.countDown();
                            return;
                        }
                        Log.w(TAG, "typeText: commitText returned false, trying sendKeyEvent fallback");
                    } else {
                        Log.w(TAG, "typeText: InputConnection is null (no focused editable?)");
                    }

                    // Strategy 2: Send key events through InputConnection
                    // (different from dispatchKeyEvent — goes through IME pipeline)
                    if (ic != null) {
                        for (int i = 0; i < text.length(); i++) {
                            char c = text.charAt(i);
                            long time = android.os.SystemClock.uptimeMillis();
                            // Create KeyEvent with the unicode character embedded
                            android.view.KeyEvent downEvent = new android.view.KeyEvent(
                                time, time, android.view.KeyEvent.ACTION_DOWN, 0, 0,
                                0, 0, 0, 0
                            );
                            // Use the character-based constructor for proper unicode support
                            android.view.KeyEvent charEvent = new android.view.KeyEvent(
                                time, String.valueOf(c), 0, 0
                            );
                            ic.sendKeyEvent(charEvent);
                        }
                        result[0] = true;
                        Log.i(TAG, "typeText: sendKeyEvent fallback dispatched " + text.length() + " chars");
                        latch.countDown();
                        return;
                    }

                    // Strategy 3: Last resort — dispatchKeyEvent on WebView directly
                    Log.w(TAG, "typeText: No InputConnection, using dispatchKeyEvent fallback");
                    for (int i = 0; i < text.length(); i++) {
                        char c = text.charAt(i);
                        long time = android.os.SystemClock.uptimeMillis();
                        int keyCode = charToKeyCode(c);
                        if (keyCode != 0) {
                            sniperWebView.dispatchKeyEvent(new android.view.KeyEvent(
                                time, time, android.view.KeyEvent.ACTION_DOWN, keyCode, 0));
                            sniperWebView.dispatchKeyEvent(new android.view.KeyEvent(
                                time, time, android.view.KeyEvent.ACTION_UP, keyCode, 0));
                        } else {
                            // For unmapped chars, use BaseInputConnection
                            android.view.inputmethod.BaseInputConnection bic =
                                new android.view.inputmethod.BaseInputConnection(sniperWebView, true);
                            bic.commitText(String.valueOf(c), 1);
                        }
                    }
                    result[0] = true;
                    Log.i(TAG, "typeText: dispatchKeyEvent fallback done");

                } catch (Exception e) {
                    Log.e(TAG, "typeText failed", e);
                }
                latch.countDown();
            });

            try {
                latch.await(5, java.util.concurrent.TimeUnit.SECONDS);
            } catch (InterruptedException e) {
                Log.e(TAG, "typeText: interrupted", e);
            }
            return result[0];
        }

        /**
         * Press Enter in the WebView using the native InputConnection.
         * Used to submit messages after typing.
         */
        @JavascriptInterface
        public boolean pressEnter() {
            Log.i(TAG, "Native pressEnter called");
            final boolean[] result = {false};
            final java.util.concurrent.CountDownLatch latch = new java.util.concurrent.CountDownLatch(1);

            mainHandler.post(() -> {
                try {
                    if (sniperWebView == null) {
                        latch.countDown();
                        return;
                    }

                    sniperWebView.requestFocus();
                    long time = android.os.SystemClock.uptimeMillis();

                    // Try InputConnection first
                    android.view.inputmethod.EditorInfo editorInfo = new android.view.inputmethod.EditorInfo();
                    android.view.inputmethod.InputConnection ic = sniperWebView.onCreateInputConnection(editorInfo);

                    android.view.KeyEvent downEvent = new android.view.KeyEvent(
                        time, time, android.view.KeyEvent.ACTION_DOWN,
                        android.view.KeyEvent.KEYCODE_ENTER, 0
                    );
                    android.view.KeyEvent upEvent = new android.view.KeyEvent(
                        time, time, android.view.KeyEvent.ACTION_UP,
                        android.view.KeyEvent.KEYCODE_ENTER, 0
                    );

                    if (ic != null) {
                        ic.sendKeyEvent(downEvent);
                        ic.sendKeyEvent(upEvent);
                        Log.i(TAG, "pressEnter: sent via InputConnection");
                    } else {
                        sniperWebView.dispatchKeyEvent(downEvent);
                        sniperWebView.dispatchKeyEvent(upEvent);
                        Log.i(TAG, "pressEnter: sent via dispatchKeyEvent");
                    }
                    result[0] = true;
                } catch (Exception e) {
                    Log.e(TAG, "pressEnter failed", e);
                }
                latch.countDown();
            });

            try {
                latch.await(3, java.util.concurrent.TimeUnit.SECONDS);
            } catch (InterruptedException e) {
                Log.e(TAG, "pressEnter: interrupted", e);
            }
            return result[0];
        }

        /**
         * Map a character to an Android KeyEvent keycode.
         * Returns 0 for characters that need InputConnection instead.
         */
        private int charToKeyCode(char c) {
            if (c >= '0' && c <= '9') {
                return android.view.KeyEvent.KEYCODE_0 + (c - '0');
            }
            if (c >= 'a' && c <= 'z') {
                return android.view.KeyEvent.KEYCODE_A + (c - 'a');
            }
            if (c >= 'A' && c <= 'Z') {
                return android.view.KeyEvent.KEYCODE_A + (c - 'A');
            }
            switch (c) {
                case ' ': return android.view.KeyEvent.KEYCODE_SPACE;
                case '+': return android.view.KeyEvent.KEYCODE_PLUS;
                case '-': return android.view.KeyEvent.KEYCODE_MINUS;
                case '.': return android.view.KeyEvent.KEYCODE_PERIOD;
                case ',': return android.view.KeyEvent.KEYCODE_COMMA;
                default: return 0;
            }
        }

        /**
         * Called for log messages from the injected script.
         */
        @JavascriptInterface
        public void log(String message, String level) {
            Log.d(TAG, "[JS] " + message);

            JSObject data = new JSObject();
            data.put("event", "log");
            data.put("message", message);
            data.put("level", level != null ? level : "info");
            notifyListeners("sniperEvent", data);
        }

        /**
         * Get current timestamp in ms (for precise timing).
         */
        @JavascriptInterface
        public long getTimestamp() {
            return System.currentTimeMillis();
        }
    }

    // ======================================================
    // HELPER METHODS
    // ======================================================

    private void clearKeepScreenOn() {
        androidx.appcompat.app.AppCompatActivity activity = getActivity();
        if (activity != null) {
            activity.runOnUiThread(() -> {
                activity.getWindow().clearFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                Log.i(TAG, "Cleared FLAG_KEEP_SCREEN_ON");
            });
        }
    }

    // ======================================================
    // SNIPER SCRIPT — The JS code injected into Messenger
    // ======================================================

    /**
     * Returns the JavaScript code to inject into the Messenger WebView.
     * This script monitors chat messages and provides fire() functionality.
     * Enhanced version that uses AndroidSniper bridge for native communication.
     */
    private String getSniperMonitorScript() {
        return loadJsFromAsset("sniper_injection.js");
    }

    /**
     * Helper to load JavaScript files from the assets folder.
     */
    private String loadJsFromAsset(String filename) {
        try {
            java.io.InputStream is = getContext().getAssets().open(filename);
            int size = is.available();
            byte[] buffer = new byte[size];
            is.read(buffer);
            is.close();
            return new String(buffer, "UTF-8");
        } catch (java.io.IOException e) {
            Log.e(TAG, "Failed to load JS from asset: " + filename, e);
            return "";
        }
    }
}
