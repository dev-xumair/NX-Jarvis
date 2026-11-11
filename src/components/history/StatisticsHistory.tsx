/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { useAgent } from '../../context/AgentContext.tsx';
import {
  BarChart3,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  HardDrive,
  Cpu,
  Search,
  ShieldCheck,
  Zap,
  Download,
  MousePointer,
  Keyboard,
  FolderOpen,
  Layers,
  ArrowRight,
} from 'lucide-react';
import type { ActionCategory } from '../../types/agent.ts';

export const StatisticsHistory: React.FC = () => {
  const { historyTasks, recentActions, providerProfiles, telemetry } = useAgent();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState<'ALL' | 'STORAGE' | 'HUMAN_EMULATION' | 'APPS'>('ALL');

  const completedCount = historyTasks.filter((t) => t.status === 'COMPLETED').length;
  const verifiedActionsCount = recentActions.filter((a) => a.status === 'VERIFIED').length;
  const storageOperationsCount = recentActions.filter((a) => a.category === 'STORAGE_OPERATION').length;

  const filteredActions = recentActions.filter((act) => {
    const matchesSearch =
      act.summary.toLowerCase().includes(searchTerm.toLowerCase()) ||
      act.target.toLowerCase().includes(searchTerm.toLowerCase()) ||
      act.category.toLowerCase().includes(searchTerm.toLowerCase());

    if (!matchesSearch) return false;
    if (filterCategory === 'STORAGE') return act.category === 'STORAGE_OPERATION' || act.category === 'FILE_EXPLORER';
    if (filterCategory === 'HUMAN_EMULATION') {
      return (
        act.category === 'MOUSE_CLICK' ||
        act.category === 'MOUSE_MOVE' ||
        act.category === 'KEYBOARD_TYPE' ||
        act.category === 'KEYBOARD_HOTKEY'
      );
    }
    if (filterCategory === 'APPS') {
      return act.category === 'LAUNCH_APP' || act.category === 'BROWSER_AUTOMATION' || act.category === 'WINDOW_CONTROL';
    }
    return true;
  });

  const handleExportAuditLogs = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      agentRole: 'NX AI Autonomous Windows Agent',
      liveTelemetry: telemetry,
      recentActionsCount: recentActions.length,
      historyTasksCount: historyTasks.length,
      recentActions,
      historyTasks,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nx_ai_audit_trail_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const getCategoryIcon = (category: ActionCategory) => {
    switch (category) {
      case 'MOUSE_CLICK':
      case 'MOUSE_MOVE':
        return <MousePointer className="w-3.5 h-3.5 text-sky-400" />;
      case 'KEYBOARD_TYPE':
      case 'KEYBOARD_HOTKEY':
        return <Keyboard className="w-3.5 h-3.5 text-amber-400" />;
      case 'FILE_EXPLORER':
      case 'STORAGE_OPERATION':
        return <HardDrive className="w-3.5 h-3.5 text-emerald-400" />;
      default:
        return <Layers className="w-3.5 h-3.5 text-violet-400" />;
    }
  };

  return (
    <div className="flex-1 flex flex-col h-[calc(100vh-4rem)] p-6 overflow-y-auto select-none space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight" style={{ color: 'var(--text-main)' }}>
            Autonomous Execution & Audit Trail
          </h1>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
            Real-time breakdown of autonomous actions, mouse/keyboard human emulation fallback, multi-storage transfers, and completed workflows.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 font-mono text-xs">
            <span className="text-slate-500">Recorded Actions:</span>
            <span className="font-semibold text-sky-400">{recentActions.length}</span>
          </div>

          <button
            onClick={handleExportAuditLogs}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold hover:opacity-90 transition-all cursor-pointer text-slate-300"
            style={{
              backgroundColor: 'var(--bg-surface-elevated)',
              borderColor: 'var(--border-subtle)',
            }}
          >
            <Download className="w-3.5 h-3.5 text-sky-400" />
            <span>Export Audit Trail (JSON)</span>
          </button>
        </div>
      </div>

      {/* KPI Metric Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div
          className="p-4 rounded-xl border flex flex-col gap-1"
          style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
        >
          <span className="text-xs font-medium" style={{ color: 'var(--text-dim)' }}>
            Completed Tasks
          </span>
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-2xl font-bold text-emerald-400">{completedCount}</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          </div>
          <span className="text-[11px] text-slate-500 font-mono">100% verified state before reporting</span>
        </div>

        <div
          className="p-4 rounded-xl border flex flex-col gap-1"
          style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
        >
          <span className="text-xs font-medium" style={{ color: 'var(--text-dim)' }}>
            Verified Micro-Actions
          </span>
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-2xl font-bold text-sky-400">{verifiedActionsCount}</span>
            <ShieldCheck className="w-4 h-4 text-sky-400 shrink-0" />
          </div>
          <span className="text-[11px] text-slate-500 font-mono">Autonomous action safety gate</span>
        </div>

        <div
          className="p-4 rounded-xl border flex flex-col gap-1"
          style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
        >
          <span className="text-xs font-medium" style={{ color: 'var(--text-dim)' }}>
            Storage Operations
          </span>
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-2xl font-bold text-amber-400">{storageOperationsCount}</span>
            <HardDrive className="w-4 h-4 text-amber-400 shrink-0" />
          </div>
          <span className="text-[11px] text-slate-500 font-mono">C: drive permanently protected</span>
        </div>

        <div
          className="p-4 rounded-xl border flex flex-col gap-1"
          style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
        >
          <span className="text-xs font-medium" style={{ color: 'var(--text-dim)' }}>
            Active AI Engine
          </span>
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-2xl font-bold" style={{ color: 'var(--text-main)' }}>
              {providerProfiles.length}
            </span>
            <Zap className="w-4 h-4 text-sky-400 shrink-0" />
          </div>
          <span className="text-[11px] text-slate-500 font-mono">Multi-Gemini Quota Auto-Failover</span>
        </div>
      </div>

      {/* Task & Action Audit Table with Search & Filter */}
      <div
        className="rounded-xl border flex flex-col flex-1 overflow-hidden"
        style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
      >
        {/* Table Controls */}
        <div className="p-4 border-b flex flex-wrap items-center justify-between gap-4" style={{ borderColor: 'var(--border-subtle)' }}>
          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search actions by target, summary, or category..."
              className="w-full pl-9 pr-3.5 py-1.5 rounded-lg text-xs outline-none"
              style={{
                backgroundColor: 'var(--bg-app)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-main)',
              }}
            />
          </div>

          <div className="flex items-center gap-1.5 text-xs">
            {(['ALL', 'STORAGE', 'HUMAN_EMULATION', 'APPS'] as const).map((cat) => (
              <button
                key={cat}
                onClick={() => setFilterCategory(cat)}
                className={`px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
                  filterCategory === cat ? 'text-white font-semibold' : 'hover:opacity-80'
                }`}
                style={{
                  backgroundColor: filterCategory === cat ? 'var(--accent)' : 'var(--bg-app)',
                  color: filterCategory === cat ? '#ffffff' : 'var(--text-muted)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                {cat.replace('_', ' ')}
              </button>
            ))}
          </div>
        </div>

        {/* Action Log Table */}
        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr
                className="border-b font-mono text-[11px] uppercase tracking-wider"
                style={{
                  backgroundColor: 'var(--bg-surface-elevated)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-dim)',
                }}
              >
                <th className="py-2.5 px-4">Time</th>
                <th className="py-2.5 px-4">Category</th>
                <th className="py-2.5 px-4">Execution Target</th>
                <th className="py-2.5 px-4">Method</th>
                <th className="py-2.5 px-4">Status</th>
                <th className="py-2.5 px-4">Summary & Details</th>
              </tr>
            </thead>
            <tbody className="divide-y font-mono" style={{ borderColor: 'var(--border-subtle)' }}>
              {filteredActions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">
                    No matching autonomous actions recorded yet. Give a voice or chat command to start execution!
                  </td>
                </tr>
              ) : (
                filteredActions.map((action) => (
                  <tr
                    key={action.id}
                    className="hover:bg-[var(--bg-surface-elevated)] transition-colors"
                  >
                    <td className="py-3 px-4 text-slate-500 whitespace-nowrap">
                      {new Date(action.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        {getCategoryIcon(action.category)}
                        <span className="text-slate-300 font-semibold">{action.category}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className="text-sky-400 font-mono font-medium">{action.target}</span>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span
                        className="text-[10px] px-2 py-0.5 rounded font-mono"
                        style={{
                          backgroundColor:
                            action.interactionDetails?.method === 'human_emulation'
                              ? 'rgba(245, 158, 11, 0.15)'
                              : 'rgba(56, 189, 248, 0.15)',
                          color:
                            action.interactionDetails?.method === 'human_emulation'
                              ? '#f59e0b'
                              : '#38bdf8',
                        }}
                      >
                        {action.interactionDetails?.method === 'human_emulation' ? 'MOUSE / KEYBOARD' : 'DIRECT API'}
                      </span>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span
                        className={`text-[11px] font-semibold ${
                          action.status === 'VERIFIED'
                            ? 'text-emerald-400'
                            : action.status === 'RUNNING'
                            ? 'text-sky-400 animate-pulse'
                            : action.status === 'FAILED'
                            ? 'text-rose-400'
                            : 'text-slate-400'
                        }`}
                      >
                        {action.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 truncate max-w-md" style={{ color: 'var(--text-main)' }}>
                      <span>{action.summary}</span>
                      {action.interactionDetails?.coords && (
                        <span className="text-slate-500 ml-1.5 text-[11px]">
                          (x: {action.interactionDetails.coords.x}, y: {action.interactionDetails.coords.y})
                        </span>
                      )}
                      {action.interactionDetails?.keystroke && (
                        <span className="text-slate-500 ml-1.5 text-[11px]">
                          [{action.interactionDetails.keystroke}]
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
