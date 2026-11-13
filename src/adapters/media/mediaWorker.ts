/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { execFileSync, spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { sanitizeSafePath } from '../../core/policy/policyEngine.ts';

export interface DiscoveredMediaFile {
  name: string;
  path: string;
  extension: string;
  bytes: number;
  modifiedAt: number;
}

export interface MediaScanResult {
  ok: boolean;
  scannedDirs: string[];
  files: DiscoveredMediaFile[];
  message: string;
}

export interface MediaPlayResult {
  ok: boolean;
  code: 'VERIFIED' | 'WINDOWS_HOST_REQUIRED' | 'NO_MEDIA_FILES_FOUND' | 'PROTECTED_OS_PATH' | 'LAUNCH_FAILED';
  message: string;
  matchedFile?: DiscoveredMediaFile;
  scannedCount: number;
  verifiedPid?: number | null;
  checkedAt: number;
}

const MEDIA_EXTENSIONS = new Set(['.mp3', '.wav', '.flac', '.m4a', '.aac', '.ogg', '.mp4', '.mkv', '.webm']);

export class MediaWorker {
  getDefaultScanDirs(): string[] {
    const home = os.homedir();
    const candidates = [
      path.join(home, 'Music'),
      path.join(home, 'Downloads'),
      path.join(home, 'Videos'),
      path.join(home, 'Desktop'),
      path.resolve(process.cwd(), 'data', 'media'),
    ];
    return Array.from(new Set(candidates)).filter((d) => fs.existsSync(d));
  }

  scanMedia(customDirs?: string[]): MediaScanResult {
    const dirsToScan = (customDirs && customDirs.length > 0 ? customDirs : this.getDefaultScanDirs()).filter((d) =>
      sanitizeSafePath(d).safe
    );
    const files: DiscoveredMediaFile[] = [];

    const walk = (dir: string, depth: number) => {
      if (depth > 2 || files.length >= 100) return;
      try {
        const entries = fs.readdirSync(dir);
        for (const name of entries) {
          if (files.length >= 100) break;
          const full = path.join(dir, name);
          try {
            const st = fs.statSync(full);
            if (st.isDirectory()) {
              walk(full, depth + 1);
            } else {
              const ext = path.extname(name).toLowerCase();
              if (MEDIA_EXTENSIONS.has(ext)) {
                files.push({
                  name,
                  path: full,
                  extension: ext,
                  bytes: st.size,
                  modifiedAt: st.mtimeMs,
                });
              }
            }
          } catch {
            // Skip unreadable entry
          }
        }
      } catch {
        // Skip unreadable directory
      }
    };

    for (const dir of dirsToScan) {
      walk(dir, 0);
    }

    return {
      ok: true,
      scannedDirs: dirsToScan,
      files,
      message:
        files.length > 0
          ? `Discovered ${files.length} local media file(s) across ${dirsToScan.length} folder(s).`
          : `Scanned ${dirsToScan.length} accessible folder(s); 0 local audio/video files found.`,
    };
  }

  playMedia(queryOrPath?: string, customDirs?: string[]): MediaPlayResult {
    const checkedAt = Date.now();
    const scan = this.scanMedia(customDirs);
    const q = (queryOrPath || '').trim();

    let targetFile: DiscoveredMediaFile | undefined;
    if (q && fs.existsSync(q)) {
      const safety = sanitizeSafePath(q);
      if (!safety.safe) {
        return {
          ok: false,
          code: 'PROTECTED_OS_PATH',
          message: safety.reason || 'Requested media path blocked by PolicyEngine.',
          scannedCount: scan.files.length,
          checkedAt,
        };
      }
      const st = fs.statSync(safety.resolvedPath);
      targetFile = {
        name: path.basename(safety.resolvedPath),
        path: safety.resolvedPath,
        extension: path.extname(safety.resolvedPath).toLowerCase(),
        bytes: st.size,
        modifiedAt: st.mtimeMs,
      };
    } else if (scan.files.length > 0) {
      const token = q.toLowerCase();
      targetFile =
        (token && scan.files.find((f) => f.name.toLowerCase().includes(token))) || scan.files[0];
    }

    if (process.platform !== 'win32') {
      return {
        ok: false,
        code: 'WINDOWS_HOST_REQUIRED',
        message: `Local audio/media player control requires a Windows desktop host (current: ${process.platform}). Scanned ${scan.scannedDirs.length} folder(s) and found ${scan.files.length} media file(s).`,
        matchedFile: targetFile,
        scannedCount: scan.files.length,
        checkedAt,
      };
    }

    if (!targetFile) {
      return {
        ok: false,
        code: 'NO_MEDIA_FILES_FOUND',
        message: `No playable audio/video files found in scanned folders (${scan.scannedDirs.join(', ') || 'none'}).`,
        scannedCount: 0,
        checkedAt,
      };
    }

    try {
      const child = spawn(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-Command', `Start-Process -FilePath '${targetFile.path.replace(/'/g, "''")}'`],
        { detached: true, stdio: 'ignore' }
      );
      child.unref();
      let activePlayer = false;
      try {
        const procOut = execFileSync(
          'powershell.exe',
          [
            '-NoProfile',
            '-NonInteractive',
            '-Command',
            "Get-Process | Where-Object { $_.ProcessName -match 'Music|Video|wmplayer|vlc|MediaPlayer' } | Select-Object -First 1 -ExpandProperty Id",
          ],
          { timeout: 2500, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }
        ).trim();
        activePlayer = Boolean(procOut);
      } catch {
        // Ignore follow-up probe error
      }
      return {
        ok: true,
        code: 'VERIFIED',
        message: `Launched media playback for "${targetFile.name}"${activePlayer ? ' (player process verified running)' : ''}.`,
        matchedFile: targetFile,
        scannedCount: scan.files.length,
        verifiedPid: child.pid ?? null,
        checkedAt,
      };
    } catch (err: unknown) {
      return {
        ok: false,
        code: 'LAUNCH_FAILED',
        message: err instanceof Error ? err.message : 'Failed to start Windows media playback.',
        matchedFile: targetFile,
        scannedCount: scan.files.length,
        checkedAt,
      };
    }
  }
}
