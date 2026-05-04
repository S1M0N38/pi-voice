# Pi Extension Patterns

A catalog of essential patterns for writing pi extensions.

> For schema patterns, see `references/SCHEMAS.md`.
> For theme tokens, see `references/THEMES.md`.
> For skill authoring, see `references/SKILLS.md`.

---

## Table of Contents

1. [Extension Structure & Factory](#1-extension-structure--factory)
2. [Custom Tools](#2-custom-tools)
3. [Slash Commands](#3-slash-commands)
4. [Event Handlers](#4-event-handlers)
5. [User Interaction](#5-user-interaction)
6. [Custom UI Components](#6-custom-ui-components)
7. [State Management](#7-state-management)
8. [Custom Rendering](#8-custom-rendering)
9. [Remote Execution](#9-remote-execution)
10. [Providers](#10-providers)
11. [Anti-Patterns](#11-anti-patterns)

---

## 1. Extension Structure & Factory

### Single-file extension (simplest)

```typescript
// extensions/index.ts
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";

export default function (pi: ExtensionAPI) {
  pi.registerTool({ /* ... */ });
  pi.registerCommand("name", { /* ... */ });
  pi.on("event_name", async (event, ctx) => { /* ... */ });
}
```

### Async factory (for one-time initialization)

```typescript
export default async function (pi: ExtensionAPI) {
  // pi waits for this to complete before starting
  const response = await fetch("http://localhost:1234/v1/models");
  const payload = await response.json();

  pi.registerProvider("my-provider", {
    baseUrl: "http://localhost:1234/v1",
    models: payload.data.map((m: any) => ({ id: m.id, /* ... */ })),
  });
}
```

### Directory extension (multi-file)

```
extensions/
├── index.ts        # Entry point (exports default function)
├── tools.ts        # Tool definitions
├── commands.ts     # Command definitions
└── utils.ts        # Shared utilities
```

### Key rules

- **No build step** — pi loads `.ts` via jiti
- **`type` imports** — use `import type` for `ExtensionAPI` and other types
- **`export default function`** — the factory must be the default export
- **`typebox` for schemas** — tool parameters must use `Type.Object()`, not raw TypeScript types
- **Peer dependencies** — `@mariozechner/pi-ai`, `@mariozechner/pi-coding-agent`, `@mariozechner/pi-tui`, `@mariozechner/pi-agent-core`, `typebox` are provided by pi at runtime. List them as `peerDependencies` with `"*"` range

---

## 2. Custom Tools

### Basic tool

```typescript
import { Type } from "typebox";

pi.registerTool({
  name: "my_tool",
  label: "My Tool",
  description: "What this tool does (shown to LLM)",
  parameters: Type.Object({
    name: Type.String({ description: "Name to process" }),
  }),
  async execute(toolCallId, params, signal, onUpdate, ctx) {
    return {
      content: [{ type: "text", text: `Hello, ${params.name}!` }],
      details: { processed: params.name },
    };
  },
});
```

### Tool with prompt snippet and guidelines

```typescript
import { StringEnum } from "@mariozechner/pi-ai";

pi.registerTool({
  name: "todo",
  label: "Todo",
  description: "Manage a project todo list",
  promptSnippet: "List or add items in the project todo list",
  promptGuidelines: [
    "Use todo for task planning instead of direct file edits when the user asks for a task list."
  ],
  parameters: Type.Object({
    action: StringEnum(["list", "add"] as const),
    text: Type.Optional(Type.String()),
  }),
  // ...
});
```

**Important:** `promptGuidelines` bullets are appended flat with no tool name prefix.
Each guideline must name the tool: "Use my_tool when..." not "Use this tool when..."

### Tool with streaming progress

```typescript
async execute(toolCallId, params, signal, onUpdate, ctx) {
  onUpdate?.({
    content: [{ type: "text", text: "Working..." }],
    details: { progress: 50 },
  });

  // ... do work ...

  return {
    content: [{ type: "text", text: "Done" }],
    details: { result: "..." },
  };
}
```

### Tool with user interaction

```typescript
async execute(toolCallId, params, signal, onUpdate, ctx) {
  if (!ctx.hasUI) {
    return { content: [{ type: "text", text: "Requires interactive mode" }] };
  }

  const confirmed = await ctx.ui.confirm("Deploy?", `Deploy ${params.target}?`);
  if (!confirmed) {
    return { content: [{ type: "text", text: "Cancelled" }] };
  }

  // ... proceed ...
}
```

### Tool with abort support

```typescript
async execute(toolCallId, params, signal, onUpdate, ctx) {
  if (signal?.aborted) {
    return { content: [{ type: "text", text: "Cancelled" }] };
  }

  const response = await fetch("https://api.example.com/data", {
    signal,  // Uses pi's abort signal
  });
  const data = await response.json();

  return {
    content: [{ type: "text", text: JSON.stringify(data) }],
    details: data,
  };
}
```

### Tool with output truncation

```typescript
import {
  truncateHead,
  formatSize,
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
} from "@mariozechner/pi-coding-agent";

async execute(toolCallId, params, signal, onUpdate, ctx) {
  const output = await runLargeCommand();

  const truncation = truncateHead(output, {
    maxLines: DEFAULT_MAX_LINES,
    maxBytes: DEFAULT_MAX_BYTES,
  });

  let result = truncation.content;

  if (truncation.truncated) {
    const tempFile = writeTempFile(output);
    result += `\n\n[Output truncated: ${truncation.outputLines} of ${truncation.totalLines} lines`;
    result += ` (${formatSize(truncation.outputBytes)} of ${formatSize(truncation.totalBytes)}).`;
    result += ` Full output saved to: ${tempFile}]`;
  }

  return { content: [{ type: "text", text: result }] };
}
```

### Tool with file mutation queue (prevents race conditions)

```typescript
import { withFileMutationQueue } from "@mariozechner/pi-coding-agent";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

async execute(toolCallId, params, signal, onUpdate, ctx) {
  const absolutePath = resolve(ctx.cwd, params.path);

  return withFileMutationQueue(absolutePath, async () => {
    const current = await readFile(absolutePath, "utf8");
    const next = current.replace(params.oldText, params.newText);
    await writeFile(absolutePath, next, "utf8");

    return {
      content: [{ type: "text", text: `Updated ${params.path}` }],
      details: {},
    };
  });
}
```

### Early termination tool

```typescript
async execute(toolCallId, params) {
  return {
    content: [{ type: "text", text: "Final structured output" }],
    details: params,
    terminate: true,  // Skip follow-up LLM call
  };
}
```

### Error signaling

```typescript
async execute(toolCallId, params) {
  if (!isValid(params.input)) {
    throw new Error(`Invalid input: ${params.input}`);  // Sets isError: true
  }
  return { content: [{ type: "text", text: "OK" }], details: {} };
}
```

### Argument compatibility shim

```typescript
pi.registerTool({
  name: "my_tool",
  parameters: Type.Object({
    action: StringEnum(["list", "add"] as const),
    text: Type.Optional(Type.String()),
  }),
  prepareArguments(args) {
    if (!args || typeof args !== "object") return args;
    const input = args as { action?: string; oldAction?: string };
    if (typeof input.oldAction === "string" && input.action === undefined) {
      return { ...input, action: input.oldAction };
    }
    return args;
  },
  // ...
});
```

### Multiple tools sharing state

```typescript
export default function (pi: ExtensionAPI) {
  let connection: any = null;

  pi.registerTool({
    name: "db_connect",
    // ...
    async execute() {
      connection = await createConnection();
      return { content: [{ type: "text", text: "Connected" }] };
    },
  });

  pi.registerTool({
    name: "db_query",
    // ...
    async execute(_id, params) {
      if (!connection) throw new Error("Not connected");
      const result = await connection.query(params.sql);
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    },
  });

  pi.on("session_shutdown", async () => {
    connection?.close();
  });
}
```

---

## 3. Slash Commands

### Basic command

```typescript
pi.registerCommand("hello", {
  description: "Say hello from the package",
  handler: async (args, ctx) => {
    const name = args?.trim() || "world";
    ctx.ui.notify(`Hello, ${name}! 👋`, "info");
  },
});
```

### Command with autocomplete

```typescript
import type { AutocompleteItem } from "@mariozechner/pi-tui";

pi.registerCommand("deploy", {
  description: "Deploy to an environment",
  getArgumentCompletions: (prefix: string): AutocompleteItem[] | null => {
    const envs = ["dev", "staging", "prod"];
    const items = envs.map((e) => ({ value: e, label: e }));
    const filtered = items.filter((i) => i.value.startsWith(prefix));
    return filtered.length > 0 ? filtered : null;
  },
  handler: async (args, ctx) => {
    ctx.ui.notify(`Deploying: ${args}`, "info");
  },
});
```

### Command with session control

```typescript
pi.registerCommand("new-session", {
  description: "Start a fresh session with context",
  handler: async (args, ctx) => {
    await ctx.newSession({
      setup: async (sm) => {
        sm.appendMessage({
          role: "user",
          content: [{ type: "text", text: `Continue from: ${args}` }],
          timestamp: Date.now(),
        });
      },
      withSession: async (ctx) => {
        await ctx.sendUserMessage("Ready!");
      },
    });
  },
});
```

### Command triggering reload

```typescript
pi.registerCommand("reload-runtime", {
  description: "Reload extensions, skills, prompts, and themes",
  handler: async (_args, ctx) => {
    await ctx.reload();
    return;
  },
});
```

---

## 4. Event Handlers

### Session lifecycle

```typescript
// Startup
pi.on("session_start", async (event, ctx) => {
  // event.reason: "startup" | "reload" | "new" | "resume" | "fork"
  ctx.ui.notify("Package loaded!", "info");
});

// Shutdown
pi.on("session_shutdown", async (event, ctx) => {
  // event.reason: "quit" | "reload" | "new" | "resume" | "fork"
  // Cleanup resources
});
```

### Tool interception (gate)

```typescript
import { isToolCallEventType } from "@mariozechner/pi-coding-agent";

pi.on("tool_call", async (event, ctx) => {
  if (isToolCallEventType("bash", event)) {
    if (event.input.command?.includes("rm -rf")) {
      const ok = await ctx.ui.confirm("Dangerous!", "Allow rm -rf?");
      if (!ok) return { block: true, reason: "Blocked by user" };
    }
    // Mutate input
    event.input.command = `source ~/.profile\n${event.input.command}`;
  }
});
```

### Tool result modification

```typescript
pi.on("tool_result", async (event, ctx) => {
  // Modify tool result before it's sent to LLM
  return {
    content: event.content,
    details: { ...event.details, annotated: true },
  };
});
```

### Input transformation

```typescript
pi.on("input", async (event, ctx) => {
  // event.source: "interactive" | "rpc" | "extension"

  if (event.text.startsWith("?quick ")) {
    return { action: "transform", text: `Respond briefly: ${event.text.slice(7)}` };
  }

  if (event.text === "ping") {
    ctx.ui.notify("pong", "info");
    return { action: "handled" };
  }

  return { action: "continue" };
});
```

### System prompt injection

```typescript
pi.on("before_agent_start", async (event, ctx) => {
  return {
    systemPrompt: event.systemPrompt + "\n\nExtra instructions for this turn...",
    message: {
      customType: "my-extension",
      content: "Additional context for the LLM",
      display: true,
    },
  };
});
```

### Model change reaction

```typescript
pi.on("model_select", async (event, ctx) => {
  ctx.ui.notify(
    `Model: ${event.model.provider}/${event.model.id} (${event.source})`,
    "info"
  );
});
```

### Message injection during streaming

```typescript
pi.registerTool({
  name: "my_tool",
  // ...
  async execute(_id, params, _signal, _onUpdate, ctx) {
    // Send a steering message while streaming
    pi.sendUserMessage("Focus on error handling", { deliverAs: "steer" });
    // Send a follow-up after all tools finish
    pi.sendUserMessage("Then summarize", { deliverAs: "followUp" });
    return { content: [{ type: "text", text: "Queued messages" }] };
  },
});
```

---

## 5. User Interaction

### Dialogs

```typescript
// Select from options
const choice = await ctx.ui.select("Pick one:", ["A", "B", "C"]);

// Confirm
const ok = await ctx.ui.confirm("Delete?", "This cannot be undone");

// Text input
const name = await ctx.ui.input("Name:", "placeholder");

// Multi-line editor
const text = await ctx.ui.editor("Edit:", "prefilled text");

// Notification (non-blocking)
ctx.ui.notify("Done!", "info");  // "info" | "warning" | "error"
```

### Check for UI availability

```typescript
if (!ctx.hasUI) {
  // Print mode or JSON mode — no UI available
  return { content: [{ type: "text", text: "Requires interactive mode" }] };
}
```

### Status bar and widgets

```typescript
// Footer status (persistent until cleared)
ctx.ui.setStatus("my-ext", "Processing...");
ctx.ui.setStatus("my-ext", undefined);  // Clear

// Widget above editor
ctx.ui.setWidget("my-widget", ["Line 1", "Line 2"]);
ctx.ui.setWidget("my-widget", undefined);  // Clear

// Terminal title
ctx.ui.setTitle("pi - my-project");
```

---

## 6. Custom UI Components

### Simple custom component

```typescript
import { Text } from "@mariozechner/pi-tui";

const result = await ctx.ui.custom<boolean>((tui, theme, keybindings, done) => {
  const text = new Text("Press Enter to confirm, Escape to cancel", 0, 0);

  text.onKey = (key) => {
    if (key === "return") done(true);
    if (key === "escape") done(false);
    return true;
  };

  return text;
});
```

### Overlay mode

```typescript
const result = await ctx.ui.custom<string | null>(
  (tui, theme, keybindings, done) => new MyOverlayComponent({ onClose: done }),
  { overlay: true }
);
```

### Custom editor

```typescript
import { CustomEditor } from "@mariozechner/pi-coding-agent";
import { matchesKey } from "@mariozechner/pi-tui";

class VimEditor extends CustomEditor {
  private mode: "normal" | "insert" = "insert";

  handleInput(data: string): void {
    if (matchesKey(data, "escape") && this.mode === "insert") {
      this.mode = "normal";
      return;
    }
    if (this.mode === "normal" && data === "i") {
      this.mode = "insert";
      return;
    }
    super.handleInput(data);
  }
}

pi.on("session_start", (_event, ctx) => {
  ctx.ui.setEditorComponent((_tui, theme, keybindings) =>
    new VimEditor(theme, keybindings)
  );
});
```

---

## 7. State Management

### Persist state via tool result details

```typescript
export default function (pi: ExtensionAPI) {
  let items: string[] = [];

  // Reconstruct state from session on startup
  pi.on("session_start", async (_event, ctx) => {
    items = [];
    for (const entry of ctx.sessionManager.getBranch()) {
      if (entry.type === "message" && entry.message.role === "toolResult") {
        if (entry.message.toolName === "my_tool") {
          items = entry.message.details?.items ?? [];
        }
      }
    }
  });

  pi.registerTool({
    name: "my_tool",
    // ...
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      items.push("new item");
      return {
        content: [{ type: "text", text: "Added" }],
        details: { items: [...items] },  // Store for reconstruction
      };
    },
  });
}
```

### Persist state via appendEntry

```typescript
pi.appendEntry("my-state", { count: 42 });

// Restore on reload
pi.on("session_start", async (_event, ctx) => {
  for (const entry of ctx.sessionManager.getEntries()) {
    if (entry.type === "custom" && entry.customType === "my-state") {
      // Reconstruct from entry.data
    }
  }
});
```

---

## 8. Custom Rendering

### Tool renderers

```typescript
import { Text } from "@mariozechner/pi-tui";

pi.registerTool({
  name: "my_tool",
  // ...

  renderCall(args, theme, context) {
    const text = (context.lastComponent as Text | undefined) ?? new Text("", 0, 0);
    let content = theme.fg("toolTitle", theme.bold("my_tool "));
    content += theme.fg("muted", args.action);
    text.setText(content);
    return text;
  },

  renderResult(result, { expanded, isPartial }, theme, context) {
    if (isPartial) {
      return new Text(theme.fg("warning", "Processing..."), 0, 0);
    }
    let text = theme.fg("success", "✓ Done");
    if (expanded && result.details?.items) {
      for (const item of result.details.items) {
        text += "\n  " + theme.fg("dim", item);
      }
    }
    return new Text(text, 0, 0);
  },
});
```

### Self-managed shell

Set `renderShell: "self"` when the tool needs full control over framing,
padding, and background — for example large previews that must stay visually
stable after the tool settles.

```typescript
pi.registerTool({
  name: "preview",
  parameters: Type.Object({}),
  renderShell: "self",
  async execute() {
    return { content: [{ type: "text", text: "ok" }], details: undefined };
  },
  renderCall(args, theme) {
    return new Text(theme.fg("accent", "my custom shell"), 0, 0);
  },
});
```

### Keybinding hints in renderers

Use `keyHint()` to display keybinding hints that respect the active
keybinding configuration:

```typescript
import { keyHint } from "@mariozechner/pi-coding-agent";

renderResult(result, { expanded }, theme, context) {
  let text = theme.fg("success", "✓ Done");
  if (!expanded) {
    text += ` (${keyHint("app.tools.expand", "to expand")})`;
  }
  return new Text(text, 0, 0);
}
```

Available functions:
- `keyHint(keybinding, description)` — formats a configured keybinding id
- `keyText(keybinding)` — returns the raw key text for a keybinding id
- `rawKeyHint(key, description)` — format a raw key string

Common keybinding ids:
- `app.tools.expand`, `app.editor.external`, `app.session.rename`
- `tui.select.confirm`, `tui.select.cancel`, `tui.input.tab`

See `keybindings.md` in pi's docs for the full list.

### Message renderer

```typescript
pi.registerMessageRenderer("my-extension", (message, options, theme) => {
  let text = theme.fg("accent", `[${message.customType}] `);
  text += message.content;
  if (options.expanded && message.details) {
    text += "\n" + theme.fg("dim", JSON.stringify(message.details, null, 2));
  }
  return new Text(text, 0, 0);
});
```

---

## 9. Remote Execution

### SSH remote tools

```typescript
import { createBashTool, createReadTool } from "@mariozechner/pi-coding-agent";

const remoteBash = createBashTool(cwd, {
  operations: {
    exec: (command, cwd, options) => sshExec(remote, command, cwd, options),
  },
});
```

### Spawn hook (modify bash before execution)

```typescript
const bashTool = createBashTool(cwd, {
  spawnHook: ({ command, cwd, env }) => ({
    command: `source ~/.profile\n${command}`,
    cwd: `/mnt/sandbox${cwd}`,
    env: { ...env, CI: "1" },
  }),
});
```

---

## 10. Providers

### Custom provider

```typescript
pi.registerProvider("my-proxy", {
  name: "My Proxy",
  baseUrl: "https://proxy.example.com",
  apiKey: "PROXY_API_KEY",
  api: "openai-completions",
  models: [
    {
      id: "model-id",
      name: "Display Name",
      reasoning: false,
      input: ["text", "image"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 128000,
      maxTokens: 4096,
    },
  ],
});
```

### Override existing provider

```typescript
pi.registerProvider("anthropic", {
  baseUrl: "https://proxy.example.com",
});
```

---

## 11. Anti-Patterns

### ❌ Import ExtensionAPI as a value (not a type)

```typescript
// ❌ Bundled at runtime, breaks peer dep
import { ExtensionAPI } from "@mariozechner/pi-coding-agent";
// ✅ Type-only import
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
```

### ❌ Use raw TypeScript types for tool parameters

```typescript
// ❌ LLM can't read TypeScript interfaces
interface Params { name: string }
// ✅ Use typebox schemas
parameters: Type.Object({ name: Type.String() })
```

### ❌ Use Type.Union/Type.Literal for string enums

```typescript
// ❌ Breaks Google API compatibility
Type.Union([Type.Literal("a"), Type.Literal("b")])
// ✅ Use StringEnum from @mariozechner/pi-ai
import { StringEnum } from "@mariozechner/pi-ai";
StringEnum(["a", "b"] as const)
```

### ❌ Add runtime deps as devDependencies

```typescript
// ❌ npm install --omit=dev skips them
{ "devDependencies": { "zod": "^3.0.0" } }
// ✅ Runtime deps go in dependencies
{ "dependencies": { "zod": "^3.0.0" } }
```

### ❌ Pin peer dependencies

```typescript
// ❌ Peer deps must use "*" range
{ "peerDependencies": { "@mariozechner/pi-coding-agent": "^0.70.0" } }
// ✅ Unpinned — pi provides the version
{ "peerDependencies": { "@mariozechner/pi-coding-agent": "*" } }
```

### ❌ Add a build/compile step

```typescript
// ❌ pi loads .ts directly via jiti
// Never add tsc, esbuild, or webpack to the package pipeline
```

### ❌ Forget to check ctx.hasUI

```typescript
// ❌ Crashes in print mode
const choice = await ctx.ui.select("Pick:", ["A", "B"]);
// ✅ Guard UI calls
if (ctx.hasUI) {
  const choice = await ctx.ui.select("Pick:", ["A", "B"]);
}
```

### ❌ Use error() return instead of throw

```typescript
// ❌ Returning never sets isError: true
return { content: [{ type: "text", text: "Error!" }] };
// ✅ Throw to signal error
throw new Error("Something went wrong");
```

### ❌ Return vague promptGuidelines

```typescript
// ❌ The LLM can't tell which tool "this" is
promptGuidelines: ["Use this tool when the user wants to search"]
// ✅ Name the tool explicitly
promptGuidelines: ["Use my_search when the user wants to search"]
```
