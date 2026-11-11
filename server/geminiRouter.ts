import { GoogleGenAI } from '@google/genai';
import type { ProviderProfile } from '../src/types/agent.ts';
import { StorageEngine } from './storage.ts';

// Quota isolation state map: projectId -> cooldownUntil timestamp
const projectCooldowns: Map<string, number> = new Map();

export class GeminiRouter {
  public static getProfiles(): ProviderProfile[] {
    return StorageEngine.getProviderProfiles();
  }

  public static isProjectCoolingDown(projectId: string): boolean {
    const cooldown = projectCooldowns.get(projectId);
    if (!cooldown) return false;
    if (Date.now() > cooldown) {
      projectCooldowns.delete(projectId);
      return false;
    }
    return true;
  }

  public static markProjectCooldown(projectId: string, durationMs: number = 300000): void {
    const until = Date.now() + durationMs;
    projectCooldowns.set(projectId, until);

    // Update profiles in storage
    const profiles = StorageEngine.getProviderProfiles();
    profiles.forEach((p) => {
      if (p.projectId === projectId) {
        p.healthStatus = 'COOLING_DOWN';
        p.cooldownUntil = until;
      }
    });
    StorageEngine.saveProviderProfiles(profiles);
  }

  public static getAvailableProfile(): ProviderProfile | null {
    const profiles = StorageEngine.getProviderProfiles();
    const available = profiles.filter((p) => p.enabled && !this.isProjectCoolingDown(p.projectId));
    if (available.length > 0) {
      return available.sort((a, b) => a.priority - b.priority)[0];
    }
    return null;
  }

  public static async executeWithFailover(
    prompt: string,
    systemInstruction: string
  ): Promise<{ text: string; profileUsed: ProviderProfile | null; offlineFallback: boolean }> {
    const profiles = StorageEngine.getProviderProfiles();
    const sortedProfiles = profiles
      .filter((p) => p.enabled)
      .sort((a, b) => a.priority - b.priority);

    for (const profile of sortedProfiles) {
      if (this.isProjectCoolingDown(profile.projectId)) {
        continue;
      }

      try {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
          throw new Error('No GEMINI_API_KEY environment variable provided');
        }

        const ai = new GoogleGenAI({
          apiKey,
          httpOptions: { headers: { 'User-Agent': 'nx-ai-agent' } },
        });

        const modelToUse = profile.selectedModel || 'gemini-2.5-flash';
        const response = await ai.models.generateContent({
          model: modelToUse,
          contents: prompt,
          config: { systemInstruction },
        });

        profile.healthStatus = 'HEALTHY';
        profile.requestCount += 1;
        StorageEngine.saveProviderProfiles(profiles);

        return {
          text: response.text || 'Theek hai, main samajh gayi hoon.',
          profileUsed: profile,
          offlineFallback: false,
        };
      } catch (err: any) {
        console.warn(`[GeminiRouter] Error on profile "${profile.displayName}":`, err?.message);

        // If 429 quota block, place entire GCP projectId in 300s cooldown
        if (err?.message?.includes('429') || err?.message?.includes('quota')) {
          this.markProjectCooldown(profile.projectId, 300000);
        } else {
          profile.healthStatus = 'DEGRADED';
          StorageEngine.saveProviderProfiles(profiles);
        }
      }
    }

    // Graceful offline fallback
    return {
      text: 'Online AI connection filhaal unavailable hai, lekin local computer controls, file operations aur smart memory mukammal operational hain.',
      profileUsed: null,
      offlineFallback: true,
    };
  }
}
