/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { useAgent } from '../../context/AgentContext.tsx';
import { NX_THEME_PRESETS } from '../../themes/presets.ts';
import {
  VolumeX,
  Mic,
  MessageSquare,
  WifiOff,
  PanelLeft,
  Bell,
  Lock,
  Shield,
} from 'lucide-react';
import { NxButton, NxStatusText } from '../ui/NxPrimitives.tsx';
import { NotificationsDrawer } from './NotificationsPanel.tsx';

export const TopHeader: React.FC = () => {
  const {
    agentState,
    backendOnline,
    interactionMode,
    setInteractionMode,
    operatingMode,
    toggleOperatingMode,
    persona,
    theme,
    updateTheme,
    isSpeaking,
    voiceState,
    bargeInInterrupt,
    telemetry,
    sidebarState,
    setSidebarState,
    setSidebarDrawerOpen,
    unreadNotificationsCount,
  } = useAgent();

  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <>
      <header
        className="h-14 px-3 sm:px-4 lg:px-6 flex items-center justify-between gap-2 sm:gap-4 border-b shrink-0 min-w-0"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-subtle)',
        }}
      >
        {/* Left Zone: Sidebar toggle + Product Identity & State */}
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={() => {
              if (typeof window !== 'undefined' && window.innerWidth < 768) {
                setSidebarDrawerOpen(true);
              } else if (sidebarState === 'closed') {
                setSidebarState('expanded');
              } else {
                setSidebarDrawerOpen(true);
              }
            }}
            className={`p-1.5 rounded-md border cursor-pointer hover:opacity-80 ${
              sidebarState === 'closed' ? 'inline-flex' : 'inline-flex md:hidden'
            }`}
            style={{
              backgroundColor: 'var(--bg-app)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-main)',
            }}
            title="Open navigation"
            aria-label="Open navigation"
          >
            <PanelLeft className="w-4 h-4" />
          </button>

          <div className="flex items-baseline gap-2 min-w-0">
            <span className="font-bold text-sm tracking-tight shrink-0" style={{ color: 'var(--text-main)' }}>
              {persona.name || 'NX'} AI
            </span>
            <span className="text-xs hidden sm:inline truncate" style={{ color: 'var(--text-muted)' }}>
              Autonomous Windows Agent
            </span>
          </div>

          <span className="text-xs hidden md:inline" style={{ color: 'var(--border-subtle)' }}>
            /
          </span>

          <div className="hidden md:flex items-center gap-2 text-[11px] font-mono min-w-0">
            <NxStatusText status={backendOnline ? agentState : 'BACKEND_DISCONNECTED'} />
            {telemetry.platformInfo.os !== 'unknown' && (
              <span className="truncate" style={{ color: 'var(--text-muted)' }}>
                · {telemetry.platformInfo.os} ({telemetry.platformInfo.cpuCores}c)
              </span>
            )}
          </div>

          {!backendOnline && (
            <span
              className="flex items-center gap-1 text-[11px] font-mono font-semibold shrink-0"
              style={{ color: 'var(--status-danger)' }}
            >
              <WifiOff className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Reconnecting</span>
            </span>
          )}
        </div>

        {/* Center Zone: Audio Interrupt or Voice State / Mandate */}
        <div className="hidden xl:flex items-center gap-2 min-w-0">
          {isSpeaking ? (
            <NxButton variant="danger" size="sm" onClick={bargeInInterrupt} title="Stop TTS output">
              <VolumeX className="w-3.5 h-3.5" />
              <span>Stop Audio</span>
            </NxButton>
          ) : voiceState !== 'IDLE' ? (
            <span className="text-[11px] font-mono" style={{ color: 'var(--accent)' }}>
              VOICE: {voiceState}
            </span>
          ) : (
            <span className="text-xs italic truncate" style={{ color: 'var(--text-muted)' }}>
              &ldquo;Kaam karo, verify karo, phir bolo&rdquo;
            </span>
          )}
        </div>

        {/* Right Zone: Operating Mode, Text/Voice Switcher, Notifications Bell & Theme Selector */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => toggleOperatingMode()}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[11px] font-mono font-semibold whitespace-nowrap shrink-0 cursor-pointer transition-colors"
            style={{
              backgroundColor:
                operatingMode === 'CUSTOMER_SAFE' ? 'rgba(245, 158, 11, 0.14)' : 'var(--bg-app)',
              borderColor:
                operatingMode === 'CUSTOMER_SAFE' ? 'var(--status-warning)' : 'var(--border-subtle)',
              color:
                operatingMode === 'CUSTOMER_SAFE' ? 'var(--status-warning)' : 'var(--status-success)',
            }}
            title={
              operatingMode === 'CUSTOMER_SAFE'
                ? 'Customer Safe Mode active — click to switch to Owner Mode'
                : 'Owner Private Mode active — click to enable Customer Safe Mode'
            }
          >
            {operatingMode === 'CUSTOMER_SAFE' ? (
              <Shield className="w-3 h-3 shrink-0" />
            ) : (
              <Lock className="w-3 h-3 shrink-0" />
            )}
            <span className="hidden sm:inline">
              {operatingMode === 'CUSTOMER_SAFE' ? 'CUSTOMER SAFE' : 'OWNER PRIVATE'}
            </span>
            <span className="sm:hidden">
              {operatingMode === 'CUSTOMER_SAFE' ? 'SAFE' : 'OWNER'}
            </span>
          </button>

          <div
            className="flex items-center p-0.5 rounded-md border text-xs shrink-0"
            style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border-subtle)' }}
          >
            <button
              type="button"
              onClick={() => setInteractionMode('chat')}
              className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium whitespace-nowrap cursor-pointer transition-colors"
              style={{
                backgroundColor: interactionMode === 'chat' ? 'var(--accent)' : 'transparent',
                color: interactionMode === 'chat' ? '#ffffff' : 'var(--text-muted)',
              }}
            >
              <MessageSquare className="w-3 h-3" />
              <span className="hidden sm:inline">Text</span>
            </button>
            <button
              type="button"
              onClick={() => setInteractionMode('voice')}
              className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium whitespace-nowrap cursor-pointer transition-colors"
              style={{
                backgroundColor: interactionMode === 'voice' ? 'var(--accent)' : 'transparent',
                color: interactionMode === 'voice' ? '#ffffff' : 'var(--text-muted)',
              }}
            >
              <Mic className="w-3 h-3" />
              <span className="hidden sm:inline">Voice</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="relative p-1.5 rounded-md border cursor-pointer hover:opacity-90"
            style={{
              backgroundColor: 'var(--bg-app)',
              borderColor: unreadNotificationsCount > 0 ? 'var(--accent)' : 'var(--border-subtle)',
              color: 'var(--text-main)',
            }}
            aria-label="Open Notification Center"
            title="Notification Center"
          >
            <Bell className="w-4 h-4" />
            {unreadNotificationsCount > 0 && (
              <span
                className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full text-[10px] font-mono font-bold text-white flex items-center justify-center tabular-nums"
                style={{ backgroundColor: 'var(--status-danger)' }}
              >
                {unreadNotificationsCount > 9 ? '9+' : unreadNotificationsCount}
              </span>
            )}
          </button>

          <select
            aria-label="Quick Theme Switcher"
            value={NX_THEME_PRESETS.some((p) => p.id === theme.id) ? theme.id : 'custom'}
            onChange={(e) => {
              const preset = NX_THEME_PRESETS.find((p) => p.id === e.target.value);
              if (preset) updateTheme(preset);
            }}
            className="hidden sm:block px-2 py-1 rounded-md border text-xs font-mono cursor-pointer outline-none max-w-[140px]"
            style={{
              backgroundColor: 'var(--bg-app)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-main)',
            }}
          >
            {NX_THEME_PRESETS.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.name}
              </option>
            ))}
            {!NX_THEME_PRESETS.some((p) => p.id === theme.id) && (
              <option value="custom">Custom Theme</option>
            )}
          </select>
        </div>
      </header>

      <NotificationsDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </>
  );
};
