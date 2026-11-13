/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import path from 'path';
import type {
  AuditLogEntry,
  BehaviorProfile,
  ChatMessage,
  CustomThemeConfig,
  InstructionItem,
  ModelRegistryRecord,
  NotificationItem,
  ProviderDiagnosticAttempt,
  ProviderProfile,
  SkillManifest,
  SmartMemoryItem,
  TaskQueueItem,
  UserPreferencesConfig,
  WakeAliasItem,
} from '../../types/agent.ts';
import { DEFAULT_NX_THEME, validateThemePatch } from '../../themes/presets.ts';
import { scrubSecrets } from '../policy/policyEngine.ts';
import {
  buildDefaultInstructions,
  DEFAULT_USER_PREFERENCES,
  isPromptInjectionText,
} from '../instructions/instructionEngine.ts';
import { CORE_EXECUTABLE_SKILLS } from '../skills/skillExecutor.ts';
import {
  DEFAULT_BEHAVIOR_PROFILES,
  DEFAULT_PERSONA_CONFIG,
  DEFAULT_WAKE_ALIASES,
} from '../persona/personaEngine.ts';
import { DEFAULT_CUSTOMER_FIELDS_ENABLED } from '../security/customerVault.ts';

export interface PersistentDatabaseSchema {
  version: string;
  initializedAt: number;
  memories: SmartMemoryItem[];
  instructions: InstructionItem[];
  preferences: UserPreferencesConfig;
  notifications: NotificationItem[];
  providerDiagnostics: ProviderDiagnosticAttempt[];
  aliases: WakeAliasItem[];
  behaviorProfiles: BehaviorProfile[];
  historyTasks: TaskQueueItem[];
  chatMessages: ChatMessage[];
  theme: CustomThemeConfig;
  providerProfiles: ProviderProfile[];
  modelRegistry: ModelRegistryRecord[];
  skills: SkillManifest[];
  auditLogs: AuditLogEntry[];
}

export const DEFAULT_PROVIDER_PROFILES: ProviderProfile[] = [
  {
    id: 'profile-primary-gemini',
    displayName: 'Gemini Primary (Hydrogen)',
    provider: 'google_gemini',
    projectId: 'nx-core-prod',
    secretReference: 'ENV:GEMINI_API_KEY',
    enabled: true,
    priority: 1,
    assignedRole: 'BALANCED',
    selectedModel: 'gemini-4-hydrogen',
    healthStatus: 'UNVERIFIED',
    latencyMs: null,
    requestCount: 0,
    errorCount: 0,
  },
  {
    id: 'profile-backup-gemini',
    displayName: 'Gemini Fast Failover (Flash Lite)',
    provider: 'google_gemini',
    projectId: 'nx-backup-pool',
    secretReference: 'ENV:GEMINI_API_KEY',
    enabled: true,
    priority: 2,
    assignedRole: 'FAST',
    selectedModel: 'gemini-3.1-flash-lite',
    healthStatus: 'UNVERIFIED',
    latencyMs: null,
    requestCount: 0,
    errorCount: 0,
  },
];

function buildDefaultState(): PersistentDatabaseSchema {
  const now = Date.now();
  return {
    version: '2.0.0',
    initializedAt: now,
    memories: [
      {
        id: 'mem-1',
        content: 'Workstation baseline: DevX_NX; Primary desktop target: HP 800 G1 (6GB RAM).',
        layer: 'LONG_TERM',
        confidence: 1.0,
        learnedFrom: 'system_bootstrap',
        createdAt: now - 86400000,
        lastAccessed: now,
      },
      {
        id: 'mem-2',
        content: 'System OS drive (C:) is permanently protected against destructive actions.',
        layer: 'PREFERENCE',
        confidence: 1.0,
        learnedFrom: 'system_policy',
        createdAt: now - 43200000,
        lastAccessed: now,
      },
    ],
    instructions: buildDefaultInstructions(now),
    preferences: {
      ...DEFAULT_USER_PREFERENCES,
      customerFieldsEnabled: { ...DEFAULT_CUSTOMER_FIELDS_ENABLED },
      persona: { ...DEFAULT_PERSONA_CONFIG },
    },
    notifications: [],
    providerDiagnostics: [],
    aliases: DEFAULT_WAKE_ALIASES.map((a) => ({ ...a })),
    behaviorProfiles: DEFAULT_BEHAVIOR_PROFILES.map((p) => ({ ...p })),
    historyTasks: [],
    chatMessages: [
      {
        id: 'msg-init',
        conversationId: 'conv-default',
        sequence: 1,
        sender: 'agent',
        text: 'NX AI is ready. Commands are validated, executed via verified workers, and reported truthfully without fabrication.',
        romanUrduSubtext:
          'Main NX AI hoon — har command ko verify karne ke baad hi result report kiya jayega.',
        time: now,
        languageDetected: 'english',
        status: 'completed',
        outcome: 'ANSWER',
      },
    ],
    theme: DEFAULT_NX_THEME,
    providerProfiles: DEFAULT_PROVIDER_PROFILES,
    modelRegistry: [],
    skills: CORE_EXECUTABLE_SKILLS.map((s) => ({ ...s })),
    auditLogs: [],
  };
}

export class StorageAdapter {
  private readonly filePath: string;
  private state: PersistentDatabaseSchema;

  constructor(customPath?: string) {
    this.filePath = customPath || path.resolve(process.cwd(), 'data', 'nx_database.json');
    this.state = this.loadFromDisk();
  }

  private loadFromDisk(): PersistentDatabaseSchema {
    const fallback = buildDefaultState();
    try {
      if (!fs.existsSync(this.filePath)) {
        return fallback;
      }
      const raw = fs.readFileSync(this.filePath, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<PersistentDatabaseSchema>;
      const themeCheck = validateThemePatch(parsed.theme || DEFAULT_NX_THEME, DEFAULT_NX_THEME);

      const loadedInstructions =
        Array.isArray(parsed.instructions) && parsed.instructions.length > 0
          ? parsed.instructions
          : fallback.instructions;
      const existingIds = new Set(loadedInstructions.map((i) => i.id));
      for (const coreInst of fallback.instructions) {
        if (coreInst.readOnly && !existingIds.has(coreInst.id)) {
          loadedInstructions.unshift(coreInst);
        }
      }

      const rawProfiles =
        Array.isArray(parsed.behaviorProfiles) && parsed.behaviorProfiles.length > 0
          ? parsed.behaviorProfiles
          : fallback.behaviorProfiles;
      const profileIds = new Set<string>();
      const loadedProfiles = rawProfiles.filter((p) => {
        if (!p || !p.id || profileIds.has(p.id)) return false;
        profileIds.add(p.id);
        return true;
      });
      for (const defProf of fallback.behaviorProfiles) {
        if (!profileIds.has(defProf.id)) {
          profileIds.add(defProf.id);
          loadedProfiles.push({ ...defProf });
        }
      }

      const rawAliases =
        Array.isArray(parsed.aliases) && parsed.aliases.length > 0
          ? parsed.aliases
          : fallback.aliases;
      const seenAliasIds = new Set<string>();
      const existingAliasNames = new Set<string>();
      const makeUniqueAliasId = (preferredId: string, aliasText: string): string => {
        const cleanPref = (preferredId || '').trim();
        if (cleanPref && !seenAliasIds.has(cleanPref)) {
          seenAliasIds.add(cleanPref);
          return cleanPref;
        }
        const slug = aliasText.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'custom';
        let candidate = `alias-${slug}`;
        let seq = 2;
        while (seenAliasIds.has(candidate)) {
          candidate = `alias-${slug}-${seq++}`;
        }
        seenAliasIds.add(candidate);
        return candidate;
      };

      const loadedAliases: WakeAliasItem[] = [];
      for (const item of rawAliases) {
        if (!item || typeof item.alias !== 'string' || !item.alias.trim()) continue;
        const nameKey = item.alias.trim().toLowerCase();
        if (existingAliasNames.has(nameKey)) continue;
        existingAliasNames.add(nameKey);
        loadedAliases.push({
          ...item,
          id: makeUniqueAliasId(item.id, item.alias),
        });
      }

      for (const defAlias of DEFAULT_WAKE_ALIASES) {
        const nameKey = defAlias.alias.trim().toLowerCase();
        if (!existingAliasNames.has(nameKey)) {
          existingAliasNames.add(nameKey);
          loadedAliases.push({
            ...defAlias,
            id: makeUniqueAliasId(defAlias.id, defAlias.alias),
          });
        }
      }

      return {
        version: '2.0.0',
        initializedAt: parsed.initializedAt || fallback.initializedAt,
        memories: Array.isArray(parsed.memories) && parsed.memories.length > 0 ? parsed.memories : fallback.memories,
        instructions: loadedInstructions,
        preferences: {
          ...fallback.preferences,
          ...(parsed.preferences || {}),
          customerFieldsEnabled: {
            ...DEFAULT_CUSTOMER_FIELDS_ENABLED,
            ...(parsed.preferences?.customerFieldsEnabled || {}),
          },
          persona: {
            ...DEFAULT_PERSONA_CONFIG,
            ...(parsed.preferences?.persona || {}),
          },
        },
        notifications: Array.isArray(parsed.notifications) ? parsed.notifications : [],
        providerDiagnostics: Array.isArray(parsed.providerDiagnostics) ? parsed.providerDiagnostics : [],
        aliases: loadedAliases,
        behaviorProfiles: loadedProfiles,
        historyTasks: Array.isArray(parsed.historyTasks) ? parsed.historyTasks : [],
        chatMessages:
          Array.isArray(parsed.chatMessages) && parsed.chatMessages.length > 0
            ? parsed.chatMessages
            : fallback.chatMessages,
        theme: themeCheck.theme,
        providerProfiles:
          Array.isArray(parsed.providerProfiles) && parsed.providerProfiles.length > 0
            ? parsed.providerProfiles.map((p) => ({
                ...p,
                secretReference: p.secretReference || 'ENV:GEMINI_API_KEY',
                healthStatus: p.healthStatus || 'UNVERIFIED',
                errorCount: typeof p.errorCount === 'number' ? p.errorCount : 0,
              }))
            : fallback.providerProfiles,
        modelRegistry: Array.isArray(parsed.modelRegistry) ? parsed.modelRegistry : [],
        skills: Array.isArray(parsed.skills) && parsed.skills.length > 0 ? parsed.skills : fallback.skills,
        auditLogs: Array.isArray(parsed.auditLogs) ? parsed.auditLogs : [],
      };
    } catch {
      return fallback;
    }
  }

  save(): void {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const snapshot: PersistentDatabaseSchema = {
        ...this.state,
        historyTasks: this.state.historyTasks.slice(0, 100),
        chatMessages: this.state.chatMessages.slice(-80),
        auditLogs: this.state.auditLogs.slice(0, 200),
        notifications: (this.state.notifications || []).slice(0, 100),
        providerDiagnostics: (this.state.providerDiagnostics || []).slice(0, 80),
      };
      const tmpPath = `${this.filePath}.tmp`;
      fs.writeFileSync(tmpPath, JSON.stringify(snapshot, null, 2), 'utf-8');
      fs.renameSync(tmpPath, this.filePath);
    } catch (err) {
      console.error('[NX StorageAdapter] Failed to persist database:', err);
    }
  }

  reload(): PersistentDatabaseSchema {
    this.state = this.loadFromDisk();
    return this.state;
  }

  getState(): PersistentDatabaseSchema {
    return this.state;
  }

  addMemory(
    content: string,
    layer: SmartMemoryItem['layer'] = 'WORKING',
    learnedFrom = 'user_explicit',
    confidence = 0.92
  ): SmartMemoryItem {
    if (isPromptInjectionText(content) && learnedFrom !== 'system_policy') {
      throw new Error('MEMORY_INJECTION_BLOCKED: Untrusted instruction override rejected from persistent memory.');
    }
    const { cleanText, hadSecrets } = scrubSecrets(content.trim());
    const normalized = cleanText.toLowerCase().replace(/\s+/g, ' ');
    const now = Date.now();

    const duplicate = this.state.memories.find(
      (m) => m.layer === layer && m.content.toLowerCase().replace(/\s+/g, ' ') === normalized
    );
    if (duplicate) {
      duplicate.lastAccessed = now;
      duplicate.confidence = Math.max(duplicate.confidence, confidence);
      duplicate.isSensitiveRedacted = duplicate.isSensitiveRedacted || hadSecrets;
      this.save();
      return duplicate;
    }

    const item: SmartMemoryItem = {
      id: `mem-${now}-${Math.random().toString(36).slice(2, 6)}`,
      content: cleanText,
      layer,
      confidence,
      learnedFrom,
      createdAt: now,
      lastAccessed: now,
      isSensitiveRedacted: hadSecrets,
    };
    this.state.memories.unshift(item);
    this.save();
    return item;
  }

  updateMemory(id: string, updates: { content?: string; layer?: SmartMemoryItem['layer'] }): SmartMemoryItem | null {
    const item = this.state.memories.find((m) => m.id === id);
    if (!item) return null;
    if (typeof updates.content === 'string' && updates.content.trim()) {
      if (isPromptInjectionText(updates.content)) {
        throw new Error('MEMORY_INJECTION_BLOCKED: Prompt-injection phrase cannot be stored in memory.');
      }
      const { cleanText, hadSecrets } = scrubSecrets(updates.content.trim());
      item.content = cleanText;
      item.isSensitiveRedacted = item.isSensitiveRedacted || hadSecrets;
    }
    if (updates.layer) item.layer = updates.layer;
    item.lastAccessed = Date.now();
    this.save();
    return item;
  }

  deleteMemory(id: string): boolean {
    const idx = this.state.memories.findIndex((m) => m.id === id);
    if (idx === -1) return false;
    this.state.memories.splice(idx, 1);
    this.save();
    return true;
  }

  retrieveRelevantMemories(query: string, limit = 5): SmartMemoryItem[] {
    const qTokens = query
      .toLowerCase()
      .split(/[^a-z0-9\u0600-\u06ff]+/)
      .filter((t) => t.length >= 2);
    const now = Date.now();
    const layerWeight: Record<SmartMemoryItem['layer'], number> = {
      PREFERENCE: 3.0,
      LONG_TERM: 2.2,
      OPERATIONAL: 2.0,
      TASK: 1.5,
      SEMANTIC: 1.5,
      WORKING: 1.2,
      EVENT: 0.6,
    };

    const scored = this.state.memories
      .filter((m) => !isPromptInjectionText(m.content))
      .map((m) => {
        const text = m.content.toLowerCase();
        let matchCount = 0;
        for (const tok of qTokens) {
          if (text.includes(tok)) matchCount += 1;
        }
        const ageHours = Math.max(0.1, (now - (m.lastAccessed || m.createdAt)) / 3_600_000);
        const recencyBoost = 1 / (1 + Math.log10(ageHours + 1));
        const score =
          matchCount * 3.5 +
          (layerWeight[m.layer] || 1) +
          (m.confidence || 0.8) +
          recencyBoost;
        return { item: m, score, matchCount };
      });

    scored.sort((a, b) => b.score - a.score);
    const picked = scored.slice(0, limit).map((s) => s.item);
    for (const m of picked) {
      m.lastAccessed = now;
    }
    return picked;
  }

  upsertNotification(input: Omit<NotificationItem, 'id' | 'timestamp' | 'occurrences' | 'read'>): NotificationItem {
    if (!Array.isArray(this.state.notifications)) this.state.notifications = [];
    const now = Date.now();
    const cleanMsg = scrubSecrets(input.message).cleanText;
    const cleanDetails = input.details ? scrubSecrets(input.details).cleanText : undefined;

    const existing = this.state.notifications.find((n) => n.dedupeKey === input.dedupeKey && !n.read);
    if (existing) {
      existing.occurrences += 1;
      existing.timestamp = now;
      existing.message = cleanMsg;
      if (cleanDetails) existing.details = cleanDetails;
      if (input.correlationId) existing.correlationId = input.correlationId;
      this.save();
      return existing;
    }

    const item: NotificationItem = {
      ...input,
      id: `notif-${now}-${Math.random().toString(36).slice(2, 6)}`,
      message: cleanMsg,
      details: cleanDetails,
      timestamp: now,
      occurrences: 1,
      read: false,
    };
    this.state.notifications.unshift(item);
    if (this.state.notifications.length > 100) this.state.notifications.length = 100;
    this.save();
    return item;
  }

  markAllNotificationsRead(): void {
    for (const n of this.state.notifications || []) {
      n.read = true;
    }
    this.save();
  }

  clearNonCriticalNotifications(): void {
    this.state.notifications = (this.state.notifications || []).filter(
      (n) => n.actionable || n.type === 'SECURITY' || n.type === 'ACTION_REQUIRED'
    );
    this.save();
  }

  recordDiagnosticAttempt(attempt: ProviderDiagnosticAttempt): void {
    if (!Array.isArray(this.state.providerDiagnostics)) this.state.providerDiagnostics = [];
    const cleanDetail = scrubSecrets(attempt.detail).cleanText;
    this.state.providerDiagnostics.unshift({ ...attempt, detail: cleanDetail });
    if (this.state.providerDiagnostics.length > 80) {
      this.state.providerDiagnostics.length = 80;
    }
    this.save();
  }

  getStorageStats(): { filePath: string; exists: boolean; sizeBytes: number } {
    try {
      const stat = fs.statSync(this.filePath);
      return { filePath: this.filePath, exists: true, sizeBytes: stat.size };
    } catch {
      return { filePath: this.filePath, exists: false, sizeBytes: 0 };
    }
  }
}
