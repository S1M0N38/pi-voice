---
name: pi-package
description: >
  Pi package development best practices and patterns. Use when planning, editing,
  implementing, or reviewing pi package code — structuring a new package, writing
  extensions, registering tools, commands, events, skills, prompt templates, or themes.
  Also use when the user asks about package architecture, conventions, or "how should
  I implement" a pi package feature. Do not use for general TypeScript development
  unrelated to pi packages, or for running tests (use pi-test skill if it exists).
---

# Pi Package Development

This skill provides patterns and best practices for building pi packages.
Read the reference files below on demand based on the current task.

## Official Pi Documentation

For the complete and authoritative API reference, read pi's installed docs.
Locate them with:

```bash
# Find the docs directory
npm root -g  # → <dir>/@mariozechner/pi-coding-agent/docs/
```

Key documents (relative to that directory):

| Doc | Contents |
|-----|----------|
| `extensions.md` | Full extension API: events, tools, commands, providers, rendering |
| `tui.md` | TUI component API for custom UI |
| `skills.md` | Skill authoring and the Agent Skills standard |
| `themes.md` | Theme format and all color tokens |
| `keybindings.md` | Keybinding IDs and shortcut registration |
| `packages.md` | Package distribution and manifest |
| `session-format.md` | SessionManager API and entry types |
| `compaction.md` | Custom compaction handlers |
| `custom-provider.md` | Advanced provider topics, OAuth, custom streaming |
| `models.md` | Model configuration |
| `rpc.md` | RPC mode and extension UI protocol |

When in doubt about an API, read the official doc first — it is the source of truth.

## Reference Files

Read these on demand based on the task. Do NOT load all at once.
Each file has a table of contents at the top for navigation.

### `references/EXTENSIONS.md`
Complete patterns for every extension capability.

1. Extension Structure & Factory
2. Custom Tools (registration, rendering, state, truncation)
3. Slash Commands (registration, autocomplete, argument handling)
4. Event Handlers (lifecycle, session, agent, tool, input events)
5. User Interaction (dialogs, notifications, status, widgets)
6. Custom UI Components (TUI, overlay, custom editor)
7. State Management (session persistence, reconstruction)
8. Custom Rendering (tool call/result, message renderers)
9. Remote Execution (SSH, tool operations)
10. Providers (custom models, OAuth)
11. Anti-Patterns

### `references/SCHEMAS.md`
Typebox schema patterns for tool parameters.

1. Quick Start (minimum schemas every tool needs)
2. Primitive Types
3. String Enums (Google-compatible)
4. Object & Nested Schemas
5. Arrays & Tuples
6. Optional Fields & Defaults
7. Description Best Practices
8. Reusable Sub-schemas
9. Empty Parameters
10. Common Parameter Patterns (paths, file patterns, modes)

### `references/THEMES.md`
Theme creation reference with all 51 color tokens.

1. Theme Structure (vars, colors, schema)
2. Color Tokens Reference (core UI, backgrounds, markdown, diffs, syntax, thinking)
3. Color Values (hex, 256-color, variables, default)
4. Theme Creation Workflow
5. Testing Themes

### `references/SKILLS.md`
Skill authoring patterns for the Agent Skills standard.

1. Skill Structure (SKILL.md, references, scripts, assets)
2. Frontmatter (name, description, allowed-tools, disable-model-invocation)
3. Progressive Disclosure Pattern
4. Skill Naming & Triggering
5. Reference File Organization
6. Skills in Packages

### `references/PROMPTS.md`
Prompt template authoring.

1. Prompt Template Format (frontmatter, content)
2. Template Variables
3. Prompt Placement & Discovery

## Working with existing packages

When modifying an existing package:

1. Read the existing code first — match the project's conventions
2. Check `AGENTS.md` for project-specific rules
3. Read `package.json` to understand the `pi` manifest and dependencies
4. Look at existing extensions/skills to match patterns

## File locations in this project

- Extension source: `extensions/index.ts`
- Skills: `skills/`
- Prompt templates: `prompts/`
- Themes: `themes/`
- Package manifest: `package.json`
