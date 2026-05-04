/**
 * Pi Package Template — Sample Extension
 *
 * This extension demonstrates the three core extension capabilities:
 *   1. Custom tool (callable by the LLM)
 *   2. Slash command (callable by the user)
 *   3. Event handler (reacts to session lifecycle)
 *
 * Remove or replace these with your own functionality.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";

export default function (pi: ExtensionAPI) {
  // ── 1. Custom tool ────────────────────────────────────────────────
  // The LLM can call this tool when the user asks it to greet someone.
  pi.registerTool({
    name: "hello",
    label: "Hello",
    description: "Greet someone by name. Returns a friendly greeting.",
    parameters: Type.Object({
      name: Type.String({ description: "Name to greet" }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      return {
        content: [{ type: "text", text: `Hello, ${params.name}! 👋` }],
        details: { greeted: params.name },
      };
    },
  });

  // ── 2. Slash command ──────────────────────────────────────────────
  // The user can type /hello to trigger this command.
  pi.registerCommand("hello", {
    description: "Say hello from the template package",
    handler: async (args, ctx) => {
      const name = args?.trim() || "world";
      ctx.ui.notify(`Hello, ${name}! 👋`, "info");
    },
  });

  // ── 3. Event handler ──────────────────────────────────────────────
  // Fires when a session starts (startup, reload, new, resume, fork).
  pi.on("session_start", async (_event, ctx) => {
    ctx.ui.notify("📦 Template package loaded!", "info");
  });
}
