import { useState, useEffect, useCallback, useRef } from 'react';
import './index.css';

// Components
import StatusIndicator from './components/StatusIndicator';
import CountdownTimer from './components/CountdownTimer';
import LiveLogs from './components/LiveLogs';
import ConfigScreen from './components/ConfigScreen';
import ScheduleScreen, { getNextOccurrence } from './components/ScheduleScreen';

// Services
import sniperService, { SniperService } from './services/SniperService';
import alarmService from './services/AlarmService';
import storageService from './services/StorageService';
import webViewBridge from './services/SniperWebViewBridge';

const TABS = {
  DASHBOARD: 'dashboard',
  CONFIG: 'config',
  SCHEDULE: 'schedule',
};

const PermissionBanner = ({ permissions, onRequest }) => {
  if (permissions.exactAlarm && permissions.batteryExempt && permissions.drawOverlays !== false) return null;

  return (
    <div style={{
      background: 'rgba(255, 71, 87, 0.2)',
      border: '1px solid #ff4757',
      borderRadius: '8px',
      padding: '12px',
      margin: '0 16px 16px 16px',
      display: 'flex',
      flexDirection: 'column',
      gap: '8px'
    }}>
      <div style={{ color: '#ff4757', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span>⚠️ Brak uprawnień do pracy w tle!</span>
      </div>
      <p style={{ fontSize: '13px', margin: 0, color: '#eee' }}>
        Android blokuje alarmy w tle. Musisz zezwolić na "Dokładne alarmy", wyłączyć optymalizację baterii i zezwolić na "Wyświetlanie nad innymi aplikacjami".
      </p>
      <button 
        onClick={onRequest}
        style={{
          background: '#ff4757',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          padding: '6px 12px',
          fontWeight: 'bold',
          cursor: 'pointer'
        }}
      >
        NAPRAW TO W USTAWIENIACH
      </button>
    </div>
  );
};

function App() {
  // --- State ---
  const [activeTab, setActiveTab] = useState(TABS.DASHBOARD);

  const addLog = useCallback((text, level = 'info') => {
    sniperService._log(text, level);
  }, []);
  const [status, setStatus] = useState('idle');
  const [logs, setLogs] = useState([]);
  const [config, setConfig] = useState({
    chatUrl: '',
    targetTime: null,
    strategy: 'dynamic',
    messengerPin: '',
  });
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [schedules, setSchedules] = useState([]);
  const [activeSchedule, setActiveSchedule] = useState(null);
  const [permissions, setPermissions] = useState({ exactAlarm: true, batteryExempt: true });
  const scheduleTimerRef = useRef(null);

  // --- Load saved config + schedules on mount ---
  useEffect(() => {
    const loadSaved = async () => {
      const savedConfig = await storageService.loadConfig();
      if (savedConfig) {
        setConfig(savedConfig);
        sniperService.configure(savedConfig);
      }
      const loggedIn = await storageService.isLoggedIn();
      setIsLoggedIn(loggedIn);

      const savedSchedules = await storageService.loadSchedules();
      if (savedSchedules && savedSchedules.length > 0) {
        // Recalculate nextRun for all enabled schedules
        const updated = savedSchedules.map(s => {
          if (s.enabled) {
            const [h, m] = s.time.split(':').map(Number);
            return { ...s, nextRun: getNextOccurrence(s.dayOfWeek, h, m).toISOString() };
          }
          return s;
        });
        setSchedules(updated);
      }
    };
    
    // Connect alarm service to UI logs
    alarmService.onLog = (msg, level) => addLog(msg, level);
    
    const checkPerms = async () => {
      if (webViewBridge.isNative) {
        const p = await webViewBridge.checkPermissions();
        setPermissions(p);
      }
    };
    
    loadSaved();
    checkPerms();

    // Check permissions again when app resumes
    document.addEventListener('resume', checkPerms);
    return () => document.removeEventListener('resume', checkPerms);
  }, [addLog]);

  // --- Subscribe to sniper service state changes ---
  useEffect(() => {
    const unsubscribe = sniperService.subscribe((state) => {
      setStatus(state.status);
      setLogs(state.logs);
    });
    return unsubscribe;
  }, []);

  // --- Listen for native sniper events (debug logs from WebView) ---
  useEffect(() => {
    if (!webViewBridge.isNative) return;
    
    const unsubscribe = webViewBridge.onSniperEvent((event) => {
      if (event.event === 'log' && event.message) {
        // Tag these as [DEBUG] with a magnifying glass icon
        addLog(`🔍 ${event.message}`, 'info');
      }
      if (event.event === 'numberDetected') {
        addLog(`👀 Wykryto liczbę: ${event.number}`, 'info');
      }
      if (event.event === 'messageSent') {
        addLog(`🚀 Wysłano: ${event.message}`, 'success');
        sniperService.setStatus('success'); // Auto-disarm
      }
      if (event.event === 'error') {
        addLog(`❌ Błąd natywny: ${event.message}`, 'error');
        sniperService.setStatus('error'); // Auto-disarm on error
      }
    });
    
    return unsubscribe;
  }, [addLog]);

  // --- Schedule auto-arm logic ---
  useEffect(() => {
    // Find the nearest enabled schedule
    const enabledSchedules = schedules.filter(s => s.enabled);
    if (enabledSchedules.length === 0) {
      setActiveSchedule(null);
      return;
    }

    const now = new Date();
    let nearest = null;
    let nearestTime = Infinity;

    for (const schedule of enabledSchedules) {
      const nextRun = new Date(schedule.nextRun);
      const diff = nextRun - now;
      if (diff > 0 && diff < nearestTime) {
        nearestTime = diff;
        nearest = schedule;
      }
    }

    if (nearest) {
      setActiveSchedule(nearest);

      // Auto-arm: schedule the alarm for this occurrence
      const nextRunDate = new Date(nearest.nextRun);

      // Clear any previous schedule timer
      if (scheduleTimerRef.current) {
        clearTimeout(scheduleTimerRef.current);
      }

      // Check if we need to arm or re-arm (e.g. if nearest schedule changed)
      const isCurrentlyArmedForThis = status === 'armed' && config.targetTime === nearest.nextRun;

      if (!isCurrentlyArmedForThis && (status === 'idle' || status === 'success' || status === 'error' || status === 'armed')) {
        // Set targetTime in config for countdown display
        setConfig(prev => ({ ...prev, targetTime: nearest.nextRun }));

        sniperService.setStatus('armed');
        addLog(`📅 Harmonogram: ${getDayLabel(nearest.dayOfWeek)} o ${nearest.time}`, 'success');
        addLog(`⏰ Następne uruchomienie: ${nextRunDate.toLocaleString('pl-PL')}`, 'info');

        // Set native system alarm (Tryb Pancerny)
        webViewBridge.scheduleNativeAlarm({
          targetTime: nextRunDate,
          chatUrl: nearest.chatUrl,
          strategy: nearest.strategy,
          messengerPin: config.messengerPin
        }).catch(err => addLog(`Błąd alarmu natywnego: ${err.message}`, 'error'));

        // Set JS alarm ONLY for UI logging and schedule rotation.
        // The NATIVE alarm (AlarmReceiver → ForegroundService → triggerWorkflowNative)
        // handles the actual WebView workflow. This prevents dual-workflow race conditions.
        alarmService.schedule(nextRunDate, async () => {
            addLog('⏰ Alarm z harmonogramu! Natywny workflow powinien już działać.', 'warn');

            // After some time, update the schedule's nextRun to next occurrence
            setTimeout(() => {
              setSchedules(prev => {
                const updated = prev.map(s => {
                  if (s.id === nearest.id && s.enabled) {
                    const [h, m] = s.time.split(':').map(Number);
                    return { ...s, nextRun: getNextOccurrence(s.dayOfWeek, h, m).toISOString() };
                  }
                  return s;
                });
                storageService.saveSchedules(updated);
                return updated;
              });
              sniperService.setStatus('idle');
            }, 120000); // 2 minutes — enough for the native workflow to complete
          });
        }
    } else {
      setActiveSchedule(null);
      setConfig(prev => ({ ...prev, targetTime: null }));
      if (status === 'armed') {
          sniperService.setStatus('idle');
          webViewBridge.cancelNativeAlarm();
      }
    }
  }, [schedules, status]); // Re-run when schedules or status change

  const DAYS_LABELS = ['Niedziela', 'Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota'];
  const getDayLabel = (dayValue) => DAYS_LABELS[dayValue] || '';



  const handleConfigChange = useCallback(async (newConfig) => {
    setConfig(newConfig);
    sniperService.configure(newConfig);
    await storageService.saveConfig(newConfig);
    addLog('Konfiguracja zapisana', 'success');
  }, [addLog]);

  const handleSchedulesChange = useCallback(async (newSchedules) => {
    setSchedules(newSchedules);
    await storageService.saveSchedules(newSchedules);
    addLog(`📅 Harmonogram zaktualizowany (${newSchedules.filter(s => s.enabled).length} aktywnych)`, 'success');
  }, [addLog]);

  const handleArm = useCallback(async () => {
    const success = sniperService.arm();
    if (!success) return;

    // Use latest values from sniperService to avoid stale closures
    const targetTime = sniperService.targetTime;
    const currentChatUrl = sniperService.chatUrl;
    const currentStrategy = sniperService.strategy;

    // Schedule native alarm — this is the PRIMARY execution path
    webViewBridge.scheduleNativeAlarm({
      targetTime: targetTime,
      chatUrl: currentChatUrl,
      strategy: currentStrategy,
      messengerPin: config.messengerPin
    }).catch(err => addLog(`Błąd alarmu natywnego: ${err.message}`, 'error'));

    // JS alarm is ONLY for UI logging — native alarm handles actual workflow
    await alarmService.schedule(targetTime, async () => {
      addLog('⏰ Alarm! Natywny workflow powinien się właśnie uruchamiać...', 'warn');
    });

    setActiveTab(TABS.DASHBOARD);
    addLog(`🎯 Alarm ustawiony na ${targetTime.toLocaleString('pl-PL')}`, 'success');
  }, [config, addLog]);

  const handleDisarm = useCallback(async () => {
    sniperService.disarm();
    await alarmService.cancel();
    addLog('🔓 Snajper rozbrojony', 'warn');
  }, [addLog]);

  const handleLogin = useCallback(async () => {
    if (webViewBridge.isNative) {
      // Native: open real WebView overlay for manual Messenger login
      addLog('Otwieranie Messengera...', 'info');
      await webViewBridge.openForLogin();

      // Listen for login completion (c_user cookie detected)
      const unsub = webViewBridge.onWebViewEvent(async (event) => {
        if (event.event === 'pageFinished' && event.loggedIn) {
          addLog('✅ Sesja wykryta. Możesz teraz wpisać PIN lub wejść w czat i kliknąć "USTAW TEN CZAT".', 'success');
          setIsLoggedIn(true);
          await storageService.saveSession({ loggedIn: true });
          await webViewBridge.persistCookies();
        }

        if (event.event === 'chatSelected' && event.url) {
          addLog(`🎯 Automatycznie ustawiono czat: ${event.url}`, 'success');
          setConfig(prev => ({ ...prev, chatUrl: event.url }));
          await storageService.saveConfig({ ...config, chatUrl: event.url });
          // No auto-hide, let user see confirmation
        }
      });
    } else {
      // Dev mode: simulate login
      addLog('(Dev Mode) Symulacja logowania...', 'info');
      setTimeout(async () => {
        setIsLoggedIn(true);
        await storageService.saveSession({ loggedIn: true });
        addLog('✅ Zalogowano pomyślnie', 'success');
      }, 1000);
    }
  }, [addLog]);

  const handleClearLogs = useCallback(() => {
    sniperService.logs = [];
    setLogs([]);
  }, []);

  // Demo: simulate sniper firing (for testing UI)
  const handleTestFire = useCallback(() => {
    addLog('🧪 Test fire initiated...', 'warn');
    sniperService.setStatus('armed');

    setTimeout(() => {
      addLog('Monitoring czatu...', 'info');
    }, 500);

    setTimeout(() => {
      addLog('Wykryto liczbę: 14', 'info');
    }, 1200);

    setTimeout(() => {
      addLog('Strategia: Dynamiczna — wysyłam 15', 'info');
      sniperService.setStatus('firing');
    }, 1800);

    setTimeout(() => {
      addLog('🎯 SUKCES! Wysłano "15" w 127ms', 'success');
      sniperService.setStatus('success');
    }, 2200);
  }, [addLog]);

  const enabledCount = schedules.filter(s => s.enabled).length;

  return (
    <div className="app">
      {/* Header */}
      <header className="app__header">
        <div className="app__logo">
          <div className="app__logo-icon">🎯</div>
          <div className="app__logo-text">
            Orlik <span>Sniper</span>
          </div>
        </div>
        {/* Active schedules badge */}
        {enabledCount > 0 && (
          <div className="schedule-badge">
            🔄 {enabledCount} {enabledCount === 1 ? 'harmonogram' : 'harmonogramy'}
          </div>
        )}
      </header>

      {/* Navigation Tabs */}
      <div style={{ padding: '0 var(--space-lg)', paddingTop: 'var(--space-md)' }}>
        <nav className="nav-tabs" id="main-navigation">
          <button
            type="button"
            className={`nav-tab ${activeTab === TABS.DASHBOARD ? 'nav-tab--active' : ''}`}
            onClick={() => setActiveTab(TABS.DASHBOARD)}
          >
            <span>📊</span> Panel
          </button>
          <button
            type="button"
            className={`nav-tab ${activeTab === TABS.SCHEDULE ? 'nav-tab--active' : ''}`}
            onClick={() => setActiveTab(TABS.SCHEDULE)}
          >
            <span>📅</span> Cykliczny
          </button>
          <button
            type="button"
            className={`nav-tab ${activeTab === TABS.CONFIG ? 'nav-tab--active' : ''}`}
            onClick={() => setActiveTab(TABS.CONFIG)}
          >
            <span>⚙️</span> Ustawienia
          </button>
        </nav>
      </div>

      {/* Content */}
      <main className="app__content">
        {activeTab === TABS.DASHBOARD ? (
          <div className="screen-enter" key="dashboard">
            {/* Status */}
            <div className="glass-card">
              <StatusIndicator status={status} />
            </div>

            {/* Background Permissions Warning */}
            {webViewBridge.isNative && (
              <PermissionBanner 
                permissions={permissions} 
                onRequest={() => webViewBridge.requestPermissions()} 
              />
            )}

            {/* Countdown */}
            <CountdownTimer targetTime={config.targetTime} />

            {/* Active schedule info */}
            {activeSchedule && (
              <div className="info-bar">
                <span className="info-bar__icon">📅</span>
                <span style={{ fontSize: '0.75rem' }}>
                  Cykliczny: {getDayLabel(activeSchedule.dayOfWeek)} o {activeSchedule.time}
                </span>
              </div>
            )}

            {/* Quick Info */}
            {config.chatUrl && (
              <div className="info-bar">
                <span className="info-bar__icon">💬</span>
                <span className="text-mono" style={{ fontSize: '0.7rem', opacity: 0.8 }}>
                  {config.chatUrl.length > 35
                    ? config.chatUrl.substring(0, 35) + '...'
                    : config.chatUrl}
                </span>
              </div>
            )}

            {/* Strategy badge */}
            {status === 'armed' && (
              <div className="info-bar" style={{ background: 'rgba(245, 158, 11, 0.1)', borderColor: 'rgba(245, 158, 11, 0.2)', color: 'var(--status-armed)' }}>
                <span className="info-bar__icon">🧠</span>
                Strategia: {config.strategy === 'fixed' ? 'Stałe +1' : 'Dynamiczna (N+1)'}
              </div>
            )}

            {/* Live Logs */}
            <LiveLogs logs={logs} onClear={handleClearLogs} />
          </div>
        ) : activeTab === TABS.SCHEDULE ? (
          <ScheduleScreen
            key="schedule"
            schedules={schedules}
            onSchedulesChange={handleSchedulesChange}
            config={config}
            isLoggedIn={isLoggedIn}
            onLogin={handleLogin}
          />
        ) : (
          <ConfigScreen
            key="config"
            config={config}
            onConfigChange={handleConfigChange}
            onArm={handleArm}
            onDisarm={handleDisarm}
            isArmed={status === 'armed'}
            isLoggedIn={isLoggedIn}
            onLogin={handleLogin}
            onLog={addLog}
          />
        )}
      </main>
    </div>
  );
}

export default App;
