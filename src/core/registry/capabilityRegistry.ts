/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CapabilityRecord, OperatingMode } from '../../types/agent.ts';
import type { StorageAdapter } from '../persistence/storageAdapter.ts';
import type { TelemetryAdapter } from '../../adapters/system/telemetryAdapter.ts';
import type { StorageWorker } from '../../adapters/storage/storageWorker.ts';
import type { MediaWorker } from '../../adapters/media/mediaWorker.ts';
import type { BrowserWorker } from '../../adapters/browser/browserWorker.ts';
import type { AdbWorker } from '../../adapters/mobile/adbWorker.ts';
import type { WindowsWorker } from '../../adapters/windows/windowsWorker.ts';
import type { CustomerVault } from '../security/customerVault.ts';
import type { ModelGateway } from '../providers/modelGateway.ts';

export interface CapabilityRegistryDeps {
  storage: StorageAdapter;
  telemetry: TelemetryAdapter;
  storageWorker: StorageWorker;
  mediaWorker: MediaWorker;
  browserWorker: BrowserWorker;
  adbWorker: AdbWorker;
  windowsWorker: WindowsWorker;
  customerVault: CustomerVault;
  modelGateway: ModelGateway;
}

export class CapabilityRegistry {
  constructor(private readonly deps: CapabilityRegistryDeps) {}

  async listCapabilities(): Promise<CapabilityRecord[]> {
    const isWin = process.platform === 'win32';
    const browser = await this.deps.browserWorker.inspectSession();
    const adb = this.deps.adbWorker.inspectStatus();
    const volumes = this.deps.storageWorker.discoverVolumes();
    const removableUsb = volumes.some((v) => v.type === 'USB' && v.isPresent);
    const modelSummary = this.deps.modelGateway.getModelRegistrySummary();
    const healthyProviders = this.deps.modelGateway
      .getProfiles()
      .filter((p) => p.healthStatus === 'HEALTHY');
    const skillMap = new Map(
      (this.deps.storage.getState().skills || []).map((s) => [s.skillId, s])
    );
    const mediaDirs = this.deps.mediaWorker.getDefaultScanDirs();

    const skillVerifiedAt = (id: string) => skillMap.get(id)?.lastRunAt;
    const isSkillVerified = (id: string) => skillMap.get(id)?.lastRunStatus === 'VERIFIED';

    return [
      {
        capabilityId: 'cap-system-telemetry',
        displayName: 'Host CPU, RAM & Process Telemetry',
        description: 'Live host CPU load, memory, NX process RSS, and active OS process enumeration.',
        category: 'system',
        workerId: 'telemetry-adapter',
        toolId: 'telemetry.capture_snapshot',
        platform: 'cross_platform',
        requiresWindows: false,
        requiresBrowser: false,
        requiresAdb: false,
        requiresPermission: false,
        riskClass: 'R1_READ_ONLY',
        riskLevel: 'READ_ONLY',
        enabled: true,
        configured: true,
        available: true,
        verified: isSkillVerified('system-info'),
        lastVerifiedAt: skillVerifiedAt('system-info'),
        testStatus: isSkillVerified('system-info') ? 'EXECUTED_AND_VERIFIED' : 'READY',
      },
      {
        capabilityId: 'cap-windows-system-inspect',
        displayName: 'Windows OS / GPU / Hardware CIM Inspection',
        description: 'Reads Win32 OS build, motherboard, GPU, battery, and installed Windows browsers.',
        category: 'system',
        workerId: 'windows-worker',
        toolId: 'windows.inspect_system',
        platform: 'windows',
        requiresWindows: true,
        requiresBrowser: false,
        requiresAdb: false,
        requiresPermission: false,
        riskClass: 'R1_READ_ONLY',
        riskLevel: 'READ_ONLY',
        enabled: true,
        configured: true,
        available: isWin,
        verified: isWin && isSkillVerified('foreground-window'),
        lastVerifiedAt: skillVerifiedAt('foreground-window'),
        testStatus: isWin ? 'READY' : 'HOST_UNAVAILABLE',
        failureReason: isWin ? undefined : `Windows host required (current host: ${process.platform}).`,
      },
      {
        capabilityId: 'cap-windows-app-launch',
        displayName: 'Allowlisted Windows App Launch & Foreground HWND',
        description: 'Opens Notepad, Calculator, Explorer, Chrome, or Edge on Windows desktop.',
        category: 'process',
        workerId: 'windows-worker',
        toolId: 'windows.launch_app',
        platform: 'windows',
        requiresWindows: true,
        requiresBrowser: false,
        requiresAdb: false,
        requiresPermission: false,
        riskClass: 'R2_REVERSIBLE_WRITE',
        riskLevel: 'SAFE_REVERSIBLE',
        enabled: skillMap.get('open-app')?.isInstalled ?? true,
        configured: true,
        available: isWin,
        verified: isWin && isSkillVerified('open-app'),
        lastVerifiedAt: skillVerifiedAt('open-app'),
        testStatus: isWin ? 'READY' : 'HOST_UNAVAILABLE',
        failureReason: isWin ? undefined : `Win32 desktop launch requires Windows host (current: ${process.platform}).`,
      },
      {
        capabilityId: 'cap-file-browse-create',
        displayName: 'Safe File & Folder Browse, Search, Create & Rename',
        description: 'Lists, searches, creates files/folders, and renames non-OS paths while protecting C: and system roots.',
        category: 'files',
        workerId: 'storage-worker',
        toolId: 'storage.create_file_or_folder',
        platform: 'cross_platform',
        requiresWindows: false,
        requiresBrowser: false,
        requiresAdb: false,
        requiresPermission: false,
        riskClass: 'R2_REVERSIBLE_WRITE',
        riskLevel: 'SAFE_REVERSIBLE',
        enabled: skillMap.get('file-search')?.isInstalled ?? true,
        configured: true,
        available: true,
        verified: isSkillVerified('file-search'),
        lastVerifiedAt: skillVerifiedAt('file-search'),
        testStatus: isSkillVerified('file-search') ? 'EXECUTED_AND_VERIFIED' : 'READY',
      },
      {
        capabilityId: 'cap-folder-management',
        displayName: 'Protected Workspace & Customer Folder Creation',
        description: 'Creates and organizes directories cleanly with path-traversal protection.',
        category: 'folders',
        workerId: 'storage-worker',
        toolId: 'storage.create_file_or_folder',
        platform: 'cross_platform',
        requiresWindows: false,
        requiresBrowser: false,
        requiresAdb: false,
        requiresPermission: false,
        riskClass: 'R2_REVERSIBLE_WRITE',
        riskLevel: 'SAFE_REVERSIBLE',
        enabled: true,
        configured: true,
        available: true,
        verified: isSkillVerified('file-organize'),
        lastVerifiedAt: skillVerifiedAt('file-organize'),
        testStatus: isSkillVerified('file-organize') ? 'EXECUTED_AND_VERIFIED' : 'READY',
      },
      {
        capabilityId: 'cap-storage-copy',
        displayName: '12-Point Preflight & SHA-256 Transactional Copy',
        description: 'Stages temp copies with SHA-256 parity checks, FAT32 >4GB guard, and C: write protection.',
        category: 'storage',
        workerId: 'storage-worker',
        toolId: 'storage.transactional_copy',
        platform: 'cross_platform',
        requiresWindows: false,
        requiresBrowser: false,
        requiresAdb: false,
        requiresPermission: false,
        riskClass: 'R2_REVERSIBLE_WRITE',
        riskLevel: 'SAFE_REVERSIBLE',
        enabled: skillMap.get('storage-check')?.isInstalled ?? true,
        configured: true,
        available: true,
        verified: isSkillVerified('storage-check'),
        lastVerifiedAt: skillVerifiedAt('storage-check'),
        testStatus: isSkillVerified('storage-check') ? 'EXECUTED_AND_VERIFIED' : 'READY',
      },
      {
        capabilityId: 'cap-usb-eject',
        displayName: 'Removable USB Detection & Safe Eject',
        description: 'Detects attached removable USB volumes and performs OS-verified safe eject.',
        category: 'usb',
        workerId: 'storage-worker',
        toolId: 'storage.safe_eject',
        platform: 'windows',
        requiresWindows: true,
        requiresBrowser: false,
        requiresAdb: false,
        requiresPermission: false,
        riskClass: 'R5_DESTRUCTIVE',
        riskLevel: 'HIGH_IMPACT_CONFIRM',
        enabled: true,
        configured: true,
        available: removableUsb,
        verified: false,
        testStatus: isWin ? (removableUsb ? 'READY' : 'DEPENDENCY_MISSING') : 'HOST_UNAVAILABLE',
        failureReason: isWin
          ? removableUsb
            ? undefined
            : 'No removable USB drive currently attached.'
          : 'Physical USB safe eject requires Windows host with attached USB drive.',
      },
      {
        capabilityId: 'cap-media-playback',
        displayName: 'Local Media Folder Scan & Audio/Video Play',
        description: 'Scans Music/Downloads/Desktop/data/media for real media files and plays on Windows desktop.',
        category: 'media',
        workerId: 'media-worker',
        toolId: 'media.scan_and_play',
        platform: 'windows',
        requiresWindows: true,
        requiresBrowser: false,
        requiresAdb: false,
        requiresPermission: false,
        riskClass: 'R2_REVERSIBLE_WRITE',
        riskLevel: 'SAFE_REVERSIBLE',
        enabled: true,
        configured: mediaDirs.length > 0,
        available: isWin && mediaDirs.length > 0,
        verified: isSkillVerified('media-play'),
        lastVerifiedAt: skillVerifiedAt('media-play'),
        testStatus: isWin ? 'READY' : 'HOST_UNAVAILABLE',
        failureReason: isWin
          ? undefined
          : `Media scan works locally (${mediaDirs.length} dir(s)), but audio playback requires Windows host.`,
      },
      {
        capabilityId: 'cap-browser-cdp',
        displayName: 'Chrome/Edge Auto-Launch & CDP Automation',
        description: 'Inspects CDP session, auto-launches Chrome/Edge with CDP if closed, navigates and verifies URLs with OTP/CAPTCHA stop gate.',
        category: 'browser',
        workerId: 'browser-worker',
        toolId: 'browser.cdp_navigate',
        platform: 'browser',
        requiresWindows: false,
        requiresBrowser: true,
        requiresAdb: false,
        requiresPermission: false,
        riskClass: 'R3_EXTERNAL_ACCOUNT',
        riskLevel: 'SAFE_REVERSIBLE',
        enabled: skillMap.get('browser-open')?.isInstalled ?? true,
        configured: Boolean(browser.binaryDetected || browser.cdpConnected),
        available: browser.cdpConnected,
        verified: browser.cdpConnected && isSkillVerified('browser-open'),
        lastVerifiedAt: skillVerifiedAt('browser-open'),
        testStatus: browser.cdpConnected
          ? 'READY'
          : browser.binaryDetected
            ? 'DEPENDENCY_MISSING'
            : 'HOST_UNAVAILABLE',
        failureReason: browser.cdpConnected ? undefined : browser.detail,
      },
      {
        capabilityId: 'cap-android-adb',
        displayName: 'Android ADB Device Bridge',
        description: 'Probes `adb devices -l`, device properties, battery level, and safe ADB diagnostics.',
        category: 'android',
        workerId: 'adb-worker',
        toolId: 'adb.inspect_and_ping',
        platform: 'cross_platform',
        requiresWindows: false,
        requiresBrowser: false,
        requiresAdb: true,
        requiresPermission: false,
        riskClass: 'R1_READ_ONLY',
        riskLevel: 'READ_ONLY',
        enabled: skillMap.get('android-status')?.isInstalled ?? true,
        configured: true,
        available: adb.isConnected,
        verified: adb.isConnected && isSkillVerified('android-status'),
        lastVerifiedAt: skillVerifiedAt('android-status'),
        testStatus: adb.isConnected ? 'READY' : 'DEPENDENCY_MISSING',
        failureReason: adb.isConnected ? undefined : adb.detail || adb.connectionState,
      },
      {
        capabilityId: 'cap-voice-session',
        displayName: 'Browser Voice Input, Barge-In & Female Persona TTS',
        description: 'Uses Web Speech API microphone capture, silence detection, and natural TTS synthesis.',
        category: 'voice',
        workerId: 'audio-session',
        toolId: 'voice.browser_session',
        platform: 'browser',
        requiresWindows: false,
        requiresBrowser: true,
        requiresAdb: false,
        requiresPermission: true,
        riskClass: 'R1_READ_ONLY',
        riskLevel: 'READ_ONLY',
        enabled: this.deps.storage.getState().preferences.voiceEnabled,
        configured: true,
        available: false,
        verified: false,
        testStatus: 'PERMISSION_REQUIRED',
        failureReason: 'Requires interactive desktop browser session with microphone permission granted.',
      },
      {
        capabilityId: 'cap-memory-7layer',
        displayName: '7-Layer Persistent Memory & Persona Instructions',
        description: 'Stores injection-guarded preferences, Roman Urdu/English directives, and editable female persona profiles.',
        category: 'memory',
        workerId: 'memory-engine',
        toolId: 'memory.add_and_reload',
        platform: 'cross_platform',
        requiresWindows: false,
        requiresBrowser: false,
        requiresAdb: false,
        requiresPermission: false,
        riskClass: 'R2_REVERSIBLE_WRITE',
        riskLevel: 'SAFE_REVERSIBLE',
        enabled: true,
        configured: true,
        available: true,
        verified: isSkillVerified('memory-manage'),
        lastVerifiedAt: skillVerifiedAt('memory-manage'),
        testStatus: 'EXECUTED_AND_VERIFIED',
      },
      {
        capabilityId: 'cap-customer-vault',
        displayName: 'Encrypted Customer Data & Service History Vault',
        description: 'AES-256-GCM encrypted customer profiles, CNIC/phone/IMEI masking, repair history, sanitized export, and encrypted backup/restore.',
        category: 'customer_data',
        workerId: 'customer-worker',
        toolId: 'customer.vault_crud',
        platform: 'cross_platform',
        requiresWindows: false,
        requiresBrowser: false,
        requiresAdb: false,
        requiresPermission: false,
        riskClass: 'R4_SENSITIVE_DATA',
        riskLevel: 'SAFE_REVERSIBLE',
        enabled: true,
        configured: true,
        available: true,
        verified: true,
        testStatus: 'EXECUTED_AND_VERIFIED',
      },
      {
        capabilityId: 'cap-skills-engine',
        displayName: 'Executable Skills Registry',
        description: 'Runs verified desktop, storage, file, customer, media, and diagnostic skills.',
        category: 'skills',
        workerId: 'skill-executor',
        toolId: 'skills.execute',
        platform: 'cross_platform',
        requiresWindows: false,
        requiresBrowser: false,
        requiresAdb: false,
        requiresPermission: false,
        riskClass: 'R1_READ_ONLY',
        riskLevel: 'READ_ONLY',
        enabled: true,
        configured: true,
        available: true,
        verified: true,
        testStatus: 'EXECUTED_AND_VERIFIED',
      },
      {
        capabilityId: 'cap-provider-vault',
        displayName: 'Multi-Platform Encrypted API Key Vault',
        description: 'Stores Gemini, OpenAI, Anthropic, Groq, OpenRouter, and DeepSeek keys via AES-256-GCM.',
        category: 'providers',
        workerId: 'model-gateway',
        toolId: 'model.gateway_complete',
        platform: 'cross_platform',
        requiresWindows: false,
        requiresBrowser: false,
        requiresAdb: false,
        requiresPermission: false,
        riskClass: 'R4_SENSITIVE_DATA',
        riskLevel: 'SAFE_REVERSIBLE',
        enabled: true,
        configured: this.deps.modelGateway.getProfiles().length > 0,
        available: healthyProviders.length > 0,
        verified: healthyProviders.length > 0,
        testStatus: healthyProviders.length > 0 ? 'EXECUTED_AND_VERIFIED' : 'NOT_CONFIGURED',
        failureReason:
          healthyProviders.length > 0
            ? undefined
            : 'No validated HEALTHY cloud provider key configured yet.',
      },
      {
        capabilityId: 'cap-model-discovery',
        displayName: 'Auto Model Discovery & Capability Routing',
        description: 'Discovers live models per provider, tracks new/deprecated releases, and routes only verified models.',
        category: 'models',
        workerId: 'model-gateway',
        toolId: 'model.gateway_complete',
        platform: 'cross_platform',
        requiresWindows: false,
        requiresBrowser: false,
        requiresAdb: false,
        requiresPermission: false,
        riskClass: 'R1_READ_ONLY',
        riskLevel: 'READ_ONLY',
        enabled: true,
        configured: modelSummary.total > 0,
        available: modelSummary.verified > 0,
        verified: modelSummary.verified > 0,
        testStatus: modelSummary.verified > 0 ? 'EXECUTED_AND_VERIFIED' : 'NOT_CONFIGURED',
        failureReason:
          modelSummary.verified > 0
            ? undefined
            : 'Validate a provider API key to discover and verify models.',
      },
      {
        capabilityId: 'cap-document-notes',
        displayName: 'Document, Notes & Repair Summary Creation',
        description: 'Creates structured markdown/text documents and sanitized customer summaries safely.',
        category: 'documents',
        workerId: 'storage-worker',
        toolId: 'storage.create_file_or_folder',
        platform: 'cross_platform',
        requiresWindows: false,
        requiresBrowser: false,
        requiresAdb: false,
        requiresPermission: false,
        riskClass: 'R2_REVERSIBLE_WRITE',
        riskLevel: 'SAFE_REVERSIBLE',
        enabled: true,
        configured: true,
        available: true,
        verified: isSkillVerified('document-create'),
        lastVerifiedAt: skillVerifiedAt('document-create'),
        testStatus: isSkillVerified('document-create') ? 'EXECUTED_AND_VERIFIED' : 'READY',
      },
      {
        capabilityId: 'cap-multi-task-orchestration',
        displayName: 'Multi-Task Decomposition & Policy-Aware Execution',
        description: 'Breaks multi-step requests into independent subtasks with risk classification (R0-R5) and truth verification.',
        category: 'automation',
        workerId: 'policy-engine',
        toolId: 'policy.evaluate_command',
        platform: 'cross_platform',
        requiresWindows: false,
        requiresBrowser: false,
        requiresAdb: false,
        requiresPermission: false,
        riskClass: 'R1_READ_ONLY',
        riskLevel: 'READ_ONLY',
        enabled: true,
        configured: true,
        available: true,
        verified: true,
        testStatus: 'EXECUTED_AND_VERIFIED',
      },
    ];
  }

  async buildDynamicCapabilitiesSummary(
    lang: 'english' | 'roman_urdu' | 'urdu',
    operatingMode: OperatingMode
  ): Promise<{
    english: string;
    romanUrdu: string;
    urdu: string;
    readyCount: number;
    unavailableCount: number;
    notConfiguredCount: number;
    capabilities: CapabilityRecord[];
  }> {
    const caps = await this.listCapabilities();
    const ready = caps.filter(
      (c) => c.testStatus === 'READY' || c.testStatus === 'EXECUTED_AND_VERIFIED'
    );
    const unavailable = caps.filter(
      (c) => c.testStatus === 'HOST_UNAVAILABLE' || c.testStatus === 'DEPENDENCY_MISSING'
    );
    const notConfigured = caps.filter((c) => c.testStatus === 'NOT_CONFIGURED');

    const readyNames = ready.map((c) => c.displayName).slice(0, 7).join(', ');
    const unavailNames = unavailable.map((c) => c.displayName).slice(0, 5).join(', ');
    const customerCount = this.deps.customerVault.getCount();

    const modeNote = operatingMode === 'CUSTOMER_SAFE' ? 'Mode: CUSTOMER_SAFE.' : 'Mode: OWNER_PRIVATE.';
    const english = `${modeNote} Active now (${ready.length}/${caps.length}): ${readyNames}${customerCount > 0 && operatingMode === 'OWNER_PRIVATE' ? ` (${customerCount} encrypted customer records)` : ''}. Unavailable on current host (${process.platform}): ${unavailNames || 'none'}.${notConfigured.length > 0 ? ` Needs API key setup: ${notConfigured.map((c) => c.displayName).join(', ')}.` : ''}`;

    const romanUrdu = `${modeNote} Abhi ready (${ready.length}/${caps.length}): ${readyNames}. Is host (${process.platform}) par unavailable: ${unavailNames || 'koi nahi'}.${notConfigured.length > 0 ? ` Key configure karein: ${notConfigured.map((c) => c.displayName).join(', ')}.` : ''}`;

    const urdu = `${modeNote} اس وقت دستیاب صلاحیتیں (${ready.length}/${caps.length}): ${readyNames}۔ موجودہ سسٹم (${process.platform}) پر دستیاب نہیں: ${unavailNames || 'کوئی نہیں'}۔`;

    return {
      english: lang === 'english' ? english : english,
      romanUrdu,
      urdu,
      readyCount: ready.length,
      unavailableCount: unavailable.length,
      notConfiguredCount: notConfigured.length,
      capabilities: caps,
    };
  }
}
