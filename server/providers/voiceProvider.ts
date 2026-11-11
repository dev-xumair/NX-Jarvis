export interface VoiceProfile {
  id: string;
  provider: 'elevenlabs' | 'webspeech_local';
  name: string;
  voiceId?: string;
  apiKeyMasked?: string;
  isDefault: boolean;
  health: 'AVAILABLE' | 'COOLDOWN' | 'QUOTA_EXHAUSTED' | 'DISABLED';
  cooldownUntil?: number;
}

export interface VoiceSynthesisResult {
  providerUsed: 'elevenlabs' | 'webspeech_local';
  audioData?: string; // base64 MP3 if cloud synthesis
  latencyMs: number;
  textSpoken: string;
}

export class VoiceProviderManager {
  private static profiles: VoiceProfile[] = [
    {
      id: 'voice-elevenlabs-saba',
      provider: 'elevenlabs',
      name: 'ElevenLabs Saba (Natural Pakistani English/Urdu Accent)',
      voiceId: '21m00Tcm4TlvDq8ikWAM', // Standard expressive natural female voice
      apiKeyMasked: 'eleven_...4819',
      isDefault: true,
      health: 'AVAILABLE',
    },
    {
      id: 'voice-local-browser',
      provider: 'webspeech_local',
      name: 'Local WebSpeech High-Speed Synthesis',
      isDefault: false,
      health: 'AVAILABLE',
    },
  ];

  public static getProfiles(): VoiceProfile[] {
    return this.profiles;
  }

  public static markCooldown(profileId: string, durationMs: number = 300000): void {
    const prof = this.profiles.find((p) => p.id === profileId);
    if (prof) {
      prof.health = 'COOLDOWN';
      prof.cooldownUntil = Date.now() + durationMs;
    }
  }

  public static isCoolingDown(profile: VoiceProfile): boolean {
    if (profile.health !== 'COOLDOWN' || !profile.cooldownUntil) return false;
    if (Date.now() > profile.cooldownUntil) {
      profile.health = 'AVAILABLE';
      profile.cooldownUntil = undefined;
      return false;
    }
    return true;
  }

  public static async synthesizeSpeech(
    text: string,
    overrideVoiceId?: string
  ): Promise<VoiceSynthesisResult> {
    const start = Date.now();
    const elevenProfile = this.profiles.find((p) => p.provider === 'elevenlabs');

    // Check if ELEVENLABS_API_KEY exists and profile is not cooling down
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (apiKey && elevenProfile && !this.isCoolingDown(elevenProfile)) {
      try {
        const voiceId = overrideVoiceId || elevenProfile.voiceId || '21m00Tcm4TlvDq8ikWAM';
        const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'xi-api-key': apiKey,
          },
          body: JSON.stringify({
            text,
            model_id: 'eleven_multilingual_v2',
            voice_settings: { stability: 0.5, similarity_boost: 0.8 },
          }),
        });

        if (response.ok) {
          const arrayBuf = await response.arrayBuffer();
          const base64Audio = Buffer.from(arrayBuf).toString('base64');
          return {
            providerUsed: 'elevenlabs',
            audioData: `data:audio/mp3;base64,${base64Audio}`,
            latencyMs: Date.now() - start,
            textSpoken: text,
          };
        } else if (response.status === 429) {
          this.markCooldown(elevenProfile.id, 300000);
        }
      } catch {
        // Fallback to local
      }
    }

    // Default high-speed local WebSpeech fallback (<10ms)
    return {
      providerUsed: 'webspeech_local',
      latencyMs: Date.now() - start,
      textSpoken: text,
    };
  }
}
