---
name: pi-init
description: >
  Verify pi-voice development environment setup. Use when the user says "init",
  "setup", "check environment", or asks to verify their development environment.
  This project is already initialized — the skill performs a quick health check
  rather than a full template setup. Do not use for general development tasks
  or running tests.
---

# Pi-voice Environment Check

This project is already initialized. This skill performs a quick health check
of the development environment rather than a full template setup.

## Checks

Run these in order. Report status for each.

### 1. Node & npm

```bash
node --version    # Node 18+
npm --version     # npm 9+
```

### 2. TypeScript & Biome

```bash
npx tsc --version          # TypeScript 5+
npx biome --version        # Biome linter/formatter
```

### 3. Dependencies installed

```bash
ls node_modules/.package-lock.json 2>/dev/null && echo "deps installed" || echo "run npm install"
```

### 4. pi CLI

```bash
which pi          # pi coding agent CLI
pi --version      # any recent version
```

### 5. pilotty (for E2E tests)

```bash
which pilotty     # optional, needed for npm run test:e2e
```

### 6. Type check & lint pass

```bash
npm run typecheck && npm run lint
```

## Result

Report:
- ✅ for passing checks
- ⚠️ for optional missing tools (pilotty)
- ❌ for required missing tools or failing checks

Suggest fixes for any failures.
