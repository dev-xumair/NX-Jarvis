/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { useAgent } from '../../context/AgentContext.tsx';
import {
  Brain,
  Search,
  Trash2,
  ShieldCheck,
  Plus,
  Layers,
  Lock,
} from 'lucide-react';
import type { MemoryLayer } from '../../types/agent.ts';

export const MemoryManager: React.FC = () => {
  const { memories, deleteMemory } = useAgent();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLayer, setSelectedLayer] = useState<'ALL' | MemoryLayer>('ALL');

  const filteredMemories = memories.filter((m) => {
    const matchesSearch = m.content.toLowerCase().includes(searchTerm.toLowerCase());
    if (!matchesSearch) return false;
    if (selectedLayer !== 'ALL' && m.layer !== selectedLayer) return false;
    return true;
  });

  const layersList: Array<{ id: 'ALL' | MemoryLayer; label: string; desc: string }> = [
    { id: 'ALL', label: 'All Layers', desc: 'Complete 7-layer memory store' },
    { id: 'PREFERENCE', label: 'Preferences', desc: 'Directives & recurring instructions' },
    { id: 'LONG_TERM', label: 'Long Term', desc: 'Verified shop facts & client specs' },
    { id: 'OPERATIONAL', label: 'Operational', desc: 'Learned workflow paths & tool performance' },
    { id: 'TASK', label: 'Task', desc: 'Persistent checkpoints & manifests' },
    { id: 'WORKING', label: 'Working', desc: 'Volatile RAM conversation state' },
    { id: 'EVENT', label: 'Event (FTS5)', desc: 'Operational chronological activities' },
    { id: 'SEMANTIC', label: 'Semantic', desc: 'Domain knowledge & search embeddings' },
  ];

  return (
    <div className="flex-1 flex flex-col h-[calc(100vh-4rem)] p-6 overflow-y-auto select-none space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight" style={{ color: 'var(--text-main)' }}>
            7-Layer Contextual Memory Engine
          </h1>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
            NX autonomously organizes knowledge into 7 distinct cognitive memory layers. Passwords, OTPs, CNICs, and API keys are automatically scrubbed.
          </p>
        </div>
        <div className="flex items-center gap-2 font-mono text-xs">
          <span className="text-slate-500">Indexed Memories:</span>
          <span className="font-semibold text-sky-400">{memories.length}</span>
        </div>
      </div>

      {/* Security & Intelligence Policy Card */}
      <div
        className="p-4 rounded-xl border flex items-start gap-3.5 text-xs font-mono"
        style={{
          backgroundColor: 'rgba(56, 189, 248, 0.06)',
          borderColor: 'rgba(56, 189, 248, 0.25)',
          color: 'var(--text-main)',
        }}
      >
        <ShieldCheck className="w-5 h-5 text-sky-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <div className="font-bold text-sky-400">AUTOMATIC SECRET SCRUBBING & RECURRENT INTENT GUARD</div>
          <p className="text-slate-400 leading-relaxed font-sans text-xs">
            Commands with permanent intent (&ldquo;Har dafa ye folder backup karna&rdquo;) commit directly to the PREFERENCE layer.
            Temporary tasks remain ephemeral in WORKING memory. Passwords, PINs, CNICs, and OTPs are redacted with [REDACTED_SECRET].
          </p>
        </div>
      </div>

      {/* Memory List Panel */}
      <div
        className="rounded-xl border flex flex-col flex-1 overflow-hidden"
        style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
      >
        {/* Search & Filter Header */}
        <div className="p-4 border-b flex flex-wrap items-center justify-between gap-4" style={{ borderColor: 'var(--border-subtle)' }}>
          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search across all 7 memory layers..."
              className="w-full pl-9 pr-3.5 py-1.5 rounded-lg text-xs outline-none"
              style={{
                backgroundColor: 'var(--bg-app)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-main)',
              }}
            />
          </div>

          <div className="flex items-center gap-1.5 text-xs overflow-x-auto max-w-2xl py-1">
            {layersList.map((layer) => (
              <button
                key={layer.id}
                onClick={() => setSelectedLayer(layer.id)}
                className={`px-2.5 py-1 rounded-lg font-medium transition-all text-xs whitespace-nowrap cursor-pointer ${
                  selectedLayer === layer.id ? 'text-white font-semibold shadow' : 'hover:opacity-80'
                }`}
                style={{
                  backgroundColor: selectedLayer === layer.id ? 'var(--accent)' : 'var(--bg-app)',
                  color: selectedLayer === layer.id ? '#ffffff' : 'var(--text-muted)',
                  border: '1px solid var(--border-subtle)',
                }}
                title={layer.desc}
              >
                {layer.label}
              </button>
            ))}
          </div>
        </div>

        {/* Memory Items List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {filteredMemories.length === 0 ? (
            <div className="text-center py-12 text-slate-500 text-xs font-mono">
              No memory items in this layer. Tell Saba a rule like &ldquo;Hamesha media verify karna&rdquo; to populate smart memory.
            </div>
          ) : (
            filteredMemories.map((mem) => (
              <div
                key={mem.id}
                className="p-4 rounded-xl border flex items-start justify-between gap-4 transition-all hover:border-slate-700"
                style={{
                  backgroundColor: 'var(--bg-app)',
                  borderColor: 'var(--border-subtle)',
                }}
              >
                <div className="space-y-1.5 flex-1 font-mono">
                  <div className="flex items-center gap-2">
                    <span
                      className="text-[10px] px-2 py-0.5 rounded font-semibold"
                      style={{
                        backgroundColor:
                          mem.layer === 'PREFERENCE'
                            ? 'rgba(16, 185, 129, 0.15)'
                            : mem.layer === 'LONG_TERM'
                            ? 'rgba(168, 85, 247, 0.15)'
                            : 'rgba(56, 189, 248, 0.15)',
                        color:
                          mem.layer === 'PREFERENCE'
                            ? '#10b981'
                            : mem.layer === 'LONG_TERM'
                            ? '#a855f7'
                            : '#38bdf8',
                      }}
                    >
                      LAYER: {mem.layer || 'PREFERENCE'}
                    </span>
                    <span className="text-[11px] text-slate-500">
                      Confidence: {Math.round((mem.confidence || 1) * 100)}% · Learned: {new Date(mem.createdAt).toLocaleDateString()}
                    </span>
                    {mem.isSensitiveRedacted && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-800">
                        SECRET SCRUBBED
                      </span>
                    )}
                  </div>

                  <p className="text-xs leading-relaxed font-sans" style={{ color: 'var(--text-main)' }}>
                    {mem.content}
                  </p>
                </div>

                <button
                  onClick={() => deleteMemory(mem.id)}
                  className="p-1.5 text-slate-500 hover:text-rose-400 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
                  title="Forget this memory item"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
