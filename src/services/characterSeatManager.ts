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
