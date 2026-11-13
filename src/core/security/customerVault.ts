/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type {
  CustomerFieldKey,
  CustomerRecord,
  CustomerRecordView,
  CustomerServiceEntry,
  OperatingMode,
} from '../../types/agent.ts';
import { scrubSecrets } from '../policy/policyEngine.ts';

interface EncryptedCustomerVaultEntry {
  customerId: string;
  ivHex: string;
  authTagHex: string;
  cipherTextHex: string;
  updatedAt: number;
}

interface EncryptedCustomerVaultFile {
  version: string;
  updatedAt: number;
  records: Record<string, EncryptedCustomerVaultEntry>;
}

export interface CustomerVaultBackupBundle {
  version: string;
  createdAt: number;
  recordCount: number;
  ivHex: string;
  authTagHex: string;
  cipherTextHex: string;
}

export const DEFAULT_CUSTOMER_FIELDS_ENABLED: Record<CustomerFieldKey, boolean> = {
  phone: true,
  alternatePhone: true,
  cnic: true,
  address: true,
  deviceModel: true,
  imei: true,
  paymentStatus: true,
  accessoriesPurchased: true,
  warrantyInfo: true,
  staffNotes: true,
};

export function maskSensitiveField(value?: string, visibleTail = 4): string | undefined {
  if (!value || !value.trim()) return undefined;
  const clean = value.trim();
  if (clean.length <= visibleTail) return '*'.repeat(clean.length);
  const tail = clean.slice(-visibleTail);
  return `*****${tail}`;
}

export class CustomerVault {
  private readonly vaultPath: string;
  private readonly masterKey: Buffer;
  private fileData: EncryptedCustomerVaultFile;

  constructor(customVaultPath?: string) {
    this.vaultPath =
      customVaultPath || path.resolve(process.cwd(), 'data', 'nx_customer_vault.json');
    this.masterKey = this.resolveOrCreateMasterKey();
    this.fileData = this.loadFromDisk();
  }

  private resolveOrCreateMasterKey(): Buffer {
    const envSecret = process.env.NX_VAULT_SECRET;
    if (envSecret && envSecret.trim().length >= 8) {
      return crypto.createHash('sha256').update(envSecret.trim()).digest();
    }
    const keyFile = path.join(path.dirname(this.vaultPath), '.nx_vault.key');
    const dir = path.dirname(keyFile);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    if (fs.existsSync(keyFile)) {
      const hex = fs.readFileSync(keyFile, 'utf-8').trim();
      if (/^[0-9a-f]{64}$/i.test(hex)) {
        return Buffer.from(hex, 'hex');
      }
    }

    const generated = crypto.randomBytes(32);
    fs.writeFileSync(keyFile, generated.toString('hex'), { mode: 0o600, encoding: 'utf-8' });
    try {
      fs.chmodSync(keyFile, 0o600);
    } catch {
      // Windows ACLs handle file permissions automatically
    }
    return generated;
  }

  private loadFromDisk(): EncryptedCustomerVaultFile {
    try {
      if (!fs.existsSync(this.vaultPath)) {
        return { version: '1.0.0', updatedAt: Date.now(), records: {} };
      }
      const parsed = JSON.parse(
        fs.readFileSync(this.vaultPath, 'utf-8')
      ) as Partial<EncryptedCustomerVaultFile>;
      return {
        version: '1.0.0',
        updatedAt: parsed.updatedAt || Date.now(),
        records: parsed.records || {},
      };
    } catch {
      return { version: '1.0.0', updatedAt: Date.now(), records: {} };
    }
  }

  private saveToDisk(): void {
    const dir = path.dirname(this.vaultPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    this.fileData.updatedAt = Date.now();
    const tmpPath = `${this.vaultPath}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(this.fileData, null, 2), {
      mode: 0o600,
      encoding: 'utf-8',
    });
    fs.renameSync(tmpPath, this.vaultPath);
    try {
      fs.chmodSync(this.vaultPath, 0o600);
    } catch {
      // Best-effort POSIX permissions
    }
  }

  private encryptObject<T>(payload: T, key: Buffer = this.masterKey): {
    ivHex: string;
    authTagHex: string;
    cipherTextHex: string;
  } {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([
      cipher.update(JSON.stringify(payload), 'utf-8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();
    return {
      ivHex: iv.toString('hex'),
      authTagHex: authTag.toString('hex'),
      cipherTextHex: encrypted.toString('hex'),
    };
  }

  private decryptObject<T>(
    entry: { ivHex: string; authTagHex: string; cipherTextHex: string },
    key: Buffer = this.masterKey
  ): T | null {
    try {
      const iv = Buffer.from(entry.ivHex, 'hex');
      const authTag = Buffer.from(entry.authTagHex, 'hex');
      const cipherText = Buffer.from(entry.cipherTextHex, 'hex');
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(authTag);
      const plain = Buffer.concat([decipher.update(cipherText), decipher.final()]).toString('utf-8');
      return JSON.parse(plain) as T;
    } catch {
      return null;
    }
  }

  private readAllDecrypted(): CustomerRecord[] {
    const out: CustomerRecord[] = [];
    for (const entry of Object.values(this.fileData.records)) {
      const rec = this.decryptObject<CustomerRecord>(entry);
      if (rec && rec.customerId) out.push(rec);
    }
    return out.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  private writeRecord(record: CustomerRecord): void {
    const enc = this.encryptObject(record);
    this.fileData.records[record.customerId] = {
      customerId: record.customerId,
      ivHex: enc.ivHex,
      authTagHex: enc.authTagHex,
      cipherTextHex: enc.cipherTextHex,
      updatedAt: record.updatedAt,
    };
    this.saveToDisk();
  }

  toView(
    record: CustomerRecord,
    options: {
      revealSensitive?: boolean;
      operatingMode?: OperatingMode;
      fieldsEnabled?: Partial<Record<CustomerFieldKey, boolean>>;
    } = {}
  ): CustomerRecordView {
    const fields = { ...DEFAULT_CUSTOMER_FIELDS_ENABLED, ...(options.fieldsEnabled || {}) };
    const allowReveal =
      Boolean(options.revealSensitive) && (options.operatingMode || 'OWNER_PRIVATE') === 'OWNER_PRIVATE';

    return {
      customerId: record.customerId,
      name: record.name,
      phoneMasked: fields.phone ? maskSensitiveField(record.phone, 4) : undefined,
      phone: allowReveal && fields.phone ? record.phone : undefined,
      alternatePhone: allowReveal && fields.alternatePhone ? record.alternatePhone : undefined,
      cnicMasked: fields.cnic ? maskSensitiveField(record.cnic, 4) : undefined,
      cnic: allowReveal && fields.cnic ? record.cnic : undefined,
      address: fields.address ? record.address : undefined,
      deviceModel: fields.deviceModel ? record.deviceModel : undefined,
      imeiMasked: fields.imei ? maskSensitiveField(record.imei, 4) : undefined,
      imei: allowReveal && fields.imei ? record.imei : undefined,
      serviceHistory: record.serviceHistory || [],
      repairNotes: record.repairNotes,
      paymentStatus: fields.paymentStatus ? record.paymentStatus : 'NA',
      accessoriesPurchased: fields.accessoriesPurchased ? record.accessoriesPurchased : undefined,
      warrantyInfo: fields.warrantyInfo ? record.warrantyInfo : undefined,
      staffNotes: allowReveal && fields.staffNotes ? record.staffNotes : undefined,
      tags: record.tags || [],
      archived: Boolean(record.archived),
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      sensitiveRevealed: allowReveal,
    };
  }

  getCount(): number {
    return Object.keys(this.fileData.records).length;
  }

  listCustomers(options: {
    query?: string;
    includeArchived?: boolean;
    operatingMode?: OperatingMode;
    fieldsEnabled?: Partial<Record<CustomerFieldKey, boolean>>;
  } = {}): CustomerRecordView[] {
    const q = (options.query || '').trim().toLowerCase();
    return this.readAllDecrypted()
      .filter((r) => (options.includeArchived ? true : !r.archived))
      .filter((r) => {
        if (!q) return true;
        return (
          r.name.toLowerCase().includes(q) ||
          r.customerId.toLowerCase().includes(q) ||
          (r.deviceModel || '').toLowerCase().includes(q) ||
          (r.phone || '').toLowerCase().includes(q) ||
          (r.cnic || '').toLowerCase().includes(q) ||
          (r.imei || '').toLowerCase().includes(q) ||
          r.tags.some((t) => t.toLowerCase().includes(q))
        );
      })
      .map((r) =>
        this.toView(r, {
          revealSensitive: false,
          operatingMode: options.operatingMode,
          fieldsEnabled: options.fieldsEnabled,
        })
      );
  }

  findCustomerByQuery(
    query: string,
    options: {
      revealSensitive?: boolean;
      operatingMode?: OperatingMode;
      fieldsEnabled?: Partial<Record<CustomerFieldKey, boolean>>;
    } = {}
  ): CustomerRecordView | null {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    const all = this.readAllDecrypted().filter((r) => !r.archived);
    const matched =
      all.find((r) => r.customerId.toLowerCase() === q) ||
      all.find((r) => r.name.toLowerCase() === q) ||
      all.find(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          (r.phone || '').includes(q) ||
          (r.cnic || '').includes(q)
      );
    return matched ? this.toView(matched, options) : null;
  }

  getCustomer(
    customerId: string,
    options: {
      revealSensitive?: boolean;
      operatingMode?: OperatingMode;
      fieldsEnabled?: Partial<Record<CustomerFieldKey, boolean>>;
    } = {}
  ): CustomerRecordView | null {
    const entry = this.fileData.records[customerId];
    if (!entry) return null;
    const rec = this.decryptObject<CustomerRecord>(entry);
    if (!rec) return null;
    return this.toView(rec, options);
  }

  createCustomer(input: {
    name: string;
    phone?: string;
    alternatePhone?: string;
    cnic?: string;
    address?: string;
    deviceModel?: string;
    imei?: string;
    repairNotes?: string;
    paymentStatus?: CustomerRecord['paymentStatus'];
    accessoriesPurchased?: string;
    warrantyInfo?: string;
    staffNotes?: string;
    tags?: string[];
  }): CustomerRecordView {
    const now = Date.now();
    const customerId = `cust-${now}-${Math.random().toString(36).slice(2, 6)}`;
    const record: CustomerRecord = {
      customerId,
      name: scrubSecrets(input.name.trim()).cleanText,
      phone: input.phone?.trim() || undefined,
      alternatePhone: input.alternatePhone?.trim() || undefined,
      cnic: input.cnic?.trim() || undefined,
      address: input.address?.trim() || undefined,
      deviceModel: input.deviceModel?.trim() || undefined,
      imei: input.imei?.trim() || undefined,
      serviceHistory: [],
      repairNotes: input.repairNotes?.trim() || undefined,
      paymentStatus: input.paymentStatus || 'NA',
      accessoriesPurchased: input.accessoriesPurchased?.trim() || undefined,
      warrantyInfo: input.warrantyInfo?.trim() || undefined,
      staffNotes: input.staffNotes?.trim() || undefined,
      tags: Array.isArray(input.tags) ? input.tags.filter(Boolean).slice(0, 12) : [],
      archived: false,
      createdAt: now,
      updatedAt: now,
    };
    this.writeRecord(record);
    return this.toView(record, { revealSensitive: false });
  }

  updateCustomer(
    customerId: string,
    updates: Partial<
      Omit<CustomerRecord, 'customerId' | 'createdAt' | 'updatedAt' | 'serviceHistory'>
    >
  ): CustomerRecordView | null {
    const entry = this.fileData.records[customerId];
    if (!entry) return null;
    const rec = this.decryptObject<CustomerRecord>(entry);
    if (!rec) return null;

    if (typeof updates.name === 'string' && updates.name.trim()) rec.name = updates.name.trim();
    if (updates.phone !== undefined) rec.phone = updates.phone?.trim() || undefined;
    if (updates.alternatePhone !== undefined) {
      rec.alternatePhone = updates.alternatePhone?.trim() || undefined;
    }
    if (updates.cnic !== undefined) rec.cnic = updates.cnic?.trim() || undefined;
    if (updates.address !== undefined) rec.address = updates.address?.trim() || undefined;
    if (updates.deviceModel !== undefined) rec.deviceModel = updates.deviceModel?.trim() || undefined;
    if (updates.imei !== undefined) rec.imei = updates.imei?.trim() || undefined;
    if (updates.repairNotes !== undefined) rec.repairNotes = updates.repairNotes?.trim() || undefined;
    if (updates.paymentStatus) rec.paymentStatus = updates.paymentStatus;
    if (updates.accessoriesPurchased !== undefined) {
      rec.accessoriesPurchased = updates.accessoriesPurchased?.trim() || undefined;
    }
    if (updates.warrantyInfo !== undefined) {
      rec.warrantyInfo = updates.warrantyInfo?.trim() || undefined;
    }
    if (updates.staffNotes !== undefined) rec.staffNotes = updates.staffNotes?.trim() || undefined;
    if (Array.isArray(updates.tags)) rec.tags = updates.tags.filter(Boolean).slice(0, 12);
    if (typeof updates.archived === 'boolean') rec.archived = updates.archived;
    rec.updatedAt = Date.now();

    this.writeRecord(rec);
    return this.toView(rec, { revealSensitive: false });
  }

  addServiceEntry(
    customerId: string,
    input: {
      deviceModel?: string;
      issue: string;
      resolution?: string;
      amountPKR?: number;
      paymentStatus?: CustomerServiceEntry['paymentStatus'];
      warrantyDays?: number;
    }
  ): CustomerRecordView | null {
    const entry = this.fileData.records[customerId];
    if (!entry) return null;
    const rec = this.decryptObject<CustomerRecord>(entry);
    if (!rec) return null;

    const svc: CustomerServiceEntry = {
      id: `svc-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      date: Date.now(),
      deviceModel: input.deviceModel?.trim() || rec.deviceModel,
      issue: input.issue.trim(),
      resolution: input.resolution?.trim() || undefined,
      amountPKR: typeof input.amountPKR === 'number' ? input.amountPKR : undefined,
      paymentStatus: input.paymentStatus || 'PENDING',
      warrantyDays: typeof input.warrantyDays === 'number' ? input.warrantyDays : undefined,
    };
    rec.serviceHistory = [svc, ...(rec.serviceHistory || [])];
    if (svc.paymentStatus !== 'NA') rec.paymentStatus = svc.paymentStatus;
    rec.updatedAt = Date.now();
    this.writeRecord(rec);
    return this.toView(rec, { revealSensitive: false });
  }

  archiveCustomer(customerId: string, archived = true): CustomerRecordView | null {
    return this.updateCustomer(customerId, { archived });
  }

  deleteCustomer(customerId: string): boolean {
    if (!this.fileData.records[customerId]) return false;
    delete this.fileData.records[customerId];
    this.saveToDisk();
    return true;
  }

  applyRetentionPolicy(retentionDays: number): number {
    if (!Number.isFinite(retentionDays) || retentionDays <= 0) return 0;
    const cutoff = Date.now() - retentionDays * 86_400_000;
    let removed = 0;
    for (const rec of this.readAllDecrypted()) {
      if (rec.archived && rec.updatedAt < cutoff) {
        delete this.fileData.records[rec.customerId];
        removed += 1;
      }
    }
    if (removed > 0) this.saveToDisk();
    return removed;
  }

  exportSanitizedSummary(includeArchived = false): {
    exportedAt: number;
    count: number;
    records: Array<{
      customerId: string;
      name: string;
      phoneMasked?: string;
      cnicMasked?: string;
      deviceModel?: string;
      imeiMasked?: string;
      paymentStatus: string;
      serviceCount: number;
      archived: boolean;
      updatedAt: number;
    }>;
  } {
    const records = this.listCustomers({ includeArchived }).map((v) => ({
      customerId: v.customerId,
      name: v.name,
      phoneMasked: v.phoneMasked,
      cnicMasked: v.cnicMasked,
      deviceModel: v.deviceModel,
      imeiMasked: v.imeiMasked,
      paymentStatus: v.paymentStatus,
      serviceCount: v.serviceHistory.length,
      archived: v.archived,
      updatedAt: v.updatedAt,
    }));
    return { exportedAt: Date.now(), count: records.length, records };
  }

  createEncryptedBackup(): CustomerVaultBackupBundle {
    const all = this.readAllDecrypted();
    const enc = this.encryptObject({ records: all });
    return {
      version: '1.0.0',
      createdAt: Date.now(),
      recordCount: all.length,
      ...enc,
    };
  }

  restoreEncryptedBackup(bundle: CustomerVaultBackupBundle): { ok: boolean; restoredCount: number; error?: string } {
    const decoded = this.decryptObject<{ records: CustomerRecord[] }>(bundle);
    if (!decoded || !Array.isArray(decoded.records)) {
      return { ok: false, restoredCount: 0, error: 'INVALID_OR_TAMPERED_BACKUP_BUNDLE' };
    }
    let count = 0;
    for (const rec of decoded.records) {
      if (rec && rec.customerId && rec.name) {
        this.writeRecord(rec);
        count += 1;
      }
    }
    return { ok: true, restoredCount: count };
  }
}
