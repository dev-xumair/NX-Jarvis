/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();

const BANNED_PATHS = [
  'src/services',
  'src/components/avatar',
  'src/components/companion',
  'src/services/characterSeatManager.ts',
  'public/assets/character',
  'src/assets/images',
  'scripts/extract_character_slices.ts',
  'tests/character_subsystem.test.ts',
];

const BANNED_PATTERNS: Array<{ label: string; regex: RegExp; skipFiles?: RegExp }> = [
  { label: 'Avatar3DStage reference', regex: /\bAvatar3DStage\b/ },
  { label: 'DesktopCompanion reference', regex: /\bDesktopCompanion\b/ },
  { label: 'characterSeatManager reference', regex: /\bcharacterSeatManager\b/ },
  { label: 'Canonical character assets path', regex: /public\/assets\/character/ },
  { label: '/api/companion route', regex: /\/api\/companion/ },
  { label: 'Obsolete Saba persona', regex: /\bsaba\b/i },
  { label: 'Obsolete Pushpa reference', regex: /\bpushpa\b/i },
  { label: 'Obsolete NX-Jarvis branding', regex: /\bNX-Jarvis\b/i },
  { label: 'Template placeholder react-example', regex: /\breact-example\b/i },
  { label: 'Hardcoded Samsung A54 mock device', regex: /Samsung A54/i },
  { label: 'Hardcoded LAN IP mock', regex: /192\.168\.1\.108/ },
  { label: 'Hardcoded fake click coordinates', regex: /\(420,\s*72\)/ },
  { label: 'Fixed 1920px width layout', regex: /w-\[1920px\]/ },
  { label: 'Blocked browser window.alert', regex: /\bwindow\.alert\s*\(/ },
  { label: 'Blocked browser window.open', regex: /\bwindow\.open\s*\(/ },
  { label: 'Removed dependency three/sharp', regex: /"(three|@types\/three|sharp)"/ },
  { label: 'Deprecated Gemini 1.5/2.0 model', regex: /gemini-(1\.5|2\.0)/i },
  { label: 'Placeholder Live2D/VRM code', regex: /\b(live2d|cubism)\b/i },
  { label: 'Legacy DevX_NX Shop residue', regex: /DevX_NX Shop/i },
  { label: 'aistudio residue', regex: /aistudio/i },
];

function collectFiles(targetRelPath: string, out: string[]): void {
  const full = path.join(ROOT, targetRelPath);
  if (!fs.existsSync(full)) return;
  const stat = fs.statSync(full);
  if (stat.isFile()) {
    out.push(targetRelPath);
    return;
  }
  for (const entry of fs.readdirSync(full)) {
    if (entry === 'node_modules' || entry === 'dist' || entry === '.aistudio') continue;
    collectFiles(path.posix.join(targetRelPath, entry), out);
  }
}

const failures: string[] = [];

for (const bannedPath of BANNED_PATHS) {
  if (fs.existsSync(path.join(ROOT, bannedPath))) {
    failures.push(`Banned legacy path still exists: ${bannedPath}`);
  }
}

const filesToScan: string[] = [];
for (const target of [
  'src',
  'server.ts',
  'electron-main.cjs',
  'electron-preload.cjs',
  'package.json',
  'index.html',
  'data/nx_database.json',
  'run_windows_agent.bat',
  'run_windows_agent_silent.vbs',
  'metadata.json',
  'docs',
  'README.md',
]) {
  collectFiles(target, filesToScan);
}

for (const rel of filesToScan) {
  const content = fs.readFileSync(path.join(ROOT, rel), 'utf-8');
  for (const rule of BANNED_PATTERNS) {
    if (rule.skipFiles && rule.skipFiles.test(rel)) continue;
    if (rule.regex.test(content)) {
      failures.push(`[${rel}] matched forbidden pattern: ${rule.label}`);
    }
  }
}

const telemetryFile = path.join(ROOT, 'src/adapters/system/telemetryAdapter.ts');
if (fs.existsSync(telemetryFile)) {
  const telemetrySrc = fs.readFileSync(telemetryFile, 'utf-8');
  if (/Math\.random\s*\(/.test(telemetrySrc)) {
    failures.push('[src/adapters/system/telemetryAdapter.ts] contains Math.random()');
  }
}

const dbFile = path.join(ROOT, 'data/nx_database.json');
if (fs.existsSync(dbFile)) {
  const dbSrc = fs.readFileSync(dbFile, 'utf-8');
  if (/\b(AIza[0-9A-Za-z\-_]{12,}|sk-[0-9A-Za-z\-_]{10,})\b/.test(dbSrc)) {
    failures.push('[data/nx_database.json] contains unencrypted plaintext API key residue');
  }
}

if (failures.length > 0) {
  console.error(`HYGIENE CHECK FAILED (${failures.length} issue(s)):`);
  for (const f of failures) {
    console.error(` - ${f}`);
  }
  process.exit(1);
}

console.log(`HYGIENE CHECK PASSED: Scanned ${filesToScan.length} files with 0 violations.`);
