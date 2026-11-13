# NX AI Verification & Test Plan

## Verification Principles

- Verification tests must execute real checks and inspect actual system/adapter outputs.
- No hardcoded `PASS` arrays or synthetic telemetry.
- When an optional subsystem (Chrome CDP, physical USB, ADB device, cloud API key) is absent in the current host environment, the suite reports `UNAVAILABLE`, `DISCONNECTED`, or `SKIPPED` truthfully.

## Suites

1. **Automated Unit & Integration Tests (`tests/core_platform.test.ts`)**
   - Task Orchestrator state transitions & cancellation
   - Policy Engine C: drive protection & secret scrubbing
   - Storage Adapter preflight FAT32 4GB detection & real path checks
   - Persistent Database read/write survival across reload
   - Model Gateway project-aware cooldown & failover logic
   - Real OS Telemetry envelope freshness & status validation
2. **Source Hygiene Check (`scripts/hygiene_check.ts`)**
   - Fails if removed character artifacts, legacy template names, synthetic `Math.random()` telemetry, or fake static coordinates exist in runtime code.
3. **Executable Verification Suite (`POST /api/verification/run` / `/api/v1/verification/runs`)**
   - Runs `VT-CPU-01`, `VT-MEM-01`, `VT-PROC-01`, `VT-USB-01`, `VT-GUARD-01`, `VT-SANDBOX-01`, `VT-MEMORY-01`, `VT-SCRUB-01`, `VT-PROVIDER-01`, `VT-BROWSER-01`, `VT-ADB-01`, `VT-EVENT-01`.
