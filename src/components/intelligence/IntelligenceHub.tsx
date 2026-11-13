/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { useAgent } from '../../context/AgentContext.tsx';
import {
  Cpu,
  Plus,
  RefreshCw,
  Trash2,
  ShieldCheck,
  Layers,
  Brain,
  BookOpen,
  Play,
  X,
  Compass,
  Sparkles,
  Lock,
  Shield,
} from 'lucide-react';
import type {
  AIPlatformId,
  BehaviorProfile,
  CapabilityCategory,
  InstructionSource,
  ModelVerificationStatus,
  ProactiveLevel,
  ProviderProfile,
} from '../../types/agent.ts';
import { NxButton, NxCard, NxSectionHeader, NxStatusText } from '../ui/NxPrimitives.tsx';
import { MemoryManager } from '../memory/MemoryManager.tsx';

const PLATFORM_OPTIONS: Array<{ id: AIPlatformId; label: string; hint: string }> = [
  { id: 'google_gemini', label: 'Google Gemini', hint: 'Auto-discovers Gemini models via v1beta/models' },
  { id: 'openai', label: 'OpenAI', hint: 'Auto-discovers GPT / o-series models via v1/models' },
  { id: 'anthropic', label: 'Anthropic Claude', hint: 'Auto-discovers Claude models via v1/models' },
  { id: 'groq', label: 'Groq', hint: 'Auto-discovers Llama / Mixtral / Qwen via openai/v1/models' },
  { id: 'openrouter', label: 'OpenRouter', hint: 'Auto-discovers unified router models via api/v1/models' },
  { id: 'deepseek', label: 'DeepSeek', hint: 'Auto-discovers DeepSeek chat & reasoner models' },
];

type HubTab = 'MODELS' | 'SKILLS' | 'CAPABILITIES' | 'PERSONA' | 'MEMORY' | 'INSTRUCTIONS';

const VALIDATION_STAGES = [
  'Securing key in vault',
  'Authenticating platform',
  'Discovering models',
  'Testing capabilities',
  'Saving registry',
];

export const IntelligenceHub: React.FC = () => {
  const {
    providerProfiles,
    modelRegistry,
    modelSummary,
    providerDiagnostics,
    addProviderProfile,
    addBulkProviderProfiles,
    updateProviderProfile,
    testProviderProfile,
    validateAllProviderProfiles,
    deleteProviderProfile,
    skills,
    toggleSkill,
    testSkill,
    capabilities,
    refreshCapabilities,
    operatingMode,
    toggleOperatingMode,
    persona,
    updatePersona,
    behaviorProfiles,
    createBehaviorProfile,
    updateBehaviorProfile,
    deleteBehaviorProfile,
    instructions,
    preferences,
    addInstruction,
    updateInstruction,
    deleteInstruction,
    updatePreferences,
  } = useAgent();

  const [activeTab, setActiveTab] = useState<HubTab>('MODELS');

  // Capabilities Filter State
  const [capCategoryFilter, setCapCategoryFilter] = useState<'ALL' | CapabilityCategory>('ALL');
  const [capStatusFilter, setCapStatusFilter] = useState<string>('ALL');
  const [capRefreshing, setCapRefreshing] = useState(false);

  // Persona & Profiles State
  const [personaFeedback, setPersonaFeedback] = useState<string | null>(null);
  const [newProfileName, setNewProfileName] = useState('');
  const [newProfileTone, setNewProfileTone] = useState('warm_operator');
  const [newProfileInstructions, setNewProfileInstructions] = useState('');

  // Models & Providers State
  const [showAddModal, setShowAddModal] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [selectedPlatform, setSelectedPlatform] = useState<AIPlatformId>('google_gemini');
  const [newApiKey, setNewApiKey] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [bulkPlatform, setBulkPlatform] = useState<AIPlatformId>('google_gemini');
  const [bulkKeysText, setBulkKeysText] = useState('');
  const [validationStageIdx, setValidationStageIdx] = useState<number | null>(null);
  const [isValidatingAll, setIsValidatingAll] = useState(false);
  const [testingProfileId, setTestingProfileId] = useState<string | null>(null);
  const [providerFeedback, setProviderFeedback] = useState<string | null>(null);
  const [modelStatusFilter, setModelStatusFilter] = useState<'ALL' | ModelVerificationStatus>('ALL');

  // Skills Test State
  const [testingSkillId, setTestingSkillId] = useState<string | null>(null);
  const [skillTestFeedback, setSkillTestFeedback] = useState<string | null>(null);

  // Instructions State
  const [newInstTitle, setNewInstTitle] = useState('');
  const [newInstContent, setNewInstContent] = useState('');
  const [newInstSource, setNewInstSource] = useState<InstructionSource>('USER_PREFERENCE');
  const [instFeedback, setInstFeedback] = useState<string | null>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowAddModal(false);
        setShowBulkModal(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const advanceStagesDuring = async <T,>(fn: () => Promise<T>): Promise<T> => {
    setValidationStageIdx(0);
    const timer = setInterval(() => {
      setValidationStageIdx((prev) => (prev !== null && prev < VALIDATION_STAGES.length - 1 ? prev + 1 : prev));
    }, 550);
    try {
      return await fn();
    } finally {
      clearInterval(timer);
      setValidationStageIdx(null);
    }
  };

  const handleAddKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newApiKey.trim()) return;
    const res = await advanceStagesDuring(() =>
      addProviderProfile({
        platform: selectedPlatform,
        apiKey: newApiKey.trim(),
        displayName: newLabel.trim() || undefined,
      })
    );
    if (res.ok && res.profile) {
      const prof = res.profile as ProviderProfile;
      setProviderFeedback(
        prof.healthStatus === 'HEALTHY'
          ? `Key added & verified HEALTHY (${prof.latencyMs}ms): ${(prof.verifiedModels || []).length} verified model(s).`
          : `Key stored in vault & auto-checked (${prof.healthStatus}): ${prof.lastError || 'Validation failed.'}`
      );
      setShowAddModal(false);
      setNewApiKey('');
      setNewLabel('');
    } else {
      setProviderFeedback(res.error?.message || 'Failed to add API key.');
    }
  };

  const handleBulkAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bulkKeysText.trim()) return;
    const res = await advanceStagesDuring(() =>
      addBulkProviderProfiles({ platform: bulkPlatform, keysText: bulkKeysText })
    );
    setProviderFeedback(
      `Imported ${res.addedCount || 0} key(s): ${res.healthyCount || 0} HEALTHY, ${res.authFailedCount || 0} AUTH_FAILED, ${res.totalDiscoveredModels || 0} model(s) discovered.`
    );
    setShowBulkModal(false);
    setBulkKeysText('');
  };

  const handleTestSkill = async (skillId: string) => {
    setTestingSkillId(skillId);
    setSkillTestFeedback(null);
    try {
      const res = await testSkill(skillId);
      const result = res.result;
      setSkillTestFeedback(
        result
          ? `${skillId}: ${result.status} (${result.durationMs}ms) — ${result.summary}`
          : `Failed to test skill ${skillId}.`
      );
    } finally {
      setTestingSkillId(null);
    }
  };

  const handleAddInstruction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newInstTitle.trim() || !newInstContent.trim()) return;
    setInstFeedback(null);
    const res = await addInstruction({
      title: newInstTitle.trim(),
      content: newInstContent.trim(),
      source: newInstSource,
      scope: 'global',
    });
    if (!res.ok) {
      setInstFeedback(res.error || 'Instruction rejected.');
      return;
    }
    setNewInstTitle('');
    setNewInstContent('');
  };

  const filteredModels =
    modelStatusFilter === 'ALL'
      ? modelRegistry
      : modelRegistry.filter((m) => m.status === modelStatusFilter);

  const filteredCapabilities = capabilities.filter((cap) => {
    if (capCategoryFilter !== 'ALL' && cap.category !== capCategoryFilter) return false;
    if (capStatusFilter !== 'ALL' && cap.testStatus !== capStatusFilter) return false;
    return true;
  });

  const tabs: Array<{ id: HubTab; label: string; icon: any }> = [
    { id: 'MODELS', label: 'Models & Providers', icon: Cpu },
    { id: 'SKILLS', label: `Executable Skills (${skills.length})`, icon: Layers },
    { id: 'CAPABILITIES', label: `Capabilities (${capabilities.length})`, icon: Compass },
    { id: 'PERSONA', label: 'Persona & Profiles', icon: Sparkles },
    { id: 'MEMORY', label: 'Smart Memory', icon: Brain },
    { id: 'INSTRUCTIONS', label: 'Instructions & Preferences', icon: BookOpen },
  ];

  return (
    <div className="flex-1 flex flex-col min-h-0 min-w-0 p-4 lg:p-6 overflow-y-auto space-y-5">
      <NxSectionHeader
        title="Intelligence Hub"
        subtitle="Verified AI model discovery, validation diagnostics, executable skills, 7-layer memory, and instruction precedence."
      />

      <div
        className="flex items-center gap-1.5 border-b pb-2 overflow-x-auto shrink-0"
        style={{ borderColor: 'var(--border-subtle)' }}
      >
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap cursor-pointer transition-colors"
              style={{
                backgroundColor: active ? 'var(--accent)' : 'transparent',
                color: active ? '#ffffff' : 'var(--text-muted)',
              }}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB: MODELS, PROVIDERS & DIAGNOSTICS */}
      {activeTab === 'MODELS' && (
        <div className="space-y-4">
          <NxCard elevated className="p-3.5 flex items-start gap-3 text-xs">
            <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" style={{ color: 'var(--accent)' }} />
            <div className="nx-wrap-anywhere" style={{ color: 'var(--text-muted)' }}>
              <strong className="font-mono" style={{ color: 'var(--text-main)' }}>
                ZERO-TRUST KEY VALIDATION &amp; CAPABILITY ROUTING:
              </strong>{' '}
              Keys stay encrypted server-side (AES-256-GCM). Every validation probes live provider endpoints, records redacted diagnostics, and filters out unverified/failed models from active routing.
            </div>
          </NxCard>

          {validationStageIdx !== null && (
            <NxCard className="p-3 text-xs font-mono space-y-1.5">
              <div className="flex items-center gap-2 font-semibold" style={{ color: 'var(--accent)' }}>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>
                  Step {validationStageIdx + 1}/{VALIDATION_STAGES.length}: {VALIDATION_STAGES[validationStageIdx]}...
                </span>
              </div>
              <div className="flex flex-wrap gap-2 text-[10px]">
                {VALIDATION_STAGES.map((label, idx) => (
                  <span
                    key={label}
                    style={{
                      color:
                        idx < validationStageIdx
                          ? 'var(--status-success)'
                          : idx === validationStageIdx
                            ? 'var(--accent)'
                            : 'var(--text-muted)',
                    }}
                  >
                    {idx + 1}. {label}
                  </span>
                ))}
              </div>
            </NxCard>
          )}

          {providerFeedback && (
            <NxCard className="p-3 flex items-center justify-between gap-2 text-xs font-mono">
              <span className="nx-wrap-anywhere" style={{ color: 'var(--text-main)' }}>
                {providerFeedback}
              </span>
              <button type="button" onClick={() => setProviderFeedback(null)} className="underline cursor-pointer shrink-0">
                Dismiss
              </button>
            </NxCard>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-semibold" style={{ color: 'var(--text-main)' }}>
              Configured Platform Keys ({providerProfiles.length})
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <NxButton
                variant="secondary"
                disabled={isValidatingAll || providerProfiles.length === 0}
                onClick={async () => {
                  setIsValidatingAll(true);
                  try {
                    const res = await advanceStagesDuring(() => validateAllProviderProfiles());
                    setProviderFeedback(
                      `Validated ${res.validatedCount || 0} key(s): ${res.healthyCount || 0} HEALTHY, ${res.authFailedCount || 0} AUTH_FAILED, ${res.totalDiscoveredModels || 0} discovered.`
                    );
                  } finally {
                    setIsValidatingAll(false);
                  }
                }}
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isValidatingAll ? 'animate-spin' : ''}`} />
                <span>Sync &amp; Validate All</span>
              </NxButton>
              <NxButton variant="secondary" onClick={() => setShowBulkModal(true)}>
                <Layers className="w-3.5 h-3.5" />
                <span>Bulk Add Keys</span>
              </NxButton>
              <NxButton variant="primary" onClick={() => setShowAddModal(true)}>
                <Plus className="w-3.5 h-3.5" />
                <span>Add API Key</span>
              </NxButton>
            </div>
          </div>

          <NxCard elevated className="p-3 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 text-[11px] font-mono tabular-nums">
            <div>
              <div style={{ color: 'var(--text-muted)' }}>Discovered</div>
              <div className="font-semibold text-sm">{modelSummary.total}</div>
            </div>
            <div>
              <div style={{ color: 'var(--text-muted)' }}>Verified</div>
              <div className="font-semibold text-sm" style={{ color: 'var(--status-success)' }}>{modelSummary.verified}</div>
            </div>
            <div>
              <div style={{ color: 'var(--text-muted)' }}>Partial</div>
              <div className="font-semibold text-sm" style={{ color: 'var(--status-warning)' }}>{modelSummary.partiallyVerified}</div>
            </div>
            <div>
              <div style={{ color: 'var(--text-muted)' }}>Failed</div>
              <div className="font-semibold text-sm" style={{ color: 'var(--status-danger)' }}>{modelSummary.failed}</div>
            </div>
            <div>
              <div style={{ color: 'var(--text-muted)' }}>Deprecated</div>
              <div className="font-semibold text-sm">{modelSummary.deprecated}</div>
            </div>
            <div>
              <div style={{ color: 'var(--text-muted)' }}>Not Text</div>
              <div className="font-semibold text-sm">{modelSummary.notSupported}</div>
            </div>
            <div>
              <div style={{ color: 'var(--text-muted)' }}>New Release</div>
              <div className="font-semibold text-sm" style={{ color: 'var(--accent)' }}>{modelSummary.newCount}</div>
            </div>
          </NxCard>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {providerProfiles.map((p) => {
              const platformMeta = PLATFORM_OPTIONS.find((opt) => opt.id === p.provider);
              const discovered = p.discoveredModels || [];
              const verified = p.verifiedModels || [];
              const modelOptions = Array.from(new Set([p.selectedModel, ...verified, ...discovered].filter(Boolean)));
              return (
                <NxCard key={p.id} className="p-4 flex flex-col justify-between gap-3 text-xs font-mono min-w-0">
                  <div className="space-y-2 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-[10px] font-semibold shrink-0" style={{ color: 'var(--accent)' }}>
                          [{platformMeta?.label || p.provider}]
                        </span>
                        <span className="font-semibold truncate" style={{ color: 'var(--text-main)' }}>
                          {p.displayName}
                        </span>
                      </div>
                      <NxStatusText status={p.healthStatus} className="shrink-0" />
                    </div>
                    <div className="space-y-1.5 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                      <div className="nx-wrap-anywhere">
                        Key: <span style={{ color: 'var(--accent)' }}>{p.secretReference}</span> · Pool: {p.projectId}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="shrink-0">Active Model:</span>
                        <select
                          value={p.selectedModel}
                          onChange={(e) => updateProviderProfile(p.id, { selectedModel: e.target.value })}
                          className="px-2 py-0.5 rounded border outline-none text-[11px] max-w-[230px]"
                          style={{
                            backgroundColor: 'var(--bg-app)',
                            borderColor: 'var(--border-subtle)',
                            color: 'var(--text-main)',
                          }}
                        >
                          {modelOptions.map((m) => (
                            <option key={m} value={m}>
                              {m} {verified.includes(m) ? '(verified)' : ''}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="tabular-nums">
                        Models: {discovered.length} discovered · {verified.length} verified · Latency:{' '}
                        {p.latencyMs !== null ? `${p.latencyMs}ms` : 'Not validated'}
                      </div>
                      {p.lastError && (
                        <div className="nx-wrap-anywhere" style={{ color: 'var(--status-danger)' }}>
                          Last error: {p.lastError}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="pt-2.5 border-t flex items-center justify-between gap-2" style={{ borderColor: 'var(--border-subtle)' }}>
                    <div className="flex items-center gap-2">
                      <NxButton
                        size="sm"
                        variant="secondary"
                        disabled={testingProfileId === p.id || isValidatingAll}
                        onClick={async () => {
                          setTestingProfileId(p.id);
                          try {
                            const res = await testProviderProfile(p.id);
                            setProviderFeedback(
                              res.ok
                                ? `Validated HEALTHY (${res.latencyMs}ms).`
                                : `Validation check returned ${res.healthStatus}: ${res.error || 'Check credentials.'}`
                            );
                          } finally {
                            setTestingProfileId(null);
                          }
                        }}
                      >
                        <RefreshCw className={`w-3 h-3 ${testingProfileId === p.id ? 'animate-spin' : ''}`} />
                        <span>Sync &amp; Validate</span>
                      </NxButton>
                      <NxButton size="sm" variant="ghost" onClick={() => updateProviderProfile(p.id, { enabled: !p.enabled })}>
                        {p.enabled ? 'Disable' : 'Enable'}
                      </NxButton>
                    </div>
                    <NxButton size="sm" variant="ghost" onClick={() => deleteProviderProfile(p.id)}>
                      <Trash2 className="w-3.5 h-3.5" style={{ color: 'var(--status-danger)' }} />
                    </NxButton>
                  </div>
                </NxCard>
              );
            })}
          </div>

          {/* Model Registry Filter Table */}
          <NxCard className="overflow-hidden">
            <div className="p-3.5 border-b flex flex-wrap items-center justify-between gap-2" style={{ borderColor: 'var(--border-subtle)' }}>
              <span className="text-sm font-semibold" style={{ color: 'var(--text-main)' }}>
                Model Verification Registry ({filteredModels.length})
              </span>
              <div className="flex flex-wrap items-center gap-1">
                {(['ALL', 'VERIFIED', 'PARTIALLY_VERIFIED', 'FAILED', 'UNAVAILABLE', 'NOT_SUPPORTED'] as const).map((st) => (
                  <NxButton
                    key={st}
                    size="sm"
                    variant={modelStatusFilter === st ? 'primary' : 'secondary'}
                    onClick={() => setModelStatusFilter(st)}
                  >
                    {st}
                  </NxButton>
                ))}
              </div>
            </div>
            <div className="overflow-x-auto">
              {filteredModels.length === 0 ? (
                <div className="p-6 text-center text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
                  No discovered models match this filter. Validate a valid provider key above to populate the live catalog.
                </div>
              ) : (
                <table className="w-full text-left text-xs border-collapse min-w-[600px]">
                  <thead>
                    <tr
                      className="border-b font-mono text-[11px] uppercase"
                      style={{ backgroundColor: 'var(--bg-surface-elevated)', borderColor: 'var(--border-subtle)', color: 'var(--text-muted)' }}
                    >
                      <th className="py-2 px-3">Model ID</th>
                      <th className="py-2 px-3">Provider</th>
                      <th className="py-2 px-3">Capabilities</th>
                      <th className="py-2 px-3">Latency</th>
                      <th className="py-2 px-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y font-mono tabular-nums" style={{ borderColor: 'var(--border-subtle)' }}>
                    {filteredModels.slice(0, 40).map((m) => (
                      <tr key={`${m.profileId}-${m.modelId}`}>
                        <td className="py-2 px-3 font-semibold nx-wrap-anywhere">{m.modelId}</td>
                        <td className="py-2 px-3">{m.provider}</td>
                        <td className="py-2 px-3 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                          {[
                            m.capabilities.text && 'text',
                            m.capabilities.vision && 'vision',
                            m.capabilities.toolCalling && 'tools',
                            m.capabilities.reasoning && 'reasoning',
                            m.capabilities.embeddings && 'embed',
                          ]
                            .filter(Boolean)
                            .join(', ') || '—'}
                        </td>
                        <td className="py-2 px-3">{m.verification.latencyMs !== null ? `${m.verification.latencyMs}ms` : '—'}</td>
                        <td className="py-2 px-3">
                          <NxStatusText status={m.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </NxCard>

          {/* Redacted Provider Validation Diagnostics */}
          <NxCard className="overflow-hidden">
            <div className="p-3.5 border-b flex items-center justify-between" style={{ borderColor: 'var(--border-subtle)' }}>
              <span className="text-sm font-semibold" style={{ color: 'var(--text-main)' }}>
                Validation Diagnostics History ({providerDiagnostics.length})
              </span>
              <span className="text-[11px] font-mono" style={{ color: 'var(--text-muted)' }}>
                Secrets Redacted
              </span>
            </div>
            <div className="overflow-x-auto">
              {providerDiagnostics.length === 0 ? (
                <div className="p-6 text-center text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
                  No provider validation attempts recorded yet.
                </div>
              ) : (
                <table className="w-full text-left text-xs border-collapse min-w-[600px]">
                  <thead>
                    <tr
                      className="border-b font-mono text-[11px] uppercase"
                      style={{ backgroundColor: 'var(--bg-surface-elevated)', borderColor: 'var(--border-subtle)', color: 'var(--text-muted)' }}
                    >
                      <th className="py-2 px-3">Time</th>
                      <th className="py-2 px-3">Provider</th>
                      <th className="py-2 px-3">HTTP / Class</th>
                      <th className="py-2 px-3">Duration</th>
                      <th className="py-2 px-3">Detail</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y font-mono tabular-nums" style={{ borderColor: 'var(--border-subtle)' }}>
                    {providerDiagnostics.slice(0, 15).map((d) => (
                      <tr key={d.id}>
                        <td className="py-2 px-3 whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>
                          {new Date(d.startedAt).toLocaleTimeString()}
                        </td>
                        <td className="py-2 px-3 whitespace-nowrap">{d.provider}</td>
                        <td className="py-2 px-3 whitespace-nowrap">
                          <NxStatusText status={d.ok ? 'VERIFIED' : d.errorClass || 'FAILED'} />
                          {d.statusCode && <span className="ml-1 text-[10px]" style={{ color: 'var(--text-muted)' }}>({d.statusCode})</span>}
                        </td>
                        <td className="py-2 px-3 whitespace-nowrap">{d.durationMs}ms</td>
                        <td className="py-2 px-3 font-sans max-w-md nx-wrap-anywhere">{d.detail}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </NxCard>
        </div>
      )}

      {/* TAB: EXECUTABLE SKILLS */}
      {activeTab === 'SKILLS' && (
        <div className="space-y-3">
          {skillTestFeedback && (
            <NxCard elevated className="p-3 flex items-center justify-between gap-2 text-xs font-mono">
              <span className="nx-wrap-anywhere" style={{ color: 'var(--text-main)' }}>
                {skillTestFeedback}
              </span>
              <button type="button" onClick={() => setSkillTestFeedback(null)} className="underline cursor-pointer shrink-0">
                Dismiss
              </button>
            </NxCard>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {skills.map((skill) => (
              <NxCard key={skill.skillId} className="p-4 flex flex-col justify-between gap-3 text-xs min-w-0">
                <div className="space-y-2 min-w-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-semibold text-sm nx-wrap-anywhere" style={{ color: 'var(--text-main)' }}>
                        {skill.name}
                      </div>
                      <div className="text-[11px] font-mono" style={{ color: 'var(--text-muted)' }}>
                        {skill.skillId} · v{skill.version} · {skill.mode} · {skill.permissions.riskLevel}
                      </div>
                    </div>
                    <NxStatusText status={skill.health} className="shrink-0" />
                  </div>
                  <p className="nx-wrap-anywhere" style={{ color: 'var(--text-muted)' }}>
                    {skill.description}
                  </p>
                  <div className="text-[11px] font-mono nx-wrap-anywhere" style={{ color: 'var(--text-muted)' }}>
                    Triggers: {skill.triggers.join(', ')}
                  </div>
                  {skill.lastRunAt && (
                    <div
                      className="p-2 rounded border text-[11px] font-mono space-y-0.5"
                      style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border-subtle)' }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span>Last run ({skill.runCount || 1}×):</span>
                        <NxStatusText status={skill.lastRunStatus || 'VERIFIED'} />
                      </div>
                      <div className="nx-wrap-anywhere" style={{ color: 'var(--text-muted)' }}>
                        {skill.lastRunSummary}
                      </div>
                    </div>
                  )}
                </div>

                <div className="pt-2 border-t flex items-center justify-between gap-2" style={{ borderColor: 'var(--border-subtle)' }}>
                  <NxButton
                    size="sm"
                    variant="secondary"
                    disabled={testingSkillId === skill.skillId || !skill.isInstalled}
                    onClick={() => handleTestSkill(skill.skillId)}
                  >
                    <Play className="w-3 h-3" />
                    <span>{testingSkillId === skill.skillId ? 'Testing...' : 'Test Skill'}</span>
                  </NxButton>
                  <NxButton
                    size="sm"
                    variant={skill.isInstalled ? 'primary' : 'secondary'}
                    onClick={() => toggleSkill(skill.skillId)}
                  >
                    {skill.isInstalled ? 'ENABLED' : 'DISABLED'}
                  </NxButton>
                </div>
              </NxCard>
            ))}
          </div>
        </div>
      )}

      {/* TAB: CAPABILITIES INVENTORY */}
      {activeTab === 'CAPABILITIES' && (
        <div className="space-y-4">
          <NxCard className="p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-0.5">
              <h2 className="text-sm font-semibold" style={{ color: 'var(--text-main)' }}>
                Authoritative Dynamic Capability Registry ({filteredCapabilities.length}/{capabilities.length})
              </h2>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Reflects live workstation state, host platform constraints, configured API providers, and verification status.
              </p>
            </div>
            <NxButton
              size="sm"
              variant="secondary"
              disabled={capRefreshing}
              onClick={async () => {
                setCapRefreshing(true);
                try {
                  await refreshCapabilities();
                } finally {
                  setCapRefreshing(false);
                }
              }}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${capRefreshing ? 'animate-spin' : ''}`} />
              <span>Refresh Inventory</span>
            </NxButton>
          </NxCard>

          <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
            <select
              value={capCategoryFilter}
              onChange={(e) => setCapCategoryFilter(e.target.value as 'ALL' | CapabilityCategory)}
              className="px-2.5 py-1.5 rounded-md border outline-none"
              style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border-subtle)', color: 'var(--text-main)' }}
            >
              <option value="ALL">All Categories</option>
              <option value="system">System Telemetry</option>
              <option value="files">Files &amp; Folders</option>
              <option value="browser">Browser Automation</option>
              <option value="mobile">Mobile ADB</option>
              <option value="process">Windows Process</option>
              <option value="media">Local Media</option>
              <option value="memory">Memory &amp; Persona</option>
              <option value="providers">AI Providers</option>
              <option value="customer_ops">Customer Vault</option>
              <option value="network">Diagnostics &amp; Ledger</option>
            </select>

            <select
              value={capStatusFilter}
              onChange={(e) => setCapStatusFilter(e.target.value)}
              className="px-2.5 py-1.5 rounded-md border outline-none"
              style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border-subtle)', color: 'var(--text-main)' }}
            >
              <option value="ALL">All Statuses</option>
              <option value="EXECUTED_AND_VERIFIED">EXECUTED_AND_VERIFIED</option>
              <option value="READY">READY</option>
              <option value="HOST_UNAVAILABLE">HOST_UNAVAILABLE</option>
              <option value="NOT_CONFIGURED">NOT_CONFIGURED</option>
              <option value="FAILED">FAILED</option>
            </select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {filteredCapabilities.map((cap) => (
              <NxCard key={cap.capabilityId} className="p-4 space-y-2 text-xs font-mono min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-sans font-semibold text-sm nx-wrap-anywhere" style={{ color: 'var(--text-main)' }}>
                      {cap.displayName}
                    </div>
                    <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                      {cap.category} · {cap.riskClass} · {cap.platform}
                    </div>
                  </div>
                  <NxStatusText status={cap.testStatus} className="shrink-0" />
                </div>
                <p className="font-sans text-xs nx-wrap-anywhere" style={{ color: 'var(--text-muted)' }}>
                  {cap.description}
                </p>
                <div className="text-[11px] flex flex-wrap gap-x-3 gap-y-1" style={{ color: 'var(--text-muted)' }}>
                  <span>Worker: {cap.workerId}</span>
                  <span>Tool: {cap.toolId}</span>
                </div>
                {cap.failureReason && (
                  <div
                    className="p-2 rounded border text-[11px] font-sans nx-wrap-anywhere"
                    style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border-subtle)', color: 'var(--status-warning)' }}
                  >
                    {cap.failureReason}
                  </div>
                )}
              </NxCard>
            ))}
          </div>
        </div>
      )}

      {/* TAB: PERSONA & BEHAVIOR PROFILES */}
      {activeTab === 'PERSONA' && (
        <div className="space-y-4">
          <NxCard elevated className="p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              {operatingMode === 'CUSTOMER_SAFE' ? (
                <Shield className="w-4 h-4 mt-0.5 shrink-0" style={{ color: 'var(--status-warning)' }} />
              ) : (
                <Lock className="w-4 h-4 mt-0.5 shrink-0" style={{ color: 'var(--status-success)' }} />
              )}
              <div className="space-y-0.5 text-xs">
                <div className="font-semibold" style={{ color: 'var(--text-main)' }}>
                  Operating Mode:{' '}
                  <NxStatusText status={operatingMode} />
                </div>
                <p style={{ color: 'var(--text-muted)' }}>
                  {operatingMode === 'CUSTOMER_SAFE'
                    ? 'Customer Counter Safe active: affectionate/playful sliders and private owner preferences are hidden/overridden until Owner Mode is restored.'
                    : 'Owner Private Mode active: configurable female operator persona, warmth/humor tuning, and multi-alias behavior profiles enabled.'}
                </p>
              </div>
            </div>
            <NxButton size="sm" variant="secondary" onClick={() => toggleOperatingMode()}>
              {operatingMode === 'CUSTOMER_SAFE' ? 'Switch to Owner Private Mode' : 'Enable Customer Safe Mode'}
            </NxButton>
          </NxCard>

          {personaFeedback && (
            <NxCard className="p-3 flex items-center justify-between gap-2 text-xs font-mono">
              <span style={{ color: 'var(--text-main)' }}>{personaFeedback}</span>
              <button type="button" onClick={() => setPersonaFeedback(null)} className="underline cursor-pointer">
                Dismiss
              </button>
            </NxCard>
          )}

          {operatingMode === 'OWNER_PRIVATE' ? (
            <NxCard className="p-4 lg:p-5 space-y-4">
              <div>
                <h2 className="text-sm font-semibold" style={{ color: 'var(--text-main)' }}>
                  Core Persona Settings (No Legacy Character Assets)
                </h2>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  Text/voice behavioral configuration only. Adjust warmth, humor, formality, and default operator profile.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs font-mono">
                <div className="space-y-1">
                  <label style={{ color: 'var(--text-muted)' }}>Assistant Name</label>
                  <input
                    type="text"
                    value={persona.name}
                    onChange={(e) => updatePersona({ name: e.target.value })}
                    className="w-full px-2.5 py-1.5 rounded-md border outline-none"
                    style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border-subtle)', color: 'var(--text-main)' }}
                  />
                </div>
                <div className="space-y-1">
                  <label style={{ color: 'var(--text-muted)' }}>Voice / Persona Style</label>
                  <select
                    value={persona.voiceGender}
                    onChange={(e) => updatePersona({ voiceGender: e.target.value as 'female' | 'male' | 'neutral' })}
                    className="w-full px-2.5 py-1.5 rounded-md border outline-none"
                    style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border-subtle)', color: 'var(--text-main)' }}
                  >
                    <option value="female">Female (Default)</option>
                    <option value="neutral">Neutral</option>
                    <option value="male">Male</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label style={{ color: 'var(--text-muted)' }}>Owner Address Label</label>
                  <input
                    type="text"
                    value={persona.ownerLabel}
                    onChange={(e) => updatePersona({ ownerLabel: e.target.value })}
                    className="w-full px-2.5 py-1.5 rounded-md border outline-none"
                    style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border-subtle)', color: 'var(--text-main)' }}
                  />
                </div>
                <div className="space-y-1">
                  <label style={{ color: 'var(--text-muted)' }}>Active Behavior Profile</label>
                  <select
                    value={persona.activeProfileId}
                    onChange={(e) => updatePersona({ activeProfileId: e.target.value })}
                    className="w-full px-2.5 py-1.5 rounded-md border outline-none"
                    style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border-subtle)', color: 'var(--text-main)' }}
                  >
                    {behaviorProfiles.map((bp) => (
                      <option key={bp.id} value={bp.id}>
                        {bp.displayName}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs font-mono tabular-nums">
                {(
                  [
                    ['friendliness', 'Friendliness'],
                    ['humor', 'Humor'],
                    ['affection', 'Affection'],
                    ['formality', 'Formality'],
                    ['initiativeLevel', 'Initiative'],
                  ] as const
                ).map(([key, label]) => (
                  <div key={key} className="space-y-1">
                    <label style={{ color: 'var(--text-muted)' }}>
                      {label} ({persona[key]}%)
                    </label>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={persona[key]}
                      onChange={(e) => updatePersona({ [key]: Number(e.target.value) })}
                      className="w-full cursor-pointer"
                    />
                  </div>
                ))}
              </div>
            </NxCard>
          ) : null}

          <NxCard className="p-4 lg:p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold" style={{ color: 'var(--text-main)' }}>
                Behavior Profiles ({behaviorProfiles.length})
              </h2>
              <span className="text-[11px] font-mono" style={{ color: 'var(--text-muted)' }}>
                Mapped to Wake Aliases &amp; Owner Mode
              </span>
            </div>

            {operatingMode === 'OWNER_PRIVATE' && (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!newProfileName.trim()) return;
                  const res = await createBehaviorProfile({
                    displayName: newProfileName.trim(),
                    tone: newProfileTone.trim() || 'custom_operator',
                    systemInstructions: newProfileInstructions.trim() || 'Follow owner workstation tone accurately.',
                  });
                  if (res.ok) {
                    setNewProfileName('');
                    setNewProfileInstructions('');
                    setPersonaFeedback('Created custom behavior profile.');
                  } else {
                    setPersonaFeedback(res.error || 'Failed to create profile.');
                  }
                }}
                className="grid grid-cols-1 sm:grid-cols-12 gap-2 text-xs"
              >
                <input
                  type="text"
                  value={newProfileName}
                  onChange={(e) => setNewProfileName(e.target.value)}
                  placeholder="New profile name..."
                  className="sm:col-span-3 px-3 py-1.5 rounded-md border outline-none"
                  style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border-subtle)', color: 'var(--text-main)' }}
                />
                <input
                  type="text"
                  value={newProfileTone}
                  onChange={(e) => setNewProfileTone(e.target.value)}
                  placeholder="Tone key..."
                  className="sm:col-span-2 px-3 py-1.5 rounded-md border outline-none font-mono"
                  style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border-subtle)', color: 'var(--text-main)' }}
                />
                <input
                  type="text"
                  value={newProfileInstructions}
                  onChange={(e) => setNewProfileInstructions(e.target.value)}
                  placeholder="System behavior directive..."
                  className="sm:col-span-5 px-3 py-1.5 rounded-md border outline-none"
                  style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border-subtle)', color: 'var(--text-main)' }}
                />
                <NxButton type="submit" variant="primary" className="sm:col-span-2" disabled={!newProfileName.trim()}>
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Profile</span>
                </NxButton>
              </form>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {behaviorProfiles.map((bp: BehaviorProfile) => {
                const isActive =
                  operatingMode === 'CUSTOMER_SAFE'
                    ? bp.id === 'CUSTOMER_MODE'
                    : persona.activeProfileId === bp.id;
                const isCustom = !['JARVIS_OPERATOR', 'FRIENDLY', 'CUTE', 'AFFECTIONATE', 'PROFESSIONAL', 'CUSTOMER_MODE'].includes(bp.id);
                return (
                  <NxCard key={bp.id} elevated className="p-3.5 space-y-2 text-xs font-mono min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-sans font-semibold text-sm truncate" style={{ color: 'var(--text-main)' }}>
                          {bp.displayName}
                        </div>
                        <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                          {bp.id} · {bp.formality} · {bp.proactiveLevel}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {isActive && <NxStatusText status="READY" />}
                        {!isActive && operatingMode === 'OWNER_PRIVATE' && (
                          <NxButton
                            size="sm"
                            variant="secondary"
                            onClick={() => updatePersona({ activeProfileId: bp.id })}
                          >
                            Set Active
                          </NxButton>
                        )}
                        {isCustom && (
                          <NxButton size="sm" variant="ghost" onClick={() => deleteBehaviorProfile(bp.id)}>
                            <Trash2 className="w-3.5 h-3.5" style={{ color: 'var(--status-danger)' }} />
                          </NxButton>
                        )}
                      </div>
                    </div>
                    <p className="font-sans text-[11px] nx-wrap-anywhere" style={{ color: 'var(--text-muted)' }}>
                      {bp.systemInstructions}
                    </p>
                    <div className="grid grid-cols-3 gap-2 pt-1 text-[10px]">
                      <select
                        value={bp.language}
                        onChange={(e) =>
                          updateBehaviorProfile(bp.id, {
                            language: e.target.value as BehaviorProfile['language'],
                          })
                        }
                        className="px-1.5 py-1 rounded border outline-none"
                        style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border-subtle)', color: 'var(--text-main)' }}
                      >
                        <option value="auto">Lang: Auto</option>
                        <option value="english">English</option>
                        <option value="roman_urdu">Roman Urdu</option>
                        <option value="urdu">Urdu</option>
                      </select>
                      <select
                        value={bp.verbosity}
                        onChange={(e) =>
                          updateBehaviorProfile(bp.id, {
                            verbosity: e.target.value as BehaviorProfile['verbosity'],
                          })
                        }
                        className="px-1.5 py-1 rounded border outline-none"
                        style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border-subtle)', color: 'var(--text-main)' }}
                      >
                        <option value="concise">Concise</option>
                        <option value="balanced">Balanced</option>
                        <option value="detailed">Detailed</option>
                      </select>
                      <select
                        value={bp.proactiveLevel}
                        onChange={(e) =>
                          updateBehaviorProfile(bp.id, {
                            proactiveLevel: e.target.value as ProactiveLevel,
                          })
                        }
                        className="px-1.5 py-1 rounded border outline-none"
                        style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border-subtle)', color: 'var(--text-main)' }}
                      >
                        <option value="PROACTIVE_OFF">Proactive: Off</option>
                        <option value="LOW">Low</option>
                        <option value="NORMAL">Normal</option>
                        <option value="HIGH">High</option>
                      </select>
                    </div>
                  </NxCard>
                );
              })}
            </div>
          </NxCard>
        </div>
      )}

      {/* TAB: MEMORY */}
      {activeTab === 'MEMORY' && (
        <div className="-m-4 lg:-m-6 flex-1 flex flex-col min-h-0">
          <MemoryManager />
        </div>
      )}

      {/* TAB: INSTRUCTIONS & PREFERENCES */}
      {activeTab === 'INSTRUCTIONS' && (
        <div className="space-y-4">
          <NxCard className="p-4 space-y-4">
            <div>
              <h2 className="text-sm font-semibold" style={{ color: 'var(--text-main)' }}>
                Runtime Behavior Preferences
              </h2>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Safe user controls that shape assistant language, length, confirmation prompts, and preferred browser without touching immutable SAFETY rules.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs font-mono">
              <div className="space-y-1">
                <label style={{ color: 'var(--text-muted)' }}>Reply Language</label>
                <select
                  value={preferences.preferredLanguage}
                  onChange={(e) =>
                    updatePreferences({ preferredLanguage: e.target.value as typeof preferences.preferredLanguage })
                  }
                  className="w-full px-2.5 py-1.5 rounded-md border outline-none"
                  style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border-subtle)', color: 'var(--text-main)' }}
                >
                  <option value="auto">Auto (Match User)</option>
                  <option value="english">English</option>
                  <option value="roman_urdu">Roman Urdu</option>
                  <option value="urdu">Urdu Script</option>
                </select>
              </div>

              <div className="space-y-1">
                <label style={{ color: 'var(--text-muted)' }}>Response Length</label>
                <select
                  value={preferences.responseStyle}
                  onChange={(e) =>
                    updatePreferences({ responseStyle: e.target.value as typeof preferences.responseStyle })
                  }
                  className="w-full px-2.5 py-1.5 rounded-md border outline-none"
                  style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border-subtle)', color: 'var(--text-main)' }}
                >
                  <option value="concise">Concise (1-2 sentences)</option>
                  <option value="balanced">Balanced (2-3 sentences)</option>
                  <option value="detailed">Detailed</option>
                </select>
              </div>

              <div className="space-y-1">
                <label style={{ color: 'var(--text-muted)' }}>Preferred Browser</label>
                <select
                  value={preferences.preferredBrowser}
                  onChange={(e) =>
                    updatePreferences({ preferredBrowser: e.target.value as typeof preferences.preferredBrowser })
                  }
                  className="w-full px-2.5 py-1.5 rounded-md border outline-none"
                  style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border-subtle)', color: 'var(--text-main)' }}
                >
                  <option value="chrome">Google Chrome (CDP)</option>
                  <option value="msedge">Microsoft Edge (CDP)</option>
                </select>
              </div>

              <div className="flex items-end pb-1.5">
                <label className="flex items-center gap-2 cursor-pointer" style={{ color: 'var(--text-main)' }}>
                  <input
                    type="checkbox"
                    checked={preferences.confirmHighRisk}
                    onChange={(e) => updatePreferences({ confirmHighRisk: e.target.checked })}
                  />
                  <span>Confirm High-Risk Actions</span>
                </label>
              </div>
            </div>
          </NxCard>

          <NxCard className="p-4 space-y-4">
            <div>
              <h2 className="text-sm font-semibold" style={{ color: 'var(--text-main)' }}>
                Instruction Precedence Hierarchy (SAFETY &gt; SYSTEM &gt; TASK &gt; USER_PREFERENCE &gt; SKILL)
              </h2>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Immutable SAFETY and SYSTEM directives cannot be overridden or weakened by lower layers or untrusted tool/memory text.
              </p>
            </div>

            {instFeedback && (
              <div className="p-2.5 rounded border text-xs font-mono" style={{ borderColor: 'var(--status-danger)', color: 'var(--status-danger)' }}>
                {instFeedback}
              </div>
            )}

            <form onSubmit={handleAddInstruction} className="grid grid-cols-1 sm:grid-cols-12 gap-2 text-xs">
              <select
                value={newInstSource}
                onChange={(e) => setNewInstSource(e.target.value as InstructionSource)}
                className="sm:col-span-3 px-2.5 py-1.5 rounded-md border font-mono outline-none"
                style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border-subtle)', color: 'var(--text-main)' }}
              >
                <option value="USER_PREFERENCE">USER_PREFERENCE (70)</option>
                <option value="TASK">TASK (80)</option>
                <option value="SKILL">SKILL (60)</option>
              </select>
              <input
                type="text"
                value={newInstTitle}
                onChange={(e) => setNewInstTitle(e.target.value)}
                placeholder="Instruction title..."
                className="sm:col-span-3 px-3 py-1.5 rounded-md border outline-none"
                style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border-subtle)', color: 'var(--text-main)' }}
              />
              <input
                type="text"
                value={newInstContent}
                onChange={(e) => setNewInstContent(e.target.value)}
                placeholder="Instruction directive..."
                className="sm:col-span-4 px-3 py-1.5 rounded-md border outline-none"
                style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border-subtle)', color: 'var(--text-main)' }}
              />
              <NxButton type="submit" variant="primary" className="sm:col-span-2" disabled={!newInstTitle.trim() || !newInstContent.trim()}>
                <Plus className="w-3.5 h-3.5" />
                <span>Add Rule</span>
              </NxButton>
            </form>

            <div className="space-y-2">
              {instructions.map((inst) => (
                <NxCard key={inst.id} elevated className="p-3 flex items-start justify-between gap-3 text-xs min-w-0">
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 font-mono text-[10px]">
                      <span className="font-semibold" style={{ color: inst.readOnly ? 'var(--status-danger)' : 'var(--accent)' }}>
                        [{inst.source}:{inst.priority}]
                      </span>
                      <span className="font-semibold text-xs font-sans" style={{ color: 'var(--text-main)' }}>
                        {inst.title}
                      </span>
                      {inst.readOnly && (
                        <span style={{ color: 'var(--text-muted)' }}>· READ-ONLY CORE</span>
                      )}
                    </div>
                    <p className="nx-wrap-anywhere" style={{ color: 'var(--text-muted)' }}>
                      {inst.content}
                    </p>
                  </div>
                  {!inst.readOnly && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <NxButton
                        size="sm"
                        variant={inst.enabled ? 'secondary' : 'ghost'}
                        onClick={() => updateInstruction(inst.id, { enabled: !inst.enabled })}
                      >
                        {inst.enabled ? 'ON' : 'OFF'}
                      </NxButton>
                      <NxButton size="sm" variant="ghost" onClick={() => deleteInstruction(inst.id)}>
                        <Trash2 className="w-3.5 h-3.5" style={{ color: 'var(--status-danger)' }} />
                      </NxButton>
                    </div>
                  )}
                </NxCard>
              ))}
            </div>
          </NxCard>
        </div>
      )}

      {/* ADD KEY MODAL */}
      {showAddModal && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowAddModal(false);
          }}
        >
          <form
            onSubmit={handleAddKey}
            className="w-full max-w-md p-5 rounded-lg border space-y-4"
            style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
          >
            <div className="flex items-center justify-between border-b pb-2.5" style={{ borderColor: 'var(--border-subtle)' }}>
              <h3 className="font-semibold text-sm">Add API Key (Auto-Discover &amp; Validate)</h3>
              <button type="button" onClick={() => setShowAddModal(false)} className="cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3 text-xs font-mono">
              <div className="grid grid-cols-2 gap-1.5">
                {PLATFORM_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setSelectedPlatform(opt.id)}
                    className="px-2.5 py-2 rounded-md border text-left cursor-pointer"
                    style={{
                      backgroundColor: selectedPlatform === opt.id ? 'var(--bg-surface-elevated)' : 'var(--bg-app)',
                      borderColor: selectedPlatform === opt.id ? 'var(--accent)' : 'var(--border-subtle)',
                      color: selectedPlatform === opt.id ? 'var(--text-main)' : 'var(--text-muted)',
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <input
                type="password"
                required
                autoComplete="off"
                value={newApiKey}
                onChange={(e) => setNewApiKey(e.target.value)}
                placeholder="Paste API Key here..."
                className="w-full px-3 py-2 rounded-md border outline-none"
                style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border-subtle)', color: 'var(--text-main)' }}
              />
              <input
                type="text"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="Optional label..."
                className="w-full px-3 py-1.5 rounded-md border outline-none"
                style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border-subtle)', color: 'var(--text-main)' }}
              />
            </div>
            <div className="flex justify-end gap-2">
              <NxButton type="button" variant="ghost" onClick={() => setShowAddModal(false)}>Cancel</NxButton>
              <NxButton type="submit" variant="primary" disabled={validationStageIdx !== null || !newApiKey.trim()}>
                {validationStageIdx !== null ? VALIDATION_STAGES[validationStageIdx] : 'Add & Auto-Verify'}
              </NxButton>
            </div>
          </form>
        </div>
      )}

      {/* BULK ADD KEYS MODAL */}
      {showBulkModal && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowBulkModal(false);
          }}
        >
          <form
            onSubmit={handleBulkAdd}
            className="w-full max-w-lg p-5 rounded-lg border space-y-4"
            style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
          >
            <div className="flex items-center justify-between border-b pb-2.5" style={{ borderColor: 'var(--border-subtle)' }}>
              <h3 className="font-semibold text-sm">Bulk Add Multiple Keys</h3>
              <button type="button" onClick={() => setShowBulkModal(false)} className="cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3 text-xs font-mono">
              <div className="grid grid-cols-3 gap-1.5">
                {PLATFORM_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setBulkPlatform(opt.id)}
                    className="px-2 py-1.5 rounded-md border text-left cursor-pointer truncate"
                    style={{
                      backgroundColor: bulkPlatform === opt.id ? 'var(--bg-surface-elevated)' : 'var(--bg-app)',
                      borderColor: bulkPlatform === opt.id ? 'var(--accent)' : 'var(--border-subtle)',
                      color: bulkPlatform === opt.id ? 'var(--text-main)' : 'var(--text-muted)',
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <textarea
                rows={5}
                required
                value={bulkKeysText}
                onChange={(e) => setBulkKeysText(e.target.value)}
                placeholder={`API_KEY_1\nAPI_KEY_2\nLabel | API_KEY_3`}
                className="w-full px-3 py-2 rounded-md border outline-none"
                style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border-subtle)', color: 'var(--text-main)' }}
              />
            </div>
            <div className="flex justify-end gap-2">
              <NxButton type="button" variant="ghost" onClick={() => setShowBulkModal(false)}>Cancel</NxButton>
              <NxButton type="submit" variant="primary" disabled={validationStageIdx !== null || !bulkKeysText.trim()}>
                {validationStageIdx !== null ? VALIDATION_STAGES[validationStageIdx] : 'Add All & Auto-Verify'}
              </NxButton>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
