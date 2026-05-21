import { useMemo } from 'react';

/**
 * StatusIndicator — Visual status display with animated ring.
 * States: idle, waiting, armed, firing, success, error
 */

const STATUS_CONFIG = {
  idle: {
    icon: '🎯',
    label: 'OCZEKIWANIE',
    className: '',
  },
  waiting: {
    icon: '⏳',
    label: 'OCZEKIWANIE',
    className: '',
  },
  armed: {
    icon: '🔫',
    label: 'UZBROJONY',
    className: 'status--armed',
  },
  firing: {
    icon: '💥',
    label: 'STRZAŁ!',
    className: 'status--armed',
  },
  success: {
    icon: '✅',
    label: 'SUKCES',
    className: 'status--success',
  },
  error: {
    icon: '❌',
    label: 'BŁĄD',
    className: 'status--error',
  },
};

export default function StatusIndicator({ status = 'idle' }) {
  const config = useMemo(() => STATUS_CONFIG[status] || STATUS_CONFIG.idle, [status]);

  return (
    <div className={`status ${config.className}`} id="status-indicator">
      <div className="status__ring">
        <div className="status__ring-outer" />
        <div className="status__ring-inner" />
        <span className="status__icon" role="img" aria-label={config.label}>
          {config.icon}
        </span>
      </div>
      <span className="status__label">{config.label}</span>
    </div>
  );
}
