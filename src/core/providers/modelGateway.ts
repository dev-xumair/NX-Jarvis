/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import crypto from 'crypto';
import type {
  AIPlatformId,
  ModelCapabilityProfile,
  ModelRegistryRecord,
  ProviderDiagnosticAttempt,
  ProviderHealthStatus,
  ProviderProfile,
} from '../../types/agent.ts';
import type { StorageAdapter } from '../persistence/storageAdapter.ts';
import type { NxEventBus } from '../events/eventBus.ts';
import { scrubSecrets } from '../policy/policyEngine.ts';
import {
  AI_PLATFORMS,
  classifyHttpStatus,
  GeminiProviderAdapter,
  type ModelCheckOutcome,
} from './geminiAdapter.ts';
import { KeyVault } from '../security/keyVault.ts';

export interface GatewayCompletion {
  ok: boolean;
  text?: string;
  providerUsed?: string;
  projectId?: string;
  modelUsed?: string;
  latencyMs?: number;
  offline?: boolean;
  errorCode?: string;
  errorMessage?: string;
}

export interface BulkKeyEntryInput {
  platform?: AIPlatformId;
  displayName?: string;
  projectId?: string;
  assignedRole?: ProviderProfile['assignedRole'];
  selectedModel?: string;
  apiKey: string;
}

export interface ValidateAllSummary {
  validatedCount: number;
  healthyCount: number;
  authFailedCount: number;
  quotaExhaustedCount: number;
  networkErrorCount: number;
  totalDiscoveredModels: number;
  modelSummary: ModelRegistrySummary;
  profiles: ProviderProfile[];
}

export interface ModelRegistrySummary {
  total: number;
  verified: number;
  partiallyVerified: number;
  failed: number;
  unavailable: number;
  deprecated: number;
  notSupported: number;
  newCount: number;
}

export function classifyProviderError(errorMessage: string): {
  status: ProviderHealthStatus;
  code: 'AUTH_FAILED' | 'QUOTA_EXHAUSTED' | 'NETWORK_ERROR' | 'PROVIDER_ERROR';
  retryable: boolean;
} {
  const lower = errorMessage.toLowerCase();
  if (
    lower.includes('401') ||
    lower.includes('403') ||
    lower.includes('unauthenticated') ||
    lower.includes('api key not valid') ||
    lower.includes('access_token_type_unsupported') ||
    lower.includes('not configured') ||
    lower.includes('invalid key')
  ) {
    return { status: 'AUTH_FAILED', code: 'AUTH_FAILED', retryable: false };
  }
  if (
    lower.includes('429') ||
    lower.includes('quota') ||
    lower.includes('resource_exhausted') ||
    lower.includes('rate limit')
  ) {
    return { status: 'QUOTA_EXHAUSTED', code: 'QUOTA_EXHAUSTED', retryable: true };
  }
  if (
    lower.includes('econnrefused') ||
    lower.includes('enotfound') ||
    lower.includes('etimedout') ||
    lower.includes('fetch failed') ||
    lower.includes('network')
  ) {
    return { status: 'NETWORK_ERROR', code: 'NETWORK_ERROR', retryable: true };
  }
  return { status: 'DEGRADED', code: 'PROVIDER_ERROR', retryable: false };
}

function sanitizeProviderError(raw: string): string {
  const scrubbed = scrubSecrets(raw || '').cleanText;
  let text = scrubbed;
  try {
    const parsed = JSON.parse(scrubbed);
    if (parsed?.error?.message) {
      const code = parsed.error.code ? `${parsed.error.code} ` : '';
      text = `${code}${String(parsed.error.message)}`;
    } else if (parsed?.message) {
      text = String(parsed.message);
    }
  } catch {
    // plain text error
  }
  return text.replace(/\(https?:\/\/[^)]+\)/gi, '').replace(/https?:\/\/\S+/gi, '').replace(/\s+/g, ' ').trim();
}

export class ModelGateway {
  private readonly storage: StorageAdapter;
  private readonly eventBus: NxEventBus;
  private readonly gemini: GeminiProviderAdapter;
  private readonly vault: KeyVault;
  private readonly baseUrlOverride?: string;
  private readonly activeValidations = new Map<string, Promise<ProviderProfile | null>>();

  constructor(
    storage: StorageAdapter,
    eventBus: NxEventBus,
    gemini = new GeminiProviderAdapter(),
    vault = new KeyVault(),
    baseUrlOverride?: string
  ) {
    this.storage = storage;
    this.eventBus = eventBus;
    this.gemini = gemini;
    this.vault = vault;
    this.baseUrlOverride = baseUrlOverride;
  }

  getProfiles(): ProviderProfile[] {
    const now = Date.now();
    const profiles = this.storage.getState().providerProfiles;
    for (const p of profiles) {
      if (!p.provider || !AI_PLATFORMS[p.provider]) {
        p.provider = 'google_gemini';
      }
      if (
        (p.healthStatus === 'COOLING_DOWN' || p.healthStatus === 'QUOTA_EXHAUSTED') &&
        p.cooldownUntil &&
        p.cooldownUntil <= now
      ) {
        p.healthStatus = 'UNVERIFIED';
        p.cooldownUntil = undefined;
      }
    }
    return profiles;
  }

  getModelRegistry(providerFilter?: AIPlatformId): ModelRegistryRecord[] {
    const list = this.storage.getState().modelRegistry || [];
    if (!providerFilter) return list;
    return list.filter((m) => m.provider === providerFilter);
  }

  getDiagnostics(limit = 40): ProviderDiagnosticAttempt[] {
    return (this.storage.getState().providerDiagnostics || []).slice(0, limit);
  }

  selectBestModel(
    requiredCapabilities: Partial<Record<keyof ModelCapabilityProfile, boolean>> = { text: true }
  ): ModelRegistryRecord | null {
    const preferredId = this.storage.getState().preferences?.preferredModel;
    const activeProfiles = new Set(this.selectCandidateProfiles().map((p) => p.id));
    const verifiedRecords = this.getModelRegistry().filter(
      (r) =>
        activeProfiles.has(r.profileId) &&
        (r.status === 'VERIFIED' || r.status === 'PARTIALLY_VERIFIED') &&
        !r.deprecated
    );

    const matches = verifiedRecords.filter((rec) =>
      Object.entries(requiredCapabilities).every(([cap, needed]) =>
        needed ? Boolean(rec.capabilities[cap as keyof ModelCapabilityProfile]) : true
      )
    );
    if (matches.length === 0) return null;

    if (preferredId) {
      const preferred = matches.find((m) => m.modelId === preferredId);
      if (preferred) return preferred;
    }

    matches.sort((a, b) => {
      if (a.status !== b.status) return a.status === 'VERIFIED' ? -1 : 1;
      const latA = a.verification.latencyMs ?? 99999;
      const latB = b.verification.latencyMs ?? 99999;
      return latA - latB;
    });
    return matches[0];
  }

  getModelRegistrySummary(): ModelRegistrySummary {
    const list = this.getModelRegistry();
    return {
      total: list.length,
      verified: list.filter((m) => m.status === 'VERIFIED').length,
      partiallyVerified: list.filter((m) => m.status === 'PARTIALLY_VERIFIED').length,
      failed: list.filter((m) => m.status === 'FAILED').length,
      unavailable: list.filter((m) => m.status === 'UNAVAILABLE').length,
      deprecated: list.filter((m) => m.status === 'DEPRECATED').length,
      notSupported: list.filter((m) => m.status === 'NOT_SUPPORTED').length,
      newCount: list.filter((m) => m.changeState === 'NEW').length,
    };
  }

  private syncRegistryForProfile(
    profileId: string,
    platform: AIPlatformId,
    checks: ModelCheckOutcome[]
  ): { newModels: string[]; removedModels: string[] } {
    const state = this.storage.getState();
    if (!Array.isArray(state.modelRegistry)) state.modelRegistry = [];

    const existingForProfile = new Map<string, ModelRegistryRecord>();
    for (const rec of state.modelRegistry) {
      if (rec.profileId === profileId) {
        existingForProfile.set(rec.modelId, rec);
      }
    }

    const incomingIds = new Set(checks.map((c) => c.meta.modelId));
    const newModels: string[] = [];
    const removedModels: string[] = [];
    const updatedRecords: ModelRegistryRecord[] = [];
    const now = Date.now();

    for (const chk of checks) {
      const prev = existingForProfile.get(chk.meta.modelId);
      const isNew = !prev;
      if (isNew) newModels.push(chk.meta.modelId);

      const cleanError = chk.verification.error
        ? sanitizeProviderError(chk.verification.error)
        : undefined;

      updatedRecords.push({
        provider: platform,
        profileId,
        modelId: chk.meta.modelId,
        displayName: chk.meta.displayName,
        apiVersion: chk.meta.apiVersion,
        contextWindow: chk.meta.contextWindow,
        status: chk.status,
        changeState: chk.meta.deprecated
          ? 'DEPRECATED'
          : isNew
            ? 'NEW'
            : prev.status !== chk.status
              ? 'UPDATED'
              : 'ACTIVE',
        capabilities: chk.meta.capabilities,
        verification: {
          ...chk.verification,
          error: cleanError,
        },
        discoveredAt: prev?.discoveredAt || now,
        lastVerifiedAt: chk.verification.testedAt,
        deprecated: chk.meta.deprecated,
        source: chk.meta.source,
      });
    }

    for (const [oldId, oldRec] of existingForProfile.entries()) {
      if (!incomingIds.has(oldId)) {
        removedModels.push(oldId);
        updatedRecords.push({
          ...oldRec,
          status: 'UNAVAILABLE',
          changeState: 'REMOVED',
          lastVerifiedAt: now,
        });
      }
    }

    state.modelRegistry = [
      ...state.modelRegistry.filter((r) => r.profileId !== profileId),
      ...updatedRecords,
    ];

    return { newModels, removedModels };
  }

  addProfile(input: {
    platform?: AIPlatformId;
    displayName?: string;
    projectId?: string;
    assignedRole?: ProviderProfile['assignedRole'];
    selectedModel?: string;
    apiKey?: string;
  }): { profile: ProviderProfile; sharedQuotaNotice: string } {
    const platform: AIPlatformId =
      input.platform && AI_PLATFORMS[input.platform] ? input.platform : 'google_gemini';
    const meta = AI_PLATFORMS[platform];
    const profiles = this.storage.getState().providerProfiles;
    const projectId =
      input.projectId && input.projectId.trim()
        ? input.projectId.trim()
        : `${platform.replace('_', '-')}-pool-${profiles.length + 1}`;
    const displayName =
      input.displayName && input.displayName.trim()
        ? input.displayName.trim()
        : `${meta.label} Key #${profiles.length + 1}`;
    const sharedProject = profiles.some((p) => p.projectId === projectId && p.provider === platform);
    const id = `profile-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    let secretReference = `ENV:${meta.envVar}`;
    if (input.apiKey && input.apiKey.trim()) {
      secretReference = this.vault.setKey(id, input.apiKey.trim());
    }

    const profile: ProviderProfile = {
      id,
      displayName,
      provider: platform,
      projectId,
      secretReference,
      enabled: true,
      priority: profiles.length + 1,
      assignedRole: input.assignedRole || 'BALANCED',
      selectedModel: input.selectedModel || meta.defaultModel,
      discoveredModels: [],
      verifiedModels: [],
      healthStatus: 'UNVERIFIED',
      latencyMs: null,
      requestCount: 0,
      errorCount: 0,
    };
    profiles.push(profile);
    this.storage.save();

    this.eventBus.emit(
      'SYSTEM_BOOT',
      `Registered ${meta.label} profile "${profile.displayName}" (UNVERIFIED)`,
      undefined,
      {
        profileId: profile.id,
        platform,
        projectId: profile.projectId,
        secretReference: profile.secretReference,
      }
    );

    return {
      profile,
      sharedQuotaNotice: sharedProject
        ? `Shared ${meta.label} Project/Pool ID detected.`
        : `${meta.label} key stored in encrypted server vault.`,
    };
  }

  async addAndAutoVerifyProfile(input: {
    platform?: AIPlatformId;
    displayName?: string;
    projectId?: string;
    assignedRole?: ProviderProfile['assignedRole'];
    selectedModel?: string;
    apiKey?: string;
  }): Promise<{ profile: ProviderProfile; sharedQuotaNotice: string }> {
    const created = this.addProfile(input);
    const verified = await this.testProfile(created.profile.id);
    return {
      profile: verified || created.profile,
      sharedQuotaNotice: created.sharedQuotaNotice,
    };
  }

  addBulkProfiles(entries: BulkKeyEntryInput[]): {
    addedCount: number;
    skippedCount: number;
    addedProfiles: ProviderProfile[];
    errors: string[];
  } {
    const addedProfiles: ProviderProfile[] = [];
    const errors: string[] = [];
    let skippedCount = 0;

    entries.forEach((entry, idx) => {
      const key = (entry.apiKey || '').trim();
      if (key.length < 10) {
        skippedCount += 1;
        errors.push(`Entry #${idx + 1}: API key too short or invalid.`);
        return;
      }
      const platform: AIPlatformId =
        entry.platform && AI_PLATFORMS[entry.platform] ? entry.platform : 'google_gemini';
      const existingMasked = `VAULT:${key.slice(0, 4)}...${key.slice(-4)}`;
      if (
        this.storage
          .getState()
          .providerProfiles.some((p) => p.secretReference === existingMasked && p.provider === platform)
      ) {
        skippedCount += 1;
        errors.push(`Entry #${idx + 1}: Key ${existingMasked} is already registered for ${AI_PLATFORMS[platform].label}.`);
        return;
      }
      const label =
        entry.displayName?.trim() ||
        `${AI_PLATFORMS[platform].label} Key #${this.storage.getState().providerProfiles.length + 1}`;
      const project =
        entry.projectId?.trim() || `${platform.replace('_', '-')}-pool-${Date.now().toString().slice(-4)}-${idx + 1}`;
      const res = this.addProfile({
        platform,
        displayName: label,
        projectId: project,
        assignedRole: entry.assignedRole || 'BALANCED',
        selectedModel: entry.selectedModel || AI_PLATFORMS[platform].defaultModel,
        apiKey: key,
      });
      addedProfiles.push(res.profile);
    });

    return {
      addedCount: addedProfiles.length,
      skippedCount,
      addedProfiles,
      errors,
    };
  }

  async addAndAutoVerifyBulkProfiles(entries: BulkKeyEntryInput[]): Promise<{
    addedCount: number;
    skippedCount: number;
    healthyCount: number;
    authFailedCount: number;
    totalDiscoveredModels: number;
    addedProfiles: ProviderProfile[];
    errors: string[];
  }> {
    const created = this.addBulkProfiles(entries);
    const verifiedProfiles: ProviderProfile[] = [];

    for (const p of created.addedProfiles) {
      const checked = await this.testProfile(p.id);
      verifiedProfiles.push(checked || p);
    }

    const totalDiscoveredModels = Array.from(
      new Set(verifiedProfiles.flatMap((p) => p.discoveredModels || []))
    ).length;

    return {
      addedCount: verifiedProfiles.length,
      skippedCount: created.skippedCount,
      healthyCount: verifiedProfiles.filter((p) => p.healthStatus === 'HEALTHY').length,
      authFailedCount: verifiedProfiles.filter((p) => p.healthStatus === 'AUTH_FAILED').length,
      totalDiscoveredModels,
      addedProfiles: verifiedProfiles,
      errors: created.errors,
    };
  }

  updateProfile(
    id: string,
    updates: Partial<Pick<ProviderProfile, 'enabled' | 'assignedRole' | 'selectedModel' | 'priority'>>
  ): ProviderProfile | null {
    const profile = this.storage.getState().providerProfiles.find((p) => p.id === id);
    if (!profile) return null;

    if (typeof updates.enabled === 'boolean') {
      profile.enabled = updates.enabled;
      if (!profile.enabled) profile.healthStatus = 'DISABLED';
      else if (profile.healthStatus === 'DISABLED') profile.healthStatus = 'UNVERIFIED';
    }
    if (updates.assignedRole) profile.assignedRole = updates.assignedRole;
    if (updates.selectedModel) profile.selectedModel = updates.selectedModel;
    if (typeof updates.priority === 'number') profile.priority = updates.priority;

    this.storage.save();
    return profile;
  }

  deleteProfile(id: string): boolean {
    const state = this.storage.getState();
    const before = state.providerProfiles.length;
    state.providerProfiles = state.providerProfiles.filter((p) => p.id !== id);
    if (state.providerProfiles.length === before) return false;
    state.modelRegistry = (state.modelRegistry || []).filter((m) => m.profileId !== id);
    this.vault.deleteKey(id);
    this.storage.save();
    return true;
  }

  private resolveKeyForProfile(profile: ProviderProfile): { key?: string; missingVaultError?: string } {
    if (profile.secretReference.startsWith('VAULT:')) {
      const vaultKey = this.vault.getKey(profile.id);
      if (!vaultKey) {
        return { missingVaultError: '401 Encrypted vault credential missing or unreadable for this profile.' };
      }
      return { key: vaultKey };
    }
    return { key: undefined };
  }

  async testProfile(id: string): Promise<ProviderProfile | null> {
    const existingInFlight = this.activeValidations.get(id);
    if (existingInFlight) {
      return existingInFlight;
    }

    const promise = this.executeTestProfile(id).finally(() => {
      this.activeValidations.delete(id);
    });
    this.activeValidations.set(id, promise);
    return promise;
  }

  private async executeTestProfile(id: string): Promise<ProviderProfile | null> {
    const profiles = this.storage.getState().providerProfiles;
    const profile = profiles.find((p) => p.id === id);
    if (!profile) return null;

    const correlationId = crypto.randomUUID ? crypto.randomUUID() : `val-${Date.now()}`;
    const platform: AIPlatformId =
      profile.provider && AI_PLATFORMS[profile.provider] ? profile.provider : 'google_gemini';
    profile.healthStatus = 'CHECKING';

    this.eventBus.emit('KEY_VALIDATION_STARTED', `Validating ${profile.displayName} (${platform})`, undefined, {
      profileId: profile.id,
      platform,
      correlationId,
    });
    this.eventBus.emit('MODEL_DISCOVERY_STARTED', `Querying ${AI_PLATFORMS[platform].label} model catalog`, undefined, {
      profileId: profile.id,
      platform,
      correlationId,
    });

    const startedAt = Date.now();
    const { key, missingVaultError } = this.resolveKeyForProfile(profile);
    const res = missingVaultError
      ? {
          ok: false,
          discoveredModels: [],
          verifiedModels: [],
          modelChecks: [],
          activeModel: profile.selectedModel || AI_PLATFORMS[platform].defaultModel,
          latencyMs: 0,
          error: missingVaultError,
        }
      : await this.gemini.verifyPlatformAndModels(
          platform,
          profile.selectedModel || AI_PLATFORMS[platform].defaultModel,
          key,
          this.baseUrlOverride
        );

    const finishedAt = Date.now();
    profile.lastTestedAt = finishedAt;
    profile.latencyMs = res.latencyMs;
    profile.modelsSyncedAt = finishedAt;
    profile.discoveredModels = res.discoveredModels;
    profile.verifiedModels = res.verifiedModels;

    const statusMatch = res.error?.match(/\b(401|403|404|429|5\d\d)\b/);
    const parsedStatusCode = statusMatch ? Number(statusMatch[1]) : res.ok ? 200 : null;
    this.storage.recordDiagnosticAttempt({
      id: `diag-${finishedAt}-${Math.random().toString(36).slice(2, 6)}`,
      correlationId,
      provider: platform,
      profileId: profile.id,
      endpointCategory: 'catalog_discovery',
      startedAt,
      finishedAt,
      durationMs: Math.max(1, finishedAt - startedAt),
      statusCode: parsedStatusCode,
      ok: res.ok,
      errorClass: res.ok ? undefined : classifyHttpStatus(parsedStatusCode, res.error || ''),
      responseSchemaValid: res.ok || res.discoveredModels.length > 0,
      detail: res.ok
        ? `Discovered ${res.discoveredModels.length}, verified ${res.verifiedModels.length}`
        : sanitizeProviderError(res.error || 'Provider check failed'),
    });

    this.eventBus.emit(
      'MODEL_DISCOVERY_FINISHED',
      `Discovered ${res.discoveredModels.length} model(s) on ${AI_PLATFORMS[platform].label}`,
      undefined,
      { profileId: profile.id, platform, count: res.discoveredModels.length, correlationId }
    );

    this.eventBus.emit(
      'MODEL_VERIFICATION_STARTED',
      `Verifying adaptive capabilities across ${res.discoveredModels.length} discovered model(s)`,
      undefined,
      { profileId: profile.id, platform, count: res.discoveredModels.length, correlationId }
    );

    const diff = this.syncRegistryForProfile(profile.id, platform, res.modelChecks || []);

    this.eventBus.emit(
      'MODEL_VERIFICATION_FINISHED',
      `Verified ${res.verifiedModels.length} model(s) (${diff.newModels.length} new, ${diff.removedModels.length} removed)`,
      undefined,
      {
        profileId: profile.id,
        platform,
        verifiedCount: res.verifiedModels.length,
        newModelsCount: diff.newModels.length,
        removedModelsCount: diff.removedModels.length,
        correlationId,
      }
    );

    if (res.ok) {
      profile.healthStatus = 'HEALTHY';
      profile.lastError = undefined;
      profile.requestCount += 1;
      if (res.verifiedModels.length > 0 && !res.verifiedModels.includes(profile.selectedModel)) {
        profile.selectedModel = res.activeModel;
      }
      this.eventBus.emit(
        'KEY_VALIDATION_FINISHED',
        `${profile.displayName} validated HEALTHY (${res.verifiedModels.length} verified models)`,
        undefined,
        {
          profileId: profile.id,
          platform,
          discoveredCount: res.discoveredModels.length,
          verifiedModels: res.verifiedModels,
          activeModel: profile.selectedModel,
          correlationId,
        }
      );
      this.storage.upsertNotification({
        type: 'MODEL',
        title: `${AI_PLATFORMS[platform].label} Validated`,
        message: `${profile.displayName}: ${res.verifiedModels.length} verified model(s) ready.`,
        source: 'model-gateway',
        severity: 'success',
        actionable: false,
        dedupeKey: `provider-healthy-${profile.id}`,
        correlationId,
      });
    } else {
      profile.errorCount += 1;
      const cleanErr = sanitizeProviderError(res.error || 'Unknown provider error');
      profile.lastError = cleanErr;
      const classified = classifyProviderError(cleanErr);
      if (classified.code === 'QUOTA_EXHAUSTED') {
        this.markProjectCooldown(profile.projectId, 'QUOTA_EXHAUSTED');
      } else {
        profile.healthStatus = classified.status;
      }
      this.eventBus.emit('PROVIDER_FAILED', `${profile.displayName} validation returned ${classified.code}`, undefined, {
        profileId: profile.id,
        platform,
        code: classified.code,
        correlationId,
      });
      this.eventBus.emit(
        'KEY_VALIDATION_FINISHED',
        `${profile.displayName} validation failed (${classified.code})`,
        undefined,
        { profileId: profile.id, platform, code: classified.code, correlationId }
      );
      this.storage.upsertNotification({
        type: 'ACTION_REQUIRED',
        title: `${AI_PLATFORMS[platform].label} Key Validation Failed`,
        message: `${profile.displayName} returned ${classified.code}. Open Model Gateway to replace or revalidate the key.`,
        details: cleanErr,
        source: 'model-gateway',
        severity: 'error',
        actionable: true,
        actionLabel: 'Open Model Gateway',
        actionTarget: 'settings',
        dedupeKey: `provider-fail-${profile.id}-${classified.code}`,
        correlationId,
      });
    }

    this.storage.save();
    return profile;
  }

  async testAllProfiles(): Promise<ValidateAllSummary> {
    const enabledIds = this.getProfiles()
      .filter((p) => p.enabled)
      .map((p) => p.id);

    for (const id of enabledIds) {
      await this.testProfile(id);
    }

    const updated = this.getProfiles();
    const totalDiscoveredModels = Array.from(
      new Set(updated.flatMap((p) => p.discoveredModels || []))
    ).length;

    return {
      validatedCount: enabledIds.length,
      healthyCount: updated.filter((p) => p.healthStatus === 'HEALTHY').length,
      authFailedCount: updated.filter((p) => p.healthStatus === 'AUTH_FAILED').length,
      quotaExhaustedCount: updated.filter((p) => p.healthStatus === 'QUOTA_EXHAUSTED').length,
      networkErrorCount: updated.filter((p) => p.healthStatus === 'NETWORK_ERROR').length,
      totalDiscoveredModels,
      modelSummary: this.getModelRegistrySummary(),
      profiles: updated,
    };
  }

  markProjectCooldown(
    projectId: string,
    status: 'COOLING_DOWN' | 'QUOTA_EXHAUSTED' | 'QUOTA_BLOCKED' = 'COOLING_DOWN'
  ): void {
    const cooldownUntil = Date.now() + 300_000;
    for (const p of this.storage.getState().providerProfiles) {
      if (p.projectId === projectId) {
        p.healthStatus = status;
        p.cooldownUntil = cooldownUntil;
      }
    }
    this.storage.save();
  }

  selectCandidateProfiles(): ProviderProfile[] {
    const now = Date.now();
    return this.getProfiles()
      .filter((p) => {
        if (!p.enabled) return false;
        if (p.healthStatus === 'DISABLED' || p.healthStatus === 'QUOTA_BLOCKED') return false;
        if (
          (p.healthStatus === 'COOLING_DOWN' || p.healthStatus === 'QUOTA_EXHAUSTED') &&
          p.cooldownUntil &&
          p.cooldownUntil > now
        ) {
          return false;
        }
        return true;
      })
      .sort((a, b) => a.priority - b.priority);
  }

  hasAnyConfiguredCredential(): boolean {
    const hasVault = this.storage
      .getState()
      .providerProfiles.some((p) => p.enabled && p.secretReference.startsWith('VAULT:') && this.vault.hasKey(p.id));
    return this.gemini.isConfigured(hasVault);
  }

  async complete(prompt: string, systemInstruction: string, taskId?: string): Promise<GatewayCompletion> {
    if (!this.hasAnyConfiguredCredential()) {
      return {
        ok: false,
        offline: true,
        errorCode: 'AUTH_FAILED',
        errorMessage: 'No API key configured in encrypted vault or server environment.',
      };
    }

    const candidates = this.selectCandidateProfiles();
    if (candidates.length === 0) {
      return {
        ok: false,
        offline: true,
        errorCode: 'QUOTA_EXHAUSTED',
        errorMessage: 'All configured provider profiles are disabled or in quota cooldown.',
      };
    }

    const triedKeysOrProjects = new Set<string>();
    const failedEnvRefs = new Set<string>();
    let previousFailedProfile: string | null = null;
    let lastErrorCode = 'PROVIDER_ERROR';
    let lastErrorMessage = 'Provider request failed';

    for (const profile of candidates) {
      const platform: AIPlatformId =
        profile.provider && AI_PLATFORMS[profile.provider] ? profile.provider : 'google_gemini';
      const dedupeKey = `${platform}:${profile.projectId}:${profile.secretReference}`;
      if (triedKeysOrProjects.has(dedupeKey)) continue;
      if (profile.secretReference.startsWith('ENV:') && failedEnvRefs.has(profile.secretReference)) {
        continue;
      }
      triedKeysOrProjects.add(dedupeKey);

      if (previousFailedProfile) {
        this.eventBus.emit(
          'PROVIDER_SWITCHED',
          `Failover switched from ${previousFailedProfile} to ${profile.displayName} (${AI_PLATFORMS[platform].label})`,
          taskId,
          { from: previousFailedProfile, to: profile.id, platform, projectId: profile.projectId }
        );
      }

      this.eventBus.emit('MODEL_REQUESTED', `Requesting ${profile.selectedModel} via ${profile.displayName}`, taskId, {
        profileId: profile.id,
        platform,
        projectId: profile.projectId,
      });

      try {
        const { key, missingVaultError } = this.resolveKeyForProfile(profile);
        if (missingVaultError) throw new Error(missingVaultError);

        const result = await this.gemini.generateForPlatform(
          platform,
          {
            prompt,
            systemInstruction,
            model: profile.selectedModel || AI_PLATFORMS[platform].defaultModel,
            apiKey: key,
          },
          this.baseUrlOverride
        );
        profile.healthStatus = 'HEALTHY';
        profile.latencyMs = result.latencyMs;
        profile.requestCount += 1;
        profile.lastError = undefined;
        profile.lastTestedAt = Date.now();
        this.storage.save();

        this.eventBus.emit('MODEL_RESPONDED', `Model response received (${result.latencyMs}ms)`, taskId, {
          profileId: profile.id,
          platform,
          latencyMs: result.latencyMs,
        });

        return {
          ok: true,
          text: result.text,
          providerUsed: profile.displayName,
          projectId: profile.projectId,
          modelUsed: result.model,
          latencyMs: result.latencyMs,
        };
      } catch (err: unknown) {
        const rawMsg = err instanceof Error ? err.message : 'Model request failed';
        const cleanMsg = scrubSecrets(rawMsg).cleanText;
        const classified = classifyProviderError(cleanMsg);
        profile.errorCount += 1;
        profile.lastError = cleanMsg;
        lastErrorCode = classified.code;
        lastErrorMessage = cleanMsg;

        this.eventBus.emit(
          'PROVIDER_FAILED',
          `Profile ${profile.displayName} failed (${classified.code})`,
          taskId,
          { profileId: profile.id, platform, projectId: profile.projectId, code: classified.code }
        );

        if (classified.code === 'QUOTA_EXHAUSTED') {
          this.markProjectCooldown(profile.projectId, 'QUOTA_EXHAUSTED');
          previousFailedProfile = profile.displayName;
          continue;
        }

        profile.healthStatus = classified.status;
        this.storage.save();

        if (classified.code === 'AUTH_FAILED') {
          if (profile.secretReference.startsWith('ENV:')) {
            failedEnvRefs.add(profile.secretReference);
          }
          previousFailedProfile = profile.displayName;
          continue;
        }

        if (classified.code === 'NETWORK_ERROR') {
          previousFailedProfile = profile.displayName;
          continue;
        }
      }
    }

    return {
      ok: false,
      offline: true,
      errorCode: lastErrorCode,
      errorMessage: lastErrorMessage,
    };
  }
}
