/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { useAgent } from '../../context/AgentContext.tsx';
import {
  Mic,
  MicOff,
  Send,
  Cpu,
  HardDrive,
  Activity,
  AppWindow,
  ShieldCheck,
  VolumeX,
  Globe,
  Smartphone,
  XCircle,
  Check,
  X,
  ArrowDown,
  Square,
} from 'lucide-react';
import {
  NxButton,
  NxCard,
  NxMetric,
  NxProgress,
  NxStatusText,
} from '../ui/NxPrimitives.tsx';

export const RealtimeDashboard: React.FC = () => {
  const {
    agentState,
    telemetry,
    taskQueue,
    recentActions,
    events,
    chatMessages,
    selfHealth,
    mobileBridge,
    browserSession,
    voiceState,
    micPermission,
    isListening,
    isSpeaking,
    isSendingCommand,
    liveTranscript,
    micVolume,
    voiceNotice,
    interactionMode,
    clearVoiceNotice,
    startVoiceListening,
    stopVoiceListening,
    bargeInInterrupt,
    sendCommand,
    cancelActiveCommand,
    cancelTask,
    confirmTask,
    preferences,
    setActiveNav,
  } = useAgent();

  const [inputVal, setInputVal] = useState('');
  const [rightTab, setRightTab] = useState<'TASK' | 'DEVICES' | 'EVENTS'>('TASK');
  const [showHealthDetails, setShowHealthDetails] = useState(false);
  const [showJumpToBottom, setShowJumpToBottom] = useState(false);

  const feedRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);

  const handleScrollFeed = () => {
    const el = feedRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const near = distanceFromBottom < 80;
    isNearBottomRef.current = near;
    setShowJumpToBottom(!near);
  };

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    const el = feedRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
    isNearBottomRef.current = true;
    setShowJumpToBottom(false);
  };

  useEffect(() => {
    if (isNearBottomRef.current) {
      scrollToBottom('smooth');
    }
  }, [chatMessages.length, liveTranscript]);

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputVal.trim() || isSendingCommand) return;
    const text = inputVal.trim();
    setInputVal('');
    isNearBottomRef.current = true;
    sendCommand(text);
  };

  const activeTask =
    taskQueue.find((t) => t.status === 'CONFIRMATION_REQUIRED' || t.status === 'EXECUTING') ||
    taskQueue[0];

  const cpuDisplay =
    telemetry.cpuLoad.status === 'LIVE' && telemetry.cpuLoad.value !== null
      ? `${telemetry.cpuLoad.value}%`
      : 'UNAVAILABLE';

  const ramDisplay =
    telemetry.ramUsedMB.value !== null && telemetry.ramTotalMB.value !== null
      ? `${(telemetry.ramUsedMB.value / 1024).toFixed(1)} / ${(telemetry.ramTotalMB.value / 1024).toFixed(1)} GB`
      : 'UNAVAILABLE';

  const rssDisplay =
    telemetry.nxProcessRssMB.value !== null ? `${telemetry.nxProcessRssMB.value} MB` : 'UNAVAILABLE';

  const usbVolumes = telemetry.storageDevices.filter((d) => d.type === 'USB' && d.isPresent);
  const verifiedHealthCount = selfHealth.filter((s) => s.status === 'VERIFIED').length;
  const failedHealthCount = selfHealth.filter((s) => s.status === 'FAILED').length;

  return (
    <div className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden">
      {/* 1. Live System Telemetry Strip */}
      <div
        className="px-3 sm:px-4 lg:px-6 py-2 border-b grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 shrink-0"
        style={{
          backgroundColor: 'var(--bg-surface-elevated)',
          borderColor: 'var(--border-subtle)',
        }}
      >
        <NxMetric
          label="Host CPU"
          value={cpuDisplay}
          status={telemetry.cpuLoad.status}
          icon={<Cpu className="w-4 h-4" style={{ color: 'var(--accent)' }} />}
        />
        <NxMetric
          label="Host RAM"
          value={ramDisplay}
          status={telemetry.ramUsedMB.status}
          icon={<Activity className="w-4 h-4" style={{ color: 'var(--status-success)' }} />}
        />
        <NxMetric
          label="NX Footprint"
          value={rssDisplay}
          status={telemetry.nxProcessRssMB.status}
          icon={<ShieldCheck className="w-4 h-4" style={{ color: 'var(--accent)' }} />}
        />
        <NxMetric
          label="OS Processes"
          value={
            telemetry.processesStatus === 'LIVE'
              ? `${telemetry.activeWindows.length} active`
              : 'UNAVAILABLE'
          }
          status={telemetry.processesStatus}
          icon={<AppWindow className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />}
        />
        <NxMetric
          label="Volumes / USB"
          value={`${telemetry.storageDevices.length} vol · ${usbVolumes.length} USB`}
          icon={<HardDrive className="w-4 h-4" style={{ color: 'var(--status-warning)' }} />}
        />
        <NxMetric
          label="Browser / ADB"
          value={`${browserSession?.cdpConnected ? 'CDP ON' : 'CDP OFF'} · ${mobileBridge?.isConnected ? 'ADB ON' : 'ADB OFF'}`}
          icon={
            browserSession?.cdpConnected ? (
              <Globe className="w-4 h-4" style={{ color: 'var(--status-success)' }} />
            ) : (
              <Smartphone className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
            )
          }
        />
      </div>

      {/* Compact Truthful Self-Health Bar */}
      {selfHealth.length > 0 && (
        <div
          className="px-3 sm:px-4 lg:px-6 py-1.5 border-b flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono shrink-0"
          style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
        >
          <div className="flex flex-wrap items-center gap-3 min-w-0 tabular-nums">
            <span style={{ color: 'var(--text-muted)' }}>
              Subsystems: <strong style={{ color: 'var(--status-success)' }}>{verifiedHealthCount} VERIFIED</strong>
              {failedHealthCount > 0 && (
                <>
                  {' · '}
                  <strong style={{ color: 'var(--status-danger)' }}>{failedHealthCount} FAILED</strong>
                </>
              )}
              {' · '}
              <span>{selfHealth.length - verifiedHealthCount - failedHealthCount} HOST-UNAVAILABLE/UNVERIFIED</span>
            </span>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {failedHealthCount > 0 && (
              <button
                type="button"
                onClick={() => setActiveNav('intelligence')}
                className="underline cursor-pointer"
                style={{ color: 'var(--accent)' }}
              >
                Inspect Model Gateway
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowHealthDetails((v) => !v)}
              className="cursor-pointer hover:underline"
              style={{ color: 'var(--text-muted)' }}
            >
              {showHealthDetails ? 'Hide Matrix' : 'View Matrix'}
            </button>
          </div>
        </div>
      )}

      {showHealthDetails && (
        <div
          className="px-3 sm:px-4 lg:px-6 py-2.5 border-b grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-[11px] font-mono shrink-0"
          style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border-subtle)' }}
        >
          {selfHealth.map((sub) => (
            <div
              key={sub.id}
              className="p-2 rounded border space-y-0.5 min-w-0"
              style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold truncate" style={{ color: 'var(--text-main)' }}>
                  {sub.name}
                </span>
                <NxStatusText status={sub.status} className="text-[10px] shrink-0" />
              </div>
              <div className="text-[10px] nx-wrap-anywhere" style={{ color: 'var(--text-muted)' }}>
                {sub.detail}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 2. Responsive Two-Column Workstation Canvas */}
      <div className="flex-1 min-h-0 min-w-0 grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
        {/* LEFT COLUMN: Conversation & Voice Command Console */}
        <section
          className="lg:col-span-7 flex flex-col min-h-0 min-w-0 border-b lg:border-b-0 lg:border-r relative"
          style={{ borderColor: 'var(--border-subtle)', backgroundColor: 'var(--bg-app)' }}
        >
          {/* Console Header */}
          <div
            className="px-4 py-2 border-b flex flex-wrap items-center justify-between gap-2 shrink-0"
            style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
          >
            <div className="flex items-center gap-2 min-w-0 text-xs font-mono">
              <span className="font-semibold font-sans truncate" style={{ color: 'var(--text-main)' }}>
                Operator Console
              </span>
              <span className="hidden sm:inline" style={{ color: 'var(--text-muted)' }}>
                · Lang: {preferences.preferredLanguage} · Style: {preferences.responseStyle}
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <NxStatusText status={agentState} />
              {isSpeaking && (
                <NxButton variant="danger" size="sm" onClick={bargeInInterrupt}>
                  <VolumeX className="w-3.5 h-3.5" />
                  <span>Interrupt</span>
                </NxButton>
              )}
            </div>
          </div>

          {/* Inline Voice Notice or Voice Active Panel */}
          {voiceNotice && (
            <div
              className="mx-4 mt-2.5 p-2.5 rounded-md border flex items-start justify-between gap-2 text-xs shrink-0"
              style={{
                backgroundColor: 'rgba(245, 158, 11, 0.08)',
                borderColor: 'rgba(245, 158, 11, 0.35)',
                color: 'var(--status-warning)',
              }}
            >
              <span className="nx-wrap-anywhere">{voiceNotice}</span>
              <button
                type="button"
                onClick={clearVoiceNotice}
                className="text-xs underline cursor-pointer shrink-0"
              >
                Dismiss
              </button>
            </div>
          )}

          {interactionMode === 'voice' && (
            <div
              className="mx-4 mt-2.5 px-3 py-2 rounded-md border flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono shrink-0"
              style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span style={{ color: 'var(--text-muted)' }}>Voice:</span>
                <NxStatusText status={voiceState} />
                <span style={{ color: 'var(--text-muted)' }}>· Mic: {micPermission}</span>
              </div>
              <div className="flex items-center gap-2">
                {isListening ? (
                  <span className="tabular-nums" style={{ color: 'var(--accent)' }}>
                    Level {micVolume}%
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setActiveNav('settings')}
                    className="underline cursor-pointer"
                    style={{ color: 'var(--accent)' }}
                  >
                    Audio Settings
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Message Feed */}
          <div
            ref={feedRef}
            onScroll={handleScrollFeed}
            className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-4 lg:p-5 space-y-3"
          >
            {chatMessages.map((msg) => {
              const isUser = msg.sender === 'user';
              const isRtl = /[\u0600-\u06FF]/.test(msg.text);
              return (
                <div key={msg.id} className={`flex min-w-0 ${isUser ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className="max-w-[92%] sm:max-w-[82%] px-3.5 py-2.5 border text-xs leading-relaxed min-w-0 nx-wrap-anywhere"
                    style={{
                      backgroundColor: isUser ? 'var(--accent)' : 'var(--bg-surface)',
                      borderColor: isUser ? 'var(--accent)' : 'var(--border-subtle)',
                      color: isUser ? '#ffffff' : 'var(--text-main)',
                      borderRadius: 'var(--radius-card, 0.5rem)',
                    }}
                  >
                    <div
                      className="flex flex-wrap items-center justify-between gap-3 text-[10px] font-mono mb-1"
                      style={{ opacity: 0.85 }}
                    >
                      <span className="flex items-center gap-1.5">
                        <span>{isUser ? 'Operator' : 'NX AI'}</span>
                        {!isUser && msg.outcome && (
                          <span
                            className="font-semibold"
                            style={{
                              color:
                                msg.outcome === 'DONE' || msg.outcome === 'ANSWER'
                                  ? 'var(--status-success)'
                                  : msg.outcome === 'BLOCKED' || msg.outcome === 'UNAVAILABLE'
                                    ? 'var(--status-warning)'
                                    : 'var(--status-danger)',
                            }}
                          >
                            · {msg.outcome}
                          </span>
                        )}
                        {isUser && msg.status && msg.status !== 'completed' && (
                          <span>· {msg.status}</span>
                        )}
                      </span>
                      <span className="tabular-nums">
                        {new Date(msg.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p
                      className={`whitespace-pre-wrap nx-wrap-anywhere ${isRtl ? 'text-sm font-medium' : 'text-xs'}`}
                      dir={isRtl ? 'rtl' : 'ltr'}
                    >
                      {msg.text}
                    </p>
                    {msg.romanUrduSubtext && (
                      <p
                        className="mt-2 pt-1.5 border-t text-[11px] nx-wrap-anywhere"
                        style={{
                          borderColor: isUser ? 'rgba(255,255,255,0.2)' : 'var(--border-subtle)',
                          color: isUser ? 'rgba(255,255,255,0.9)' : 'var(--text-muted)',
                        }}
                      >
                        {msg.romanUrduSubtext}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {showJumpToBottom && (
            <div className="absolute bottom-20 right-4 z-10">
              <NxButton size="sm" variant="secondary" onClick={() => scrollToBottom('smooth')}>
                <ArrowDown className="w-3.5 h-3.5" />
                <span>Latest</span>
              </NxButton>
            </div>
          )}

          {/* Voice Live Bar + Command Composer */}
          <div
            className="p-3 border-t space-y-2 shrink-0"
            style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
          >
            {isListening && (
              <div
                className="px-3 py-1.5 rounded-md border flex items-center justify-between gap-3 text-xs font-mono"
                style={{
                  backgroundColor: 'var(--bg-app)',
                  borderColor: 'var(--accent)',
                  color: 'var(--text-main)',
                }}
              >
                <span className="truncate nx-wrap-anywhere">
                  {liveTranscript ? `"${liveTranscript}"` : 'Listening for speech (commits on final utterance)...'}
                </span>
                <span className="tabular-nums shrink-0" style={{ color: 'var(--accent)' }}>
                  {micVolume}%
                </span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="flex items-end gap-2 min-w-0">
              <NxButton
                type="button"
                variant={isListening ? 'danger' : 'secondary'}
                onClick={isListening ? stopVoiceListening : startVoiceListening}
                title={isListening ? 'Stop Microphone' : 'Start Voice Input'}
                aria-label={isListening ? 'Stop Microphone' : 'Start Voice Input'}
              >
                {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </NxButton>

              <textarea
                rows={1}
                value={inputVal}
                onChange={(e) => setInputVal(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit();
                  }
                }}
                placeholder="Enter command (Shift+Enter for new line)..."
                className="flex-1 min-w-0 px-3 py-2 rounded-md border text-xs outline-none resize-none max-h-28"
                style={{
                  backgroundColor: 'var(--bg-app)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-main)',
                }}
              />

              {isSendingCommand ? (
                <NxButton
                  type="button"
                  variant="danger"
                  onClick={cancelActiveCommand}
                  title="Stop request"
                  aria-label="Stop active command"
                >
                  <Square className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Stop</span>
                </NxButton>
              ) : (
                <NxButton type="submit" variant="primary" disabled={!inputVal.trim()} aria-label="Send Command">
                  <Send className="w-4 h-4" />
                  <span className="hidden sm:inline">Run</span>
                </NxButton>
              )}
            </form>
          </div>
        </section>

        {/* RIGHT COLUMN: Task Orchestrator, Real Devices & Event Stream */}
        <section
          className="lg:col-span-5 flex flex-col min-h-0 min-w-0 overflow-hidden"
          style={{ backgroundColor: 'var(--bg-surface)' }}
        >
          {/* Sub-navigation Tabs */}
          <div
            className="px-3 sm:px-4 py-2 border-b flex items-center gap-1.5 overflow-x-auto shrink-0"
            style={{ borderColor: 'var(--border-subtle)' }}
          >
            {(
              [
                { id: 'TASK', label: 'Task & Verifier' },
                { id: 'DEVICES', label: 'Host & Devices' },
                { id: 'EVENTS', label: `Event Bus (${events.length})` },
              ] as const
            ).map((tab) => {
              const active = rightTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setRightTab(tab.id)}
                  className="px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap cursor-pointer transition-colors"
                  style={{
                    backgroundColor: active ? 'var(--bg-surface-elevated)' : 'transparent',
                    color: active ? 'var(--text-main)' : 'var(--text-muted)',
                    border: active ? '1px solid var(--border-subtle)' : '1px solid transparent',
                  }}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Internally Scrollable Inspector Body */}
          <div className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-4 space-y-4">
            {rightTab === 'TASK' && (
              <>
                <NxCard elevated className="p-3.5 sm:p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className="text-[11px] font-mono uppercase tracking-wider font-semibold"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      Active Task Ledger
                    </span>
                    <NxStatusText status={activeTask ? activeTask.status : 'IDLE'} />
                  </div>

                  {activeTask ? (
                    <div className="space-y-3 min-w-0">
                      <div className="min-w-0">
                        <div className="text-xs font-semibold nx-wrap-anywhere" style={{ color: 'var(--text-main)' }}>
                          {activeTask.title}
                        </div>
                        <div className="text-[11px] font-mono mt-0.5 nx-wrap-anywhere" style={{ color: 'var(--text-muted)' }}>
                          Step: {activeTask.currentStep}
                        </div>
                      </div>

                      <div className="space-y-1">
                        <div className="flex justify-between text-[10px] font-mono tabular-nums" style={{ color: 'var(--text-muted)' }}>
                          <span className="truncate">
                            Workers: {activeTask.workerAssignments?.join(', ') || 'orchestrator'}
                          </span>
                          <span className="shrink-0">{activeTask.progress}%</span>
                        </div>
                        <NxProgress percent={activeTask.progress} />
                      </div>

                      {activeTask.progressLedger && (
                        <div className="text-[11px] font-mono space-y-1">
                          {activeTask.progressLedger.completedSteps.map((st, idx) => (
                            <div key={`done-${idx}`} className="flex items-start gap-1.5" style={{ color: 'var(--status-success)' }}>
                              <Check className="w-3 h-3 shrink-0 mt-0.5" />
                              <span className="nx-wrap-anywhere">{st}</span>
                            </div>
                          ))}
                          {activeTask.progressLedger.pendingSteps.map((st, idx) => (
                            <div key={`pend-${idx}`} className="flex items-start gap-1.5" style={{ color: 'var(--text-muted)' }}>
                              <span className="w-3 text-center shrink-0">·</span>
                              <span className="nx-wrap-anywhere">{st}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {activeTask.verification && (
                        <div
                          className="p-2.5 rounded-md border text-[11px] font-mono space-y-1 min-w-0"
                          style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border-subtle)' }}
                        >
                          <div className="flex items-center justify-between">
                            <span style={{ color: 'var(--text-muted)' }}>VERIFICATION</span>
                            <NxStatusText status={activeTask.verification.status} />
                          </div>
                          <div className="nx-wrap-anywhere" style={{ color: 'var(--text-main)' }}>
                            {activeTask.verification.summary}
                          </div>
                        </div>
                      )}

                      {activeTask.status === 'CONFIRMATION_REQUIRED' && (
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          <NxButton
                            variant="primary"
                            size="sm"
                            onClick={() => confirmTask(activeTask.taskId, true)}
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>Confirm Action</span>
                          </NxButton>
                          <NxButton
                            variant="danger"
                            size="sm"
                            onClick={() => confirmTask(activeTask.taskId, false)}
                          >
                            <X className="w-3.5 h-3.5" />
                            <span>Decline</span>
                          </NxButton>
                        </div>
                      )}

                      {(activeTask.status === 'EXECUTING' || activeTask.status === 'PLANNING') && (
                        <NxButton
                          variant="danger"
                          size="sm"
                          onClick={() => cancelTask(activeTask.taskId)}
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          <span>Cancel Task</span>
                        </NxButton>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs font-mono nx-wrap-anywhere" style={{ color: 'var(--text-muted)' }}>
                      No tasks executed yet in this session. Issue a command to inspect planning, execution, and verification evidence.
                    </p>
                  )}
                </NxCard>

                {/* Recent Verified Actions */}
                <div className="space-y-2">
                  <div
                    className="text-[11px] font-mono uppercase tracking-wider font-semibold"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    Recent Actions ({recentActions.length})
                  </div>
                  {recentActions.length === 0 ? (
                    <NxCard className="p-3 text-xs font-mono" elevated>
                      <span style={{ color: 'var(--text-muted)' }}>Awaiting first verified action.</span>
                    </NxCard>
                  ) : (
                    <div className="space-y-2">
                      {recentActions.slice(0, 8).map((act) => (
                        <NxCard key={act.id} elevated className="p-3 space-y-1 min-w-0">
                          <div className="flex items-center justify-between gap-2 text-[11px] font-mono">
                            <span className="font-semibold truncate" style={{ color: 'var(--accent)' }}>
                              {act.category} · {act.target}
                            </span>
                            <NxStatusText status={act.status} className="shrink-0" />
                          </div>
                          <div className="text-xs nx-wrap-anywhere" style={{ color: 'var(--text-main)' }}>
                            {act.summary}
                          </div>
                        </NxCard>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}

            {rightTab === 'DEVICES' && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <div
                    className="text-[11px] font-mono uppercase tracking-wider font-semibold"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    Mounted Volumes ({telemetry.storageDevices.length})
                  </div>
                  {telemetry.storageDevices.map((vol) => (
                    <NxCard key={vol.letter} elevated className="p-3 space-y-1 text-xs font-mono min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold truncate" style={{ color: 'var(--text-main)' }}>
                          {vol.letter} — {vol.label}
                        </span>
                        <span
                          className="text-[10px] font-semibold shrink-0"
                          style={{
                            color: vol.isProtected ? 'var(--status-success)' : 'var(--accent)',
                          }}
                        >
                          {vol.isProtected ? 'PROTECTED OS' : vol.type}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] tabular-nums" style={{ color: 'var(--text-muted)' }}>
                        <span>
                          Free: {vol.freeGB ?? 'N/A'} GB / {vol.totalGB ?? 'N/A'} GB ({vol.filesystem || 'UNKNOWN'})
                        </span>
                        <span>{vol.source}</span>
                      </div>
                    </NxCard>
                  ))}
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span
                      className="text-[11px] font-mono uppercase tracking-wider font-semibold"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      Top Host Processes
                    </span>
                    <NxStatusText status={telemetry.processesStatus} />
                  </div>
                  <NxCard elevated className="divide-y">
                    {telemetry.activeWindows.length === 0 ? (
                      <div className="p-3 text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
                        Process list unavailable on this host.
                      </div>
                    ) : (
                      telemetry.activeWindows.slice(0, 7).map((proc) => (
                        <div
                          key={proc.id}
                          className="px-3 py-2 flex items-center justify-between gap-2 text-[11px] font-mono tabular-nums"
                          style={{ borderColor: 'var(--border-subtle)' }}
                        >
                          <span className="truncate" style={{ color: 'var(--text-main)' }}>
                            {proc.processName} <span style={{ color: 'var(--text-muted)' }}>#{proc.pid}</span>
                          </span>
                          <span className="shrink-0" style={{ color: 'var(--text-muted)' }}>
                            {proc.cpuPercent !== null ? `${proc.cpuPercent}%` : '—'} ·{' '}
                            {proc.ramMB !== null ? `${proc.ramMB} MB` : '—'}
                          </span>
                        </div>
                      ))
                    )}
                  </NxCard>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <NxCard elevated className="p-3 space-y-1 text-xs font-mono min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span style={{ color: 'var(--text-muted)' }}>Browser CDP</span>
                      <NxStatusText status={browserSession?.status || 'UNAVAILABLE'} />
                    </div>
                    <div className="text-[11px] nx-wrap-anywhere" style={{ color: 'var(--text-main)' }}>
                      {browserSession?.detail || 'Not probed yet'}
                    </div>
                  </NxCard>
                  <NxCard elevated className="p-3 space-y-1 text-xs font-mono min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span style={{ color: 'var(--text-muted)' }}>Android ADB</span>
                      <NxStatusText status={mobileBridge?.connectionState || 'UNAVAILABLE'} />
                    </div>
                    <div className="text-[11px] nx-wrap-anywhere" style={{ color: 'var(--text-main)' }}>
                      {mobileBridge?.deviceName || 'Not probed yet'}
                    </div>
                  </NxCard>
                </div>
              </div>
            )}

            {rightTab === 'EVENTS' && (
              <div className="space-y-2">
                {events.length === 0 ? (
                  <p className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
                    No events recorded yet.
                  </p>
                ) : (
                  events.slice(0, 30).map((evt) => (
                    <NxCard key={evt.id} elevated className="p-2.5 text-[11px] font-mono space-y-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold truncate" style={{ color: 'var(--accent)' }}>
                          {evt.type}
                        </span>
                        <span className="tabular-nums shrink-0" style={{ color: 'var(--text-muted)' }}>
                          {new Date(evt.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                      <div className="nx-wrap-anywhere" style={{ color: 'var(--text-main)' }}>
                        {evt.summary}
                      </div>
                    </NxCard>
                  ))
                )}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};
