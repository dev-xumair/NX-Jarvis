/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { useAgent } from '../../context/AgentContext.tsx';
import {
  BarChart3,
  HardDrive,
  CheckCircle2,
  RefreshCw,
  Smartphone,
  Users,
  FolderOpen,
  Eye,
  Archive,
  Trash2,
  Download,
  Upload,
  Lock,
  Shield,
  Music,
  Plus,
} from 'lucide-react';
import type { CustomerRecordView, VerificationCheckResult } from '../../types/agent.ts';
import { apiClient } from '../../lib/apiClient.ts';
import { NxButton, NxCard, NxSectionHeader, NxStatusText } from '../ui/NxPrimitives.tsx';
import { StatisticsHistory } from '../history/StatisticsHistory.tsx';

type WorkspaceTab = 'LEDGER' | 'CUSTOMERS' | 'FILES_MEDIA' | 'DEVICES' | 'VERIFICATION';

export const WorkspaceView: React.FC = () => {
  const {
    telemetry,
    mobileBridge,
    browserSession,
    refreshTelemetry,
    operatingMode,
    preferences,
    customers,
    refreshCustomers,
    createCustomer,
    getCustomerDetail,
    addCustomerServiceEntry,
    archiveCustomerRecord,
    deleteCustomerRecord,
    exportSanitizedCustomers,
    exportCustomerBackup,
    restoreCustomerBackup,
    listSafeFiles,
    createSafeFolder,
    createSafeFile,
    scanMediaFiles,
  } = useAgent();
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('LEDGER');
  const [deviceFeedback, setDeviceFeedback] = useState<string | null>(null);

  const [testResults, setTestResults] = useState<VerificationCheckResult[]>([]);
  const [isRunningTests, setIsRunningTests] = useState(false);
  const [testSummary, setTestSummary] = useState<{
    passed: number;
    failed: number;
    unavailable: number;
    skipped: number;
    total: number;
  } | null>(null);

  // Customer Vault UI state
  const [custQuery, setCustQuery] = useState('');
  const [custIncludeArchived, setCustIncludeArchived] = useState(false);
  const [custFeedback, setCustFeedback] = useState<string | null>(null);
  const [newCustName, setNewCustName] = useState('');
  const [newCustPhone, setNewCustPhone] = useState('');
  const [newCustCnic, setNewCustCnic] = useState('');
  const [newCustDevice, setNewCustDevice] = useState('');
  const [newCustImei, setNewCustImei] = useState('');
  const [newCustPayment, setNewCustPayment] = useState<'PAID' | 'PENDING' | 'PARTIAL' | 'NA'>('PENDING');
  const [newCustNotes, setNewCustNotes] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerRecordView | null>(null);
  const [confirmDeleteCustId, setConfirmDeleteCustId] = useState<string | null>(null);
  const [svcIssue, setSvcIssue] = useState('');
  const [svcAmount, setSvcAmount] = useState('');
  const [svcResolution, setSvcResolution] = useState('');
  const [restoreJson, setRestoreJson] = useState('');

  // Safe Files & Media UI state
  const [dirPath, setDirPath] = useState('data');
  const [dirEntries, setDirEntries] = useState<Array<{ name: string; path: string; isDirectory: boolean; bytes: number }>>([]);
  const [fileFeedback, setFileFeedback] = useState<string | null>(null);
  const [newFolderInput, setNewFolderInput] = useState('data/notes');
  const [newFilePathInput, setNewFilePathInput] = useState('data/notes/shop_note.txt');
  const [newFileContentInput, setNewFileContentInput] = useState('NX workstation daily note');
  const [mediaResult, setMediaResult] = useState<{ scannedDirs: string[]; files: Array<{ name: string; path: string; bytes: number }>; message: string } | null>(null);

  const fieldsEnabled = preferences.customerFieldsEnabled || {
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

  const handleStoragePreflight = async (driveLetter: string) => {
    setDeviceFeedback(null);
    const res = await apiClient.post('/api/v1/storage/preflight', {
      driveLetter,
      fileSizesMB: [450, 900],
    });
    if (res.ok && res.data?.report) {
      setDeviceFeedback(
        `Preflight on ${driveLetter}: passed=${res.data.report.passed}. ${
          res.data.report.warnings?.join(' ') || 'Checks completed cleanly.'
        }`
      );
    } else {
      setDeviceFeedback(res.error?.message || 'Preflight failed.');
    }
  };

  const handleStorageEject = async (driveLetter: string) => {
    setDeviceFeedback(null);
    const res = await apiClient.post('/api/v1/storage/eject', { driveLetter });
    if (res.ok && res.data) {
      setDeviceFeedback(res.data.message);
      refreshTelemetry();
    } else {
      setDeviceFeedback(`${res.error?.code || 'EJECT_NOTICE'}: ${res.error?.message || 'Volume eject unavailable.'}`);
    }
  };

  const handleMobilePing = async () => {
    setDeviceFeedback(null);
    const res = await apiClient.post('/api/v1/mobile/command', { action: 'ping' });
    if (res.ok && res.data) {
      setDeviceFeedback(res.data.message);
    } else {
      setDeviceFeedback(`${res.error?.code || 'ADB_OFFLINE'}: ${res.error?.message || 'ADB disconnected.'}`);
    }
  };

  const handleRunVerification = async () => {
    setIsRunningTests(true);
    try {
      const res = await apiClient.post('/api/v1/verification/runs', undefined, { timeoutMs: 60_000 });
      if (res.ok && res.data) {
        setTestResults(res.data.results || []);
        setTestSummary({
          passed: res.data.passedCount || 0,
          failed: res.data.failedCount || 0,
          unavailable: res.data.unavailableCount || 0,
          skipped: res.data.skippedCount || 0,
          total: res.data.totalCount || 0,
        });
      }
    } finally {
      setIsRunningTests(false);
    }
  };

  const downloadJsonFile = (filename: string, data: unknown) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const tabs: Array<{ id: WorkspaceTab; label: string; icon: any }> = [
    { id: 'LEDGER', label: 'Task Ledgers & Audit', icon: BarChart3 },
    { id: 'CUSTOMERS', label: `Customer Records (${customers.length})`, icon: Users },
    { id: 'FILES_MEDIA', label: 'Files & Media', icon: FolderOpen },
    { id: 'DEVICES', label: 'Storage & Hardware Bridges', icon: HardDrive },
    { id: 'VERIFICATION', label: 'Verification Suite', icon: CheckCircle2 },
  ];

  return (
    <div className="flex-1 flex flex-col min-h-0 min-w-0 p-4 lg:p-6 overflow-y-auto space-y-5">
      <NxSectionHeader
        title="Workspace & Tasks"
        subtitle="Execution ledgers, encrypted customer vault, safe file operations, device bridges, and verification harness."
      />

      <div
        className="flex items-center gap-1.5 border-b pb-2 overflow-x-auto shrink-0"
        style={{ borderColor: 'var(--border-subtle)' }}
      >
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap cursor-pointer transition-colors"
              style={{
                backgroundColor: active ? 'var(--accent)' : 'transparent',
                color: active ? '#ffffff' : 'var(--text-muted)',
              }}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {activeTab === 'LEDGER' && <StatisticsHistory />}

      {/* TAB: ENCRYPTED CUSTOMER RECORDS */}
      {activeTab === 'CUSTOMERS' && (
        <div className="space-y-4">
          <NxCard elevated className="p-3.5 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2">
              {operatingMode === 'CUSTOMER_SAFE' ? (
                <Shield className="w-4 h-4 shrink-0" style={{ color: 'var(--status-warning)' }} />
              ) : (
                <Lock className="w-4 h-4 shrink-0" style={{ color: 'var(--status-success)' }} />
              )}
              <span style={{ color: 'var(--text-main)' }}>
                <strong>AES-256-GCM Vault</strong> · Default masked view (<span className="font-mono">*****1234</span>).{' '}
                {operatingMode === 'CUSTOMER_SAFE'
                  ? 'Customer Safe Mode: unmasked reveal, delete, and encrypted backup are locked.'
                  : 'Owner Mode: single-record reveal and encrypted backup permitted.'}
              </span>
            </div>
            <NxStatusText status={operatingMode} />
          </NxCard>

          {custFeedback && (
            <NxCard className="p-3 flex items-center justify-between gap-2 text-xs font-mono">
              <span className="nx-wrap-anywhere" style={{ color: 'var(--text-main)' }}>
                {custFeedback}
              </span>
              <button type="button" onClick={() => setCustFeedback(null)} className="underline cursor-pointer shrink-0">
                Dismiss
              </button>
            </NxCard>
          )}

          {/* Create Customer Form */}
          <NxCard className="p-4 space-y-3">
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text-main)' }}>
              Add Encrypted Customer / Repair Record
            </h2>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!newCustName.trim()) return;
                const res = await createCustomer({
                  name: newCustName.trim(),
                  phone: newCustPhone.trim() || undefined,
                  cnic: newCustCnic.trim() || undefined,
                  deviceModel: newCustDevice.trim() || undefined,
                  imei: newCustImei.trim() || undefined,
                  paymentStatus: newCustPayment,
                  repairNotes: newCustNotes.trim() || undefined,
                });
                if (res.ok && res.customer) {
                  setCustFeedback(`Saved encrypted record for ${res.customer.name} (masked default).`);
                  setNewCustName('');
                  setNewCustPhone('');
                  setNewCustCnic('');
                  setNewCustDevice('');
                  setNewCustImei('');
                  setNewCustNotes('');
                } else {
                  setCustFeedback(res.error || 'Failed to save customer record.');
                }
              }}
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs"
            >
              <input
                type="text"
                required
                value={newCustName}
                onChange={(e) => setNewCustName(e.target.value)}
                placeholder="Customer Full Name *"
                className="px-3 py-1.5 rounded-md border outline-none"
                style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border-subtle)', color: 'var(--text-main)' }}
              />
              {fieldsEnabled.phone && (
                <input
                  type="text"
                  value={newCustPhone}
                  onChange={(e) => setNewCustPhone(e.target.value)}
                  placeholder="Phone (e.g. 03001234567)"
                  className="px-3 py-1.5 rounded-md border outline-none font-mono"
                  style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border-subtle)', color: 'var(--text-main)' }}
                />
              )}
              {fieldsEnabled.cnic && (
                <input
                  type="text"
                  value={newCustCnic}
                  onChange={(e) => setNewCustCnic(e.target.value)}
                  placeholder="CNIC (encrypted on save)"
                  className="px-3 py-1.5 rounded-md border outline-none font-mono"
                  style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border-subtle)', color: 'var(--text-main)' }}
                />
              )}
              {fieldsEnabled.deviceModel && (
                <input
                  type="text"
                  value={newCustDevice}
                  onChange={(e) => setNewCustDevice(e.target.value)}
                  placeholder="Device Model (e.g. iPhone 13)"
                  className="px-3 py-1.5 rounded-md border outline-none"
                  style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border-subtle)', color: 'var(--text-main)' }}
                />
              )}
              {fieldsEnabled.imei && (
                <input
                  type="text"
                  value={newCustImei}
                  onChange={(e) => setNewCustImei(e.target.value)}
                  placeholder="IMEI / Serial"
                  className="px-3 py-1.5 rounded-md border outline-none font-mono"
                  style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border-subtle)', color: 'var(--text-main)' }}
                />
              )}
              {fieldsEnabled.paymentStatus && (
                <select
                  value={newCustPayment}
                  onChange={(e) => setNewCustPayment(e.target.value as 'PAID' | 'PENDING' | 'PARTIAL' | 'NA')}
                  className="px-3 py-1.5 rounded-md border outline-none font-mono"
                  style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border-subtle)', color: 'var(--text-main)' }}
                >
                  <option value="PENDING">Payment: PENDING</option>
                  <option value="PAID">Payment: PAID</option>
                  <option value="PARTIAL">Payment: PARTIAL</option>
                  <option value="NA">Payment: N/A</option>
                </select>
              )}
              <input
                type="text"
                value={newCustNotes}
                onChange={(e) => setNewCustNotes(e.target.value)}
                placeholder="Repair issue / notes..."
                className="sm:col-span-2 px-3 py-1.5 rounded-md border outline-none"
                style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border-subtle)', color: 'var(--text-main)' }}
              />
              <NxButton type="submit" variant="primary" disabled={!newCustName.trim()}>
                <Plus className="w-3.5 h-3.5" />
                <span>Encrypt &amp; Save Customer</span>
              </NxButton>
            </form>
          </NxCard>

          {/* Search, Filter & Backup Controls */}
          <NxCard className="p-3.5 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={custQuery}
                onChange={(e) => {
                  setCustQuery(e.target.value);
                  refreshCustomers(e.target.value, custIncludeArchived);
                }}
                placeholder="Search name, phone, device..."
                className="px-3 py-1.5 rounded-md border outline-none font-mono min-w-[210px]"
                style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border-subtle)', color: 'var(--text-main)' }}
              />
              <label className="flex items-center gap-1.5 cursor-pointer font-mono" style={{ color: 'var(--text-muted)' }}>
                <input
                  type="checkbox"
                  checked={custIncludeArchived}
                  onChange={(e) => {
                    setCustIncludeArchived(e.target.checked);
                    refreshCustomers(custQuery, e.target.checked);
                  }}
                />
                <span>Include Archived</span>
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <NxButton
                size="sm"
                variant="secondary"
                onClick={async () => {
                  const res = await exportSanitizedCustomers(custIncludeArchived);
                  if (res?.ok) {
                    downloadJsonFile('nx_customers_sanitized.json', res);
                    setCustFeedback(`Exported ${res.count} sanitized customer summary record(s).`);
                  }
                }}
              >
                <Download className="w-3.5 h-3.5" />
                <span>Sanitized JSON</span>
              </NxButton>
              <NxButton
                size="sm"
                variant="secondary"
                disabled={operatingMode === 'CUSTOMER_SAFE'}
                onClick={async () => {
                  const res = await exportCustomerBackup();
                  if (res.ok && res.backup) {
                    downloadJsonFile('nx_customer_vault_encrypted_backup.json', res.backup);
                    setCustFeedback(`Downloaded AES-256-GCM encrypted backup (${res.backup.recordCount} records).`);
                  } else {
                    setCustFeedback(res.error || 'Encrypted backup blocked.');
                  }
                }}
              >
                <Download className="w-3.5 h-3.5" />
                <span>Encrypted Backup</span>
              </NxButton>
            </div>
          </NxCard>

          {/* Masked Customer Table */}
          <NxCard className="overflow-hidden">
            <div className="overflow-x-auto">
              {customers.length === 0 ? (
                <div className="p-6 text-center text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
                  No matching customer records in encrypted vault.
                </div>
              ) : (
                <table className="w-full text-left text-xs border-collapse min-w-[700px]">
                  <thead>
                    <tr
                      className="border-b font-mono text-[11px] uppercase"
                      style={{ backgroundColor: 'var(--bg-surface-elevated)', borderColor: 'var(--border-subtle)', color: 'var(--text-muted)' }}
                    >
                      <th className="py-2 px-3">Customer</th>
                      <th className="py-2 px-3">Phone</th>
                      <th className="py-2 px-3">CNIC</th>
                      <th className="py-2 px-3">Device / IMEI</th>
                      <th className="py-2 px-3">Payment / Svc</th>
                      <th className="py-2 px-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y font-mono tabular-nums" style={{ borderColor: 'var(--border-subtle)' }}>
                    {customers.map((c) => (
                      <tr key={c.customerId}>
                        <td className="py-2 px-3 font-sans">
                          <div className="font-semibold" style={{ color: 'var(--text-main)' }}>
                            {c.name} {c.archived && <span className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>(ARCHIVED)</span>}
                          </div>
                          <div className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>{c.customerId}</div>
                        </td>
                        <td className="py-2 px-3">{c.phoneMasked || '—'}</td>
                        <td className="py-2 px-3">{c.cnicMasked || '—'}</td>
                        <td className="py-2 px-3 font-sans">
                          <div>{c.deviceModel || '—'}</div>
                          {c.imeiMasked && <div className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>{c.imeiMasked}</div>}
                        </td>
                        <td className="py-2 px-3">
                          <span>{c.paymentStatus}</span>
                          <span className="ml-1.5 text-[10px]" style={{ color: 'var(--text-muted)' }}>({c.serviceHistory.length}x)</span>
                        </td>
                        <td className="py-2 px-3 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            <NxButton
                              size="sm"
                              variant="secondary"
                              onClick={async () => {
                                const res = await getCustomerDetail(c.customerId, false);
                                if (res.ok && res.customer) setSelectedCustomer(res.customer);
                              }}
                            >
                              Details
                            </NxButton>
                            <NxButton
                              size="sm"
                              variant="secondary"
                              onClick={async () => {
                                const res = await getCustomerDetail(c.customerId, true);
                                if (res.ok && res.customer) {
                                  setSelectedCustomer(res.customer);
                                  setCustFeedback(`Owner unmasked inspection logged for ${res.customer.name}.`);
                                } else {
                                  setCustFeedback(res.error || 'Reveal blocked in Customer Mode.');
                                }
                              }}
                            >
                              <Eye className="w-3 h-3" />
                              <span>Reveal</span>
                            </NxButton>
                            <NxButton
                              size="sm"
                              variant="ghost"
                              onClick={async () => {
                                await archiveCustomerRecord(c.customerId, !c.archived);
                              }}
                              title={c.archived ? 'Restore archived record' : 'Archive record'}
                            >
                              <Archive className="w-3.5 h-3.5" />
                            </NxButton>
                            {confirmDeleteCustId === c.customerId ? (
                              <>
                                <NxButton
                                  size="sm"
                                  variant="danger"
                                  onClick={async () => {
                                    const res = await deleteCustomerRecord(c.customerId);
                                    setConfirmDeleteCustId(null);
                                    if (res.ok && selectedCustomer?.customerId === c.customerId) {
                                      setSelectedCustomer(null);
                                    } else if (!res.ok) {
                                      setCustFeedback(res.error || 'Delete blocked.');
                                    }
                                  }}
                                >
                                  Confirm
                                </NxButton>
                                <NxButton size="sm" variant="ghost" onClick={() => setConfirmDeleteCustId(null)}>
                                  Cancel
                                </NxButton>
                              </>
                            ) : (
                              <NxButton
                                size="sm"
                                variant="ghost"
                                onClick={() => setConfirmDeleteCustId(c.customerId)}
                              >
                                <Trash2 className="w-3.5 h-3.5" style={{ color: 'var(--status-danger)' }} />
                              </NxButton>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </NxCard>

          {/* Selected Customer Detail + Service History */}
          {selectedCustomer && (
            <NxCard elevated className="p-4 space-y-3 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="font-semibold text-sm" style={{ color: 'var(--text-main)' }}>
                    {selectedCustomer.name} ·{' '}
                    <span className="font-mono text-xs" style={{ color: 'var(--accent)' }}>
                      {selectedCustomer.sensitiveRevealed ? 'OWNER REVEAL ACTIVE' : 'MASKED SUMMARY'}
                    </span>
                  </h3>
                  <div className="font-mono text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                    Phone: {selectedCustomer.sensitiveRevealed ? selectedCustomer.phone || '—' : selectedCustomer.phoneMasked || '—'} ·{' '}
                    CNIC: {selectedCustomer.sensitiveRevealed ? selectedCustomer.cnic || '—' : selectedCustomer.cnicMasked || '—'} ·{' '}
                    IMEI: {selectedCustomer.sensitiveRevealed ? selectedCustomer.imei || '—' : selectedCustomer.imeiMasked || '—'}
                  </div>
                </div>
                <NxButton size="sm" variant="ghost" onClick={() => setSelectedCustomer(null)}>
                  Close
                </NxButton>
              </div>

              {selectedCustomer.repairNotes && (
                <div className="p-2 rounded border" style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border-subtle)' }}>
                  Notes: {selectedCustomer.repairNotes}
                </div>
              )}

              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!svcIssue.trim()) return;
                  const amt = svcAmount.trim() ? Number(svcAmount) : undefined;
                  const res = await addCustomerServiceEntry(selectedCustomer.customerId, {
                    issue: svcIssue.trim(),
                    resolution: svcResolution.trim() || undefined,
                    amountPKR: Number.isFinite(amt) ? amt : undefined,
                  });
                  if (res.ok && res.customer) {
                    setSelectedCustomer(res.customer);
                    setSvcIssue('');
                    setSvcAmount('');
                    setSvcResolution('');
                  }
                }}
                className="grid grid-cols-1 sm:grid-cols-12 gap-2"
              >
                <input
                  type="text"
                  required
                  value={svcIssue}
                  onChange={(e) => setSvcIssue(e.target.value)}
                  placeholder="Service issue (e.g. Screen replacement)..."
                  className="sm:col-span-5 px-2.5 py-1.5 rounded-md border outline-none"
                  style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border-subtle)', color: 'var(--text-main)' }}
                />
                <input
                  type="text"
                  value={svcResolution}
                  onChange={(e) => setSvcResolution(e.target.value)}
                  placeholder="Resolution..."
                  className="sm:col-span-3 px-2.5 py-1.5 rounded-md border outline-none"
                  style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border-subtle)', color: 'var(--text-main)' }}
                />
                <input
                  type="number"
                  value={svcAmount}
                  onChange={(e) => setSvcAmount(e.target.value)}
                  placeholder="Amount PKR"
                  className="sm:col-span-2 px-2.5 py-1.5 rounded-md border outline-none font-mono"
                  style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border-subtle)', color: 'var(--text-main)' }}
                />
                <NxButton type="submit" size="sm" variant="primary" className="sm:col-span-2" disabled={!svcIssue.trim()}>
                  Log Service
                </NxButton>
              </form>

              {selectedCustomer.serviceHistory.length > 0 && (
                <div className="space-y-1.5 font-mono text-[11px]">
                  {selectedCustomer.serviceHistory.map((svc) => (
                    <div
                      key={svc.id}
                      className="p-2 rounded border flex flex-wrap items-center justify-between gap-2"
                      style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border-subtle)' }}
                    >
                      <span>
                        {new Date(svc.date).toLocaleDateString()} · {svc.issue}
                        {svc.resolution ? ` -> ${svc.resolution}` : ''}
                      </span>
                      <span>
                        {svc.amountPKR !== undefined ? `PKR ${svc.amountPKR}` : '—'} · {svc.paymentStatus}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </NxCard>
          )}

          {/* Encrypted Vault Restore */}
          {operatingMode === 'OWNER_PRIVATE' && (
            <NxCard className="p-4 space-y-2 text-xs">
              <div className="font-semibold" style={{ color: 'var(--text-main)' }}>
                Restore Encrypted Backup Bundle
              </div>
              <div className="flex flex-wrap gap-2">
                <input
                  type="text"
                  value={restoreJson}
                  onChange={(e) => setRestoreJson(e.target.value)}
                  placeholder="Paste encrypted backup JSON bundle here..."
                  className="flex-1 min-w-[240px] px-3 py-1.5 rounded-md border font-mono outline-none"
                  style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border-subtle)', color: 'var(--text-main)' }}
                />
                <NxButton
                  size="sm"
                  variant="secondary"
                  disabled={!restoreJson.trim()}
                  onClick={async () => {
                    try {
                      const parsed = JSON.parse(restoreJson);
                      const res = await restoreCustomerBackup(parsed);
                      if (res.ok) {
                        setCustFeedback(`Restored ${res.restoredCount} encrypted customer record(s).`);
                        setRestoreJson('');
                      } else {
                        setCustFeedback(res.error || 'Backup restore failed.');
                      }
                    } catch {
                      setCustFeedback('Invalid encrypted backup JSON syntax.');
                    }
                  }}
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Restore Backup</span>
                </NxButton>
              </div>
            </NxCard>
          )}
        </div>
      )}

      {/* TAB: SAFE FILES & LOCAL MEDIA DISCOVERY */}
      {activeTab === 'FILES_MEDIA' && (
        <div className="space-y-4">
          {fileFeedback && (
            <NxCard elevated className="p-3 flex items-center justify-between gap-2 text-xs font-mono">
              <span className="nx-wrap-anywhere" style={{ color: 'var(--text-main)' }}>{fileFeedback}</span>
              <button type="button" onClick={() => setFileFeedback(null)} className="underline cursor-pointer shrink-0">Dismiss</button>
            </NxCard>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <NxCard className="p-4 space-y-3 text-xs">
              <h2 className="text-sm font-semibold" style={{ color: 'var(--text-main)' }}>
                Safe Workspace File &amp; Folder Operations
              </h2>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={dirPath}
                  onChange={(e) => setDirPath(e.target.value)}
                  placeholder="Directory path (e.g. data)"
                  className="flex-1 px-3 py-1.5 rounded-md border font-mono outline-none"
                  style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border-subtle)', color: 'var(--text-main)' }}
                />
                <NxButton
                  size="sm"
                  variant="secondary"
                  onClick={async () => {
                    const res = await listSafeFiles(dirPath);
                    if (res?.ok && Array.isArray(res.entries)) {
                      setDirEntries(res.entries);
                      setFileFeedback(res.message);
                    } else {
                      setDirEntries([]);
                      setFileFeedback(res?.error?.message || 'Blocked or missing directory.');
                    }
                  }}
                >
                  List Directory
                </NxButton>
              </div>

              {dirEntries.length > 0 && (
                <div
                  className="max-h-48 overflow-y-auto rounded border divide-y font-mono text-[11px]"
                  style={{ borderColor: 'var(--border-subtle)', backgroundColor: 'var(--bg-app)' }}
                >
                  {dirEntries.map((ent) => (
                    <div key={ent.path} className="px-2.5 py-1.5 flex items-center justify-between gap-2">
                      <span className="truncate">{ent.isDirectory ? `[DIR] ${ent.name}` : ent.name}</span>
                      <span style={{ color: 'var(--text-muted)' }}>{ent.isDirectory ? 'folder' : `${ent.bytes} B`}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="pt-2 border-t space-y-2" style={{ borderColor: 'var(--border-subtle)' }}>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newFolderInput}
                    onChange={(e) => setNewFolderInput(e.target.value)}
                    placeholder="New folder path..."
                    className="flex-1 px-3 py-1.5 rounded-md border font-mono outline-none"
                    style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border-subtle)', color: 'var(--text-main)' }}
                  />
                  <NxButton
                    size="sm"
                    variant="secondary"
                    onClick={async () => {
                      const res = await createSafeFolder(newFolderInput);
                      setFileFeedback(res?.message || res?.error?.message || 'Folder action finished.');
                    }}
                  >
                    Create Folder
                  </NxButton>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                  <input
                    type="text"
                    value={newFilePathInput}
                    onChange={(e) => setNewFilePathInput(e.target.value)}
                    placeholder="File path..."
                    className="sm:col-span-5 px-2.5 py-1.5 rounded-md border font-mono outline-none"
                    style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border-subtle)', color: 'var(--text-main)' }}
                  />
                  <input
                    type="text"
                    value={newFileContentInput}
                    onChange={(e) => setNewFileContentInput(e.target.value)}
                    placeholder="Note/file text..."
                    className="sm:col-span-5 px-2.5 py-1.5 rounded-md border outline-none"
                    style={{ backgroundColor: 'var(--bg-app)', borderColor: 'var(--border-subtle)', color: 'var(--text-main)' }}
                  />
                  <NxButton
                    size="sm"
                    variant="primary"
                    className="sm:col-span-2"
                    onClick={async () => {
                      const res = await createSafeFile(newFilePathInput, newFileContentInput);
                      setFileFeedback(res?.message || res?.error?.message || 'File write checked.');
                    }}
                  >
                    Write
                  </NxButton>
                </div>
              </div>
            </NxCard>

            <NxCard className="p-4 space-y-3 text-xs">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold" style={{ color: 'var(--text-main)' }}>
                    Local Media Discovery
                  </h2>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    Scans Music, Videos, Downloads, Desktop, and data/media. Desktop playback requires a Windows host.
                  </p>
                </div>
                <NxButton
                  size="sm"
                  variant="secondary"
                  onClick={async () => {
                    const res = await scanMediaFiles();
                    if (res?.ok) setMediaResult(res);
                  }}
                >
                  <Music className="w-3.5 h-3.5" />
                  <span>Scan Media</span>
                </NxButton>
              </div>

              {mediaResult ? (
                <div className="space-y-2 font-mono text-[11px]">
                  <div style={{ color: 'var(--accent)' }}>{mediaResult.message}</div>
                  {mediaResult.files.length > 0 && (
                    <div className="max-h-48 overflow-y-auto rounded border divide-y" style={{ borderColor: 'var(--border-subtle)', backgroundColor: 'var(--bg-app)' }}>
                      {mediaResult.files.map((f) => (
                        <div key={f.path} className="px-2.5 py-1.5 flex items-center justify-between gap-2">
                          <span className="truncate">{f.name}</span>
                          <span style={{ color: 'var(--text-muted)' }}>{Math.round(f.bytes / 1024)} KB</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="py-6 text-center font-mono text-xs" style={{ color: 'var(--text-muted)' }}>
                  Click &ldquo;Scan Media&rdquo; to inspect local workstation media folders.
                </div>
              )}
            </NxCard>
          </div>
        </div>
      )}

      {activeTab === 'DEVICES' && (
        <div className="space-y-4">
          {deviceFeedback && (
            <NxCard elevated className="p-3 flex items-center justify-between gap-2 text-xs font-mono">
              <span className="nx-wrap-anywhere" style={{ color: 'var(--text-main)' }}>
                {deviceFeedback}
              </span>
              <button type="button" onClick={() => setDeviceFeedback(null)} className="underline cursor-pointer shrink-0">
                Dismiss
              </button>
            </NxCard>
          )}

          <NxCard className="p-4 space-y-3">
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text-main)' }}>
              Storage Volumes ({telemetry.storageDevices.length})
            </h2>
            <div className="space-y-2.5">
              {telemetry.storageDevices.map((vol) => (
                <NxCard
                  key={vol.letter}
                  elevated
                  className="p-3 flex flex-wrap items-center justify-between gap-3 text-xs font-mono min-w-0"
                >
                  <div className="space-y-0.5 min-w-0">
                    <div className="font-semibold truncate" style={{ color: 'var(--text-main)' }}>
                      {vol.letter} — {vol.label}
                    </div>
                    <div className="tabular-nums text-[11px] nx-wrap-anywhere" style={{ color: 'var(--text-muted)' }}>
                      Free: {vol.freeGB ?? 'N/A'} GB / Total: {vol.totalGB ?? 'N/A'} GB · FS:{' '}
                      {vol.filesystem || 'UNKNOWN'} · {vol.source}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <NxButton size="sm" variant="secondary" onClick={() => handleStoragePreflight(vol.letter)}>
                      Run Preflight
                    </NxButton>
                    {!vol.isProtected && (
                      <NxButton size="sm" variant="danger" onClick={() => handleStorageEject(vol.letter)}>
                        Safe Eject
                      </NxButton>
                    )}
                  </div>
                </NxCard>
              ))}
            </div>
          </NxCard>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <NxCard className="p-4 space-y-2 text-xs font-mono min-w-0">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-sm font-sans" style={{ color: 'var(--text-main)' }}>
                  Android ADB Bridge
                </span>
                <NxStatusText status={mobileBridge?.connectionState || 'UNAVAILABLE'} />
              </div>
              <div className="nx-wrap-anywhere" style={{ color: 'var(--text-muted)' }}>
                Device: {mobileBridge?.deviceName || 'Not detected'}
              </div>
              <div className="nx-wrap-anywhere" style={{ color: 'var(--text-muted)' }}>
                Detail: {mobileBridge?.detail || 'No active ADB connection'}
              </div>
              <div className="pt-1">
                <NxButton size="sm" variant="secondary" onClick={handleMobilePing}>
                  <Smartphone className="w-3.5 h-3.5" />
                  <span>Ping ADB Device</span>
                </NxButton>
              </div>
            </NxCard>

            <NxCard className="p-4 space-y-2 text-xs font-mono min-w-0">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-sm font-sans" style={{ color: 'var(--text-main)' }}>
                  Browser CDP Session
                </span>
                <NxStatusText status={browserSession?.status || 'UNAVAILABLE'} />
              </div>
              <div className="nx-wrap-anywhere" style={{ color: 'var(--text-muted)' }}>
                Endpoint: {browserSession?.cdpEndpoint || 'http://127.0.0.1:9222'}
              </div>
              <div className="nx-wrap-anywhere" style={{ color: 'var(--text-muted)' }}>
                {browserSession?.detail || 'Probe pending'}
              </div>
            </NxCard>
          </div>
        </div>
      )}

      {activeTab === 'VERIFICATION' && (
        <NxCard className="p-4 lg:p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold" style={{ color: 'var(--text-main)' }}>
                Executable Verification Harness
              </h2>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Runs real checks across OS telemetry, storage preflight, policy guard, persistence, and connected devices.
              </p>
            </div>
            <NxButton variant="primary" disabled={isRunningTests} onClick={handleRunVerification}>
              <RefreshCw className={`w-3.5 h-3.5 ${isRunningTests ? 'animate-spin' : ''}`} />
              <span>{isRunningTests ? 'Running Suite...' : 'Run Verification Suite'}</span>
            </NxButton>
          </div>

          {testSummary && (
            <NxCard elevated className="p-3 flex flex-wrap items-center justify-between gap-2 text-xs font-mono tabular-nums">
              <span style={{ color: 'var(--text-main)' }}>
                PASS: {testSummary.passed} · FAIL: {testSummary.failed} · UNAVAILABLE: {testSummary.unavailable} · SKIPPED: {testSummary.skipped} (Total {testSummary.total})
              </span>
              <NxStatusText status={testSummary.failed === 0 ? 'PASS' : 'FAIL'} />
            </NxCard>
          )}

          {testResults.length === 0 ? (
            <div className="py-8 text-center text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
              Click &ldquo;Run Verification Suite&rdquo; to execute real checks.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {testResults.map((t) => (
                <NxCard key={t.test_id} elevated className="p-3.5 space-y-1.5 font-mono text-xs min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold truncate" style={{ color: 'var(--text-main)' }}>
                      <span style={{ color: 'var(--accent)' }}>{t.test_id}</span> · {t.name}
                    </span>
                    <span className="shrink-0 tabular-nums">
                      <NxStatusText status={t.status} /> ({t.duration}ms)
                    </span>
                  </div>
                  <p className="font-sans text-[11px] nx-wrap-anywhere" style={{ color: 'var(--text-muted)' }}>
                    {t.description}
                  </p>
                  <div
                    className="p-2 rounded border text-[11px] space-y-1 nx-wrap-anywhere"
                    style={{
                      backgroundColor: 'var(--bg-app)',
                      borderColor: 'var(--border-subtle)',
                      color: 'var(--text-main)',
                    }}
                  >
                    <div style={{ color: 'var(--text-muted)' }}>CMD: {t.command}</div>
                    <div>ACTUAL: {t.actual}</div>
                    {t.stderr && <div style={{ color: 'var(--status-warning)' }}>STDERR: {t.stderr}</div>}
                  </div>
                </NxCard>
              ))}
            </div>
          )}
        </NxCard>
      )}
    </div>
  );
};
