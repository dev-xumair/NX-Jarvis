/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import type {
  AIPlatformId,
  AgentState,
  AuditLogEntry,
  AutonomousAction,
  BehaviorProfile,
  BrowserSessionInfo,
  CapabilityRecord,
  ChatMessage,
  CustomerFieldKey,
  CustomerRecord,
  CustomerRecordView,
  CustomThemeConfig,
  EventBusEvent,
  InstructionItem,
  InstructionSource,
  LiveSystemTelemetry,
  MemoryLayer,
  MobileBridgeStatus,
  ModelRegistryRecord,
  NotificationItem,
  OperatingMode,
  PersonaConfig,
  ProviderDiagnosticAttempt,
  ProviderProfile,
  SkillManifest,
  SmartMemoryItem,
  TaskQueueItem,
  ToolContract,
  UserPreferencesConfig,
  VoiceEngineState,
  WakeAliasItem,
  WorkerContract,
} from '../types/agent.ts';
import { DEFAULT_NX_THEME } from '../themes/presets.ts';
import { apiClient } from '../lib/apiClient.ts';
import {
  AudioSession,
  type AudioDeviceOption,
  type MicPermissionStatus,
  type TtsVoiceOption,
} from '../lib/audioSession.ts';

export type NavSection = 'dashboard' | 'workspace' | 'intelligence' | 'settings';

export interface SubsystemHealthItem {
  id: string;
  name: string;
  status: string;
  detail: string;
}

export interface ModelRegistrySummaryState {
  total: number;
  verified: number;
  partiallyVerified: number;
  failed: number;
  unavailable: number;
  deprecated: number;
  notSupported: number;
  newCount: number;
}

export interface ToastNotice {
  id: string;
  title: string;
  message: string;
  source: string;
  severity: 'info' | 'success' | 'warning' | 'error';
  dedupeKey: string;
  occurrences: number;
  actionable?: boolean;
  actionLabel?: string;
  actionTarget?: NavSection;
}

const DEFAULT_PERSONA_STATE: PersonaConfig = {
  name: 'NX',
  voiceGender: 'female',
  ownerLabel: 'Boss',
  friendliness: 82,
  humor: 45,
  affection: 38,
  formality: 55,
  initiativeLevel: 65,
  activeProfileId: 'JARVIS_OPERATOR',
};

const DEFAULT_PREFERENCES: UserPreferencesConfig = {
  preferredLanguage: 'auto',
  responseStyle: 'concise',
  confirmHighRisk: true,
  preferredBrowser: 'chrome',
  voiceEnabled: true,
  voiceRate: 1.0,
  voiceVolume: 1.0,
  voiceLang: 'auto',
  notificationsEnabled: true,
  sidebarState: 'expanded',
  sidebarPinned: true,
  operatingMode: 'OWNER_PRIVATE',
  autoCustomerMode: false,
  proactiveLevel: 'NORMAL',
  autonomousSafeWrites: false,
  customerRetentionDays: 365,
  customerFieldsEnabled: {
    phone: true,
    alternatePhone: true,
    cnic: true,
    address: true,
    deviceModel: true,
    imei: true,
    paymentStatus: true,
    accessoriesPurchased: true,
    warrantyInfo: true,
    staffNotes: true,
  },
  persona: DEFAULT_PERSONA_STATE,
};

interface AgentContextType {
  agentState: AgentState;
  backendOnline: boolean;
  telemetry: LiveSystemTelemetry;
  taskQueue: TaskQueueItem[];
  historyTasks: TaskQueueItem[];
  recentActions: AutonomousAction[];
  events: EventBusEvent[];
  auditLogs: AuditLogEntry[];
  memories: SmartMemoryItem[];
  instructions: InstructionItem[];
  preferences: UserPreferencesConfig;
  operatingMode: OperatingMode;
  persona: PersonaConfig;
  behaviorProfiles: BehaviorProfile[];
  capabilities: CapabilityRecord[];
  customers: CustomerRecordView[];
  providerDiagnostics: ProviderDiagnosticAttempt[];
  selfHealth: SubsystemHealthItem[];
  notifications: NotificationItem[];
  unreadNotificationsCount: number;
  toasts: ToastNotice[];
  aliases: WakeAliasItem[];
  theme: CustomThemeConfig;
  providerProfiles: ProviderProfile[];
  modelRegistry: ModelRegistryRecord[];
  modelSummary: ModelRegistrySummaryState;
  skills: SkillManifest[];
  workers: WorkerContract[];
  tools: ToolContract[];
  mobileBridge: MobileBridgeStatus | null;
  browserSession: BrowserSessionInfo | null;
  chatMessages: ChatMessage[];
  activeNav: NavSection;
  sidebarState: 'expanded' | 'collapsed' | 'closed';
  sidebarDrawerOpen: boolean;
  isSendingCommand: boolean;
  voiceState: VoiceEngineState;
  micPermission: MicPermissionStatus;
  audioDevices: AudioDeviceOption[];
  ttsVoices: TtsVoiceOption[];
  isListening: boolean;
  isSpeaking: boolean;
  liveTranscript: string;
  micVolume: number;
  voiceNotice: string | null;
  interactionMode: 'voice' | 'chat';
  setActiveNav: (nav: NavSection) => void;
  setSidebarState: (state: 'expanded' | 'collapsed' | 'closed') => void;
  setSidebarDrawerOpen: (open: boolean) => void;
  setInteractionMode: (mode: 'voice' | 'chat') => void;
  clearVoiceNotice: () => void;
  dismissToast: (id: string) => void;
  notifyUser: (input: Omit<ToastNotice, 'id' | 'occurrences'>) => void;
  markAllNotificationsRead: () => Promise<void>;
  clearNonCriticalNotifications: () => Promise<void>;
  sendCommand: (prompt: string) => Promise<any>;
  cancelActiveCommand: () => void;
  cancelTask: (taskId: string) => Promise<void>;
  confirmTask: (taskId: string, approved: boolean) => Promise<void>;
  startVoiceListening: () => void;
  stopVoiceListening: () => void;
  bargeInInterrupt: () => void;
  speakNatural: (text: string) => void;
  refreshAudioDevices: () => Promise<void>;
  refreshTelemetry: () => Promise<void>;
  refreshSelfHealth: () => Promise<void>;
  refreshCapabilities: () => Promise<void>;
  refreshPersona: () => Promise<void>;
  refreshBehaviorProfiles: () => Promise<void>;
  refreshCustomers: (query?: string, includeArchived?: boolean) => Promise<void>;
  toggleOperatingMode: (targetMode?: OperatingMode) => Promise<void>;
  updatePersona: (updates: Partial<PersonaConfig>) => Promise<{ ok: boolean; error?: string }>;
  createBehaviorProfile: (profile: Partial<BehaviorProfile> & { displayName: string }) => Promise<{ ok: boolean; error?: string }>;
  updateBehaviorProfile: (id: string, updates: Partial<BehaviorProfile>) => Promise<{ ok: boolean; error?: string }>;
  deleteBehaviorProfile: (id: string) => Promise<{ ok: boolean; error?: string }>;
  createCustomer: (input: {
    name: string;
    phone?: string;
    alternatePhone?: string;
    cnic?: string;
    address?: string;
    deviceModel?: string;
    imei?: string;
    repairNotes?: string;
    paymentStatus?: CustomerRecord['paymentStatus'];
    accessoriesPurchased?: string;
    warrantyInfo?: string;
    staffNotes?: string;
    tags?: string[];
  }) => Promise<{ ok: boolean; customer?: CustomerRecordView; error?: string }>;
  getCustomerDetail: (id: string, reveal?: boolean) => Promise<{ ok: boolean; customer?: CustomerRecordView; error?: string; code?: string }>;
  updateCustomerRecord: (id: string, updates: Partial<CustomerRecord>) => Promise<{ ok: boolean; customer?: CustomerRecordView; error?: string }>;
  addCustomerServiceEntry: (
    id: string,
    input: {
      deviceModel?: string;
      issue: string;
      resolution?: string;
      amountPKR?: number;
      paymentStatus?: CustomerRecord['paymentStatus'];
      warrantyDays?: number;
    }
  ) => Promise<{ ok: boolean; customer?: CustomerRecordView; error?: string }>;
  archiveCustomerRecord: (id: string, archived?: boolean) => Promise<{ ok: boolean; error?: string }>;
  deleteCustomerRecord: (id: string) => Promise<{ ok: boolean; error?: string }>;
  exportSanitizedCustomers: (includeArchived?: boolean) => Promise<any>;
  exportCustomerBackup: () => Promise<{ ok: boolean; backup?: any; error?: string }>;
  restoreCustomerBackup: (backup: any) => Promise<{ ok: boolean; restoredCount?: number; error?: string }>;
  listSafeFiles: (directory: string) => Promise<any>;
  createSafeFolder: (folderPath: string) => Promise<any>;
  createSafeFile: (filePath: string, content?: string) => Promise<any>;
  scanMediaFiles: (dirs?: string[]) => Promise<any>;
  addMemoryItem: (content: string, layer?: MemoryLayer) => Promise<{ ok: boolean; error?: string }>;
  updateMemoryItem: (id: string, updates: { content?: string; layer?: MemoryLayer }) => Promise<{ ok: boolean; error?: string }>;
  deleteMemory: (id: string) => Promise<void>;
  addInstruction: (input: {
    title: string;
    content: string;
    source?: InstructionSource;
    scope?: InstructionItem['scope'];
  }) => Promise<{ ok: boolean; error?: string }>;
  updateInstruction: (id: string, updates: Partial<Pick<InstructionItem, 'title' | 'content' | 'enabled' | 'scope'>>) => Promise<{ ok: boolean; error?: string }>;
  deleteInstruction: (id: string) => Promise<{ ok: boolean; error?: string }>;
  updatePreferences: (updates: Partial<UserPreferencesConfig>) => Promise<void>;
  addAlias: (
    alias: string,
    sensitivity?: number,
    options?: Partial<Pick<WakeAliasItem, 'behaviorProfileId' | 'language' | 'priority' | 'contextRules'>>
  ) => Promise<void>;
  updateAlias: (id: string, updates: Partial<WakeAliasItem>) => Promise<void>;
  deleteAlias: (id: string) => Promise<void>;
  testWakePhrase: (phrase: string) => Promise<any>;
  updateTheme: (updates: Partial<CustomThemeConfig>) => Promise<void>;
  addProviderProfile: (profile: {
    platform: AIPlatformId;
    apiKey: string;
    displayName?: string;
    assignedRole?: ProviderProfile['assignedRole'];
  }) => Promise<any>;
  addBulkProviderProfiles: (payload: {
    platform: AIPlatformId;
    keysText: string;
    defaultRole?: ProviderProfile['assignedRole'];
  }) => Promise<any>;
  updateProviderProfile: (id: string, updates: Partial<ProviderProfile>) => Promise<void>;
  testProviderProfile: (id: string) => Promise<any>;
  validateAllProviderProfiles: () => Promise<any>;
  deleteProviderProfile: (id: string) => Promise<void>;
  toggleSkill: (skillId: string) => Promise<void>;
  testSkill: (skillId: string, query?: string, target?: string) => Promise<any>;
  runSkill: (skillId: string, query?: string, target?: string) => Promise<any>;
}

const emptyMetric = (unit: string) => ({
  value: null,
  unit,
  source: 'pending',
  capturedAt: 0,
  freshnessMs: 0,
  status: 'UNAVAILABLE' as const,
});

const defaultTelemetry: LiveSystemTelemetry = {
  cpuLoad: emptyMetric('%'),
  ramUsedMB: emptyMetric('MB'),
  ramTotalMB: emptyMetric('MB'),
  nxProcessRssMB: emptyMetric('MB'),
  diskActivity: {
    readSpeedMBs: emptyMetric('MB/s'),
    writeSpeedMBs: emptyMetric('MB/s'),
    activeDrive: '—',
  },
  networkSpeedKBps: emptyMetric('KB/s'),
  platformInfo: {
    os: 'unknown',
    release: '',
    arch: '',
    hostname: '',
    cpuCores: 0,
    uptimeSeconds: 0,
  },
  activeWindows: [],
  processesStatus: 'UNAVAILABLE',
  storageDevices: [],
  lastUpdated: 0,
};

const AgentContext = createContext<AgentContextType | null>(null);

export const AgentProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [agentState, setAgentState] = useState<AgentState>('IDLE');
  const [backendOnline, setBackendOnline] = useState(true);
  const [telemetry, setTelemetry] = useState<LiveSystemTelemetry>(defaultTelemetry);
  const [taskQueue, setTaskQueue] = useState<TaskQueueItem[]>([]);
  const [historyTasks, setHistoryTasks] = useState<TaskQueueItem[]>([]);
  const [recentActions, setRecentActions] = useState<AutonomousAction[]>([]);
  const [events, setEvents] = useState<EventBusEvent[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [memories, setMemories] = useState<SmartMemoryItem[]>([]);
  const [instructions, setInstructions] = useState<InstructionItem[]>([]);
  const [preferences, setPreferences] = useState<UserPreferencesConfig>(DEFAULT_PREFERENCES);
  const [persona, setPersona] = useState<PersonaConfig>(DEFAULT_PERSONA_STATE);
  const [behaviorProfiles, setBehaviorProfiles] = useState<BehaviorProfile[]>([]);
  const [capabilities, setCapabilities] = useState<CapabilityRecord[]>([]);
  const [customers, setCustomers] = useState<CustomerRecordView[]>([]);
  const [providerDiagnostics, setProviderDiagnostics] = useState<ProviderDiagnosticAttempt[]>([]);
  const [selfHealth, setSelfHealth] = useState<SubsystemHealthItem[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [toasts, setToasts] = useState<ToastNotice[]>([]);
  const [aliases, setAliases] = useState<WakeAliasItem[]>([]);
  const [theme, setThemeState] = useState<CustomThemeConfig>(DEFAULT_NX_THEME);
  const [providerProfiles, setProviderProfiles] = useState<ProviderProfile[]>([]);
  const [modelRegistry, setModelRegistry] = useState<ModelRegistryRecord[]>([]);
  const [modelSummary, setModelSummary] = useState<ModelRegistrySummaryState>({
    total: 0,
    verified: 0,
    partiallyVerified: 0,
    failed: 0,
    unavailable: 0,
    deprecated: 0,
    notSupported: 0,
    newCount: 0,
  });
  const [skills, setSkills] = useState<SkillManifest[]>([]);
  const [workers, setWorkers] = useState<WorkerContract[]>([]);
  const [tools, setTools] = useState<ToolContract[]>([]);
  const [mobileBridge, setMobileBridge] = useState<MobileBridgeStatus | null>(null);
  const [browserSession, setBrowserSession] = useState<BrowserSessionInfo | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [activeNav, setActiveNav] = useState<NavSection>('dashboard');
  const [sidebarState, setSidebarStateLocal] = useState<'expanded' | 'collapsed' | 'closed'>('expanded');
  const [sidebarDrawerOpen, setSidebarDrawerOpen] = useState(false);

  const [isSendingCommand, setIsSendingCommand] = useState(false);
  const [voiceState, setVoiceState] = useState<VoiceEngineState>('IDLE');
  const [micPermission, setMicPermission] = useState<MicPermissionStatus>('prompt');
  const [audioDevices, setAudioDevices] = useState<AudioDeviceOption[]>([]);
  const [ttsVoices, setTtsVoices] = useState<TtsVoiceOption[]>([]);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [micVolume, setMicVolume] = useState(0);
  const [voiceNotice, setVoiceNotice] = useState<string | null>(null);
  const [interactionMode, setInteractionMode] = useState<'voice' | 'chat'>('chat');

  const isListening = voiceState === 'LISTENING' || voiceState === 'REQUESTING_PERMISSION';
  const isSpeaking = voiceState === 'SPEAKING';

  const audioSessionRef = useRef<AudioSession | null>(null);
  const activeCommandAbortRef = useRef<AbortController | null>(null);
  const commandSequenceRef = useRef(0);
  const conversationIdRef = useRef('conv-default');
  const sendCommandRef = useRef<(prompt: string) => Promise<any>>(async () => null);
  const preferencesRef = useRef<UserPreferencesConfig>(DEFAULT_PREFERENCES);
  preferencesRef.current = preferences;

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const notifyUser = useCallback((input: Omit<ToastNotice, 'id' | 'occurrences'>) => {
    if (!preferencesRef.current.notificationsEnabled && input.severity === 'info') return;
    const toastId = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
    setToasts((prev) => {
      const existing = prev.find((t) => t.dedupeKey === input.dedupeKey);
      if (existing) {
        return prev.map((t) =>
          t.dedupeKey === input.dedupeKey
            ? { ...t, message: input.message, occurrences: t.occurrences + 1 }
            : t
        );
      }
      return [{ ...input, id: toastId, occurrences: 1 }, ...prev].slice(0, 4);
    });
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== toastId));
    }, 5500);
  }, []);

  const refreshNotifications = useCallback(async () => {
    const res = await apiClient.get<{ notifications: NotificationItem[] }>('/api/v1/notifications');
    if (res.ok && Array.isArray(res.data?.notifications)) {
      setNotifications(res.data.notifications);
    }
  }, []);

  const refreshSelfHealth = useCallback(async () => {
    const res = await apiClient.get<{ subsystems: SubsystemHealthItem[] }>('/api/v1/health/self-check');
    if (res.ok && Array.isArray(res.data?.subsystems)) {
      setSelfHealth(res.data.subsystems);
    }
  }, []);

  const refreshTelemetry = useCallback(async () => {
    const res = await apiClient.get<any>('/api/v1/system/telemetry');
    if (!res.ok || !res.data) {
      setBackendOnline(false);
      return;
    }
    const data = res.data;
    setBackendOnline(true);
    if (data.telemetry) setTelemetry(data.telemetry);
    if (data.agentState) setAgentState(data.agentState);
    if (Array.isArray(data.taskQueue)) setTaskQueue(data.taskQueue);
    if (Array.isArray(data.historyTasks)) setHistoryTasks(data.historyTasks);
    if (Array.isArray(data.recentActions)) setRecentActions(data.recentActions);
    if (data.mobileBridge) setMobileBridge(data.mobileBridge);
  }, []);

  const refreshModels = useCallback(async () => {
    const res = await apiClient.get<any>('/api/v1/models');
    if (res.ok && res.data) {
      if (Array.isArray(res.data.models)) setModelRegistry(res.data.models);
      if (res.data.summary) setModelSummary(res.data.summary);
    }
  }, []);

  const refreshDiagnostics = useCallback(async () => {
    const res = await apiClient.get<{ diagnostics: ProviderDiagnosticAttempt[] }>('/api/v1/providers/diagnostics');
    if (res.ok && Array.isArray(res.data?.diagnostics)) {
      setProviderDiagnostics(res.data.diagnostics);
    }
  }, []);

  const refreshCapabilities = useCallback(async () => {
    const res = await apiClient.get<{ capabilities: CapabilityRecord[] }>('/api/v1/capabilities');
    if (res.ok && Array.isArray(res.data?.capabilities)) {
      setCapabilities(res.data.capabilities);
    }
  }, []);

  const refreshPersona = useCallback(async () => {
    const res = await apiClient.get<{ persona: PersonaConfig; operatingMode?: OperatingMode }>('/api/v1/persona');
    if (res.ok && res.data?.persona) {
      setPersona(res.data.persona);
      const operatingMode = res.data.operatingMode;
      if (operatingMode) {
        setPreferences((prev) => ({ ...prev, operatingMode }));
      }
    }
  }, []);

  const refreshBehaviorProfiles = useCallback(async () => {
    const res = await apiClient.get<{ profiles: BehaviorProfile[] }>('/api/v1/behavior-profiles');
    if (res.ok && Array.isArray(res.data?.profiles)) {
      setBehaviorProfiles(res.data.profiles);
    }
  }, []);

  const refreshCustomers = useCallback(async (query?: string, includeArchived = false) => {
    const params = new URLSearchParams();
    if (query && query.trim()) params.set('q', query.trim());
    if (includeArchived) params.set('includeArchived', 'true');
    const qs = params.toString();
    const res = await apiClient.get<{ customers: CustomerRecordView[] }>(`/api/v1/customers${qs ? `?${qs}` : ''}`);
    if (res.ok && Array.isArray(res.data?.customers)) {
      setCustomers(res.data.customers);
    }
  }, []);

  const fetchInitialData = useCallback(async () => {
    const [
      memRes,
      instRes,
      aliasRes,
      themeRes,
      profRes,
      modelsRes,
      tasksRes,
      skillsRes,
      browserRes,
      eventsRes,
      workersRes,
      notifRes,
      healthRes,
      capRes,
      personaRes,
      bpRes,
      custRes,
    ] = await Promise.all([
      apiClient.get('/api/v1/memory'),
      apiClient.get('/api/v1/instructions'),
      apiClient.get('/api/settings/aliases'),
      apiClient.get('/api/settings/theme'),
      apiClient.get('/api/v1/providers'),
      apiClient.get('/api/v1/models'),
      apiClient.get('/api/v1/tasks'),
      apiClient.get('/api/v1/skills'),
      apiClient.get('/api/v1/browser/sessions'),
      apiClient.get('/api/v1/events?history=true'),
      apiClient.get('/api/v1/workers'),
      apiClient.get('/api/v1/notifications'),
      apiClient.get('/api/v1/health/self-check'),
      apiClient.get('/api/v1/capabilities'),
      apiClient.get('/api/v1/persona'),
      apiClient.get('/api/v1/behavior-profiles'),
      apiClient.get('/api/v1/customers'),
    ]);

    if (memRes.ok && memRes.data) setMemories(memRes.data.memories || []);
    if (instRes.ok && instRes.data) {
      setInstructions(instRes.data.instructions || []);
      if (instRes.data.preferences) {
        setPreferences({ ...DEFAULT_PREFERENCES, ...instRes.data.preferences });
        if (instRes.data.preferences.sidebarState) {
          setSidebarStateLocal(instRes.data.preferences.sidebarState);
        }
      }
    }
    if (aliasRes.ok && aliasRes.data) setAliases(aliasRes.data.aliases || []);
    if (themeRes.ok && themeRes.data?.theme) setThemeState(themeRes.data.theme);
    if (profRes.ok && profRes.data) {
      setProviderProfiles(profRes.data.profiles || []);
      if (profRes.data.modelSummary) setModelSummary(profRes.data.modelSummary);
      if (Array.isArray(profRes.data.diagnostics)) setProviderDiagnostics(profRes.data.diagnostics);
    }
    if (modelsRes.ok && modelsRes.data) {
      if (Array.isArray(modelsRes.data.models)) setModelRegistry(modelsRes.data.models);
      if (modelsRes.data.summary) setModelSummary(modelsRes.data.summary);
    }
    if (tasksRes.ok && tasksRes.data) {
      if (Array.isArray(tasksRes.data.activeTasks)) setTaskQueue(tasksRes.data.activeTasks);
      if (Array.isArray(tasksRes.data.historyTasks)) setHistoryTasks(tasksRes.data.historyTasks);
      if (Array.isArray(tasksRes.data.recentActions)) setRecentActions(tasksRes.data.recentActions);
      if (Array.isArray(tasksRes.data.chatMessages)) setChatMessages(tasksRes.data.chatMessages);
    }
    if (skillsRes.ok && skillsRes.data) setSkills(skillsRes.data.skills || []);
    if (browserRes.ok && browserRes.data?.session) setBrowserSession(browserRes.data.session);
    if (eventsRes.ok && eventsRes.data) {
      if (Array.isArray(eventsRes.data.events)) setEvents(eventsRes.data.events);
      if (Array.isArray(eventsRes.data.auditLogs)) setAuditLogs(eventsRes.data.auditLogs);
    }
    if (workersRes.ok && workersRes.data) {
      if (Array.isArray(workersRes.data.workers)) setWorkers(workersRes.data.workers);
      if (Array.isArray(workersRes.data.tools)) setTools(workersRes.data.tools);
    }
    if (notifRes.ok && notifRes.data) setNotifications(notifRes.data.notifications || []);
    if (healthRes.ok && healthRes.data?.subsystems) setSelfHealth(healthRes.data.subsystems);
    if (capRes.ok && Array.isArray(capRes.data?.capabilities)) setCapabilities(capRes.data.capabilities);
    if (personaRes.ok && personaRes.data?.persona) setPersona(personaRes.data.persona);
    if (bpRes.ok && Array.isArray(bpRes.data?.profiles)) setBehaviorProfiles(bpRes.data.profiles);
    if (custRes.ok && Array.isArray(custRes.data?.customers)) setCustomers(custRes.data.customers);
  }, []);

  useEffect(() => {
    fetchInitialData();
    refreshTelemetry();
    const interval = setInterval(refreshTelemetry, 3000);

    let es: EventSource | null = null;
    if (typeof EventSource !== 'undefined') {
      es = new EventSource('/api/v1/events');
      es.addEventListener('nx', (evt: MessageEvent) => {
        try {
          const parsed = JSON.parse(evt.data) as EventBusEvent;
          setEvents((prev) => [parsed, ...prev.filter((e) => e.id !== parsed.id)].slice(0, 80));
          if (parsed.type === 'TASK_STATE_CHANGED' && parsed.payload?.state) {
            setAgentState(parsed.payload.state as AgentState);
          }
          if (parsed.type === 'MODE_CHANGED' || parsed.type === 'PERSONA_UPDATED') {
            refreshPersona();
            refreshBehaviorProfiles();
            refreshCapabilities();
          }
          if (
            parsed.type === 'CUSTOMER_CREATED' ||
            parsed.type === 'CUSTOMER_UPDATED' ||
            parsed.type === 'CUSTOMER_DELETED'
          ) {
            refreshCustomers();
          }
          if (parsed.type === 'KEY_VALIDATION_FINISHED' || parsed.type === 'POLICY_BLOCKED') {
            refreshNotifications();
          }
        } catch {
          // Ignore malformed event chunk
        }
      });
    }

    return () => {
      clearInterval(interval);
      es?.close();
    };
  }, [
    fetchInitialData,
    refreshTelemetry,
    refreshNotifications,
    refreshPersona,
    refreshBehaviorProfiles,
    refreshCapabilities,
    refreshCustomers,
  ]);

  useEffect(() => {
    const session = new AudioSession({
      onStateChange: (next) => setVoiceState(next),
      onInterimTranscript: (text) => setLiveTranscript(text),
      onFinalTranscript: (finalText) => {
        setLiveTranscript('');
        sendCommandRef.current(finalText);
      },
      onMicLevel: (level) => setMicVolume(level),
      onError: (_code, message) => {
        setVoiceNotice(message);
        notifyUser({
          title: 'Voice Engine Notice',
          message,
          source: 'audio-session',
          severity: 'warning',
          dedupeKey: `voice-notice-${_code}`,
        });
      },
      onDevicesUpdated: (devices, voices) => {
        setAudioDevices(devices);
        setTtsVoices(voices);
      },
      onPermissionChange: (status) => setMicPermission(status),
    });
    audioSessionRef.current = session;
    return () => {
      session.destroy();
      audioSessionRef.current = null;
    };
  }, [notifyUser]);

  const bargeInInterrupt = useCallback(() => {
    audioSessionRef.current?.interruptSpeech();
  }, []);

  const speakNatural = useCallback((text: string) => {
    if (!preferencesRef.current.voiceEnabled) return;
    audioSessionRef.current?.speak(text, {
      rate: preferencesRef.current.voiceRate,
      volume: preferencesRef.current.voiceVolume,
      lang: preferencesRef.current.voiceLang,
      voiceName: preferencesRef.current.selectedVoiceName,
    });
  }, []);

  const cancelActiveCommand = useCallback(() => {
    activeCommandAbortRef.current?.abort();
    activeCommandAbortRef.current = null;
    setIsSendingCommand(false);
    setAgentState('IDLE');
  }, []);

  const sendCommand = useCallback(
    async (prompt: string) => {
      const trimmed = prompt.trim();
      if (!trimmed) return null;

      bargeInInterrupt();
      activeCommandAbortRef.current?.abort();
      const abortController = new AbortController();
      activeCommandAbortRef.current = abortController;

      const seq = ++commandSequenceRef.current;
      const requestId = apiClient.generateCorrelationId('cmd');
      setIsSendingCommand(true);
      setAgentState('RECEIVED');

      const optimisticUserId = `msg-${Date.now()}-u-${seq}`;
      const userMsg: ChatMessage = {
        id: optimisticUserId,
        conversationId: conversationIdRef.current,
        sequence: seq,
        requestId,
        sender: 'user',
        text: trimmed,
        time: Date.now(),
        status: 'sending',
      };
      setChatMessages((prev) => [...prev, userMsg]);

      const res = await apiClient.post<any>(
        '/api/agent/command',
        {
          prompt: trimmed,
          mode: interactionMode,
          conversationId: conversationIdRef.current,
          sequence: seq,
          requestId,
          correlationId: requestId,
        },
        { timeoutMs: 45_000, signal: abortController.signal, correlationId: requestId }
      );

      if (abortController.signal.aborted || seq !== commandSequenceRef.current) {
        setChatMessages((prev) =>
          prev.map((m) => (m.id === optimisticUserId ? { ...m, status: 'cancelled' } : m))
        );
        return null;
      }

      setIsSendingCommand(false);
      activeCommandAbortRef.current = null;

      if (!res.ok && !res.data) {
        setAgentState('FAILED');
        setChatMessages((prev) => [
          ...prev.map((m) => (m.id === optimisticUserId ? { ...m, status: 'failed' as const } : m)),
          {
            id: `msg-${Date.now()}-err`,
            conversationId: conversationIdRef.current,
            sequence: seq,
            requestId,
            sender: 'agent',
            text: res.error?.message || 'Backend connection lost while dispatching command.',
            time: Date.now(),
            status: 'failed',
            outcome: 'FAILED',
          },
        ]);
        notifyUser({
          title: 'Command Dispatch Failed',
          message: res.error?.message || 'Unable to reach NX backend.',
          source: 'orchestrator',
          severity: 'error',
          dedupeKey: 'cmd-dispatch-error',
        });
        setTimeout(() => setAgentState('IDLE'), 1200);
        return null;
      }

      const data = res.data;
      setAgentState(data.agentState || 'IDLE');
      if (data.operatingMode) {
        setPreferences((prev) => ({ ...prev, operatingMode: data.operatingMode }));
      }

      if (data.task) {
        setTaskQueue((prev) => [data.task, ...prev.filter((t) => t.id !== data.task.id)].slice(0, 15));
        setHistoryTasks((prev) => [data.task, ...prev.filter((t) => t.id !== data.task.id)].slice(0, 40));
      }
      if (Array.isArray(data.actions)) {
        setRecentActions((prev) => [...data.actions, ...prev].slice(0, 30));
      }
      if (data.memory) {
        setMemories((prev) => [data.memory, ...prev.filter((m) => m.id !== data.memory.id)]);
      }

      const replyText = data.replyText || data.responseEnglish || data.responseUrdu || 'Command processed.';
      const agentMsg: ChatMessage = {
        id: `msg-${Date.now()}-a-${seq}`,
        conversationId: conversationIdRef.current,
        sequence: seq,
        requestId,
        correlationId: data.correlationId || requestId,
        sender: 'agent',
        text: replyText,
        time: Date.now(),
        taskId: data.task?.taskId,
        status: 'completed',
        outcome: data.outcome || (data.ok ? 'DONE' : 'FAILED'),
      };

      setChatMessages((prev) => [
        ...prev.map((m) => (m.id === optimisticUserId ? { ...m, status: 'completed' as const } : m)),
        agentMsg,
      ]);

      if (interactionMode === 'voice' && preferencesRef.current.voiceEnabled) {
        speakNatural(replyText);
      }

      refreshTelemetry();
      refreshNotifications();
      refreshCapabilities();
      refreshCustomers();
      refreshPersona();
      apiClient.get('/api/v1/events?history=true').then((hist) => {
        if (hist.ok && Array.isArray(hist.data?.auditLogs)) setAuditLogs(hist.data.auditLogs);
      });
      return data;
    },
    [
      bargeInInterrupt,
      interactionMode,
      speakNatural,
      refreshTelemetry,
      refreshNotifications,
      refreshCapabilities,
      refreshCustomers,
      refreshPersona,
      notifyUser,
    ]
  );

  useEffect(() => {
    sendCommandRef.current = sendCommand;
  }, [sendCommand]);

  const cancelTask = useCallback(
    async (taskId: string) => {
      const res = await apiClient.post(`/api/v1/tasks/${encodeURIComponent(taskId)}/cancel`);
      if (res.ok) await refreshTelemetry();
    },
    [refreshTelemetry]
  );

  const confirmTask = useCallback(
    async (taskId: string, approved: boolean) => {
      const res = await apiClient.post(`/api/v1/tasks/${encodeURIComponent(taskId)}/confirm`, { approved });
      if (res.ok) await refreshTelemetry();
    },
    [refreshTelemetry]
  );

  const startVoiceListening = useCallback(() => {
    setVoiceNotice(null);
    audioSessionRef.current?.startListening({
      lang: preferencesRef.current.voiceLang,
      deviceId: preferencesRef.current.selectedMicDeviceId,
    });
  }, []);

  const stopVoiceListening = useCallback(() => {
    audioSessionRef.current?.stopListening('IDLE');
  }, []);

  const refreshAudioDevices = useCallback(async () => {
    await audioSessionRef.current?.refreshDevicesAndVoices();
    await audioSessionRef.current?.probePermission();
  }, []);

  const addMemoryItem = useCallback(
    async (content: string, layer: MemoryLayer = 'PREFERENCE') => {
      const res = await apiClient.post('/api/v1/memory', { content, layer });
      if (res.ok && res.data?.memory) {
        setMemories((prev) => [res.data.memory, ...prev.filter((m) => m.id !== res.data.memory.id)]);
        return { ok: true };
      }
      return { ok: false, error: res.error?.message || 'Failed to add memory' };
    },
    []
  );

  const updateMemoryItem = useCallback(
    async (id: string, updates: { content?: string; layer?: MemoryLayer }) => {
      const res = await apiClient.patch(`/api/v1/memory/${encodeURIComponent(id)}`, updates);
      if (res.ok && res.data?.memory) {
        setMemories((prev) => prev.map((m) => (m.id === id ? res.data.memory : m)));
        return { ok: true };
      }
      return { ok: false, error: res.error?.message || 'Failed to update memory' };
    },
    []
  );

  const deleteMemory = useCallback(async (id: string) => {
    const res = await apiClient.delete(`/api/v1/memory/${encodeURIComponent(id)}`);
    if (res.ok) setMemories((prev) => prev.filter((m) => m.id !== id));
  }, []);

  const addInstruction = useCallback(
    async (input: {
      title: string;
      content: string;
      source?: InstructionSource;
      scope?: InstructionItem['scope'];
    }) => {
      const res = await apiClient.post('/api/v1/instructions', input);
      if (res.ok && Array.isArray(res.data?.instructions)) {
        setInstructions(res.data.instructions);
        return { ok: true };
      }
      return { ok: false, error: res.error?.message || 'Failed to add instruction' };
    },
    []
  );

  const updateInstruction = useCallback(
    async (
      id: string,
      updates: Partial<Pick<InstructionItem, 'title' | 'content' | 'enabled' | 'scope'>>
    ) => {
      const res = await apiClient.patch(`/api/v1/instructions/${encodeURIComponent(id)}`, updates);
      if (res.ok && Array.isArray(res.data?.instructions)) {
        setInstructions(res.data.instructions);
        return { ok: true };
      }
      return { ok: false, error: res.error?.message || 'Failed to update instruction' };
    },
    []
  );

  const deleteInstruction = useCallback(async (id: string) => {
    const res = await apiClient.delete(`/api/v1/instructions/${encodeURIComponent(id)}`);
    if (res.ok && Array.isArray(res.data?.instructions)) {
      setInstructions(res.data.instructions);
      return { ok: true };
    }
    return { ok: false, error: res.error?.message || 'Failed to delete instruction' };
  }, []);

  const updatePreferences = useCallback(
    async (updates: Partial<UserPreferencesConfig>) => {
      setPreferences((prev) => ({ ...prev, ...updates }));
      const res = await apiClient.patch('/api/v1/preferences', updates);
      if (res.ok && res.data?.preferences) {
        setPreferences({ ...DEFAULT_PREFERENCES, ...res.data.preferences });
        if (res.data.preferences.sidebarState) {
          setSidebarStateLocal(res.data.preferences.sidebarState);
        }
        await Promise.all([refreshPersona(), refreshCapabilities(), refreshCustomers()]);
      }
    },
    [refreshPersona, refreshCapabilities, refreshCustomers]
  );

  const operatingMode: OperatingMode = preferences.operatingMode || 'OWNER_PRIVATE';

  const toggleOperatingMode = useCallback(
    async (targetMode?: OperatingMode) => {
      const next: OperatingMode =
        targetMode || (operatingMode === 'OWNER_PRIVATE' ? 'CUSTOMER_SAFE' : 'OWNER_PRIVATE');
      await updatePreferences({ operatingMode: next });
      notifyUser({
        title: next === 'CUSTOMER_SAFE' ? 'Customer Safe Mode Active' : 'Owner Private Mode Active',
        message:
          next === 'CUSTOMER_SAFE'
            ? 'Private memories suppressed, formal counter-safe tone enforced, and unmasked customer reveal locked.'
            : 'Full owner persona, wake profiles, and single-record owner reveal enabled.',
        source: 'operating-mode',
        severity: next === 'CUSTOMER_SAFE' ? 'warning' : 'success',
        dedupeKey: 'operating-mode-switch',
      });
    },
    [operatingMode, updatePreferences, notifyUser]
  );

  const updatePersona = useCallback(
    async (updates: Partial<PersonaConfig>) => {
      const res = await apiClient.patch('/api/v1/persona', updates);
      if (res.ok && res.data?.persona) {
        setPersona(res.data.persona);
        return { ok: true };
      }
      return { ok: false, error: res.error?.message || 'Failed to update persona' };
    },
    []
  );

  const createBehaviorProfile = useCallback(
    async (profile: Partial<BehaviorProfile> & { displayName: string }) => {
      const res = await apiClient.post('/api/v1/behavior-profiles', profile);
      if (res.ok && Array.isArray(res.data?.profiles)) {
        setBehaviorProfiles(res.data.profiles);
        return { ok: true };
      }
      return { ok: false, error: res.error?.message || 'Failed to create behavior profile' };
    },
    []
  );

  const updateBehaviorProfile = useCallback(async (id: string, updates: Partial<BehaviorProfile>) => {
    const res = await apiClient.patch(`/api/v1/behavior-profiles/${encodeURIComponent(id)}`, updates);
    if (res.ok && Array.isArray(res.data?.profiles)) {
      setBehaviorProfiles(res.data.profiles);
      return { ok: true };
    }
    return { ok: false, error: res.error?.message || 'Failed to update behavior profile' };
  }, []);

  const deleteBehaviorProfile = useCallback(async (id: string) => {
    const res = await apiClient.delete(`/api/v1/behavior-profiles/${encodeURIComponent(id)}`);
    if (res.ok && Array.isArray(res.data?.profiles)) {
      setBehaviorProfiles(res.data.profiles);
      return { ok: true };
    }
    return { ok: false, error: res.error?.message || 'Failed to delete behavior profile' };
  }, []);

  const createCustomer = useCallback(
    async (input: {
      name: string;
      phone?: string;
      alternatePhone?: string;
      cnic?: string;
      address?: string;
      deviceModel?: string;
      imei?: string;
      repairNotes?: string;
      paymentStatus?: CustomerRecord['paymentStatus'];
      accessoriesPurchased?: string;
      warrantyInfo?: string;
      staffNotes?: string;
      tags?: string[];
    }) => {
      const res = await apiClient.post('/api/v1/customers', input);
      if (res.ok && res.data?.customer) {
        await refreshCustomers();
        return { ok: true, customer: res.data.customer as CustomerRecordView };
      }
      return { ok: false, error: res.error?.message || 'Failed to save customer record' };
    },
    [refreshCustomers]
  );

  const getCustomerDetail = useCallback(async (id: string, reveal = false) => {
    const res = await apiClient.get<{ customer: CustomerRecordView }>(
      `/api/v1/customers/${encodeURIComponent(id)}${reveal ? '?reveal=true' : ''}`
    );
    if (res.ok && res.data?.customer) {
      return { ok: true, customer: res.data.customer };
    }
    return {
      ok: false,
      code: res.error?.code,
      error: res.error?.message || 'Unable to inspect customer record.',
    };
  }, []);

  const updateCustomerRecord = useCallback(
    async (id: string, updates: Partial<CustomerRecord>) => {
      const res = await apiClient.patch(`/api/v1/customers/${encodeURIComponent(id)}`, updates);
      if (res.ok && res.data?.customer) {
        await refreshCustomers();
        return { ok: true, customer: res.data.customer as CustomerRecordView };
      }
      return { ok: false, error: res.error?.message || 'Failed to update customer' };
    },
    [refreshCustomers]
  );

  const addCustomerServiceEntry = useCallback(
    async (
      id: string,
      input: {
        deviceModel?: string;
        issue: string;
        resolution?: string;
        amountPKR?: number;
        paymentStatus?: CustomerRecord['paymentStatus'];
        warrantyDays?: number;
      }
    ) => {
      const res = await apiClient.post(`/api/v1/customers/${encodeURIComponent(id)}/service`, input);
      if (res.ok && res.data?.customer) {
        await refreshCustomers();
        return { ok: true, customer: res.data.customer as CustomerRecordView };
      }
      return { ok: false, error: res.error?.message || 'Failed to add service entry' };
    },
    [refreshCustomers]
  );

  const archiveCustomerRecord = useCallback(
    async (id: string, archived = true) => {
      const res = await apiClient.post(`/api/v1/customers/${encodeURIComponent(id)}/archive`, { archived });
      if (res.ok) {
        await refreshCustomers(undefined, true);
        return { ok: true };
      }
      return { ok: false, error: res.error?.message || 'Failed to archive customer' };
    },
    [refreshCustomers]
  );

  const deleteCustomerRecord = useCallback(
    async (id: string) => {
      const res = await apiClient.delete(`/api/v1/customers/${encodeURIComponent(id)}`);
      if (res.ok) {
        await refreshCustomers(undefined, true);
        return { ok: true };
      }
      return { ok: false, error: res.error?.message || 'Failed to delete customer' };
    },
    [refreshCustomers]
  );

  const exportSanitizedCustomers = useCallback(async (includeArchived = false) => {
    const res = await apiClient.get(`/api/v1/customers/export/sanitized${includeArchived ? '?includeArchived=true' : ''}`);
    return res.ok ? res.data : { ok: false, error: res.error?.message };
  }, []);

  const exportCustomerBackup = useCallback(async () => {
    const res = await apiClient.post('/api/v1/customers/backup');
    if (res.ok && res.data?.backup) {
      return { ok: true, backup: res.data.backup };
    }
    return { ok: false, error: res.error?.message || 'Encrypted backup unavailable.' };
  }, []);

  const restoreCustomerBackup = useCallback(
    async (backup: any) => {
      const res = await apiClient.post('/api/v1/customers/restore', { backup });
      if (res.ok) {
        await refreshCustomers(undefined, true);
        return { ok: true, restoredCount: res.data?.restoredCount || 0 };
      }
      return { ok: false, error: res.error?.message || 'Backup restore failed.' };
    },
    [refreshCustomers]
  );

  const listSafeFiles = useCallback(async (directory: string) => {
    const res = await apiClient.post('/api/v1/storage/list', { directory });
    return res.ok ? res.data : { ok: false, error: res.error };
  }, []);

  const createSafeFolder = useCallback(async (folderPath: string) => {
    const res = await apiClient.post('/api/v1/files/mkdir', { path: folderPath });
    return res.ok ? res.data : { ok: false, error: res.error };
  }, []);

  const createSafeFile = useCallback(async (filePath: string, content = '') => {
    const res = await apiClient.post('/api/v1/files/create', { path: filePath, content });
    return res.ok ? res.data : { ok: false, error: res.error };
  }, []);

  const scanMediaFiles = useCallback(async (dirs?: string[]) => {
    const res = await apiClient.post('/api/v1/media/scan', { dirs });
    return res.ok ? res.data : { ok: false, error: res.error };
  }, []);

  const setSidebarState = useCallback(
    (next: 'expanded' | 'collapsed' | 'closed') => {
      setSidebarStateLocal(next);
      updatePreferences({ sidebarState: next });
    },
    [updatePreferences]
  );

  const markAllNotificationsRead = useCallback(async () => {
    const res = await apiClient.post('/api/v1/notifications/read-all');
    if (res.ok && Array.isArray(res.data?.notifications)) {
      setNotifications(res.data.notifications);
    }
  }, []);

  const clearNonCriticalNotifications = useCallback(async () => {
    const res = await apiClient.delete('/api/v1/notifications/clear');
    if (res.ok && Array.isArray(res.data?.notifications)) {
      setNotifications(res.data.notifications);
    }
  }, []);

  const addAlias = useCallback(
    async (
      alias: string,
      sensitivity = 80,
      options?: Partial<Pick<WakeAliasItem, 'behaviorProfileId' | 'language' | 'priority' | 'contextRules'>>
    ) => {
      const res = await apiClient.post('/api/settings/aliases', { alias, sensitivity, ...(options || {}) });
      if (res.ok && res.data) setAliases(res.data.aliases || []);
    },
    []
  );

  const updateAlias = useCallback(async (id: string, updates: Partial<WakeAliasItem>) => {
    const res = await apiClient.put(`/api/settings/aliases/${encodeURIComponent(id)}`, updates);
    if (res.ok && res.data) setAliases(res.data.aliases || []);
  }, []);

  const deleteAlias = useCallback(async (id: string) => {
    const res = await apiClient.delete(`/api/settings/aliases/${encodeURIComponent(id)}`);
    if (res.ok && res.data) setAliases(res.data.aliases || []);
  }, []);

  const testWakePhrase = useCallback(async (phrase: string) => {
    const res = await apiClient.post('/api/settings/aliases/test', { phrase });
    return res.ok ? res.data : { ok: false, error: res.error };
  }, []);

  const updateTheme = useCallback(async (updates: Partial<CustomThemeConfig>) => {
    setThemeState((prev) => ({ ...prev, ...updates }));
    const res = await apiClient.post('/api/v1/settings/theme', updates);
    if (res.ok && res.data?.theme) setThemeState(res.data.theme);
  }, []);

  const addProviderProfile = useCallback(
    async (profile: {
      platform: AIPlatformId;
      apiKey: string;
      displayName?: string;
      assignedRole?: ProviderProfile['assignedRole'];
    }) => {
      const res = await apiClient.post('/api/v1/providers', profile, { timeoutMs: 60_000 });
      if (res.data?.profiles) setProviderProfiles(res.data.profiles);
      if (Array.isArray(res.data?.diagnostics)) setProviderDiagnostics(res.data.diagnostics);
      await Promise.all([refreshModels(), refreshNotifications(), refreshSelfHealth()]);
      return res.data || { ok: false, error: res.error };
    },
    [refreshModels, refreshNotifications, refreshSelfHealth]
  );

  const addBulkProviderProfiles = useCallback(
    async (payload: {
      platform: AIPlatformId;
      keysText: string;
      defaultRole?: ProviderProfile['assignedRole'];
    }) => {
      const res = await apiClient.post('/api/v1/providers/bulk', payload, { timeoutMs: 60_000 });
      if (Array.isArray(res.data?.profiles)) setProviderProfiles(res.data.profiles);
      if (Array.isArray(res.data?.diagnostics)) setProviderDiagnostics(res.data.diagnostics);
      await Promise.all([refreshModels(), refreshNotifications(), refreshSelfHealth()]);
      return res.data || { ok: false, error: res.error };
    },
    [refreshModels, refreshNotifications, refreshSelfHealth]
  );

  const updateProviderProfile = useCallback(async (id: string, updates: Partial<ProviderProfile>) => {
    const res = await apiClient.patch(`/api/providers/profiles/${encodeURIComponent(id)}`, updates);
    if (res.ok && res.data?.profiles) setProviderProfiles(res.data.profiles);
  }, []);

  const testProviderProfile = useCallback(
    async (id: string) => {
      const res = await apiClient.post(`/api/v1/providers/${encodeURIComponent(id)}/test`, undefined, {
        timeoutMs: 60_000,
      });
      if (res.data?.profile) {
        setProviderProfiles((prev) => prev.map((p) => (p.id === id ? res.data.profile : p)));
      }
      if (Array.isArray(res.data?.diagnostics)) setProviderDiagnostics(res.data.diagnostics);
      await Promise.all([refreshModels(), refreshNotifications(), refreshSelfHealth()]);
      return res.data || { ok: false, error: res.error?.message };
    },
    [refreshModels, refreshNotifications, refreshSelfHealth]
  );

  const validateAllProviderProfiles = useCallback(async () => {
    const res = await apiClient.post('/api/v1/providers/validate-all', undefined, { timeoutMs: 90_000 });
    if (Array.isArray(res.data?.profiles)) setProviderProfiles(res.data.profiles);
    if (Array.isArray(res.data?.diagnostics)) setProviderDiagnostics(res.data.diagnostics);
    await Promise.all([refreshModels(), refreshNotifications(), refreshSelfHealth()]);
    return res.data || { ok: false, error: res.error };
  }, [refreshModels, refreshNotifications, refreshSelfHealth]);

  const deleteProviderProfile = useCallback(
    async (id: string) => {
      const res = await apiClient.delete(`/api/providers/profiles/${encodeURIComponent(id)}`);
      if (res.ok) {
        setProviderProfiles((prev) => prev.filter((p) => p.id !== id));
        await Promise.all([refreshModels(), refreshDiagnostics(), refreshSelfHealth()]);
      }
    },
    [refreshModels, refreshDiagnostics, refreshSelfHealth]
  );

  const toggleSkill = useCallback(async (skillId: string) => {
    const res = await apiClient.post(`/api/skills/${encodeURIComponent(skillId)}/toggle`);
    if (res.ok && res.data?.skill) {
      setSkills((prev) => prev.map((s) => (s.skillId === skillId ? res.data.skill : s)));
    }
  }, []);

  const testSkill = useCallback(
    async (skillId: string, query?: string, target?: string) => {
      const res = await apiClient.post(`/api/v1/skills/${encodeURIComponent(skillId)}/test`, { query, target });
      if (Array.isArray(res.data?.skills)) setSkills(res.data.skills);
      if (res.data?.result?.action) {
        setRecentActions((prev) => [res.data.result.action, ...prev].slice(0, 30));
      }
      refreshTelemetry();
      return res.data || { ok: false, error: res.error };
    },
    [refreshTelemetry]
  );

  const runSkill = useCallback(
    async (skillId: string, query?: string, target?: string) => {
      const res = await apiClient.post(`/api/v1/skills/${encodeURIComponent(skillId)}/execute`, { query, target });
      if (Array.isArray(res.data?.skills)) setSkills(res.data.skills);
      if (res.data?.result?.action) {
        setRecentActions((prev) => [res.data.result.action, ...prev].slice(0, 30));
      }
      refreshTelemetry();
      return res.data || { ok: false, error: res.error };
    },
    [refreshTelemetry]
  );

  const unreadNotificationsCount = notifications.filter((n) => !n.read).length;

  return (
    <AgentContext.Provider
      value={{
        agentState,
        backendOnline,
        telemetry,
        taskQueue,
        historyTasks,
        recentActions,
        events,
        auditLogs,
        memories,
        instructions,
        preferences,
        operatingMode,
        persona,
        behaviorProfiles,
        capabilities,
        customers,
        providerDiagnostics,
        selfHealth,
        notifications,
        unreadNotificationsCount,
        toasts,
        aliases,
        theme,
        providerProfiles,
        modelRegistry,
        modelSummary,
        skills,
        workers,
        tools,
        mobileBridge,
        browserSession,
        chatMessages,
        activeNav,
        sidebarState,
        sidebarDrawerOpen,
        isSendingCommand,
        voiceState,
        micPermission,
        audioDevices,
        ttsVoices,
        isListening,
        isSpeaking,
        liveTranscript,
        micVolume,
        voiceNotice,
        interactionMode,
        setActiveNav,
        setSidebarState,
        setSidebarDrawerOpen,
        setInteractionMode,
        clearVoiceNotice: () => setVoiceNotice(null),
        dismissToast,
        notifyUser,
        markAllNotificationsRead,
        clearNonCriticalNotifications,
        sendCommand,
        cancelActiveCommand,
        cancelTask,
        confirmTask,
        startVoiceListening,
        stopVoiceListening,
        bargeInInterrupt,
        speakNatural,
        refreshAudioDevices,
        refreshTelemetry,
        refreshSelfHealth,
        refreshCapabilities,
        refreshPersona,
        refreshBehaviorProfiles,
        refreshCustomers,
        toggleOperatingMode,
        updatePersona,
        createBehaviorProfile,
        updateBehaviorProfile,
        deleteBehaviorProfile,
        createCustomer,
        getCustomerDetail,
        updateCustomerRecord,
        addCustomerServiceEntry,
        archiveCustomerRecord,
        deleteCustomerRecord,
        exportSanitizedCustomers,
        exportCustomerBackup,
        restoreCustomerBackup,
        listSafeFiles,
        createSafeFolder,
        createSafeFile,
        scanMediaFiles,
        addMemoryItem,
        updateMemoryItem,
        deleteMemory,
        addInstruction,
        updateInstruction,
        deleteInstruction,
        updatePreferences,
        addAlias,
        updateAlias,
        deleteAlias,
        testWakePhrase,
        updateTheme,
        addProviderProfile,
        addBulkProviderProfiles,
        updateProviderProfile,
        testProviderProfile,
        validateAllProviderProfiles,
        deleteProviderProfile,
        toggleSkill,
        testSkill,
        runSkill,
      }}
    >
      {children}
    </AgentContext.Provider>
  );
};

export const useAgent = () => {
  const context = useContext(AgentContext);
  if (!context) throw new Error('useAgent must be used within an AgentProvider');
  return context;
};
