import { describe, it, expect } from 'bun:test';
import { orchestrator } from '../server/orchestrator.ts';
import { scrubSecrets } from '../server/security.ts';
import { isDestructiveSystemPath, validate10PointPreFlight } from '../server/fileOps.ts';
import { SkillsManager } from '../server/skills.ts';
import { LocalThinkerWorker } from '../server/workers.ts';
import { AIProviderRouter, MODEL_REGISTRY } from '../server/providers/aiProvider.ts';
import { VoiceProviderManager } from '../server/providers/voiceProvider.ts';
import { HardwareDiagnostics } from '../server/hardware.ts';
import { SafeLogger } from '../server/logger.ts';

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

  it('should isolate project quotas and manage cooldown in AIProviderRouter', () => {
    const testProjectId = 'test-gcp-project-isolation';
    expect(AIProviderRouter.isProjectCoolingDown(testProjectId)).toBe(false);

    AIProviderRouter.markCooldown(testProjectId, 60000);
    expect(AIProviderRouter.isProjectCoolingDown(testProjectId)).toBe(true);
  });

  it('should enforce skills permission boundaries', () => {
    const skill = SkillsManager.getSkillById('shop-usb-packaging');
    expect(skill).toBeDefined();

    expect(SkillsManager.validateSkillPermission(skill!, 'D:\\ShopMedia', 'read')).toBe(true);
    expect(SkillsManager.validateSkillPermission(skill!, 'F:\\CustomerUSB', 'write')).toBe(true);
    expect(SkillsManager.validateSkillPermission(skill!, 'C:\\Windows', 'write')).toBe(false);
  });

  it('should route models based on strategy and complexity in AIProviderRouter', () => {
    const fast = AIProviderRouter.selectModel('FAST');
    expect(fast.id).toBe('gemini-2.5-flash-lite');

    const best = AIProviderRouter.selectModel('BEST');
    expect(best.id).toBe('gemini-2.5-pro');

    const autoComplex = AIProviderRouter.selectModel('AUTO', 'complex');
    expect(autoComplex.id).toBe('gemini-2.5-pro');

    const local = AIProviderRouter.selectModel('LOCAL');
    expect(local.isLocal).toBe(true);
  });

  it('should support ElevenLabs voice provider with WebSpeech local fallback', async () => {
    const profiles = VoiceProviderManager.getProfiles();
    expect(profiles.length).toBeGreaterThanOrEqual(2);

    const res = await VoiceProviderManager.synthesizeSpeech('Testing speech output');
    expect(res.textSpoken).toBe('Testing speech output');
    expect(['elevenlabs', 'webspeech_local']).toContain(res.providerUsed);
  });

  it('should perform real hardware inspection with CPU, memory, and USB diagnostics', async () => {
    const report = await HardwareDiagnostics.inspectSystem();
    expect(report.cpu.cores).toBeGreaterThan(0);
    expect(report.memory.totalGB).toBeGreaterThan(0);
    expect(report.usbDevices.length).toBeGreaterThan(0);
  });

  it('should record structured logs and scrub secrets from log lines', () => {
    const entry = SafeLogger.info('SYSTEM', 'Connecting with api_key: AIzaSy_Secret_12345');
    expect(entry.message).not.toContain('AIzaSy_Secret_12345');
    expect(entry.message).toContain('[REDACTED_SECRET]');
  });
});
