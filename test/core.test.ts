import { describe, it, expect } from 'bun:test';
import { orchestrator } from '../server/orchestrator.ts';
import { scrubSecrets } from '../server/security.ts';
import { isDestructiveSystemPath, validate10PointPreFlight } from '../server/fileOps.ts';
import { SkillsManager } from '../server/skills.ts';
import { LocalThinkerWorker } from '../server/workers.ts';
import { GeminiRouter } from '../server/geminiRouter.ts';

describe('NX AI Core Test Suite', () => {
  it('should transition orchestrator states and update companion expression', () => {
    orchestrator.setState('EXECUTING');
    expect(orchestrator.getState()).toBe('EXECUTING');
    expect(orchestrator.getCompanion().expression).toBe('WORKING');

    orchestrator.setState('VERIFYING');
    expect(orchestrator.getState()).toBe('VERIFYING');
    expect(orchestrator.getCompanion().expression).toBe('VERIFYING');

    orchestrator.setState('IDLE');
    expect(orchestrator.getState()).toBe('IDLE');
    expect(orchestrator.getCompanion().expression).toBe('FRIENDLY');
  });

  it('should scrub credentials, tokens, and Pakistani CNIC numbers', () => {
    const input = 'My password is SuperSecretPass! and my cnic is 42101-9876543-2 and auth is bearer secretToken1234567890123456';
    const result = scrubSecrets(input);

    expect(result.hadSecrets).toBe(true);
    expect(result.cleanText).not.toContain('SuperSecretPass!');
    expect(result.cleanText).not.toContain('42101-9876543-2');
    expect(result.cleanText).not.toContain('secretToken1234567890123456');
    expect(result.cleanText).toContain('[REDACTED_SECRET]');
    expect(result.cleanText).toContain('[REDACTED_CNIC]');
  });

  it('should enforce permanent destructive protection on C: Windows system drive', () => {
    expect(isDestructiveSystemPath('C:\\')).toBe(true);
    expect(isDestructiveSystemPath('C:\\Windows')).toBe(true);
    expect(isDestructiveSystemPath('C:\\Program Files\\App')).toBe(true);
    expect(isDestructiveSystemPath('D:\\ShopMedia')).toBe(false);
    expect(isDestructiveSystemPath('F:\\Removable')).toBe(false);
  });

  it('should detect FAT32 4GB limit and validate 10-point pre-flight checks', () => {
    const usbFat32 = {
      letter: 'F:\\',
      label: 'Kingston 64GB',
      type: 'USB' as const,
      isProtected: false,
      freeGB: 30,
      totalGB: 64,
      usedGB: 34,
      isBusy: false,
      filesystem: 'FAT32' as const,
    };

    // 5GB file exceeds FAT32 4096MB
    const reportOversized = validate10PointPreFlight(usbFat32, [5120]);
    expect(reportOversized.passed).toBe(false);
    expect(reportOversized.checks.fat32Safe).toBe(false);

    // Normal files under 4GB
    const reportNormal = validate10PointPreFlight(usbFat32, [450, 1200]);
    expect(reportNormal.passed).toBe(true);
    expect(reportNormal.checks.fat32Safe).toBe(true);
    expect(reportNormal.checks.sourceScanned).toBe(true);
  });

  it('should classify intents correctly via LocalThinkerWorker', () => {
    const storageIntent = LocalThinkerWorker.classifyIntent('Copy my media pack to USB 1');
    expect(storageIntent.domain).toBe('STORAGE');
    expect(storageIntent.actionRequired).toBe(true);

    const browserIntent = LocalThinkerWorker.classifyIntent('Open Chrome and search YouTube');
    expect(browserIntent.domain).toBe('BROWSER');
    expect(browserIntent.actionRequired).toBe(true);

    const companionIntent = LocalThinkerWorker.classifyIntent('Side mein chup ja');
    expect(companionIntent.domain).toBe('COMPANION');
  });

  it('should isolate project quotas and manage cooldown in GeminiRouter', () => {
    const testProjectId = 'test-gcp-project-isolation';
    expect(GeminiRouter.isProjectCoolingDown(testProjectId)).toBe(false);

    GeminiRouter.markProjectCooldown(testProjectId, 60000);
    expect(GeminiRouter.isProjectCoolingDown(testProjectId)).toBe(true);
  });

  it('should enforce skills permission boundaries', () => {
    const skill = SkillsManager.getSkillById('shop-usb-packaging');
    expect(skill).toBeDefined();

    expect(SkillsManager.validateSkillPermission(skill!, 'D:\\ShopMedia', 'read')).toBe(true);
    expect(SkillsManager.validateSkillPermission(skill!, 'F:\\CustomerUSB', 'write')).toBe(true);
    expect(SkillsManager.validateSkillPermission(skill!, 'C:\\Windows', 'write')).toBe(false);
  });
});
