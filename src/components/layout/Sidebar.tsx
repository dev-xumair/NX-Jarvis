/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useAgent } from '../../context/AgentContext.tsx';
import {
  LayoutDashboard,
  BarChart3,
  Brain,
  Settings,
  ShieldCheck,
  Cpu,
  Activity,
  HardDrive,
} from 'lucide-react';

export const Sidebar: React.FC = () => {
  const { activeNav, setActiveNav, agentState, telemetry } = useAgent();

  const navItems = [
    { id: 'dashboard', label: 'Realtime Monitor', icon: LayoutDashboard },
    { id: 'history', label: 'History & Actions', icon: BarChart3 },
    { id: 'memory', label: 'Smart Memory', icon: Brain },
    { id: 'settings', label: 'Settings & Controls', icon: Settings },
  ] as const;

  return (
    <aside
      className="w-64 shrink-0 flex flex-col justify-between border-r select-none h-screen transition-colors duration-200"
      style={{
        backgroundColor: 'var(--bg-surface)',
        borderColor: 'var(--border-subtle)',
      }}
    >
      <div>
        {/* Brand Lockup */}
        <div
          className="h-16 flex items-center px-6 gap-3 border-b"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm tracking-wider"
            style={{
              backgroundColor: 'var(--accent)',
              color: '#ffffff',
            }}
          >
            NX
          </div>
          <div>
            <div className="font-bold text-base tracking-tight leading-none" style={{ color: 'var(--text-main)' }}>
              NX AI
            </div>
            <div className="text-[11px] font-mono mt-1" style={{ color: 'var(--text-muted)' }}>
              Autonomous Companion
            </div>
          </div>
        </div>

        {/* Primary Navigation - Exactly 4 Sections */}
        <nav className="p-3 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeNav === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveNav(item.id)}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 text-left cursor-pointer ${
                  isActive ? 'shadow-sm' : 'hover:bg-[var(--bg-surface-elevated)]'
                }`}
                style={{
                  backgroundColor: isActive ? 'var(--accent)' : 'transparent',
                  color: isActive ? '#ffffff' : 'var(--text-muted)',
                }}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Realtime System Situation Anchor */}
      <div className="p-4 border-t space-y-3" style={{ borderColor: 'var(--border-subtle)' }}>
        <div className="space-y-2 text-xs font-mono">
          {/* C: Drive Protection Indicator */}
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>C: OS Guard</span>
            </span>
            <span className="font-mono text-[11px] text-emerald-400 font-semibold">PROTECTED</span>
          </div>

          {/* Real CPU Telemetry */}
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
              <Cpu className="w-3.5 h-3.5 text-sky-400" />
              <span>CPU Load</span>
            </span>
            <span className="font-mono text-[11px]" style={{ color: 'var(--text-main)' }}>
              {telemetry.cpuLoad}%
            </span>
          </div>

          {/* Real RAM Telemetry */}
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
              <Activity className="w-3.5 h-3.5 text-emerald-400" />
              <span>RAM</span>
            </span>
            <span className="font-mono text-[11px]" style={{ color: 'var(--text-main)' }}>
              {(telemetry.ramUsedMB / 1024).toFixed(1)} GB / {(telemetry.ramTotalMB / 1024).toFixed(1)} GB
            </span>
          </div>
        </div>

        {/* Live Agent Operational State Badge */}
        <div
          className="p-2.5 rounded-lg text-xs flex items-center justify-between"
          style={{
            backgroundColor: 'var(--bg-app)',
            border: '1px solid var(--border-subtle)',
          }}
        >
          <span className="text-[11px] font-mono tracking-wide" style={{ color: 'var(--text-muted)' }}>
            AGENT
          </span>
          <span
            className="font-mono text-xs font-bold px-2 py-0.5 rounded"
            style={{
              backgroundColor:
                agentState === 'EXECUTING'
                  ? 'rgba(56, 189, 248, 0.15)'
                  : agentState === 'THINKING'
                  ? 'rgba(245, 158, 11, 0.15)'
                  : agentState === 'LISTENING'
                  ? 'rgba(16, 185, 129, 0.15)'
                  : 'rgba(148, 163, 184, 0.15)',
              color:
                agentState === 'EXECUTING'
                  ? 'var(--accent)'
                  : agentState === 'THINKING'
                  ? '#f59e0b'
                  : agentState === 'LISTENING'
                  ? '#10b981'
                  : 'var(--text-muted)',
            }}
          >
            {agentState}
          </span>
        </div>
      </div>
    </aside>
  );
};
