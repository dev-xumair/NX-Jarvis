import { GoogleGenAI } from '@google/genai';
import type { ProviderProfile } from '../../src/types/agent.ts';
import { StorageEngine } from '../storage.ts';

export type ModelStrategy = 'AUTO' | 'FAST' | 'BALANCED' | 'BEST' | 'LOCAL' | 'CLOUD';

export interface ModelDescriptor {
  id: string;
  name: string;
  provider: 'google_gemini' | 'local_rule' | 'custom_llm';
  contextCapacity: number;
  expectedLatencyMs: number;
  reasoningStrength: number; // 1-10
  codingAbility: number; // 1-10
  visionCapability: boolean;
  toolUse: boolean;
  costClass: 'FREE' | 'LOW' | 'PREMIUM';
  isLocal: boolean;
}

export const MODEL_REGISTRY: ModelDescriptor[] = [
  {
    id: 'gemini-2.5-flash',
    name: 'Gemini 2.5 Flash (Balanced)',
    provider: 'google_gemini',
    contextCapacity: 1048576,
    expectedLatencyMs: 320,
    reasoningStrength: 8,
    codingAbility: 8,
    visionCapability: true,
    toolUse: true,
    costClass: 'FREE',
    isLocal: false,
  },
  {
    id: 'gemini-2.5-flash-lite',
    name: 'Gemini 2.5 Flash Lite (Ultra Fast)',
    provider: 'google_gemini',
    contextCapacity: 1048576,
    expectedLatencyMs: 180,
    reasoningStrength: 6,
    codingAbility: 6,
    visionCapability: true,
    toolUse: true,
    costClass: 'FREE',
    isLocal: false,
  },
  {
    id: 'gemini-2.5-pro',
    name: 'Gemini 2.5 Pro (Deep Reasoning)',
    provider: 'google_gemini',
    contextCapacity: 2097152,
    expectedLatencyMs: 650,
    reasoningStrength: 10,
    codingAbility: 10,
    visionCapability: true,
    toolUse: true,
    costClass: 'FREE',
    isLocal: false,
  },
  {
    id: 'nx-local-thinker',
    name: 'NX Local Thinker (Offline Heuristic)',
    provider: 'local_rule',
    contextCapacity: 16384,
    expectedLatencyMs: 2,
    reasoningStrength: 4,
    codingAbility: 3,
    visionCapability: false,
    toolUse: true,
    costClass: 'FREE',
    isLocal: true,
  },
];

export interface AIProviderResult {
  text: string;
  providerName: string;
  modelUsed: string;
  latencyMs: number;
  strategyApplied: ModelStrategy;
  isOffline: boolean;
}

export class AIProviderRouter {
  private static projectCooldowns: Map<string, number> = new Map();

  public static isProjectCoolingDown(projectId: string): boolean {
    const cd = this.projectCooldowns.get(projectId);
    if (!cd) return false;
    if (Date.now() > cd) {
      this.projectCooldowns.delete(projectId);
      return false;
    }
    return true;
  }

  public static markCooldown(projectId: string, durationMs: number = 300000): void {
    this.projectCooldowns.set(projectId, Date.now() + durationMs);
  }

  public static selectModel(
    strategy: ModelStrategy,
    taskComplexity: 'simple' | 'complex' | 'code' | 'general' = 'general'
  ): ModelDescriptor {
    if (strategy === 'LOCAL') {
      return MODEL_REGISTRY.find((m) => m.isLocal) || MODEL_REGISTRY[3];
    }
    if (strategy === 'FAST') {
      return MODEL_REGISTRY.find((m) => m.id === 'gemini-2.5-flash-lite') || MODEL_REGISTRY[0];
    }
    if (strategy === 'BEST') {
      return MODEL_REGISTRY.find((m) => m.id === 'gemini-2.5-pro') || MODEL_REGISTRY[0];
    }
    if (strategy === 'AUTO') {
      if (taskComplexity === 'simple') return MODEL_REGISTRY[1]; // Flash Lite
      if (taskComplexity === 'complex' || taskComplexity === 'code') return MODEL_REGISTRY[2]; // Pro
      return MODEL_REGISTRY[0]; // Flash
    }
    // BALANCED default
    return MODEL_REGISTRY[0];
  }

  public static async executePrompt(
    prompt: string,
    systemInstruction: string,
    strategy: ModelStrategy = 'AUTO'
  ): Promise<AIProviderResult> {
    const start = Date.now();
    const model = this.selectModel(strategy);

    if (model.isLocal) {
      return {
        text: 'Local execution completed offline via NX rules engine.',
        providerName: 'Local Thinker',
        modelUsed: model.id,
        latencyMs: Date.now() - start,
        strategyApplied: strategy,
        isOffline: true,
      };
    }

    const profiles = StorageEngine.getProviderProfiles();
    const activeProfiles = profiles.filter(
      (p) => p.enabled && !this.isProjectCoolingDown(p.projectId)
    );

    for (const profile of activeProfiles) {
      try {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) throw new Error('Missing GEMINI_API_KEY');

        const ai = new GoogleGenAI({
          apiKey,
          httpOptions: { headers: { 'User-Agent': 'nx-ai-agent' } },
        });

        const res = await ai.models.generateContent({
          model: model.id,
          contents: prompt,
          config: { systemInstruction },
        });

        profile.healthStatus = 'HEALTHY';
        profile.requestCount += 1;
        profile.latencyMs = Date.now() - start;
        StorageEngine.saveProviderProfiles(profiles);

        return {
          text: res.text || 'Ji, main tayyar hoon.',
          providerName: profile.displayName,
          modelUsed: model.id,
          latencyMs: Date.now() - start,
          strategyApplied: strategy,
          isOffline: false,
        };
      } catch (err: any) {
        if (err?.message?.includes('429') || err?.message?.includes('quota')) {
          this.markCooldown(profile.projectId, 300000);
          profile.healthStatus = 'COOLING_DOWN';
        } else {
          profile.healthStatus = 'DEGRADED';
        }
        StorageEngine.saveProviderProfiles(profiles);
      }
    }

    // Graceful offline fallback
    return {
      text: 'Online AI connectivity filhaal unavailable hai, lekin local tools aur smart memory mukammal active hain.',
      providerName: 'NX Local Fallback',
      modelUsed: 'nx-local-thinker',
      latencyMs: Date.now() - start,
      strategyApplied: strategy,
      isOffline: true,
    };
  }
}
