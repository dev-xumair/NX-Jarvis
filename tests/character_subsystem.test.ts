/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Comprehensive Unit and Integration Tests for NX AI Character & Desktop Companion Subsystem
 */

import { describe, test, expect } from 'bun:test';
import {
  CharacterSeatManager,
  defaultSeatingProfiles,
} from '../src/services/characterSeatManager.ts';
import { nativeWindowTracker } from '../src/services/nativeWindowTracker.ts';
import fs from 'fs';
import path from 'path';

describe('NX AI Character Subsystem - Unit & Integration Tests', () => {
  const seatManager = new CharacterSeatManager(defaultSeatingProfiles);

  test('1. Character Seat Configuration & Coordinate Calculation - Chrome & File Explorer', () => {
    const chrome = seatManager.findMatchingProfile('chrome.exe', 'Google Chrome');
    expect(chrome).toBeDefined();
    expect(chrome?.anchor).toBe('top-right');
    expect(chrome?.preferredPose).toBe('sitting');

    const chromeWindow = { x: 200, y: 150, width: 1200, height: 800 };
    const charSize = { width: 220, height: 260 };
    const pos = seatManager.calculateAnchorPosition(
      chromeWindow,
      chrome!.anchor,
      chrome!.offsetX,
      chrome!.offsetY,
      charSize
    );
    expect(pos.x).toBe(1120);
    expect(pos.y).toBe(11);
  });

  test('2. Generic Window Anchor Fallback - Unknown Applications (Notepad, Custom Tools)', () => {
    const unknownWideWindow = {
      x: 100,
      y: 100,
      width: 1024,
      height: 600,
      processName: 'custom_erp.exe',
      title: 'Enterprise Billing',
    };
    const genericConfig = seatManager.getGenericWindowSeatConfig(unknownWideWindow);
    expect(genericConfig.anchor).toBe('top-right');
    expect(genericConfig.preferredPose).toBe('sitting');

    const unknownNarrowWindow = {
      x: 100,
      y: 100,
      width: 500,
      height: 400,
      processName: 'calculator.exe',
      title: 'Calculator',
    };
    const narrowConfig = seatManager.getGenericWindowSeatConfig(unknownNarrowWindow);
    expect(narrowConfig.anchor).toBe('top-center');
  });

  test('3. Desktop Safe Boundary Clamping - Taskbar and Multi-Monitor Safety', () => {
    const desktop = { width: 1920, height: 1080, taskbarHeight: 48 };
    const charSize = { width: 220, height: 260 };

    const overflowPos = { x: 1900, y: 1000 };
    const clamped = seatManager.clampToSafeDesktopBounds(overflowPos, charSize, desktop);
    expect(clamped.x).toBe(1920 - 220 - 12);
    expect(clamped.y).toBe(1080 - 48 - 260 - 12);

    const negativePos = { x: -50, y: -20 };
    const clampedMin = seatManager.clampToSafeDesktopBounds(negativePos, charSize, desktop);
    expect(clampedMin.x).toBe(12);
    expect(clampedMin.y).toBe(12);
  });

  test('4. Choreography Path Generation (Walk / Jump Arc)', () => {
    const start = { x: 300, y: 300 };
    const target = { x: 800, y: 300 };
    const path = seatManager.computeChoreographyPath(start, target, 'jump');

    expect(path.length).toBe(3);
    expect(path[0].animation).toBe('JUMPING');
    expect(path[1].y).toBeLessThan(300);
    expect(path[2].animation).toBe('ATTACHED_TO_WINDOW');
  });

  test('5. Multi-Token Natural Voice Intent Parser (Urdu / Roman Urdu / English)', () => {
    const intentCenter = seatManager.parseNaturalCommand('NX beech mein jaake beth jaye');
    expect(intentCenter.action).toBe('REPOSITION');
    expect(intentCenter.dockPosition).toBe('center');
    expect(intentCenter.posture).toBe('sitting');

    const intentChrome = seatManager.parseNaturalCommand('Chrome ke top par baith jao');
    expect(intentChrome.action).toBe('ATTACH');
    expect(intentChrome.targetApp).toBe('chrome.exe');
    expect(intentChrome.anchor).toBe('top-right');
    expect(intentChrome.posture).toBe('sitting');

    const intentHide = seatManager.parseNaturalCommand('NX screen se chup jao');
    expect(intentHide.action).toBe('VISIBILITY');
    expect(intentHide.visibility).toBe('hide');

    const intentRestore = seatManager.parseNaturalCommand('NX wapas samne aao');
    expect(intentRestore.action).toBe('VISIBILITY');
    expect(intentRestore.visibility).toBe('show');

    const intentResize = seatManager.parseNaturalCommand('NX thori chhoti ho jao');
    expect(intentResize.action).toBe('RESIZE');
    expect(intentResize.scale).toBe('small');
  });

  test('6. Native Window Tracker Integration & Mock Verification', async () => {
    nativeWindowTracker.setMockActiveWindow({
      handle: '0xABC123',
      processName: 'notepad.exe',
      title: 'Customer_Notes.txt - Notepad',
      bounds: { x: 250, y: 150, width: 800, height: 600 },
      isMinimized: false,
      isMaximized: false,
      isValid: true,
    });

    const activeWin = await nativeWindowTracker.getActiveWindow('notepad');
    expect(activeWin).not.toBeNull();
    expect(activeWin?.processName).toBe('notepad.exe');
    expect(activeWin?.bounds.width).toBe(800);
  });

  test('7. Canonical Identity Asset Verification', () => {
    const assetPath = path.resolve(__dirname, '../public/assets/character/reference_canonical.png');
    expect(fs.existsSync(assetPath)).toBe(true);
    const stats = fs.statSync(assetPath);
    expect(stats.size).toBeGreaterThan(1000000);
  });

  test('8. Position & State Persistence Verification', () => {
    const storagePath = path.resolve(__dirname, '../.nx_storage/companion_state.json');
    expect(fs.existsSync(storagePath)).toBe(true);
    const content = JSON.parse(fs.readFileSync(storagePath, 'utf8'));
    expect(content.visualMode).toBe('DESKTOP_COMPANION_TRANSPARENT');
    expect(content.assistantName).toContain('Saba');
  });
});
