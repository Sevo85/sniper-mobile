import { useState, useEffect, useRef } from 'react';

/**
 * LiveLogs — Scrollable log viewer with color-coded entries, auto-scroll,
 * and expandable height.
 */
export default function LiveLogs({ logs = [], onClear }) {
  const containerRef = useRef(null);
  const [expanded, setExpanded] = useState(false);

  // Auto-scroll to bottom on new entries
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs.length]);

  const formatTime = (time) => {
    const d = new Date(time);
    return d.toLocaleTimeString('pl-PL', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  return (
    <div className={`logs glass-card ${expanded ? 'logs--expanded' : ''}`} id="live-logs">
      <div className="logs__header">
        <div className="logs__title">
          <span className="logs__live-dot" />
          Logi na żywo
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            className="logs__clear"
            onClick={() => setExpanded(!expanded)}
            type="button"
            title={expanded ? 'Zwiń' : 'Rozwiń'}
          >
            {expanded ? '⬆ Zwiń' : '⬇ Rozwiń'}
          </button>
          {logs.length > 0 && (
            <button className="logs__clear" onClick={onClear} type="button">
              Wyczyść
            </button>
          )}
        </div>
      </div>
      <div className="logs__container" ref={containerRef}>
        {logs.length === 0 ? (
          <div className="logs__empty">
            Brak logów — uzbrój snajpera aby rozpocząć
          </div>
        ) : (
          logs.map((entry) => (
            <div
              key={entry.id}
              className={`logs__entry logs__entry--${entry.level || 'info'}`}
            >
              <span className="logs__entry-time">{formatTime(entry.time)}</span>
              <span className="logs__entry-text">{entry.text}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
