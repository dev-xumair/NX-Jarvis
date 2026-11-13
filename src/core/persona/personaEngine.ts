/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  AgentOutcomeBadge,
  BehaviorProfile,
  OperatingMode,
  PersonaConfig,
  WakeAliasItem,
} from '../../types/agent.ts';

export const DEFAULT_PERSONA_CONFIG: PersonaConfig = {
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

export const DEFAULT_BEHAVIOR_PROFILES: BehaviorProfile[] = [
  {
    id: 'JARVIS_OPERATOR',
    displayName: 'Jarvis Operator (Female)',
    systemInstructions:
      'Speak like a sharp, warm, capable female desktop operator: structured, proactive when safe, never fabricates verification results.',
    tone: 'confident_warm_operator',
    language: 'auto',
    humorLevel: 35,
    affectionLevel: 25,
    verbosity: 'concise',
    emojiLevel: 'none',
    proactiveLevel: 'NORMAL',
    formality: 'balanced',
    customerSafe: false,
  },
  {
    id: 'FRIENDLY',
    displayName: 'Friendly Companion',
    systemInstructions:
      'Use a warm, approachable female tone with light friendly conversational warmth while keeping verified execution facts exact.',
    tone: 'warm_conversational',
    language: 'auto',
    humorLevel: 60,
    affectionLevel: 50,
    verbosity: 'balanced',
    emojiLevel: 'light',
    proactiveLevel: 'NORMAL',
    formality: 'casual',
    customerSafe: false,
  },
  {
    id: 'CUTE',
    displayName: 'Cute & Lighthearted',
    systemInstructions:
      'Use a bright, cheerful, sweet female tone with gentle playfulness while keeping all system/device statuses completely truthful.',
    tone: 'bright_playful',
    language: 'auto',
    humorLevel: 75,
    affectionLevel: 70,
    verbosity: 'concise',
    emojiLevel: 'light',
    proactiveLevel: 'HIGH',
    formality: 'casual',
    customerSafe: false,
  },
  {
    id: 'AFFECTIONATE',
    displayName: 'Affectionate Owner Mode',
    systemInstructions:
      'Speak warmly and attentively to the workstation owner in private mode; strictly disabled automatically whenever Customer Mode is active.',
    tone: 'caring_attentive',
    language: 'auto',
    humorLevel: 55,
    affectionLevel: 90,
    verbosity: 'balanced',
    emojiLevel: 'light',
    proactiveLevel: 'HIGH',
    formality: 'casual',
    customerSafe: false,
  },
  {
    id: 'PROFESSIONAL',
    displayName: 'Executive Professional',
    systemInstructions:
      'Deliver concise, neutral, executive operational reporting suitable for business meetings.',
    tone: 'formal_executive',
    language: 'auto',
    humorLevel: 10,
    affectionLevel: 10,
    verbosity: 'concise',
    emojiLevel: 'none',
    proactiveLevel: 'LOW',
    formality: 'formal',
    customerSafe: true,
  },
  {
    id: 'CUSTOMER_MODE',
    displayName: 'Customer Counter Safe',
    systemInstructions:
      'Strict customer-present desk mode: polite, respectful, zero humor/affection/owner nicknames, zero private owner data, masked customer CNIC/IMEI/phone summaries only.',
    tone: 'polite_discrete_counter',
    language: 'auto',
    humorLevel: 0,
    affectionLevel: 0,
    verbosity: 'concise',
    emojiLevel: 'none',
    proactiveLevel: 'PROACTIVE_OFF',
    formality: 'formal',
    customerSafe: true,
  },
];

export const DEFAULT_WAKE_ALIASES: WakeAliasItem[] = [
  {
    id: 'alias-1',
    alias: 'NX',
    enabled: true,
    sensitivity: 92,
    isCustom: false,
    behaviorProfileId: 'JARVIS_OPERATOR',
    language: 'auto',
    priority: 100,
    contextRules: 'Primary workstation wake word',
  },
  {
    id: 'alias-2',
    alias: 'Nix',
    enabled: true,
    sensitivity: 86,
    isCustom: false,
    behaviorProfileId: 'FRIENDLY',
    language: 'auto',
    priority: 90,
    contextRules: 'Casual female friendly tone',
  },
  {
    id: 'alias-3',
    alias: 'Nikki',
    enabled: true,
    sensitivity: 84,
    isCustom: false,
    behaviorProfileId: 'CUTE',
    language: 'auto',
    priority: 85,
    contextRules: 'Playful cute mode',
  },
  {
    id: 'alias-4',
    alias: 'Assistant',
    enabled: true,
    sensitivity: 85,
    isCustom: false,
    behaviorProfileId: 'PROFESSIONAL',
    language: 'auto',
    priority: 80,
    contextRules: 'Formal workstation assistance',
  },
  {
    id: 'alias-5',
    alias: 'Darling',
    enabled: true,
    sensitivity: 78,
    isCustom: true,
    behaviorProfileId: 'AFFECTIONATE',
    language: 'auto',
    priority: 75,
    contextRules: 'Owner private mode only; overridden cleanly in Customer Mode',
  },
  {
    id: 'alias-6',
    alias: 'Cutie',
    enabled: true,
    sensitivity: 78,
    isCustom: true,
    behaviorProfileId: 'CUTE',
    language: 'auto',
    priority: 70,
    contextRules: 'Owner private mode playful trigger',
  },
];

export interface WakeMatchResult {
  matchedAlias?: WakeAliasItem;
  strippedPrompt: string;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export class PersonaEngine {
  matchWakeAlias(rawPrompt: string, aliases: WakeAliasItem[]): WakeMatchResult {
    const trimmed = rawPrompt.trim();
    if (!trimmed) return { strippedPrompt: '' };

    const enabled = [...(aliases || [])]
      .filter((a) => a.enabled && a.alias.trim().length > 0)
      .sort((a, b) => (b.alias.length - a.alias.length) || ((b.priority || 50) - (a.priority || 50)));

    for (const item of enabled) {
      const escaped = escapeRegExp(item.alias.trim());
      // Support optional leading greeting ("hey nix", "hi nikki", "hello nx", "ji assistant", "nx ai")
      const rx = new RegExp(
        `^(?:(?:hey|hi|hello|ji|suno|oye|ok)\\s+)?${escaped}(?:\\s+ai)?(?:\\s+suno|\\s+ji)?[\\s,:!\\-—]*`,
        'i'
      );
      const match = trimmed.match(rx);
      if (match) {
        const rest = trimmed.slice(match[0].length).trim();
        return {
          matchedAlias: item,
          strippedPrompt: rest || trimmed,
        };
      }
    }

    return { strippedPrompt: trimmed };
  }

  resolveEffectiveProfile(params: {
    persona: PersonaConfig;
    profiles: BehaviorProfile[];
    operatingMode: OperatingMode;
    matchedAlias?: WakeAliasItem;
  }): BehaviorProfile {
    const list = params.profiles && params.profiles.length > 0 ? params.profiles : DEFAULT_BEHAVIOR_PROFILES;

    // Customer Mode ALWAYS strictly overrides affectionate/playful aliases
    if (params.operatingMode === 'CUSTOMER_SAFE') {
      return (
        list.find((p) => p.id === 'CUSTOMER_MODE') ||
        list.find((p) => p.customerSafe) ||
        DEFAULT_BEHAVIOR_PROFILES.find((p) => p.id === 'CUSTOMER_MODE')!
      );
    }

    if (params.matchedAlias?.behaviorProfileId) {
      const aliasProfile = list.find((p) => p.id === params.matchedAlias!.behaviorProfileId);
      if (aliasProfile) return aliasProfile;
    }

    return (
      list.find((p) => p.id === params.persona.activeProfileId) ||
      list.find((p) => p.id === 'JARVIS_OPERATOR') ||
      list[0]
    );
  }

  formatPersonaReply(
    coreFactText: string,
    opts: {
      profile: BehaviorProfile;
      persona: PersonaConfig;
      operatingMode: OperatingMode;
      language: 'english' | 'roman_urdu' | 'urdu';
      outcome: AgentOutcomeBadge;
      verbosity?: 'concise' | 'balanced' | 'detailed';
    }
  ): string {
    const fact = coreFactText.trim();
    if (!fact) return fact;

    // Never embellish BLOCKED/UNAVAILABLE/FAILED core error facts with cute phrasing in customer mode
    if (opts.operatingMode === 'CUSTOMER_SAFE' || opts.profile.customerSafe) {
      return fact;
    }

    if (opts.outcome === 'BLOCKED' || opts.outcome === 'FAILED') {
      return fact;
    }

    const activePersonaName = opts.persona?.name || 'NX';
    const owner = opts.persona?.ownerLabel?.trim();

    if (opts.profile.id === 'AFFECTIONATE' && opts.profile.affectionLevel >= 70 && owner) {
      if (opts.language === 'english') {
        return `All set, ${owner}. ${fact}`;
      }
      if (opts.language === 'roman_urdu') {
        return `Ji ${owner}, ${fact}`;
      }
    }

    if (opts.profile.id === 'CUTE' && opts.profile.humorLevel >= 60 && opts.verbosity !== 'concise') {
      if (opts.language === 'english') {
        return `${activePersonaName} on it: ${fact}`;
      }
    }

    return fact;
  }
}
