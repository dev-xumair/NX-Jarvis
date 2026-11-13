/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CustomThemeConfig } from '../types/agent.ts';

export const NX_THEME_PRESETS: CustomThemeConfig[] = [
  {
    id: 'nx-graphite',
    name: 'NX Graphite',
    mode: 'dark',
    accentColor: '#38bdf8',
    secondaryAccent: '#0ea5e9',
    bgCanvas: '#0c1017',
    surfaceColor: '#141b24',
    surfaceElevated: '#1b2431',
    textColor: '#f1f5f9',
    textMuted: '#94a3b8',
    borderColor: '#263345',
    density: 'comfortable',
    roundedRadius: '0.5rem',
    fontScale: 1,
    reducedMotion: false,
    highContrast: false,
  },
  {
    id: 'nx-midnight',
    name: 'NX Midnight',
    mode: 'oled',
    accentColor: '#818cf8',
    secondaryAccent: '#6366f1',
    bgCanvas: '#04060a',
    surfaceColor: '#0b0f17',
    surfaceElevated: '#121927',
    textColor: '#f8fafc',
    textMuted: '#94a3b8',
    borderColor: '#1e293b',
    density: 'comfortable',
    roundedRadius: '0.5rem',
    fontScale: 1,
    reducedMotion: false,
    highContrast: false,
  },
  {
    id: 'nx-light',
    name: 'NX Light',
    mode: 'light',
    accentColor: '#0284c7',
    secondaryAccent: '#0369a1',
    bgCanvas: '#f8fafc',
    surfaceColor: '#ffffff',
    surfaceElevated: '#f1f5f9',
    textColor: '#0f172a',
    textMuted: '#475569',
    borderColor: '#cbd5e1',
    density: 'comfortable',
    roundedRadius: '0.5rem',
    fontScale: 1,
    reducedMotion: false,
    highContrast: false,
  },
  {
    id: 'nx-slate',
    name: 'NX Slate',
    mode: 'dark',
    accentColor: '#22d3ee',
    secondaryAccent: '#06b6d4',
    bgCanvas: '#0f172a',
    surfaceColor: '#1e293b',
    surfaceElevated: '#273549',
    textColor: '#f1f5f9',
    textMuted: '#94a3b8',
    borderColor: '#334155',
    density: 'comfortable',
    roundedRadius: '0.5rem',
    fontScale: 1,
    reducedMotion: false,
    highContrast: false,
  },
  {
    id: 'nx-emerald',
    name: 'NX Emerald',
    mode: 'dark',
    accentColor: '#10b981',
    secondaryAccent: '#059669',
    bgCanvas: '#07100d',
    surfaceColor: '#0e1b16',
    surfaceElevated: '#14261f',
    textColor: '#ecfdf5',
    textMuted: '#86efac',
    borderColor: '#1f3a30',
    density: 'comfortable',
    roundedRadius: '0.5rem',
    fontScale: 1,
    reducedMotion: false,
    highContrast: false,
  },
  {
    id: 'nx-amber',
    name: 'NX Amber',
    mode: 'dark',
    accentColor: '#f59e0b',
    secondaryAccent: '#d97706',
    bgCanvas: '#110d07',
    surfaceColor: '#1a140b',
    surfaceElevated: '#241c10',
    textColor: '#fef3c7',
    textMuted: '#d6b67d',
    borderColor: '#3b2d18',
    density: 'comfortable',
    roundedRadius: '0.5rem',
    fontScale: 1,
    reducedMotion: false,
    highContrast: false,
  },
];

export const DEFAULT_NX_THEME: CustomThemeConfig = NX_THEME_PRESETS[0];

const SAFE_HEX_REGEX = /^#[0-9a-fA-F]{6}$/;
const ALLOWED_RADII = new Set(['0.25rem', '0.5rem', '0.75rem', '1rem']);

export function validateThemePatch(
  raw: unknown,
  current: CustomThemeConfig = DEFAULT_NX_THEME
): { valid: boolean; theme: CustomThemeConfig; errors: string[] } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { valid: false, theme: current, errors: ['Theme payload must be an object.'] };
  }

  const input = raw as Record<string, unknown>;
  const errors: string[] = [];
  const next: CustomThemeConfig = { ...current };

  if (typeof input.id === 'string' && /^[a-z0-9-_]{2,40}$/i.test(input.id)) {
    next.id = input.id;
  }
  if (typeof input.name === 'string' && input.name.trim().length > 0 && input.name.length <= 48) {
    next.name = input.name.trim().replace(/[<>]/g, '');
  }
  if (input.mode === 'dark' || input.mode === 'light' || input.mode === 'oled') {
    next.mode = input.mode;
  }

  const colorFields: Array<keyof CustomThemeConfig> = [
    'accentColor',
    'secondaryAccent',
    'bgCanvas',
    'surfaceColor',
    'surfaceElevated',
    'textColor',
    'textMuted',
    'borderColor',
  ];

  for (const field of colorFields) {
    const val = input[field];
    if (val !== undefined) {
      if (typeof val === 'string' && SAFE_HEX_REGEX.test(val.trim())) {
        (next as unknown as Record<string, unknown>)[field] = val.trim();
      } else {
        errors.push(`Invalid hex color for ${field}`);
      }
    }
  }

  if (input.density === 'compact' || input.density === 'comfortable') {
    next.density = input.density;
  }

  if (input.roundedRadius !== undefined) {
    if (typeof input.roundedRadius === 'string' && ALLOWED_RADII.has(input.roundedRadius)) {
      next.roundedRadius = input.roundedRadius;
    } else {
      errors.push('Invalid roundedRadius token');
    }
  }

  if (input.fontScale !== undefined) {
    const scale = Number(input.fontScale);
    if (Number.isFinite(scale) && scale >= 0.85 && scale <= 1.25) {
      next.fontScale = Number(scale.toFixed(2));
    } else {
      errors.push('fontScale must be between 0.85 and 1.25');
    }
  }

  if (typeof input.reducedMotion === 'boolean') next.reducedMotion = input.reducedMotion;
  if (typeof input.highContrast === 'boolean') next.highContrast = input.highContrast;

  return { valid: errors.length === 0, theme: next, errors };
}
