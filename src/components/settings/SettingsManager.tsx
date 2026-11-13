/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { useAgent } from '../../context/AgentContext.tsx';
import { NX_THEME_PRESETS } from '../../themes/presets.ts';
import {
  ShieldCheck,
  Plus,
  Trash2,
  RefreshCw,
  Palette,
  Sliders,
  Edit2,
  Check,
  X,
  Terminal,
  Download,
  Volume2,
  Mic,
  Lock,
} from 'lucide-react';
import type { CustomerFieldKey, OperatingMode, ProactiveLevel } from '../../types/agent.ts';
import { NxButton, NxCard, NxSectionHeader, NxStatusText } from '../ui/NxPrimitives.tsx';

type SettingsTab = 'THEME' | 'VOICE' | 'ALIASES' | 'OWNER_PRIVACY' | 'DIAGNOSTICS';

const CUSTOMER_FIELD_LABELS: Array<{ key: CustomerFieldKey; label: string }> = [
  { key: 'phone', label: 'Phone Number' },
  { key: 'alternatePhone', label: 'Alternate Phone' },
  { key: 'cnic', label: 'CNIC / National ID' },
  { key: 'address', label: 'Customer Address' },
  { key: 'deviceModel', label: 'Device Model' },
  { key: 'imei', label: 'IMEI / Serial Number' },
  { key: 'paymentStatus', label: 'Payment Status' },
  { key: 'accessoriesPurchased', label: 'Accessories Purchased' },
  { key: 'warrantyInfo', label: 'Warranty Info' },
  { key: 'staffNotes', label: 'Private Staff Notes' },
];

export const SettingsManager: React.FC = () => {
  const {
    theme,
    updateTheme,
    aliases,
    addAlias,
    updateAlias,
    deleteAlias,
    testWakePhrase,
    behaviorProfiles,
    operatingMode,
    toggleOperatingMode,
    preferences,
    updatePreferences,
    voiceState,
    micPermission,
    audioDevices,
    ttsVoices,
    refreshAudioDevices,
    speakNatural,
    bargeInInterrupt,
    isSpeaking,
    workers,
    tools,
    telemetry,
  } = useAgent();

  const [activeTab, setActiveTab] = useState<SettingsTab>('THEME');

  // Wake Alias State
  const [newAliasName, setNewAliasName] = useState('');
  const [newAliasProfileId, setNewAliasProfileId] = useState('JARVIS_OPERATOR');
  const [editingAliasId, setEditingAliasId] = useState<string | null>(null);
  const [editingAliasText, setEditingAliasText] = useState('');
  const [wakeTestInput, setWakeTestInput] = useState('Darling check status');
  const [wakeTestResult, setWakeTestResult] = useState<{
    matched: boolean;
    matchedAlias?: { alias: string; behaviorProfileId?: string } | null;
    strippedPrompt: string;
    operatingMode: string;
    effectiveProfile?: { id: string; displayName: string };
  } | null>(null);

  // Theme Import State
  const [themeImportJson, setThemeImportJson] = useState('');
  const [themeNotice, setThemeNotice] = useState<string | null>(null);

  const handleExportTheme = () => {
    const blob = new Blob([JSON.stringify(theme, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${theme.id || 'nx-theme'}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImportTheme = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const parsed = JSON.parse(themeImportJson);
      await updateTheme(parsed);
      setThemeNotice('Theme JSON validated and applied.');
      setThemeImportJson('');
    } catch {
      setThemeNotice('Invalid JSON theme payload.');
    }
  };

  const tabs: Array<{ id: SettingsTab; label: string; icon: any }> = [
    { id: 'THEME', label: 'Themes & Accessibility', icon: Palette },
    { id: 'VOICE', label: 'Voice & Audio', icon: Volume2 },
    { id: 'ALIASES', label: 'Wake Aliases & Triggers', icon: Sliders },
    { id: 'OWNER_PRIVACY', label: 'Owner & Privacy Mode', icon: Lock },
    { id: 'DIAGNOSTICS', label: 'Runtime Diagnostics', icon: ShieldCheck },
  ];

  return (
    <div className="flex-1 flex flex-col min-h-0 min-w-0 p-4 lg:p-6 overflow-y-auto space-y-5">
      <NxSectionHeader
        title="System Settings & Configuration"
        subtitle="Workstation appearance, microphone & speech synthesis settings, wake aliases, and worker contracts."
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

      {/* TAB: THEMES */}
      {activeTab === 'THEME' && (
        <div className="space-y-5">
          <NxCard className="p-4 lg:p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold" style={{ color: 'var(--text-main)' }}>
                Built-In NX Themes (6 Presets)
              </h2>
              <NxButton size="sm" variant="secondary" onClick={handleExportTheme}>
                <Download className="w-3.5 h-3.5" />
                <span>Export Theme JSON</span>
              </NxButton>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {NX_THEME_PRESETS.map((preset) => {
                const isSelected = theme.id === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => updateTheme(preset)}
                    className="p-3.5 rounded-lg border text-left cursor-pointer transition-all"
                    style={{
                      backgroundColor: preset.surfaceColor,
                      borderColor: isSelected ? preset.accentColor : preset.borderColor,
                      color: preset.textColor,
                      boxShadow: isSelected ? `0 0 0 1px ${preset.accentColor}` : undefined,
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-xs">{preset.name}</span>
                      <span
                        className="w-3 h-3 rounded-sm"
                        style={{ backgroundColor: preset.accentColor }}
                      />
                    </div>
                    <div className="text-[11px] font-mono mt-1.5" style={{ color: preset.textMuted }}>
                      Mode: {preset.mode.toUpperCase()}
                    </div>
                  </button>
                );
              })}
            </div>
          </NxCard>

          <NxCard className="p-4 lg:p-5 space-y-4">
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text-main)' }}>
              Token &amp; Accessibility Controls
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs font-mono">
              <div className="space-y-1">
                <label style={{ color: 'var(--text-muted)' }}>Accent Color</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={theme.accentColor}
                    onChange={(e) => updateTheme({ accentColor: e.target.value })}
                    className="w-8 h-8 rounded cursor-pointer bg-transparent border-0"
                  />
                  <input
                    type="text"
                    value={theme.accentColor}
                    onChange={(e) => {
                      if (/^#[0-9a-fA-F]{6}$/.test(e.target.value)) updateTheme({ accentColor: e.target.value });
                    }}
                    className="flex-1 px-2.5 py-1 rounded-md border outline-none"
                    style={{
                      backgroundColor: 'var(--bg-app)',
                      borderColor: 'var(--border-subtle)',
                      color: 'var(--text-main)',
                    }}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label style={{ color: 'var(--text-muted)' }}>Corner Radius</label>
                <select
                  value={theme.roundedRadius}
                  onChange={(e) => updateTheme({ roundedRadius: e.target.value })}
                  className="w-full px-2.5 py-1.5 rounded-md border outline-none cursor-pointer"
                  style={{
                    backgroundColor: 'var(--bg-app)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-main)',
                  }}
                >
                  <option value="0.25rem">Sharp (4px)</option>
                  <option value="0.5rem">Standard (8px)</option>
                  <option value="0.75rem">Rounded (12px)</option>
                  <option value="1rem">Soft (16px)</option>
                </select>
              </div>

              <div className="space-y-1">
                <label style={{ color: 'var(--text-muted)' }}>Font Scale ({theme.fontScale || 1}x)</label>
                <select
                  value={String(theme.fontScale || 1)}
                  onChange={(e) => updateTheme({ fontScale: Number(e.target.value) })}
                  className="w-full px-2.5 py-1.5 rounded-md border outline-none cursor-pointer"
                  style={{
                    backgroundColor: 'var(--bg-app)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-main)',
                  }}
                >
                  <option value="0.9">0.9x Compact</option>
                  <option value="1">1.0x Default</option>
                  <option value="1.1">1.1x Large</option>
                  <option value="1.2">1.2x Accessibility</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="block" style={{ color: 'var(--text-muted)' }}>
                  Accessibility Flags
                </label>
                <label className="flex items-center gap-2 cursor-pointer" style={{ color: 'var(--text-main)' }}>
                  <input
                    type="checkbox"
                    checked={Boolean(theme.reducedMotion)}
                    onChange={(e) => updateTheme({ reducedMotion: e.target.checked })}
                  />
                  <span>Reduced Motion</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer" style={{ color: 'var(--text-main)' }}>
                  <input
                    type="checkbox"
                    checked={Boolean(theme.highContrast)}
                    onChange={(e) => updateTheme({ highContrast: e.target.checked })}
                  />
                  <span>High Contrast Borders</span>
                </label>
              </div>
            </div>

            <form
              onSubmit={handleImportTheme}
              className="pt-2 border-t flex flex-wrap gap-2"
              style={{ borderColor: 'var(--border-subtle)' }}
            >
              <input
                type="text"
                value={themeImportJson}
                onChange={(e) => setThemeImportJson(e.target.value)}
                placeholder="Paste validated Theme JSON to import..."
                className="flex-1 min-w-[220px] px-3 py-1.5 rounded-md border text-xs font-mono outline-none"
                style={{
                  backgroundColor: 'var(--bg-app)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-main)',
                }}
              />
              <NxButton type="submit" variant="secondary" disabled={!themeImportJson.trim()}>
                Import Theme
              </NxButton>
            </form>
            {themeNotice && (
              <p className="text-xs font-mono" style={{ color: 'var(--accent)' }}>
                {themeNotice}
              </p>
            )}
          </NxCard>
        </div>
      )}

      {/* TAB: VOICE & AUDIO */}
      {activeTab === 'VOICE' && (
        <div className="space-y-4">
          <NxCard className="p-4 lg:p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold" style={{ color: 'var(--text-main)' }}>
                  Voice Session &amp; Hardware Controls
                </h2>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  Browser speech recognition and synthesis diagnostics, device selection, playback speed/volume, and barge-in testing.
                </p>
              </div>
              <NxButton size="sm" variant="secondary" onClick={refreshAudioDevices}>
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Refresh Devices</span>
              </NxButton>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs font-mono">
              <NxCard elevated className="p-3 space-y-1">
                <div style={{ color: 'var(--text-muted)' }}>Voice Engine State</div>
                <NxStatusText status={voiceState} />
              </NxCard>
              <NxCard elevated className="p-3 space-y-1">
                <div style={{ color: 'var(--text-muted)' }}>Microphone Permission</div>
                <NxStatusText status={micPermission.toUpperCase()} />
              </NxCard>
              <NxCard elevated className="p-3 space-y-1 tabular-nums">
                <div style={{ color: 'var(--text-muted)' }}>Detected Inputs / TTS Voices</div>
                <div className="font-semibold" style={{ color: 'var(--text-main)' }}>
                  {audioDevices.length} mic(s) · {ttsVoices.length} voice(s)
                </div>
              </NxCard>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs font-mono">
              <div className="space-y-1">
                <label style={{ color: 'var(--text-muted)' }}>Input Microphone</label>
                <select
                  value={preferences.selectedMicDeviceId || ''}
                  onChange={(e) => updatePreferences({ selectedMicDeviceId: e.target.value })}
                  className="w-full px-2.5 py-1.5 rounded-md border outline-none"
                  style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border-subtle)', color: 'var(--text-main)' }}
                >
                  <option value="">Default System Microphone</option>
                  {audioDevices.map((d) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label style={{ color: 'var(--text-muted)' }}>Recognition / TTS Language</label>
                <select
                  value={preferences.voiceLang}
                  onChange={(e) =>
                    updatePreferences({ voiceLang: e.target.value as typeof preferences.voiceLang })
                  }
                  className="w-full px-2.5 py-1.5 rounded-md border outline-none"
                  style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border-subtle)', color: 'var(--text-main)' }}
                >
                  <option value="auto">Auto (Match Reply)</option>
                  <option value="en-US">English (en-US)</option>
                  <option value="ur-PK">Urdu (ur-PK)</option>
                </select>
              </div>

              <div className="space-y-1">
                <label style={{ color: 'var(--text-muted)' }}>TTS Output Voice</label>
                <select
                  value={preferences.selectedVoiceName || ''}
                  onChange={(e) => updatePreferences({ selectedVoiceName: e.target.value })}
                  className="w-full px-2.5 py-1.5 rounded-md border outline-none"
                  style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border-subtle)', color: 'var(--text-main)' }}
                >
                  <option value="">Auto Select Best Match</option>
                  {ttsVoices.map((v) => (
                    <option key={`${v.name}-${v.lang}`} value={v.name}>
                      {v.name} ({v.lang})
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label style={{ color: 'var(--text-muted)' }}>Speech Rate ({preferences.voiceRate.toFixed(1)}x)</label>
                <input
                  type="range"
                  min={0.6}
                  max={1.6}
                  step={0.1}
                  value={preferences.voiceRate}
                  onChange={(e) => updatePreferences({ voiceRate: Number(e.target.value) })}
                  className="w-full cursor-pointer"
                />
              </div>

              <div className="space-y-1">
                <label style={{ color: 'var(--text-muted)' }}>Output Volume ({Math.round(preferences.voiceVolume * 100)}%)</label>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.1}
                  value={preferences.voiceVolume}
                  onChange={(e) => updatePreferences({ voiceVolume: Number(e.target.value) })}
                  className="w-full cursor-pointer"
                />
              </div>

              <div className="flex flex-col justify-end gap-2">
                <label className="flex items-center gap-2 cursor-pointer" style={{ color: 'var(--text-main)' }}>
                  <input
                    type="checkbox"
                    checked={preferences.voiceEnabled}
                    onChange={(e) => updatePreferences({ voiceEnabled: e.target.checked })}
                  />
                  <span>Enable Voice Responses (TTS)</span>
                </label>
                <div className="flex items-center gap-2">
                  <NxButton
                    size="sm"
                    variant="secondary"
                    onClick={() => speakNatural('NX AI voice output test ready.')}
                  >
                    <Mic className="w-3.5 h-3.5" />
                    <span>Test Speech</span>
                  </NxButton>
                  {isSpeaking && (
                    <NxButton size="sm" variant="danger" onClick={bargeInInterrupt}>
                      Stop
                    </NxButton>
                  )}
                </div>
              </div>
            </div>
          </NxCard>
        </div>
      )}

      {/* TAB: WAKE ALIASES & LIVE TRIGGER TEST */}
      {activeTab === 'ALIASES' && (
        <div className="space-y-4">
          <NxCard className="p-4 lg:p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold" style={{ color: 'var(--text-main)' }}>
                  Voice Wake Aliases &amp; Behavior Mapping ({aliases.length})
                </h2>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  Add or edit female workstation aliases, priority, language, context rules, and mapped behavior profiles.
                </p>
              </div>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!newAliasName.trim()) return;
                  await addAlias(newAliasName.trim(), 80, { behaviorProfileId: newAliasProfileId });
                  setNewAliasName('');
                }}
                className="flex flex-wrap items-center gap-2"
              >
                <input
                  type="text"
                  value={newAliasName}
                  onChange={(e) => setNewAliasName(e.target.value)}
                  placeholder="New wake alias..."
                  className="px-3 py-1.5 rounded-md border text-xs font-mono outline-none"
                  style={{
                    backgroundColor: 'var(--bg-app)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-main)',
                  }}
                />
                <select
                  value={newAliasProfileId}
                  onChange={(e) => setNewAliasProfileId(e.target.value)}
                  className="px-2.5 py-1.5 rounded-md border text-xs font-mono outline-none"
                  style={{
                    backgroundColor: 'var(--bg-app)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-main)',
                  }}
                >
                  {behaviorProfiles.map((bp) => (
                    <option key={bp.id} value={bp.id}>
                      {bp.displayName}
                    </option>
                  ))}
                </select>
                <NxButton type="submit" variant="primary" disabled={!newAliasName.trim()}>
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add</span>
                </NxButton>
              </form>
            </div>

            <div className="space-y-2.5">
              {aliases.map((item) => (
                <NxCard key={item.id} elevated className="p-3 space-y-2 text-xs font-mono">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <input
                        type="checkbox"
                        checked={item.enabled}
                        onChange={(e) => updateAlias(item.id, { enabled: e.target.checked })}
                        className="cursor-pointer"
                      />
                      {editingAliasId === item.id ? (
                        <div className="flex items-center gap-1.5">
                          <input
                            type="text"
                            value={editingAliasText}
                            onChange={(e) => setEditingAliasText(e.target.value)}
                            className="px-2 py-0.5 rounded border outline-none"
                            style={{
                              backgroundColor: 'var(--bg-app)',
                              borderColor: 'var(--accent)',
                              color: 'var(--text-main)',
                            }}
                          />
                          <NxButton
                            size="sm"
                            variant="ghost"
                            onClick={async () => {
                              if (editingAliasText.trim()) await updateAlias(item.id, { alias: editingAliasText.trim() });
                              setEditingAliasId(null);
                            }}
                          >
                            <Check className="w-3.5 h-3.5" />
                          </NxButton>
                          <NxButton size="sm" variant="ghost" onClick={() => setEditingAliasId(null)}>
                            <X className="w-3.5 h-3.5" />
                          </NxButton>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="font-semibold" style={{ color: 'var(--text-main)' }}>
                            &ldquo;{item.alias}&rdquo;
                          </span>
                          <NxButton
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setEditingAliasId(item.id);
                              setEditingAliasText(item.alias);
                            }}
                          >
                            <Edit2 className="w-3 h-3" />
                          </NxButton>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-3 tabular-nums">
                      <span style={{ color: 'var(--text-muted)' }}>Sensitivity:</span>
                      <input
                        type="range"
                        min={10}
                        max={100}
                        value={item.sensitivity}
                        onChange={(e) => updateAlias(item.id, { sensitivity: Number(e.target.value) })}
                        className="w-24 cursor-pointer"
                      />
                      <span className="w-9 text-right" style={{ color: 'var(--text-main)' }}>
                        {item.sensitivity}%
                      </span>
                      <NxButton size="sm" variant="ghost" onClick={() => deleteAlias(item.id)}>
                        <Trash2 className="w-3.5 h-3.5" style={{ color: 'var(--status-danger)' }} />
                      </NxButton>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 text-[11px]">
                    <select
                      value={item.behaviorProfileId || 'JARVIS_OPERATOR'}
                      onChange={(e) => updateAlias(item.id, { behaviorProfileId: e.target.value })}
                      className="px-2 py-1 rounded border outline-none"
                      style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border-subtle)', color: 'var(--text-main)' }}
                    >
                      {behaviorProfiles.map((bp) => (
                        <option key={bp.id} value={bp.id}>
                          Profile: {bp.displayName}
                        </option>
                      ))}
                    </select>
                    <select
                      value={item.language || 'auto'}
                      onChange={(e) =>
                        updateAlias(item.id, {
                          language: e.target.value as 'auto' | 'english' | 'roman_urdu' | 'urdu',
                        })
                      }
                      className="px-2 py-1 rounded border outline-none"
                      style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border-subtle)', color: 'var(--text-main)' }}
                    >
                      <option value="auto">Lang: Auto</option>
                      <option value="english">English</option>
                      <option value="roman_urdu">Roman Urdu</option>
                      <option value="urdu">Urdu</option>
                    </select>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={item.priority ?? 80}
                      onChange={(e) => updateAlias(item.id, { priority: Number(e.target.value) })}
                      title="Priority (1-100)"
                      className="px-2 py-1 rounded border outline-none"
                      style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border-subtle)', color: 'var(--text-main)' }}
                    />
                    <input
                      type="text"
                      value={item.contextRules || ''}
                      onChange={(e) => updateAlias(item.id, { contextRules: e.target.value })}
                      placeholder="Context rules..."
                      className="px-2 py-1 rounded border outline-none"
                      style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border-subtle)', color: 'var(--text-main)' }}
                    />
                  </div>
                </NxCard>
              ))}
            </div>
          </NxCard>

          <NxCard className="p-4 space-y-3 text-xs">
            <div>
              <h3 className="text-sm font-semibold" style={{ color: 'var(--text-main)' }}>
                Live Wake-Phrase &amp; Mode Override Tester
              </h3>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Tests wake-word matching, prefix stripping, and real CUSTOMER_MODE override rules against live backend state.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <input
                type="text"
                value={wakeTestInput}
                onChange={(e) => setWakeTestInput(e.target.value)}
                placeholder="e.g. Nikki check system status"
                className="flex-1 min-w-[220px] px-3 py-1.5 rounded-md border font-mono outline-none"
                style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border-subtle)', color: 'var(--text-main)' }}
              />
              <NxButton
                size="sm"
                variant="secondary"
                disabled={!wakeTestInput.trim()}
                onClick={async () => {
                  const res = await testWakePhrase(wakeTestInput.trim());
                  if (res?.ok) setWakeTestResult(res);
                }}
              >
                Test Wake Match
              </NxButton>
            </div>
            {wakeTestResult && (
              <div
                className="p-3 rounded border font-mono text-[11px] space-y-1"
                style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border-subtle)', color: 'var(--text-main)' }}
              >
                <div>
                  Matched Alias: {wakeTestResult.matched ? wakeTestResult.matchedAlias?.alias : 'None (Default Persona)'} · Operating Mode: {wakeTestResult.operatingMode}
                </div>
                <div>Stripped Command: &ldquo;{wakeTestResult.strippedPrompt}&rdquo;</div>
                <div>
                  Effective Profile: {wakeTestResult.effectiveProfile?.id} ({wakeTestResult.effectiveProfile?.displayName})
                </div>
              </div>
            )}
          </NxCard>
        </div>
      )}

      {/* TAB: OWNER & PRIVACY MODE */}
      {activeTab === 'OWNER_PRIVACY' && (
        <div className="space-y-4">
          <NxCard className="p-4 lg:p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold" style={{ color: 'var(--text-main)' }}>
                  Operating Mode &amp; Proactive Autonomy Controls
                </h2>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  Switch instantly between Owner Private workstation mode and Counter-Safe Customer Mode.
                </p>
              </div>
              <NxStatusText status={operatingMode} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs font-mono">
              <div className="space-y-1">
                <label style={{ color: 'var(--text-muted)' }}>Operating Mode</label>
                <select
                  value={operatingMode}
                  onChange={(e) => toggleOperatingMode(e.target.value as OperatingMode)}
                  className="w-full px-2.5 py-1.5 rounded-md border outline-none"
                  style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border-subtle)', color: 'var(--text-main)' }}
                >
                  <option value="OWNER_PRIVATE">OWNER_PRIVATE</option>
                  <option value="CUSTOMER_SAFE">CUSTOMER_SAFE</option>
                </select>
              </div>

              <div className="space-y-1">
                <label style={{ color: 'var(--text-muted)' }}>Proactive Suggestions</label>
                <select
                  value={preferences.proactiveLevel || 'NORMAL'}
                  onChange={(e) => updatePreferences({ proactiveLevel: e.target.value as ProactiveLevel })}
                  className="w-full px-2.5 py-1.5 rounded-md border outline-none"
                  style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border-subtle)', color: 'var(--text-main)' }}
                >
                  <option value="PROACTIVE_OFF">PROACTIVE_OFF</option>
                  <option value="LOW">LOW</option>
                  <option value="NORMAL">NORMAL</option>
                  <option value="HIGH">HIGH</option>
                </select>
              </div>

              <div className="space-y-1">
                <label style={{ color: 'var(--text-muted)' }}>Archived Retention (Days)</label>
                <input
                  type="number"
                  min={1}
                  max={3650}
                  value={preferences.customerRetentionDays ?? 365}
                  onChange={(e) => updatePreferences({ customerRetentionDays: Number(e.target.value) })}
                  className="w-full px-2.5 py-1.5 rounded-md border outline-none tabular-nums"
                  style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border-subtle)', color: 'var(--text-main)' }}
                />
              </div>

              <div className="space-y-2 pt-1">
                <label className="flex items-center gap-2 cursor-pointer" style={{ color: 'var(--text-main)' }}>
                  <input
                    type="checkbox"
                    checked={Boolean(preferences.autoCustomerMode)}
                    onChange={(e) => updatePreferences({ autoCustomerMode: e.target.checked })}
                  />
                  <span>Auto Customer Mode Hint</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer" style={{ color: 'var(--text-main)' }}>
                  <input
                    type="checkbox"
                    checked={Boolean(preferences.autonomousSafeWrites)}
                    onChange={(e) => updatePreferences({ autonomousSafeWrites: e.target.checked })}
                  />
                  <span>Autonomous Safe Writes</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer" style={{ color: 'var(--text-main)' }}>
                  <input
                    type="checkbox"
                    checked={preferences.confirmHighRisk}
                    onChange={(e) => updatePreferences({ confirmHighRisk: e.target.checked })}
                  />
                  <span>Confirm High-Risk (R4/R5)</span>
                </label>
              </div>
            </div>
          </NxCard>

          <NxCard className="p-4 lg:p-5 space-y-3">
            <div>
              <h2 className="text-sm font-semibold" style={{ color: 'var(--text-main)' }}>
                Customer Vault Field Controls
              </h2>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Choose which customer fields are visible/managed in masked customer views and forms.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5 text-xs font-mono">
              {CUSTOMER_FIELD_LABELS.map(({ key, label }) => {
                const enabled = preferences.customerFieldsEnabled?.[key] ?? true;
                return (
                  <label
                    key={key}
                    className="p-2.5 rounded-md border flex items-center gap-2 cursor-pointer"
                    style={{
                      backgroundColor: 'var(--bg-app)',
                      borderColor: 'var(--border-subtle)',
                      color: 'var(--text-main)',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={(e) =>
                        updatePreferences({
                          customerFieldsEnabled: {
                            ...(preferences.customerFieldsEnabled || {}),
                            [key]: e.target.checked,
                          } as Record<CustomerFieldKey, boolean>,
                        })
                      }
                    />
                    <span className="truncate">{label}</span>
                  </label>
                );
              })}
            </div>
          </NxCard>
        </div>
      )}

      {/* TAB: RUNTIME DIAGNOSTICS */}
      {activeTab === 'DIAGNOSTICS' && (
        <div className="space-y-4">
          <NxCard className="p-4 lg:p-5 space-y-3">
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text-main)' }}>
              Host &amp; Process Diagnostics
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs font-mono tabular-nums">
              <NxCard elevated className="p-3">
                <div style={{ color: 'var(--text-muted)' }}>Platform</div>
                <div className="font-semibold mt-0.5" style={{ color: 'var(--text-main)' }}>
                  {telemetry.platformInfo.os} ({telemetry.platformInfo.arch})
                </div>
              </NxCard>
              <NxCard elevated className="p-3">
                <div style={{ color: 'var(--text-muted)' }}>CPU Cores</div>
                <div className="font-semibold mt-0.5" style={{ color: 'var(--text-main)' }}>
                  {telemetry.platformInfo.cpuCores} cores · {telemetry.cpuLoad.value ?? 'N/A'}%
                </div>
              </NxCard>
              <NxCard elevated className="p-3">
                <div style={{ color: 'var(--text-muted)' }}>NX Memory RSS</div>
                <div className="font-semibold mt-0.5" style={{ color: 'var(--text-main)' }}>
                  {telemetry.nxProcessRssMB.value ?? 'N/A'} MB
                </div>
              </NxCard>
              <NxCard elevated className="p-3">
                <div style={{ color: 'var(--text-muted)' }}>Network Delta</div>
                <div className="font-semibold mt-0.5" style={{ color: 'var(--text-main)' }}>
                  {telemetry.networkSpeedKBps.value !== null
                    ? `${telemetry.networkSpeedKBps.value} KB/s`
                    : telemetry.networkSpeedKBps.status}
                </div>
              </NxCard>
            </div>
          </NxCard>

          <NxCard className="p-4 lg:p-5 space-y-3">
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text-main)' }}>
              Registered Worker Contracts ({workers.length})
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs font-mono">
              {workers.map((w) => (
                <NxCard key={w.workerId} elevated className="p-3 space-y-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold truncate" style={{ color: 'var(--text-main)' }}>
                      {w.name}
                    </span>
                    <NxStatusText status={w.health} className="shrink-0" />
                  </div>
                  <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    Timeout: {w.timeoutMs}ms · Retries: {w.maxRetries} · {w.hostRequired || 'CROSS_PLATFORM'}
                  </div>
                  <div className="text-[11px] nx-wrap-anywhere" style={{ color: 'var(--text-main)' }}>
                    {w.verificationContract}
                  </div>
                </NxCard>
              ))}
            </div>
          </NxCard>

          <NxCard className="p-4 lg:p-5 space-y-3">
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text-main)' }}>
              Registered Tool Registry ({tools.length})
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 text-xs font-mono">
              {tools.map((tool) => (
                <NxCard key={tool.toolId} elevated className="p-3 space-y-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold truncate" style={{ color: 'var(--accent)' }}>
                      {tool.toolId}
                    </span>
                    <span className="text-[10px] shrink-0" style={{ color: 'var(--text-muted)' }}>
                      {tool.riskLevel}
                    </span>
                  </div>
                  <div className="text-[11px] font-sans nx-wrap-anywhere" style={{ color: 'var(--text-main)' }}>
                    {tool.description}
                  </div>
                  <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                    Worker: {tool.workerId} · {tool.hostRequired}
                  </div>
                </NxCard>
              ))}
            </div>
          </NxCard>

          <NxCard className="p-4 lg:p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4" style={{ color: 'var(--accent)' }} />
              <h2 className="text-sm font-semibold" style={{ color: 'var(--text-main)' }}>
                Windows Workstation Launchers
              </h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <NxCard elevated className="p-3.5 space-y-1.5">
                <div className="font-mono font-semibold" style={{ color: 'var(--text-main)' }}>
                  run_windows_agent.bat
                </div>
                <p style={{ color: 'var(--text-muted)' }}>
                  Launches the local NX AI Express/Vite workstation server on Windows and opens localhost:3000.
                </p>
              </NxCard>
              <NxCard elevated className="p-3.5 space-y-1.5">
                <div className="font-mono font-semibold" style={{ color: 'var(--text-main)' }}>
                  run_windows_agent_silent.vbs
                </div>
                <p style={{ color: 'var(--text-muted)' }}>
                  Starts the NX AI background service without showing a persistent Command Prompt window.
                </p>
              </NxCard>
            </div>
          </NxCard>
        </div>
      )}
    </div>
  );
};
