# pi-voice — Agent Context

## Project Overview

**pi-voice** — Give a voice to your Pi agent.

This pi package provides voice capabilities to [pi](https://pi.dev) agents. Packages bundle extensions, skills, prompt templates, and themes, and are distributed via npm or git.

**Tech Stack:** TypeScript (no build step — pi loads `.ts` directly via jiti), typebox for schemas, biome for lint/format.

### Structure

```
extensions/index.ts    # Extension entry point (tools, commands, events)
skills/hello/SKILL.md  # On-demand skill instructions
prompts/hello.md       # Slash-command prompt template
themes/template.json   # Theme with all 51 color tokens
package.json           # Pi manifest, peer deps, npm publish config
biome.json             # Linter/formatter config
tsconfig.json          # Type checking only (noEmit)
```

### Key Constraints

- **No build step** — pi loads `.ts` via jiti. Never add a build/compile step.
- **Peer dependencies** — `@mariozechner/pi-ai`, `@mariozechner/pi-coding-agent`, `@mariozechner/pi-tui`, `@mariozechner/pi-agent-core`, `typebox` are provided by pi at runtime. List them as `peerDependencies` with `"*"` range. Do not bundle them.
- **2-space indentation** — Enforced by biome.
- **Themes require all 51 color tokens** — See `themes/template.json` for the full list.

---

## Git and PR Conventions

- **Conventional commits** — `feat:`, `fix:`, `docs:`, `chore:`, `ci:`, `refactor:` prefixes. Releases are automated via release-please.
- **Rebase merges only** — The repo does not allow squash or merge commits. Always use:
  ```bash
  gh pr merge <number> --rebase
  ```
- **Release PRs** — release-please automatically opens a Release PR when conventional commits land on `main`. Review the changelog, then merge it with `--rebase` to trigger `npm publish`.

---

## Development Commands

```bash
npm run typecheck      # TypeScript type checking (tsc --noEmit)
npm run lint           # Check lint + formatting (biome check)
npm run lint:fix       # Auto-fix lint + formatting issues (biome check --write)
npm run format         # Format code only (biome format --write)
```

### Testing the Package with pi

There are three ways to test, depending on what you need:

#### 1. Print mode (`-p`) — quick tool/functionality test

Non-interactive, prints text output and exits. Best for verifying tools work.

```bash
# Test a tool (use -ne to skip other installed extensions)
pi -ne -e . --no-session -p "Call the hello tool with name Alice. You MUST use the hello tool."
# Output: The hello tool returned: Hello, Alice! 👋

# Test with the bash tool to inspect what pi sees
pi -ne -e . --no-session -p "List the tools you have available."
```

**Important:** Always use `-ne` (no-extensions) with `-e .` to avoid interference from globally installed extensions (like pi-mcp-adapter). Only the package being tested will load.

#### 2. Interactive mode — test slash commands and TUI

Full interactive session. Use this to test `/commands`, keyboard shortcuts, and extension UI (select, confirm, input dialogs).

```bash
# Start interactive session with only this package loaded
pi -ne -e . --no-session
# Then type commands like: /hello Alice
```

#### 3. RPC mode — programmatic testing from another pi session

Spawns a child pi process you can control via stdin/stdout JSON protocol. Best for automated testing and closing the agentic loop — the parent agent can send prompts, read tool results, and verify behavior.

```javascript
// Spawn a child pi instance for testing
const { spawn } = require("child_process");
const agent = spawn("pi", ["-ne", "-e", ".", "--no-session", "--mode", "rpc"], {
  stdio: ["pipe", "pipe", "pipe"],
  cwd: "/path/to/package",
});

// Read events from stdout (JSONL)
agent.stdout.on("data", (chunk) => {
  for (const line of chunk.toString().split("\n")) {
    if (!line.trim()) continue;
    const evt = JSON.parse(line);
    if (evt.type === "tool_execution_end") {
      console.log("Tool result:", evt.result?.content?.[0]?.text);
    }
    if (evt.type === "agent_end") {
      console.log("Agent finished");
      agent.kill();
    }
  }
});

// Send a prompt after startup
setTimeout(() => {
  agent.stdin.write(JSON.stringify({
    type: "prompt",
    message: "Call the hello tool with name AgentTest.",
  }) + "\n");
}, 3000);
```

**Extension UI in RPC mode:** If your extension uses `ctx.ui.select()`, `ctx.ui.confirm()`, or `ctx.ui.input()`, RPC mode sends `extension_ui_request` events on stdout. You must respond with `extension_ui_response` on stdin:

```javascript
// Handling a confirm dialog from the extension
if (evt.type === "extension_ui_request" && evt.method === "confirm") {
  agent.stdin.write(JSON.stringify({
    type: "extension_ui_response",
    id: evt.id,          // must match the request id
    confirmed: true,     // or false, or { cancelled: true }
  }) + "\n");
}
```

#### Verify npm tarball contents

```bash
npm pack --dry-run
```

---

## Agentic Development Loop

Follow this iterative loop when developing the package:

### Step 1: Understand the Requirement

Clarify what the user needs:
- A new tool? command? event handler? skill? prompt template? theme?
- What should it do?
- Are there runtime dependencies (npm packages)?

Read the relevant pi docs before implementing:
- Extensions: `~/.local/share/npm/lib/node_modules/@mariozechner/pi-coding-agent/docs/extensions.md`
- Skills: `~/.local/share/npm/lib/node_modules/@mariozechner/pi-coding-agent/docs/skills.md`
- Themes: `~/.local/share/npm/lib/node_modules/@mariozechner/pi-coding-agent/docs/themes.md`
- Packages: `~/.local/share/npm/lib/node_modules/@mariozechner/pi-coding-agent/docs/packages.md`

### Step 2: Implement

Write the code. Key patterns:

**Extension** (`extensions/`):
```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";

export default function (pi: ExtensionAPI) {
  pi.registerTool({ ... });
  pi.registerCommand("name", { ... });
  pi.on("event_name", async (event, ctx) => { ... });
}
```

**Skill** (`skills/name/SKILL.md`):
```markdown
# Skill Name
Use this skill when the user asks about X.
## Steps
1. Do this
2. Then that
```

**Prompt template** (`prompts/name.md`):
```markdown
---
description: What this template does
---
Template content here.
```

**Theme** (`themes/name.json`): Must include all 51 color tokens. Copy `themes/template.json` as a starting point.

### Step 3: Verify

Run all checks after making changes:

```bash
npm run typecheck && npm run lint
```

If either fails, fix the issues before proceeding. Common fixes:
- Type errors: add missing types, fix imports
- Lint errors: run `npm run lint:fix`

### Step 4: Test with pi

Choose the right testing mode for what you're verifying:

**For tools and basic functionality** (quick, automated):
```bash
pi -ne -e . --no-session -p "Call <tool_name> with <args>. You MUST use the <tool_name> tool."
```
Check the output for correct results.

**For slash commands, keyboard shortcuts, and UI dialogs** (interactive):
```bash
pi -ne -e . --no-session
# Then type: /<command_name>
```

**For programmatic end-to-end testing** (RPC mode):
Spawn a child `pi --mode rpc` process and verify tool results via the JSONL event stream. See the "Testing the Package with pi" section above for the full pattern.

**After any test**, verify:
- Extension loads without errors
- Tools return correct results
- Commands respond as expected
- No unexpected notifications or errors

### Step 5: Commit

Use conventional commit format:
```
feat: add new tool for X
fix: handle edge case in Y
docs: update README with Z
chore: update dependencies
ci: update workflow
refactor: simplify X
```

### Step 6: Iterate

Repeat steps 1-5 for each feature or fix. Keep commits small and focused.

---

## Release Flow

Releases are fully automated via CI/CD:

1. Push conventional commits to `main`
2. release-please opens a Release PR with updated `CHANGELOG.md` + version bump
3. Merge the Release PR → GitHub Release + `npm publish` happen automatically

Users update with: `pi update`

---

## Common Pitfalls

- **Forgetting `typebox` schemas** — Tool parameters must use `Type.Object()` from `typebox`, not raw TypeScript types
- **Importing from wrong package** — Use `import type { ExtensionAPI } from "@mariozechner/pi-coding-agent"` (type import)
- **Missing `export default function`** — Extensions must export a default factory function
- **Adding runtime deps as devDependencies** — Runtime npm packages go in `dependencies`, not `devDependencies`
- **Incomplete themes** — Pi requires all 51 color tokens; partial themes cause errors
- **Pinning peer deps** — Peer dependencies must use `"*"` range, not `"^0.70.0"` etc.
