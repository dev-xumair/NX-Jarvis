/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Character Seat Configuration & Window Observer Subsystem
 * Manages application-specific seating profiles, anchor coordinate interpolation,
 * monitor bounds clamping, and transition choreography (walk, jump/climb, sit, stand).
 */

import {
  AttachmentAnchor,
  CharacterPosture,
  CharacterAnimationState,
  WindowSeatConfig,
} from '../types/agent';

export interface WindowRect {
  x: number;
  y: number;
  width: number;
  height: number;
  title?: string;
  processName?: string;
  isMinimized?: boolean;
}

export interface DesktopBounds {
  width: number;
  height: number;
  taskbarHeight: number;
}

export const defaultSeatingProfiles: WindowSeatConfig[] = [
  {
    applicationId: 'google-chrome',
    processPattern: 'chrome.exe',
    anchor: 'top-right',
    offsetX: -60,
    offsetY: -35,
    scale: 'small',
    preferredPose: 'sitting',
    preferredAnimation: 'SITTING',
    zOrder: 999,
    enabled: true,
  },
  {
    applicationId: 'ms-edge',
    processPattern: 'msedge.exe',
    anchor: 'top-right',
    offsetX: -60,
    offsetY: -35,
    scale: 'small',
    preferredPose: 'sitting',
    preferredAnimation: 'SITTING',
    zOrder: 999,
    enabled: true,
  },
  {
    applicationId: 'file-explorer',
    processPattern: 'explorer.exe',
    anchor: 'top-left',
    offsetX: 70,
    offsetY: -35,
    scale: 'small',
    preferredPose: 'standing',
    preferredAnimation: 'STANDING',
    zOrder: 998,
    enabled: true,
  },
  {
    applicationId: 'nx-dashboard',
    processPattern: 'nx-agent',
    anchor: 'right-edge',
    offsetX: -40,
    offsetY: 80,
    scale: 'medium',
    preferredPose: 'standing',
    preferredAnimation: 'STANDING',
    zOrder: 999,
    enabled: true,
  },
  {
    applicationId: 'desktop-home',
    processPattern: 'desktop',
    anchor: 'bottom-right',
    offsetX: -30,
    offsetY: -60,
    scale: 'medium',
    preferredPose: 'sitting',
    preferredAnimation: 'IDLE',
    zOrder: 900,
    enabled: true,
  },
];

export class CharacterSeatManager {
  private profiles: Map<string, WindowSeatConfig> = new Map();

  constructor(initialProfiles: WindowSeatConfig[] = defaultSeatingProfiles) {
    initialProfiles.forEach((p) => this.profiles.set(p.applicationId, p));
  }

  public getProfiles(): WindowSeatConfig[] {
    return Array.from(this.profiles.values());
  }

  public registerProfile(config: WindowSeatConfig): void {
    this.profiles.set(config.applicationId, config);
  }

  public findMatchingProfile(processName: string, windowTitle: string): WindowSeatConfig | undefined {
    const proc = processName.toLowerCase();
    const title = windowTitle.toLowerCase();

    for (const profile of this.profiles.values()) {
      if (!profile.enabled) continue;
      const pattern = profile.processPattern.toLowerCase();
      if (proc.includes(pattern) || title.includes(pattern)) {
        return profile;
      }
    }
    return undefined;
  }

  /**
   * Multi-Token Natural Language Intent Parser:
   * Maps natural language variations in Urdu, Roman Urdu, and English to structural
   * character control directives (target, posture, action, scale, anchor).
   */
  public parseNaturalCommand(text: string): {
    action: 'ATTACH' | 'DETACH' | 'REPOSITION' | 'RESIZE' | 'POSTURE' | 'VISIBILITY' | 'UNKNOWN';
    targetApp?: string;
    posture?: CharacterPosture;
    anchor?: AttachmentAnchor;
    scale?: 'small' | 'medium' | 'large';
    visibility?: 'show' | 'hide';
    dockPosition?: string;
  } {
    const lower = text.toLowerCase();

    // 1. Visibility check
    if (lower.includes('chup') || lower.includes('hide') || lower.includes('disappear')) {
      return { action: 'VISIBILITY', visibility: 'hide' };
    }
    if (lower.includes('samne') || lower.includes('wapas') || lower.includes('show') || lower.includes('come back') || lower.includes('restore')) {
      return { action: 'VISIBILITY', visibility: 'show', dockPosition: 'dock_bottom_right' };
    }

    // 2. Posture check
    const isSit = lower.includes('beth') || lower.includes('baith') || lower.includes('sit');
    const isStand = lower.includes('khari') || lower.includes('khara') || lower.includes('stand');

    // 3. Application Attachment check
    let targetApp: string | undefined;
    if (lower.includes('chrome') || lower.includes('google')) targetApp = 'chrome.exe';
    else if (lower.includes('edge')) targetApp = 'msedge.exe';
    else if (lower.includes('explorer') || lower.includes('file')) targetApp = 'explorer.exe';
    else if (lower.includes('notepad')) targetApp = 'notepad.exe';

    if (targetApp && (lower.includes('upar') || lower.includes('top') || lower.includes('attach') || isSit)) {
      return {
        action: 'ATTACH',
        targetApp,
        anchor: lower.includes('side') ? 'right-edge' : 'top-right',
        posture: isSit ? 'sitting' : 'standing',
      };
    }

    // 4. Desktop Center / Home
    if (lower.includes('beech') || lower.includes('center') || lower.includes('darmiyan')) {
      return {
        action: 'REPOSITION',
        dockPosition: 'center',
        posture: isSit ? 'sitting' : 'standing',
      };
    }

    // 5. Directional repositioning
    if (lower.includes('right')) {
      return { action: 'REPOSITION', dockPosition: 'side_right', posture: isSit ? 'sitting' : 'standing' };
    }
    if (lower.includes('left')) {
      return { action: 'REPOSITION', dockPosition: 'side_left', posture: isSit ? 'sitting' : 'standing' };
    }
    if (lower.includes('corner')) {
      return { action: 'REPOSITION', dockPosition: 'dock_bottom_right', posture: isSit ? 'sitting' : 'standing' };
    }

    // 6. Scale resizing
    if (lower.includes('chhoti') || lower.includes('chota') || lower.includes('small') || lower.includes('compact')) {
      return { action: 'RESIZE', scale: 'small' };
    }
    if (lower.includes('badi') || lower.includes('bari') || lower.includes('large') || lower.includes('big')) {
      return { action: 'RESIZE', scale: 'large' };
    }
    if (lower.includes('normal')) {
      return { action: 'RESIZE', scale: 'medium' };
    }

    if (isSit) return { action: 'POSTURE', posture: 'sitting' };
    if (isStand) return { action: 'POSTURE', posture: 'standing' };

    return { action: 'UNKNOWN' };
  }

  /**
   * Generic Window Anchor Fallback:
   * Provides safe, intelligent anchor configuration for any unknown standard Windows application
   * (e.g. Notepad, Calculator, VS Code, Custom CRM, terminal, etc.)
   */
  public getGenericWindowSeatConfig(windowRect: WindowRect): WindowSeatConfig {
    // If window is wide (width > 800), perch sitting at the top-right title bar area
    const isWide = windowRect.width > 800;
    return {
      applicationId: `generic-${windowRect.processName || 'window'}`,
      processPattern: windowRect.processName || '.*',
      anchor: isWide ? 'top-right' : 'top-center',
      offsetX: isWide ? -50 : 0,
      offsetY: -35,
      scale: 'small',
      preferredPose: 'sitting',
      preferredAnimation: 'SITTING',
      zOrder: 995,
      enabled: true,
    };
  }

  /**
   * Calculates real screen coordinates (x, y) for an anchor on a given target window
   */
  public calculateAnchorPosition(
    windowRect: WindowRect,
    anchor: AttachmentAnchor,
    offsetX: number = 0,
    offsetY: number = 0,
    characterDimensions: { width: number; height: number } = { width: 220, height: 260 }
  ): { x: number; y: number } {
    let baseX = windowRect.x;
    let baseY = windowRect.y;

    switch (anchor) {
      case 'top-left':
        baseX = windowRect.x;
        baseY = windowRect.y - characterDimensions.height * 0.4;
        break;
      case 'top-center':
        baseX = windowRect.x + (windowRect.width - characterDimensions.width) / 2;
        baseY = windowRect.y - characterDimensions.height * 0.4;
        break;
      case 'top-right':
        baseX = windowRect.x + windowRect.width - characterDimensions.width;
        baseY = windowRect.y - characterDimensions.height * 0.4;
        break;
      case 'left-edge':
        baseX = windowRect.x - characterDimensions.width * 0.6;
        baseY = windowRect.y + windowRect.height / 3;
        break;
      case 'right-edge':
        baseX = windowRect.x + windowRect.width - characterDimensions.width * 0.4;
        baseY = windowRect.y + windowRect.height / 3;
        break;
      case 'bottom-left':
        baseX = windowRect.x;
        baseY = windowRect.y + windowRect.height - characterDimensions.height * 0.6;
        break;
      case 'bottom-right':
        baseX = windowRect.x + windowRect.width - characterDimensions.width;
        baseY = windowRect.y + windowRect.height - characterDimensions.height * 0.6;
        break;
      case 'custom':
      default:
        baseX = windowRect.x;
        baseY = windowRect.y;
        break;
    }

    return {
      x: Math.round(baseX + offsetX),
      y: Math.round(baseY + offsetY),
    };
  }

  /**
   * Ensures coordinates stay safely inside visible screen area and above the taskbar
   */
  public clampToSafeDesktopBounds(
    pos: { x: number; y: number },
    charSize: { width: number; height: number },
    desktop: DesktopBounds = { width: 1920, height: 1080, taskbarHeight: 48 }
  ): { x: number; y: number } {
    const margin = 12;
    const maxX = desktop.width - charSize.width - margin;
    const maxY = desktop.height - desktop.taskbarHeight - charSize.height - margin;

    return {
      x: Math.max(margin, Math.min(maxX, pos.x)),
      y: Math.max(margin, Math.min(maxY, pos.y)),
    };
  }

  /**
   * Generates keyframe animation coordinates for walk/jump choreography
   */
  public computeChoreographyPath(
    startPos: { x: number; y: number },
    targetPos: { x: number; y: number },
    type: 'walk' | 'jump' = 'jump'
  ): { x: number; y: number; animation: CharacterAnimationState }[] {
    const dx = targetPos.x - startPos.x;
    const dy = targetPos.y - startPos.y;
    const distance = Math.hypot(dx, dy);

    if (distance < 30) {
      return [{ ...targetPos, animation: 'IDLE' }];
    }

    const midX = (startPos.x + targetPos.x) / 2;
    // Jump arc lifts upward (-y in screen coords)
    const arcHeight = type === 'jump' ? Math.min(120, distance * 0.35) : 10;
    const midY = (startPos.y + targetPos.y) / 2 - arcHeight;

    return [
      { x: startPos.x, y: startPos.y, animation: type === 'jump' ? 'JUMPING' : 'WALKING' },
      { x: midX, y: midY, animation: type === 'jump' ? 'JUMPING' : 'WALKING' },
      { x: targetPos.x, y: targetPos.y, animation: 'ATTACHED_TO_WINDOW' },
    ];
  }
}

export const characterSeatManager = new CharacterSeatManager();
