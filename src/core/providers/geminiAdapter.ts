/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI } from '@google/genai';
import type {
  AIPlatformId,
  ModelCapabilityProfile,
  ModelVerificationStatus,
  ProviderDiagnosticAttempt,
  ProviderValidationErrorClass,
} from '../../types/agent.ts';

export interface GeminiGenerateRequest {
  prompt: string;
  systemInstruction: string;
  model: string;
  apiKey?: string;
}

export interface GeminiGenerateResult {
  text: string;
  model: string;
  latencyMs: number;
}

export interface PlatformDescriptor {
  id: AIPlatformId;
  label: string;
  defaultModel: string;
  envVar: string;
  keyHint: string;
  baseUrl: string;
}

export const AI_PLATFORMS: Record<AIPlatformId, PlatformDescriptor> = {
  google_gemini: {
    id: 'google_gemini',
    label: 'Google Gemini',
    defaultModel: 'gemini-4-hydrogen',
    envVar: 'GEMINI_API_KEY',
    keyHint: 'Gemini API key from Google AI Studio',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
  },
  openai: {
    id: 'openai',
    label: 'OpenAI',
    defaultModel: 'gpt-4o-mini',
    envVar: 'OPENAI_API_KEY',
    keyHint: 'OpenAI project/API key',
    baseUrl: 'https://api.openai.com/v1',
  },
  anthropic: {
    id: 'anthropic',
    label: 'Anthropic Claude',
    defaultModel: 'claude-3-5-haiku-latest',
    envVar: 'ANTHROPIC_API_KEY',
    keyHint: 'Anthropic Console API key',
    baseUrl: 'https://api.anthropic.com/v1',
  },
  groq: {
    id: 'groq',
    label: 'Groq',
    defaultModel: 'llama-3.3-70b-versatile',
    envVar: 'GROQ_API_KEY',
    keyHint: 'Groq Cloud API key',
    baseUrl: 'https://api.groq.com/openai/v1',
  },
  openrouter: {
    id: 'openrouter',
    label: 'OpenRouter',
    defaultModel: 'openai/gpt-4o-mini',
    envVar: 'OPENROUTER_API_KEY',
    keyHint: 'OpenRouter unified API key',
    baseUrl: 'https://openrouter.ai/api/v1',
  },
  deepseek: {
    id: 'deepseek',
    label: 'DeepSeek',
    defaultModel: 'deepseek-chat',
    envVar: 'DEEPSEEK_API_KEY',
    keyHint: 'DeepSeek API key',
    baseUrl: 'https://api.deepseek.com',
  },
};

export interface DiscoveredModelMeta {
  modelId: string;
  displayName: string;
  apiVersion?: string;
  contextWindow?: number;
  deprecated: boolean;
  capabilities: ModelCapabilityProfile;
  source: string;
}

export interface ModelDiscoveryResult {
  ok: boolean;
  models: string[];
  modelDetails?: DiscoveredModelMeta[];
  latencyMs: number;
  statusCode?: number | null;
  errorClass?: ProviderValidationErrorClass;
  responseSchemaValid?: boolean;
  error?: string;
}

export interface ModelCheckOutcome {
  meta: DiscoveredModelMeta;
  status: ModelVerificationStatus;
  verification: {
    authPassed: boolean;
    generationPassed: boolean;
    structuredOutputPassed?: boolean;
    latencyMs: number | null;
    testedAt: number;
    error?: string;
  };
}

export interface PlatformVerificationResult {
  ok: boolean;
  discoveredModels: string[];
  verifiedModels: string[];
  modelChecks?: ModelCheckOutcome[];
  diagnostics?: Omit<ProviderDiagnosticAttempt, 'id' | 'correlationId' | 'profileId'>[];
  activeModel: string;
  latencyMs: number;
  error?: string;
}

export function inferCapabilitiesFromModel(
  platform: AIPlatformId,
  modelId: string,
  extra?: { displayName?: string; inputTokenLimit?: number; supportedGenerationMethods?: string[]; description?: string }
): DiscoveredModelMeta {
  const lower = `${modelId} ${extra?.description || ''}`.toLowerCase();
  const isEmbedding = /embed|embedding|text-embedding/i.test(lower);
  const isImageGen = /imagen|dall-e|image-gen/i.test(lower);
  const isAudioOnly = /whisper|tts|transcribe/i.test(lower);
  const isReasoning = /\b(o1|o3|o4|reasoner|r1|thinking|argon)\b/i.test(lower);
  const isVision =
    !isEmbedding &&
    !isAudioOnly &&
    (/vision|gemini|gpt-4o|gpt-5|claude-3|claude-4|llama-3\.2-.*vision/i.test(lower) || platform === 'google_gemini');
  const supportsText = !isEmbedding && !isImageGen && !isAudioOnly;
  const deprecated = /deprecated|legacy|\b001\b/i.test(lower);

  return {
    modelId,
    displayName: extra?.displayName || modelId,
    apiVersion: platform === 'google_gemini' ? 'v1beta' : 'v1',
    contextWindow: extra?.inputTokenLimit,
    deprecated,
    source: 'live_catalog_api',
    capabilities: {
      text: supportsText,
      vision: isVision,
      audio: isAudioOnly || /audio|realtime|gemini/i.test(lower),
      imageGeneration: isImageGen,
      toolCalling: supportsText && !isEmbedding,
      structuredOutput: supportsText,
      reasoning: isReasoning,
      streaming: supportsText,
      embeddings: isEmbedding,
    },
  };
}

function resolvePlatformKey(platform: AIPlatformId, explicitApiKey?: string): string | null {
  if (explicitApiKey && explicitApiKey.trim()) return explicitApiKey.trim();
  const envVar = AI_PLATFORMS[platform]?.envVar || 'GEMINI_API_KEY';
  const envVal = process.env[envVar];
  if (!envVal || envVal === 'undefined' || envVal === 'MY_GEMINI_API_KEY') return null;
  return envVal.trim();
}

export function classifyHttpStatus(
  status: number | null,
  bodyText: string
): ProviderValidationErrorClass {
  const lower = bodyText.toLowerCase();
  if (status === 401 || /api key not valid|unauthenticated|invalid.*key|incorrect api key/i.test(lower)) {
    return 'INVALID_CREDENTIAL';
  }
  if (status === 403 || /permission|forbidden|access_token_type_unsupported/i.test(lower)) {
    return 'FORBIDDEN';
  }
  if (status === 402 || /billing|credit|insufficient_quota|payment required/i.test(lower)) {
    return 'QUOTA_OR_BILLING_REQUIRED';
  }
  if (status === 429 || /rate limit|resource_exhausted|quota/i.test(lower)) {
    return 'RATE_LIMITED';
  }
  if (status === 404 || /model.*not.*found|not supported/i.test(lower)) {
    return 'MODEL_NOT_SUPPORTED';
  }
  if (status !== null && status >= 500) {
    return 'PROVIDER_TEMPORARY_ERROR';
  }
  if (/timeout|timed out|abort/i.test(lower)) {
    return 'TIMEOUT';
  }
  return 'NETWORK_ERROR';
}

function formatHttpError(status: number, bodyText: string, platform: AIPlatformId): string {
  const snippet = bodyText.replace(/\s+/g, ' ').slice(0, 220);
  const cls = classifyHttpStatus(status, bodyText);
  if (cls === 'INVALID_CREDENTIAL' || cls === 'FORBIDDEN') {
    return `${status} ${cls}: ${AI_PLATFORMS[platform].label} rejected API key (${snippet || 'invalid key'}).`;
  }
  if (cls === 'RATE_LIMITED' || cls === 'QUOTA_OR_BILLING_REQUIRED') {
    return `${status} ${cls}: ${AI_PLATFORMS[platform].label} quota/rate limit (${snippet}).`;
  }
  return `HTTP ${status} (${cls}): ${snippet || 'Provider request error'}`;
}

export class GeminiProviderAdapter {
  private createClient(explicitApiKey?: string): GoogleGenAI | null {
    const apiKey = resolvePlatformKey('google_gemini', explicitApiKey);
    if (!apiKey) return null;
    return new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'NX-AI-Autonomous-Agent/2.0',
        },
      },
    });
  }

  isConfigured(hasVaultKeys = false): boolean {
    if (hasVaultKeys) return true;
    return (Object.keys(AI_PLATFORMS) as AIPlatformId[]).some((p) => resolvePlatformKey(p) !== null);
  }

  isPlatformKeyAvailable(platform: AIPlatformId, explicitApiKey?: string): boolean {
    return resolvePlatformKey(platform, explicitApiKey) !== null;
  }

  async discoverPlatformModels(
    platform: AIPlatformId,
    explicitApiKey?: string,
    baseUrlOverride?: string
  ): Promise<ModelDiscoveryResult> {
    const key = resolvePlatformKey(platform, explicitApiKey);
    if (!key) {
      return {
        ok: false,
        models: [],
        modelDetails: [],
        latencyMs: 0,
        error: `401 API key is not configured for ${AI_PLATFORMS[platform].label}.`,
      };
    }

    const baseUrl = (baseUrlOverride || AI_PLATFORMS[platform].baseUrl).replace(/\/+$/, '');
    const start = Date.now();

    try {
      if (platform === 'google_gemini') {
        const res = await fetch(`${baseUrl}/models?key=${encodeURIComponent(key)}&pageSize=100`, {
          headers: { 'User-Agent': 'NX-AI-Autonomous-Agent/2.0' },
          signal: AbortSignal.timeout(10_000),
        });
        const text = await res.text();
        if (!res.ok) {
          return {
            ok: false,
            models: [],
            modelDetails: [],
            latencyMs: Date.now() - start,
            statusCode: res.status,
            errorClass: classifyHttpStatus(res.status, text),
            responseSchemaValid: false,
            error: formatHttpError(res.status, text, platform),
          };
        }
        const json = JSON.parse(text) as {
          models?: Array<{
            name?: string;
            displayName?: string;
            description?: string;
            inputTokenLimit?: number;
            supportedGenerationMethods?: string[];
          }>;
        };
        const seen = new Set<string>();
        const modelDetails: DiscoveredModelMeta[] = [];
        for (const m of json.models || []) {
          const id = (m.name || '').replace(/^models\//, '');
          if (!id || seen.has(id)) continue;
          seen.add(id);
          modelDetails.push(inferCapabilitiesFromModel(platform, id, m));
        }
        const chatModels = modelDetails.filter((m) => m.capabilities.text).map((m) => m.modelId);
        const allIds = modelDetails.map((m) => m.modelId);
        return {
          ok: allIds.length > 0,
          models: chatModels.length > 0 ? chatModels : allIds,
          modelDetails,
          latencyMs: Date.now() - start,
          statusCode: res.status,
          responseSchemaValid: Array.isArray(json.models),
        };
      }

      if (platform === 'anthropic') {
        const res = await fetch(`${baseUrl}/models`, {
          headers: {
            'x-api-key': key,
            'anthropic-version': '2023-06-01',
            'User-Agent': 'NX-AI-Autonomous-Agent/2.0',
          },
          signal: AbortSignal.timeout(10_000),
        });
        const text = await res.text();
        if (!res.ok) {
          return {
            ok: false,
            models: [],
            modelDetails: [],
            latencyMs: Date.now() - start,
            statusCode: res.status,
            errorClass: classifyHttpStatus(res.status, text),
            responseSchemaValid: false,
            error: formatHttpError(res.status, text, platform),
          };
        }
        const json = JSON.parse(text) as { data?: Array<{ id?: string; display_name?: string }> };
        const seen = new Set<string>();
        const modelDetails: DiscoveredModelMeta[] = [];
        for (const m of json.data || []) {
          const id = m.id || '';
          if (!id || !id.toLowerCase().includes('claude') || seen.has(id)) continue;
          seen.add(id);
          modelDetails.push(inferCapabilitiesFromModel(platform, id, { displayName: m.display_name || id }));
        }
        return {
          ok: modelDetails.length > 0,
          models: modelDetails.map((m) => m.modelId),
          modelDetails,
          latencyMs: Date.now() - start,
          statusCode: res.status,
          responseSchemaValid: Array.isArray(json.data),
        };
      }

      // OpenAI, Groq, OpenRouter, DeepSeek — standard Bearer /models endpoint
      const res = await fetch(`${baseUrl}/models`, {
        headers: {
          Authorization: `Bearer ${key}`,
          'User-Agent': 'NX-AI-Autonomous-Agent/2.0',
        },
        signal: AbortSignal.timeout(10_000),
      });
      const text = await res.text();
      if (!res.ok) {
        return {
          ok: false,
          models: [],
          modelDetails: [],
          latencyMs: Date.now() - start,
          statusCode: res.status,
          errorClass: classifyHttpStatus(res.status, text),
          responseSchemaValid: false,
          error: formatHttpError(res.status, text, platform),
        };
      }
      const json = JSON.parse(text) as {
        data?: Array<{ id?: string; name?: string; context_length?: number }>;
      };
      const seen = new Set<string>();
      const modelDetails: DiscoveredModelMeta[] = [];
      for (const m of json.data || []) {
        const id = m.id || '';
        if (!id || seen.has(id)) continue;
        if (
          platform === 'openai' &&
          !/^(gpt-|o[1-9]|chatgpt-|text-embedding)/i.test(id)
        ) {
          continue;
        }
        seen.add(id);
        modelDetails.push(
          inferCapabilitiesFromModel(platform, id, {
            displayName: m.name || id,
            inputTokenLimit: m.context_length,
          })
        );
      }
      const runnableTextIds = modelDetails.filter((m) => m.capabilities.text).map((m) => m.modelId);
      const allIds = modelDetails.map((m) => m.modelId);
      return {
        ok: allIds.length > 0,
        models: runnableTextIds.length > 0 ? runnableTextIds : allIds,
        modelDetails,
        latencyMs: Date.now() - start,
        statusCode: res.status,
        responseSchemaValid: Array.isArray(json.data),
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Model catalog fetch failed';
      return {
        ok: false,
        models: [],
        modelDetails: [],
        latencyMs: Date.now() - start,
        statusCode: null,
        errorClass: /timeout|abort/i.test(msg) ? 'TIMEOUT' : 'NETWORK_ERROR',
        responseSchemaValid: false,
        error: `NETWORK_ERROR: ${msg}`,
      };
    }
  }

  async generate(req: GeminiGenerateRequest): Promise<GeminiGenerateResult> {
    const client = this.createClient(req.apiKey);
    if (!client) {
      throw new Error('GEMINI_API_KEY_NOT_CONFIGURED');
    }
    const start = Date.now();
    const response = await client.models.generateContent({
      model: req.model || 'gemini-4-hydrogen',
      contents: req.prompt,
      config: {
        systemInstruction: req.systemInstruction,
      },
    });
    return {
      text: response.text || '',
      model: req.model || 'gemini-4-hydrogen',
      latencyMs: Date.now() - start,
    };
  }

  async generateForPlatform(
    platform: AIPlatformId,
    req: GeminiGenerateRequest,
    baseUrlOverride?: string
  ): Promise<GeminiGenerateResult> {
    if (platform === 'google_gemini' && !baseUrlOverride) {
      return this.generate(req);
    }

    const key = resolvePlatformKey(platform, req.apiKey);
    if (!key) {
      throw new Error(`401 ${AI_PLATFORMS[platform].envVar}_NOT_CONFIGURED`);
    }

    const baseUrl = (baseUrlOverride || AI_PLATFORMS[platform].baseUrl).replace(/\/+$/, '');
    const model = req.model || AI_PLATFORMS[platform].defaultModel;
    const start = Date.now();

    if (platform === 'google_gemini') {
      const res = await fetch(
        `${baseUrl}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'NX-AI-Autonomous-Agent/2.0',
          },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: req.systemInstruction }] },
            contents: [{ role: 'user', parts: [{ text: req.prompt }] }],
          }),
          signal: AbortSignal.timeout(15_000),
        }
      );
      const raw = await res.text();
      if (!res.ok) throw new Error(formatHttpError(res.status, raw, platform));
      const data = JSON.parse(raw) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
      return { text, model, latencyMs: Date.now() - start };
    }

    if (platform === 'anthropic') {
      const res = await fetch(`${baseUrl}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
          'User-Agent': 'NX-AI-Autonomous-Agent/2.0',
        },
        body: JSON.stringify({
          model,
          max_tokens: 512,
          system: req.systemInstruction,
          messages: [{ role: 'user', content: req.prompt }],
        }),
        signal: AbortSignal.timeout(15_000),
      });
      const raw = await res.text();
      if (!res.ok) throw new Error(formatHttpError(res.status, raw, platform));
      const data = JSON.parse(raw) as { content?: Array<{ text?: string }> };
      const text = data.content?.map((c) => c.text || '').join('') || '';
      return { text, model, latencyMs: Date.now() - start };
    }

    // OpenAI-compatible chat completions (openai, groq, openrouter, deepseek)
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
      'User-Agent': 'NX-AI-Autonomous-Agent/2.0',
    };
    if (platform === 'openrouter') {
      headers['X-Title'] = 'NX AI Autonomous Windows Agent';
    }
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: req.systemInstruction },
          { role: 'user', content: req.prompt },
        ],
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const raw = await res.text();
    if (!res.ok) throw new Error(formatHttpError(res.status, raw, platform));
    const data = JSON.parse(raw) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = data.choices?.[0]?.message?.content || '';
    return { text, model, latencyMs: Date.now() - start };
  }

  async healthCheck(
    model = 'gemini-4-hydrogen',
    explicitApiKey?: string
  ): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
    const client = this.createClient(explicitApiKey);
    if (!client) {
      return {
        ok: false,
        latencyMs: 0,
        error: 'API key is not configured for this profile or server environment.',
      };
    }

    const start = Date.now();
    try {
      await client.models.generateContent({
        model,
        contents: 'Health check. Respond strictly with: OK',
      });
      return { ok: true, latencyMs: Date.now() - start };
    } catch (err: unknown) {
      return {
        ok: false,
        latencyMs: Date.now() - start,
        error: err instanceof Error ? err.message : 'Unknown provider error',
      };
    }
  }

  async verifyPlatformAndModels(
    platform: AIPlatformId,
    preferredModel?: string,
    explicitApiKey?: string,
    baseUrlOverride?: string
  ): Promise<PlatformVerificationResult> {
    const started = Date.now();
    const discovery = await this.discoverPlatformModels(platform, explicitApiKey, baseUrlOverride);
    const detailsMap = new Map<string, DiscoveredModelMeta>();

    for (const d of discovery.modelDetails || []) {
      detailsMap.set(d.modelId, d);
    }
    for (const mId of discovery.models) {
      if (!detailsMap.has(mId)) {
        detailsMap.set(mId, inferCapabilitiesFromModel(platform, mId));
      }
    }
    const discoveredModels =
      detailsMap.size > 0 ? Array.from(detailsMap.keys()) : discovery.models;

    const fallbackModel = preferredModel || AI_PLATFORMS[platform].defaultModel;
    if (!discovery.ok && discovery.error && /401|403|unauthenticated|api key/i.test(discovery.error)) {
      return {
        ok: false,
        discoveredModels: [],
        verifiedModels: [],
        modelChecks: [],
        activeModel: fallbackModel,
        latencyMs: discovery.latencyMs || Date.now() - started,
        error: discovery.error,
      };
    }

    const textEligibleIds = Array.from(detailsMap.values())
      .filter((m) => m.capabilities.text && !m.deprecated)
      .map((m) => m.modelId);

    const probeTargets = Array.from(
      new Set(
        textEligibleIds.length > 0
          ? [
              ...(preferredModel && textEligibleIds.includes(preferredModel) ? [preferredModel] : []),
              ...textEligibleIds.slice(0, 3),
            ].slice(0, 3)
          : [fallbackModel]
      )
    );

    const probeTargetSet = new Set(probeTargets);
    const modelChecks: ModelCheckOutcome[] = [];
    const verifiedModels: string[] = [];
    let lastError = discovery.error;
    let firstLatency: number | null = null;

    // 1. Adaptive verification on selected candidates + classification of remaining discovered models
    for (const meta of detailsMap.values()) {
      const testedAt = Date.now();
      if (meta.deprecated) {
        modelChecks.push({
          meta,
          status: 'DEPRECATED',
          verification: { authPassed: true, generationPassed: false, latencyMs: null, testedAt },
        });
        continue;
      }
      if (!meta.capabilities.text) {
        modelChecks.push({
          meta,
          status: 'NOT_SUPPORTED',
          verification: {
            authPassed: true,
            generationPassed: false,
            latencyMs: null,
            testedAt,
            error: 'Adaptive verification skipped chat completion on non-text model (embedding/audio/image).',
          },
        });
        continue;
      }
      if (!probeTargetSet.has(meta.modelId)) {
        modelChecks.push({
          meta,
          status: 'UNAVAILABLE',
          verification: {
            authPassed: true,
            generationPassed: false,
            latencyMs: null,
            testedAt,
            error: 'Discovered in catalog; queued for on-demand probe.',
          },
        });
        continue;
      }

      // Run adaptive generation test (+ structured JSON test for primary model)
      try {
        let genLatency = 0;
        let structuredPassed: boolean | undefined;
        if (platform === 'google_gemini' && !baseUrlOverride) {
          const chk = await this.healthCheck(meta.modelId, explicitApiKey);
          if (!chk.ok) throw new Error(chk.error || 'Health check failed');
          genLatency = chk.latencyMs;
        } else {
          const gen = await this.generateForPlatform(
            platform,
            {
              prompt: 'Health verification probe. Respond strictly with: OK',
              systemInstruction: 'You are a terse model health verifier.',
              model: meta.modelId,
              apiKey: explicitApiKey,
            },
            baseUrlOverride
          );
          genLatency = gen.latencyMs;
          // Adaptive structured JSON capability probe on primary candidate
          if (meta.capabilities.structuredOutput && meta.modelId === probeTargets[0]) {
            try {
              const sRes = await this.generateForPlatform(
                platform,
                {
                  prompt: 'Return JSON strictly: {"ok":true}',
                  systemInstruction: 'Respond only in valid JSON.',
                  model: meta.modelId,
                  apiKey: explicitApiKey,
                },
                baseUrlOverride
              );
              const jsonText = sRes.text.replace(/```json|```/gi, '').trim();
              const parsedJson = JSON.parse(jsonText) as Record<string, unknown>;
              structuredPassed = Boolean(parsedJson && typeof parsedJson === 'object' && 'ok' in parsedJson);
            } catch {
              structuredPassed = false;
            }
          }
        }

        const status: ModelVerificationStatus =
          structuredPassed === false ? 'PARTIALLY_VERIFIED' : 'VERIFIED';
        verifiedModels.push(meta.modelId);
        if (firstLatency === null) firstLatency = genLatency;
        modelChecks.push({
          meta,
          status,
          verification: {
            authPassed: true,
            generationPassed: true,
            structuredOutputPassed: structuredPassed,
            latencyMs: genLatency,
            testedAt: Date.now(),
          },
        });
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : 'Model verification failed';
        lastError = errMsg;
        modelChecks.push({
          meta,
          status: 'FAILED',
          verification: {
            authPassed: !/401|403|unauthenticated/i.test(errMsg),
            generationPassed: false,
            latencyMs: null,
            testedAt: Date.now(),
            error: errMsg,
          },
        });
      }
    }

    // Handle case where catalog returned empty models (e.g. direct fallback probe without catalog)
    if (detailsMap.size === 0) {
      const testedAt = Date.now();
      const meta = inferCapabilitiesFromModel(platform, fallbackModel);
      try {
        let genLatency = 0;
        if (platform === 'google_gemini' && !baseUrlOverride) {
          const chk = await this.healthCheck(fallbackModel, explicitApiKey);
          if (!chk.ok) throw new Error(chk.error || 'Health check failed');
          genLatency = chk.latencyMs;
        } else {
          const gen = await this.generateForPlatform(
            platform,
            {
              prompt: 'Health verification probe. Respond strictly with: OK',
              systemInstruction: 'You are a terse model health verifier.',
              model: fallbackModel,
              apiKey: explicitApiKey,
            },
            baseUrlOverride
          );
          genLatency = gen.latencyMs;
        }
        verifiedModels.push(fallbackModel);
        firstLatency = genLatency;
        modelChecks.push({
          meta,
          status: 'VERIFIED',
          verification: { authPassed: true, generationPassed: true, latencyMs: genLatency, testedAt },
        });
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : 'Model verification failed';
        lastError = errMsg;
        modelChecks.push({
          meta,
          status: 'FAILED',
          verification: {
            authPassed: !/401|403|unauthenticated/i.test(errMsg),
            generationPassed: false,
            latencyMs: null,
            testedAt,
            error: errMsg,
          },
        });
      }
    }

    const ok = verifiedModels.length > 0;
    return {
      ok,
      discoveredModels,
      verifiedModels,
      modelChecks,
      activeModel: verifiedModels[0] || discoveredModels[0] || fallbackModel,
      latencyMs: firstLatency ?? Math.max(discovery.latencyMs, Date.now() - started),
      error: ok ? undefined : lastError || 'No discovered models passed live verification.',
    };
  }
}
