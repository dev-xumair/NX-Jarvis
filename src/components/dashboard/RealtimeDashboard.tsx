/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { useAgent } from '../../context/AgentContext.tsx';
import { Avatar3DStage } from '../avatar/Avatar3DStage.tsx';
import {
  Mic,
  MicOff,
  Send,
  Cpu,
  HardDrive,
  Activity,
  Wifi,
  AppWindow,
  ShieldCheck,
  VolumeX,
  Zap,
  ChevronUp,
  ChevronDown,
  Layers,
  MessageSquare,
  Radio,
  Sparkles,
  RotateCcw,
  MousePointer,
  Keyboard,
  FolderOpen,
  Chrome,
} from 'lucide-react';
import type { ActionCategory } from '../../types/agent.ts';

export const RealtimeDashboard: React.FC = () => {
  const {
    agentState,
    companion,
    telemetry,
    taskQueue,
    recentActions,
    chatMessages,
    isListening,
    isSpeaking,
    liveTranscript,
    micVolume,
    startVoiceListening,
    stopVoiceListening,
    bargeInInterrupt,
    sendCommand,
    controlCompanion,
    setDesktopMode,
  } = useAgent();

  const [inputVal, setInputVal] = useState('');
  const [viewMode, setViewMode] = useState<'VOICE_HERO' | 'CHAT_SPLIT'>('VOICE_HERO');
  const [isActivityDrawerOpen, setIsActivityDrawerOpen] = useState(false);
  const [pendingConfirmation, setPendingConfirmation] = useState<{ action: string; target: string } | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, liveTranscript]);

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputVal.trim()) return;
    const text = inputVal.trim();

    // Check for high risk keywords requiring confirmation
    const lower = text.toLowerCase();
    if (
      (lower.includes('format') || lower.includes('wipe') || lower.includes('delete all') || lower.includes('bulk delete')) &&
      !lower.includes('confirm')
    ) {
      setPendingConfirmation({ action: text, target: 'Removable Storage / Bulk Files' });
      return;
    }

    setInputVal('');
    sendCommand(text);
  };

  const handleQuickPrompt = (promptText: string) => {
    sendCommand(promptText);
  };

  const activeTask = taskQueue.find((t) => t.status === 'RUNNING') || taskQueue[0];

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
        return <FolderOpen className="w-3.5 h-3.5 text-emerald-400" />;
      case 'BROWSER_AUTOMATION':
      case 'LAUNCH_APP':
        return <Chrome className="w-3.5 h-3.5 text-rose-400" />;
      default:
        return <Zap className="w-3.5 h-3.5 text-violet-400" />;
    }
  };

  return (
    <div className="flex-1 flex flex-col h-[calc(100vh-4rem)] overflow-hidden select-none relative">
      {/* 1. TOP MONITORING STRIP (CPU, RAM, Disk, Active Apps, C: OS Protection) */}
      <div
        className="px-6 py-2 border-b grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4 text-xs font-mono transition-colors shrink-0 z-10"
        style={{
          backgroundColor: 'var(--bg-surface-elevated)',
          borderColor: 'var(--border-subtle)',
        }}
      >
        {/* CPU Load */}
        <div className="flex items-center gap-2">
          <Cpu className="w-3.5 h-3.5 text-sky-400 shrink-0" />
          <div className="min-w-0">
            <div className="text-[10px] text-slate-500 uppercase tracking-wider">CPU Load</div>
            <div className="font-bold flex items-center gap-1.5" style={{ color: 'var(--text-main)' }}>
              <span>{telemetry.cpuLoad}%</span>
              <div className="w-8 h-1 rounded-full bg-slate-800 overflow-hidden">
                <div
                  className="h-full bg-sky-400 transition-all duration-300"
                  style={{ width: `${telemetry.cpuLoad}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* RAM Usage */}
        <div className="flex items-center gap-2">
          <Activity className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <div className="min-w-0">
            <div className="text-[10px] text-slate-500 uppercase tracking-wider">RAM (HP 800 G1)</div>
            <div className="font-bold truncate" style={{ color: 'var(--text-main)' }}>
              {(telemetry.ramUsedMB / 1024).toFixed(1)} / {(telemetry.ramTotalMB / 1024).toFixed(1)} GB
            </div>
          </div>
        </div>

        {/* Disk I/O */}
        <div className="flex items-center gap-2">
          <HardDrive className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <div className="min-w-0">
            <div className="text-[10px] text-slate-500 uppercase tracking-wider">Disk I/O</div>
            <div className="font-bold truncate text-slate-300">
              R: {telemetry.diskActivity.readSpeedMBs}M | W: {telemetry.diskActivity.writeSpeedMBs}M
            </div>
          </div>
        </div>

        {/* Network */}
        <div className="flex items-center gap-2">
          <Wifi className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
          <div className="min-w-0">
            <div className="text-[10px] text-slate-500 uppercase tracking-wider">Network Speed</div>
            <div className="font-bold truncate" style={{ color: 'var(--text-main)' }}>
              {telemetry.networkSpeedKBps} KB/s
            </div>
          </div>
        </div>

        {/* Active Windows Process Count */}
        <div className="flex items-center gap-2">
          <AppWindow className="w-3.5 h-3.5 text-purple-400 shrink-0" />
          <div className="min-w-0">
            <div className="text-[10px] text-slate-500 uppercase tracking-wider">Active Apps</div>
            <div className="font-bold truncate" style={{ color: 'var(--text-main)' }}>
              {telemetry.activeWindows.length} Processes
            </div>
          </div>
        </div>

        {/* C: Drive Permanent OS Guard */}
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <div className="min-w-0">
            <div className="text-[10px] text-slate-500 uppercase tracking-wider">C: OS Drive</div>
            <div className="font-bold text-emerald-400 flex items-center gap-1 text-[11px]">
              <span>PROTECTED</span>
            </div>
          </div>
        </div>
      </div>

      {/* High-Risk Action Confirmation Modal */}
      {pendingConfirmation && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <div
            className="w-full max-w-md p-6 rounded-2xl border space-y-4"
            style={{ backgroundColor: 'var(--bg-surface)', borderColor: '#ef4444' }}
          >
            <div className="flex items-center gap-3 text-rose-400">
              <ShieldCheck className="w-6 h-6 text-rose-500" />
              <h3 className="font-bold text-sm tracking-tight text-white">
                High-Risk Destructive Action Confirmation
              </h3>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed font-sans">
              Aap ne ek sensitive ya potentially destructive operation request kiya hai:
            </p>
            <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 font-mono text-xs text-amber-300">
              &ldquo;{pendingConfirmation.action}&rdquo;
            </div>
            <p className="text-[11px] text-slate-400 font-sans">
              C: Windows OS drive permanent safe hai, lekin external USB/data partition par ye action irreversible ho sakta hai. Kya aap is action ko proceed karna chahte hain?
            </p>
            <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setPendingConfirmation(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white border border-slate-700 bg-slate-800/60 cursor-pointer"
              >
                Cancel / Reject
              </button>
              <button
                type="button"
                onClick={() => {
                  const action = pendingConfirmation.action;
                  setPendingConfirmation(null);
                  sendCommand(`${action} [CONFIRMED_BY_USER]`);
                }}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-500 cursor-pointer shadow-lg shadow-rose-600/30"
              >
                Confirm & Proceed
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. SUB-HEADER CONTROLS & MODE TOGGLE */}
      <div
        className="px-6 py-2.5 border-b flex items-center justify-between shrink-0 z-10"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-subtle)',
        }}
      >
        <div className="flex items-center gap-3">
          {/* Assistant Identity & Living Status */}
          <div className="flex items-center gap-2.5">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                agentState === 'LISTENING'
                  ? 'bg-emerald-400 animate-ping'
                  : isSpeaking
                  ? 'bg-sky-400 animate-pulse'
                  : agentState === 'THINKING'
                  ? 'bg-amber-400 animate-pulse'
                  : 'bg-emerald-500'
              }`}
            />
            <h2 className="font-bold text-sm tracking-tight" style={{ color: 'var(--text-main)' }}>
              Saba &mdash; NX AI Autonomous Windows Companion
            </h2>
          </div>

          <span className="text-slate-500">|</span>

          {/* Quick Urdu / English Voice Mode Notice */}
          <span className="text-xs text-slate-400 font-sans hidden sm:inline">
            Speak in natural Roman Urdu, Urdu, or English
          </span>
        </div>

        {/* Mode Switcher: Voice Hero vs Chat Split */}
        <div className="flex items-center gap-2">
          <div className="flex items-center p-0.5 rounded-lg border border-slate-700 bg-slate-900/60 text-xs">
            <button
              onClick={() => setViewMode('VOICE_HERO')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md transition-all cursor-pointer ${
                viewMode === 'VOICE_HERO'
                  ? 'bg-sky-500 text-white font-semibold shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Radio className="w-3.5 h-3.5" />
              <span>Voice Stage</span>
            </button>
            <button
              onClick={() => setViewMode('CHAT_SPLIT')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md transition-all cursor-pointer ${
                viewMode === 'CHAT_SPLIT'
                  ? 'bg-sky-500 text-white font-semibold shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Chat & Tasks</span>
            </button>
          </div>

          {/* Switch to Floating Desktop Companion */}
          <button
            onClick={() => {
              controlCompanion({ isFloating: true, command: 'restore' });
              setDesktopMode('floating_companion');
            }}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-700 hover:bg-slate-800 text-xs text-slate-300 cursor-pointer transition-colors"
            title="Switch to Transparent Desktop Companion Mode"
          >
            <Sparkles className="w-3.5 h-3.5 text-sky-400" />
            <span className="hidden md:inline">Desktop Companion Mode</span>
          </button>
        </div>
      </div>

      {/* 3. HERO VIEWPORT (VOICE HERO OR CHAT SPLIT) */}
      <div className="flex-1 flex overflow-hidden relative" style={{ backgroundColor: 'var(--bg-app)' }}>
        {/* VIEW A: VOICE HERO MODE (Avatar Center-Stage, Large Mic, Speech Captions) */}
        {viewMode === 'VOICE_HERO' && (
          <div className="flex-1 flex flex-col items-center justify-between p-6 max-w-4xl mx-auto w-full relative z-10 overflow-y-auto">
            {/* Live Thought Bubble / Spoken Response */}
            <div className="w-full max-w-xl text-center space-y-1.5 pt-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900/80 border border-slate-700/80 backdrop-blur-md text-xs text-sky-300">
                <span className="w-2 h-2 rounded-full bg-sky-400" />
                <span>
                  {agentState === 'LISTENING'
                    ? 'Sunte huwe...'
                    : isSpeaking
                    ? 'Bolte huwe...'
                    : agentState === 'THINKING'
                    ? 'Sochte huwe...'
                    : 'Aapki khidmat mein tayyar'}
                </span>
              </div>

              {/* Dynamic Spoken Text / Live Transcript */}
              <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800/80 backdrop-blur-md shadow-xl min-h-[4rem] flex items-center justify-center">
                <p className="text-sm md:text-base font-medium text-slate-100 leading-relaxed">
                  {isListening && liveTranscript ? (
                    <span className="text-emerald-300 italic">&ldquo;{liveTranscript}&rdquo;</span>
                  ) : (
                    companion.lastSpokenPhrase || companion.currentThought || 'Assalam-o-Alaikum! Main Saba hoon. Batayein main aapki kya madad kar sakti hoon?'
                  )}
                </p>
              </div>
            </div>

            {/* 3D WebGL Anime Avatar Stage (Hero Center-Piece) */}
            <div className="w-full max-w-md my-auto flex items-center justify-center">
              <Avatar3DStage
                mode="dashboard"
                agentState={agentState}
                expression={companion.expression || 'FRIENDLY'}
                isSpeaking={isSpeaking}
                micVolume={micVolume / 100}
                assistantName="Saba"
                className="w-full"
              />
            </div>

            {/* Central Big Interactive Voice Controller & Quick Prompts */}
            <div className="w-full max-w-xl flex flex-col items-center space-y-4 pb-4">
              {/* Audio Waveform Equalizer Strip */}
              {(isListening || isSpeaking) && (
                <div className="flex items-center gap-1.5 py-1">
                  {[12, 24, 32, 18, 28, 14, 22, 10, 20].map((baseH, i) => {
                    const dynamicH =
                      isListening && micVolume > 0
                        ? Math.max(8, Math.min(36, Math.round(baseH * (0.35 + (micVolume / 100) * 1.5))))
                        : baseH;
                    return (
                      <div
                        key={i}
                        className={`w-1.5 rounded-full ${
                          isListening ? 'bg-emerald-400' : 'bg-sky-400'
                        } transition-all duration-75`}
                        style={{ height: `${dynamicH}px` }}
                      />
                    );
                  })}
                  {isSpeaking && (
                    <button
                      onClick={bargeInInterrupt}
                      className="ml-3 px-2.5 py-1 rounded-md text-xs bg-rose-950 text-rose-300 border border-rose-800 flex items-center gap-1 hover:bg-rose-900 cursor-pointer font-semibold shadow"
                      title="Interrupt Voice (Barge-in)"
                    >
                      <VolumeX className="w-3.5 h-3.5" />
                      <span>Ruko</span>
                    </button>
                  )}
                </div>
              )}

              {/* Big Mic Action Button */}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={isListening ? stopVoiceListening : startVoiceListening}
                  className={`px-6 py-3.5 rounded-2xl flex items-center gap-3 font-semibold text-sm transition-all cursor-pointer shadow-2xl ${
                    isListening
                      ? 'bg-rose-500 hover:bg-rose-600 text-white animate-pulse border-2 border-rose-300 shadow-rose-500/40'
                      : 'bg-emerald-500 hover:bg-emerald-600 text-white border border-emerald-400 shadow-emerald-500/40 hover:scale-105'
                  }`}
                >
                  {isListening ? (
                    <>
                      <MicOff className="w-5 h-5" />
                      <span>Awaaz Rokain</span>
                    </>
                  ) : (
                    <>
                      <Mic className="w-5 h-5" />
                      <span>Bolein (Voice Command)</span>
                    </>
                  )}
                </button>
              </div>

              {/* Quick Conversational Prompt Chips */}
              <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                {[
                  'Chrome kholo aur YouTube search karo',
                  'Ye folders USB 1 aur 2 mein copy karo',
                  'Side mein chup ja',
                  'System performance check karo',
                ].map((chip) => (
                  <button
                    key={chip}
                    onClick={() => handleQuickPrompt(chip)}
                    className="px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-900/60 hover:border-sky-400 text-xs text-slate-300 hover:text-white transition-all cursor-pointer"
                  >
                    &ldquo;{chip}&rdquo;
                  </button>
                ))}
              </div>

              {/* Text Input Option for Quiet Environments */}
              <form onSubmit={handleSubmit} className="w-full flex items-center gap-2 pt-1">
                <input
                  type="text"
                  value={inputVal}
                  onChange={(e) => setInputVal(e.target.value)}
                  placeholder="Ya yahan type karein... (e.g. 'Backup bana do', 'Window minimize karo')"
                  className="flex-1 px-4 py-2.5 rounded-xl text-xs outline-none border border-slate-700 bg-slate-900/80 text-slate-200 focus:border-sky-400 transition-colors"
                />
                <button
                  type="submit"
                  disabled={!inputVal.trim()}
                  className="p-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-white disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors shrink-0"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </div>
          </div>
        )}

        {/* VIEW B: CHAT & TASKS SPLIT VIEW */}
        {viewMode === 'CHAT_SPLIT' && (
          <div className="flex-1 grid grid-cols-1 md:grid-cols-12 overflow-hidden w-full">
            {/* Conversation Log (7 Cols) */}
            <div className="md:col-span-7 flex flex-col border-r border-slate-800 overflow-hidden">
              <div className="flex-1 p-5 overflow-y-auto space-y-3 text-xs">
                {chatMessages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex items-start gap-2.5 ${
                      msg.sender === 'user' ? 'justify-end' : 'justify-start'
                    }`}
                  >
                    <div
                      className={`max-w-xl p-3.5 rounded-2xl shadow-sm leading-relaxed ${
                        msg.sender === 'user'
                          ? 'rounded-tr-none bg-sky-600 text-white'
                          : 'rounded-tl-none border border-slate-700 bg-slate-900/80 text-slate-200'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3 text-[10px] opacity-70 mb-1 font-mono">
                        <span>{msg.sender === 'user' ? 'Aap' : 'Saba (NX AI)'}</span>
                        <span>{new Date(msg.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <p className="whitespace-pre-wrap">{msg.text}</p>
                    </div>
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>

              {/* Chat Input Bar */}
              <div className="p-4 border-t border-slate-800 bg-slate-900/60 flex items-center gap-2">
                <button
                  type="button"
                  onClick={isListening ? stopVoiceListening : startVoiceListening}
                  className={`p-2.5 rounded-xl transition-all cursor-pointer ${
                    isListening ? 'bg-rose-500 text-white animate-pulse' : 'bg-emerald-500 text-white hover:bg-emerald-600'
                  }`}
                  title={isListening ? 'Stop Mic' : 'Start Mic'}
                >
                  {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                </button>
                <form onSubmit={handleSubmit} className="flex-1 flex items-center gap-2">
                  <input
                    type="text"
                    value={inputVal}
                    onChange={(e) => setInputVal(e.target.value)}
                    placeholder="Command dein..."
                    className="flex-1 px-4 py-2.5 rounded-xl text-xs outline-none border border-slate-700 bg-slate-900 text-slate-200 focus:border-sky-400"
                  />
                  <button
                    type="submit"
                    disabled={!inputVal.trim()}
                    className="p-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-white disabled:opacity-40 cursor-pointer"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </form>
              </div>
            </div>

            {/* 3D Avatar Side Card (5 Cols) */}
            <div className="md:col-span-5 flex flex-col items-center justify-center p-4 border-l border-slate-800 bg-slate-950/40">
              <div className="w-full max-w-sm">
                <Avatar3DStage
                  mode="dashboard"
                  agentState={agentState}
                  expression={companion.expression || 'FRIENDLY'}
                  isSpeaking={isSpeaking}
                  micVolume={micVolume / 100}
                  className="w-full"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 4. COLLAPSIBLE LIVE ACTIVITY DRAWER (Zero Viewport Occlusion) */}
      <div
        className={`border-t transition-all duration-300 z-30 shrink-0 ${
          isActivityDrawerOpen ? 'h-64' : 'h-11'
        }`}
        style={{
          backgroundColor: 'var(--bg-surface-elevated)',
          borderColor: 'var(--border-subtle)',
        }}
      >
        {/* Drawer Header Toggle Button */}
        <div
          onClick={() => setIsActivityDrawerOpen(!isActivityDrawerOpen)}
          className="h-11 px-6 flex items-center justify-between cursor-pointer hover:bg-slate-800/40 transition-colors"
        >
          <div className="flex items-center gap-3 text-xs font-mono">
            <span className="flex items-center gap-1.5 font-bold text-sky-400">
              <Zap className="w-3.5 h-3.5" />
              <span>Realtime Activity & Ledgers</span>
            </span>
            <span className="text-slate-500">|</span>
            <span className="text-slate-400">
              {activeTask ? (
                <span>
                  Current: <strong className="text-slate-200">{activeTask.title}</strong> ({activeTask.progress}%)
                </span>
              ) : (
                'System Idle · Awaiting commands'
              )}
            </span>
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-400 font-mono">
            <span>{isActivityDrawerOpen ? 'Collapse' : 'Expand Details'}</span>
            {isActivityDrawerOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </div>
        </div>

        {/* Drawer Expanded Content */}
        {isActivityDrawerOpen && (
          <div className="h-[calc(100%-2.75rem)] px-6 py-3 grid grid-cols-1 md:grid-cols-12 gap-4 overflow-y-auto text-xs font-mono border-t border-slate-800">
            {/* Task & Progress Ledgers (6 Cols) */}
            <div className="md:col-span-6 space-y-2 border-r border-slate-800 pr-4">
              <span className="font-bold text-slate-300 block text-[11px] uppercase tracking-wider">
                Magentic-One Task & Progress Ledgers
              </span>
              {activeTask ? (
                <div className="p-3 rounded-lg border border-slate-800 bg-slate-900/60 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sky-300 font-bold">{activeTask.title}</span>
                    <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-950 text-emerald-400 border border-emerald-800">
                      {activeTask.status}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Step: <span className="text-slate-200">{activeTask.currentStep}</span>
                  </div>
                  {activeTask.taskLedger && (
                    <div className="text-[10px] text-slate-500">
                      Boundaries: {activeTask.taskLedger.executionBoundaries.join(', ')} | Retries: {activeTask.taskLedger.maxRetries}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-slate-500 text-[11px]">No active background tasks executing.</p>
              )}
            </div>

            {/* Micro-Actions Log (6 Cols) */}
            <div className="md:col-span-6 space-y-2 overflow-y-auto">
              <span className="font-bold text-slate-300 block text-[11px] uppercase tracking-wider">
                Autonomous Action Queue ({recentActions.length})
              </span>
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {recentActions.slice(0, 5).map((act) => (
                  <div
                    key={act.id}
                    className="p-2 rounded bg-slate-900/40 border border-slate-800/80 flex items-center justify-between text-[11px]"
                  >
                    <div className="flex items-center gap-2 truncate">
                      {getCategoryIcon(act.category)}
                      <span className="truncate text-slate-300">{act.summary}</span>
                    </div>
                    <span className="text-[10px] text-emerald-400 shrink-0 ml-2">{act.status}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
