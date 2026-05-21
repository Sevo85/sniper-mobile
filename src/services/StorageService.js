/**
 * StorageService — Persistent local storage for configuration and session data.
 *
 * On Android (Capacitor): Uses Capacitor Preferences API (encrypted local storage)
 * In Browser (dev): Uses localStorage as fallback
 */

const STORAGE_KEYS = {
  CONFIG: 'sniper_config',
  SESSION: 'sniper_session',
  LOGS: 'sniper_logs',
  SCHEDULES: 'sniper_schedules',
};

class StorageService {
  constructor() {
    this.isCapacitor = typeof window !== 'undefined' &&
      window.Capacitor !== undefined &&
      window.Capacitor.isNativePlatform &&
      window.Capacitor.isNativePlatform();
    this._preferencesPlugin = null;
  }

  /**
   * Lazy-load Capacitor Preferences plugin (only on native)
   */
  async _getPreferences() {
    if (!this.isCapacitor) return null;
    if (this._preferencesPlugin) return this._preferencesPlugin;

    try {
      // Use Capacitor's plugin registry instead of direct import
      const { Capacitor } = window;
      const plugin = Capacitor.Plugins?.Preferences;
      if (plugin) {
        this._preferencesPlugin = plugin;
        return plugin;
      }
    } catch {
      // Fall through to localStorage
    }

    console.warn('[StorageService] Capacitor Preferences not available, using localStorage');
    return null;
  }

  /**
   * Save data to storage
   */
  async set(key, value) {
    const serialized = JSON.stringify(value);

    const prefs = await this._getPreferences();
    if (prefs) {
      await prefs.set({ key, value: serialized });
    } else {
      localStorage.setItem(key, serialized);
    }
  }

  /**
   * Load data from storage
   */
  async get(key, defaultValue = null) {
    try {
      const prefs = await this._getPreferences();
      let raw;

      if (prefs) {
        const result = await prefs.get({ key });
        raw = result.value;
      } else {
        raw = localStorage.getItem(key);
      }

      if (raw === null || raw === undefined) return defaultValue;
      return JSON.parse(raw);
    } catch (err) {
      console.warn(`[StorageService] Failed to read key "${key}":`, err);
      return defaultValue;
    }
  }

  /**
   * Remove a key from storage
   */
  async remove(key) {
    const prefs = await this._getPreferences();
    if (prefs) {
      await prefs.remove({ key });
    } else {
      localStorage.removeItem(key);
    }
  }

  // --- Convenience methods ---

  /**
   * Save sniper configuration
   */
  async saveConfig(config) {
    await this.set(STORAGE_KEYS.CONFIG, {
      chatUrl: config.chatUrl || '',
      strategy: config.strategy || 'dynamic',
      targetTime: config.targetTime ? new Date(config.targetTime).toISOString() : null,
      lastUpdated: new Date().toISOString(),
    });
  }

  /**
   * Load sniper configuration
   */
  async loadConfig() {
    return await this.get(STORAGE_KEYS.CONFIG, {
      chatUrl: '',
      strategy: 'dynamic',
      targetTime: null,
    });
  }

  /**
   * Save session data (indicates user is logged in)
   */
  async saveSession(sessionData) {
    await this.set(STORAGE_KEYS.SESSION, {
      loggedIn: true,
      loginTime: new Date().toISOString(),
      ...sessionData,
    });
  }

  /**
   * Load session data
   */
  async loadSession() {
    return await this.get(STORAGE_KEYS.SESSION, { loggedIn: false });
  }

  /**
   * Clear session (logout)
   */
  async clearSession() {
    await this.remove(STORAGE_KEYS.SESSION);
  }

  /**
   * Check if user is logged in
   */
  async isLoggedIn() {
    const session = await this.loadSession();
    return session?.loggedIn === true;
  }

  /**
   * Save recurring schedules
   */
  async saveSchedules(schedules) {
    await this.set(STORAGE_KEYS.SCHEDULES, schedules);
  }

  /**
   * Load recurring schedules
   */
  async loadSchedules() {
    return await this.get(STORAGE_KEYS.SCHEDULES, []);
  }
}

// Singleton
const storageService = new StorageService();
export default storageService;
export { StorageService, STORAGE_KEYS };
