import { useState, useEffect } from 'react';
import webViewBridge from '../services/SniperWebViewBridge';

/**
 * ConfigScreen — Configuration panel for sniper settings.
 * Chat URL, datetime picker, strategy toggle, arm button.
 */
export default function ConfigScreen({
  config,
  onConfigChange,
  onArm,
  onDisarm,
  isArmed,
  isLoggedIn,
  onLogin,
  onLog
}) {
  const [chatUrl, setChatUrl] = useState(config?.chatUrl || '');
  const [targetTime, setTargetTime] = useState(config?.targetTime || '');
  const [strategy, setStrategy] = useState(config?.strategy || 'dynamic');
  const [messengerPin, setMessengerPin] = useState(config?.messengerPin || '');

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
      }
      if (config.strategy) setStrategy(config.strategy);
      if (config.messengerPin) setMessengerPin(config.messengerPin);
    }
  }, [config]);

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

  const canArm = chatUrl.trim().length > 0 && targetTime.length > 0;

  // Calculate min datetime (now)
  const now = new Date();
  const minDatetime = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);

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
            onChange={(e) => setChatUrl(e.target.value)}
            disabled={isArmed}
          />
          <span className="form-hint">Wklej link do czatu lub ID grupy z Messengera</span>
        </div>
      </div>

      {/* Timing */}
      <div className="glass-card config__section">
        <div className="config__section-title">
          <span>⏰</span> Termin aktywacji
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="target-time">Data i godzina strzału</label>
          <input
            id="target-time"
            type="datetime-local"
            className="form-input"
            value={targetTime}
            onChange={(e) => setTargetTime(e.target.value)}
            min={minDatetime}
            step="1"
            disabled={isArmed}
          />
          <span className="form-hint">Aplikacja obudzi się 1 minutę przed wybranym czasem</span>
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
                onConfigChange({ ...config, chatUrl, strategy: 'fixed' });
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
                onConfigChange({ ...config, chatUrl, strategy: 'dynamic' });
              }
            }}
            disabled={isArmed}
          >
            Dynamiczne (N+1)
          </button>
        </div>
        <span className="form-hint">
          {strategy === 'fixed'
            ? 'Zawsze wysyła "+1" niezależnie od ostatniego numeru'
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
          onChange={(e) => setMessengerPin(e.target.value)}
          inputMode="numeric"
          pattern="[0-9]*"
          disabled={isArmed}
        />
        <span className="form-hint">Wymagany do odblokowania szyfrowanych czatów w tle.</span>
      </div>
    </div>

      {/* Action Button */}
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
          
          {!isArmed && (
            <button
              className="btn btn--ghost"
              style={{ borderColor: 'var(--accent-primary)', color: 'var(--accent-primary)' }}
              onClick={async () => {
                // Ensure config is synced before testing
                onConfigChange({ ...config, chatUrl, strategy });
                
                try {
                  // Immediate feedback
                  alert('🚀 Test wystartował! Przejdź do Dashboardu lub czekaj na okno Messengera.');
                  if (onLog) onLog('🚀 Uruchomiono test manualny...', 'info');

                  await webViewBridge.runSniperWorkflow({
                    chatUrl: chatUrl, // use local state
                    targetTime: new Date().toISOString(),
                    strategy: strategy, // use local state
                    visible: false, // Runs invisibly in the background
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
          )}
        </div>
      )}
    </div>
  );
}
