# NX AI — Autonomous Windows Agent Platform

An autonomous, local-first, voice-first Windows agent platform inspired by the OpenHands agent core and built to the rigorous specifications of the approved NX AI PRD v3.0 and Guide 2. NX AI operates under the guiding mandate: *"Kaam karo, verify karo, phir bolo"* (Do the work, verify the actual state, then report).

---

> [!IMPORTANT]
> **User Review & Critical Architectural Decisions**
> 
> 1. **Core Runtime & Sandbox Strategy**:
>    - Full-stack Vite + Express server backend with live server-side `@google/genai` multi-profile routing, sandboxed virtual drive/device manager (C: protected, non-C D/E/F/G managed drives), and real-time WebSocket/SSE-backed event bus.
>    - Hardware simulation for USB lifecycle (insert, identity detection, temp copy `.partial`, verification, atomic commit, removal, resume) and safe Windows system diagnostics.
> 
> 2. **Voice & Roman Urdu Pipeline**:
>    - Client-side Web Speech recognition + local Web Audio waveform synthesis with two-stage wake validation (`NX`, `Nazim Assistant`, `Hey AI`, `Handsome`, `Smart`, `Bro`), barge-in interruptibility (stopping TTS on user speech within ~300ms), and natural Roman Urdu speech normalization.
> 
> 3. **AI Provider Router & Project-Aware Quota Isolation**:
>    - Generic provider adapter architecture. Pre-configured with Google Gemini primary (`gemini-3.8-flash`), reasoning fallback (`gemini-4-argon`), and fast classification (`gemini-3.1-flash-lite`).
>    - Crucial Quota Rule: Profiles in the same Gemini project share rate limits and are never treated as separate quota pools; router manages failover across independent authorized projects with cooldowns and error-class dispatching.
> 
> 4. **Default Launch Theme**:
>    - Launches with **Graphite Dark** theme, with instantaneous hot-switching between **Google Light**, **Graphite Dark**, and **Midnight AI** (OLED cyan/emerald).

---

## 1. Overview & Core Concept

### What It Does
NX AI is an autonomous, professional shop partner and Windows operator designed for environments like Pushpa Mobile Center. It handles:
- **USB Pack & Media Management**: Multi-device detection, source scanning, FAT32 limit checks, duplicate detection, atomic `.partial` writes, sample/full hash verification, and interruption/resume workflows.
- **Drive & File Organization**: Protected C: system root enforcement, safe non-C drive management, media classification (dramas, songs, software), junk removal, and quarantine.
- **Multi-Gemini Intelligent Router**: Dynamic discovery, model role allocation (`FAST`, `BALANCED`, `REASONING`, `RESEARCH`), circuit-breaking cooldowns, bounded retries, and quota failover.
- **7-Layer Memory Engine**: Working, Task, Preference, Long-term, Event, Operational, and Semantic memory with strict secret filtering (no passwords/keys/OTPs stored).
- **Windows System Diagnostics & Controls**: Safe typed tools for taskbar auto-hide, volume, network diagnostics, startup inspect, Defender scans, and system checkups.
- **Online Research & Assisted Form Applications**: Authoritative source verification, field read-backs, human confirmation gates, CAPTCHA/OTP/payment stop conditions.

### Target Persona
- **Shop Operator / Non-Technical User**: Communicates primarily via natural Roman Urdu (`"NX nayi USB mein gaane bhar de"`, `"System check karo"`, `"Is baat ko yaad rakhna"`), requiring concise 1–3 sentence spoken confirmations, verified state updates, and zero decorative "button jungle" clutter.

---

## 2. User Experience & Visual Design

### Key User Flows
1. **Real-time Operational Dashboard (Default View)**:
   - Dynamic agent state banner (`IDLE`, `LISTENING`, `THINKING`, `PLANNING`, `WAITING_CONFIRMATION`, `RUNNING`, `VERIFYING`, `RECOVERING`).
   - Active task card with smoothed speed, ETA, real byte/file progress, phase indicator, and verification badge.
   - Live activity stream (event logs) and interactive voice waveform with Voice <-> Chat mode toggle.
2. **USB Detection & Pack Preparation**:
   - Device plug-in triggers voice prompt (*"Yes Boss, nayi USB lagi hai. Kya bharna hai?"*).
   - Selection of pack (Gaane, Movies, Dramas, Games, Software) $\rightarrow$ pre-flight scan $\rightarrow$ structured readback $\rightarrow$ confirmation dialog $\rightarrow$ real transactional copy $\rightarrow$ post-copy verification.
3. **Multi-Gemini API & Profile Manager**:
   - Settings $\rightarrow$ AI / APIs $\rightarrow$ Add New API: provider select, official key instructions, masked credential input, minimal validation ping, runtime model discovery, capability check, role assignment (`FAST` / `BALANCED` / `REASONING`), and failover test.
4. **7-Layer Memory Management**:
   - Dedicated Memory view with category filters, importance/confidence meters, search bar, and explicit "Forget" / "Export" actions.
5. **Statistics & Audit History**:
   - Searchable audit log of completed, recovered, and failed tasks; USB byte metrics, API latency trends, RAM/CPU diagnostics, and tamper-evident audit records.

### Visual Identity & Theme Tokens
- **Design Constitution Compliance**:
  - Zero-pill metadata discipline: metadata separated with unboxed typography and subtle `·` separators.
  - Strict Top Bar Contract: 3 clean zones (`NX AI Workspace` wordmark — navigation breadcrumb / mode — active system status & quick action).
  - Single-elevation depth: high-density workspace with 1px hairline dividers (`border-slate-800`), tabular numerals (`font-mono tabular-nums`), and zero fake scoreboards or decorative status dots.
- **Approved Theme Tokens**:
  - **Graphite Dark (Default)**: Deep graphite `#0f141c` canvas, `#192231` cards, icy blue accent `#38bdf8`, and slate-100 text.
  - **Google Light**: Crisp `#ffffff` canvas, `#f8fafc` structural surfaces, Google Blue `#2563eb` accent, and slate-900 typography.
  - **Midnight AI**: Ultra-deep OLED `#090d16` canvas, neon emerald `#10b981` / cyan `#06b6d4` high-intent accents.

---

## 3. Key Product Decisions & Trade-Offs

### Decision 1: Full-Stack Architecture with OpenHands Agent Core
- **Chosen Approach**: Express backend mounted in `server.ts` alongside Vite middlewares; modular agent orchestrator executing typed tool contracts with schema validation, risk evaluation, and verification gates.
- **Why**: Pure client-side code cannot securely manage server-side Gemini credentials, file streaming, process diagnostics, or multi-client WebSocket state. This adheres strictly to the `@google/genai` server-only requirement while delivering full desktop agent responsiveness.
- **Alternatives Considered**: Mock-only UI (rejected: violates PRD core mandate *"Kaam karo, verify karo, phir bolo"*).

### Decision 2: Project-Aware Quota Router for Multiple Gemini Keys
- **Chosen Approach**: Track `projectId` alongside credentials. If Profile A and Profile B share the same project, a 429 Rate Limit on Profile A instantly marks the shared project in cooldown, immediately failing over to an independent project profile rather than repeatedly spamming sibling keys.
- **Why**: Google Gemini API rate limits are enforced at the project level, not per key. Sibling rotation does not bypass quotas.
- **Alternatives Considered**: Simple round-robin key rotation (rejected: causes immediate repeated 429 cascades).

### Decision 3: Protected C: System Drive & Configurable Non-C Workspace
- **Chosen Approach**: Hard-coded path guard prohibiting destructive operations on `C:\Windows`, `C:\Program Files`, `C:\ProgramData`, and critical system roots. Non-C drives (`D:`, `E:`, `F:`, removable USBs) are managed through strict `SCAN -> PLAN -> PREVIEW -> CONFIRM -> EXECUTE -> VERIFY` pipelines.
- **Why**: Prevents catastrophic accidental system deletion while empowering the user to manage vast media collections on high-capacity storage drives.

---

## 4. Technical Architecture & Data Strategy

### System Architecture Diagram

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                 NX AI FRONTEND (REACT + VITE)                          │
│                                                                                        │
│  ┌───────────────────────┐  ┌────────────────────────────────────────────────────────┐ │
│  │   COMPACT SIDEBAR     │  │                      TOP HEADER                        │ │
│  │  1. Dashboard         │  │   [Brand Wordmark] ── [Breadcrumb] ── [Voice/Chat Switch]│ │
│  │  2. Stats & History   │  └────────────────────────────────────────────────────────┘ │
│  │  3. Memory (7 Layers) │  ┌────────────────────────────────────────────────────────┐ │
│  │  4. Settings & APIs   │  │                   MAIN VIEWPORT                        │ │
│  └───────────────────────┘  │  ┌─────────────────────────┐  ┌───────────────────────┐ │ │
│                             │  │ Realtime Agent State    │  │ Active Task & USB     │ │ │
│  ┌───────────────────────┐  │  │ Listening / Thinking... │  │ Progress, ETA, Speed  │ │ │
│  │   VOICE / AUDIO ENGINE│  │  └─────────────────────────┘  └───────────────────────┘ │ │
│  │  • Web Speech Recogn. │  │  ┌─────────────────────────┐  ┌───────────────────────┐ │ │
│  │  • Roman Urdu Lexicon │  │  │ Live Activity Stream    │  │ Interactive Chat /    │ │ │
│  │  • Barge-in Detector  │  │  │ Real-time Event Log     │  │ Voice Waveform Engine │ │ │
│  └───────────────────────┘  │  └─────────────────────────┘  └───────────────────────┘ │ │
│                             └────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────▲────────────────────────────────────────────┘
                                            │ HTTP / Server-Sent Events / State Sync
┌───────────────────────────────────────────▼────────────────────────────────────────────┐
│                              SERVER-SIDE RUNTIME (server.ts)                           │
│                                                                                        │
│  ┌────────────────────────────────┐       ┌──────────────────────────────────────────┐ │
│  │         AGENT CORE             │       │            AI PROVIDER ROUTER            │ │
│  │  • OpenHands State Machine     │◄─────►│  • Profile Manager (Primary/Backup)      │ │
│  │  • Task Persistence & Recovery │       │  • Project-Aware Quota & Cooldowns       │ │
│  │  • Risk & Confirmation Engine  │       │  • Runtime Model & Capability Discovery  │ │
│  └───────────────┬────────────────┘       │  • @google/genai (gemini-3.8-flash, etc.)│ │
│                  │                        └──────────────────────────────────────────┘ │
│                  ▼                                                                     │
│  ┌────────────────────────────────┐       ┌──────────────────────────────────────────┐ │
│  │       TYPED TOOL ENGINE        │       │             PERSISTENCE LAYER            │ │
│  │  • USB Copy Engine (Atomic)    │       │  • SQLite / Local JSON Storage           │ │
│  │  • File / Drive Manager        │◄─────►│  • Task Checkpoints & Manifests          │ │
│  │  • Windows Diagnostics & Safe  │       │  • 7-Layer Memory Store                  │ │
│  │  • Form & Online Agent         │       │  • Audit Trails & Performance Metrics    │ │
│  └────────────────────────────────┘       └──────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### Data Model & State Mapping

1. **Agent State Machine**:
   - `AgentState`: `'IDLE' | 'LISTENING' | 'THINKING' | 'PLANNING' | 'WAITING_CONFIRMATION' | 'RUNNING' | 'VERIFYING' | 'RECOVERING' | 'WAITING_DEVICE' | 'WAITING_USER' | 'COMPLETED' | 'FAILED' | 'CANCELLED'`.
2. **Task State & Checkpoints**:
   - `TaskRecord`: `id`, `goal`, `steps`, `dependencies`, `riskLevel` (`'READ_ONLY' | 'SAFE_REVERSIBLE' | 'MODERATE_BULK' | 'DESTRUCTIVE' | 'SECURITY_SENSITIVE'`), `progress` (0–100), `speed` (MB/s), `etaSeconds`, `currentPhase`, `checkpointData`, `verifiedCount`, `failedCount`.
3. **USB Device & Operation Engine**:
   - `UsbDevice`: `id`, `label`, `mountPath` (e.g. `E:\`), `serialNumber`, `totalBytes`, `freeBytes`, `filesystem` (`FAT32` | `NTFS` | `exFAT`), `status` (`'CONNECTED' | 'REMOVED' | 'COPYING' | 'VERIFYING'`).
   - `CopyFlow`: Scan source $\rightarrow$ FAT32 check $\rightarrow$ deduplicate (hash/size) $\rightarrow$ write `.partial` $\rightarrow$ verify checksum $\rightarrow$ atomic rename $\rightarrow$ final report.
4. **AI Profiles & Quota State**:
   - `ProviderProfile`: `id`, `name`, `provider` (`'google_gemini'`), `projectId`, `apiKeyMasked`, `priority`, `role` (`'FAST' | 'BALANCED' | 'REASONING' | 'RESEARCH'`), `healthStatus` (`'HEALTHY' | 'COOLING_DOWN' | 'DEGRADED' | 'QUOTA_BLOCKED'`), `cooldownUntil`, `activeModel`.
5. **Memory Entity**:
   - `MemoryItem`: `id`, `layer` (`'WORKING' | 'TASK' | 'PREFERENCE' | 'LONG_TERM' | 'EVENT' | 'OPERATIONAL' | 'SEMANTIC'`), `content`, `importance` (1–10), `confidence` (0.0–1.0), `source`, `createdAt`, `updatedAt`, `expiresAt`, `sensitivity` (`'PUBLIC' | 'CONFIDENTIAL' | 'SYSTEM'`).

---

## 5. Current Implementation Status & Verification

1. **Living Anime Pakistani Girl AI Character**:
   - High-fidelity full-body sprite and expressive face bust assets generated.
   - Animated idle breathing, blinking, attentive listening headset glow, and real-time lip-sync mouth frames synchronized with audio utterance.
   - Draggable with mouse, scalable (small/medium/large), dockable to edge (*"Side mein chup ja"*), and restorable (*"Wapas aa jao"*).
   - Visual Novel floating speech/caption bubble.

2. **Integrated Voice-First Conversational Core**:
   - Central voice stage with live transcript streaming, multi-bar animated audio equalizer, instant barge-in interruption (<150ms), and natural Urdu/Hindi phonetic speech synthesis.

3. **PC / Desktop (1920x1080 Native) & Minimized Floating Mode**:
   - 1920x1080 2-column workstation layout.
   - Minimized Floating Desktop Mode with Windows Taskbar strip.
   - Windows batch launcher `run_windows_agent.bat` and silent background launcher `run_windows_agent_silent.vbs`.

4. **Real Autonomous Computer Operator**:
   - Open-ended task execution (Browser/YouTube automation, multi-storage parallel USB copy, verified backup, telemetry check).
   - Direct internal API with fallback to Human-like Computer Emulation (mouse coordinates, clicks, typing, File Explorer).
   - Permanent C: Windows OS guard.

5. **Subsystem Acceptance & Diagnostics**:
   - Interactive Diagnostics tab verifying all 7 subsystems with 100% operational status.
   - Zero TypeScript compile or lint errors.

