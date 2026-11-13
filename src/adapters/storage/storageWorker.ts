/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import type { PreFlightValidationReport, StorageDeviceStatus } from '../../types/agent.ts';
import { sanitizeSafePath } from '../../core/policy/policyEngine.ts';

export interface SafeEjectResult {
  status: 'EJECTED' | 'NEEDS_ATTENTION' | 'UNAVAILABLE';
  driveLetter: string;
  message: string;
  reason?: string;
}

export interface TransactionalCopyFileResult {
  sourcePath: string;
  destinationPath: string;
  status: 'COPIED_VERIFIED' | 'RESUMED_SKIPPED' | 'FAILED' | 'BLOCKED';
  bytes: number;
  sourceSha256?: string;
  destinationSha256?: string;
  error?: string;
}

export interface TransactionalCopyReport {
  ok: boolean;
  code: 'VERIFIED' | 'PREFLIGHT_FAILED' | 'PROTECTED_OS_DRIVE' | 'COPY_FAILED';
  destinationDir: string;
  copiedCount: number;
  skippedCount: number;
  failedCount: number;
  results: TransactionalCopyFileResult[];
  warnings?: string[];
}

export interface DirectoryFileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  bytes: number;
  sha256?: string;
}

export interface DirectoryListResult {
  ok: boolean;
  code: 'VERIFIED' | 'PATH_TRAVERSAL_BLOCKED' | 'PROTECTED_OS_PATH' | 'NOT_FOUND' | 'INVALID_PATH';
  directory: string;
  entries: DirectoryFileEntry[];
  message: string;
}

function sha256File(filePath: string): string {
  const hash = crypto.createHash('sha256');
  const buf = fs.readFileSync(filePath);
  hash.update(buf);
  return hash.digest('hex');
}

export class StorageWorker {
  listDirectory(dirPath: string, includeSha256 = false): DirectoryListResult {
    const safety = sanitizeSafePath(dirPath);
    if (!safety.safe) {
      return {
        ok: false,
        code: safety.code || 'INVALID_PATH',
        directory: dirPath,
        entries: [],
        message: safety.reason || 'Blocked unsafe directory path.',
      };
    }

    if (!fs.existsSync(safety.resolvedPath)) {
      return {
        ok: false,
        code: 'NOT_FOUND',
        directory: safety.resolvedPath,
        entries: [],
        message: `Directory does not exist: ${safety.resolvedPath}`,
      };
    }

    const items = fs.readdirSync(safety.resolvedPath).slice(0, 100);
    const entries: DirectoryFileEntry[] = [];
    for (const name of items) {
      const full = path.join(safety.resolvedPath, name);
      try {
        const st = fs.statSync(full);
        entries.push({
          name,
          path: full,
          isDirectory: st.isDirectory(),
          bytes: st.isDirectory() ? 0 : st.size,
          sha256: includeSha256 && !st.isDirectory() && st.size <= 5 * 1024 * 1024 ? sha256File(full) : undefined,
        });
      } catch {
        // Skip unreadable entry
      }
    }

    return {
      ok: true,
      code: 'VERIFIED',
      directory: safety.resolvedPath,
      entries,
      message: `Listed ${entries.length} item(s) in ${safety.resolvedPath}.`,
    };
  }

  createFolder(folderPath: string): {
    ok: boolean;
    code: 'VERIFIED' | 'PATH_TRAVERSAL_BLOCKED' | 'PROTECTED_OS_PATH' | 'INVALID_PATH' | 'CREATE_FAILED';
    path: string;
    message: string;
  } {
    const safety = sanitizeSafePath(folderPath);
    if (!safety.safe) {
      return {
        ok: false,
        code: safety.code || 'INVALID_PATH',
        path: folderPath,
        message: safety.reason || 'Blocked unsafe folder path.',
      };
    }
    try {
      fs.mkdirSync(safety.resolvedPath, { recursive: true });
      const exists = fs.existsSync(safety.resolvedPath) && fs.statSync(safety.resolvedPath).isDirectory();
      return {
        ok: exists,
        code: exists ? 'VERIFIED' : 'CREATE_FAILED',
        path: safety.resolvedPath,
        message: exists ? `Verified folder ready at ${safety.resolvedPath}.` : 'Folder creation could not be verified.',
      };
    } catch (err: unknown) {
      return {
        ok: false,
        code: 'CREATE_FAILED',
        path: safety.resolvedPath,
        message: err instanceof Error ? err.message : 'Folder creation failed.',
      };
    }
  }

  createFile(
    filePath: string,
    content = ''
  ): {
    ok: boolean;
    code: 'VERIFIED' | 'PATH_TRAVERSAL_BLOCKED' | 'PROTECTED_OS_PATH' | 'INVALID_PATH' | 'WRITE_FAILED';
    path: string;
    bytes: number;
    sha256?: string;
    message: string;
  } {
    const safety = sanitizeSafePath(filePath);
    if (!safety.safe) {
      return {
        ok: false,
        code: safety.code || 'INVALID_PATH',
        path: filePath,
        bytes: 0,
        message: safety.reason || 'Blocked unsafe file write path.',
      };
    }
    try {
      const parent = path.dirname(safety.resolvedPath);
      if (!fs.existsSync(parent)) fs.mkdirSync(parent, { recursive: true });
      const tmp = `${safety.resolvedPath}.nx_tmp`;
      fs.writeFileSync(tmp, content, 'utf-8');
      fs.renameSync(tmp, safety.resolvedPath);
      const st = fs.statSync(safety.resolvedPath);
      return {
        ok: true,
        code: 'VERIFIED',
        path: safety.resolvedPath,
        bytes: st.size,
        sha256: sha256File(safety.resolvedPath),
        message: `Created and verified file ${path.basename(safety.resolvedPath)} (${st.size} bytes).`,
      };
    } catch (err: unknown) {
      return {
        ok: false,
        code: 'WRITE_FAILED',
        path: safety.resolvedPath,
        bytes: 0,
        message: err instanceof Error ? err.message : 'File creation failed.',
      };
    }
  }

  renamePath(
    oldPath: string,
    newPath: string
  ): {
    ok: boolean;
    code: 'VERIFIED' | 'PATH_TRAVERSAL_BLOCKED' | 'PROTECTED_OS_PATH' | 'INVALID_PATH' | 'NOT_FOUND' | 'RENAME_FAILED';
    oldPath: string;
    newPath: string;
    message: string;
  } {
    const srcSafety = sanitizeSafePath(oldPath);
    if (!srcSafety.safe) {
      return {
        ok: false,
        code: srcSafety.code || 'INVALID_PATH',
        oldPath,
        newPath,
        message: srcSafety.reason || 'Blocked unsafe source path.',
      };
    }
    const dstSafety = sanitizeSafePath(newPath);
    if (!dstSafety.safe) {
      return {
        ok: false,
        code: dstSafety.code || 'INVALID_PATH',
        oldPath: srcSafety.resolvedPath,
        newPath,
        message: dstSafety.reason || 'Blocked unsafe destination path.',
      };
    }
    if (!fs.existsSync(srcSafety.resolvedPath)) {
      return {
        ok: false,
        code: 'NOT_FOUND',
        oldPath: srcSafety.resolvedPath,
        newPath: dstSafety.resolvedPath,
        message: `Source path does not exist: ${srcSafety.resolvedPath}`,
      };
    }
    try {
      const parent = path.dirname(dstSafety.resolvedPath);
      if (!fs.existsSync(parent)) fs.mkdirSync(parent, { recursive: true });
      fs.renameSync(srcSafety.resolvedPath, dstSafety.resolvedPath);
      const verified = fs.existsSync(dstSafety.resolvedPath);
      return {
        ok: verified,
        code: verified ? 'VERIFIED' : 'RENAME_FAILED',
        oldPath: srcSafety.resolvedPath,
        newPath: dstSafety.resolvedPath,
        message: verified
          ? `Renamed "${path.basename(srcSafety.resolvedPath)}" to "${path.basename(dstSafety.resolvedPath)}".`
          : 'Rename operation could not be verified.',
      };
    } catch (err: unknown) {
      return {
        ok: false,
        code: 'RENAME_FAILED',
        oldPath: srcSafety.resolvedPath,
        newPath: dstSafety.resolvedPath,
        message: err instanceof Error ? err.message : 'Rename failed.',
      };
    }
  }

  searchFiles(rootDir: string, query: string): DirectoryListResult {
    const safety = sanitizeSafePath(rootDir);
    if (!safety.safe) {
      return {
        ok: false,
        code: safety.code || 'INVALID_PATH',
        directory: rootDir,
        entries: [],
        message: safety.reason || 'Blocked unsafe directory search path.',
      };
    }
    if (!fs.existsSync(safety.resolvedPath)) {
      return {
        ok: false,
        code: 'NOT_FOUND',
        directory: safety.resolvedPath,
        entries: [],
        message: `Directory does not exist: ${safety.resolvedPath}`,
      };
    }
    const q = query.trim().toLowerCase();
    const matches: DirectoryFileEntry[] = [];
    const walk = (dir: string, depth: number) => {
      if (depth > 3 || matches.length >= 60) return;
      try {
        for (const name of fs.readdirSync(dir)) {
          if (name === 'node_modules' || name === '.git' || matches.length >= 60) continue;
          const full = path.join(dir, name);
          try {
            const st = fs.statSync(full);
            if (!q || name.toLowerCase().includes(q)) {
              matches.push({
                name,
                path: full,
                isDirectory: st.isDirectory(),
                bytes: st.isDirectory() ? 0 : st.size,
              });
            }
            if (st.isDirectory()) walk(full, depth + 1);
          } catch {
            // Skip unreadable
          }
        }
      } catch {
        // Skip unreadable dir
      }
    };
    walk(safety.resolvedPath, 0);
    return {
      ok: true,
      code: 'VERIFIED',
      directory: safety.resolvedPath,
      entries: matches,
      message: `Found ${matches.length} matching item(s) inside ${safety.resolvedPath}.`,
    };
  }
  discoverVolumes(): StorageDeviceStatus[] {
    const devices: StorageDeviceStatus[] = [];

    if (process.platform === 'win32') {
      try {
        const stdout = execSync(
          'wmic logicaldisk get caption,description,filesystem,freespace,size,volumename /format:csv',
          { timeout: 2500, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }
        );
        const lines = stdout
          .trim()
          .split('\n')
          .filter((l) => l.trim().length > 0 && !l.includes('Node,Caption'));

        for (const line of lines) {
          const parts = line.split(',').map((p) => p.trim());
          if (parts.length >= 7) {
            const letter = parts[1];
            const desc = parts[2] || '';
            const fsType = parts[3];
            const free = Number(parts[4]) || 0;
            const size = Number(parts[5]) || 0;
            const volName = parts[6] || 'Local Disk';
            const isSys = letter.toUpperCase().startsWith('C');
            const totalGB = Number((size / (1024 * 1024 * 1024)).toFixed(1));
            const freeGB = Number((free / (1024 * 1024 * 1024)).toFixed(1));
            const usedGB = Number(Math.max(0, totalGB - freeGB).toFixed(1));
            devices.push({
              letter: letter.endsWith('\\') ? letter : `${letter}\\`,
              label: isSys ? 'Windows OS (Protected)' : `${volName} (${letter})`,
              type: isSys ? 'SYSTEM_OS' : desc.toLowerCase().includes('removable') ? 'USB' : 'DATA_DRIVE',
              isProtected: isSys,
              isPresent: size > 0,
              totalGB,
              usedGB,
              freeGB,
              isBusy: false,
              filesystem:
                fsType === 'FAT32' || fsType === 'NTFS' || fsType === 'exFAT' ? fsType : 'UNKNOWN',
              source: 'win32_wmic',
            });
          }
        }
      } catch {
        // Fallback below if wmic unavailable
      }
    }

    if (devices.length === 0) {
      try {
        const stat = (fs as unknown as { statfsSync?: (p: string) => { blocks: number; bsize: number; bavail: number } }).statfsSync?.('/');
        if (stat && stat.blocks > 0) {
          const totalGB = Number(((stat.blocks * stat.bsize) / (1024 * 1024 * 1024)).toFixed(1));
          const freeGB = Number(((stat.bavail * stat.bsize) / (1024 * 1024 * 1024)).toFixed(1));
          const usedGB = Number(Math.max(0, totalGB - freeGB).toFixed(1));
          devices.push({
            letter: '/',
            label: 'System Root (Protected)',
            type: 'SYSTEM_OS',
            isProtected: true,
            isPresent: true,
            totalGB,
            usedGB,
            freeGB,
            isBusy: false,
            filesystem: 'EXT4',
            source: 'posix_statfs',
          });
        }
      } catch {
        // Leave empty if unreadable
      }

      for (const mountDir of ['/media', '/mnt']) {
        if (!fs.existsSync(mountDir)) continue;
        try {
          const entries = fs.readdirSync(mountDir);
          for (const item of entries) {
            const fullPath = path.join(mountDir, item);
            try {
              const stat = (fs as unknown as { statfsSync?: (p: string) => { blocks: number; bsize: number; bavail: number } }).statfsSync?.(fullPath);
              if (stat && stat.blocks > 0) {
                const totalGB = Number(((stat.blocks * stat.bsize) / (1024 * 1024 * 1024)).toFixed(1));
                const freeGB = Number(((stat.bavail * stat.bsize) / (1024 * 1024 * 1024)).toFixed(1));
                devices.push({
                  letter: fullPath,
                  label: `External Mount (${item})`,
                  type: 'USB',
                  isProtected: false,
                  isPresent: true,
                  totalGB,
                  usedGB: Number(Math.max(0, totalGB - freeGB).toFixed(1)),
                  freeGB,
                  isBusy: false,
                  filesystem: 'UNKNOWN',
                  source: 'posix_mount',
                });
              }
            } catch {
              // Skip unreadable mount
            }
          }
        } catch {
          // Skip directory if inaccessible
        }
      }
    }

    return devices;
  }

  validatePreFlight(
    targetDriveLetter: string,
    sourcePaths: string[] = [],
    explicitFileSizesMB?: number[]
  ): PreFlightValidationReport {
    const volumes = this.discoverVolumes();
    const normalizedTarget = targetDriveLetter.trim();
    const drive = volumes.find(
      (d) =>
        d.letter.toUpperCase() === normalizedTarget.toUpperCase() ||
        (d.letter !== '/' && d.letter.toUpperCase().startsWith(normalizedTarget.toUpperCase()))
    );

    const warnings: string[] = [];
    const fat32Exceeded: string[] = [];
    const inspectedTargets: string[] = [];

    const isProtectedSystem =
      (drive?.isProtected && normalizedTarget === '/') ||
      normalizedTarget.toUpperCase().startsWith('C:') ||
      normalizedTarget === '/';

    if (isProtectedSystem) {
      warnings.push('Target points to protected OS volume. Write transfers are blocked by policy.');
    }

    const isFat32 =
      drive?.filesystem === 'FAT32' ||
      (!drive && (normalizedTarget.toUpperCase().startsWith('F:') || normalizedTarget.toUpperCase().startsWith('G:')));

    let sourceExists = true;
    let sourceReadable = true;
    let zeroByteClean = true;
    let pathLengthValid = true;
    let filenameCompatible = true;
    let duplicatesChecked = true;
    let totalBytes = 0;

    if (sourcePaths.length > 0) {
      const seenNames = new Set<string>();
      for (const filePath of sourcePaths) {
        inspectedTargets.push(filePath);
        if (filePath.length > 255) {
          pathLengthValid = false;
          warnings.push(`Path exceeds safe 255-char boundary: ${filePath}`);
        }
        if (/[<>:"|?*]/.test(path.basename(filePath))) {
          filenameCompatible = false;
          warnings.push(`Filename contains unsupported FAT32/NTFS characters: ${path.basename(filePath)}`);
        }
        const base = path.basename(filePath).toLowerCase();
        if (seenNames.has(base)) {
          duplicatesChecked = false;
          warnings.push(`Duplicate filename detected in staging batch: ${base}`);
        }
        seenNames.add(base);

        if (!fs.existsSync(filePath)) {
          sourceExists = false;
          sourceReadable = false;
          warnings.push(`Source file does not exist: ${filePath}`);
          continue;
        }
        try {
          fs.accessSync(filePath, fs.constants.R_OK);
          const stat = fs.statSync(filePath);
          if (stat.size === 0) {
            zeroByteClean = false;
            warnings.push(`Zero-byte file detected: ${filePath}`);
          }
          totalBytes += stat.size;
          const sizeMB = stat.size / (1024 * 1024);
          if (isFat32 && sizeMB > 4096) {
            fat32Exceeded.push(`${path.basename(filePath)} (${Math.round(sizeMB)}MB)`);
            warnings.push(`File exceeds FAT32 4GB limit: ${path.basename(filePath)}`);
          }
        } catch {
          sourceReadable = false;
          warnings.push(`Source file unreadable: ${filePath}`);
        }
      }
    } else if (Array.isArray(explicitFileSizesMB) && explicitFileSizesMB.length > 0) {
      explicitFileSizesMB.forEach((sizeMB, idx) => {
        inspectedTargets.push(`size-check-item-${idx + 1} (${sizeMB}MB)`);
        if (sizeMB <= 0) {
          zeroByteClean = false;
          warnings.push(`Zero-byte payload entry at index ${idx + 1}`);
        }
        totalBytes += sizeMB * 1024 * 1024;
        if (isFat32 && sizeMB > 4096) {
          fat32Exceeded.push(`Payload_${idx + 1} (${sizeMB}MB)`);
          warnings.push(`Payload item #${idx + 1} (${sizeMB}MB) exceeds FAT32 4GB single-file limit.`);
        }
      });
    } else {
      sourceExists = false;
      warnings.push('No source paths or file payload sizes supplied to inspect.');
    }

    const totalRequiredGB = totalBytes / (1024 * 1024 * 1024);
    const matchedOrFallbackDrive = drive || (fs.existsSync(normalizedTarget) ? volumes[0] : undefined);
    const destinationPresent = Boolean(matchedOrFallbackDrive && matchedOrFallbackDrive.isPresent);
    const capacityAvailable =
      matchedOrFallbackDrive &&
      matchedOrFallbackDrive.isPresent &&
      matchedOrFallbackDrive.freeGB !== null
        ? matchedOrFallbackDrive.freeGB > totalRequiredGB
        : false;

    if (!destinationPresent) {
      warnings.push(`Target drive "${normalizedTarget}" is not currently mounted or detected on this host.`);
    } else if (!capacityAvailable) {
      warnings.push(`Insufficient free space on ${normalizedTarget}.`);
    }

    const workspaceDir = path.resolve(process.cwd(), 'data');
    if (!fs.existsSync(workspaceDir)) {
      try {
        fs.mkdirSync(workspaceDir, { recursive: true });
      } catch {
        // Check access below
      }
    }
    let workspaceAccessible = false;
    try {
      fs.accessSync(workspaceDir, fs.constants.R_OK | fs.constants.W_OK);
      workspaceAccessible = true;
    } catch {
      workspaceAccessible = false;
    }

    const fat32Safe = fat32Exceeded.length === 0;
    const destinationWritable = destinationPresent && !isProtectedSystem;
    const passed =
      sourceExists &&
      sourceReadable &&
      zeroByteClean &&
      pathLengthValid &&
      filenameCompatible &&
      duplicatesChecked &&
      capacityAvailable &&
      fat32Safe &&
      workspaceAccessible &&
      destinationWritable;

    return {
      passed,
      checkedAt: Date.now(),
      source: drive?.source || 'filesystem_preflight',
      checks: {
        sourceExists,
        sourceReadable,
        zeroByteClean,
        permissionsOk: sourceReadable && destinationWritable,
        duplicatesChecked,
        pathLengthValid,
        capacityAvailable,
        fat32Safe,
        filenameCompatible,
        workspaceAccessible,
        manifestReady: passed,
        destinationWritable,
      },
      inspectedTargets,
      warnings: warnings.length > 0 ? warnings : undefined,
      targetFat32ExceededFiles: fat32Exceeded.length > 0 ? fat32Exceeded : undefined,
    };
  }

  copyFilesTransactional(sourcePaths: string[], destinationDir: string): TransactionalCopyReport {
    const destSafety = sanitizeSafePath(destinationDir);
    if (!destSafety.safe) {
      return {
        ok: false,
        code: 'PROTECTED_OS_DRIVE',
        destinationDir,
        copiedCount: 0,
        skippedCount: 0,
        failedCount: sourcePaths.length,
        results: sourcePaths.map((s) => ({
          sourcePath: s,
          destinationPath: path.join(destinationDir, path.basename(s)),
          status: 'BLOCKED',
          bytes: 0,
          error: destSafety.reason || 'Unsafe destination path blocked.',
        })),
        warnings: [destSafety.reason || 'Unsafe destination path blocked by PolicyEngine.'],
      };
    }

    const srcUnsafe = sourcePaths.find((s) => !sanitizeSafePath(s).safe);
    if (srcUnsafe) {
      const check = sanitizeSafePath(srcUnsafe);
      return {
        ok: false,
        code: 'PREFLIGHT_FAILED',
        destinationDir: destSafety.resolvedPath,
        copiedCount: 0,
        skippedCount: 0,
        failedCount: sourcePaths.length,
        results: sourcePaths.map((s) => ({
          sourcePath: s,
          destinationPath: path.join(destSafety.resolvedPath, path.basename(s)),
          status: 'BLOCKED',
          bytes: 0,
          error: check.reason || 'Unsafe source path blocked.',
        })),
        warnings: [check.reason || 'Unsafe source path blocked.'],
      };
    }

    const cleanDest = destSafety.resolvedPath;
    const upperDest = destinationDir.trim().toUpperCase();
    if (upperDest.startsWith('C:') || cleanDest === '/') {
      return {
        ok: false,
        code: 'PROTECTED_OS_DRIVE',
        destinationDir: cleanDest,
        copiedCount: 0,
        skippedCount: 0,
        failedCount: sourcePaths.length,
        results: sourcePaths.map((s) => ({
          sourcePath: s,
          destinationPath: path.join(cleanDest, path.basename(s)),
          status: 'BLOCKED',
          bytes: 0,
          error: 'Protected OS drive/root cannot be used as transactional copy target.',
        })),
        warnings: ['OS system volume target blocked by PolicyGuard.'],
      };
    }

    if (!fs.existsSync(cleanDest)) {
      fs.mkdirSync(cleanDest, { recursive: true });
    }

    const preflight = this.validatePreFlight(cleanDest, sourcePaths);
    if (!preflight.passed) {
      return {
        ok: false,
        code: 'PREFLIGHT_FAILED',
        destinationDir: cleanDest,
        copiedCount: 0,
        skippedCount: 0,
        failedCount: sourcePaths.length,
        results: sourcePaths.map((s) => ({
          sourcePath: s,
          destinationPath: path.join(cleanDest, path.basename(s)),
          status: 'FAILED',
          bytes: 0,
          error: preflight.warnings?.join('; ') || 'Preflight validation failed.',
        })),
        warnings: preflight.warnings,
      };
    }

    const results: TransactionalCopyFileResult[] = [];
    let copiedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    for (const src of sourcePaths) {
      const baseName = path.basename(src);
      const finalDest = path.join(cleanDest, baseName);
      const tempDest = path.join(cleanDest, `.${baseName}.nx_tmp`);

      try {
        const srcStat = fs.statSync(src);
        const sourceSha = sha256File(src);

        // Resume support: if destination already exists with matching byte count and SHA-256, skip re-copy
        if (fs.existsSync(finalDest)) {
          const destStat = fs.statSync(finalDest);
          if (destStat.size === srcStat.size && sha256File(finalDest) === sourceSha) {
            skippedCount += 1;
            results.push({
              sourcePath: src,
              destinationPath: finalDest,
              status: 'RESUMED_SKIPPED',
              bytes: destStat.size,
              sourceSha256: sourceSha,
              destinationSha256: sourceSha,
            });
            continue;
          }
        }

        // Write to temporary staged file, verify SHA-256 before atomic rename
        fs.copyFileSync(src, tempDest);
        const destSha = sha256File(tempDest);
        if (destSha !== sourceSha) {
          try {
            fs.unlinkSync(tempDest);
          } catch {
            // Ignore cleanup failure
          }
          failedCount += 1;
          results.push({
            sourcePath: src,
            destinationPath: finalDest,
            status: 'FAILED',
            bytes: srcStat.size,
            sourceSha256: sourceSha,
            destinationSha256: destSha,
            error: 'SHA-256 verification mismatch after staging write.',
          });
          continue;
        }

        fs.renameSync(tempDest, finalDest);
        copiedCount += 1;
        results.push({
          sourcePath: src,
          destinationPath: finalDest,
          status: 'COPIED_VERIFIED',
          bytes: srcStat.size,
          sourceSha256: sourceSha,
          destinationSha256: destSha,
        });
      } catch (err: unknown) {
        try {
          if (fs.existsSync(tempDest)) fs.unlinkSync(tempDest);
        } catch {
          // Ignore temp cleanup failure
        }
        failedCount += 1;
        results.push({
          sourcePath: src,
          destinationPath: finalDest,
          status: 'FAILED',
          bytes: 0,
          error: err instanceof Error ? err.message : 'Transactional copy failed.',
        });
      }
    }

    return {
      ok: failedCount === 0,
      code: failedCount === 0 ? 'VERIFIED' : 'COPY_FAILED',
      destinationDir: cleanDest,
      copiedCount,
      skippedCount,
      failedCount,
      results,
    };
  }

  ejectVolume(driveLetter: string): SafeEjectResult {
    const cleanTarget = (driveLetter || '').trim();
    if (!cleanTarget) {
      return {
        status: 'NEEDS_ATTENTION',
        driveLetter: cleanTarget,
        message: 'Drive letter or mount path is required for eject.',
        reason: 'MISSING_TARGET',
      };
    }

    if (cleanTarget.toUpperCase().startsWith('C:') || cleanTarget === '/') {
      return {
        status: 'NEEDS_ATTENTION',
        driveLetter: cleanTarget,
        message: 'Refused to eject protected OS system volume.',
        reason: 'PROTECTED_OS_DRIVE',
      };
    }

    const volumes = this.discoverVolumes();
    const matched = volumes.find(
      (v) =>
        v.letter.toUpperCase() === cleanTarget.toUpperCase() ||
        (v.letter !== '/' && v.letter.toUpperCase().startsWith(cleanTarget.toUpperCase()))
    );

    if (!matched) {
      return {
        status: 'UNAVAILABLE',
        driveLetter: cleanTarget,
        message: `Target storage volume "${cleanTarget}" is not mounted on this system.`,
        reason: 'VOLUME_NOT_PRESENT',
      };
    }

    if (process.platform === 'win32') {
      try {
        const driveId = matched.letter.replace(/\\+$/, '');
        execSync(
          `powershell -NoProfile -Command "$vol = (New-Object -ComObject Shell.Application).NameSpace(17).ParseName('${driveId}'); if ($vol) { $vol.InvokeVerb('Eject') } else { exit 1 }"`,
          { timeout: 5000, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }
        );
        const postCheck = this.discoverVolumes().some((v) => v.letter === matched.letter);
        if (!postCheck) {
          return {
            status: 'EJECTED',
            driveLetter: matched.letter,
            message: `${matched.letter} flushed, dismounted, and confirmed removed.`,
          };
        }
        return {
          status: 'NEEDS_ATTENTION',
          driveLetter: matched.letter,
          message: `OS reported ${matched.letter} still present after eject request (handle may still be open).`,
          reason: 'DEVICE_STILL_MOUNTED',
        };
      } catch (err: unknown) {
        return {
          status: 'NEEDS_ATTENTION',
          driveLetter: matched.letter,
          message: `Windows eject command failed for ${matched.letter}.`,
          reason: err instanceof Error ? err.message : 'EJECT_FAILED',
        };
      }
    }

    try {
      execSync(`umount "${matched.letter}"`, {
        timeout: 4000,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      const stillPresent = this.discoverVolumes().some((v) => v.letter === matched.letter);
      if (!stillPresent) {
        return {
          status: 'EJECTED',
          driveLetter: matched.letter,
          message: `${matched.letter} unmounted and confirmed removed.`,
        };
      }
      return {
        status: 'NEEDS_ATTENTION',
        driveLetter: matched.letter,
        message: `${matched.letter} remains mounted after umount.`,
        reason: 'MOUNT_STILL_ACTIVE',
      };
    } catch (err: unknown) {
      return {
        status: 'NEEDS_ATTENTION',
        driveLetter: matched.letter,
        message: `OS refused unmount for ${matched.letter} (insufficient permissions or device busy).`,
        reason: err instanceof Error ? err.message : 'UMOUNT_ERROR',
      };
    }
  }
}
