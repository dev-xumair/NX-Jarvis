/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { execSync } from 'child_process';
import type { MobileBridgeStatus } from '../../types/agent.ts';

export interface MobileCommandResult {
  ok: boolean;
  code: string;
  message: string;
  device?: string;
  output?: string;
  timestamp: number;
}

export class AdbWorker {
  inspectStatus(): MobileBridgeStatus {
    const checkedAt = Date.now();
    try {
      const devicesOutput = execSync('adb devices -l', {
        timeout: 1500,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      const lines = devicesOutput
        .trim()
        .split('\n')
        .slice(1)
        .map((l) => l.trim())
        .filter(Boolean);

      if (lines.length === 0) {
        return {
          connectionState: 'DISCONNECTED',
          isConnected: false,
          deviceName: 'No Android device detected',
          connectionType: 'NONE',
          batteryLevel: null,
          lastCheckedAt: checkedAt,
          detail: 'ADB binary available; zero devices attached.',
          capabilities: {
            fileTransfer: false,
            clipboardSync: false,
            screenControl: false,
            appLaunching: false,
          },
        };
      }

      const unauthorized = lines.find((l) => l.includes('\tunauthorized') || l.includes(' unauthorized'));
      if (unauthorized) {
        const serial = unauthorized.split(/\s+/)[0];
        return {
          connectionState: 'AUTHORIZATION_REQUIRED',
          isConnected: false,
          deviceName: `Unauthorized (${serial})`,
          serial,
          connectionType: serial.includes(':') ? 'WIFI_ADB' : 'USB',
          batteryLevel: null,
          lastCheckedAt: checkedAt,
          detail: 'Accept USB Debugging RSA prompt on the Android device.',
          capabilities: {
            fileTransfer: false,
            clipboardSync: false,
            screenControl: false,
            appLaunching: false,
          },
        };
      }

      const active = lines.find((l) => l.includes('\tdevice') || l.includes(' device '));
      if (!active) {
        return {
          connectionState: 'DISCONNECTED',
          isConnected: false,
          deviceName: 'No online Android device',
          connectionType: 'NONE',
          batteryLevel: null,
          lastCheckedAt: checkedAt,
          detail: lines[0],
          capabilities: {
            fileTransfer: false,
            clipboardSync: false,
            screenControl: false,
            appLaunching: false,
          },
        };
      }

      const serial = active.split(/\s+/)[0];
      let deviceName = serial;
      let androidVersion: string | undefined;
      let batteryLevel: number | null = null;

      try {
        const model = execSync(`adb -s "${serial}" shell getprop ro.product.model`, {
          timeout: 1200,
          encoding: 'utf-8',
        }).trim();
        if (model) deviceName = model;
      } catch {
        // Keep serial
      }

      try {
        const ver = execSync(`adb -s "${serial}" shell getprop ro.build.version.release`, {
          timeout: 1200,
          encoding: 'utf-8',
        }).trim();
        if (ver) androidVersion = `Android ${ver}`;
      } catch {
        // Optional
      }

      try {
        const batteryOut = execSync(`adb -s "${serial}" shell dumpsys battery`, {
          timeout: 1200,
          encoding: 'utf-8',
        });
        const match = batteryOut.match(/level:\s*(\d+)/i);
        if (match) batteryLevel = Number(match[1]);
      } catch {
        batteryLevel = null;
      }

      return {
        connectionState: 'CONNECTED',
        isConnected: true,
        deviceName,
        serial,
        androidVersion,
        connectionType: serial.includes(':') ? 'WIFI_ADB' : 'USB',
        batteryLevel,
        lastCheckedAt: checkedAt,
        detail: `Connected via ${serial.includes(':') ? 'Wireless ADB' : 'USB ADB'}`,
        capabilities: {
          fileTransfer: true,
          clipboardSync: true,
          screenControl: true,
          appLaunching: true,
        },
      };
    } catch {
      return {
        connectionState: 'UNAVAILABLE',
        isConnected: false,
        deviceName: 'ADB unavailable on host',
        connectionType: 'NONE',
        batteryLevel: null,
        lastCheckedAt: checkedAt,
        detail: 'Android Platform Tools (adb) not found in PATH or ADB daemon offline.',
        capabilities: {
          fileTransfer: false,
          clipboardSync: false,
          screenControl: false,
          appLaunching: false,
        },
      };
    }
  }

  executeCommand(action: string): MobileCommandResult {
    const status = this.inspectStatus();
    if (!status.isConnected || !status.serial) {
      return {
        ok: false,
        code: status.connectionState,
        message: `ADB bridge not connected (${status.connectionState}). Connect a device with USB debugging or wireless ADB first.`,
        timestamp: Date.now(),
      };
    }

    if (action === 'ping') {
      try {
        const out = execSync(`adb -s "${status.serial}" shell echo NX_ADB_OK`, {
          timeout: 1500,
          encoding: 'utf-8',
        }).trim();
        return {
          ok: out.includes('NX_ADB_OK'),
          code: 'CONNECTED',
          message: `ADB roundtrip verified on ${status.deviceName}.`,
          device: status.deviceName,
          output: out,
          timestamp: Date.now(),
        };
      } catch (err: unknown) {
        return {
          ok: false,
          code: 'ADB_COMMAND_FAILED',
          message: err instanceof Error ? err.message : 'ADB ping failed',
          timestamp: Date.now(),
        };
      }
    }

    return {
      ok: false,
      code: 'UNSUPPORTED_WITHOUT_PAYLOAD',
      message: `Action "${action}" requires explicit source/target parameters when connected to ${status.deviceName}.`,
      device: status.deviceName,
      timestamp: Date.now(),
    };
  }
}
