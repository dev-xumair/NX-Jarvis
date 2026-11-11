/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Electron Preload Bridge - Context Isolation & Scoped Character Subsystem API
 */

const { contextBridge, ipcRenderer } = require('electron');

const ALLOWED_CHANNELS = [
  'companion-clickthrough-toggle',
  'companion-move',
  'companion-resize',
  'companion-visibility',
  'companion-attach-window',
  'companion-detach-window',
  'character-event-broadcast',
];

contextBridge.exposeInMainWorld('nxElectronBridge', {
  sendCharacterEvent: (eventName, data) => {
    ipcRenderer.send('character-event-broadcast', { eventName, data, timestamp: Date.now() });
  },
  toggleClickThrough: (enabled) => {
    ipcRenderer.send('companion-clickthrough-toggle', Boolean(enabled));
  },
  moveCompanion: (x, y) => {
    ipcRenderer.send('companion-move', { x, y });
  },
  resizeCompanion: (width, height) => {
    ipcRenderer.send('companion-resize', { width, height });
  },
  attachToWindow: (targetPattern) => {
    ipcRenderer.send('companion-attach-window', targetPattern);
  },
  detachFromWindow: () => {
    ipcRenderer.send('companion-detach-window');
  },
  onCharacterEvent: (callback) => {
    ipcRenderer.on('character-event', (event, payload) => callback(payload));
  },
  onVoiceWake: (callback) => {
    ipcRenderer.on('nx-voice-wake', () => callback());
  },
});
