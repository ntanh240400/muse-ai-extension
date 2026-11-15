# MuseVault — muse.ai Multi-Account Switcher (Chrome MV3)

[![Manifest V3](https://img.shields.io/badge/Chrome-Manifest%20V3-blue.svg)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![Test Suite](https://img.shields.io/badge/Tests-7%20Passed-emerald.svg)](tests/verify-engine.js)
[![Zero Dependencies](https://img.shields.io/badge/Dependencies-Zero-brightgreen.svg)](#)

MuseVault is a Google Chrome and Chromium browser extension designed for fast, seamless multi-account management on [muse.ai](https://muse.ai). Inspired by the polished user experience and dark obsidian aesthetic of 1Password 8, MuseVault enables instant **1-click account switching**, session snapshotting, and persistent vault storage without manual logout loops.

---

## Key Features

1. **1-Click Account Switcher**:
   - Seamlessly swap between multiple muse.ai accounts (e.g., Personal, Agency Client, Creator Pro) in a single click.
   - Automatically saves current session cookies before leaving, purges live session state, injects target cookies, and reloads active `muse.ai` tabs with cache bypassed.

2. **1Password 8 Aesthetic (Obsidian Theme)**:
   - Ultra-fast cold start (<25ms) with zero-framework vanilla ES6 modules.
   - 380x560px compact viewport adhering to Chrome popup standards.
   - Active Account Hero Card featuring a glowing emerald radar pulse (`● Active Now`), squircle avatars with initials, and quick-action buttons.
   - Sliding drawer sheets with backdrop blur for adding and editing account profiles.

3. **High-Fidelity Session Engine**:
   - Accurately captures and restores all authentication cookies for `muse.ai`.
   - Preserves `hostOnly`, `sameSite` (with RFC 6265bis `secure: true` enforcement for `SameSite=None`), expiration dates, and store IDs.
   - Concurrency mutex lock prevents race conditions during rapid switching.
   - Empty-jar protection ensures saved sessions are never overwritten by an unauthenticated state.

4. **Zero External Dependencies**:
   - Pure vanilla JavaScript (ES modules) and modern CSS3 custom properties.
   - Self-contained procedural icon generator and automated test harness using Node.js native `node:test`.

---

## Directory Layout

```
muse_ai_extension/
├── manifest.json                  # Manifest V3 extension configuration
├── background/
│   ├── service-worker.js          # MV3 message dispatcher
│   ├── cookie-manager.js          # 5-step session swapping engine & transformers
│   ├── vault-storage.js           # chrome.storage.local CRUD abstraction
│   └── tab-manager.js             # muse.ai tab discovery, navigation, and reloading
├── popup/
│   ├── popup.html                 # 1Password-styled popup interface
│   ├── popup.css                  # Obsidian dark theme and responsive layout
│   └── popup.js                   # Client controller, optimistic UI, drawers, toasts
├── assets/
│   └── icons/                     # Standard extension icons (16, 32, 48, 128)
├── tests/
│   ├── mock-chrome-api.js         # In-memory mock of Chrome storage, cookies, and tabs
│   ├── verify-engine.js           # Standalone automated verification harness (7 suites)
│   └── test-runner.html           # In-browser test runner
├── scripts/
│   └── generate-icons.js          # Procedural PNG icon generator
├── README.md                      # Documentation
└── package.json                   # Test and utility scripts
```

---

## Installation (Chrome Developer Mode)

To install MuseVault in Chrome or any Chromium browser (Edge, Brave, Arc, Opera):

1. Clone or open the repository folder:
   - Path: `C:\Users\tuanhoan\teamwork_projects\muse_ai_extension` (or `f:\TuanHoan\teamwork_projects\muse_ai_extension`)
2. Open Google Chrome and navigate to:
   ```
   chrome://extensions/
   ```
3. Enable **Developer mode** using the toggle switch in the top-right corner.
4. Click the **Load unpacked** button in the top-left corner.
5. Select the `muse_ai_extension` directory.
6. The MuseVault extension icon will now appear in your browser toolbar. Click the puzzle icon to pin it for quick access.

---

## Running Verification Tests

MuseVault includes a comprehensive standalone test harness covering 7 acceptance test suites:
- **TS-01**: Account Vault CRUD Operations
- **TS-02**: Storage Persistence Across Restarts (3+ Accounts)
- **TS-03**: Live Session Capture & Snapshot from `muse.ai`
- **TS-04**: 1-Click Switch: Account A ➔ Account B (with tab reload)
- **TS-05**: Bidirectional Switch: Account B ➔ Account A (with session updates)
- **TS-06**: Tab Management (multiple open tabs & fallback tab creation)
- **TS-07**: Edge Cases & Fault Tolerance (host-only preservation, SameSite RFC rules, empty-jar protection, mutex lock)

### Command Line Verification (Node.js)
Ensure Node.js (v18+) is installed, then run:
```bash
node tests/verify-engine.js
```
Or via npm:
```bash
npm test
```

### In-Browser Interactive Verification
Open `tests/test-runner.html` directly in Chrome to execute the test suite in a browser environment with a visual dashboard.

---

## How to Use MuseVault

1. **Capture Your First Account**:
   - Log into your first muse.ai account in Chrome.
   - Click the MuseVault extension icon in the toolbar.
   - Click **⚡ Capture Current Session**.
   - Enter an account nickname (e.g., "Work Pro") and pick a color swatch.
   - Click **Save to Vault**.
2. **Add Additional Accounts**:
   - Log out of muse.ai and log into your second account (or another workspace).
   - Click the `+` button in MuseVault, select **Capture Tab**, name the account, and save.
   - Repeat for 3 or more accounts.
3. **Switch Between Accounts**:
   - Click the **Switch** button next to any saved account.
   - MuseVault immediately swaps authentication cookies in the background and reloads your open muse.ai tabs.
4. **Edit / Delete / Sync**:
   - Click the kebab menu (`⋮`) on any account card to edit details, re-capture updated tokens, copy cookies JSON, or delete the profile.

---

## License

MIT License. Designed and engineered for productivity.
