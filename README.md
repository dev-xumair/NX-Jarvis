# NX AI — Autonomous Windows Agent & Desktop Companion

Developed by **Dev_X_NX**.

NX AI is an autonomous, voice-first desktop agent and interactive 3D desktop companion designed for Windows workstation environments. It combines high-speed native OS automation, transactional multi-drive/USB media workflows, 7-layer persistent memory, project-aware cloud quota management, and a state-synchronized Three.js 3D companion.

---

## 🌟 Key Capabilities

1. **State-Synchronized 3D Desktop Companion**
   - High-performance Three.js procedural WebGL avatar with natural breathing, eye blinking, look-at mouse tracking, and audio-reactive mouth visemes.
   - Dual-mode support: Full Studio Workstation (1920x1080) and Floating Desktop Companion mode with per-pixel alpha transparency and drag/dock controls.
   - WebGL auto-recovery on context loss (`webglcontextlost` / `webglcontextrestored`).

2. **Multilingual Voice Interaction with True Barge-In**
   - Natural voice processing in Roman Urdu, Urdu script, and English.
   - Real-time acoustic feedback suppression (automatic speech synthesizer ducking while listening to prevent self-triggering).
   - Instant barge-in interruption (<150ms response time).

3. **Transactional USB Media & File Engine**
   - 10-point pre-flight validation (capacity check, path length limits, zero-byte detection, duplicate check, and FAT32 4GB limit split detection).
   - Atomic staging with `.partial` write buffers and byte-size validation prior to atomic rename.
   - SHA-256 parity verification with automated `.nx_workspace/manifest.json` generation.
   - Permanent Windows system drive (`C:\Windows`, `C:\Program Files`, root OS) guard preventing destructive operations.

4. **Specialist Automation Hierarchy & Workers**
   - **Computer-Use Worker:** Windows execution hierarchy with safety boundaries.
   - **Browser Worker:** Autonomous web navigation and domain inspection. Pauses safely for explicit user confirmation on sensitive/destructive operations.
   - **Local Thinker Worker:** Offline classification and heuristic intent routing.
   - **Independent Verifier Worker:** Pre/post-condition verification for all queued micro-actions.

5. **Cloud AI with Project Quota Isolation**
   - Multi-profile Gemini routing with Google Cloud Project ID grouping.
   - Automatic 300-second rate-limit cooldown isolation upon HTTP 429 quota exhaustion, failing over to independent authorized project pools.
   - Graceful offline fallback to local rules and cached tools.

6. **7-Layer Cognitive Persistent Memory**
   - Categorized into Working, Task, Preference, Long-Term, Event, Operational, and Semantic memory layers.
   - Automatic secret scrubbing (passwords, PINs, OTPs, CNIC numbers, Bearer tokens, and payment card numbers).
   - Atomic disk persistence under `.nx_storage/`.

7. **Truthful Hardware Telemetry & ADB Detection**
   - Live CPU load, RAM usage, and drive inspection based on Node.js OS APIs and Windows WMIC queries.
   - Honest Android ADB device discovery via CLI (`adb devices`) without fabricated mock indicators.

---

## 🚀 Quick Start

### Prerequisites
- Node.js 20+ or Bun 1.2+
- Windows 10/11 (or Linux/macOS for development)

### Installation
```bash
git clone https://github.com/Dev_X_NX/nx-ai.git
cd nx-ai
bun install # or npm install
```

### Configuration
Copy `.env.example` to `.env` and add your Gemini API key:
```bash
cp .env.example .env
```

### Running NX AI
```bash
# Start backend server & Vite UI
bun run dev

# Or run on Windows via launcher:
run_windows_agent.bat
```

Open `http://localhost:3000` in your browser or run inside the Electron desktop container:
```bash
npx electron electron-main.cjs
```

---

## 🧪 Testing & Verification

Run the automated test suite:
```bash
bun test
```

Run TypeScript type check:
```bash
bun run lint
```

Build production bundle:
```bash
bun run build
```

---

## 🔒 Security & Guard Rails

- **C: OS Drive Guard:** Permanently prohibits delete, format, or wipe actions targeting Windows OS system paths.
- **Destructive Confirmation Gate:** Requires explicit interactive confirmation from the user for bulk deletion or disk modifications.
- **Secret Redaction:** Sanitizes credentials, OTPs, and Pakistani CNIC identifiers prior to memory storage or logging.

---

## 📄 License & Attribution

Designed and maintained by **Dev_X_NX**.
Licensed under the Apache License, Version 2.0.
