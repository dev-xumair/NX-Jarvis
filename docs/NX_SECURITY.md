# NX AI Security & Policy Specification

## Secret Scrubbing

All user prompts, memory writes, and audit log payloads pass through `scrubSecrets()` before storage:
- Pakistani CNIC patterns (`XXXXX-XXXXXXX-X`)
- Key-value credentials (`password=`, `api_key=`, `secret=`, `pin=`, `otp=`, `token=`)
- API key prefixes (`AIza...`, `sk-...`, `Bearer ...`)
- Credit/debit card patterns

Matched tokens are replaced with `[REDACTED_SECRET]` and flagged (`hadSecrets: true`).

## Protected OS Drive Enforcement

Destructive intent targeting `C:\`, `C:`, `C drive`, or Unix root `/` (`format`, `wipe`, `delete`, `rm -rf`, `del`, `rd /s`) is classified as `BLOCKED` by `PolicyEngine` before any planner step or tool execution is permitted.

## IPC & Credential Isolation

- Electron renderer runs with `contextIsolation: true`, `nodeIntegration: false`, and `sandbox: true`.
- Preload exposes only allowlisted methods on `window.nx`.
- Cloud AI calls run strictly server-side using environment credentials; raw API keys are never exposed in client bundles or returned in JSON settings.
