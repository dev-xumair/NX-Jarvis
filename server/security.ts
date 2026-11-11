export interface ScrubResult {
  cleanText: string;
  hadSecrets: boolean;
  redactedCategories: string[];
}

export function scrubSecrets(input: string): ScrubResult {
  let hadSecrets = false;
  const redactedCategories: string[] = [];

  const secretPatterns: Array<{ name: string; pattern: RegExp; replaceWith: string }> = [
    { name: 'Password', pattern: /(password\s*(?:is|[:=])\s*)([^\s,]+)/gi, replaceWith: '$1[REDACTED_SECRET]' },
    { name: 'API Key', pattern: /(api[_\s]?key\s*(?:is|[:=])\s*)([^\s,]+)/gi, replaceWith: '$1[REDACTED_SECRET]' },
    { name: 'Bearer Token', pattern: /(bearer\s+)([A-Za-z0-9_\-\.]{20,})/gi, replaceWith: '$1[REDACTED_SECRET]' },
    { name: 'Secret', pattern: /(secret\s*(?:is|[:=])\s*)([^\s,]+)/gi, replaceWith: '$1[REDACTED_SECRET]' },
    { name: 'PIN', pattern: /(pin\s*(?:is|[:=])\s*)(\d{4,6})/gi, replaceWith: '$1[REDACTED_SECRET]' },
    { name: 'OTP', pattern: /(otp\s*(?:is|[:=])\s*)(\d{4,8})/gi, replaceWith: '$1[REDACTED_SECRET]' },
    { name: 'CNIC', pattern: /(\b\d{5}-\d{7}-\d{1}\b)/g, replaceWith: '[REDACTED_CNIC]' },
    { name: 'Credit Card', pattern: /(\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13})\b)/g, replaceWith: '[REDACTED_CARD]' },
  ];

  let cleaned = input;
  for (const { name, pattern, replaceWith } of secretPatterns) {
    if (pattern.test(cleaned)) {
      hadSecrets = true;
      redactedCategories.push(name);
      cleaned = cleaned.replace(pattern, replaceWith);
    }
  }

  return { cleanText: cleaned, hadSecrets, redactedCategories };
}
