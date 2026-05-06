---
name: pi-package
description: >
  Pi package development best practices and patterns for pi-voice. Use when
  planning, editing, implementing, or reviewing pi-voice extension code —
  adding tools, commands, event handlers, TUI components, or modifying the
  server. Also use when the user asks about extension architecture, pi SDK
  APIs, or "how should I implement" a pi-voice feature. Do not use for
  running tests (use pi-test skill) or server-only changes.
---

# Pi-voice Package Development

Patterns and best practices for building the pi-voice extension.

## Architecture Overview

pi-voice has two independent layers:

1. **Server** (`extensions/server.ts`) — Pure Node.js HTTP server, no pi dependencies. Manages Kokoro ONNX model lifecycle. Talks to `kokoro-js` only.
2. **Extension** (`extensions/index.ts`) — pi SDK integration: tools, commands, events, TUI. Talks to the server via HTTP.

The extension never touches the TTS model directly — it sends HTTP requests to the server.

## Pi SDK Docs

For the complete API reference, read pi's installed docs:

```bash
npm root -g  # → <dir>/@mariozechner/pi-coding-agent/docs/
```

| Doc | When to read |
|-----|-------------|
| `extensions.md` | Adding tools, commands, events, providers |
| `tui.md` | Building custom UI components |
| `skills.md` | Authoring skills |
| `themes.md` | Creating themes |
| `packages.md` | Package distribution |
| `session-format.md` | SessionManager API, entry types |

## Extension Patterns

### Tool Registration

The `tts` tool pattern — a tool that calls the TTS server and returns output:

```typescript
ctx.tools.register("tts", {
  description: "Convert text to speech audio",
  parameters: Type.Object({
    text: Type.String({ description: "Text to speak" }),
  }),
  render: "text",
  execute: async (args) => {
    const response = await fetch(`http://${host}:${port}/tts`, { ... });
    // process and play audio
    return { output: "Speaking: ..." };
  },
});
```

### Slash Command with Custom TUI

The `/voice` command uses `ctx.ui.custom()` for a full-screen settings UI:

```typescript
ctx.commands.register("/voice", {
  description: "Voice settings",
  execute: async () => {
    ctx.ui.custom(renderVoiceUI, handleVoiceKey);
  },
});
```

The render function returns ink-compatible elements. The key handler receives key events and returns `true` to trigger re-render.

### Event Handlers

Auto-TTS listens to `agent_end` and synthesizes speech:

```typescript
ctx.events.on("agent_end", async (event) => {
  const text = extractLastMessage(event);
  const summary = await summarizeWithModel(ctx, text);
  await speak(summary, config);
});
```

### State Persistence

Two-layer persistence:
- **Global defaults**: `~/.pi/voice/config.json` (read/write with fs)
- **Session overrides**: `ctx.session.appendEntry("voice-session", ...)` (session manager)

Read global defaults at startup, layer session overrides on top.

## Reference Files

Read these on demand based on the task. Do NOT load all at once.

### `references/EXTENSIONS.md`
Complete patterns for every extension capability (tools, commands, events, TUI, rendering, providers).

### `references/SCHEMAS.md`
Typebox schema patterns for tool parameters.

### `references/THEMES.md`
Theme creation with all 51 color tokens.

### `references/SKILLS.md`
Skill authoring patterns.

### `references/PROMPTS.md`
Prompt template authoring.

## Constraints

- **No build step** — pi loads `.ts` via jiti
- **Peer deps use `*` range** — `@mariozechner/pi-*`, `typebox`
- **Runtime deps in `dependencies`** — not `devDependencies`
- **2-space indent** — enforced by biome
- **Single model in server memory** — extension never loads models directly
