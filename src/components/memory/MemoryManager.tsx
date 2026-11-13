/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { useAgent } from '../../context/AgentContext.tsx';
import { Search, Trash2, ShieldCheck, Plus, Edit2, Check, X } from 'lucide-react';
import type { MemoryLayer } from '../../types/agent.ts';
import { NxButton, NxCard, NxSectionHeader } from '../ui/NxPrimitives.tsx';

export const MemoryManager: React.FC = () => {
  const { memories, addMemoryItem, updateMemoryItem, deleteMemory } = useAgent();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLayer, setSelectedLayer] = useState<'ALL' | MemoryLayer>('ALL');
  const [newContent, setNewContent] = useState('');
  const [newLayer, setNewLayer] = useState<MemoryLayer>('PREFERENCE');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState('');
  const [editingLayer, setEditingLayer] = useState<MemoryLayer>('PREFERENCE');
  const [feedback, setFeedback] = useState<string | null>(null);

  const filteredMemories = memories.filter((m) => {
    const matchesSearch = m.content.toLowerCase().includes(searchTerm.toLowerCase());
    if (!matchesSearch) return false;
    if (selectedLayer !== 'ALL' && m.layer !== selectedLayer) return false;
    return true;
  });

  const handleAddMemory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newContent.trim()) return;
    setFeedback(null);
    const res = await addMemoryItem(newContent.trim(), newLayer);
    if (!res.ok) {
      setFeedback(res.error || 'Memory entry rejected.');
      return;
    }
    setNewContent('');
  };

  const handleSaveEdit = async (id: string) => {
    if (!editingContent.trim()) return;
    setFeedback(null);
    const res = await updateMemoryItem(id, { content: editingContent.trim(), layer: editingLayer });
    if (!res.ok) {
      setFeedback(res.error || 'Failed to update memory.');
      return;
    }
    setEditingId(null);
  };

  const layersList: Array<{ id: 'ALL' | MemoryLayer; label: string }> = [
    { id: 'ALL', label: 'All Layers' },
    { id: 'PREFERENCE', label: 'Preference' },
    { id: 'LONG_TERM', label: 'Long Term' },
    { id: 'OPERATIONAL', label: 'Operational' },
    { id: 'TASK', label: 'Task' },
    { id: 'WORKING', label: 'Working' },
    { id: 'EVENT', label: 'Event' },
    { id: 'SEMANTIC', label: 'Semantic' },
  ];

  return (
    <div className="flex-1 flex flex-col min-h-0 min-w-0 p-4 lg:p-6 overflow-y-auto space-y-5">
      <NxSectionHeader
        title="7-Layer Persistent Memory"
        subtitle="Weighted relevance retrieval on disk. Passwords, API keys, OTPs, CNICs, and injection directives are blocked/scrubbed."
        action={
          <span className="font-mono text-xs tabular-nums" style={{ color: 'var(--text-muted)' }}>
            Items: <strong style={{ color: 'var(--accent)' }}>{memories.length}</strong>
          </span>
        }
      />

      <NxCard elevated className="p-3.5 flex items-start gap-3 text-xs">
        <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" style={{ color: 'var(--accent)' }} />
        <div className="nx-wrap-anywhere" style={{ color: 'var(--text-muted)' }}>
          <strong className="font-mono" style={{ color: 'var(--text-main)' }}>
            AUTOMATIC SECRET &amp; INJECTION GUARD:
          </strong>{' '}
          Sensitive tokens are masked as <code className="font-mono">[REDACTED_SECRET]</code>, duplicates are consolidated cleanly, and prompt-injection patterns are rejected.
        </div>
      </NxCard>

      {feedback && (
        <NxCard className="p-3 flex items-center justify-between gap-2 text-xs font-mono">
          <span className="nx-wrap-anywhere" style={{ color: 'var(--status-danger)' }}>{feedback}</span>
          <button type="button" onClick={() => setFeedback(null)} className="underline cursor-pointer shrink-0">
            Dismiss
          </button>
        </NxCard>
      )}

      <NxCard className="p-3.5">
        <form onSubmit={handleAddMemory} className="flex flex-wrap items-center gap-2">
          <select
            value={newLayer}
            onChange={(e) => setNewLayer(e.target.value as MemoryLayer)}
            className="px-2.5 py-1.5 rounded-md border text-xs font-mono outline-none"
            style={{
              backgroundColor: 'var(--bg-app)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-main)',
            }}
          >
            <option value="PREFERENCE">PREFERENCE</option>
            <option value="LONG_TERM">LONG_TERM</option>
            <option value="OPERATIONAL">OPERATIONAL</option>
            <option value="WORKING">WORKING</option>
          </select>
          <input
            type="text"
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            placeholder="Add persistent rule or operational fact (e.g. 'Prefer concise bullet replies')..."
            className="flex-1 min-w-[200px] px-3 py-1.5 rounded-md border text-xs outline-none"
            style={{
              backgroundColor: 'var(--bg-app)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-main)',
            }}
          />
          <NxButton type="submit" variant="primary" disabled={!newContent.trim()}>
            <Plus className="w-3.5 h-3.5" />
            <span>Save Memory</span>
          </NxButton>
        </form>
      </NxCard>

      <NxCard className="flex-1 min-h-[260px] flex flex-col overflow-hidden">
        <div
          className="p-3.5 border-b flex flex-wrap items-center justify-between gap-3"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5" style={{ color: 'var(--text-muted)' }} />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search memory layers..."
              className="w-full pl-8 pr-3 py-1.5 rounded-md border text-xs outline-none"
              style={{
                backgroundColor: 'var(--bg-app)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-main)',
              }}
            />
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {layersList.map((layer) => (
              <NxButton
                key={layer.id}
                size="sm"
                variant={selectedLayer === layer.id ? 'primary' : 'secondary'}
                onClick={() => setSelectedLayer(layer.id)}
              >
                {layer.label}
              </NxButton>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3.5 space-y-2.5">
          {filteredMemories.length === 0 ? (
            <div className="py-10 text-center text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
              No memory items match this filter. Issue a directive like &ldquo;Har dafa USB verify karna&rdquo; or add an item above.
            </div>
          ) : (
            filteredMemories.map((mem) => {
              const isEditing = editingId === mem.id;
              return (
                <NxCard key={mem.id} elevated className="p-3.5 flex items-start justify-between gap-3 min-w-0">
                  <div className="space-y-1.5 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>
                      <span className="font-semibold" style={{ color: 'var(--accent)' }}>
                        {mem.layer}
                      </span>
                      <span>·</span>
                      <span className="tabular-nums">Confidence {Math.round((mem.confidence || 1) * 100)}%</span>
                      <span>·</span>
                      <span className="tabular-nums">{new Date(mem.createdAt).toLocaleDateString()}</span>
                      {mem.isSensitiveRedacted && (
                        <span className="font-semibold" style={{ color: 'var(--status-danger)' }}>
                          · SECRET SCRUBBED
                        </span>
                      )}
                    </div>

                    {isEditing ? (
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <select
                          value={editingLayer}
                          onChange={(e) => setEditingLayer(e.target.value as MemoryLayer)}
                          className="px-2 py-1 rounded border text-xs font-mono outline-none"
                          style={{
                            backgroundColor: 'var(--bg-app)',
                            borderColor: 'var(--border-subtle)',
                            color: 'var(--text-main)',
                          }}
                        >
                          <option value="PREFERENCE">PREFERENCE</option>
                          <option value="LONG_TERM">LONG_TERM</option>
                          <option value="OPERATIONAL">OPERATIONAL</option>
                          <option value="TASK">TASK</option>
                          <option value="WORKING">WORKING</option>
                        </select>
                        <input
                          type="text"
                          value={editingContent}
                          onChange={(e) => setEditingContent(e.target.value)}
                          className="flex-1 min-w-[200px] px-2.5 py-1 rounded border text-xs outline-none"
                          style={{
                            backgroundColor: 'var(--bg-app)',
                            borderColor: 'var(--accent)',
                            color: 'var(--text-main)',
                          }}
                        />
                        <NxButton size="sm" variant="primary" onClick={() => handleSaveEdit(mem.id)}>
                          <Check className="w-3.5 h-3.5" />
                        </NxButton>
                        <NxButton size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                          <X className="w-3.5 h-3.5" />
                        </NxButton>
                      </div>
                    ) : (
                      <p className="text-xs leading-relaxed nx-wrap-anywhere" style={{ color: 'var(--text-main)' }}>
                        {mem.content}
                      </p>
                    )}
                  </div>

                  {!isEditing && (
                    <div className="flex items-center gap-1 shrink-0">
                      <NxButton
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditingId(mem.id);
                          setEditingContent(mem.content);
                          setEditingLayer(mem.layer);
                        }}
                        title="Edit memory item"
                        aria-label="Edit memory item"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </NxButton>
                      <NxButton
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteMemory(mem.id)}
                        title="Delete memory item"
                        aria-label="Delete memory item"
                      >
                        <Trash2 className="w-3.5 h-3.5" style={{ color: 'var(--status-danger)' }} />
                      </NxButton>
                    </div>
                  )}
                </NxCard>
              );
            })
          )}
        </div>
      </NxCard>
    </div>
  );
};
