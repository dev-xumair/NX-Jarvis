/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import type {
  AgentState,
  CompanionState,
  TaskQueueItem,
  AutonomousAction,
  LiveSystemTelemetry,
  SmartMemoryItem,
  CustomThemeConfig,
  WakeAliasItem,
  ProviderProfile,
  ChatMessage,
} from '../types/agent.ts';

interface AgentContextType {
  agentState: AgentState;
  companion: CompanionState;
  telemetry: LiveSystemTelemetry;
  taskQueue: TaskQueueItem[];
  historyTasks: TaskQueueItem[];
  recentActions: AutonomousAction[];
  memories: SmartMemoryItem[];
  aliases: WakeAliasItem[];
  theme: CustomThemeConfig;
  providerProfiles: ProviderProfile[];
  chatMessages: ChatMessage[];
  activeNav: 'dashboard' | 'history' | 'memory' | 'settings';
  isListening: boolean;
  isSpeaking: boolean;
  liveTranscript: string;
  micVolume: number;
  lipSyncFrame: number;
  desktopMode: 'full_studio' | 'floating_companion';
  interactionMode: 'voice' | 'chat';
  playChime: (type: 'wake' | 'success' | 'alert') => void;
  setActiveNav: (nav: 'dashboard' | 'history' | 'memory' | 'settings') => void;
  setDesktopMode: (mode: 'full_studio' | 'floating_companion') => void;
  setInteractionMode: (mode: 'voice' | 'chat') => void;
  sendCommand: (prompt: string) => Promise<any>;
  controlCompanion: (opts: {
    dockPosition?: any;
    scale?: any;
    isFloating?: boolean;
    characterPose?: 'full' | 'bust';
    command?: string;
  }) => Promise<any>;
  startVoiceListening: () => void;
  stopVoiceListening: () => void;
  bargeInInterrupt: () => void;
  speakNatural: (text: string) => void;
  deleteMemory: (id: string) => Promise<void>;
  addAlias: (alias: string, sensitivity?: number) => Promise<void>;
  updateAlias: (id: string, updates: Partial<WakeAliasItem>) => Promise<void>;
  deleteAlias: (id: string) => Promise<void>;
  updateTheme: (updates: Partial<CustomThemeConfig>) => Promise<void>;
  addProviderProfile: (profile: any) => Promise<any>;
  testProviderProfile: (id: string) => Promise<any>;
  deleteProviderProfile: (id: string) => Promise<void>;
}

const defaultTelemetry: LiveSystemTelemetry = {
  cpuLoad: 12,
  ramUsedMB: 3820,
  ramTotalMB: 6144,
  diskActivity: { readSpeedMBs: 1.2, writeSpeedMBs: 0.4, activeDrive: 'D:\\' },
  networkSpeedKBps: 16,
  activeWindows: [],
  storageDevices: [],
  lastUpdated: Date.now(),
};

const defaultCompanion: CompanionState = {
  isFloating: false,
  dockPosition: 'dock_bottom_right',
  scale: 'medium',
  mood: 'friendly',
  characterPose: 'full',
  currentThought: 'Monitoring system & ready for voice or chat commands.',
  lastSpokenPhrase: 'Main tayyar hoon. Aap koi bhi task de sakte hain.',
};

const defaultTheme: CustomThemeConfig = {
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
  density: 'comfortable',
  roundedRadius: '0.75rem',
};

const AgentContext = createContext<AgentContextType | null>(null);

export const AgentProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [agentState, setAgentState] = useState<AgentState>('IDLE');
  const [companion, setCompanion] = useState<CompanionState>(defaultCompanion);
  const [telemetry, setTelemetry] = useState<LiveSystemTelemetry>(defaultTelemetry);
  const [taskQueue, setTaskQueue] = useState<TaskQueueItem[]>([]);
  const [historyTasks, setHistoryTasks] = useState<TaskQueueItem[]>([]);
  const [recentActions, setRecentActions] = useState<AutonomousAction[]>([]);
  const [memories, setMemories] = useState<SmartMemoryItem[]>([]);
  const [aliases, setAliases] = useState<WakeAliasItem[]>([]);
  const [theme, setThemeState] = useState<CustomThemeConfig>(defaultTheme);
  const [providerProfiles, setProviderProfiles] = useState<ProviderProfile[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [activeNav, setActiveNav] = useState<'dashboard' | 'history' | 'memory' | 'settings'>('dashboard');
  const [desktopMode, setDesktopMode] = useState<'full_studio' | 'floating_companion'>('full_studio');

  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [micVolume, setMicVolume] = useState(0);
  const [lipSyncFrame, setLipSyncFrame] = useState(0);
  const [interactionMode, setInteractionMode] = useState<'voice' | 'chat'>('voice');

  const recognitionRef = useRef<any>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // Animated mouth lip-sync ticker during speaking
  useEffect(() => {
    if (!isSpeaking) {
      setLipSyncFrame(0);
      return;
    }
    const interval = setInterval(() => {
      setLipSyncFrame((prev) => (prev + 1) % 4);
    }, 130);
    return () => clearInterval(interval);
  }, [isSpeaking]);

  // Telemetry Poller
  const fetchTelemetry = useCallback(async () => {
    try {
      const res = await fetch('/api/agent/telemetry');
      if (res.ok) {
        const data = await res.json();
        setTelemetry(data.telemetry || defaultTelemetry);
        if (data.taskQueue) setTaskQueue(data.taskQueue);
        if (data.recentActions) setRecentActions(data.recentActions);
        if (data.companion) {
          setCompanion((prev) => ({ ...prev, ...data.companion }));
        }
      }
    } catch {
      // offline/transient
    }
  }, []);

  // Initial Data Load
  const fetchInitialData = useCallback(async () => {
    try {
      const [memRes, aliasRes, themeRes, profRes] = await Promise.all([
        fetch('/api/memory/items'),
        fetch('/api/settings/aliases'),
        fetch('/api/settings/theme'),
        fetch('/api/providers/profiles'),
      ]);

      if (memRes.ok) {
        const data = await memRes.json();
        setMemories(data.memories || []);
      }
      if (aliasRes.ok) {
        const data = await aliasRes.json();
        setAliases(data.aliases || []);
      }
      if (themeRes.ok) {
        const data = await themeRes.json();
        if (data.theme) setThemeState(data.theme);
      }
      if (profRes.ok) {
        const data = await profRes.json();
        setProviderProfiles(data.profiles || []);
      }
    } catch {
      // offline
    }
  }, []);

  useEffect(() => {
    fetchInitialData();
    fetchTelemetry();
    const interval = setInterval(fetchTelemetry, 2500);
    return () => clearInterval(interval);
  }, [fetchInitialData, fetchTelemetry]);

  // Speech Synthesis setup
  useEffect(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      synthRef.current = window.speechSynthesis;
    }
  }, []);

  // Web Audio UI Chimes (Zero external audio file dependencies)
  const playChime = useCallback((type: 'wake' | 'success' | 'alert') => {
    try {
      if (typeof window === 'undefined') return;
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      const now = ctx.currentTime;
      if (type === 'wake') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(520, now);
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.12);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
        osc.start(now);
        osc.stop(now + 0.22);
      } else if (type === 'success') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.setValueAtTime(660, now + 0.08);
        osc.frequency.setValueAtTime(880, now + 0.16);
        gain.gain.setValueAtTime(0.07, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
        osc.start(now);
        osc.stop(now + 0.28);
      } else {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(320, now);
        osc.frequency.linearRampToValueAtTime(220, now + 0.15);
        gain.gain.setValueAtTime(0.06, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
        osc.start(now);
        osc.stop(now + 0.2);
      }
    } catch {
      // audio context blocked or silent
    }
  }, []);

  // Barge-in Interruption (<150ms instant response)
  const bargeInInterrupt = useCallback(() => {
    if (synthRef.current) {
      synthRef.current.cancel();
    }
    setIsSpeaking(false);
    setLipSyncFrame(0);
  }, []);

  // High-fidelity natural speech with Urdu/Roman Urdu phonetics
  const speakNatural = useCallback(
    (text: string) => {
      if (!synthRef.current) return;
      bargeInInterrupt();

      // Clean text of technical tokens or bracketed info
      const spokenText = text
        .replace(/\[.*?\]/g, '')
        .replace(/`.*?`/g, '')
        .trim();

      const utterance = new SpeechSynthesisUtterance(spokenText);
      const voices = synthRef.current.getVoices();

      // Find appropriate voice:
      // For Urdu or Roman Urdu, find Urdu (ur-PK, ur) or Hindi (hi-IN) voice for native South Asian phonetic pronunciation
      const isUrduScript = /[\u0600-\u06FF]/.test(text);
      const isRomanUrdu = /hai|hain|karo|karein|meri|mera|aap|main|ho|gaya|gayi|theek|achha|ji|chup|wapas|chhoti|badi/i.test(text);

      let selectedVoice = null;
      if (isUrduScript || isRomanUrdu) {
        selectedVoice =
          voices.find((v) => v.lang.startsWith('ur')) ||
          voices.find((v) => v.lang.startsWith('hi')) ||
          voices.find((v) => v.name.toLowerCase().includes('female') || v.name.toLowerCase().includes('google'));
        utterance.rate = 1.05;
        utterance.pitch = 1.1; // warm, natural female anime assistant pitch
      } else {
        selectedVoice =
          voices.find((v) => v.lang.startsWith('en') && (v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Female'))) ||
          voices.find((v) => v.lang.startsWith('en'));
        utterance.rate = 1.0;
        utterance.pitch = 1.05;
      }

      if (selectedVoice) {
        utterance.voice = selectedVoice;
      }

      utterance.onstart = () => {
        setIsSpeaking(true);
        setCompanion((prev) => ({
          ...prev,
          mood: 'speaking',
          lastSpokenPhrase: spokenText,
        }));
      };
      utterance.onend = () => {
        setIsSpeaking(false);
        setCompanion((prev) => ({ ...prev, mood: 'friendly' }));
      };
      utterance.onerror = () => {
        setIsSpeaking(false);
        setCompanion((prev) => ({ ...prev, mood: 'friendly' }));
      };

      synthRef.current.speak(utterance);
    },
    [bargeInInterrupt]
  );

  // Send Command to Agent
  const sendCommand = useCallback(
    async (prompt: string) => {
      bargeInInterrupt();
      setAgentState('THINKING');
      setCompanion((prev) => ({
        ...prev,
        mood: 'thinking',
        currentThought: `Thinking: "${prompt}"`,
      }));

      // Optimistic message append
      const userMessage: ChatMessage = {
        id: `msg-${Date.now()}-u`,
        sender: 'user',
        text: prompt,
        time: Date.now(),
      };
      setChatMessages((prev) => [...prev, userMessage]);

      // Client-side quick voice companion commands
      const lower = prompt.toLowerCase();
      if (lower.includes('side mein chup') || lower.includes('chup ja') || lower.includes('side ho ja')) {
        setCompanion((prev) => ({
          ...prev,
          dockPosition: 'side_right',
          scale: 'small',
          mood: 'friendly',
          lastSpokenPhrase: 'Theek hai, main screen ki side par compact mode mein hoon. Jab zaroorat ho awaaz de dein.',
        }));
      } else if (lower.includes('wapas aa ja') || lower.includes('samne aa')) {
        setCompanion((prev) => ({
          ...prev,
          dockPosition: 'dock_bottom_right',
          scale: 'medium',
          mood: 'friendly',
          lastSpokenPhrase: 'Main wapas aa gayi hoon. Batayein agla task kya hai?',
        }));
      } else if (lower.includes('chhoti ho ja')) {
        setCompanion((prev) => ({ ...prev, scale: 'small' }));
      } else if (lower.includes('badi ho ja')) {
        setCompanion((prev) => ({ ...prev, scale: 'large' }));
      }

      try {
        const res = await fetch('/api/agent/command', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt, mode: interactionMode }),
        });

        if (res.ok) {
          const data = await res.json();
          setAgentState(data.agentState || 'IDLE');
          if (data.companion) {
            setCompanion((prev) => ({ ...prev, ...data.companion }));
          }

          if (data.task) {
            setTaskQueue((prev) => [data.task, ...prev.filter((t) => t.id !== data.task.id)]);
            setHistoryTasks((prev) => [data.task, ...prev]);
            playChime('success');
          }

          if (data.actions) {
            setRecentActions((prev) => [...data.actions, ...prev].slice(0, 25));
          }

          const replyText = data.responseUrdu || data.responseEnglish || 'Ji, task complete ho gaya hai.';
          const agentMessage: ChatMessage = {
            id: `msg-${Date.now()}-a`,
            sender: 'agent',
            text: replyText,
            time: Date.now(),
            languageDetected: 'roman_urdu',
          };
          setChatMessages((prev) => [...prev, agentMessage]);

          // Speak output naturally
          speakNatural(replyText);
          fetchTelemetry();
          return data;
        }
      } catch (err: any) {
        const errorReply = 'Command execute karne mein masla aya hai. Local desktop fallback active hai.';
        setChatMessages((prev) => [
          ...prev,
          {
            id: `msg-${Date.now()}-err`,
            sender: 'agent',
            text: errorReply,
            time: Date.now(),
          },
        ]);
        speakNatural(errorReply);
        setAgentState('IDLE');
      }
    },
    [bargeInInterrupt, interactionMode, speakNatural, fetchTelemetry]
  );

  // Web Speech Recognition with live interim streaming & real-time mic volume sensing
  const startVoiceListening = useCallback(() => {
    if (typeof window === 'undefined') return;
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert('Speech Recognition is not supported in this browser. Please use Google Chrome or Edge.');
      return;
    }

    bargeInInterrupt();
    setLiveTranscript('');
    playChime('wake');

    // Start real microphone volume sensing if available
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        navigator.mediaDevices
          .getUserMedia({ audio: true })
          .then((stream) => {
            micStreamRef.current = stream;
            const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
            if (AudioCtx) {
              const ctx = new AudioCtx();
              audioCtxRef.current = ctx;
              const src = ctx.createMediaStreamSource(stream);
              const analyser = ctx.createAnalyser();
              analyser.fftSize = 64;
              src.connect(analyser);
              const buffer = new Uint8Array(analyser.frequencyBinCount);

              const checkVol = () => {
                if (!analyser || !audioCtxRef.current) return;
                analyser.getByteFrequencyData(buffer);
                let sum = 0;
                for (let i = 0; i < buffer.length; i++) sum += buffer[i];
                const avg = sum / buffer.length;
                setMicVolume(Math.min(100, Math.round(avg * 1.8)));
                animFrameRef.current = requestAnimationFrame(checkVol);
              };
              checkVol();
            }
          })
          .catch(() => {
            // mic blocked or silent fallback
          });
      }
    } catch {
      // ignore
    }

    try {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }

      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = 'ur-PK'; // Multilingual Urdu / English recognition

      recognition.onstart = () => {
        setIsListening(true);
        setAgentState('LISTENING');
        setCompanion((prev) => ({
          ...prev,
          mood: 'listening',
          currentThought: 'Sun rahi hoon... boliye...',
        }));
      };

      recognition.onresult = (event: any) => {
        let interimText = '';
        let finalText = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalText += event.results[i][0].transcript;
          } else {
            interimText += event.results[i][0].transcript;
          }
        }

        const currentSpeech = finalText || interimText;
        setLiveTranscript(currentSpeech);

        if (finalText && finalText.trim()) {
          setIsListening(false);
          setLiveTranscript('');
          sendCommand(finalText.trim());
        }
      };

      recognition.onerror = () => {
        setIsListening(false);
        setAgentState('IDLE');
        setLiveTranscript('');
        setCompanion((prev) => ({ ...prev, mood: 'friendly', currentThought: 'Listening stopped.' }));
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch {
      setIsListening(false);
    }
  }, [bargeInInterrupt, playChime, sendCommand]);

  const stopVoiceListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    setMicVolume(0);
    setIsListening(false);
    setLiveTranscript('');
    setAgentState('IDLE');
  }, []);

  // Companion direct control
  const controlCompanion = useCallback(
    async (opts: {
      dockPosition?: any;
      scale?: any;
      isFloating?: boolean;
      characterPose?: 'full' | 'bust';
      command?: string;
    }) => {
      // Optimistic update
      setCompanion((prev) => ({
        ...prev,
        dockPosition: opts.dockPosition ?? prev.dockPosition,
        scale: opts.scale ?? prev.scale,
        isFloating: opts.isFloating ?? prev.isFloating,
        characterPose: opts.characterPose ?? prev.characterPose,
      }));

      try {
        const res = await fetch('/api/companion/control', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(opts),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.companion) {
            setCompanion((prev) => ({ ...prev, ...data.companion }));
          }
          return data;
        }
      } catch {
        // local optimistic state retained
      }
    },
    []
  );

  // Smart Memory API
  const deleteMemory = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/memory/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setMemories((prev) => prev.filter((m) => m.id !== id));
      }
    } catch {
      // offline
    }
  }, []);

  // Wake Aliases API
  const addAlias = useCallback(async (alias: string, sensitivity: number = 80) => {
    try {
      const res = await fetch('/api/settings/aliases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alias, sensitivity }),
      });
      if (res.ok) {
        const data = await res.json();
        setAliases(data.aliases);
      }
    } catch {
      // offline
    }
  }, []);

  const updateAlias = useCallback(async (id: string, updates: Partial<WakeAliasItem>) => {
    try {
      const res = await fetch(`/api/settings/aliases/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        const data = await res.json();
        setAliases(data.aliases);
      }
    } catch {
      // offline
    }
  }, []);

  const deleteAlias = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/settings/aliases/${id}`, { method: 'DELETE' });
      if (res.ok) {
        const data = await res.json();
        setAliases(data.aliases);
      }
    } catch {
      // offline
    }
  }, []);

  // Theme API
  const updateTheme = useCallback(async (updates: Partial<CustomThemeConfig>) => {
    setThemeState((prev) => ({ ...prev, ...updates }));
    try {
      const res = await fetch('/api/settings/theme', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.theme) setThemeState(data.theme);
      }
    } catch {
      // offline
    }
  }, []);

  // Gemini Multi-Project Profile API
  const addProviderProfile = useCallback(async (profile: any) => {
    try {
      const res = await fetch('/api/providers/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile),
      });
      if (res.ok) {
        const data = await res.json();
        setProviderProfiles(data.profiles);
        return data;
      }
    } catch {
      // offline
    }
  }, []);

  const testProviderProfile = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/providers/profiles/${id}/test`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setProviderProfiles((prev) =>
          prev.map((p) =>
            p.id === id
              ? {
                  ...p,
                  healthStatus: data.healthStatus,
                  latencyMs: data.latencyMs,
                  requestCount: p.requestCount + 1,
                }
              : p
          )
        );
        return data;
      }
    } catch {
      // offline
    }
  }, []);

  const deleteProviderProfile = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/providers/profiles/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setProviderProfiles((prev) => prev.filter((p) => p.id !== id));
      }
    } catch {
      // offline
    }
  }, []);

  return (
    <AgentContext.Provider
      value={{
        agentState,
        companion,
        telemetry,
        taskQueue,
        historyTasks,
        recentActions,
        memories,
        aliases,
        theme,
        providerProfiles,
        chatMessages,
        activeNav,
        isListening,
        isSpeaking,
        liveTranscript,
        micVolume,
        lipSyncFrame,
        desktopMode,
        interactionMode,
        playChime,
        setActiveNav,
        setDesktopMode,
        setInteractionMode,
        sendCommand,
        controlCompanion,
        startVoiceListening,
        stopVoiceListening,
        bargeInInterrupt,
        speakNatural,
        deleteMemory,
        addAlias,
        updateAlias,
        deleteAlias,
        updateTheme,
        addProviderProfile,
        testProviderProfile,
        deleteProviderProfile,
      }}
    >
      {children}
    </AgentContext.Provider>
  );
};

export const useAgent = () => {
  const context = useContext(AgentContext);
  if (!context) {
    throw new Error('useAgent must be used within an AgentProvider');
  }
  return context;
};
