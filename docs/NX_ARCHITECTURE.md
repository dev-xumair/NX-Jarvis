# NX AI Platform Architecture

## Core Layers

1. **Task Orchestrator (`src/core/orchestrator/taskOrchestrator.ts`)**
   - Converts user inputs into structured `TaskRecord` ledgers.
   - Explicit state machine: `IDLE`, `RECEIVED`, `UNDERSTANDING`, `CLASSIFYING`, `PLANNING`, `CONFIRMATION_REQUIRED`, `RESEARCHING`, `EXECUTING`, `VERIFYING`, `RECOVERING`, `PAUSED`, `COMPLETED`, `FAILED`, `CANCELLED`, `TIMED_OUT`, `OFFLINE_BLOCKED`.
   - Progress is computed strictly from completed plan steps vs total steps.

2. **Policy Engine (`src/core/policy/policyEngine.ts`)**
   - Enforces risk classification (`READ_ONLY`, `SAFE_REVERSIBLE`, `DESTRUCTIVE_CONFIRM`, `HIGH_IMPACT_CONFIRM`, `BLOCKED`).
   - Hard-blocks destructive commands against protected OS drives (`C:` / `/`).
   - Scrubs sensitive secrets (CNIC, passwords, API keys, OTPs, payment cards) before persistence or logging.

3. **Event Bus & Audit Stream (`src/core/events/eventBus.ts`)**
   - Emits typed lifecycle events (`TASK_CREATED`, `TASK_STEP_STARTED`, `VERIFICATION_PASSED`, `VERIFICATION_FAILED`, `SYSTEM_WARNING`, etc.).
   - Streams live updates over SSE (`/api/v1/events`) and persists critical audit entries.

4. **System & Device Adapters (`src/adapters/`)**
   - **Telemetry**: OS CPU sampling, memory usage, NX process RSS/heap, live processes (`ps`/`tasklist`), and volume discovery.
   - **Storage**: 12-point preflight checks, FAT32 4GB boundary validation, safe unmount attempt returning `EJECTED` / `UNAVAILABLE` / `NEEDS_ATTENTION`.
   - **Browser**: CDP endpoint probe (`127.0.0.1:9222`) & Chrome/Chromium binary check; fails closed with `BROWSER_NOT_CONNECTED` when unavailable.
   - **Android Mobile Bridge**: Real `adb devices` discovery returning `CONNECTED`, `AUTHORIZATION_REQUIRED`, or `DISCONNECTED`.

5. **Model Gateway (`src/core/providers/modelGateway.ts`)**
   - Provider-agnostic router with GCP `projectId` rate-limit isolation and 300s cooldown failover.
   - Profiles default to `UNVERIFIED` until explicitly tested against the Gemini adapter.
