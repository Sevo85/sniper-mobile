/**
 * AlarmService — Manages scheduling and wake-up logic.
 *
 * On Android (Capacitor): Uses LocalNotifications to wake the app.
 * In Browser (dev): Uses setTimeout as fallback.
 */

class AlarmService {
  constructor() {
    this.alarmId = null;
    this.timeoutId = null;
    this.isCapacitor = typeof window !== 'undefined' &&
      window.Capacitor !== undefined &&
      window.Capacitor.isNativePlatform &&
      window.Capacitor.isNativePlatform();
    this.onAlarmCallback = null;
    this.scheduledTime = null;
  }

  /**
   * Get the LocalNotifications plugin from Capacitor's registry
   */
  _getLocalNotifications() {
    if (!this.isCapacitor) return null;
    try {
      return window.Capacitor.Plugins?.LocalNotifications || null;
    } catch {
      return null;
    }
  }

  /**
   * Schedule an alarm to fire at a specific time.
   * The alarm fires 1 minute before the target to give the app time to load WebView.
   *
   * @param {Date} targetTime - The exact time when the sniper should fire
   * @param {Function} onAlarm - Callback when alarm triggers
   */
  async schedule(targetTime, onAlarm) {
    this.cancel(); // Cancel any existing alarm

    this.onAlarmCallback = onAlarm;
    this.scheduledTime = new Date(targetTime);

    // Calculate alarm time: 3 minutes before target (matches native alarm)
    const alarmTime = new Date(targetTime.getTime() - 3 * 60 * 1000);
    const now = Date.now();
    const delay = alarmTime.getTime() - now;

    if (delay <= 0) {
      // If alarm time already passed but target hasn't, fire immediately
      if (targetTime.getTime() > now) {
        this._log(`[AlarmService] Cel za ${(targetTime.getTime() - now) / 1000}s. Startuję natychmiast!`, 'warn');
        if (this.onAlarmCallback) this.onAlarmCallback();
        return;
      }
      this._log(`[AlarmService] BŁĄD: Cel (${targetTime.toLocaleTimeString()}) już minął!`, 'error');
      return;
    }

    const plugin = this._getLocalNotifications();
    if (plugin) {
      await this._scheduleCapacitor(plugin, alarmTime, targetTime);
    } else {
      this._scheduleBrowser(delay);
    }
    
    this._log(`[AlarmService] Alarm scheduled for ${alarmTime.toLocaleTimeString()} (3 min before target)`);
  }

  /**
   * Schedule using Capacitor LocalNotifications (Android native)
   */
  async _scheduleCapacitor(plugin, alarmTime, targetTime) {
    try {
      // Request permission
      const permResult = await plugin.requestPermissions();
      if (permResult.display !== 'granted') {
        this._log('[AlarmService] Notification permission denied, falling back to timer', 'warn');
        this._scheduleBrowser(alarmTime.getTime() - Date.now());
        return;
      }

      this.alarmId = Math.floor(Math.random() * 100000);

      await plugin.schedule({
        notifications: [{
          id: this.alarmId,
          title: '🎯 Sniper Activating',
          body: `Target time: ${targetTime.toLocaleTimeString()}. Preparing WebView...`,
          schedule: { at: alarmTime, allowWhileIdle: true },
          sound: 'default',
          channelId: 'sniper-alarm',
          extra: { type: 'sniper-wake' },
        }],
      });

      // Listen for notification received
      plugin.addListener('localNotificationReceived', (notification) => {
        if (notification.extra?.type === 'sniper-wake' && this.onAlarmCallback) {
          this.onAlarmCallback();
        }
      });

    } catch (err) {
      this._log(`[AlarmService] Capacitor scheduling failed: ${err.message}`, 'error');
      this._scheduleBrowser(alarmTime.getTime() - Date.now());
    }
  }

  /**
   * Schedule using browser setTimeout (dev mode)
   */
  _scheduleBrowser(delay) {
    this.timeoutId = setTimeout(() => {
      this._log('[AlarmService] Browser alarm triggered');
      if (this.onAlarmCallback) {
        this.onAlarmCallback();
      }
    }, delay);
  }

  /**
   * Cancel the current alarm
   */
  async cancel() {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }

    if (this.isCapacitor && this.alarmId !== null) {
      try {
        const plugin = this._getLocalNotifications();
        if (plugin) {
          await plugin.cancel({ notifications: [{ id: this.alarmId }] });
        }
      } catch (err) {
        this._log(`[AlarmService] Failed to cancel Capacitor alarm: ${err.message}`, 'warn');
      }
    }

    this.alarmId = null;
    this.scheduledTime = null;
    this.onAlarmCallback = null;
    this._log('[AlarmService] Alarm cancelled');
  }

  _log(msg, level = 'info') {
    console.log(msg);
    if (this.onLog) this.onLog(msg, level);
  }

  /**
   * Get the scheduled time
   */
  getScheduledTime() {
    return this.scheduledTime;
  }

  /**
   * Check if there's an active alarm
   */
  isActive() {
    return this.timeoutId !== null || this.alarmId !== null;
  }
}

// Singleton
const alarmService = new AlarmService();
export default alarmService;
export { AlarmService };
