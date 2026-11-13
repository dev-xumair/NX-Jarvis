/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef } from 'react';
import { useAgent, type NavSection } from '../../context/AgentContext.tsx';
import {
  LayoutDashboard,
  Briefcase,
  Sparkles,
  Settings,
  ShieldCheck,
  Cpu,
  Activity,
  ChevronLeft,
  ChevronRight,
  X,
} from 'lucide-react';
import { NxStatusText } from '../ui/NxPrimitives.tsx';

export const Sidebar: React.FC = () => {
  const {
    activeNav,
    setActiveNav,
    sidebarState,
    setSidebarState,
    sidebarDrawerOpen,
    setSidebarDrawerOpen,
    agentState,
    telemetry,
    backendOnline,
  } = useAgent();

  const drawerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sidebarDrawerOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSidebarDrawerOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [sidebarDrawerOpen, setSidebarDrawerOpen]);

  const navItems: Array<{ id: NavSection; label: string; icon: any }> = [
    { id: 'dashboard', label: 'Command Center', icon: LayoutDashboard },
    { id: 'workspace', label: 'Workspace & Tasks', icon: Briefcase },
    { id: 'intelligence', label: 'Intelligence Hub', icon: Sparkles },
    { id: 'settings', label: 'System Settings', icon: Settings },
  ];

  const cpuVal = telemetry.cpuLoad.value !== null ? `${telemetry.cpuLoad.value}%` : 'N/A';
  const ramText =
    telemetry.ramUsedMB.value !== null && telemetry.ramTotalMB.value !== null
      ? `${(telemetry.ramUsedMB.value / 1024).toFixed(1)} / ${(telemetry.ramTotalMB.value / 1024).toFixed(1)} GB`
      : 'N/A';

  const isCollapsed = sidebarState === 'collapsed';
  const isClosedDesktop = sidebarState === 'closed';

  const handleSelectNav = (id: NavSection) => {
    setActiveNav(id);
    if (sidebarDrawerOpen) setSidebarDrawerOpen(false);
  };

  const renderSidebarBody = (forceExpanded: boolean) => {
    const showLabels = forceExpanded || !isCollapsed;
    return (
      <div className="flex flex-col justify-between h-full">
        <div>
          <div
            className="h-14 flex items-center justify-between px-3 border-b"
            style={{ borderColor: 'var(--border-subtle)' }}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div
                className="w-8 h-8 rounded-md flex items-center justify-center font-bold text-xs tracking-wider text-white shrink-0"
                style={{ backgroundColor: 'var(--accent)' }}
              >
                NX
              </div>
              {showLabels && (
                <div className="min-w-0">
                  <div className="font-bold text-sm tracking-tight leading-none truncate" style={{ color: 'var(--text-main)' }}>
                    NX AI
                  </div>
                  <div className="text-[10px] font-mono mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>
                    DevX_NX Agent
                  </div>
                </div>
              )}
            </div>

            {forceExpanded ? (
              <button
                type="button"
                onClick={() => setSidebarDrawerOpen(false)}
                className="p-1.5 rounded hover:opacity-80 cursor-pointer"
                style={{ color: 'var(--text-muted)' }}
                aria-label="Close navigation drawer"
              >
                <X className="w-4 h-4" />
              </button>
            ) : (
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => setSidebarState(isCollapsed ? 'expanded' : 'collapsed')}
                  className="p-1 rounded hover:opacity-80 cursor-pointer"
                  style={{ color: 'var(--text-muted)' }}
                  title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                  aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                >
                  {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
                </button>
                {isCollapsed && (
                  <button
                    type="button"
                    onClick={() => setSidebarState('closed')}
                    className="p-1 rounded hover:opacity-80 cursor-pointer"
                    style={{ color: 'var(--text-muted)' }}
                    title="Hide sidebar"
                    aria-label="Hide sidebar"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}
          </div>

          <nav className="p-2 space-y-1" aria-label="Main navigation">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeNav === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelectNav(item.id)}
                  title={item.label}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-xs font-medium transition-colors text-left cursor-pointer"
                  style={{
                    backgroundColor: isActive ? 'var(--accent)' : 'transparent',
                    color: isActive ? '#ffffff' : 'var(--text-muted)',
                  }}
                >
                  <Icon className={`w-4 h-4 shrink-0 ${showLabels ? '' : 'mx-auto'}`} />
                  {showLabels && <span className="truncate">{item.label}</span>}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="p-3 border-t space-y-2.5" style={{ borderColor: 'var(--border-subtle)' }}>
          {showLabels && (
            <div className="space-y-1.5 text-[11px] font-mono tabular-nums">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
                  <ShieldCheck className="w-3.5 h-3.5" style={{ color: 'var(--status-success)' }} />
                  <span>C: Guard</span>
                </span>
                <span className="font-semibold" style={{ color: 'var(--status-success)' }}>
                  PROTECTED
                </span>
              </div>

              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
                  <Cpu className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} />
                  <span>CPU</span>
                </span>
                <span style={{ color: 'var(--text-main)' }}>{cpuVal}</span>
              </div>

              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
                  <Activity className="w-3.5 h-3.5" style={{ color: 'var(--status-success)' }} />
                  <span>RAM</span>
                </span>
                <span style={{ color: 'var(--text-main)' }}>{ramText}</span>
              </div>
            </div>
          )}

          <div
            className="p-2 rounded-md border flex items-center justify-between gap-2"
            style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border-subtle)' }}
            title={`Backend: ${backendOnline ? 'Connected' : 'Disconnected'} · State: ${agentState}`}
          >
            {showLabels && (
              <span className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>
                {backendOnline ? 'STATE' : 'OFFLINE'}
              </span>
            )}
            <NxStatusText
              status={backendOnline ? agentState : 'OFFLINE'}
              className={showLabels ? 'text-[10px] truncate' : 'text-[9px] truncate mx-auto'}
            />
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      {/* Desktop persistent sidebar (respects expanded / collapsed / closed) */}
      {!isClosedDesktop && (
        <aside
          className={`hidden md:flex shrink-0 flex-col border-r h-full transition-all duration-150 ${
            isCollapsed ? 'w-16' : 'w-56 lg:w-60'
          }`}
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          {renderSidebarBody(false)}
        </aside>
      )}

      {/* Compact/Mobile or Temporarily Opened Slide-Over Drawer */}
      {sidebarDrawerOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex"
          onClick={(e) => {
            if (drawerRef.current && !drawerRef.current.contains(e.target as Node)) {
              setSidebarDrawerOpen(false);
            }
          }}
        >
          <aside
            ref={drawerRef}
            className="w-64 max-w-[82vw] h-full border-r flex flex-col"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-subtle)',
            }}
          >
            {renderSidebarBody(true)}
          </aside>
        </div>
      )}
    </>
  );
};
