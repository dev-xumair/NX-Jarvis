/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'path';
import type { PolicyRiskClass, RiskLevel } from '../../types/agent.ts';

export interface SecretScrubResult {
  cleanText: string;
  hadSecrets: boolean;
  redactedCategories: string[];
}

export interface PolicyEvaluation {
  allowed: boolean;
  riskLevel: RiskLevel;
  riskClass: PolicyRiskClass;
  requiresConfirmation: boolean;
  reason?: string;
  ruleId: string;
}

export interface ActionRiskClassification {
  riskClass: PolicyRiskClass;
  riskLevel: RiskLevel;
  allowed: boolean;
  requiresConfirmation: boolean;
  ruleId: string;
  reason?: string;
  intent: string;
  routeTarget?:
    | 'customer-worker'
    | 'provider-vault'
    | 'storage-worker'
    | 'windows-worker'
    | 'browser-worker'
    | 'media-worker'
    | 'adb-worker'
    | 'memory-engine'
    | 'model-gateway'
    | 'capability-registry'
    | 'telemetry-adapter';
  isNegatedSecurityRequest: boolean;
  isSecretExfiltration: boolean;
}

export interface PathSafetyCheck {
  safe: boolean;
  resolvedPath: string;
  code?: 'PATH_TRAVERSAL_BLOCKED' | 'PROTECTED_OS_PATH' | 'INVALID_PATH';
  reason?: string;
}

const PROTECTED_POSIX_ROOTS = ['/etc', '/usr', '/bin', '/sbin', '/boot', '/root', '/sys', '/proc', '/dev'];

export function sanitizeSafePath(rawPath: string, allowedBaseDir?: string): PathSafetyCheck {
  if (!rawPath || typeof rawPath !== 'string' || rawPath.includes('\0')) {
    return {
      safe: false,
      resolvedPath: '',
      code: 'INVALID_PATH',
      reason: 'Path is empty or contains null bytes.',
    };
  }

  const trimmed = rawPath.trim();
  const normalizedSegments = trimmed.replace(/\\/g, '/').split('/');
  if (normalizedSegments.includes('..') && !allowedBaseDir) {
    return {
      safe: false,
      resolvedPath: trimmed,
      code: 'PATH_TRAVERSAL_BLOCKED',
      reason: 'Parent directory traversal ("..") is blocked outside an explicit sandbox root.',
    };
  }

  const resolved = path.resolve(trimmed);
  const resolvedPosix = resolved.replace(/\\/g, '/');

  if (allowedBaseDir) {
    const baseResolved = path.resolve(allowedBaseDir);
    if (resolved !== baseResolved && !resolved.startsWith(`${baseResolved}${path.sep}`)) {
      return {
        safe: false,
        resolvedPath: resolved,
        code: 'PATH_TRAVERSAL_BLOCKED',
        reason: `Resolved path "${resolved}" escapes allowed sandbox boundary "${baseResolved}".`,
      };
    }
  }

  if (/^[a-z]:[\\/]?$/i.test(trimmed) && trimmed.toUpperCase().startsWith('C:')) {
    return {
      safe: false,
      resolvedPath: resolved,
      code: 'PROTECTED_OS_PATH',
      reason: 'Direct C:\\ OS volume root access is protected.',
    };
  }

  if (
    /^c:[\\/](windows|program files|programdata|users[\\/][^\\/]+[\\/]appdata)/i.test(trimmed) ||
    PROTECTED_POSIX_ROOTS.some((root) => resolvedPosix === root || resolvedPosix.startsWith(`${root}/`))
  ) {
    return {
      safe: false,
      resolvedPath: resolved,
      code: 'PROTECTED_OS_PATH',
      reason: `System path "${resolved}" is permanently protected by PolicyEngine.`,
    };
  }

  return { safe: true, resolvedPath: resolved };
}

export function scrubSecrets(input: string): SecretScrubResult {
  if (!input || typeof input !== 'string') {
    return { cleanText: '', hadSecrets: false, redactedCategories: [] };
  }

  let hadSecrets = false;
  const categories = new Set<string>();
  let cleaned = input;

  // 1. Pakistani CNIC (XXXXX-XXXXXXX-X)
  if (/\b\d{5}-\d{7}-\d{1}\b/.test(cleaned)) {
    hadSecrets = true;
    categories.add('CNIC');
    cleaned = cleaned.replace(/\b\d{5}-\d{7}-\d{1}\b/g, '[REDACTED_SECRET]');
  }

  // 2. Google API Keys / OpenAI-style tokens / Bearer tokens
  if (/\bAIza[0-9A-Za-z\-_]{12,}\b/.test(cleaned)) {
    hadSecrets = true;
    categories.add('GOOGLE_API_KEY');
    cleaned = cleaned.replace(/\bAIza[0-9A-Za-z\-_]{12,}\b/g, '[REDACTED_SECRET]');
  }

  if (/\bsk-[0-9A-Za-z\-_]{8,}\b/.test(cleaned)) {
    hadSecrets = true;
    categories.add('API_TOKEN');
    cleaned = cleaned.replace(/\bsk-[0-9A-Za-z\-_]{8,}\b/g, '[REDACTED_SECRET]');
  }

  if (/\bBearer\s+[A-Za-z0-9\-._~+/]+=*/i.test(cleaned)) {
    hadSecrets = true;
    categories.add('BEARER_TOKEN');
    cleaned = cleaned.replace(/\bBearer\s+[A-Za-z0-9\-._~+/]+=*/gi, 'Bearer [REDACTED_SECRET]');
  }

  // 3. Key-value credentials (password, api_key, secret, pin, otp, token)
  const kvPatterns: Array<{ label: string; regex: RegExp }> = [
    { label: 'PASSWORD', regex: /(password\s*[:=]\s*)([^\s,;]+)/gi },
    { label: 'API_KEY', regex: /(api[_\s-]?key\s*[:=]\s*)([^\s,;]+)/gi },
    { label: 'SECRET', regex: /(secret\s*[:=]\s*)([^\s,;]+)/gi },
    { label: 'TOKEN', regex: /(token\s*[:=]\s*)([^\s,;]+)/gi },
    { label: 'PIN', regex: /(pin\s*[:=]\s*)(\d{4,8})/gi },
    { label: 'OTP', regex: /(otp\s*[:=]\s*)(\d{4,8})/gi },
  ];

  for (const { label, regex } of kvPatterns) {
    if (regex.test(cleaned)) {
      hadSecrets = true;
      categories.add(label);
      cleaned = cleaned.replace(new RegExp(regex.source, 'gi'), '$1[REDACTED_SECRET]');
    }
  }

  // 4. Payment card numbers (13-16 digits standard Visa/MC/Amex)
  if (/\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13})\b/.test(cleaned)) {
    hadSecrets = true;
    categories.add('PAYMENT_CARD');
    cleaned = cleaned.replace(
      /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13})\b/g,
      '[REDACTED_SECRET]'
    );
  }

  return {
    cleanText: cleaned,
    hadSecrets,
    redactedCategories: Array.from(categories),
  };
}

export function isDestructiveSystemTarget(commandText: string): boolean {
  const normalized = commandText.toLowerCase();
  const targetsOsDrive =
    /\bc:[\\/]/.test(normalized) ||
    /(?:^|[\s"'=(])c:(?=$|[\s\\/"')])/i.test(normalized) ||
    normalized.includes('c drive') ||
    /\brm\s+-rf\s+\/(\s|$|\*)/.test(normalized) ||
    normalized.includes('system32') ||
    normalized.includes('windows folder');

  const hasDestructiveVerb =
    /\b(delete|format|remove|wipe|erase|destroy|rm|del|rd|rmdir|clean|purge|mkfs)\b/.test(
      normalized
    );

  return targetsOsDrive && hasDestructiveVerb;
}

export function hasShellInjectionVector(commandText: string): boolean {
  return (
    /(?:&&|\|\||;|\|)\s*(rm|del|format|powershell|cmd|curl|wget|nc|bash|sh)\b/i.test(commandText) ||
    /\$\([^)]*\)/.test(commandText) ||
    /`[^`]+`/.test(commandText)
  );
}

export function isNegatedSecurityInstruction(commandText: string): boolean {
  const lower = commandText.toLowerCase();
  const hasNegation =
    /\b(do\s+not|don'?t|never|mat|nahi|na|hide|mask|redact|protect|keep\s+secret|chupa|chhupa)\b/i.test(lower);
  const mentionsSensitive =
    /\b(api[_\s-]?key|api[_\s-]?keys|password|passwords|secret|secrets|token|tokens|cnic|otp|pin|plaintext|plain\s*text)\b/i.test(
      lower
    );
  const asksToShowNegated =
    hasNegation &&
    /\b(show|expose|reveal|print|display|leak|log|share|batao|dikhao)\b/i.test(lower) &&
    mentionsSensitive;
  const securityRule =
    /\b(mask|redact|never\s+expose|never\s+show|do\s+not\s+show|don'?t\s+show|do\s+not\s+reveal|keep\s+private)\b/i.test(
      lower
    ) && mentionsSensitive;
  return asksToShowNegated || securityRule;
}

export function isSecretExfiltrationAttempt(commandText: string): boolean {
  if (isNegatedSecurityInstruction(commandText)) return false;
  const lower = commandText.toLowerCase();
  const asksToDumpOrReveal =
    /\b(dump|export\s+all|show\s+all|reveal\s+all|print|extract|leak|send|upload|email)\b/i.test(lower) ||
    /\b(show|print|display)\s+(?:my|the|all)?\s*(api[_\s-]?key|api[_\s-]?keys|password|passwords|secret|secrets|otp|pin)\b/i.test(
      lower
    );
  const targetsSecrets =
    /\b(plaintext|plain\s*text|all\s+cnic|all\s+cnics|all\s+customer\s+passwords|api[_\s-]?key|api[_\s-]?keys|password|passwords|secret|secrets|otp|pin|vault\s+keys)\b/i.test(
      lower
    );
  return asksToDumpOrReveal && targetsSecrets;
}

export function classifyActionRisk(
  commandText: string,
  options: { hadRawSecrets?: boolean; operatingMode?: 'OWNER_PRIVATE' | 'CUSTOMER_SAFE' } = {}
): ActionRiskClassification {
  const lower = commandText.trim().toLowerCase();
  const negated = isNegatedSecurityInstruction(commandText);
  const exfiltration = isSecretExfiltrationAttempt(commandText);

  if (isDestructiveSystemTarget(commandText)) {
    return {
      riskClass: 'R5_DESTRUCTIVE',
      riskLevel: 'BLOCKED',
      allowed: false,
      requiresConfirmation: false,
      ruleId: 'POL-OS-DRIVE-GUARD',
      reason: 'System OS volume (C: / root) is permanently protected against format, wipe, or deletion commands.',
      intent: 'DESTRUCTIVE_OS_BLOCKED',
      isNegatedSecurityRequest: false,
      isSecretExfiltration: false,
    };
  }

  if (hasShellInjectionVector(commandText)) {
    return {
      riskClass: 'R5_DESTRUCTIVE',
      riskLevel: 'BLOCKED',
      allowed: false,
      requiresConfirmation: false,
      ruleId: 'POL-COMMAND-INJECTION',
      reason: 'Chained shell metacharacters or subshell injection syntax blocked by PolicyEngine.',
      intent: 'COMMAND_INJECTION_BLOCKED',
      isNegatedSecurityRequest: false,
      isSecretExfiltration: false,
    };
  }

  if (/\b(disable\s+defender|disable\s+antivirus|disable\s+firewall|bypass\s+otp|bypass\s+captcha)\b/i.test(lower)) {
    return {
      riskClass: 'R5_DESTRUCTIVE',
      riskLevel: 'BLOCKED',
      allowed: false,
      requiresConfirmation: false,
      ruleId: 'POL-SECURITY-CONTROLS',
      reason: 'Disabling security controls or bypassing OTP/CAPTCHA protections is prohibited.',
      intent: 'SECURITY_BYPASS_BLOCKED',
      isNegatedSecurityRequest: false,
      isSecretExfiltration: false,
    };
  }

  if (exfiltration) {
    return {
      riskClass: 'R5_DESTRUCTIVE',
      riskLevel: 'BLOCKED',
      allowed: false,
      requiresConfirmation: false,
      ruleId: 'POL-SECRET-EXFILTRATION',
      reason: 'Plaintext export, dumping, or unmasked disclosure of stored API keys, passwords, or sensitive customer secrets is blocked by PolicyEngine.',
      intent: 'SECRET_EXFILTRATION_BLOCKED',
      isNegatedSecurityRequest: false,
      isSecretExfiltration: true,
    };
  }

  if (negated) {
    return {
      riskClass: 'R0_INFORMATIONAL',
      riskLevel: 'READ_ONLY',
      allowed: true,
      requiresConfirmation: false,
      ruleId: 'POL-NEGATED-SECURITY-RULE',
      intent: 'SECURITY_PREFERENCE_ACK',
      routeTarget: 'memory-engine',
      isNegatedSecurityRequest: true,
      isSecretExfiltration: false,
    };
  }

  if (/\b(format|wipe|shutdown|restart|reboot|delete\s+all)\b/i.test(lower)) {
    return {
      riskClass: 'R5_DESTRUCTIVE',
      riskLevel: 'DESTRUCTIVE_CONFIRM',
      allowed: true,
      requiresConfirmation: true,
      ruleId: 'POL-DESTRUCTIVE-CONFIRM',
      reason: 'This operation is destructive or alters system power state and requires explicit confirmation.',
      intent: 'SYSTEM_POWER_OR_WIPE',
      isNegatedSecurityRequest: false,
      isSecretExfiltration: false,
    };
  }

  // R4: Legitimate encrypted customer record workflow or API key vault workflow
  const isCustomerWorkflow =
    /\b(customer|client|cnic|imei|warranty|repair\s+note|repair\s+notes|service\s+history|customer\s+record|grahak)\b/i.test(
      lower
    );
  if (isCustomerWorkflow) {
    const isDeleteCustomer = /\b(delete|remove|erase)\s+(?:the\s+)?customer\b/i.test(lower);
    const isMutatingCustomer = /\b(save|add|create|update|edit|archive|store|likho|banao|karo)\b/i.test(lower);
    return {
      riskClass: 'R4_SENSITIVE_DATA',
      riskLevel: isDeleteCustomer ? 'HIGH_IMPACT_CONFIRM' : isMutatingCustomer ? 'SAFE_REVERSIBLE' : 'READ_ONLY',
      allowed: true,
      requiresConfirmation: isDeleteCustomer,
      ruleId: 'POL-R4-CUSTOMER-VAULT',
      reason: isDeleteCustomer
        ? 'Deleting a customer record permanently removes it after confirmation (or archive instead).'
        : undefined,
      intent: isMutatingCustomer ? 'CUSTOMER_VAULT_WRITE' : 'CUSTOMER_VAULT_READ',
      routeTarget: 'customer-worker',
      isNegatedSecurityRequest: false,
      isSecretExfiltration: false,
    };
  }

  const isKeyAddWorkflow =
    /\b(add|save|configure|store|validate|test|check)\s+(?:an?\s+|my\s+|the\s+)?(api[_\s-]?key|provider\s+key|gemini\s+key|openai\s+key)\b/i.test(
      lower
    ) || options.hadRawSecrets;
  if (isKeyAddWorkflow) {
    return {
      riskClass: 'R4_SENSITIVE_DATA',
      riskLevel: 'SAFE_REVERSIBLE',
      allowed: true,
      requiresConfirmation: false,
      ruleId: 'POL-R4-KEY-VAULT',
      intent: 'PROVIDER_KEY_VAULT_ROUTE',
      routeTarget: 'provider-vault',
      isNegatedSecurityRequest: false,
      isSecretExfiltration: false,
    };
  }

  if (/\b(eject)\b/i.test(lower)) {
    return {
      riskClass: 'R2_REVERSIBLE_WRITE',
      riskLevel: 'SAFE_REVERSIBLE',
      allowed: true,
      requiresConfirmation: false,
      ruleId: 'POL-STORAGE-EJECT',
      intent: 'STORAGE_EJECT',
      routeTarget: 'storage-worker',
      isNegatedSecurityRequest: false,
      isSecretExfiltration: false,
    };
  }

  if (/\b(copy|move|transfer|install|write|create|mkdir|folder|rename|save\s+file|banao|folder\s+banao|file\s+banao)\b/i.test(lower)) {
    return {
      riskClass: 'R2_REVERSIBLE_WRITE',
      riskLevel: 'SAFE_REVERSIBLE',
      allowed: true,
      requiresConfirmation: false,
      ruleId: 'POL-R2-REVERSIBLE-WRITE',
      intent: 'FILESYSTEM_OR_SAFE_WRITE',
      routeTarget: 'storage-worker',
      isNegatedSecurityRequest: false,
      isSecretExfiltration: false,
    };
  }

  if (/\b(chrome|browser|youtube|open\s+url|website|search\s+web)\b/i.test(lower)) {
    return {
      riskClass: 'R3_EXTERNAL_ACCOUNT',
      riskLevel: 'SAFE_REVERSIBLE',
      allowed: true,
      requiresConfirmation: false,
      ruleId: 'POL-R3-BROWSER',
      intent: 'BROWSER_AUTOMATION',
      routeTarget: 'browser-worker',
      isNegatedSecurityRequest: false,
      isSecretExfiltration: false,
    };
  }

  if (/\b(song|music|audio|media|play|gaana|mp3|video|playlist|player)\b/i.test(lower)) {
    return {
      riskClass: 'R2_REVERSIBLE_WRITE',
      riskLevel: 'SAFE_REVERSIBLE',
      allowed: true,
      requiresConfirmation: false,
      ruleId: 'POL-R2-MEDIA',
      intent: 'MEDIA_SCAN_OR_PLAY',
      routeTarget: 'media-worker',
      isNegatedSecurityRequest: false,
      isSecretExfiltration: false,
    };
  }

  if (/\b(what\s+can\s+you\s+do|capabilities|your\s+skills|kya\s+kya\s+kar\s+sakte|features)\b/i.test(lower)) {
    return {
      riskClass: 'R0_INFORMATIONAL',
      riskLevel: 'READ_ONLY',
      allowed: true,
      requiresConfirmation: false,
      ruleId: 'POL-R0-CAPABILITIES',
      intent: 'CAPABILITY_INQUIRY',
      routeTarget: 'capability-registry',
      isNegatedSecurityRequest: false,
      isSecretExfiltration: false,
    };
  }

  return {
    riskClass: 'R1_READ_ONLY',
    riskLevel: 'READ_ONLY',
    allowed: true,
    requiresConfirmation: false,
    ruleId: 'POL-READ-ONLY',
    intent: 'GENERAL_OR_READ_ONLY',
    isNegatedSecurityRequest: false,
    isSecretExfiltration: false,
  };
}

export function evaluateCommandPolicy(prompt: string): PolicyEvaluation {
  const c = classifyActionRisk(prompt);
  return {
    allowed: c.allowed,
    riskLevel: c.riskLevel,
    riskClass: c.riskClass,
    requiresConfirmation: c.requiresConfirmation,
    reason: c.reason,
    ruleId: c.ruleId,
  };
}

const COMPOUND_ACTION_VERBS =
  /^(?:check|inspect|open|launch|start|play|scan|list|create|make|mkdir|rename|save|add|search|find|lookup|tell|what|show|do|don't|dont|never|mask|switch|turn|set|banao|kholo|chalao|dikhao|batao|save\s+karo|karo)\b/i;

export function decomposeMultiTaskPrompt(prompt: string): string[] {
  const trimmed = prompt.trim();
  if (!trimmed) return [];

  // Do NOT split dangerous shell injection payloads so PolicyEngine rejects them atomically
  if (hasShellInjectionVector(trimmed)) {
    return [trimmed];
  }

  // First split explicit newline or numbered lists or semicolons
  const roughSegments = trimmed
    .split(/(?:\r?\n+|;+|\s+\d+\.\s+)/)
    .map((s) => s.replace(/^\d+\.\s*/, '').trim())
    .filter(Boolean);

  const finalSegments: string[] = [];
  for (const seg of roughSegments) {
    // Only split on ", and then " / " and then " / ", phir " / ", and <action verb>" when clearly two independent tasks
    const parts = seg
      .split(/\s*(?:,\s*and\s+then|\s+and\s+then|,\s*phir|\s+phir|,\s*and\s+(?=[a-z]))\s*/i)
      .map((p) => p.trim())
      .filter(Boolean);

    if (parts.length > 1) {
      // Merge short fragments that are NOT standalone action clauses (e.g. "check cpu, and ram")
      const merged: string[] = [];
      for (const p of parts) {
        if (merged.length > 0 && !COMPOUND_ACTION_VERBS.test(p) && p.split(/\s+/).length <= 3) {
          merged[merged.length - 1] = `${merged[merged.length - 1]} and ${p}`;
        } else {
          merged.push(p);
        }
      }
      finalSegments.push(...merged);
    } else {
      // Also check ", don't ..." / ", do not ..." / ", create ..." / ", save ..." separated by comma
      const commaParts = seg
        .split(/,\s+(?=(?:do\s+not|don'?t|never|create|make|save|check|open|play|search|switch|turn|set|and\s+(?:save|create|check|open|play|do\s+not|don'?t)))/i)
        .map((p) => p.replace(/^and\s+/i, '').trim())
        .filter(Boolean);
      if (commaParts.length > 1 && commaParts.every((p) => p.length >= 4)) {
        finalSegments.push(...commaParts);
      } else {
        finalSegments.push(seg);
      }
    }
  }

  return finalSegments.length > 0 ? finalSegments : [trimmed];
}
