import { useState, useEffect } from 'react';
import webViewBridge from '../services/SniperWebViewBridge';
import { getNextOccurrence } from '../utils/dateUtils';

const DAYS = [
  { value: 0, label: 'Niedziela', short: 'Ndz' },
  { value: 1, label: 'Poniedziałek', short: 'Pon' },
  { value: 2, label: 'Wtorek', short: 'Wt' },
  { value: 3, label: 'Środa', short: 'Śr' },
  { value: 4, label: 'Czwartek', short: 'Czw' },
  { value: 5, label: 'Piątek', short: 'Pt' },
  { value: 6, label: 'Sobota', short: 'Sob' },
];

/**
 * ConfigScreen — Unified Planer screen for manual arming and recurring schedules.
 */
export default function ConfigScreen({
  config,
  onConfigChange,
  onArm,
  onDisarm,
  isArmed,
  isLoggedIn,
  onLogin,
  onLog,
  schedules = [],
  onSchedulesChange,
}) {
  const [chatUrl, setChatUrl] = useState(config?.chatUrl || '');
  const [targetTime, setTargetTime] = useState(config?.targetTime || '');
  const [strategy, setStrategy] = useState(config?.strategy || 'dynamic');
  const [messengerPin, setMessengerPin] = useState(config?.messengerPin || '');

  // Cyclic schedule form states
  const [isCyclic, setIsCyclic] = useState(false);
  const [selectedDay, setSelectedDay] = useState(0); // Sunday
  const [selectedTime, setSelectedTime] = useState('12:00');
  const [editingScheduleId, setEditingScheduleId] = useState(null);

  // Sync from parent config
  useEffect(() => {
    if (config) {
      if (config.chatUrl !== undefined) setChatUrl(config.chatUrl);
      if (config.targetTime) {
        // Format for datetime-local input
        const d = new Date(config.targetTime);
        if (!isNaN(d.getTime())) {
          const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
            .toISOString()
            .slice(0, 19);
          setTargetTime(local);
        }
      } else {
        setTargetTime('');
      }
      if (config.strategy) setStrategy(config.strategy);
      if (config.messengerPin) setMessengerPin(config.messengerPin);
    }
  }, [config]);

  const updateParentConfig = (updates) => {
    const newConfig = {
      chatUrl: updates.chatUrl !== undefined ? updates.chatUrl : chatUrl,
      strategy: updates.strategy !== undefined ? updates.strategy : strategy,
      messengerPin: updates.messengerPin !== undefined ? updates.messengerPin : messengerPin,
      targetTime: updates.targetTime !== undefined ? updates.targetTime : (targetTime ? new Date(targetTime).toISOString() : null)
    };
    onConfigChange(newConfig);
  };

  const handleSave = () => {
    const newConfig = {
      chatUrl,
      targetTime: targetTime ? new Date(targetTime).toISOString() : null,
      strategy,
      messengerPin,
    };
    onConfigChange(newConfig);
  };

  const handleArm = () => {
    handleSave();
    onArm();
  };

  const handleAddOrSaveSchedule = () => {
    if (!chatUrl) return;

    const [hours, minutes] = selectedTime.split(':').map(Number);
    const nextRun = getNextOccurrence(selectedDay, hours, minutes);

    if (editingScheduleId !== null) {
      // Edit existing schedule
      const updated = schedules.map(s => {
        if (s.id === editingScheduleId) {
          return {
            ...s,
            dayOfWeek: selectedDay,
            time: selectedTime,
            chatUrl: chatUrl,
            strategy: strategy,
            nextRun: nextRun.toISOString()
          };
        }
        return s;
      });
      onSchedulesChange(updated);
      setEditingScheduleId(null);
    } else {
      // Add new schedule
      const newSchedule = {
        id: Date.now(),
        dayOfWeek: selectedDay,
        time: selectedTime,
        chatUrl: chatUrl,
        strategy: strategy,
        enabled: true,
        nextRun: nextRun.toISOString(),
      };
      onSchedulesChange([...schedules, newSchedule]);
    }

    // Reset form day/time to defaults
    setSelectedDay(0);
    setSelectedTime('12:00');
  };

  const handleEditSchedule = (schedule) => {
    setIsCyclic(true);
    setChatUrl(schedule.chatUrl || '');
    setStrategy(schedule.strategy || 'dynamic');
    setSelectedDay(schedule.dayOfWeek);
    setSelectedTime(schedule.time);
    setEditingScheduleId(schedule.id);

    // Sync to parent config so inputs have correct values in main state
    onConfigChange({
      ...config,
      chatUrl: schedule.chatUrl || '',
      strategy: schedule.strategy || 'dynamic'
    });

    // Smooth scroll back to form top
    const el = document.getElementById('config-screen');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  const handleToggleSchedule = (id) => {
    const updated = schedules.map(s => {
      if (s.id === id) {
        const enabled = !s.enabled;
        let nextRun = s.nextRun;
        if (enabled) {
          const [hours, minutes] = s.time.split(':').map(Number);
          nextRun = getNextOccurrence(s.dayOfWeek, hours, minutes).toISOString();
        }
        return { ...s, enabled, nextRun };
      }
      return s;
    });
    onSchedulesChange(updated);
  };

  const handleRemoveSchedule = (id) => {
    const updated = schedules.filter(s => s.id !== id);
    onSchedulesChange(updated);
    if (editingScheduleId === id) {
      setEditingScheduleId(null);
    }
  };

  const handleCancelEdit = () => {
    setEditingScheduleId(null);
    // Reset to current global config state
    setChatUrl(config?.chatUrl || '');
    setStrategy(config?.strategy || 'dynamic');
    setSelectedDay(0);
    setSelectedTime('12:00');
  };

  const canArm = chatUrl.trim().length > 0 && targetTime.length > 0;

  // Calculate min datetime (now)
  const now = new Date();
  const minDatetime = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);

  const getDayLabel = (dayValue) => DAYS.find(d => d.value === dayValue)?.label || '';

  const formatNextRun = (isoDate) => {
    if (!isoDate) return '';
    const d = new Date(isoDate);
    const currentNow = new Date();
    const diffMs = d - currentNow;
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays === 0) {
      return `dziś o ${d.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}`;
    } else if (diffDays === 1) {
      return `jutro o ${d.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}`;
    } else {
      return d.toLocaleDateString('pl-PL', {
        weekday: 'long',
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      });
    }
  };

  return (
    <div className="config screen-enter" id="config-screen">
      {/* Session Status */}
      <div className="glass-card config__section">
        <div className="config__section-title">
          <span>🔑</span> Sesja Facebook (v2)
        </div>
        {isLoggedIn ? (
          <div className="session-status">
            <div className="info-bar info-bar--success">
              <span className="info-bar__icon">✅</span>
              Sesja aktywna
            </div>
            <div className="session-actions" style={{ marginTop: '10px' }}>
              <button className="btn btn--ghost btn--small" onClick={onLogin} type="button">
                <span>🔄</span> Otwórz Messenger (PIN / Napraw)
              </button>
            </div>
          </div>
        ) : (
          <>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
              Zaloguj się ręcznie do Messengera w oknie przeglądarki.
              Sesja zostanie zapisana lokalnie na urządzeniu.
            </p>
            <button className="btn btn--ghost" onClick={onLogin} type="button">
              <span>🌐</span> Otwórz Messenger
            </button>
          </>
        )}
      </div>

      {/* Chat Configuration */}
      <div className="glass-card config__section">
        <div className="config__section-title">
          <span>💬</span> Konfiguracja czatu
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="chat-url">URL lub ID czatu</label>
          <input
            id="chat-url"
            type="text"
            className="form-input form-input--mono"
            placeholder="np. 123456789 lub https://messenger.com/t/..."
            value={chatUrl}
            onChange={(e) => {
              setChatUrl(e.target.value);
              updateParentConfig({ chatUrl: e.target.value });
            }}
            disabled={isArmed}
          />
          <span className="form-hint">Wklej link do czatu lub ID grupy z Messengera</span>
        </div>
      </div>

      {/* Strategy */}
      <div className="glass-card config__section">
        <div className="config__section-title">
          <span>🧠</span> Strategia
        </div>

        <div className="strategy-toggle">
          <button
            type="button"
            className={`strategy-option ${strategy === 'fixed' ? 'strategy-option--active' : ''}`}
            onClick={() => {
              if (!isArmed) {
                setStrategy('fixed');
                updateParentConfig({ strategy: 'fixed' });
              }
            }}
            disabled={isArmed}
          >
            Stałe +1
          </button>
          <button
            type="button"
            className={`strategy-option ${strategy === 'dynamic' ? 'strategy-option--active' : ''}`}
            onClick={() => {
              if (!isArmed) {
                setStrategy('dynamic');
                updateParentConfig({ strategy: 'dynamic' });
              }
            }}
            disabled={isArmed}
          >
            Dynamiczne (N+1)
          </button>
          <button
            type="button"
            className={`strategy-option ${strategy === 'wait' ? 'strategy-option--active' : ''}`}
            onClick={() => {
              if (!isArmed) {
                setStrategy('wait');
                updateParentConfig({ strategy: 'wait' });
              }
            }}
            disabled={isArmed}
          >
            Czekaj na start (2-5)
          </button>
        </div>
        <span className="form-hint">
          {strategy === 'fixed'
            ? 'Zawsze wysyła "+1" niezależnie od ostatniego numeru'
            : strategy === 'wait'
            ? 'Czeka na innych (zapisze od pozycji 2 do 5, by nie być pierwszym)'
            : 'Znajduje ostatni numer na czacie i wysyła o 1 więcej'}
        </span>
      </div>

      {/* Messenger PIN (E2EE) */}
      <div className="glass-card config__section">
        <div className="config__section-title">
          <span>🛡️</span> Messenger PIN (E2EE)
        </div>
        <div className="form-group">
          <input
            type="password"
            className="form-input"
            placeholder="Twój kod PIN do czatów"
            value={messengerPin}
            onChange={(e) => {
              setMessengerPin(e.target.value);
              updateParentConfig({ messengerPin: e.target.value });
            }}
            inputMode="numeric"
            pattern="[0-9]*"
            disabled={isArmed}
          />
          <span className="form-hint">Wymagany do odblokowania szyfrowanych czatów w tle.</span>
        </div>
      </div>

      {/* Planning / Timing Section */}
      <div className="glass-card config__section">
        <div className="config__section-title">
          <span>⚙️</span> Uruchamianie snajpera
        </div>

        {/* Cyclic mode toggle switch */}
        <div className="form-group" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--space-sm) 0' }}>
          <div>
            <label className="form-label" style={{ marginBottom: 0 }}>Zadanie cykliczne</label>
            <span className="form-hint">Uruchamiaj automatycznie co tydzień</span>
          </div>
          <button
            type="button"
            className={`toggle-switch ${isCyclic ? 'toggle-switch--on' : ''}`}
            onClick={() => {
              if (!isArmed) {
                setIsCyclic(!isCyclic);
              }
            }}
            disabled={isArmed}
            aria-label="Zadanie cykliczne"
          >
            <div className="toggle-switch__knob" />
          </button>
        </div>

        {isCyclic ? (
          /* Cyclic Mode Form */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)', marginTop: 'var(--space-md)', paddingTop: 'var(--space-md)', borderTop: '1px solid var(--border)' }}>
            
            {/* Day picker */}
            <div className="form-group">
              <label className="form-label">Dzień tygodnia</label>
              <div className="schedule-days">
                {DAYS.map(day => (
                  <button
                    key={day.value}
                    type="button"
                    className={`schedule-day ${selectedDay === day.value ? 'schedule-day--active' : ''}`}
                    onClick={() => setSelectedDay(day.value)}
                  >
                    {day.short}
                  </button>
                ))}
              </div>
            </div>

            {/* Time picker */}
            <div className="form-group">
              <label className="form-label" htmlFor="schedule-time">Godzina strzału</label>
              <input
                id="schedule-time"
                type="time"
                className="form-input"
                value={selectedTime}
                onChange={(e) => setSelectedTime(e.target.value || '12:00')}
                step="60"
              />
              <span className="form-hint">Snajper obudzi się 1 min wcześniej i przygotuje WebView</span>
            </div>

            {/* Preview next run */}
            {chatUrl && (
              <div className="schedule-preview">
                <span className="schedule-preview__icon">🎯</span>
                <div>
                  <div className="schedule-preview__label">Następne uruchomienie</div>
                  <div className="schedule-preview__value">
                    {getDayLabel(selectedDay)} o {selectedTime}
                  </div>
                  <div className="schedule-preview__next">
                    → {selectedTime && selectedTime.includes(':') 
                      ? formatNextRun(getNextOccurrence(selectedDay, ...selectedTime.split(':').map(Number)).toISOString())
                      : '—'}
                  </div>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
              <button
                className="btn btn--primary"
                onClick={handleAddOrSaveSchedule}
                type="button"
                disabled={!chatUrl}
              >
                <span>{editingScheduleId !== null ? '✏️' : '➕'}</span>
                {editingScheduleId !== null ? 'Zapisz zmiany' : 'Dodaj do harmonogramu'}
              </button>
              {editingScheduleId !== null && (
                <button
                  className="btn btn--ghost"
                  onClick={handleCancelEdit}
                  type="button"
                  style={{ width: 'auto', flexShrink: 0 }}
                >
                  Anuluj
                </button>
              )}
            </div>
          </div>
        ) : (
          /* Single Run Mode Form */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)', marginTop: 'var(--space-md)', paddingTop: 'var(--space-md)', borderTop: '1px solid var(--border)' }}>
            
            <div className="form-group">
              <label className="form-label" htmlFor="target-time">Data i godzina strzału</label>
              <input
                id="target-time"
                type="datetime-local"
                className="form-input"
                value={targetTime}
                onChange={(e) => {
                  setTargetTime(e.target.value);
                  updateParentConfig({ targetTime: e.target.value ? new Date(e.target.value).toISOString() : null });
                }}
                min={minDatetime}
                step="1"
                disabled={isArmed}
              />
              <span className="form-hint">Aplikacja obudzi się 1 minutę przed wybranym czasem</span>
            </div>

            {isArmed ? (
              <button className="btn btn--danger" onClick={onDisarm} type="button" id="disarm-button">
                <span>🔓</span> Rozbrój snajpera
              </button>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <button
                  className="btn btn--primary"
                  onClick={handleArm}
                  type="button"
                  disabled={!canArm}
                  id="arm-button"
                >
                  <span>🎯</span> Uzbrój snajpera
                </button>
                
                <button
                  className="btn btn--ghost"
                  style={{ borderColor: 'var(--accent-primary)', color: 'var(--accent-primary)' }}
                  onClick={async () => {
                    // Update and run
                    updateParentConfig({});
                    try {
                      alert('🚀 Test wystartował! Przejdź do Dashboardu lub czekaj na okno Messengera.');
                      if (onLog) onLog('🚀 Uruchomiono test manualny...', 'info');

                      await webViewBridge.runSniperWorkflow({
                        chatUrl: chatUrl,
                        targetTime: new Date().toISOString(),
                        strategy: strategy,
                        visible: false,
                        onLog: (msg, level) => {
                          if (onLog) onLog(`[TEST] ${msg}`, level || 'info');
                        }
                      });
                    } catch (err) {
                      alert('Błąd testu: ' + err.message);
                    }
                  }}
                  type="button"
                >
                  <span>🚀</span> Testuj teraz (Wystrzel)
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Schedules List */}
      {schedules.length > 0 && (
        <div className="glass-card config__section" style={{ marginTop: 'var(--space-md)' }}>
          <div className="config__section-title">
            <span>🔄</span> Aktywne harmonogramy cykliczne ({schedules.length})
          </div>

          <div className="schedule-list">
            {schedules.map((schedule) => (
              <div
                key={schedule.id}
                className={`schedule-item ${!schedule.enabled ? 'schedule-item--disabled' : ''}`}
                style={editingScheduleId === schedule.id ? { borderColor: 'var(--accent)', boxShadow: '0 0 12px var(--accent-glow)' } : {}}
              >
                <div className="schedule-item__main">
                  <div className="schedule-item__toggle">
                    <button
                      type="button"
                      className={`toggle-switch ${schedule.enabled ? 'toggle-switch--on' : ''}`}
                      onClick={() => handleToggleSchedule(schedule.id)}
                      aria-label={schedule.enabled ? 'Wyłącz' : 'Włącz'}
                    >
                      <div className="toggle-switch__knob" />
                    </button>
                  </div>

                  <div className="schedule-item__info">
                    <div className="schedule-item__day">
                      {getDayLabel(schedule.dayOfWeek)}
                    </div>
                    <div className="schedule-item__time">
                      {schedule.time}
                    </div>
                    {schedule.enabled && (
                      <div className="schedule-item__next">
                        → {formatNextRun(schedule.nextRun)}
                      </div>
                    )}
                  </div>

                  <div className="schedule-item__actions">
                    <button
                      type="button"
                      className="schedule-action"
                      onClick={() => handleEditSchedule(schedule)}
                      title="Edytuj"
                    >
                      ✏️
                    </button>
                    <button
                      type="button"
                      className="schedule-action schedule-action--danger"
                      onClick={() => handleRemoveSchedule(schedule.id)}
                      title="Usuń"
                    >
                      🗑️
                    </button>
                  </div>
                </div>

                <div className="schedule-item__strategy">
                  <div>🧠 {schedule.strategy === 'fixed' ? 'Stałe +1' : (schedule.strategy === 'wait' ? 'Czekaj na start (losowo 2-5)' : 'Dynamiczne (N+1)')}</div>
                  {schedule.chatUrl && (
                    <div style={{ fontSize: '0.65rem', opacity: 0.7, marginTop: '2px', wordBreak: 'break-all' }}>
                      💬 {schedule.chatUrl.length > 40 ? schedule.chatUrl.substring(0, 40) + '...' : schedule.chatUrl}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
