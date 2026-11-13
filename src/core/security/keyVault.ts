/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';

interface EncryptedVaultEntry {
  iv: string;
  tag: string;
  cipher: string;
  masked: string;
  updatedAt: number;
}

interface VaultDiskSchema {
  version: string;
  entries: Record<string, EncryptedVaultEntry>;
}

export function maskApiKey(rawKey: string): string {
  const clean = (rawKey || '').trim();
  if (clean.length <= 8) return '****';
  return `${clean.slice(0, 4)}...${clean.slice(-4)}`;
}

export class KeyVault {
  private readonly filePath: string;
  private readonly derivedKey: Buffer;
  private entries: Record<string, EncryptedVaultEntry>;

  constructor(customVaultPath?: string) {
    this.filePath = customVaultPath || path.resolve(process.cwd(), 'data', 'nx_key_vault.json');
    const machineSeed =
      process.env.NX_VAULT_SECRET || `${os.hostname()}:${process.cwd()}:nx-zero-trust-vault`;
    this.derivedKey = crypto.scryptSync(machineSeed, 'nx-vault-salt-v2', 32);
    this.entries = this.load();
  }

  private load(): Record<string, EncryptedVaultEntry> {
    try {
      if (!fs.existsSync(this.filePath)) return {};
      const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf-8')) as Partial<VaultDiskSchema>;
      return parsed.entries && typeof parsed.entries === 'object' ? parsed.entries : {};
    } catch {
      return {};
    }
  }

  private save(): void {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const tmp = `${this.filePath}.tmp`;
    const payload: VaultDiskSchema = { version: '2.0.0', entries: this.entries };
    fs.writeFileSync(tmp, JSON.stringify(payload, null, 2), { encoding: 'utf-8', mode: 0o600 });
    fs.renameSync(tmp, this.filePath);
  }

  setKey(profileId: string, rawApiKey: string): string {
    const clean = (rawApiKey || '').trim();
    if (clean.length < 10) {
      throw new Error('INVALID_API_KEY_FORMAT');
    }
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.derivedKey, iv);
    const encrypted = Buffer.concat([cipher.update(clean, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    const masked = `VAULT:${maskApiKey(clean)}`;

    this.entries[profileId] = {
      iv: iv.toString('hex'),
      tag: tag.toString('hex'),
      cipher: encrypted.toString('hex'),
      masked,
      updatedAt: Date.now(),
    };
    this.save();
    return masked;
  }

  getKey(profileId: string): string | null {
    const entry = this.entries[profileId];
    if (!entry) return null;
    try {
      const iv = Buffer.from(entry.iv, 'hex');
      const tag = Buffer.from(entry.tag, 'hex');
      const encrypted = Buffer.from(entry.cipher, 'hex');
      const decipher = crypto.createDecipheriv('aes-256-gcm', this.derivedKey, iv);
      decipher.setAuthTag(tag);
      const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
      return decrypted.toString('utf8');
    } catch {
      return null;
    }
  }

  hasKey(profileId: string): boolean {
    return Boolean(this.entries[profileId]);
  }

  hasAnyKeys(): boolean {
    return Object.keys(this.entries).length > 0;
  }

  deleteKey(profileId: string): boolean {
    if (!this.entries[profileId]) return false;
    delete this.entries[profileId];
    this.save();
    return true;
  }
}
