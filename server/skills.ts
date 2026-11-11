import type { SkillManifest } from '../src/types/agent.ts';

// Initial Skills with strict permission boundaries & progressive disclosure
const initialSkills: SkillManifest[] = [
  {
    skillId: 'shop-usb-packaging',
    name: 'Shop USB Packaging & Verification',
    version: '2.4.0',
    triggers: ['usb', 'copy to usb', 'format usb', 'media pack', 'folder to usb'],
    description: '10-point transactional pre-flight check, FAT32 4GB limit split, and checksum verification.',
    permissions: {
      filesystem: { read: ['D:\\', 'E:\\', 'F:\\', 'G:\\'], write: ['F:\\', 'G:\\'] },
      network: 'none',
      execution: ['robocopy', 'certutil'],
      riskLevel: 'SAFE_REVERSIBLE',
    },
    resourceBudget: { ramMB: 64, cpuPercent: 15 },
    isInstalled: true,
  },
  {
    skillId: 'windows-desktop-control',
    name: 'Windows Desktop & UI Automation',
    version: '3.1.0',
    triggers: ['minimize', 'open', 'close', 'taskbar', 'volume', 'screen', 'chrome', 'browser'],
    description: 'Autonomous level 1-5 automation hierarchy: Win32, App CLI, DOM, Windows UIA, and Mouse/Keyboard fallback.',
    permissions: {
      filesystem: { read: ['D:\\', 'E:\\'], write: [] },
      network: 'full',
      execution: ['user32.dll', 'uiautomation', 'powershell'],
      riskLevel: 'SAFE_REVERSIBLE',
    },
    resourceBudget: { ramMB: 48, cpuPercent: 10 },
    isInstalled: true,
  },
  {
    skillId: 'wireless-android-bridge',
    name: 'Wireless Android Mobile Bridge',
    version: '1.2.0',
    triggers: ['mobile', 'phone', 'android', 'transfer to phone', 'clipboard sync'],
    description: 'Wireless ADB bridge over TCP/IP 5555 for file transfer, clipboard sync, and notification relay.',
    permissions: {
      filesystem: { read: ['D:\\'], write: [] },
      network: 'lan_only',
      execution: ['adb.exe'],
      riskLevel: 'SAFE_REVERSIBLE',
    },
    resourceBudget: { ramMB: 32, cpuPercent: 8 },
    isInstalled: true,
  },
  {
    skillId: 'system-diagnostics',
    name: 'System Health & Guard Engine',
    version: '1.0.0',
    triggers: ['performance', 'cpu', 'ram', 'health', 'storage check', 'protection'],
    description: 'Continuous monitoring, HP 800 G1 memory protection, and C: OS Drive safety shield.',
    permissions: {
      filesystem: { read: ['C:\\', 'D:\\', 'E:\\'], write: [] },
      network: 'none',
      execution: ['wmic', 'typeperf'],
      riskLevel: 'READ_ONLY',
    },
    resourceBudget: { ramMB: 20, cpuPercent: 5 },
    isInstalled: true,
  },
];

let skillsStore: SkillManifest[] = [...initialSkills];

export class SkillsManager {
  public static getAllSkills(): SkillManifest[] {
    return skillsStore;
  }

  public static getSkillById(skillId: string): SkillManifest | undefined {
    return skillsStore.find((s) => s.skillId === skillId);
  }

  public static toggleSkill(skillId: string): SkillManifest | null {
    const skill = skillsStore.find((s) => s.skillId === skillId);
    if (!skill) return null;
    skill.isInstalled = !skill.isInstalled;
    return skill;
  }

  public static matchSkillByTrigger(prompt: string): SkillManifest | null {
    const lower = prompt.toLowerCase();
    for (const skill of skillsStore) {
      if (!skill.isInstalled) continue;
      for (const trigger of skill.triggers) {
        if (lower.includes(trigger.toLowerCase())) {
          return skill;
        }
      }
    }
    return null;
  }

  public static validateSkillPermission(
    skill: SkillManifest,
    targetPath: string,
    mode: 'read' | 'write'
  ): boolean {
    const allowedPaths = mode === 'read' ? skill.permissions.filesystem.read : skill.permissions.filesystem.write;
    const targetUpper = targetPath.toUpperCase().replace(/\//g, '\\');
    return allowedPaths.some((p) => {
      const pUpper = p.toUpperCase().replace(/\//g, '\\');
      return targetUpper.startsWith(pUpper);
    });
  }
}
