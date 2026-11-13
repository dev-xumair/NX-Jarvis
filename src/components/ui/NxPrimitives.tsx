/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import type { TelemetryStatus, VerificationStatus } from '../../types/agent.ts';

export const NxCard: React.FC<{
  children: React.ReactNode;
  className?: string;
  elevated?: boolean;
}> = ({ children, className = '', elevated = false }) => (
  <div
    className={`border min-w-0 ${className}`}
    style={{
      backgroundColor: elevated ? 'var(--bg-surface-elevated)' : 'var(--bg-surface)',
      borderColor: 'var(--border-subtle)',
      borderRadius: 'var(--radius-card, 0.5rem)',
    }}
  >
    {children}
  </div>
);

export const NxSectionHeader: React.FC<{
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}> = ({ title, subtitle, action }) => (
  <div className="flex flex-wrap items-center justify-between gap-3">
    <div className="min-w-0">
      <h1 className="text-lg font-semibold tracking-tight" style={{ color: 'var(--text-main)' }}>
        {title}
      </h1>
      {subtitle && (
        <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
          {subtitle}
        </p>
      )}
    </div>
    {action && <div className="flex items-center gap-2 shrink-0">{action}</div>}
  </div>
);

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

export const NxButton: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: ButtonVariant;
    size?: 'sm' | 'md';
  }
> = ({ variant = 'secondary', size = 'md', className = '', style, children, ...props }) => {
  const sizeClass = size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-2 text-xs';
  const variantStyles: Record<ButtonVariant, React.CSSProperties> = {
    primary: {
      backgroundColor: 'var(--accent)',
      color: '#ffffff',
      borderColor: 'var(--accent)',
    },
    secondary: {
      backgroundColor: 'var(--bg-surface-elevated)',
      color: 'var(--text-main)',
      borderColor: 'var(--border-subtle)',
    },
    danger: {
      backgroundColor: 'rgba(239, 68, 68, 0.12)',
      color: 'var(--status-danger)',
      borderColor: 'rgba(239, 68, 68, 0.35)',
    },
    ghost: {
      backgroundColor: 'transparent',
      color: 'var(--text-muted)',
      borderColor: 'transparent',
    },
  };

  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-1.5 rounded-md border font-medium transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer ${sizeClass} ${className}`}
      style={{ ...variantStyles[variant], ...style }}
    >
      {children}
    </button>
  );
};

export const NxStatusText: React.FC<{
  status: VerificationStatus | TelemetryStatus | string;
  className?: string;
}> = ({ status, className = '' }) => {
  const upper = status.toUpperCase();
  let color = 'var(--text-muted)';
  if (
    upper === 'PASS' ||
    upper === 'PASSED' ||
    upper === 'LIVE' ||
    upper === 'HEALTHY' ||
    upper === 'CONNECTED' ||
    upper === 'READY' ||
    upper === 'VERIFIED' ||
    upper === 'EXECUTED_AND_VERIFIED' ||
    upper === 'OWNER_PRIVATE' ||
    upper === 'COMPLETED' ||
    upper === 'EJECTED'
  ) {
    color = 'var(--status-success)';
  } else if (
    upper === 'FAIL' ||
    upper === 'FAILED' ||
    upper === 'ERROR' ||
    upper === 'BLOCKED' ||
    upper === 'BLOCKED_BY_POLICY' ||
    upper === 'AUTH_FAILED' ||
    upper === 'QUOTA_EXHAUSTED' ||
    upper === 'QUOTA_BLOCKED'
  ) {
    color = 'var(--status-danger)';
  } else if (
    upper === 'SKIPPED' ||
    upper === 'DEGRADED' ||
    upper === 'NETWORK_ERROR' ||
    upper === 'COOLING_DOWN' ||
    upper === 'AUTHORIZATION_REQUIRED' ||
    upper === 'CONFIRMATION_REQUIRED' ||
    upper === 'NEEDS_ATTENTION' ||
    upper === 'CUSTOMER_SAFE' ||
    upper === 'HOST_UNAVAILABLE' ||
    upper === 'NOT_CONFIGURED' ||
    upper === 'UNAVAILABLE_ON_CURRENT_HOST'
  ) {
    color = 'var(--status-warning)';
  } else if (upper === 'EXECUTING' || upper === 'VERIFYING' || upper === 'PLANNING') {
    color = 'var(--accent)';
  }

  return (
    <span className={`font-mono text-[11px] font-semibold uppercase tracking-wide ${className}`} style={{ color }}>
      {status}
    </span>
  );
};

export const NxMetric: React.FC<{
  label: string;
  value: string;
  status?: TelemetryStatus | string;
  icon?: React.ReactNode;
  sublabel?: string;
}> = ({ label, value, status, icon, sublabel }) => (
  <div className="flex items-center gap-2.5 min-w-0">
    {icon && <div className="shrink-0">{icon}</div>}
    <div className="min-w-0">
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] font-mono uppercase tracking-wider truncate" style={{ color: 'var(--text-muted)' }}>
          {label}
        </span>
        {status && status !== 'LIVE' && (
          <NxStatusText status={status} className="text-[9px]" />
        )}
      </div>
      <div className="text-xs font-mono font-semibold tabular-nums truncate" style={{ color: 'var(--text-main)' }}>
        {value}
      </div>
      {sublabel && (
        <div className="text-[10px] font-mono truncate" style={{ color: 'var(--text-muted)' }}>
          {sublabel}
        </div>
      )}
    </div>
  </div>
);

export const NxProgress: React.FC<{ percent: number; heightClass?: string }> = ({
  percent,
  heightClass = 'h-1.5',
}) => {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div
      className={`w-full rounded-sm overflow-hidden ${heightClass}`}
      style={{ backgroundColor: 'var(--bg-app)', border: '1px solid var(--border-subtle)' }}
    >
      <div
        className="h-full transition-all duration-200"
        style={{ width: `${clamped}%`, backgroundColor: 'var(--accent)' }}
      />
    </div>
  );
};
