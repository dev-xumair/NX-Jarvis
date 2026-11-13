/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { useAgent } from '../../context/AgentContext.tsx';
import { X, CheckCheck, Trash2, ChevronDown, ChevronRight, ArrowRight } from 'lucide-react';
import type { NotificationCategory } from '../../types/agent.ts';
import { NxButton, NxStatusText } from '../ui/NxPrimitives.tsx';

export const ToastStack: React.FC = () => {
  const { toasts, dismissToast, setActiveNav } = useAgent();

  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 w-full max-w-sm pointer-events-none px-4 sm:px-0"
      aria-live="polite"
    >
      {toasts.slice(0, 3).map((t) => (
        <div
          key={t.id}
          className="pointer-events-auto border rounded-md p-3 text-xs space-y-1.5 shadow-sm"
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor:
              t.severity === 'error'
                ? 'var(--status-danger)'
                : t.severity === 'warning'
                  ? 'var(--status-warning)'
                  : t.severity === 'success'
                    ? 'var(--status-success)'
                    : 'var(--border-subtle)',
            color: 'var(--text-main)',
          }}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 font-mono text-[10px]">
                <NxStatusText status={t.severity === 'success' ? 'VERIFIED' : t.severity.toUpperCase()} />
                <span style={{ color: 'var(--text-muted)' }}>· {t.source}</span>
                {t.occurrences > 1 && (
                  <span className="tabular-nums font-semibold" style={{ color: 'var(--accent)' }}>
                    ×{t.occurrences}
                  </span>
                )}
              </div>
              <div className="font-semibold text-xs mt-0.5 nx-wrap-anywhere">{t.title}</div>
            </div>
            <button
              type="button"
              onClick={() => dismissToast(t.id)}
              className="p-0.5 cursor-pointer shrink-0 hover:opacity-75"
              style={{ color: 'var(--text-muted)' }}
              aria-label="Dismiss notification"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <p className="text-[11px] nx-wrap-anywhere" style={{ color: 'var(--text-muted)' }}>
            {t.message}
          </p>
          {t.actionable && t.actionTarget && (
            <button
              type="button"
              onClick={() => {
                setActiveNav(t.actionTarget!);
                dismissToast(t.id);
              }}
              className="inline-flex items-center gap-1 text-[11px] font-mono font-semibold cursor-pointer hover:underline"
              style={{ color: 'var(--accent)' }}
            >
              <span>{t.actionLabel || 'Open Section'}</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          )}
        </div>
      ))}
    </div>
  );
};

export const NotificationsDrawer: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const {
    notifications,
    unreadNotificationsCount,
    markAllNotificationsRead,
    clearNonCriticalNotifications,
    setActiveNav,
  } = useAgent();

  const [categoryFilter, setCategoryFilter] = useState<'ALL' | NotificationCategory>('ALL');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const filtered =
    categoryFilter === 'ALL' ? notifications : notifications.filter((n) => n.type === categoryFilter);

  const filterCats: Array<'ALL' | NotificationCategory> = [
    'ALL',
    'ACTION_REQUIRED',
    'MODEL',
    'SECURITY',
    'VOICE',
    'SYSTEM',
  ];

  return (
    <div
      className="fixed inset-0 z-50 bg-black/45 flex justify-end"
      onClick={(e) => {
        if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
          onClose();
        }
      }}
    >
      <aside
        ref={panelRef}
        role="dialog"
        aria-label="Notification Center"
        className="w-full max-w-md h-full border-l flex flex-col"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-subtle)',
        }}
      >
        <div
          className="px-4 py-3 border-b flex items-center justify-between gap-2 shrink-0"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <div className="min-w-0">
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text-main)' }}>
              Notification Center
            </h2>
            <p className="text-[11px] font-mono tabular-nums" style={{ color: 'var(--text-muted)' }}>
              {unreadNotificationsCount} unread · {notifications.length} total recorded
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <NxButton size="sm" variant="ghost" onClick={markAllNotificationsRead} title="Mark all read">
              <CheckCheck className="w-3.5 h-3.5" />
            </NxButton>
            <NxButton size="sm" variant="ghost" onClick={clearNonCriticalNotifications} title="Clear non-critical">
              <Trash2 className="w-3.5 h-3.5" />
            </NxButton>
            <NxButton size="sm" variant="ghost" onClick={onClose} aria-label="Close notifications">
              <X className="w-4 h-4" />
            </NxButton>
          </div>
        </div>

        <div
          className="px-3 py-2 border-b flex items-center gap-1 overflow-x-auto shrink-0"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          {filterCats.map((cat) => (
            <NxButton
              key={cat}
              size="sm"
              variant={categoryFilter === cat ? 'primary' : 'secondary'}
              onClick={() => setCategoryFilter(cat)}
              className="whitespace-nowrap text-[10px]"
            >
              {cat}
            </NxButton>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {filtered.length === 0 ? (
            <div className="py-12 text-center text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
              No notifications in this category.
            </div>
          ) : (
            filtered.map((n) => {
              const isExpanded = expandedId === n.id;
              return (
                <div
                  key={n.id}
                  className="p-3 rounded-md border text-xs space-y-1.5"
                  style={{
                    backgroundColor: n.read ? 'var(--bg-app)' : 'var(--bg-surface-elevated)',
                    borderColor: !n.read ? 'var(--accent)' : 'var(--border-subtle)',
                  }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-mono">
                        <NxStatusText status={n.severity === 'success' ? 'VERIFIED' : n.severity.toUpperCase()} />
                        <span style={{ color: 'var(--text-muted)' }}>· {n.type}</span>
                        <span style={{ color: 'var(--text-muted)' }}>· {n.source}</span>
                        {n.occurrences > 1 && (
                          <span className="tabular-nums font-semibold" style={{ color: 'var(--accent)' }}>
                            ×{n.occurrences}
                          </span>
                        )}
                      </div>
                      <div className="font-semibold mt-0.5 nx-wrap-anywhere" style={{ color: 'var(--text-main)' }}>
                        {n.title}
                      </div>
                    </div>
                    <span className="text-[10px] font-mono tabular-nums shrink-0" style={{ color: 'var(--text-muted)' }}>
                      {new Date(n.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>

                  <p className="text-[11px] nx-wrap-anywhere" style={{ color: 'var(--text-muted)' }}>
                    {n.message}
                  </p>

                  <div className="flex items-center justify-between gap-2 pt-1">
                    {n.actionable && n.actionTarget ? (
                      <button
                        type="button"
                        onClick={() => {
                          setActiveNav(n.actionTarget!);
                          onClose();
                        }}
                        className="inline-flex items-center gap-1 text-[11px] font-mono font-semibold cursor-pointer hover:underline"
                        style={{ color: 'var(--accent)' }}
                      >
                        <span>{n.actionLabel || 'Open'}</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    ) : (
                      <span />
                    )}

                    {(n.details || n.correlationId) && (
                      <button
                        type="button"
                        onClick={() => setExpandedId(isExpanded ? null : n.id)}
                        className="inline-flex items-center gap-1 text-[10px] font-mono cursor-pointer"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                        <span>Details</span>
                      </button>
                    )}
                  </div>

                  {isExpanded && (
                    <div
                      className="mt-1 p-2 rounded border text-[10px] font-mono space-y-1 nx-wrap-anywhere"
                      style={{
                        backgroundColor: 'var(--bg-app)',
                        borderColor: 'var(--border-subtle)',
                        color: 'var(--text-muted)',
                      }}
                    >
                      {n.correlationId && <div>Correlation: {n.correlationId}</div>}
                      {n.details && <div>{n.details}</div>}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </aside>
    </div>
  );
};
