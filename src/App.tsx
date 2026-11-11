/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { AgentProvider, useAgent } from './context/AgentContext.tsx';
import { Sidebar } from './components/layout/Sidebar.tsx';
import { TopHeader } from './components/layout/TopHeader.tsx';
import { RealtimeDashboard } from './components/dashboard/RealtimeDashboard.tsx';
import { StatisticsHistory } from './components/history/StatisticsHistory.tsx';
import { MemoryManager } from './components/memory/MemoryManager.tsx';
import { SettingsManager } from './components/settings/SettingsManager.tsx';
import { DesktopCompanion } from './components/companion/DesktopCompanion.tsx';
import { Maximize2, ShieldCheck, Cpu, Activity, LayoutDashboard } from 'lucide-react';

const AppContent: React.FC = () => {
  const { activeNav, theme, desktopMode, setDesktopMode, telemetry, agentState } = useAgent();

  const dynamicStyles = {
    '--bg-app': theme.bgCanvas,
    '--bg-surface': theme.surfaceColor,
    '--bg-surface-elevated': theme.surfaceElevated,
    '--border-subtle': theme.borderColor,
    '--text-main': theme.textColor,
    '--text-muted': theme.textMuted,
    '--accent': theme.accentColor,
    '--radius-card': theme.roundedRadius,
    backgroundColor: theme.bgCanvas,
    color: theme.textColor,
  } as React.CSSProperties;

  // 0. TRANSPARENT COMPANION OVERLAY WINDOW MODE (?overlay=true)
  const isOverlayMode = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('overlay') === 'true';

  if (isOverlayMode) {
    return (
      <div className="h-screen w-screen overflow-hidden bg-transparent select-none relative pointer-events-auto">
        <DesktopCompanion />
      </div>
    );
  }

  // 1. MINIMIZED FLOATING DESKTOP COMPANION MODE (Living Assistant on Desktop)
  if (desktopMode === 'floating_companion') {
    return (
      <div
        className={`h-screen w-screen overflow-hidden select-none relative flex flex-col justify-between ${theme.id || 'theme-graphite-dark'}`}
        style={{
          ...dynamicStyles,
          background: 'radial-gradient(ellipse at 50% 30%, #172554 0%, #0b132b 50%, #030712 100%)',
        }}
      >
        {/* Windows Desktop Area */}
        <div className="flex-1 p-6 relative">
          <div className="max-w-md p-4 rounded-2xl bg-slate-900/40 border border-slate-700/40 backdrop-blur-md shadow-2xl">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
              <span className="font-bold text-xs text-sky-400 font-mono">NX AI Desktop Companion Active</span>
            </div>
            <p className="text-xs text-slate-300">
              Workstation minimized. Anime character screen par active hai. Aap mouse se usay move kar sakte hain ya voice command de sakte hain.
            </p>
            <button
              onClick={() => setDesktopMode('full_studio')}
              className="mt-3 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-600 text-white font-semibold text-xs transition-all cursor-pointer shadow-lg shadow-sky-500/20"
            >
              <Maximize2 className="w-3.5 h-3.5" />
              <span>Restore 1920x1080 Workstation</span>
            </button>
          </div>

          {/* Desktop Floating Anime Companion */}
          <DesktopCompanion />
        </div>

        {/* Windows Desktop Bottom Taskbar */}
        <div className="h-11 border-t bg-slate-950/90 border-slate-800/80 backdrop-blur-md px-4 flex items-center justify-between text-xs font-mono select-none z-40">
          <div className="flex items-center gap-2">
            {/* Windows Start Icon */}
            <div
              onClick={() => setDesktopMode('full_studio')}
              className="w-7 h-7 rounded-md bg-sky-500/20 border border-sky-400/40 flex items-center justify-center font-bold text-sky-400 cursor-pointer hover:bg-sky-500/30"
              title="NX Start Menu"
            >
              NX
            </div>

            {/* Minimized Taskbar Item */}
            <button
              onClick={() => setDesktopMode('full_studio')}
              className="flex items-center gap-2 px-3 py-1 rounded bg-slate-900 border border-sky-500/50 text-slate-200 hover:bg-slate-800 cursor-pointer"
            >
              <LayoutDashboard className="w-3.5 h-3.5 text-sky-400" />
              <span className="font-semibold text-[11px]">NX AI Workstation</span>
              <span className="text-[10px] text-emerald-400 font-bold px-1.5 py-0.2 rounded bg-emerald-950/80">
                {agentState}
              </span>
            </button>
          </div>

          {/* Taskbar Right Tray (Telemetry & Clock) */}
          <div className="flex items-center gap-3 text-slate-400 text-[11px]">
            <span className="flex items-center gap-1">
              <ShieldCheck className="w-3 h-3 text-emerald-400" />
              <span className="hidden sm:inline">C: Safe</span>
            </span>
            <span className="flex items-center gap-1">
              <Cpu className="w-3 h-3 text-sky-400" />
              <span>{telemetry.cpuLoad}%</span>
            </span>
            <span className="flex items-center gap-1">
              <Activity className="w-3 h-3 text-emerald-400" />
              <span>{(telemetry.ramUsedMB / 1024).toFixed(1)}G</span>
            </span>
            <span className="text-slate-300 font-semibold pl-2 border-l border-slate-800">
              {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        </div>
      </div>
    );
  }

  // 2. FULL 1920x1080 WORKSTATION STUDIO VIEW
  return (
    <div
      className={`flex h-screen w-screen overflow-hidden select-none transition-colors duration-200 ${theme.id || 'theme-graphite-dark'}`}
      style={dynamicStyles}
    >
      {/* 4-Section Sidebar */}
      <Sidebar />

      {/* Main Viewport Container */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden relative">
        {/* Top Header Bar */}
        <TopHeader />

        {/* View Switcher */}
        <main className="flex-1 overflow-hidden relative">
          {activeNav === 'dashboard' && <RealtimeDashboard />}
          {activeNav === 'history' && <StatisticsHistory />}
          {activeNav === 'memory' && <MemoryManager />}
          {activeNav === 'settings' && <SettingsManager />}
        </main>

        {/* Floating / Dockable Anime AI Companion */}
        <DesktopCompanion />
      </div>
    </div>
  );
};

export default function App() {
  return (
    <AgentProvider>
      <AppContent />
    </AgentProvider>
  );
}
