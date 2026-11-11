/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useAgent } from '../../context/AgentContext.tsx';
import {
  Mic,
  MessageSquare,
  Sun,
  Moon,
  Sparkles,
  Volume2,
  Eye,
  EyeOff,
  Minus,
  Square,
  X,
  Monitor,
  User,
} from 'lucide-react';

export const TopHeader: React.FC = () => {
  const {
    agentState,
    interactionMode,
    setInteractionMode,
    theme,
    updateTheme,
    companion,
    controlCompanion,
    desktopMode,
    setDesktopMode,
    isSpeaking,
  } = useAgent();

  const handleQuickTheme = (preset: 'dark' | 'light' | 'oled') => {
    if (preset === 'dark') {
      updateTheme({
        id: 'theme-graphite-dark',
        name: 'Graphite Dark',
        mode: 'dark',
        accentColor: '#38bdf8',
        bgCanvas: '#0c1017',
        surfaceColor: '#141b24',
        surfaceElevated: '#1b2431',
        textColor: '#f1f5f9',
        textMuted: '#94a3b8',
        borderColor: '#263345',
      });
    } else if (preset === 'light') {
      updateTheme({
        id: 'theme-google-light',
        name: 'Google Light',
        mode: 'light',
        accentColor: '#0284c7',
        bgCanvas: '#f8fafc',
        surfaceColor: '#ffffff',
        surfaceElevated: '#f1f5f9',
        textColor: '#0f172a',
        textMuted: '#64748b',
        borderColor: '#e2e8f0',
      });
    } else {
      updateTheme({
        id: 'theme-midnight-ai',
        name: 'Midnight OLED',
        mode: 'oled',
        accentColor: '#818cf8',
        bgCanvas: '#000000',
        surfaceColor: '#0a0d14',
        surfaceElevated: '#111726',
        textColor: '#f8fafc',
        textMuted: '#94a3b8',
        borderColor: '#1e293b',
      });
    }
  };

  const isCompanionHidden = companion.dockPosition === 'hidden';

  return (
    <header
      className="h-14 px-5 flex items-center justify-between gap-4 border-b select-none shrink-0 transition-colors duration-200"
      style={{
        backgroundColor: 'var(--bg-surface)',
        borderColor: 'var(--border-subtle)',
      }}
    >
      {/* Zone 1: Windows App Wordmark & Live Agent State */}
      <div className="flex items-center gap-3 shrink-0">
        <div className="flex items-center gap-2">
          <span className="font-bold text-sm tracking-tight" style={{ color: 'var(--text-main)' }}>
            NX AI
          </span>
          <span
            className="text-[10px] px-2 py-0.5 rounded font-mono hidden sm:inline-block border"
            style={{
              backgroundColor: 'var(--bg-surface-elevated)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-dim)',
            }}
          >
            Windows PC v3.0
          </span>
        </div>

        {/* Live Agent State Indicator */}
        <div
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono border"
          style={{
            backgroundColor: 'var(--bg-surface-elevated)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          <span
            className={`w-2 h-2 rounded-full ${
              agentState === 'LISTENING'
                ? 'bg-emerald-400 animate-ping'
                : agentState === 'THINKING'
                ? 'bg-amber-400 animate-pulse'
                : agentState === 'EXECUTING'
                ? 'bg-sky-400 animate-spin'
                : agentState === 'SPEAKING'
                ? 'bg-violet-400 animate-pulse'
                : 'bg-emerald-500'
            }`}
          />
          <span className="font-semibold text-slate-300">
            {agentState}
          </span>
        </div>
      </div>

      {/* Zone 2: Realtime Spoken Thought or Mandate */}
      <div className="hidden lg:flex items-center gap-3 overflow-hidden text-xs max-w-md">
        {isSpeaking ? (
          <span className="flex items-center gap-2 px-3 py-1 rounded-lg text-xs font-mono text-sky-300 bg-sky-950/40 border border-sky-800/50 animate-pulse shrink-0 truncate">
            <Volume2 className="w-3.5 h-3.5 text-sky-400 shrink-0" />
            <span className="truncate">&ldquo;{companion.lastSpokenPhrase}&rdquo;</span>
          </span>
        ) : (
          <span
            className="italic font-medium truncate"
            style={{ color: 'var(--text-muted)' }}
          >
            &ldquo;Kaam karo, verify karo, phir bolo&rdquo;
          </span>
        )}
      </div>

      {/* Zone 3: Windows Desktop Mode Switch, Companion Controls & Window Controls */}
      <div className="flex items-center gap-2.5 shrink-0">
        {/* Workstation Studio vs Floating Desktop Mode Toggle */}
        <button
          onClick={() =>
            setDesktopMode(desktopMode === 'full_studio' ? 'floating_companion' : 'full_studio')
          }
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-medium transition-all cursor-pointer ${
            desktopMode === 'floating_companion'
              ? 'bg-sky-950 border-sky-500 text-sky-300 shadow-sm'
              : 'hover:bg-slate-800 text-slate-300'
          }`}
          style={{
            backgroundColor: desktopMode === 'floating_companion' ? undefined : 'var(--bg-app)',
            borderColor: desktopMode === 'floating_companion' ? undefined : 'var(--border-subtle)',
          }}
          title={
            desktopMode === 'floating_companion'
              ? 'Restore Full 1920x1080 Workstation'
              : 'Switch to Desktop Floating Companion Mode (Minimize window)'
          }
        >
          <Monitor className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">
            {desktopMode === 'floating_companion' ? 'Full Studio' : 'Desktop Mode'}
          </span>
        </button>

        {/* Anime Companion Quick Dock Toggle */}
        <button
          onClick={() => {
            if (isCompanionHidden) {
              controlCompanion({ dockPosition: 'dock_bottom_right', command: 'restore' });
            } else {
              controlCompanion({ dockPosition: 'side_right', command: 'dock_side' });
            }
          }}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-medium transition-all cursor-pointer text-slate-300 hover:bg-slate-800"
          style={{
            backgroundColor: 'var(--bg-app)',
            borderColor: 'var(--border-subtle)',
          }}
          title={isCompanionHidden ? 'NX Samne Aao' : 'Side mein chup ja'}
        >
          {isCompanionHidden ? (
            <>
              <Eye className="w-3.5 h-3.5 text-slate-400" />
              <span className="hidden md:inline">Samne Aao</span>
            </>
          ) : (
            <>
              <User className="w-3.5 h-3.5 text-emerald-400" />
              <span className="hidden md:inline">Side Dock</span>
            </>
          )}
        </button>

        {/* Quick Theme Switcher */}
        <div
          className="flex items-center p-0.5 rounded-lg border text-xs"
          style={{
            backgroundColor: 'var(--bg-app)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          <button
            onClick={() => handleQuickTheme('dark')}
            title="Dark Theme"
            className={`p-1 rounded-md transition-all cursor-pointer ${
              theme.mode === 'dark' ? 'shadow-sm text-sky-400' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            <Moon className="w-3 h-3" />
          </button>
          <button
            onClick={() => handleQuickTheme('light')}
            title="Light Theme"
            className={`p-1 rounded-md transition-all cursor-pointer ${
              theme.mode === 'light' ? 'shadow-sm text-amber-500' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            <Sun className="w-3 h-3" />
          </button>
          <button
            onClick={() => handleQuickTheme('oled')}
            title="Midnight OLED"
            className={`p-1 rounded-md transition-all cursor-pointer ${
              theme.mode === 'oled' ? 'shadow-sm text-indigo-400' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            <Sparkles className="w-3 h-3" />
          </button>
        </div>

        {/* Windows Standard Titlebar Window Controls */}
        <div className="flex items-center ml-2 border-l pl-2 space-x-1" style={{ borderColor: 'var(--border-subtle)' }}>
          <button
            onClick={() => setDesktopMode('floating_companion')}
            className="p-1 rounded hover:bg-slate-800 transition-colors cursor-pointer text-slate-400 hover:text-white"
            title="Minimize to Desktop Companion"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setDesktopMode('full_studio')}
            className="p-1 rounded hover:bg-slate-800 transition-colors cursor-pointer text-slate-400 hover:text-white"
            title="Maximize 1920x1080 Viewport"
          >
            <Square className="w-3 h-3" />
          </button>
          <button
            onClick={() => controlCompanion({ dockPosition: 'hidden' })}
            className="p-1 rounded hover:bg-rose-950 transition-colors cursor-pointer text-slate-400 hover:text-rose-400"
            title="Close / Hide"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </header>
  );
};
