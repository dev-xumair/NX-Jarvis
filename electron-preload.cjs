/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

const { contextBridge, ipcRenderer } = require('electron');

const ALLOWED_EVENTS = new Set(['nx:event']);

contextBridge.exposeInMainWorld('nx', {
  getState: () => ipcRenderer.invoke('nx:get-state'),
  getTelemetry: () => ipcRenderer.invoke('nx:get-telemetry'),
  getWindows: () => ipcRenderer.invoke('nx:get-windows'),
  getSettings: () => ipcRenderer.invoke('nx:get-settings'),
  sendCommand: (payload) => ipcRenderer.invoke('nx:send-command', payload),
  cancelTask: (taskId) => ipcRenderer.invoke('nx:cancel-task', taskId),
  confirmAction: (taskId, approved) => ipcRenderer.invoke('nx:confirm-action', taskId, approved),
  updateSettings: (updates) => ipcRenderer.invoke('nx:update-settings', updates),
  onEvent: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const channel = 'nx:event';
    if (!ALLOWED_EVENTS.has(channel)) return () => {};
    const listener = (_event, data) => callback(data);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },
});
