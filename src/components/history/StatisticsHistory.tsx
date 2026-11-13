/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { useAgent } from '../../context/AgentContext.tsx';
import {
  CheckCircle2,
  HardDrive,
  Search,
  ShieldCheck,
  Zap,
  Download,
  Layers,
  Globe,
  Smartphone,
} from 'lucide-react';
import type { ActionCategory } from '../../types/agent.ts';
import { NxButton, NxCard, NxSectionHeader, NxStatusText } from '../ui/NxPrimitives.tsx';

export const StatisticsHistory: React.FC = () => {
  const { historyTasks, recentActions, auditLogs, providerProfiles, telemetry } = useAgent();
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'ACTIONS' | 'AUDIT'>('ACTIONS');
  const [filterCategory, setFilterCategory] = useState<'ALL' | 'STORAGE' | 'APPS' | 'POLICY' | 'MODEL'>('ALL');

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
    if (filterCategory === 'APPS') {
      return (
        act.category === 'LAUNCH_APP' ||
        act.category === 'BROWSER_AUTOMATION' ||
        act.category === 'WINDOW_CONTROL' ||
        act.category === 'MOBILE_BRIDGE'
      );
    }
    if (filterCategory === 'POLICY') return act.category === 'POLICY_GUARD';
    if (filterCategory === 'MODEL') return act.category === 'MODEL_INFERENCE';
    return true;
  });

  const handleExportAuditLogs = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      product: 'NX AI — Autonomous Windows Agent',
      telemetry,
      historyTasks,
      recentActions,
      auditLogs,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nx_ai_audit_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const getCategoryIcon = (category: ActionCategory) => {
    switch (category) {
      case 'STORAGE_OPERATION':
      case 'FILE_EXPLORER':
        return <HardDrive className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--status-success)' }} />;
      case 'BROWSER_AUTOMATION':
      case 'LAUNCH_APP':
        return <Globe className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--accent)' }} />;
      case 'MOBILE_BRIDGE':
        return <Smartphone className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--status-warning)' }} />;
      case 'POLICY_GUARD':
        return <ShieldCheck className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--status-danger)' }} />;
      default:
        return <Layers className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--text-muted)' }} />;
    }
  };

  return (
    <div className="space-y-5 min-w-0">
      <NxSectionHeader
        title="Task Ledgers & Audit Trail"
        subtitle="Verified task execution records, worker assignments, policy blocks, and evidence summaries."
        action={
          <NxButton variant="secondary" onClick={handleExportAuditLogs}>
            <Download className="w-3.5 h-3.5" />
            <span>Export JSON Audit</span>
          </NxButton>
        }
      />

      {/* KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        <NxCard className="p-4 space-y-1">
          <span className="text-[11px] font-mono uppercase" style={{ color: 'var(--text-muted)' }}>
            Completed Tasks
          </span>
          <div className="flex items-center justify-between">
            <span className="font-mono text-2xl font-bold tabular-nums" style={{ color: 'var(--status-success)' }}>
              {completedCount}
            </span>
            <CheckCircle2 className="w-4 h-4" style={{ color: 'var(--status-success)' }} />
          </div>
          <span className="text-[11px] font-mono" style={{ color: 'var(--text-muted)' }}>
            {historyTasks.length} total recorded
          </span>
        </NxCard>

        <NxCard className="p-4 space-y-1">
          <span className="text-[11px] font-mono uppercase" style={{ color: 'var(--text-muted)' }}>
            Verified Actions
          </span>
          <div className="flex items-center justify-between">
            <span className="font-mono text-2xl font-bold tabular-nums" style={{ color: 'var(--accent)' }}>
              {verifiedActionsCount}
            </span>
            <ShieldCheck className="w-4 h-4" style={{ color: 'var(--accent)' }} />
          </div>
          <span className="text-[11px] font-mono" style={{ color: 'var(--text-muted)' }}>
            Evidence-checked operations
          </span>
        </NxCard>

        <NxCard className="p-4 space-y-1">
          <span className="text-[11px] font-mono uppercase" style={{ color: 'var(--text-muted)' }}>
            Storage Operations
          </span>
          <div className="flex items-center justify-between">
            <span className="font-mono text-2xl font-bold tabular-nums" style={{ color: 'var(--status-warning)' }}>
              {storageOperationsCount}
            </span>
            <HardDrive className="w-4 h-4" style={{ color: 'var(--status-warning)' }} />
          </div>
          <span className="text-[11px] font-mono" style={{ color: 'var(--text-muted)' }}>
            OS volume protected
          </span>
        </NxCard>

        <NxCard className="p-4 space-y-1">
          <span className="text-[11px] font-mono uppercase" style={{ color: 'var(--text-muted)' }}>
            Provider Profiles
          </span>
          <div className="flex items-center justify-between">
            <span className="font-mono text-2xl font-bold tabular-nums" style={{ color: 'var(--text-main)' }}>
              {providerProfiles.length}
            </span>
            <Zap className="w-4 h-4" style={{ color: 'var(--accent)' }} />
          </div>
          <span className="text-[11px] font-mono" style={{ color: 'var(--text-muted)' }}>
            Project-aware quota pools
          </span>
        </NxCard>
      </div>

      {/* Filterable Action Log / Persisted Audit Logs */}
      <NxCard className="min-h-[280px] flex flex-col overflow-hidden">
        <div
          className="p-3.5 border-b flex flex-wrap items-center justify-between gap-3"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[220px]">
            <div className="flex items-center gap-1">
              <NxButton
                size="sm"
                variant={viewMode === 'ACTIONS' ? 'primary' : 'secondary'}
                onClick={() => setViewMode('ACTIONS')}
              >
                Action Log ({recentActions.length})
              </NxButton>
              <NxButton
                size="sm"
                variant={viewMode === 'AUDIT' ? 'primary' : 'secondary'}
                onClick={() => setViewMode('AUDIT')}
              >
                Audit Logs ({auditLogs.length})
              </NxButton>
            </div>
            <div className="relative flex-1 min-w-[180px] max-w-sm">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5" style={{ color: 'var(--text-muted)' }} />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={viewMode === 'ACTIONS' ? 'Filter actions...' : 'Filter persisted audit logs...'}
                className="w-full pl-8 pr-3 py-1.5 rounded-md border text-xs outline-none"
                style={{
                  backgroundColor: 'var(--bg-app)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-main)',
                }}
              />
            </div>
          </div>

          {viewMode === 'ACTIONS' && (
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              {(['ALL', 'STORAGE', 'APPS', 'POLICY', 'MODEL'] as const).map((cat) => (
                <NxButton
                  key={cat}
                  size="sm"
                  variant={filterCategory === cat ? 'primary' : 'secondary'}
                  onClick={() => setFilterCategory(cat)}
                >
                  {cat}
                </NxButton>
              ))}
            </div>
          )}
        </div>

        <div className="overflow-x-auto">
          {viewMode === 'ACTIONS' ? (
            <table className="w-full text-left text-xs border-collapse min-w-[640px]">
              <thead>
                <tr
                  className="border-b font-mono text-[11px] uppercase tracking-wider"
                  style={{
                    backgroundColor: 'var(--bg-surface-elevated)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-muted)',
                  }}
                >
                  <th className="py-2.5 px-4">Time</th>
                  <th className="py-2.5 px-4">Category</th>
                  <th className="py-2.5 px-4">Worker</th>
                  <th className="py-2.5 px-4">Target</th>
                  <th className="py-2.5 px-4">Status</th>
                  <th className="py-2.5 px-4">Summary</th>
                </tr>
              </thead>
              <tbody className="divide-y font-mono tabular-nums" style={{ borderColor: 'var(--border-subtle)' }}>
                {filteredActions.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
                      No matching actions recorded yet.
                    </td>
                  </tr>
                ) : (
                  filteredActions.map((action) => (
                    <tr key={action.id} style={{ borderColor: 'var(--border-subtle)' }}>
                      <td className="py-2.5 px-4 whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>
                        {new Date(action.startedAt).toLocaleTimeString()}
                      </td>
                      <td className="py-2.5 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          {getCategoryIcon(action.category)}
                          <span style={{ color: 'var(--text-main)' }}>{action.category}</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-4 whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>
                        {action.workerId || 'orchestrator'}
                      </td>
                      <td className="py-2.5 px-4 max-w-[160px] nx-wrap-anywhere" style={{ color: 'var(--accent)' }}>
                        {action.target}
                      </td>
                      <td className="py-2.5 px-4 whitespace-nowrap">
                        <NxStatusText status={action.status} />
                      </td>
                      <td className="py-2.5 px-4 font-sans max-w-md nx-wrap-anywhere" style={{ color: 'var(--text-main)' }}>
                        {action.summary}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-left text-xs border-collapse min-w-[640px]">
              <thead>
                <tr
                  className="border-b font-mono text-[11px] uppercase tracking-wider"
                  style={{
                    backgroundColor: 'var(--bg-surface-elevated)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-muted)',
                  }}
                >
                  <th className="py-2.5 px-4">Time</th>
                  <th className="py-2.5 px-4">Level</th>
                  <th className="py-2.5 px-4">Subsystem</th>
                  <th className="py-2.5 px-4">Correlation</th>
                  <th className="py-2.5 px-4">Message (Scrubbed)</th>
                </tr>
              </thead>
              <tbody className="divide-y font-mono tabular-nums" style={{ borderColor: 'var(--border-subtle)' }}>
                {auditLogs
                  .filter(
                    (l) =>
                      !searchTerm ||
                      l.message.toLowerCase().includes(searchTerm.toLowerCase()) ||
                      l.level.toLowerCase().includes(searchTerm.toLowerCase()) ||
                      l.subsystem.toLowerCase().includes(searchTerm.toLowerCase())
                  )
                  .map((entry) => (
                    <tr key={entry.id} style={{ borderColor: 'var(--border-subtle)' }}>
                      <td className="py-2.5 px-4 whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>
                        {new Date(entry.timestamp).toLocaleTimeString()}
                      </td>
                      <td className="py-2.5 px-4 whitespace-nowrap">
                        <NxStatusText
                          status={entry.level === 'SECURITY' || entry.level === 'ERROR' ? 'BLOCKED' : entry.level}
                        />
                      </td>
                      <td className="py-2.5 px-4 whitespace-nowrap" style={{ color: 'var(--accent)' }}>
                        {entry.subsystem}
                      </td>
                      <td className="py-2.5 px-4 whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>
                        {entry.correlationId || '—'}
                      </td>
                      <td className="py-2.5 px-4 font-sans max-w-lg nx-wrap-anywhere" style={{ color: 'var(--text-main)' }}>
                        {entry.message}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </div>
      </NxCard>
    </div>
  );
};
