# NX AI — Autonomous Windows Agent

**Powered by DevX_NX**

NX AI is a local-first, voice-capable autonomous workstation platform for Windows operations, verified file and USB storage workflows, OS telemetry, multi-provider AI routing, and persistent contextual memory.

## Architecture Overview

- **Backend Orchestrator (`src/core/`)**: Explicit task state machine, planner, policy guard, verifier, bounded recovery engine, typed event bus (SSE), and persistent local store (`data/nx_database.json`).
- **System Adapters (`src/adapters/`)**: Real OS telemetry (`cpuLoad`, `ramUsedMB`, live processes, logical volumes), storage preflight & eject adapter, Android ADB discovery, and CDP browser session inspection. Any unavailable OS/hardware capability reports `UNAVAILABLE` or `DISCONNECTED` truthfully.
- **Workstation UI (`src/components/`, `src/themes/`)**: Responsive desktop interface (`1024x600` to `2560x1440+`), 6 built-in NX themes with custom token persistence, live SSE event stream, voice command pipeline, memory manager, and executable verification suite.

## Commands

- `npm run dev` — Start Express + Vite development server on port 3000
- `npm run build` — Build production frontend assets
- `npm run nx:check` — TypeScript check + source hygiene scan
- `npm run nx:test` — Run automated unit & integration tests (`bun test`)
