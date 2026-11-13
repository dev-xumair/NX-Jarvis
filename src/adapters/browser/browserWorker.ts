/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { execSync } from 'child_process';
import type { BrowserSessionInfo } from '../../types/agent.ts';

export interface BrowserActionResult {
  ok: boolean;
  code: 'VERIFIED' | 'BROWSER_NOT_CONNECTED' | 'UNAVAILABLE' | 'INVALID_URL' | 'SENSITIVE_FORM_GATE';
  message: string;
  targetUrl?: string;
  verifiedTitle?: string;
  requiresConfirmation?: boolean;
  gateReason?: string;
  session: BrowserSessionInfo;
}

export interface SensitiveFormGateResult {
  requiresConfirmation: boolean;
  category?: 'CAPTCHA' | 'OTP' | 'PAYMENT' | 'IDENTITY_VERIFICATION';
  reason?: string;
}

export class BrowserWorker {
  private readonly cdpEndpoint: string;

  constructor(cdpEndpoint?: string) {
    this.cdpEndpoint = cdpEndpoint || process.env.NX_CDP_ENDPOINT || 'http://127.0.0.1:9222';
  }

  evaluateNavigationSafety(targetUrl: string, pageText = '', confirmedByOperator = false): SensitiveFormGateResult {
    if (confirmedByOperator) {
      return { requiresConfirmation: false };
    }
    const combined = `${targetUrl} ${pageText}`.toLowerCase();
    if (/\b(captcha|recaptcha|hcaptcha|turnstile)\b/.test(combined)) {
      return {
        requiresConfirmation: true,
        category: 'CAPTCHA',
        reason: 'Stopped automatically at CAPTCHA challenge; operator completion required.',
      };
    }
    if (/\b(otp|one[-\s]?time[-\s]?password|2fa|verification[-\s]?code)\b/.test(combined)) {
      return {
        requiresConfirmation: true,
        category: 'OTP',
        reason: 'Stopped automatically at OTP / 2FA verification gate.',
      };
    }
    if (/\b(checkout|payment|billing|credit[-\s]?card|cvv|pay[-\s]?now)\b/.test(combined)) {
      return {
        requiresConfirmation: true,
        category: 'PAYMENT',
        reason: 'Stopped prior to payment or final checkout submission pending explicit confirmation.',
      };
    }
    if (/\b(kyc|identity[-\s]?verification|passport|cnic)\b/.test(combined)) {
      return {
        requiresConfirmation: true,
        category: 'IDENTITY_VERIFICATION',
        reason: 'Stopped at identity verification gate; explicit operator confirmation required.',
      };
    }
    return { requiresConfirmation: false };
  }

  detectInstalledBrowser(): string | null {
    const candidates =
      process.platform === 'win32'
        ? ['where chrome', 'where msedge']
        : ['which google-chrome', 'which chromium', 'which chromium-browser', 'which microsoft-edge'];

    for (const cmd of candidates) {
      try {
        const res = execSync(cmd, {
          timeout: 1000,
          encoding: 'utf-8',
          stdio: ['ignore', 'pipe', 'ignore'],
        }).trim();
        if (res) return res.split('\n')[0].trim();
      } catch {
        // Check next browser binary
      }
    }
    return null;
  }

  async inspectSession(): Promise<BrowserSessionInfo> {
    const checkedAt = Date.now();
    const binaryDetected = this.detectInstalledBrowser();

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 1200);
      const res = await fetch(`${this.cdpEndpoint}/json/list`, { signal: controller.signal });
      clearTimeout(timer);

      if (res.ok) {
        const tabs = (await res.json()) as Array<{ id: string; title?: string; url?: string; type?: string }>;
        const pages = tabs
          .filter((t) => t.type === 'page')
          .slice(0, 10)
          .map((t) => ({
            id: t.id,
            title: t.title || 'Untitled',
            url: t.url || '',
          }));
        return {
          status: 'CONNECTED',
          cdpConnected: true,
          cdpEndpoint: this.cdpEndpoint,
          binaryDetected,
          openPages: pages,
          checkedAt,
          detail: `CDP session active with ${pages.length} open page(s).`,
        };
      }
    } catch {
      // CDP endpoint unreachable
    }

    return {
      status: binaryDetected ? 'BROWSER_NOT_CONNECTED' : 'UNAVAILABLE',
      cdpConnected: false,
      cdpEndpoint: this.cdpEndpoint,
      binaryDetected,
      openPages: [],
      checkedAt,
      detail: binaryDetected
        ? `Browser binary found (${binaryDetected}), but CDP debugging session on ${this.cdpEndpoint} is not active.`
        : 'No supported Chrome/Edge binary or CDP session detected on this host.',
    };
  }

  async ensureConnectedSession(preferredBrowser: 'chrome' | 'msedge' = 'chrome'): Promise<BrowserActionResult> {
    const initial = await this.inspectSession();
    if (initial.cdpConnected) {
      return {
        ok: true,
        code: 'VERIFIED',
        message: initial.detail,
        session: initial,
      };
    }
    if (!initial.binaryDetected) {
      return {
        ok: false,
        code: 'UNAVAILABLE',
        message: `No supported Chrome or Edge binary installed on ${process.platform} host (NO_SUPPORTED_BROWSER_INSTALLED).`,
        session: initial,
      };
    }

    // Attempt launching binary with --remote-debugging-port on the configured port
    try {
      const port = Number(new URL(this.cdpEndpoint).port || 9222);
      const { WindowsWorker } = await import('../windows/windowsWorker.ts');
      const winWorker = new WindowsWorker();
      const launched = winWorker.launchBrowserForAutomation(preferredBrowser, port);
      if (launched.ok) {
        await new Promise((r) => setTimeout(r, 900));
        const rechecked = await this.inspectSession();
        if (rechecked.cdpConnected) {
          return {
            ok: true,
            code: 'VERIFIED',
            message: `Auto-launched ${preferredBrowser} and connected CDP session (${rechecked.openPages.length} tab(s)).`,
            session: rechecked,
          };
        }
      }
      return {
        ok: false,
        code: 'BROWSER_NOT_CONNECTED',
        message: launched.ok
          ? `Launched ${launched.app}, but CDP port ${port} did not become ready.`
          : launched.message,
        session: initial,
      };
    } catch (err: unknown) {
      return {
        ok: false,
        code: 'BROWSER_NOT_CONNECTED',
        message: err instanceof Error ? err.message : 'Unable to initialize CDP browser session.',
        session: initial,
      };
    }
  }

  async navigateAndVerify(targetUrl: string, options?: { confirmed?: boolean }): Promise<BrowserActionResult> {
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(targetUrl);
      if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
        throw new Error('Unsupported URL scheme');
      }
    } catch {
      const session = await this.inspectSession();
      return {
        ok: false,
        code: 'INVALID_URL',
        message: 'Invalid HTTP/HTTPS target URL.',
        session,
      };
    }

    const safetyGate = this.evaluateNavigationSafety(parsedUrl.toString(), '', Boolean(options?.confirmed));
    if (safetyGate.requiresConfirmation) {
      const session = await this.inspectSession();
      return {
        ok: false,
        code: 'SENSITIVE_FORM_GATE',
        requiresConfirmation: true,
        gateReason: safetyGate.category,
        message: safetyGate.reason || 'Sensitive checkout/OTP/CAPTCHA target requires operator confirmation.',
        targetUrl: parsedUrl.toString(),
        session,
      };
    }

    const session = await this.inspectSession();
    if (!session.cdpConnected) {
      return {
        ok: false,
        code: session.status === 'UNAVAILABLE' ? 'UNAVAILABLE' : 'BROWSER_NOT_CONNECTED',
        message: session.detail,
        targetUrl: parsedUrl.toString(),
        session,
      };
    }

    try {
      const putRes = await fetch(
        `${this.cdpEndpoint}/json/new?${encodeURIComponent(parsedUrl.toString())}`,
        { method: 'PUT' }
      );
      if (!putRes.ok) {
        return {
          ok: false,
          code: 'BROWSER_NOT_CONNECTED',
          message: `CDP target creation returned HTTP ${putRes.status}.`,
          targetUrl: parsedUrl.toString(),
          session,
        };
      }
      const created = (await putRes.json()) as { id?: string; title?: string; url?: string };
      const refreshed = await this.inspectSession();
      const verifiedPage = refreshed.openPages.find((p) => p.id === created.id || p.url.includes(parsedUrl.hostname));

      return {
        ok: Boolean(verifiedPage),
        code: verifiedPage ? 'VERIFIED' : 'BROWSER_NOT_CONNECTED',
        message: verifiedPage
          ? `Opened and verified page "${verifiedPage.title}" (${verifiedPage.url}) via CDP.`
          : 'CDP opened tab but target URL could not be verified in open pages.',
        targetUrl: parsedUrl.toString(),
        verifiedTitle: verifiedPage?.title,
        session: refreshed,
      };
    } catch (err: unknown) {
      return {
        ok: false,
        code: 'BROWSER_NOT_CONNECTED',
        message: err instanceof Error ? err.message : 'CDP navigation failed.',
        targetUrl: parsedUrl.toString(),
        session,
      };
    }
  }
}
