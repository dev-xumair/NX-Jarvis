import fs from 'fs';
import path from 'path';
import type {
  SmartMemoryItem,
  WakeAliasItem,
  ProviderProfile,
  TaskQueueItem,
  CustomThemeConfig,
  CompanionState,
} from '../src/types/agent.ts';

const STORAGE_DIR = path.resolve(process.cwd(), '.nx_storage');

function ensureStorageDir() {
  if (!fs.existsSync(STORAGE_DIR)) {
    fs.mkdirSync(STORAGE_DIR, { recursive: true });
  }
}

function readJsonFile<T>(filename: string, defaultValue: T): T {
  ensureStorageDir();
  const filePath = path.join(STORAGE_DIR, filename);
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error(`[Storage] Failed to read ${filename}:`, err);
  }
  return defaultValue;
}

function writeJsonFile<T>(filename: string, data: T): void {
  ensureStorageDir();
  const filePath = path.join(STORAGE_DIR, filename);
  const tempPath = `${filePath}.tmp.${Date.now()}`;
  try {
    fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tempPath, filePath);
  } catch (err) {
    console.error(`[Storage] Failed to atomically write ${filename}:`, err);
    if (fs.existsSync(tempPath)) {
      try {
        fs.unlinkSync(tempPath);
      } catch {}
    }
  }
}

export const StorageEngine = {
  getMemories(): SmartMemoryItem[] {
    return readJsonFile<SmartMemoryItem[]>('memories.json', [
      {
        id: 'mem-1',
        content: 'Always perform checksum verification after any media packaging to customer USBs.',
        layer: 'PREFERENCE',
        confidence: 1.0,
        learnedFrom: 'user_directive',
        createdAt: Date.now() - 86400000,
        lastAccessed: Date.now(),
      },
      {
        id: 'mem-2',
        content: 'Primary work drives: D:\\ for local shop media, F:\\ and G:\\ for removable customer USBs.',
        layer: 'OPERATIONAL',
        confidence: 0.95,
        learnedFrom: 'system_environment',
        createdAt: Date.now() - 43200000,
        lastAccessed: Date.now(),
      },
      {
        id: 'mem-3',
        content: 'Operating baseline: HP 800 G1 Desktop PC with 6GB RAM. Keep active memory footprint under 500MB.',
        layer: 'LONG_TERM',
        confidence: 1.0,
        learnedFrom: 'hardware_spec',
        createdAt: Date.now() - 21600000,
        lastAccessed: Date.now(),
      },
    ]);
  },

  saveMemories(memories: SmartMemoryItem[]): void {
    writeJsonFile('memories.json', memories);
  },

  getAliases(): WakeAliasItem[] {
    return readJsonFile<WakeAliasItem[]>('aliases.json', [
      { id: 'alias-1', alias: 'NX', enabled: true, sensitivity: 90, isCustom: false },
      { id: 'alias-2', alias: 'Saba', enabled: true, sensitivity: 88, isCustom: true },
      { id: 'alias-3', alias: 'Nazim', enabled: true, sensitivity: 85, isCustom: false },
      { id: 'alias-4', alias: 'Hina', enabled: true, sensitivity: 80, isCustom: true },
      { id: 'alias-5', alias: 'Smart', enabled: true, sensitivity: 65, isCustom: false },
    ]);
  },

  saveAliases(aliases: WakeAliasItem[]): void {
    writeJsonFile('aliases.json', aliases);
  },

  getProviderProfiles(): ProviderProfile[] {
    return readJsonFile<ProviderProfile[]>('providerProfiles.json', [
      {
        id: 'profile-primary-gemini',
        displayName: 'Gemini Primary (Project-1 Prod)',
        provider: 'google_gemini',
        projectId: 'pushpa-mobile-center-prod',
        apiKeyMasked: 'AIzaSy...7894',
        enabled: true,
        priority: 1,
        assignedRole: 'BALANCED',
        selectedModel: 'gemini-2.5-flash',
        healthStatus: 'HEALTHY',
        latencyMs: 310,
        requestCount: 18,
      },
      {
        id: 'profile-backup-gemini',
        displayName: 'Gemini Reasoning Fallback (Project-2 Independent)',
        provider: 'google_gemini',
        projectId: 'pushpa-backup-separate-pool',
        apiKeyMasked: 'AIzaSy...4192',
        enabled: true,
        priority: 2,
        assignedRole: 'REASONING',
        selectedModel: 'gemini-2.5-pro',
        healthStatus: 'HEALTHY',
        latencyMs: 620,
        requestCount: 4,
      },
    ]);
  },

  saveProviderProfiles(profiles: ProviderProfile[]): void {
    writeJsonFile('providerProfiles.json', profiles);
  },

  getTaskHistory(): TaskQueueItem[] {
    return readJsonFile<TaskQueueItem[]>('taskHistory.json', []);
  },

  saveTaskHistory(history: TaskQueueItem[]): void {
    writeJsonFile('taskHistory.json', history.slice(0, 50));
  },

  getTheme(): CustomThemeConfig {
    return readJsonFile<CustomThemeConfig>('theme.json', {
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
    });
  },

  saveTheme(theme: CustomThemeConfig): void {
    writeJsonFile('theme.json', theme);
  },

  getCompanion(): CompanionState {
    return readJsonFile<CompanionState>('companion.json', {
      isFloating: false,
      dockPosition: 'dock_bottom_right',
      scale: 'medium',
      mood: 'friendly',
      characterPose: 'bust',
      visualMode: 'DASHBOARD_HALF_BODY',
      expression: 'FRIENDLY',
      currentThought: 'Monitoring system & ready for voice or chat commands.',
      lastSpokenPhrase: 'Main tayyar hoon. Aap koi bhi task de sakte hain.',
      assistantName: 'Saba (NX AI)',
    });
  },

  saveCompanion(companion: CompanionState): void {
    writeJsonFile('companion.json', companion);
  },
};
